import { Component, signal, ViewChild, ChangeDetectionStrategy, ChangeDetectorRef, computed } from '@angular/core';
import { CommonModule, DatePipe, NgClass } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AppHeader } from '../shared/components/layout/app-header/app-header';
import { PageContainer } from '../shared/components/layout/page-container/page-container';
import { AppCard } from '../shared/components/layout/app-card/app-card';
import { SupplierAutocomplete } from '../shared/components/ui/supplier-autocomplete/supplier-autocomplete';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { TagModule } from 'primeng/tag';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { MenuItem } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
import { TooltipModule } from 'primeng/tooltip';
import { SupplierService } from '../shared/services/supplier.service';
import { OrderService } from '../shared/services/order.service';
import { ReportService } from '../shared/services/report.service';
import { Provider, Debt, SupplierPaymentAccount } from '../shared/models/provider.model';
import { Location } from '@angular/common';
import { ConfirmDialog } from '../shared/components/ui/confirm-dialog/confirm-dialog';
import { FileUploadComponent } from '../shared/components/ui/file-upload/file-upload';
import { LazyImage } from '../shared/components/ui/lazy-image/lazy-image';
import { AuthContext } from '../contexts/auth.context';
import { FormatUsdPipe } from '../shared/pipes/format-usd.pipe';
import { formatUsd } from '../shared/utils/format-usd';

@Component({
  selector: 'app-locate-provider',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    NgClass,
    AppHeader,
    PageContainer,
    AppCard,
    SupplierAutocomplete,
    InputTextModule,
    InputNumberModule,
    DatePickerModule,
    ButtonModule,
    MenuModule,
    TooltipModule,
    ToastModule,
    TagModule,
    IconFieldModule,
    InputIconModule,
    DatePipe,
    ConfirmDialog,
    FileUploadComponent,
    LazyImage,
    FormatUsdPipe
  ],
  providers: [MessageService],
  templateUrl: './locate-provider.html',
  styleUrl: './locate-provider.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LocateProvider {
  searchQuery: string = '';
  supplierSuggestions: Provider[] = [];
  searchLoading: boolean = false;
  selectedProvider = signal<Provider | null>(null);
  debts = signal<Debt[]>([]);
  existingInvoiceUrls = signal<string[]>([]);
  invoiceFiles: File[] = [];

  @ViewChild('invoiceUpload') invoiceUploadComponent?: FileUploadComponent;

  /**
   * Suma de restantes por deuda (igual que reporte detallado). Si no hay deudas cargadas, usa totalDebt del proveedor.
   * Evita mostrar cifras incoherentes cuando el API devuelve totalDebt desalineado (p. ej. −excedente aplicado).
   */
  totalDebt = computed(() => {
    const debts = this.debts();
    const provider = this.selectedProvider();
    if (debts.length === 0) {
      return provider?.totalDebt ?? 0;
    }
    return debts.reduce((sum, debt) => sum + (debt.remainingAmount || 0), 0);
  });

  orderForm: FormGroup;
  loading = signal<boolean>(false);
  editingOrderId = signal<number | null>(null);
  /** Excedente ya aplicado a la deuda al abrir el formulario de edición (surplusAmountAtCreation / surplusAmountApplied) */
  editingSurplusBaseline = signal(0);
  fechaVencimiento = signal<Date | null>(null);
  showConfirmDeleteProvider = signal<boolean>(false);
  providerToDelete = signal<Provider | null>(null);
  showConfirmDeleteDebt = signal<boolean>(false);
  debtToDelete = signal<Debt | null>(null);

  constructor(
    private fb: FormBuilder,
    private supplierService: SupplierService,
    private orderService: OrderService,
    private reportService: ReportService,
    private messageService: MessageService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private location: Location,
    private authContext: AuthContext
  ) {
    this.orderForm = this.fb.group({
      title: [''],
      monto: ['', [Validators.required, Validators.min(0.01)]],
      fechaDespacho: ['', [Validators.required]],
      diasCredito: [30, [Validators.required, Validators.min(0)]],
      surplusAmountToApply: [null as number | null, [Validators.min(0)]]
    });

    this.orderForm.get('fechaDespacho')?.valueChanges.subscribe(() => this.calculateDueDate());
    this.orderForm.get('diasCredito')?.valueChanges.subscribe(() => this.calculateDueDate());
  }

  /**
   * Máximo saldo excedente aplicable como nuevo total:
   * - Creación: min(monto, saldo a favor).
   * - Edición: min(monto, excedente ya aplicado + saldo a favor), para que el incremento no supere el crédito disponible.
   */
  getMaxSurplusToApply(): number {
    const provider = this.provider;
    const available = provider?.totalCreditAvailable ?? 0;
    const amount = this.orderForm.get('monto')?.value;
    const num = amount != null && amount !== '' ? Number(amount) : 0;
    const baseline = this.editingOrderId() !== null ? this.editingSurplusBaseline() : 0;
    const capByCredit = baseline + available;
    return Math.min(num, capByCredit);
  }

  /** Rellena el campo de excedente a aplicar con el máximo permitido */
  onApplyMaxSurplus(): void {
    const max = this.getMaxSurplusToApply();
    this.orderForm.patchValue({ surplusAmountToApply: max });
    this.cdr.markForCheck();
  }

  private calculateDueDate(): void {
    const fechaDespacho = this.orderForm.get('fechaDespacho')?.value;
    const diasCredito = this.orderForm.get('diasCredito')?.value ?? 0;
    if (fechaDespacho && diasCredito !== '' && diasCredito !== null) {
      const fecha = new Date(fechaDespacho);
      fecha.setDate(fecha.getDate() + Number(diasCredito));
      this.fechaVencimiento.set(fecha);
    } else {
      this.fechaVencimiento.set(null);
    }
  }

  get provider() {
    return this.selectedProvider();
  }

  get isLoading() {
    return this.loading();
  }

  /** Los cajeros no pueden editar/eliminar distribuidor ni deudas */
  get canEditProviderAndDebts(): boolean {
    return !this.authContext.hasRole('CAJERO');
  }

  onSearch(query: string) {
    const trimmedQuery = query?.trim() || '';
    
    if (trimmedQuery.length < 1) {
      // Si no hay query, cargar todos los proveedores
      this.loadAllSuppliers();
      return;
    }

    // Mostrar loading
    this.searchLoading = true;
    this.cdr.markForCheck();

    this.supplierService.search(trimmedQuery, 1, 10).subscribe({
      next: (response) => {
        this.supplierSuggestions = response.data || [];
        this.searchLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.supplierSuggestions = [];
        this.searchLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  onFocus() {
    // Cuando se hace focus en el input, cargar todos los proveedores si no hay query
    if (!this.searchQuery || this.searchQuery.trim().length === 0) {
      this.loadAllSuppliers();
    }
  }

  loadAllSuppliers() {
    // Cargar todos los proveedores (con un límite razonable)
    this.searchLoading = true;
    this.cdr.markForCheck();

    this.supplierService.list({ page: 1, limit: 50 }).subscribe({
      next: (response) => {
        this.supplierSuggestions = response.data || [];
        this.searchLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.supplierSuggestions = [];
        this.searchLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  onSupplierSelect(supplier: Provider) {
    if (!supplier || !supplier.id) {
      return;
    }

    this.searchQuery = supplier.companyName || '';
    this.loading.set(true);
    this.cdr.markForCheck();
    
    // Obtener información completa del distribuidor con todas sus deudas
    this.reportService.getSupplierDetailed(supplier.id).subscribe({
      next: (report) => {
        this.selectedProvider.set({
          ...report.supplier,
          totalCreditAvailable: report.totalCreditAvailable || 0
        });
        this.debts.set(report.debts || []);
        
        this.loading.set(false);
        this.cdr.detectChanges();
        
        this.messageService.add({
          severity: 'success',
          summary: 'Distribuidor Encontrado',
          detail: `Se encontró: ${report.supplier.companyName}`
        });
      },
      error: () => {
        // Usar el supplier básico si falla la petición completa
        this.selectedProvider.set(supplier);
        this.debts.set([]);
        this.loading.set(false);
        this.cdr.detectChanges();
        
        this.messageService.add({
          severity: 'warn',
          summary: 'Advertencia',
          detail: 'No se pudieron cargar todos los detalles del distribuidor'
        });
      }
    });
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'PENDING': 'Pendiente',
      'PARTIALLY_PAID': 'Parcialmente Pagado',
      'PAID': 'Pagado',
      'OVERDUE': 'Vencido'
    };
    return labels[status] || status;
  }

  getStatusSeverity(status: string): 'success' | 'secondary' | 'info' | 'warn' | 'danger' {
    const severities: Record<string, 'success' | 'secondary' | 'info' | 'warn' | 'danger'> = {
      'PENDING': 'warn',
      'PARTIALLY_PAID': 'info',
      'PAID': 'success',
      'OVERDUE': 'danger'
    };
    return severities[status] || 'secondary';
  }

  getActivePaymentsCount(debt: Debt): number {
    if (!debt.payments) {
      return 0;
    }
    return debt.payments.filter(p => !p.deleted).length;
  }

  getAccountTypeLabel(type: SupplierPaymentAccount['type']): string {
    const labels: Record<string, string> = {
      PAGO_MOVIL: 'Pago Móvil',
      ZELLE: 'Zelle',
      TRANSFER: 'Transferencia'
    };
    return labels[type] || type;
  }

  getAccountIcon(type: SupplierPaymentAccount['type']): string {
    const icons: Record<string, string> = {
      PAGO_MOVIL: 'pi pi-mobile',
      ZELLE: 'pi pi-wallet',
      TRANSFER: 'pi pi-credit-card'
    };
    return icons[type] || 'pi pi-money-bill';
  }

  getAccountMainValue(account: SupplierPaymentAccount): string {
    if (account.type === 'ZELLE') {
      return account.email || account.accountNumber || '';
    }
    if (account.type === 'PAGO_MOVIL') {
      return account.phone || account.accountNumber || '';
    }
    return account.accountNumber || '';
  }

  onInvoiceSelect(files: File[]): void {
    this.invoiceFiles = files || [];
  }

  private buildInvoicePayload(): {
    invoiceFiles: File[];
    existingInvoiceFiles: string[];
    removeInvoice: boolean;
  } {
    const files = this.invoiceUploadComponent?.getSelectedFiles() ?? this.invoiceFiles ?? [];
    const existing = this.invoiceUploadComponent?.getExistingImageUrls() ?? [];
    const hadExisting = this.existingInvoiceUrls().length > 0;
    const removedAll = this.invoiceUploadComponent?.imageExplicitlyRemoved?.() ?? false;

    return {
      invoiceFiles: files,
      existingInvoiceFiles: existing,
      removeInvoice: hadExisting && removedAll && files.length === 0
    };
  }

  getDueDateStatus(debt: Debt): 'safe' | 'warning' | 'danger' {
    if (!debt.dueDate) {
      return 'safe';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dueDate = new Date(debt.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Rojo: vencida o menos de 7 días
    if (diffDays < 7) {
      return 'danger';
    }
    
    // Amarillo: entre 7 y 30 días
    if (diffDays <= 30) {
      return 'warning';
    }
    
    // Verde: más de 30 días
    return 'safe';
  }

  getDueDateColorClass(debt: Debt): string {
    const status = this.getDueDateStatus(debt);
    switch (status) {
      case 'danger':
        return 'text-red-600 dark:text-red-400';
      case 'warning':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'safe':
        return 'text-green-600 dark:text-green-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  }

  getDueDateIconClass(debt: Debt): string {
    const status = this.getDueDateStatus(debt);
    switch (status) {
      case 'danger':
        return 'pi-exclamation-circle text-red-500';
      case 'warning':
        return 'pi-exclamation-triangle text-yellow-500';
      case 'safe':
        return 'pi-check-circle text-green-500';
      default:
        return 'pi-calendar text-gray-400';
    }
  }

  getDaysUntilDue(debt: Debt): number {
    if (!debt.dueDate) {
      return 0;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dueDate = new Date(debt.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    
    const diffTime = dueDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  abs(value: number): number {
    return Math.abs(value);
  }

  onEditDebt(debt: Debt): void {
    if (!this.canEditProviderAndDebts) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Sin permisos',
        detail: 'No tiene permisos para editar deudas.'
      });
      return;
    }
    if (!debt.orderId) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Advertencia',
        detail: 'Esta deuda no tiene una orden asociada'
      });
      return;
    }
    this.orderService.getById(debt.orderId).subscribe({

    

      next: (order) => {
        const baseline = Number(
          order.debt?.surplusAmountAtCreation ?? order.debt?.surplusAmountApplied ?? 0
        );
        this.editingSurplusBaseline.set(Number.isFinite(baseline) ? baseline : 0);

        this.orderForm.patchValue({
          title: order.title ?? '',
          fechaDespacho: order.dispatchDate,
          diasCredito: order.creditDays,
          monto: order.amount,
          surplusAmountToApply: this.editingSurplusBaseline()
        });
        this.editingOrderId.set(order.id);
        this.calculateDueDate();

        this.invoiceUploadComponent?.clear();
        this.invoiceFiles = [];
        this.existingInvoiceUrls.set(order.invoiceFiles ?? []);

        this.cdr.detectChanges();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudo cargar el pedido para editar'
        });
      }
    });
  }

  onViewOrderDetail(debt: Debt) {
    // Navegar al reporte detallado con el debtId
    this.router.navigate(['/reports/detailed'], { 
      queryParams: { 
        providerId: this.provider?.id,
        debtId: debt.id 
      } 
    });
  }

  onExportReport() {
    if (!this.provider) {
      return;
    }

    this.loading.set(true);
    this.reportService.exportReport(this.provider.id).subscribe({
      next: (data) => {
        // Crear un blob y descargar el archivo
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `reporte-${this.provider?.companyName}-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        window.URL.revokeObjectURL(url);
        
        this.loading.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Reporte exportado correctamente'
        });
      },
      error: (error) => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Error al exportar el reporte'
        });
      }
    });
  }

  onAddOrder() {
    const orderId = this.editingOrderId();
    if (orderId !== null && !this.canEditProviderAndDebts) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Sin permisos',
        detail: 'No tiene permisos para editar deudas.'
      });
      return;
    }
    const currentProvider = this.provider;
    if (!this.orderForm.valid || !currentProvider) {
      Object.keys(this.orderForm.controls).forEach(key => {
        this.orderForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.loading.set(true);
    const formValue = this.orderForm.value;
    const dispatchDate = formValue.fechaDespacho instanceof Date
      ? formValue.fechaDespacho
      : new Date(formValue.fechaDespacho);
    const invoicePayload = this.buildInvoicePayload();

    const onSuccess = () => {
      this.loading.set(false);
      this.editingOrderId.set(null);
      this.editingSurplusBaseline.set(0);
      this.fechaVencimiento.set(null);
      this.orderForm.reset({ title: '', diasCredito: 30, surplusAmountToApply: null });
      this.invoiceFiles = [];
      this.existingInvoiceUrls.set([]);
      this.invoiceUploadComponent?.clear();
      this.reportService.getSupplierDetailed(currentProvider.id).subscribe({
        next: (report) => {
          this.selectedProvider.set({
            ...report.supplier,
            totalCreditAvailable: report.totalCreditAvailable || 0
          });
          this.debts.set(report.debts || []);
          this.cdr.detectChanges();
        }
      });
    };

    if (orderId !== null) {
      const surplus =
        formValue.surplusAmountToApply != null && formValue.surplusAmountToApply !== ''
          ? Number(formValue.surplusAmountToApply)
          : 0;
      const maxSurplus = this.getMaxSurplusToApply();
      if (surplus < 0 || surplus > maxSurplus) {
        this.loading.set(false);
        this.messageService.add({
          severity: 'warn',
          summary: 'Valor no permitido',
          detail: `El saldo excedente a aplicar debe estar entre 0 y ${formatUsd(maxSurplus)} (monto de la deuda y reglas de saldo a favor).`
        });
        return;
      }
      this.orderService
        .update(orderId, {
          title: (formValue.title ?? '').trim(),
          dispatchDate,
          creditDays: formValue.diasCredito,
          amount: formValue.monto,
          surplusAmountToApply: surplus,
          invoiceFiles: invoicePayload.invoiceFiles,
          existingInvoiceFiles: invoicePayload.existingInvoiceFiles,
          removeInvoice: invoicePayload.removeInvoice
        })
        .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Éxito',
            detail: 'Pedido actualizado correctamente'
          });
          onSuccess();
        },
        error: (error) => {
          this.loading.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: error.message || 'Error al actualizar el pedido'
          });
        }
      });
    } else {
      const surplus = formValue.surplusAmountToApply != null && formValue.surplusAmountToApply !== '' ? Number(formValue.surplusAmountToApply) : 0;
      const maxSurplus = this.getMaxSurplusToApply();
      if (surplus > maxSurplus) {
        this.loading.set(false);
        this.messageService.add({
          severity: 'warn',
          summary: 'Valor no permitido',
          detail: `El saldo excedente a aplicar no puede ser mayor a ${formatUsd(maxSurplus)} (mínimo entre el monto de la deuda y el saldo a favor del proveedor).`
        });
        return;
      }
      this.orderService.create({
        supplierId: currentProvider.id,
        title: formValue.title?.trim() || undefined,
        amount: formValue.monto,
        dispatchDate,
        creditDays: formValue.diasCredito,
        invoiceFiles: invoicePayload.invoiceFiles,
        ...(surplus > 0 && { surplusAmountToApply: surplus })
      }).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Éxito',
            detail: 'Pedido agregado correctamente'
          });
          onSuccess();
        },
        error: (error) => {
          this.loading.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: error.message || 'Error al agregar el pedido'
          });
        }
      });
    }
  }

  onCancel() {
    this.editingOrderId.set(null);
    this.editingSurplusBaseline.set(0);
    this.fechaVencimiento.set(null);
    this.orderForm.reset({ diasCredito: 30, surplusAmountToApply: null });
    this.invoiceFiles = [];
    this.existingInvoiceUrls.set([]);
    this.invoiceUploadComponent?.clear();
  }

  onBackToDashboard() {
    this.location.back();
  }

  getProviderMenuItems(): MenuItem[] {
    return [
      {
        label: 'Editar',
        icon: 'pi pi-pencil',
        command: () => this.onEditProvider()
      },
      {
        separator: true
      },
      {
        label: 'Eliminar',
        icon: 'pi pi-trash',
        styleClass: 'text-red-600',
        command: () => this.onDeleteProvider()
      }
    ];
  }

  getDebtMenuItems(debt: Debt): MenuItem[] {
    const items: MenuItem[] = [];
    if (debt.orderId) {
      items.push({
        label: 'Editar',
        icon: 'pi pi-pencil',
        command: () => this.onEditDebt(debt)
      });
    }
    items.push(
      { separator: true },
      {
        label: 'Eliminar',
        icon: 'pi pi-trash',
        styleClass: 'text-red-600',
        command: () => this.onDeleteDebt(debt)
      }
    );
    return items;
  }

  onEditProvider() {
    if (!this.canEditProviderAndDebts) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Sin permisos',
        detail: 'No tiene permisos para editar distribuidores.'
      });
      return;
    }
    const currentProvider = this.provider;
    if (currentProvider?.id) {
      this.router.navigate(['/providers/register'], {
        queryParams: { editId: currentProvider.id }
      });
    }
  }

  onDeleteProvider(): void {
    if (!this.canEditProviderAndDebts) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Sin permisos',
        detail: 'No tiene permisos para eliminar distribuidores.'
      });
      return;
    }
    const currentProvider = this.provider;
    if (currentProvider) {
      this.providerToDelete.set(currentProvider);
      this.showConfirmDeleteProvider.set(true);
    }
  }

  onConfirmDeleteProvider(): void {
    const provider = this.providerToDelete();
    this.providerToDelete.set(null);
    this.showConfirmDeleteProvider.set(false);
    if (!provider?.id) {
      return;
    }
    this.loading.set(true);
    this.supplierService.delete(provider.id).subscribe({
      next: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Distribuidor eliminado correctamente.'
        });
        this.selectedProvider.set(null);
        this.debts.set([]);
        this.editingOrderId.set(null);
        this.editingSurplusBaseline.set(0);
        this.fechaVencimiento.set(null);
        this.orderForm.reset({ title: '', diasCredito: 30, surplusAmountToApply: null });
        // Refrescar sugerencias del autocomplete para que no aparezcan proveedores eliminados
        this.onSearch(this.searchQuery);
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Error al eliminar el distribuidor.'
        });
      }
    });
  }

  onCancelDeleteProvider(): void {
    this.providerToDelete.set(null);
    this.showConfirmDeleteProvider.set(false);
  }

  onDeleteDebt(debt: Debt): void {
    if (!this.canEditProviderAndDebts) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Sin permisos',
        detail: 'No tiene permisos para eliminar deudas.'
      });
      return;
    }
    this.debtToDelete.set(debt);
    this.showConfirmDeleteDebt.set(true);
  }

  onConfirmDeleteDebt(): void {
    const debt = this.debtToDelete();
    this.debtToDelete.set(null);
    this.showConfirmDeleteDebt.set(false);
    if (!debt?.id) {
      return;
    }
    const currentProvider = this.provider;
    if (!currentProvider?.id) {
      return;
    }
    this.loading.set(true);
    this.supplierService.deleteDebt(debt.id).subscribe({
      next: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Deuda eliminada correctamente.'
        });
        if (this.editingOrderId() !== null) {
          this.editingOrderId.set(null);
          this.editingSurplusBaseline.set(0);
          this.fechaVencimiento.set(null);
          this.orderForm.reset({ title: '', diasCredito: 30, surplusAmountToApply: null });
        }
        this.reportService.getSupplierDetailed(currentProvider.id).subscribe({
          next: (report) => {
            this.selectedProvider.set({
              ...report.supplier,
              totalCreditAvailable: report.totalCreditAvailable || 0
            });
            this.debts.set(report.debts || []);
            this.cdr.detectChanges();
          }
        });
      },
      error: (error) => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Error al eliminar la deuda.'
        });
      }
    });
  }

  onCancelDeleteDebt(): void {
    this.debtToDelete.set(null);
    this.showConfirmDeleteDebt.set(false);
  }
}

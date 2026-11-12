import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule, Location, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AppHeader } from '../shared/components/layout/app-header/app-header';
import { PageContainer } from '../shared/components/layout/page-container/page-container';
import { AppCard } from '../shared/components/layout/app-card/app-card';
import { ProviderSelect } from '../shared/components/data/provider-select/provider-select';
import { DateRangePicker, DateRange } from '../shared/components/ui/date-range-picker/date-range-picker';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { PaginatorModule } from 'primeng/paginator';
import { ImageModule } from 'primeng/image';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { MenuModule } from 'primeng/menu';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MenuItem } from 'primeng/api';
import { MessageService } from 'primeng/api';
import { LazyImage } from '../shared/components/ui/lazy-image/lazy-image';
import { ConfirmDialog } from '../shared/components/ui/confirm-dialog/confirm-dialog';
import { OrderDetailDialog } from '../shared/components/ui/order-detail-dialog/order-detail-dialog';
import { PaymentList } from '../shared/components/data/payment-list/payment-list';
import { ReportService, SupplierCredit } from '../shared/services/report.service';
import { SupplierService } from '../shared/services/supplier.service';
import { PaymentService } from '../shared/services/payment.service';
import { SelectFilterService } from '../shared/services/select-filter.service';
import { AuthContext } from '../contexts/auth.context';
import { BrandingService } from '../shared/services/branding.service';
import { Payment } from '../shared/models/payment.model';
import { Provider } from '../shared/models/provider.model';
import { formatLocalDate } from '../shared/utils/date.utils';
import { FormatUsdPipe } from '../shared/pipes/format-usd.pipe';

@Component({
  selector: 'app-payment-report',
  imports: [
    CommonModule,
    FormsModule,
    NgClass,
    AppHeader,
    PageContainer,
    AppCard,
    ProviderSelect,
    DateRangePicker,
    TableModule,
    ButtonModule,
    TagModule,
    ToastModule,
    PaginatorModule,
    ImageModule,
    TooltipModule,
    DialogModule,
    MenuModule,
    SelectModule,
    ToggleSwitchModule,
    LazyImage,
    ConfirmDialog,
    OrderDetailDialog,
    PaymentList,
    FormatUsdPipe
  ],
  providers: [MessageService],
  templateUrl: './payment-report.html',
  styleUrl: './payment-report.scss'
})
export class PaymentReport implements OnInit {
  private syncingQueryParams = false;
  private preferredDebtIdFromUrl: number | null = null;

  selectedProviderId = signal<number | null>(null);
  dateRange = signal<DateRange>({ start: null, end: null });
  selectedPeriod = signal<'today' | 'week' | 'month' | 'all'>('all');
  providers = signal<Provider[]>([]);
  reportData = signal<any>(null);
  loading = signal<boolean>(false);
  
  // Nueva: deuda seleccionada y paginación de pagos
  selectedDebtId = signal<number | null>(null);
  paymentsPage = signal<number>(1);
  paymentsPageSize = signal<number>(10);
  paymentsTotalRecords = signal<number>(0);
  payments = signal<Payment[]>([]);
  loadingPayments = signal<boolean>(false);
  paymentsStatistics = signal<{
    totalPaid: number;
    paymentCount: number;
    averagePayment: number;
  } | null>(null);

  // Estado del modal de confirmación
  showConfirmDialog = signal<boolean>(false);
  paymentToDelete = signal<Payment | null>(null);

  // Estado del modal de pagos eliminados
  showDeletedPaymentsDialog = signal<boolean>(false);
  deletedPayments = computed(() => {
    return this.payments().filter(p => p.deleted === true);
  });

  // Filtro para mostrar pagos: 'active' | 'deleted' (por defecto solo activos)
  paymentFilter = signal<'active' | 'deleted'>('active');

  // Estado del modal de detalle de orden
  showOrderDetailDialog = signal<boolean>(false);
  selectedOrderId = signal<number | null>(null);

  /** Los cajeros no pueden editar ni eliminar pagos */
  get canEditPayments(): boolean {
    return !this.authContext.hasRole('CAJERO');
  }

  constructor(
    private reportService: ReportService,
    private supplierService: SupplierService,
    private paymentService: PaymentService,
    private messageService: MessageService,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location,
    public selectFilter: SelectFilterService,
    private authContext: AuthContext,
    public branding: BrandingService
  ) {
    this.loadProviders();
  }

  ngOnInit() {
    // Opción B: estado en URL (query params)
    this.route.queryParams.subscribe(params => {
      if (this.syncingQueryParams) return;
      this.applyQueryParams(params);
    });
  }

  private parseDateParam(value: any): Date | null {
    if (!value || typeof value !== 'string') return null;
    const dateOnly = value.split('T')[0];
    return new Date(`${dateOnly}T00:00:00`);
  }

  private formatDateParam(date: Date): string {
    return formatLocalDate(date);
  }

  private buildQueryParams(): Record<string, any> {
    const params: Record<string, any> = {};

    const providerId = this.selectedProviderId();
    if (providerId) params['providerId'] = providerId;

    const debtId = this.selectedDebtId();
    if (debtId) params['debtId'] = debtId;

    const page = this.paymentsPage();
    if (page && page !== 1) params['page'] = page;

    const filter = this.paymentFilter();
    if (filter && filter !== 'active') params['filter'] = filter;

    const period = this.selectedPeriod();
    if (period && period !== 'all') params['period'] = period;

    const range = this.dateRange();
    if (range?.start instanceof Date) params['start'] = this.formatDateParam(range.start);
    if (range?.end instanceof Date) params['end'] = this.formatDateParam(range.end);

    return params;
  }

  private syncUrl(replaceUrl: boolean = true) {
    this.syncingQueryParams = true;
    const queryParams = this.buildQueryParams();
    this.router
      .navigate([], { relativeTo: this.route, queryParams, replaceUrl })
      .finally(() => {
        this.syncingQueryParams = false;
      });
  }

  private applyQueryParams(params: any) {
    const providerId = params['providerId'] ? Number(params['providerId']) : null;
    const debtId = params['debtId'] ? Number(params['debtId']) : null;
    const page = params['page'] ? Number(params['page']) : 1;
    const filter = params['filter'] === 'deleted' ? 'deleted' : 'active';
    const periodRaw = params['period'];
    const validPeriods = new Set(['today', 'week', 'month', 'all']);
    const period = validPeriods.has(periodRaw) ? periodRaw : 'all';
    const start = this.parseDateParam(params['start']);
    const end = this.parseDateParam(params['end']);

    // Aplicar el estado
    this.paymentFilter.set(filter);
    this.selectedPeriod.set(period as any);
    this.dateRange.set({ start, end });
    this.paymentsPage.set(page || 1);

    // Si no hay proveedor en URL, mantener pantalla inicial
    if (!providerId) {
      return;
    }

    const providerChanged = this.selectedProviderId() !== providerId;
    const shouldLoadReport = providerChanged || !this.reportData();

    if (shouldLoadReport) {
      this.selectedProviderId.set(providerId);
      // Reset mínimo (equivalente a onProviderChange, sin disparar syncUrl)
      this.selectedDebtId.set(null);
      this.payments.set([]);
      this.paymentsTotalRecords.set(0);
      this.paymentsStatistics.set(null);

      this.preferredDebtIdFromUrl = debtId;
      this.loadReport(providerId);
      return;
    }

    // Misma data: solo cambiar deuda/página y recargar pagos
    if (debtId && this.selectedDebtId() !== debtId) {
      this.selectedDebtId.set(debtId);
      this.loadDebtPayments(debtId);
      return;
    }

    const currentDebtId = this.selectedDebtId();
    if (currentDebtId) {
      this.loadDebtPayments(currentDebtId);
    }
  }

  private loadProviders() {
    this.supplierService.list().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.providers.set(response.data);
        }
      },
      error: () => {}
    });
  }

  get providersList() {
    return this.providers();
  }

  get selectedProvider(): Provider | undefined {
    const id = this.selectedProviderId();
    return id ? this.providers().find(p => p.id === id) : undefined;
  }

  debts = computed(() => {
    const data = this.reportData();
    return data?.debts || [];
  });

  /** Créditos por excedente de pagos (detalle del saldo a favor). */
  supplierCredits = computed((): SupplierCredit[] => {
    const credits = this.reportData()?.credits;
    return Array.isArray(credits) ? credits : [];
  });

  showCreditsDialog = signal<boolean>(false);

  totalDebt = computed(() => {
    const debts = this.debts();
    const provider = this.selectedProvider;
    if (debts.length === 0 && provider) {
      return provider.totalDebt || 0;
    }
    return debts.reduce((sum: number, debt: any) => sum + (debt.remainingAmount || 0), 0);
  });

  selectedDebt = computed(() => {
    const debtId = this.selectedDebtId();
    if (!debtId) return null;
    const debts = this.debts();
    return debts.find((d: any) => d.id === debtId) || null;
  });

  /** Opciones para el dropdown de deudas en responsive (misma info que las tarjetas) */
  debtOptions = computed(() => {
    return this.debts().map((d: any) => ({
      id: d.id,
      label: `${this.getDebtDisplayTitle(d)} #${d.id}`,
      statusLabel: this.getStatusLabel(d.status),
      initialAmount: d.initialAmount ?? 0,
      remainingAmount: d.remainingAmount ?? 0,
      dueDate: d.dueDate,
      activePayments: this.getActivePaymentsCount(d),
      surplusAmountApplied: d.surplusAmountApplied ?? 0
    }));
  });

  displayedPayments = computed((): Payment[] => {
    const allPayments = this.payments();
    const filter = this.paymentFilter();
    
    if (filter === 'active') {
      return allPayments.filter(p => !p.deleted);
    } else {
      // 'deleted' - mostrar solo eliminados
      return allPayments.filter(p => p.deleted === true);
    }
  });

  paymentsPagination = computed(() => {
    return {
      page: this.paymentsPage(),
      limit: this.paymentsPageSize(),
      total: this.paymentsTotalRecords(),
      totalPages: Math.ceil(this.paymentsTotalRecords() / this.paymentsPageSize())
    };
  });

  get stats() {
    const data = this.reportData();
    if (!data) {
      return {
        totalPagado: 0,
        cantidadPagos: 0,
        promedioPago: 0
      };
    }

    return {
      totalPagado: data.totalPaid || 0,
      cantidadPagos: data.paymentCount || 0,
      promedioPago: data.averagePayment || 0
    };
  }

  onProviderChange(provider: Provider | null) {
    this.selectedProviderId.set(provider?.id || null);
    this.selectedDebtId.set(null);
    this.payments.set([]);
    this.paymentsPage.set(1);
    this.paymentsStatistics.set(null);
    if (provider) {
      this.loadReport(provider.id);
    } else {
      this.reportData.set(null);
    }

    // Mantener estado en URL
    this.syncUrl(true);
  }

  private loadReport(supplierId: number) {
    this.loading.set(true);
    const startDate = this.dateRange().start;
    const endDate = this.dateRange().end;
    
    this.reportService.getSupplierDetailed(
      supplierId,
      startDate || undefined,
      endDate || undefined
    ).subscribe({
      next: (data) => {
        this.reportData.set(data);

        const debts = Array.isArray(data.debts) ? data.debts : [];
        const currentSelectedDebtId = this.selectedDebtId();

        // Prioridad de selección:
        // 1) deuda indicada por URL (preferredDebtIdFromUrl)
        // 2) deuda actualmente seleccionada (si existe en el reporte)
        // 3) primera deuda del listado
        let debtToSelectId: number | null = null;
        if (this.preferredDebtIdFromUrl) {
          const match = debts.find((d: any) => d?.id === this.preferredDebtIdFromUrl);
          debtToSelectId = match?.id ?? null;
        }
        if (!debtToSelectId && currentSelectedDebtId) {
          const match = debts.find((d: any) => d?.id === currentSelectedDebtId);
          debtToSelectId = match?.id ?? null;
        }
        if (!debtToSelectId && debts.length > 0) {
          debtToSelectId = debts[0].id;
        }

        if (debtToSelectId) {
          this.selectedDebtId.set(debtToSelectId);
          this.loadDebtPayments(debtToSelectId);
        }

        // Ya consumimos la preferencia (si existía)
        this.preferredDebtIdFromUrl = null;

        // Mantener el estado en la URL (sin ensuciar el historial)
        this.syncUrl(true);
        
        this.loading.set(false);
      },
      error: (error) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Error al cargar el reporte'
        });
        this.loading.set(false);
      }
    });
  }

  private loadDebtPayments(debtId: number) {
    this.loadingPayments.set(true);
    const startDate = this.dateRange().start;
    const endDate = this.dateRange().end;
    
    this.reportService.getDebtPayments(
      debtId,
      this.paymentsPage(),
      this.paymentsPageSize(),
      startDate || undefined,
      endDate || undefined
    ).subscribe({
      next: (response) => {
        this.payments.set(response.data);
        this.paymentsTotalRecords.set(response.pagination.total);
        this.paymentsStatistics.set(response.statistics);
        this.loadingPayments.set(false);
      },
      error: (error) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Error al cargar los pagos de la deuda'
        });
        this.payments.set([]);
        this.paymentsTotalRecords.set(0);
        this.paymentsStatistics.set(null);
        this.loadingPayments.set(false);
      }
    });
  }

  onDebtSelect(debtId: number) {
    // Evitar ejecutar si ya está seleccionada la misma deuda
    if (this.selectedDebtId() === debtId) {
      return;
    }
    // Con radio buttons, siempre seleccionamos (no se puede deseleccionar)
    this.selectedDebtId.set(debtId);
    this.paymentsPage.set(1);
    // Limpiar estadísticas y pagos anteriores mientras se cargan los nuevos
    this.paymentsStatistics.set(null);
    this.payments.set([]);
    this.paymentsTotalRecords.set(0);
    this.loadDebtPayments(debtId);

    // Mantener estado en URL
    this.syncUrl(true);
  }

  onPageChange(event: any) {
    this.paymentsPage.set(event.page + 1); // PrimeNG usa índice base 0
    const debtId = this.selectedDebtId();
    if (debtId) {
      this.loadDebtPayments(debtId);
    }

    // Mantener estado en URL
    this.syncUrl(true);
  }

  onViewReceipt(url?: string) {
    if (url) {
      window.open(url, '_blank');
    }
  }

  onDateRangeChange(range: DateRange) {
    this.dateRange.set(range);
    // Ejecutar búsqueda automáticamente cuando cambia el rango de fechas
    const providerId = this.selectedProviderId();
    if (providerId) {
      this.loadReport(providerId);
      // Si hay una deuda seleccionada, recargar sus pagos con el nuevo rango de fechas
      const debtId = this.selectedDebtId();
      if (debtId) {
        this.paymentsPage.set(1);
        this.loadDebtPayments(debtId);
      }
    }

    // Mantener estado en URL (luego de ajustar página si aplica)
    this.syncUrl(true);
  }

  onPeriodSelect(period: string) {
    const validPeriod = period as 'today' | 'week' | 'month' | 'all';
    this.selectedPeriod.set(validPeriod);
    this.syncUrl(true);
    // No ejecutar búsqueda aquí porque onDateRangeChange ya lo hace cuando se emite valueChange
  }

  onPaymentFilterChange(filter: 'active' | 'deleted') {
    this.paymentFilter.set(filter);
    this.syncUrl(true);
  }

  /** Usado por el p-inputSwitch: true = eliminados, false = activos */
  onPaymentFilterSwitch(showDeleted: boolean) {
    this.paymentFilter.set(showDeleted ? 'deleted' : 'active');
    this.syncUrl(true);
  }

  exportingReport = signal<boolean>(false);

  onExport() {
    const providerId = this.selectedProviderId();
    if (!providerId) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Advertencia',
        detail: 'Seleccione un proveedor para exportar'
      });
      return;
    }

    this.exportingReport.set(true);
    const startDate = this.dateRange().start;
    const endDate = this.dateRange().end;

    this.reportService.exportReport(
      providerId,
      startDate || undefined,
      endDate || undefined
    ).subscribe({
      next: (blob: Blob) => {
        // Crear URL temporal del blob y disparar descarga
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // Nombre del archivo: reporte_<proveedor>_<fecha>.pdf
        const providerName = this.selectedProvider?.companyName?.replace(/\s+/g, '_') || 'proveedor';
        const today = new Date().toISOString().split('T')[0];
        a.download = `reporte_${providerName}_${today}.pdf`;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.exportingReport.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Reporte exportado',
          detail: 'El reporte PDF se ha descargado correctamente'
        });
      },
      error: (error) => {
        this.exportingReport.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Error al exportar el reporte'
        });
      }
    });
  }

  getPaymentMethodBadge(method: string) {
    const badges: Record<string, { label: string; severity: string }> = {
      'Zelle': { label: 'Zelle', severity: 'purple' },
      'Transferencia': { label: 'Transferencia', severity: 'blue' },
      'Pago Móvil': { label: 'Pago Móvil', severity: 'warn' },
      'Efectivo': { label: 'Efectivo', severity: 'green' },
      'Otro': { label: 'Otro', severity: 'secondary' }
    };
    return badges[method] || badges['Otro'];
  }

  get isLoading() {
    return this.loading();
  }

  // Método para traducir el status
  /** Título para mostrar en listado: título de la deuda si existe, si no "Deuda". */
  getDebtDisplayTitle(debt: any): string {
    const t = debt?.title?.trim();
    return t || 'Deuda';
  }

  getStatusLabel(status: string): string {
    const statusMap: Record<string, string> = {
      'PENDING': 'Pendiente',
      'PARTIALLY_PAID': 'Parcialmente Pagado',
      'PAID': 'Pagado',
      'OVERDUE': 'Vencido'
    };
    return statusMap[status] || status;
  }

  /**
   * Cuenta solo los pagos activos (no eliminados) de una deuda
   */
  getActivePaymentsCount(debt: any): number {

    if (!debt.payments || !Array.isArray(debt.payments)) {
      return 0;
    }
    // Filtrar pagos que no estén eliminados (deletedAt no existe o deleted es false)
    return debt.payments.filter((payment: any) => {
      // Un pago está activo si no tiene deletedAt o deleted es false
      return !payment.deletedAt && !payment.deleted;
    }).length;
  }

  getDueDateStatus(debt: any): 'safe' | 'warning' | 'danger' {
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

  getDaysUntilDue(debt: any): number {
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

  // Métodos para acciones (editar y eliminar)
  onEditPayment(payment: Payment) {
    // Validar que el pago no esté eliminado
    if (payment.deleted) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Pago eliminado',
        detail: 'No se puede editar un pago que ha sido eliminado',
        life: 3000
      });
      return;
    }
    
    // Navegar al formulario de registro con el ID del pago para editar
    this.router.navigate(['/payments/register'], {
      queryParams: { editId: payment.id }
    });
  }

  onDeletePayment(payment: Payment) {
    // Validar que el pago no esté ya eliminado
    if (payment.deleted) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Pago ya eliminado',
        detail: 'Este pago ya ha sido eliminado anteriormente',
        life: 3000
      });
      return;
    }
    
    this.paymentToDelete.set(payment);
    this.showConfirmDialog.set(true);
  }

  onConfirmDelete(reason?: string) {
    const payment = this.paymentToDelete();
    if (!payment) {
      return;
    }

    this.paymentService.delete(payment.id, reason).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Pago eliminado correctamente'
        });
        
        // Recargar el reporte del proveedor para actualizar las deudas
        const supplierId = payment.supplierId || this.selectedProviderId();
        if (supplierId) {
          this.loadReport(supplierId);
        }
        
        // Recargar los pagos de la deuda actual
        const debtId = this.selectedDebtId();
        if (debtId) {
          this.loadDebtPayments(debtId);
        }
        
        // Limpiar estado
        this.paymentToDelete.set(null);
        this.showConfirmDialog.set(false);
      },
      error: (error: any) => {
        // Extraer mensaje de error de diferentes formatos posibles
        let errorMessage = 'Error al eliminar el pago';
        
        if (error?.error) {
          if (error.error.message) {
            errorMessage = error.error.message;
          } else if (typeof error.error === 'string') {
            errorMessage = error.error;
          } else if (error.error.errors && Array.isArray(error.error.errors) && error.error.errors.length > 0) {
            errorMessage = error.error.errors.map((e: any) => e.msg || e.message || e).join(', ');
          }
        } else if (error?.message) {
          errorMessage = error.message;
        } else if (typeof error === 'string') {
          errorMessage = error;
        }
        
        // Mostrar el toast de error
        this.messageService.add({
          severity: 'error',
          summary: 'Error al eliminar pago',
          detail: errorMessage,
          life: 5000,
          closable: true
        });
        
        // Limpiar estado
        this.paymentToDelete.set(null);
        this.showConfirmDialog.set(false);
      }
    });
  }

  onSharePayment(payment: Payment) {
    // Validar que el pago no esté eliminado
    if (payment.deleted) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Pago eliminado',
        detail: 'No se puede compartir un pago que ha sido eliminado',
        life: 3000
      });
      return;
    }

    // Llamar al servicio para compartir el pago
    this.paymentService.share(payment.id).subscribe({
      next: (response) => {
        // Abrir WhatsApp con la URL generada
        if (response.whatsappUrl) {
          window.open(response.whatsappUrl, '_blank');
        }

        // Actualizar el pago en la lista local
        const currentPayments = this.payments();
        const updatedPayments = currentPayments.map(p => 
          p.id === payment.id ? response.payment : p
        );
        this.payments.set(updatedPayments);

        // Mostrar mensaje de éxito
        this.messageService.add({
          severity: 'success',
          summary: 'Pago compartido',
          detail: 'El comprobante se ha compartido exitosamente por WhatsApp',
          life: 3000
        });
      },
      error: (error: any) => {
        const errorMessage = error?.error?.message || error?.message || 'Error al compartir el pago';
        this.messageService.add({
          severity: 'error',
          summary: 'Error al compartir',
          detail: errorMessage,
          life: 5000
        });
      }
    });
  }

  getDeleteTooltip(payment: Payment): string {
    let tooltip = 'Eliminado';
    if (payment.deletedAt) {
      tooltip += ` el ${new Date(payment.deletedAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    }
    if (payment.deleteReason) {
      tooltip += `\nMotivo: ${payment.deleteReason}`;
    }
    return tooltip;
  }

  onCancelDelete() {
    this.paymentToDelete.set(null);
    this.showConfirmDialog.set(false);
  }

  onShowDeletedPayments() {
    this.showDeletedPaymentsDialog.set(true);
  }

  onViewOrderDetail(debt: any) {
    if (debt.orderId) {
      this.selectedOrderId.set(debt.orderId);
      this.showOrderDetailDialog.set(true);
    } else {
      this.messageService.add({
        severity: 'warn',
        summary: 'Advertencia',
        detail: 'Esta deuda no tiene una orden asociada',
        life: 3000
      });
    }
  }

  onOrderDetailClose() {
    this.showOrderDetailDialog.set(false);
    this.selectedOrderId.set(null);
  }

  onViewPaymentDetail(payment: Payment) {
    // Opción B: pasar el estado actual vía query params para reconstruir al volver
    this.router.navigate(['/payments', payment.id], {
      queryParams: this.buildQueryParams()
    });
  }

  onCloseDeletedPaymentsDialog() {
    this.showDeletedPaymentsDialog.set(false);
  }

  openCreditsDialog() {
    this.showCreditsDialog.set(true);
  }

  onCloseCreditsDialog() {
    this.showCreditsDialog.set(false);
  }

  getCreditStatusLabel(status: string): string {
    const map: Record<string, string> = {
      AVAILABLE: 'Disponible',
      APPLIED: 'Aplicado',
      CONSUMED: 'Consumido'
    };
    return map[status] || status;
  }

  onCancel() {
    this.location.back();
  }

  /** Referencia ligada al componente para que los command del menú tengan el this correcto */
  readonly getPaymentMenuItems = (payment: Payment): MenuItem[] => this.buildPaymentMenuItems(payment);

  private buildPaymentMenuItems(payment: Payment): MenuItem[] {
    const items: MenuItem[] = [
      {
        label: 'Ver Detalle',
        icon: 'pi pi-eye',
        command: () => this.onViewPaymentDetail(payment)
      }
    ];

    if (!payment.deleted) {
      items.push({
        label: 'Compartir por WhatsApp',
        icon: 'pi pi-share-alt',
        command: () => this.onSharePayment(payment)
      });

      // Solo roles que no son cajero pueden editar y eliminar pagos
      if (this.canEditPayments) {
        items.push(
          {
            label: 'Editar',
            icon: 'pi pi-pencil',
            command: () => this.onEditPayment(payment)
          },
          { separator: true },
          {
            label: 'Eliminar',
            icon: 'pi pi-trash',
            styleClass: 'text-red-600',
            command: () => this.onDeletePayment(payment)
          }
        );
      }
    }

    return items;
  }
}

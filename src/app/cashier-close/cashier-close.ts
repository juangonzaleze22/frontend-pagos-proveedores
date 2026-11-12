import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AppHeader } from '../shared/components/layout/app-header/app-header';
import { PageContainer } from '../shared/components/layout/page-container/page-container';
import { StatCard } from '../shared/components/ui/stat-card/stat-card';
import { AuthContext } from '../contexts/auth.context';
import { PaymentService } from '../shared/services/payment.service';
import { UserService, UserListItem } from '../shared/services/user.service';
import { Payment } from '../shared/models/payment.model';
import { CashierSessionSummary, CashierInfo, CashierPaymentsParams } from '../shared/models/cashier.model';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { CheckboxModule } from 'primeng/checkbox';
import { PaymentDetailDialog } from '../shared/components/ui/payment-detail-dialog/payment-detail-dialog';

@Component({
  selector: 'app-cashier-close',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppHeader,
    PageContainer,
    StatCard,
    SelectModule,
    ButtonModule,
    DatePickerModule,
    TableModule,
    TagModule,
    TooltipModule,
    ProgressSpinnerModule,
    ToastModule,
    CheckboxModule,
    PaymentDetailDialog
  ],
  providers: [MessageService],
  templateUrl: './cashier-close.html',
  styleUrl: './cashier-close.scss'
})
export class CashierClose implements OnInit {
  // Estado de carga
  loading = signal(false);
  loadingCashiers = signal(false);

  // Lista de cajeros
  cashiers = signal<UserListItem[]>([]);
  selectedCashierId = signal<number | null>(null);

  cashierInfo = signal<CashierInfo | null>(null);
  summary = signal<CashierSessionSummary | null>(null);
  payments = signal<Payment[]>([]);

  // Paginación
  currentPage = signal(1);
  pageSize = signal(20);
  totalRecords = signal(0);

  // Filtros
  dateRange = signal<Date[] | null>(null);
  selectedPaymentMethod = signal<string | null>(null);
  includeDeleted = signal(false);

  // Modal de detalle de pago
  showPaymentDetail = signal(false);
  selectedPayment = signal<Payment | null>(null);

  // Opciones para filtros
  paymentMethodOptions = [
    { label: 'Todos los métodos', value: null },
    { label: 'Zelle', value: 'ZELLE' },
    { label: 'Transferencia', value: 'TRANSFER' },
    { label: 'Pago Móvil', value: 'PAGO_MOVIL' },
    { label: 'Efectivo', value: 'CASH' }
  ];

  // Computed
  hasData = computed(() => !!this.summary());

  isCajero = computed(() => this.authContext.hasRole('CAJERO'));

  /** Nombre del cajero seleccionado para mostrar en el header */
  cashierDisplayName = computed(() => {
    const info = this.cashierInfo();
    if (info) return info.nombre || info.email;
    return '';
  });

  constructor(
    private paymentService: PaymentService,
    private userService: UserService,
    public authContext: AuthContext,
    private router: Router,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    this.loadCashiers();

    // Si el usuario actual es cajero, auto-seleccionar
    const currentUser = this.authContext.user();
    if (currentUser && this.authContext.hasRole('CAJERO')) {
      this.selectedCashierId.set(currentUser.id);
      this.loadCashierData();
    }
  }

  private loadCashiers() {
    this.loadingCashiers.set(true);
    this.userService.listCashiers().subscribe({
      next: (cashiers) => {
        this.cashiers.set(cashiers);
        this.loadingCashiers.set(false);
      },
      error: () => {
        this.cashiers.set([]);
        this.loadingCashiers.set(false);
      }
    });
  }

  onCashierChange(cashierId: number) {
    this.selectedCashierId.set(cashierId);
    this.currentPage.set(1);
    this.loadCashierData();
  }

  onDateRangeChange(range: Date[]) {
    this.dateRange.set(range);
    if (range && range.length === 2 && range[0] && range[1] && this.selectedCashierId()) {
      this.currentPage.set(1);
      this.loadCashierData();
    }
  }

  onDateRangeClear() {
    this.dateRange.set(null);
    if (this.selectedCashierId()) {
      this.currentPage.set(1);
      this.loadCashierData();
    }
  }

  onPaymentMethodChange(method: string | null) {
    this.selectedPaymentMethod.set(method);
    if (this.selectedCashierId()) {
      this.currentPage.set(1);
      this.loadCashierData();
    }
  }

  onIncludeDeletedChange() {
    if (this.selectedCashierId()) {
      this.currentPage.set(1);
      this.loadCashierData();
    }
  }

  onPageChange(event: any) {
    const newPage = Math.floor(event.first / event.rows) + 1;
    const newPageSize = event.rows;

    // Solo recargar si realmente cambió la página o el tamaño
    if (newPage === this.currentPage() && newPageSize === this.pageSize()) {
      return;
    }

    this.currentPage.set(newPage);
    this.pageSize.set(newPageSize);
    this.loadCashierData();
  }

  loadCashierData() {
    const cashierId = this.selectedCashierId();
    if (!cashierId) return;

    this.loading.set(true);

    const params: CashierPaymentsParams = {
      page: this.currentPage(),
      limit: this.pageSize()
    };

    const range = this.dateRange();
    if (range && range.length >= 1 && range[0]) {
      params.startDate = range[0].toISOString().split('T')[0];
    }
    if (range && range.length >= 2 && range[1]) {
      params.endDate = range[1].toISOString().split('T')[0];
    }

    const method = this.selectedPaymentMethod();
    if (method) {
      params.paymentMethod = method as 'ZELLE' | 'TRANSFER' | 'PAGO_MOVIL' | 'CASH';
    }

    params.includeDeleted = this.includeDeleted();

    this.paymentService.getPaymentsByCashier(cashierId, params).subscribe({
      next: (response) => {
        this.cashierInfo.set(response.cashier);
        this.summary.set(response.summary);
        this.payments.set(response.payments);
        this.totalRecords.set(response.pagination.total);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err.message || 'Error al cargar datos del cajero'
        });
      }
    });
  }

  refresh() {
    this.loadCashierData();
  }

  clearFilters() {
    this.dateRange.set(null);
    this.selectedPaymentMethod.set(null);
    this.includeDeleted.set(false);
    this.currentPage.set(1);
    if (this.selectedCashierId()) {
      this.loadCashierData();
    }
  }

  onViewPaymentDetail(payment: Payment) {
    this.selectedPayment.set(payment);
    this.showPaymentDetail.set(true);
  }

  onClosePaymentDetail() {
    this.showPaymentDetail.set(false);
    this.selectedPayment.set(null);
  }

  openPaymentInNewTab(payment: Payment) {
    const url = this.router.serializeUrl(this.router.createUrlTree(['/payments', payment.id]));
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // Utilidades de formato
  formatCurrency(value: number | undefined): string {
    if (value === undefined || value === null) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  formatBolivares(value: number | undefined): string {
    if (value === undefined || value === null) return 'Bs. 0,00';
    return 'Bs. ' + new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  }

  formatNumber(value: number | undefined): string {
    if (value === undefined || value === null) return '0';
    return new Intl.NumberFormat('es-VE').format(value);
  }

  getPaymentMethodLabel(method: string): string {
    const labels: Record<string, string> = {
      'Zelle': 'Zelle',
      'Transferencia': 'Transferencia',
      'Pago Móvil': 'Pago Móvil',
      'Efectivo': 'Efectivo'
    };
    return labels[method] || method;
  }

  getPaymentMethodIcon(method: string): string {
    const icons: Record<string, string> = {
      'ZELLE': 'pi pi-dollar',
      'TRANSFER': 'pi pi-building-columns',
      'PAGO_MOVIL': 'pi pi-mobile',
      'CASH': 'pi pi-money-bill'
    };
    return icons[method] || 'pi pi-money-bill';
  }

  getStatusSeverity(payment: Payment): 'success' | 'warn' | 'danger' | 'info' | 'secondary' {
    if (payment.deleted) return 'danger';
    if (payment.verified) return 'success';
    if (payment.shared) return 'info';
    return 'warn';
  }

  getStatusLabel(payment: Payment): string {
    if (payment.deleted) return 'Eliminado';
    if (payment.verified) return 'Verificado';
    if (payment.shared) return 'Compartido';
    return 'No verificado';
  }
}

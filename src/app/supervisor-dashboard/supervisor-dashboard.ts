import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AppHeader } from '../shared/components/layout/app-header/app-header';
import { PageContainer } from '../shared/components/layout/page-container/page-container';
import { StatCard } from '../shared/components/ui/stat-card/stat-card';
import { ActionCard } from '../shared/components/ui/action-card/action-card';
import { ReportService } from '../shared/services/report.service';
import { DashboardStats } from '../shared/services/report.service';
import { SupplierService } from '../shared/services/supplier.service';
import { Provider } from '../shared/models/provider.model';
import { Payment } from '../shared/models/payment.model';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { FormsModule } from '@angular/forms';
import { PaymentList } from '../shared/components/data/payment-list/payment-list';
import { AuthContext } from '../contexts/auth.context';
import { BrandingService } from '../shared/services/branding.service';
import { formatUsd } from '../shared/utils/format-usd';

const MODAL_DATE_FILTER_OPTIONS: { label: string; value: 'today' | 'last7' | 'month' | 'all' }[] = [
  { label: 'Todo', value: 'all' },
  { label: 'Hoy', value: 'today' },
  { label: 'Últimos 7 días', value: 'last7' },
  { label: 'Mes', value: 'month' }
];

@Component({
  selector: 'app-supervisor-dashboard',
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    AppHeader,
    PageContainer,
    StatCard,
    ActionCard,
    DialogModule,
    ButtonModule,
    SelectModule,
    PaymentList
  ],
  templateUrl: './supervisor-dashboard.html',
  styleUrl: './supervisor-dashboard.scss',
  standalone: true,
})
export class SupervisorDashboard {
  readonly modalDateFilterOptions = MODAL_DATE_FILTER_OPTIONS;

  private _stats = signal<DashboardStats | null>(null);
  private _loading = signal<boolean>(false);

  readonly stats = this._stats.asReadonly();
  readonly loading = this._loading.asReadonly();

  /** Total deuda con separadores de miles (misma regla que `formatUsd` en el resto de la app). */
  formattedTotalDebt = computed(() => formatUsd(this._stats()?.totalDebt ?? 0));

  // Modal "Pagos Procesados"
  showProcessedPaymentsModal = signal<boolean>(false);
  modalProviders = signal<Provider[]>([]);
  modalLoadingProviders = signal<boolean>(false);
  selectedModalProviderId = signal<number | null>(null);
  modalReportData = signal<any>(null);
  modalSelectedDebtId = signal<number | null>(null);
  modalPayments = signal<Payment[]>([]);
  modalLoadingReport = signal<boolean>(false);
  modalLoadingPayments = signal<boolean>(false);

  /** Filtro de fecha en el modal: 'today' | 'last7' | 'month' | 'all'. Por defecto 'all'. */
  modalPaymentsDateFilter = signal<'today' | 'last7' | 'month' | 'all'>('all');

  modalDebts = computed(() => {
    const data = this.modalReportData();
    return data?.debts || [];
  });

  modalSelectedProvider = computed(() => {
    const id = this.selectedModalProviderId();
    return id ? this.modalProviders().find(p => p.id === id) : undefined;
  });

  /** Pagos filtrados por fecha (y por deuda ya viene del backend). Incluye activos y eliminados. */
  modalDisplayedPayments = computed((): Payment[] => {
    const payments = this.modalPayments();
    const filter = this.modalPaymentsDateFilter();
    if (filter === 'all') return payments;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const isInRange = (d: Date) => {
      const date = d instanceof Date ? d : new Date(d);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      if (filter === 'today') return dayStart.getTime() === todayStart.getTime();
      if (filter === 'last7') {
        const sevenDaysAgo = new Date(todayStart);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return dayStart >= sevenDaysAgo && dayStart <= todayStart;
      }
      if (filter === 'month') {
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      }
      return true;
    };
    return payments.filter(p => isInRange(p.paymentDate));
  });

  modalDebtOptions = computed(() => {
    return this.modalDebts().map((d: any) => ({
      id: d.id,
      label: `Deuda #${d.id}`,
      status: d.status,
      remainingAmount: d.remainingAmount
    }));
  });

  /** true si el usuario NO es cajero (puede registrar proveedores) */
  get canRegisterProviders(): boolean {
    return !this.authContext.hasRole('CAJERO');
  }

  constructor(
    private reportService: ReportService,
    private supplierService: SupplierService,
    private router: Router,
    private authContext: AuthContext,
    public branding: BrandingService
  ) {
    this.loadDashboard();
  }

  private loadDashboard() {
    this._loading.set(true);
    this.reportService.getDashboard().subscribe({
      next: (data) => {
        this._stats.set(data);
        this._loading.set(false);
      },
      error: () => {
        this._loading.set(false);
      }
    });
  }

  get statsValue() {
    return this._stats() || {
      pendingPayments: 0,
      processedPayments: 0,
      totalSuppliers: 0,
      totalDebt: 0
    };
  }

  openProcessedPaymentsModal() {
    this.showProcessedPaymentsModal.set(true);
    this.selectedModalProviderId.set(null);
    this.modalReportData.set(null);
    this.modalSelectedDebtId.set(null);
    this.modalPayments.set([]);
    this.modalPaymentsDateFilter.set('all');
    this.modalLoadingProviders.set(true);
    this.supplierService.list().subscribe({
      next: (res) => {
        this.modalProviders.set(res.data || []);
        this.modalLoadingProviders.set(false);
      },
      error: () => {
        this.modalProviders.set([]);
        this.modalLoadingProviders.set(false);
      }
    });
  }

  closeProcessedPaymentsModal() {
    this.showProcessedPaymentsModal.set(false);
    this.selectedModalProviderId.set(null);
    this.modalReportData.set(null);
    this.modalSelectedDebtId.set(null);
    this.modalPayments.set([]);
    this.modalPaymentsDateFilter.set('all');
  }

  backToProviderGrid() {
    this.selectedModalProviderId.set(null);
    this.modalReportData.set(null);
    this.modalSelectedDebtId.set(null);
    this.modalPayments.set([]);
    this.modalPaymentsDateFilter.set('all');
  }

  onSelectProviderInModal(provider: Provider) {
    this.selectedModalProviderId.set(provider.id);
    this.modalReportData.set(null);
    this.modalSelectedDebtId.set(null);
    this.modalPayments.set([]);
    this.modalLoadingReport.set(true);
    this.reportService.getSupplierDetailed(provider.id).subscribe({
      next: (data) => {
        this.modalReportData.set(data);
        const debts = data?.debts || [];
        const firstDebtId = debts.length > 0 ? debts[0].id : null;
        this.modalSelectedDebtId.set(firstDebtId);
        this.modalLoadingReport.set(false);
        if (firstDebtId) {
          this.loadModalDebtPayments(firstDebtId);
        }
      },
      error: () => {
        this.modalReportData.set(null);
        this.modalLoadingReport.set(false);
      }
    });
  }

  onModalDebtChange(debtId: number) {
    this.modalSelectedDebtId.set(debtId);
    this.loadModalDebtPayments(debtId);
  }

  onModalDateFilterChange(value: 'today' | 'last7' | 'month' | 'all') {
    this.modalPaymentsDateFilter.set(value);
  }

  private loadModalDebtPayments(debtId: number) {
    this.modalLoadingPayments.set(true);
    this.reportService.getDebtPayments(debtId, 1, 100).subscribe({
      next: (res) => {
        this.modalPayments.set(res.data);
        this.modalLoadingPayments.set(false);
      },
      error: () => {
        this.modalPayments.set([]);
        this.modalLoadingPayments.set(false);
      }
    });
  }

  onViewPaymentDetailInModal(payment: Payment) {
    const url = this.router.serializeUrl(this.router.createUrlTree(['/payments', payment.id]));
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

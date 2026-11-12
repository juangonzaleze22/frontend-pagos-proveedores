import { Payment } from './payment.model';

export interface CashierInfo {
  id: number;
  nombre: string;
  email: string;
  rol: string;
}

/** Agregados del cierre de caja devueltos por el backend (`summary`). */
export interface CashierPaymentMethodSummary {
  count: number;
  totalUsd: number;
}

export interface CashierSessionSummary {
  totalPayments: number;
  totalAmountUsd: number;
  totalAmountBs: number;
  providersServed: number;
  byPaymentMethod: {
    ZELLE: CashierPaymentMethodSummary;
    TRANSFER: CashierPaymentMethodSummary;
    PAGO_MOVIL: CashierPaymentMethodSummary;
    CASH: CashierPaymentMethodSummary;
  };
}

export interface CashierPaymentsResponse {
  cashier: CashierInfo;
  summary: CashierSessionSummary;
  payments: Payment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CashierPaymentsParams {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  paymentMethod?: 'ZELLE' | 'TRANSFER' | 'PAGO_MOVIL' | 'CASH';
  includeDeleted?: boolean;
}

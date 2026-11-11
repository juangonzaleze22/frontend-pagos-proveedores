import { Payment } from './payment.model';
import { parseLocalDateOptional } from '../utils/date.utils';

export type SupplierPaymentAccountType = 'PAGO_MOVIL' | 'ZELLE' | 'TRANSFER';

/** Datos de una cuenta de pago del distribuidor. */
export interface SupplierPaymentAccount {
  id?: number;
  type: SupplierPaymentAccountType;
  bank?: string | null;
  accountNumber?: string | null;
  holderName?: string | null;
  holderId?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface Provider {
  id: number;
  companyName: string;
  taxId?: string;
  phone?: string;
  email?: string;
  status: 'PENDING' | 'COMPLETED';
  totalDebt: number;
  totalCreditAvailable?: number;
  lastPaymentDate?: Date;
  paymentAccounts?: SupplierPaymentAccount[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ProviderOrder {
  id: number;
  supplierId: number;
  title?: string;
  amount: number;
  dispatchDate: Date;
  creditDays: number;
  dueDate: Date;
  /** URLs de las facturas adjuntas (máx. 2). */
  invoiceFiles?: string[];
  createdAt?: Date;
}

export interface OrderDetail extends ProviderOrder {
  supplier?: Provider;
  debt?: {
    id: number;
    status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
    remainingAmount: number;
    /** Total de excedente aplicado a la deuda (lectura GET/PUT); coherente con surplusAmountToApply al guardar */
    surplusAmountAtCreation?: number;
    surplusAmountApplied?: number;
  };
  createdBy?: number;
  updatedAt?: Date;
}

export interface Debt {
  id: number;
  orderId: number;
  supplierId: number;
  supplier?: Provider;
  /** Título de la deuda (p. ej. de la orden). Si no existe, mostrar "Deuda". */
  title?: string;
  initialAmount: number;
  remainingAmount: number;
  status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
  dueDate: Date;
  createdAt?: Date;
  updatedAt?: Date;
  payments?: Payment[];
  debtNumber?: number;
  /** Monto de saldo excedente (crédito) aplicado a esta deuda al crearla. Enviado por el backend si está disponible. */
  surplusAmountApplied?: number;
  /** URLs de las facturas adjuntas al pedido asociado. */
  invoiceFiles?: string[];
}

// Helper para mapear desde API
export function mapProviderFromAPI(apiProvider: any): Provider {
  return {
    id: apiProvider.id,
    companyName: apiProvider.companyName,
    taxId: apiProvider.taxId,
    phone: apiProvider.phone || apiProvider.phoneNumber, // Mantener compatibilidad temporal
    email: apiProvider.email,
    status: apiProvider.status,
    totalDebt: apiProvider.totalDebt,
    totalCreditAvailable: apiProvider.totalCreditAvailable || 0,
    paymentAccounts: Array.isArray(apiProvider.paymentAccounts) ? apiProvider.paymentAccounts : [],
    lastPaymentDate: parseLocalDateOptional(apiProvider.lastPaymentDate),
    createdAt: apiProvider.createdAt ? new Date(apiProvider.createdAt) : undefined,
    updatedAt: apiProvider.updatedAt ? new Date(apiProvider.updatedAt) : undefined
  };
}

// Helper para mapear a API
export function mapProviderToAPI(provider: Partial<Provider>): any {
  return {
    companyName: provider.companyName,
    taxId: provider.taxId,
    phone: provider.phone,
    email: provider.email,
    status: provider.status,
    ...(provider.totalDebt !== undefined && { initialDebtAmount: provider.totalDebt }),
    ...(provider.lastPaymentDate && { debtDate: provider.lastPaymentDate.toISOString().split('T')[0] })
  };
}

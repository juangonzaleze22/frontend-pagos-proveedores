export interface PaymentDestinationAccount {
  id?: number;
  type: 'PAGO_MOVIL' | 'ZELLE' | 'TRANSFER';
  bank?: string | null;
  accountNumber?: string | null;
  holderName?: string | null;
  holderId?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface Payment {
  id: number;
  debtId: number;
  supplierId: number;
  supplier?: {
    id: number;
    companyName: string;
    taxId?: string;
  };
  debt?: {
    id: number;
    orderId?: number;
    status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
    remainingAmount?: number;
    initialAmount?: number;
    dueDate?: Date;
    debtNumber?: number;
  };
  amount: number;
  paymentMethod: 'Zelle' | 'Transferencia' | 'Efectivo';
  senderName: string;
  senderEmail?: string;
  confirmationNumber?: string;
  paymentDate: Date;
  receiptFiles: string[];
  verified: boolean;
  shared?: boolean;
  sharedAt?: Date;
  createdBy?: number;
  /** Usuario que registró el pago (populado cuando la API incluye createdByUser) */
  createdByUser?: {
    id: number;
    nombre: string;
    email: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
  // Campos de eliminación (soft delete)
  deleted?: boolean;
  deletedAt?: Date;
  deletedBy?: number;
  deletedByUser?: {
    id: number;
    nombre: string;
    email: string;
  };
  deleteReason?: string;
  // Campos de bolívares
  isBolivares?: boolean;
  exchangeRate?: number; // Tasa del dólar en BS
  amountInBolivares?: number; // Monto en bolívares
  // Campos de excedente
  surplusAmount?: number;
  /** Nota u observación del pago */
  nota?: string;
  /** Cuenta del proveedor a la que se realizó el pago (snapshot). */
  destinationAccount?: PaymentDestinationAccount | null;
}

export interface PaymentVerification {
  encontrado: boolean;
  pago?: Payment;
  mensaje?: string;
}

// Tipos para mapeo desde API
export type PaymentMethodAPI = 'ZELLE' | 'TRANSFER' | 'CASH';

export function mapPaymentMethodFromAPI(method: PaymentMethodAPI): Payment['paymentMethod'] {
  const mapping: Record<PaymentMethodAPI, Payment['paymentMethod']> = {
    ZELLE: 'Zelle',
    TRANSFER: 'Transferencia',
    CASH: 'Efectivo'
  };
  return mapping[method] || 'Efectivo';
}

export function mapPaymentMethodToAPI(method: Payment['paymentMethod']): PaymentMethodAPI {
  const mapping: Record<Payment['paymentMethod'], PaymentMethodAPI> = {
    Zelle: 'ZELLE',
    Transferencia: 'TRANSFER',
    Efectivo: 'CASH'
  };
  return mapping[method] || 'CASH';
}

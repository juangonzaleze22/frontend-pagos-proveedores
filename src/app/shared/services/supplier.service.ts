import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from './api.service';
import { Provider, Debt, SupplierPaymentAccount, mapProviderFromAPI, mapProviderToAPI } from '../models/provider.model';
import { Payment } from '../models/payment.model';
import { ApiResponse, PaginatedResponse } from '../models/api-response.model';
import { parseLocalDate, parseLocalDateOptional } from '../utils/date.utils';

export interface SupplierListParams {
  search?: string;
  status?: 'PENDING' | 'COMPLETED';
  page?: number;
  limit?: number;
}

export interface DebtListParams {
  status?: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class SupplierService {
  constructor(private apiService: ApiService) {}

  /**
   * Lista proveedores con filtros opcionales
   */
  list(params?: SupplierListParams): Observable<PaginatedResponse<Provider>> {
    return this.apiService.get<Provider[]>('/suppliers', params).pipe(
      map(response => {
        if (response.success && response.data) {
          return {
            ...response,
            data: response.data.map(mapProviderFromAPI)
          } as PaginatedResponse<Provider>;
        }
        throw new Error(response.message || 'Error al listar proveedores');
      })
    );
  }

  /**
   * Obtiene un proveedor por ID
   */
  getById(id: number): Observable<Provider> {
    return this.apiService.get<Provider>(`/suppliers/${id}`).pipe(
      map(response => {
        if (response.success && response.data) {
          return mapProviderFromAPI(response.data);
        }
        throw new Error(response.message || 'Proveedor no encontrado');
      })
    );
  }

  /**
   * Crea un nuevo proveedor
   * Nota: El status se calcula automáticamente según totalDebt (PENDING si totalDebt > 0, COMPLETED si totalDebt === 0)
   */
  create(data: {
    companyName: string;
    taxId?: string;
    phone?: string;
    email?: string;
    initialDebtAmount?: number;
    debtDate?: string;
    creditDays?: number;
    title?: string;
    paymentAccounts?: SupplierPaymentAccount[];
  }): Observable<Provider> {
    return this.apiService.post<Provider>('/suppliers', data).pipe(
      map(response => {
        if (response.success && response.data) {
          return mapProviderFromAPI(response.data);
        }
        throw new Error(response.message || 'Error al crear proveedor');
      })
    );
  }

  /**
   * Crea un proveedor enviando datos por FormData (permite adjuntar facturas de la deuda inicial).
   */
  createWithFiles(
    data: {
      companyName: string;
      taxId?: string;
      phone?: string;
      email?: string;
      initialDebtAmount?: number;
      debtDate?: string;
      creditDays?: number;
      title?: string;
      paymentAccounts?: SupplierPaymentAccount[];
    },
    invoiceFiles: File[] = []
  ): Observable<Provider> {
    const formData = new FormData();
    formData.append('companyName', data.companyName);
    if (data.taxId != null && data.taxId !== '') formData.append('taxId', data.taxId);
    if (data.phone != null && data.phone !== '') formData.append('phone', data.phone);
    if (data.email != null && data.email !== '') formData.append('email', data.email);
    if (data.initialDebtAmount != null) formData.append('initialDebtAmount', data.initialDebtAmount.toString());
    if (data.debtDate) formData.append('debtDate', data.debtDate);
    if (data.creditDays != null) formData.append('creditDays', data.creditDays.toString());
    if (data.title) formData.append('title', data.title);
    if (data.paymentAccounts && data.paymentAccounts.length > 0) {
      formData.append('paymentAccounts', JSON.stringify(data.paymentAccounts));
    }

    invoiceFiles.slice(0, 2).forEach((file) => {
      if (file instanceof File) {
        formData.append('invoiceFiles', file, file.name);
      }
    });

    return this.apiService.postFormData<Provider>('/suppliers', formData).pipe(
      map(response => {
        if (response.success && response.data) {
          return mapProviderFromAPI(response.data);
        }
        throw new Error(response.message || 'Error al crear proveedor');
      })
    );
  }

  /**
   * Actualiza un proveedor
   * Nota: El status se calcula automáticamente según totalDebt, no se puede actualizar manualmente
   */
  update(id: number, data: Partial<{
    companyName: string;
    taxId: string;
    phone: string;
    email: string;
    paymentAccounts: SupplierPaymentAccount[];
  }>): Observable<Provider> {
    return this.apiService.put<Provider>(`/suppliers/${id}`, data).pipe(
      map(response => {
        if (response.success && response.data) {
          return mapProviderFromAPI(response.data);
        }
        throw new Error(response.message || 'Error al actualizar proveedor');
      })
    );
  }

  /**
   * Elimina un proveedor (y sus deudas y pagos relacionados en el backend)
   */
  delete(id: number): Observable<void> {
    return this.apiService.delete<void>(`/suppliers/${id}`).pipe(
      map(response => {
        if (!response.success && response.message) {
          throw new Error(response.message);
        }
      })
    );
  }

  /**
   * Elimina una deuda por ID (DELETE /api/debts/:id)
   */
  deleteDebt(debtId: number): Observable<void> {
    return this.apiService.delete<void>(`/debts/${debtId}`).pipe(
      map(response => {
        if (!response.success && response.message) {
          throw new Error(response.message);
        }
      })
    );
  }

  /**
   * Obtiene las deudas de un proveedor
   */
  getDebts(id: number, params?: DebtListParams): Observable<PaginatedResponse<Debt>> {
    return this.apiService.get<Debt[]>(`/suppliers/${id}/debts`, params).pipe(
      map(response => {
        if (response.success && response.data) {
          return {
            ...response,
            data: response.data.map(debt => ({
              ...debt,
              dueDate: parseLocalDate(debt.dueDate),
              createdAt: debt.createdAt ? new Date(debt.createdAt) : undefined,
              updatedAt: debt.updatedAt ? new Date(debt.updatedAt) : undefined
            }))
          } as PaginatedResponse<Debt>;
        }
        throw new Error(response.message || 'Error al obtener deudas');
      })
    );
  }

  /**
   * Obtiene los pagos de un proveedor
   */
  getPayments(id: number, page?: number, limit?: number): Observable<PaginatedResponse<Payment>> {
    const params: Record<string, any> = {};
    if (page) params['page'] = page;
    if (limit) params['limit'] = limit;

    return this.apiService.get<Payment[]>(`/suppliers/${id}/payments`, params).pipe(
      map(response => {
        if (response.success && response.data) {
          return {
            ...response,
            data: response.data.map(this.mapPaymentFromAPI)
          } as PaginatedResponse<Payment>;
        }
        throw new Error(response.message || 'Error al obtener pagos');
      })
    );
  }

  /**
   * Busca proveedores (wrapper de list con search)
   */
  search(query: string, page?: number, limit?: number): Observable<PaginatedResponse<Provider>> {
    return this.list({ search: query, page, limit });
  }

  /**
   * Mapea un pago desde la API
   */
  private mapPaymentFromAPI(apiPayment: any): Payment {
    return {
      id: apiPayment.id,
      debtId: apiPayment.debtId,
      supplierId: apiPayment.supplierId,
      supplier: apiPayment.supplier,
      amount: apiPayment.amount,
      paymentMethod: this.mapPaymentMethod(apiPayment.paymentMethod),
      senderName: apiPayment.senderName,
      confirmationNumber: apiPayment.confirmationNumber,
      paymentDate: parseLocalDate(apiPayment.paymentDate),
      receiptFiles: apiPayment.receiptFiles ?? (apiPayment.receiptFile ? [apiPayment.receiptFile] : []),
      verified: apiPayment.verified,
      destinationAccount: apiPayment.destinationAccount ?? null,
      createdBy: apiPayment.createdBy,
      createdByUser: apiPayment.createdByUser,
      createdAt: apiPayment.createdAt ? new Date(apiPayment.createdAt) : undefined,
      updatedAt: apiPayment.updatedAt ? new Date(apiPayment.updatedAt) : undefined
    };
  }

  /**
   * Mapea el método de pago desde la API
   */
  private mapPaymentMethod(method: string): Payment['paymentMethod'] {
    const mapping: Record<string, Payment['paymentMethod']> = {
      ZELLE: 'Zelle',
      TRANSFER: 'Transferencia',
      PAGO_MOVIL: 'Pago Móvil',
      CASH: 'Efectivo'
    };
    return mapping[method] || 'Efectivo';
  }
}


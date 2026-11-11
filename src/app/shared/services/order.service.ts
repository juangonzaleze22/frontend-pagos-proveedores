import { Injectable } from '@angular/core';
import { Observable, from, map, switchMap } from 'rxjs';
import { ApiService } from './api.service';
import { ProviderOrder, OrderDetail } from '../models/provider.model';
import { ApiResponse, PaginatedResponse } from '../models/api-response.model';
import { parseLocalDate } from '../utils/date.utils';
import { optimizeImageFiles } from '../utils/image.utils';

export interface CreateOrderData {
  supplierId: number;
  title?: string;
  amount: number;
  dispatchDate: Date;
  creditDays: number;
  /** Saldo excedente (créditos) a aplicar a esta deuda. Opcional, ≥ 0, ≤ amount y ≤ saldo disponible del proveedor */
  surplusAmountToApply?: number;
  /** Facturas nuevas a adjuntar (máx. 2). */
  invoiceFiles?: File[];
  /** URLs de facturas existentes que se conservan (modo edición). */
  existingInvoiceFiles?: string[];
  /** Eliminar todas las facturas del pedido. */
  removeInvoice?: boolean;
}

export interface UpdateOrderData {
  title?: string;
  dispatchDate: Date;
  creditDays: number;
  amount: number;
  /** Nuevo total de excedente a aplicar a la deuda (≥ 0, ≤ amount; incrementos ≤ saldo disponible del proveedor) */
  surplusAmountToApply?: number;
  /** Facturas nuevas a adjuntar (máx. 2). */
  invoiceFiles?: File[];
  /** URLs de facturas existentes que se conservan. */
  existingInvoiceFiles?: string[];
  /** Eliminar todas las facturas del pedido. */
  removeInvoice?: boolean;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  constructor(private apiService: ApiService) {}

  /**
   * Crea un nuevo pedido
   */
  create(data: CreateOrderData): Observable<ProviderOrder> {
    return from(this.prepareInvoiceImages(data)).pipe(
      switchMap((prepared) => this.buildCreateRequest(prepared))
    );
  }

  private async prepareInvoiceImages<T extends { invoiceFiles?: File[] }>(data: T): Promise<T> {
    const invoiceFiles = data.invoiceFiles?.length
      ? await optimizeImageFiles(data.invoiceFiles)
      : data.invoiceFiles;
    return { ...data, invoiceFiles };
  }

  private buildCreateRequest(data: CreateOrderData): Observable<ProviderOrder> {
    const formData = new FormData();
    formData.append('supplierId', data.supplierId.toString());
    formData.append('amount', data.amount.toString());
    formData.append('dispatchDate', data.dispatchDate.toISOString().split('T')[0]); // YYYY-MM-DD
    formData.append('creditDays', data.creditDays.toString());

    if (data.title != null && data.title !== '') {
      formData.append('title', data.title);
    }
    if (data.surplusAmountToApply != null && data.surplusAmountToApply > 0) {
      formData.append('surplusAmountToApply', data.surplusAmountToApply.toString());
    }

    (data.invoiceFiles || []).slice(0, 2).forEach((file) => {
      if (file instanceof File) {
        formData.append('invoiceFiles', file, file.name);
      }
    });

    return this.apiService.postFormData<ProviderOrder>('/orders', formData).pipe(
      map(response => {
        if (response.success && response.data) {
          return this.mapOrderFromAPI(response.data);
        }
        throw new Error(response.message || 'Error al crear pedido');
      })
    );
  }

  /**
   * Lista pedidos con paginación
   */
  list(page?: number, limit?: number): Observable<PaginatedResponse<ProviderOrder>> {
    const params: Record<string, any> = {};
    if (page) params['page'] = page;
    if (limit) params['limit'] = limit;

    return this.apiService.get<ProviderOrder[]>('/orders', params).pipe(
      map(response => {
        if (response.success && response.data) {
          return {
            ...response,
            data: response.data.map(order => this.mapOrderFromAPI(order))
          } as PaginatedResponse<ProviderOrder>;
        }
        throw new Error(response.message || 'Error al listar pedidos');
      })
    );
  }

  /**
   * Actualiza un pedido existente (PUT /api/orders/:id)
   */
  update(id: number, data: UpdateOrderData): Observable<ProviderOrder> {
    return from(this.prepareInvoiceImages(data)).pipe(
      switchMap((prepared) => this.buildUpdateRequest(id, prepared))
    );
  }

  private buildUpdateRequest(id: number, data: UpdateOrderData): Observable<ProviderOrder> {
    const formData = new FormData();
    formData.append('dispatchDate', data.dispatchDate.toISOString().split('T')[0]);
    formData.append('creditDays', data.creditDays.toString());
    formData.append('amount', data.amount.toString());
    formData.append('title', data.title ?? '');

    if (data.surplusAmountToApply !== undefined) {
      formData.append('surplusAmountToApply', data.surplusAmountToApply.toString());
    }

    if (data.removeInvoice) {
      formData.append('removeInvoice', 'true');
    }

    (data.existingInvoiceFiles || []).forEach((url) => {
      formData.append('existingInvoiceFiles', url);
    });

    (data.invoiceFiles || []).slice(0, 2).forEach((file) => {
      if (file instanceof File) {
        formData.append('invoiceFiles', file, file.name);
      }
    });

    return this.apiService.putFormData<ProviderOrder>(`/orders/${id}`, formData).pipe(
      map(response => {
        if (response.success && response.data) {
          return this.mapOrderFromAPI(response.data);
        }
        throw new Error(response.message || 'Error al actualizar pedido');
      })
    );
  }

  /**
   * Obtiene un pedido por ID (detalle completo con supplier y debt)
   */
  getById(id: number): Observable<OrderDetail> {
    return this.apiService.get<OrderDetail>(`/orders/${id}`).pipe(
      map(response => {
        if (response.success && response.data) {
          return this.mapOrderDetailFromAPI(response.data);
        }
        throw new Error(response.message || 'Pedido no encontrado');
      })
    );
  }

  /**
   * Obtiene pedidos por proveedor
   */
  getBySupplier(supplierId: number): Observable<ProviderOrder[]> {
    return this.apiService.get<ProviderOrder[]>(`/orders/supplier/${supplierId}`).pipe(
      map(response => {
        if (response.success && response.data) {
          return response.data.map(order => this.mapOrderFromAPI(order));
        }
        throw new Error(response.message || 'Error al obtener pedidos del proveedor');
      })
    );
  }

  /**
   * Mapea un pedido desde la API
   */
  private mapOrderFromAPI(apiOrder: any): ProviderOrder {
    return {
      id: apiOrder.id,
      supplierId: apiOrder.supplierId,
      title: apiOrder.title ?? apiOrder.titulo ?? undefined,
      amount: apiOrder.amount,
      dispatchDate: parseLocalDate(apiOrder.dispatchDate),
      creditDays: apiOrder.creditDays,
      dueDate: parseLocalDate(apiOrder.dueDate),
      invoiceFiles: apiOrder.invoiceFiles ?? [],
      createdAt: apiOrder.createdAt ? new Date(apiOrder.createdAt) : undefined
    };
  }

  /**
   * Mapea un detalle de pedido desde la API (incluye supplier y debt)
   */
  private mapOrderDetailFromAPI(apiOrder: any): OrderDetail {
    return {
      id: apiOrder.id,
      supplierId: apiOrder.supplierId,
      title: apiOrder.title ?? apiOrder.titulo ?? undefined,
      supplier: apiOrder.supplier,
      amount: apiOrder.amount,
      dispatchDate: parseLocalDate(apiOrder.dispatchDate),
      creditDays: apiOrder.creditDays,
      dueDate: parseLocalDate(apiOrder.dueDate),
      invoiceFiles: apiOrder.invoiceFiles ?? [],
      debt: apiOrder.debt,
      createdBy: apiOrder.createdBy,
      createdAt: apiOrder.createdAt ? new Date(apiOrder.createdAt) : undefined,
      updatedAt: apiOrder.updatedAt ? new Date(apiOrder.updatedAt) : undefined
    };
  }
}


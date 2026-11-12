import { Component, Input, Output, EventEmitter, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { Payment } from '../../../models/payment.model';
import { PaymentService } from '../../../services/payment.service';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { AppCard } from '../../layout/app-card/app-card';
import { LazyImage } from '../lazy-image/lazy-image';
import { FormatUsdPipe } from '../../../pipes/format-usd.pipe';

@Component({
  selector: 'app-payment-detail-dialog',
  standalone: true,
  imports: [CommonModule, DialogModule, ButtonModule, ToastModule, AppCard, LazyImage, FormatUsdPipe],
  providers: [MessageService],
  templateUrl: './payment-detail-dialog.html',
  styleUrl: './payment-detail-dialog.scss'
})
export class PaymentDetailDialog {
  _visible = signal(false);
  _paymentId = signal<number | null>(null);
  payment = signal<Payment | null>(null);
  loading = signal<boolean>(false);

  @Input()
  set visible(value: boolean) {
    this._visible.set(value);
    if (value && this._paymentId()) {
      this.loadPaymentDetail();
    }
  }
  get visible(): boolean {
    return this._visible();
  }

  @Input()
  set paymentId(value: number | null) {
    this._paymentId.set(value);
    if (value && this._visible()) {
      this.loadPaymentDetail();
    }
  }
  get paymentId(): number | null {
    return this._paymentId();
  }

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() onClose = new EventEmitter<void>();

  paymentTitle = computed(() => {
    const payment = this.payment();
    return payment ? `Pago #${payment.id}` : 'Detalle de Pago';
  });

  paymentStatus = computed(() => {
    const payment = this.payment();
    if (!payment) return 'unknown';
    if (payment.deleted) return 'deleted';
    if (payment.verified) return 'verified';
    return 'pending';
  });

  constructor(
    private paymentService: PaymentService,
    private messageService: MessageService
  ) {}

  private loadPaymentDetail() {
    const paymentId = this._paymentId();
    if (!paymentId) {
      return;
    }

    this.loading.set(true);
    this.paymentService.getById(paymentId).subscribe({
      next: (paymentDetail) => {
        this.payment.set(paymentDetail);
        this.loading.set(false);
      },
      error: (error) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Error al cargar el detalle del pago'
        });
        this.loading.set(false);
        this.onDialogClose();
      }
    });
  }

  onDialogClose() {
    this._visible.set(false);
    this.payment.set(null);
    this.visibleChange.emit(false);
    this.onClose.emit();
  }

  getPaymentMethodLabel(method: string): string {
    return method;
  }

  getPaymentMethodIcon(method: string): string {
    const iconMap: Record<string, string> = {
      'Zelle': 'pi pi-wallet',
      'Transferencia': 'pi pi-credit-card',
      'Pago Móvil': 'pi pi-mobile',
      'Efectivo': 'pi pi-money-bill'
    };
    return iconMap[method] || 'pi pi-circle';
  }

  getAccountTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      PAGO_MOVIL: 'Pago Móvil',
      ZELLE: 'Zelle',
      TRANSFER: 'Transferencia'
    };
    return labels[type] || type;
  }

  getAccountIcon(type: string): string {
    const icons: Record<string, string> = {
      PAGO_MOVIL: 'pi pi-mobile',
      ZELLE: 'pi pi-wallet',
      TRANSFER: 'pi pi-credit-card'
    };
    return icons[type] || 'pi pi-money-bill';
  }

  getAccountMainValue(account: any): string {
    if (account?.type === 'ZELLE') {
      return account.email || account.accountNumber || '';
    }
    if (account?.type === 'PAGO_MOVIL') {
      return account.phone || account.accountNumber || '';
    }
    return account?.accountNumber || '';
  }

  onPrint() {
    window.print();
  }

  onShare() {
    const payment = this.payment();
    if (!payment) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Advertencia',
        detail: 'No se puede compartir un pago que no existe'
      });
      return;
    }

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

        // Actualizar el pago local con los nuevos valores
        this.payment.set(response.payment);

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

  onDownloadReceipt() {
    const payment = this.payment();
    if (payment?.receiptFiles && payment.receiptFiles.length > 0) {
      payment.receiptFiles.forEach((url, index) => {
        const link = document.createElement('a');
        link.href = url;
        const suffix = payment.receiptFiles.length > 1 ? `_${index + 1}` : '';
        link.download = `comprobante_PAG-${payment.id}${suffix}.jpg`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    }
  }
}



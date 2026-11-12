import { Component, signal, OnInit, ViewChild } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AppHeader } from '../shared/components/layout/app-header/app-header';
import { PageContainer } from '../shared/components/layout/page-container/page-container';
import { AppCard } from '../shared/components/layout/app-card/app-card';
import { ApiMessageDialog, ApiMessageData } from '../shared/components/ui/api-message-dialog/api-message-dialog';
import { FileUploadComponent } from '../shared/components/ui/file-upload/file-upload';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { MessageService } from 'primeng/api';
import { SupplierService } from '../shared/services/supplier.service';
import { Provider, SupplierPaymentAccount } from '../shared/models/provider.model';
import { AuthContext } from '../contexts/auth.context';

@Component({
  selector: 'app-register-provider',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppHeader,
    PageContainer,
    AppCard,
    ApiMessageDialog,
    FileUploadComponent,
    InputTextModule,
    InputNumberModule,
    DatePickerModule,
    ButtonModule,
    ToastModule,
    IconFieldModule,
    InputIconModule
  ],
  providers: [MessageService],
  templateUrl: './register-provider.html',
  styleUrl: './register-provider.scss'
})
export class RegisterProvider implements OnInit {
  providerForm: FormGroup;
  fechaVencimiento = signal<Date | null>(null);
  loading = signal<boolean>(false);
  showMessageDialog = signal(false);
  messageData = signal<ApiMessageData | null>(null);
  isEditMode = signal<boolean>(false);
  pageTitle = signal<string>('Registro de Proveedores');
  pageSubtitle = signal<string>('Ingrese la información del nuevo proveedor y sus deudas pendientes');
  providerId = signal<number | null>(null);
  invoiceFiles: File[] = [];

  @ViewChild('invoiceUpload') invoiceUploadComponent?: FileUploadComponent;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private supplierService: SupplierService,
    private messageService: MessageService,
    private location: Location,
    private authContext: AuthContext
  ) {
    this.providerForm = this.fb.group({
      nombre: ['', [Validators.required]],
      rif: ['', []],
      phone: ['', []],
      email: ['', []],
      titulo: [''],
      deudaInicial: ['', [Validators.required, Validators.min(0.01)]],
      fechaDeuda: ['', [Validators.required]],
      diasCredito: [30, [Validators.required, Validators.min(0)]],
      // Cuentas de pago
      pagoMovilEnabled: [false],
      pagoMovilBanco: [''],
      pagoMovilTelefono: [''],
      pagoMovilCedula: [''],
      pagoMovilTitular: [''],
      zelleEnabled: [false],
      zelleEmail: [''],
      zelleTitular: [''],
      transferenciaEnabled: [false],
      transferenciaBanco: [''],
      transferenciaCuenta: [''],
      transferenciaCedula: [''],
      transferenciaTitular: ['']
    });

    // Calcular fecha de vencimiento cuando cambien fecha deuda o días de crédito
    this.providerForm.get('fechaDeuda')?.valueChanges.subscribe(() => this.calculateDueDate());
    this.providerForm.get('diasCredito')?.valueChanges.subscribe(() => this.calculateDueDate());

    this.setupPaymentAccountValidators();
  }

  /**
   * Aplica/retira validadores requeridos según el método de pago habilitado.
   */
  private setupPaymentAccountValidators(): void {
    const rules: Record<string, string[]> = {
      pagoMovilEnabled: ['pagoMovilBanco', 'pagoMovilTelefono', 'pagoMovilCedula', 'pagoMovilTitular'],
      zelleEnabled: ['zelleEmail', 'zelleTitular'],
      transferenciaEnabled: ['transferenciaBanco', 'transferenciaCuenta', 'transferenciaTitular']
    };

    Object.keys(rules).forEach((toggle) => {
      this.providerForm.get(toggle)?.valueChanges.subscribe((enabled: boolean) => {
        rules[toggle].forEach((field) => {
          const control = this.providerForm.get(field);
          control?.setValidators(enabled ? [Validators.required] : []);
          control?.updateValueAndValidity();
        });
        this.providerForm.updateValueAndValidity();
      });
    });
  }

  onInvoiceSelect(files: File[]): void {
    this.invoiceFiles = files || [];
  }

  private getSelectedInvoiceFiles(): File[] {
    return this.invoiceUploadComponent?.getSelectedFiles() ?? this.invoiceFiles ?? [];
  }

  private cleanOptionalValue(value: string | null | undefined): string | null {
    const trimmed = (value ?? '').trim();
    return trimmed === '' ? null : trimmed;
  }

  private buildPaymentAccounts(): SupplierPaymentAccount[] {
    const value = this.providerForm.value;
    const accounts: SupplierPaymentAccount[] = [];

    if (value.pagoMovilEnabled) {
      accounts.push({
        type: 'PAGO_MOVIL',
        bank: this.cleanOptionalValue(value.pagoMovilBanco),
        phone: this.cleanOptionalValue(value.pagoMovilTelefono),
        accountNumber: this.cleanOptionalValue(value.pagoMovilTelefono),
        holderId: this.cleanOptionalValue(value.pagoMovilCedula),
        holderName: this.cleanOptionalValue(value.pagoMovilTitular)
      });
    }

    if (value.zelleEnabled) {
      accounts.push({
        type: 'ZELLE',
        email: this.cleanOptionalValue(value.zelleEmail),
        accountNumber: this.cleanOptionalValue(value.zelleEmail),
        holderName: this.cleanOptionalValue(value.zelleTitular)
      });
    }

    if (value.transferenciaEnabled) {
      accounts.push({
        type: 'TRANSFER',
        bank: this.cleanOptionalValue(value.transferenciaBanco),
        accountNumber: this.cleanOptionalValue(value.transferenciaCuenta),
        holderId: this.cleanOptionalValue(value.transferenciaCedula),
        holderName: this.cleanOptionalValue(value.transferenciaTitular)
      });
    }

    return accounts;
  }

  /**
   * Normaliza a E.164 (+ y hasta 15 dígitos). Vacío → null.
   * El usuario indica el código de país (con + o solo dígitos).
   */
  private getPhoneForPayload(phoneValue: string | null | undefined): string | null {
    const trimmed = (phoneValue ?? '').trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('+')) {
      const digits = trimmed.slice(1).replace(/\D/g, '');
      if (digits.length === 0) return null;
      return '+' + digits.slice(0, 15);
    }
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 0) return null;
    return '+' + digits.slice(0, 15);
  }

  ngOnInit() {
    // Detectar si viene en modo edición
    this.route.queryParams.subscribe(params => {
      const editId = params['editId'];
      if (editId) {
        const id = Number(editId);
        if (!isNaN(id)) {
          // Los cajeros no pueden editar distribuidores
          if (this.authContext.hasRole('CAJERO')) {
            this.messageService.add({
              severity: 'warn',
              summary: 'Sin permisos',
              detail: 'No tiene permisos para editar distribuidores.'
            });
            this.router.navigate(['/providers/locate']);
            return;
          }
          this.isEditMode.set(true);
          this.providerId.set(id);
          this.pageTitle.set('Editar Proveedor');
          this.pageSubtitle.set('Modifique la información del proveedor');
          this.loadProviderForEdit(id);
        }
      }
    });
  }

  private loadProviderForEdit(id: number) {
    this.loading.set(true);
    this.supplierService.getById(id).subscribe({
      next: (provider: Provider) => {
        this.loading.set(false);
        this.populateFormWithProvider(provider);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudo cargar el proveedor para editar'
        });
        // Redirigir a la lista si hay error
        this.router.navigate(['/providers/locate']);
      }
    });
  }

  private populateFormWithProvider(provider: Provider) {
    this.providerForm.patchValue({
      nombre: provider.companyName,
      rif: provider.taxId || '',
      phone : provider.phone || '',
      email: provider.email || ''
    });

    const accounts = provider.paymentAccounts || [];

    const pagoMovil = accounts.find(account => account.type === 'PAGO_MOVIL');
    if (pagoMovil) {
      this.providerForm.patchValue({
        pagoMovilEnabled: true,
        pagoMovilBanco: pagoMovil.bank || '',
        pagoMovilTelefono: pagoMovil.phone || pagoMovil.accountNumber || '',
        pagoMovilCedula: pagoMovil.holderId || '',
        pagoMovilTitular: pagoMovil.holderName || ''
      });
    }

    const zelle = accounts.find(account => account.type === 'ZELLE');
    if (zelle) {
      this.providerForm.patchValue({
        zelleEnabled: true,
        zelleEmail: zelle.email || zelle.accountNumber || '',
        zelleTitular: zelle.holderName || ''
      });
    }

    const transferencia = accounts.find(account => account.type === 'TRANSFER');
    if (transferencia) {
      this.providerForm.patchValue({
        transferenciaEnabled: true,
        transferenciaBanco: transferencia.bank || '',
        transferenciaCuenta: transferencia.accountNumber || '',
        transferenciaCedula: transferencia.holderId || '',
        transferenciaTitular: transferencia.holderName || ''
      });
    }

    // Reaplicar validadores después de cargar los datos
    this.providerForm.updateValueAndValidity();
  }


  get isLoading() {
    return this.loading();
  }

  calculateDueDate() {
    const fechaDeuda = this.providerForm.get('fechaDeuda')?.value;
    const diasCredito = this.providerForm.get('diasCredito')?.value || 0;

    if (fechaDeuda && diasCredito) {
      const fecha = new Date(fechaDeuda);
      fecha.setDate(fecha.getDate() + diasCredito);
      this.fechaVencimiento.set(fecha);
    } else {
      this.fechaVencimiento.set(null);
    }
  }

  onSubmit() {
    if (this.providerForm.valid) {
      this.loading.set(true);
      const formValue = this.providerForm.value;
      
      const isEdit = this.isEditMode();
      const providerId = this.providerId();
      
      const payload: any = {};

      // En modo edición, solo enviar los campos que se pueden editar según el endpoint
      if (isEdit) {
        // companyName es opcional pero siempre lo incluimos si tiene valor
        if (formValue.nombre) {
          payload.companyName = formValue.nombre;
        }
        
        // taxId es opcional - incluir si tiene valor, o null si se borró
        payload.taxId = formValue.rif && formValue.rif.trim() !== '' ? formValue.rif : null;
        
        // phone es opcional
        payload.phone = this.getPhoneForPayload(formValue.phone);
        payload.email = formValue.email && formValue.email.trim() !== '' ? formValue.email.trim() : null;

        payload.paymentAccounts = this.buildPaymentAccounts();
      } else {
        // En modo creación, usar la lógica original
        payload.companyName = formValue.nombre;

        if (formValue.rif) {
          payload.taxId = formValue.rif;
        }

        payload.phone = this.getPhoneForPayload(formValue.phone);
        if (formValue.email && formValue.email.trim() !== '') {
          payload.email = formValue.email.trim();
        }

        payload.paymentAccounts = this.buildPaymentAccounts();

        // Si se proporciona deuda inicial, incluirla (solo en modo creación)
        if (formValue.deudaInicial && formValue.fechaDeuda) {
          payload.initialDebtAmount = formValue.deudaInicial;
          payload.debtDate = formValue.fechaDeuda.toISOString().split('T')[0];
          payload.creditDays = formValue.diasCredito || 30;
          if (formValue.titulo?.trim()) {
            payload.title = formValue.titulo.trim();
          }
        }
      }

      const operation = isEdit && providerId
        ? this.supplierService.update(providerId, payload)
        : this.supplierService.createWithFiles(payload, this.getSelectedInvoiceFiles());

      operation.subscribe({
        next: () => {
          this.loading.set(false);
          
          if (isEdit) {
            // En modo edición, mostrar mensaje y redirigir
            this.messageData.set({
              success: true,
              message: 'Proveedor actualizado correctamente'
            });
            this.showMessageDialog.set(true);
          } else {
            // En modo creación, resetear el formulario completamente
            this.providerForm.reset({
              nombre: '',
              rif: '',
              phone: '',
              email: '',
              titulo: '',
              deudaInicial: '',
              fechaDeuda: '',
              diasCredito: 30,
              pagoMovilEnabled: false,
              pagoMovilBanco: '',
              pagoMovilTelefono: '',
              pagoMovilCedula: '',
              pagoMovilTitular: '',
              zelleEnabled: false,
              zelleEmail: '',
              zelleTitular: '',
              transferenciaEnabled: false,
              transferenciaBanco: '',
              transferenciaCuenta: '',
              transferenciaCedula: '',
              transferenciaTitular: ''
            });
            
            // Resetear validaciones y estado del formulario
            Object.keys(this.providerForm.controls).forEach(key => {
              const control = this.providerForm.get(key);
              control?.setErrors(null);
              control?.markAsUntouched();
              control?.markAsPristine();
            });
            
            // Resetear fecha de vencimiento y facturas
            this.fechaVencimiento.set(null);
            this.invoiceFiles = [];
            this.invoiceUploadComponent?.clear();
            
            // Marcar el formulario como no enviado
            this.providerForm.markAsPristine();
            this.providerForm.markAsUntouched();
            
            // Mostrar modal de éxito
            this.messageData.set({
              success: true,
              message: 'Proveedor registrado correctamente'
            });
            this.showMessageDialog.set(true);
          }
        },
        error: (error) => {
          this.loading.set(false);

          // Extraer información del error de la API
          let message = error.message || `Error al ${isEdit ? 'actualizar' : 'registrar'} el proveedor`;
          let errors: any[] = [];
          
          if (error.response) {
            // Si hay una respuesta estructurada de la API
            message = error.response.message || message;
            if (error.response.errors && Array.isArray(error.response.errors)) {
              errors = error.response.errors;
            }
          } else if (error.error) {
            // Si el error viene en error.error
            if (error.error.message) {
              message = error.error.message;
            }
            if (error.error.errors && Array.isArray(error.error.errors)) {
              errors = error.error.errors;
            }
          }
          
          // Mostrar modal de error
          this.messageData.set({
            success: false,
            message: message,
            errors: errors.length > 0 ? errors : undefined
          });
          this.showMessageDialog.set(true);
        }
      });
    }
  }

  onCancel() {
    this.location.back();
  }

  onMessageDialogClose() {
    const wasSuccess = this.messageData()?.success;
    const isEdit = this.isEditMode();
    
    this.showMessageDialog.set(false);
    this.messageData.set(null);
    
    // Si está en modo edición y el mensaje fue exitoso, redirigir a locate-provider
    if (isEdit && wasSuccess) {
      this.router.navigate(['/providers/locate']);
    }
  }
}

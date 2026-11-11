import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ColorPickerModule } from 'primeng/colorpicker';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { AppHeader } from '../../shared/components/layout/app-header/app-header';
import { PageContainer } from '../../shared/components/layout/page-container/page-container';
import { AppCard } from '../../shared/components/layout/app-card/app-card';
import { FileUploadComponent } from '../../shared/components/ui/file-upload/file-upload';
import { BrandingService } from '../../shared/services/branding.service';
import { optimizeImageFile } from '../../shared/utils/image.utils';

@Component({
  selector: 'app-branding-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppHeader,
    PageContainer,
    AppCard,
    FileUploadComponent,
    ButtonModule,
    CheckboxModule,
    ColorPickerModule,
    InputTextModule,
    ToastModule
  ],
  providers: [MessageService],
  templateUrl: './branding-settings.html',
  styleUrl: './branding-settings.scss'
})
export class BrandingSettings implements OnInit {
  public branding = inject(BrandingService);
  private messageService = inject(MessageService);

  @ViewChild('logoUpload') logoUpload?: FileUploadComponent;
  @ViewChild('faviconUpload') faviconUpload?: FileUploadComponent;

  saving = signal(false);
  logoFile = signal<File | null>(null);
  faviconFile = signal<File | null>(null);
  removeLogo = false;
  removeFavicon = false;

  form = {
    appName: '',
    companyName: '',
    loginTitle: '',
    loginSubtitle: '',
    reportTitle: '',
    footerText: '',
    primaryColor: '#3b82f6',
    accentColor: '#2563eb'
  };

  ngOnInit(): void {
    this.patchForm();
  }

  private patchForm(): void {
    const config = this.branding.config();
    this.form = {
      appName: config.appName ?? '',
      companyName: config.companyName ?? '',
      loginTitle: config.loginTitle ?? '',
      loginSubtitle: config.loginSubtitle ?? '',
      reportTitle: config.reportTitle ?? '',
      footerText: config.footerText ?? '',
      primaryColor: config.primaryColor ?? '#3b82f6',
      accentColor: config.accentColor ?? '#2563eb'
    };
    this.logoFile.set(null);
    this.faviconFile.set(null);
    this.removeLogo = false;
    this.removeFavicon = false;
  }

  private readonly hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

  isValidHex(value: string): boolean {
    return this.hexPattern.test(this.normalizeDraft(value));
  }

  /** Acepta "#rgb", "rgb", "#rrggbb" y "rrggbb"; normaliza a #RRGGBB al salir del campo. */
  normalizeColor(field: 'primaryColor' | 'accentColor'): void {
    let value = this.normalizeDraft(this.form[field]);
    if (/^#[0-9a-fA-F]{3}$/.test(value)) {
      value = '#' + value.slice(1).split('').map((char) => char + char).join('');
    }
    this.form[field] = this.hexPattern.test(value) ? value.toUpperCase() : value;
  }

  private normalizeDraft(value: string): string {
    let result = (value ?? '').trim();
    if (!result) return '';
    if (!result.startsWith('#')) result = `#${result}`;
    return result;
  }

  /** Color utilizable en estilos mientras se escribe (o gris si aún es inválido). */
  safeColor(value: string): string {
    let result = this.normalizeDraft(value);
    if (/^#[0-9a-fA-F]{3}$/.test(result)) {
      result = '#' + result.slice(1).split('').map((char) => char + char).join('');
    }
    return this.hexPattern.test(result) ? result : '#94a3b8';
  }

  onLogoSelect(files: File[]): void {
    this.logoFile.set(files[0] ?? null);
    if (files.length > 0) this.removeLogo = false;
  }

  onFaviconSelect(files: File[]): void {
    this.faviconFile.set(files[0] ?? null);
    if (files.length > 0) this.removeFavicon = false;
  }

  async save(): Promise<void> {
    if (this.saving()) return;

    if (!this.form.appName.trim() || !this.form.companyName.trim()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Datos incompletos',
        detail: 'El nombre de la aplicación y de la empresa son obligatorios.'
      });
      return;
    }

    this.normalizeColor('primaryColor');
    this.normalizeColor('accentColor');
    if (!this.isValidHex(this.form.primaryColor) || !this.isValidHex(this.form.accentColor)) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Color inválido',
        detail: 'Usa un color hexadecimal con formato #RRGGBB (ej. #3B82F6).'
      });
      return;
    }

    const formData = new FormData();
    formData.append('appName', this.form.appName.trim());
    formData.append('companyName', this.form.companyName.trim());
    formData.append('loginTitle', this.form.loginTitle.trim());
    formData.append('loginSubtitle', this.form.loginSubtitle.trim());
    formData.append('reportTitle', this.form.reportTitle.trim());
    formData.append('footerText', this.form.footerText.trim());
    formData.append('primaryColor', this.form.primaryColor);
    formData.append('accentColor', this.form.accentColor);

    const logo = this.logoFile();
    if (logo) {
      const optimizedLogo = await optimizeImageFile(logo, {
        maxWidth: 512,
        maxHeight: 512,
        quality: 0.9
      });
      formData.append('logo', optimizedLogo);
    }
    if (this.removeLogo) formData.append('removeLogo', 'true');

    const favicon = this.faviconFile();
    if (favicon) formData.append('favicon', favicon);
    if (this.removeFavicon) formData.append('removeFavicon', 'true');

    const hadLogoFile = !!this.logoFile();
    const hadFaviconFile = !!this.faviconFile();

    this.saving.set(true);
    this.branding.save(formData).subscribe({
      next: (response) => {
        this.saving.set(false);
        this.patchForm();
        if (hadLogoFile) this.logoUpload?.clear();
        if (hadFaviconFile) this.faviconUpload?.clear();
        this.messageService.add({
          severity: 'success',
          summary: 'Guardado',
          detail: response.message || 'Configuración de marca actualizada'
        });
      },
      error: (error) => {
        this.saving.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error?.message || 'No se pudo guardar la configuración'
        });
      }
    });
  }

  restore(): void {
    const hadLogoFile = !!this.logoFile();
    const hadFaviconFile = !!this.faviconFile();
    this.saving.set(true);
    this.branding.reload().then(() => {
      this.patchForm();
      if (hadLogoFile) this.logoUpload?.clear();
      if (hadFaviconFile) this.faviconUpload?.clear();
      this.saving.set(false);
      this.messageService.add({
        severity: 'info',
        summary: 'Restaurado',
        detail: 'Se recargó la configuración actual del servidor.'
      });
    });
  }
}

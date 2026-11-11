import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom, timeout, catchError, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { BrandingConfig, DEFAULT_BRANDING } from '../models/branding.model';

type ColorScale = Record<'50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | '950', string>;

const FALLBACK_LOGO = 'images/logo.png';
const FALLBACK_FAVICON = 'images/logo-orange.png';

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let value = hex.replace('#', '').trim();
  if (value.length === 3) {
    value = value.split('').map((c) => c + c).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mix(hex: string, target: string, weight: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  if (!a || !b) return hex;
  return rgbToHex(
    a.r + (b.r - a.r) * weight,
    a.g + (b.g - a.g) * weight,
    a.b + (b.b - a.b) * weight
  );
}

/** Luminancia relativa (WCAG) para decidir texto claro u oscuro. */
function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** Texto legible sobre un fondo de color: blanco si es oscuro, gris oscuro si es claro. */
export function contrastText(backgroundHex: string): string {
  return relativeLuminance(backgroundHex) > 0.5 ? '#1f2937' : '#ffffff';
}

function buildScale(primary: string): ColorScale {
  return {
    '50': mix(primary, '#ffffff', 0.92),
    '100': mix(primary, '#ffffff', 0.84),
    '200': mix(primary, '#ffffff', 0.68),
    '300': mix(primary, '#ffffff', 0.48),
    '400': mix(primary, '#ffffff', 0.24),
    '500': primary,
    '600': mix(primary, '#000000', 0.12),
    '700': mix(primary, '#000000', 0.26),
    '800': mix(primary, '#000000', 0.4),
    '900': mix(primary, '#000000', 0.52),
    '950': mix(primary, '#000000', 0.64)
  };
}

@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly configState = signal<BrandingConfig>(DEFAULT_BRANDING);
  readonly config = this.configState.asReadonly();

  readonly appName = computed(() => this.configState().appName);
  readonly companyName = computed(() => this.configState().companyName);
  readonly loginTitle = computed(() => this.configState().loginTitle);
  readonly loginSubtitle = computed(() => this.configState().loginSubtitle);
  readonly reportTitle = computed(() => this.configState().reportTitle);
  readonly primaryColor = computed(() => this.configState().primaryColor);
  readonly accentColor = computed(() => this.configState().accentColor);

  /** Color de texto legible para un fondo dado (para previews y botones). */
  contrastColor(backgroundHex: string): string {
    return contrastText(backgroundHex);
  }

  readonly logoUrl = computed(() => this.resolveAsset(this.configState().logoPath, FALLBACK_LOGO));
  readonly faviconUrl = computed(() => this.resolveAsset(this.configState().faviconPath, FALLBACK_FAVICON));

  readonly footerText = computed(() => {
    const configured = this.configState().footerText?.trim();
    if (configured) return configured;
    const year = new Date().getFullYear();
    return `© ${year} Sistema de Gestión de pagos de proveedores. ${this.configState().companyName}.`;
  });

  /** Carga la configuración pública y aplica el tema. Nunca bloquea el arranque por un fallo de red. */
  async init(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http
          .get<ApiResponse<BrandingConfig>>(`${environment.apiUrl}/branding`)
          .pipe(
            timeout(4000),
            catchError(() => of(null))
          )
      );

      if (response?.success && response.data) {
        this.configState.set({ ...DEFAULT_BRANDING, ...response.data });
      }
    } catch {
      // Se mantiene el branding por defecto.
    }

    this.apply();
  }

  save(formData: FormData): Observable<ApiResponse<BrandingConfig>> {
    return this.http
      .put<ApiResponse<BrandingConfig>>(`${environment.apiUrl}/branding`, formData)
      .pipe(
        tap((response) => {
          if (response?.success && response.data) {
            this.configState.set({ ...DEFAULT_BRANDING, ...response.data });
            this.apply();
          }
        })
      );
  }

  reload(): Promise<void> {
    return this.init();
  }

  private resolveAsset(path: string | null | undefined, fallback: string): string {
    const value = path?.trim();
    if (!value) return fallback;
    if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value;

    const apiBase = (environment.apiUrl || '').replace(/\/api\/?$/, '');
    if (value.startsWith('/uploads')) return `${apiBase}${value}`;
    return value;
  }

  private apply(): void {
    if (!isPlatformBrowser(this.platformId) || typeof document === 'undefined') return;

    const { appName, primaryColor, accentColor } = this.configState();
    const scale = buildScale(primaryColor);
    const root = document.documentElement;

    for (const [step, hex] of Object.entries(scale)) {
      const rgb = hexToRgb(hex);
      if (rgb) {
        // Tailwind consume tripletas RGB: rgb(var(--brand-500) / <alpha-value>)
        root.style.setProperty(`--brand-${step}`, `${rgb.r} ${rgb.g} ${rgb.b}`);
      }
      // PrimeNG consume valores hex directamente.
      root.style.setProperty(`--p-primary-${step}`, hex);
    }

    const onPrimary = contrastText(primaryColor);
    root.style.setProperty('--brand-accent', accentColor);
    root.style.setProperty('--p-primary-color', primaryColor);
    // PrimeNG usa ambos nombres según la versión/token; mantenerlos sincronizados.
    root.style.setProperty('--p-primary-color-text', onPrimary);
    root.style.setProperty('--p-primary-contrast-color', onPrimary);

    if (appName) {
      document.title = appName;
    }

    this.setLinkHref('icon', this.faviconUrl());
    this.setLinkHref('apple-touch-icon', this.faviconUrl());

    let themeMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.setAttribute('name', 'theme-color');
      document.head.appendChild(themeMeta);
    }
    themeMeta.setAttribute('content', primaryColor);
  }

  private setLinkHref(rel: string, href: string): void {
    if (!href) return;
    let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', rel);
      document.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }
}

export interface BrandingConfig {
  id: number;
  appName: string;
  companyName: string;
  loginTitle: string;
  loginSubtitle: string;
  footerText: string | null;
  reportTitle: string;
  logoPath: string | null;
  faviconPath: string | null;
  primaryColor: string;
  accentColor: string;
  updatedAt?: string;
}

export const DEFAULT_BRANDING: BrandingConfig = {
  id: 0,
  appName: 'Gestión de Pagos',
  companyName: 'Mi Empresa',
  loginTitle: 'Gestión de Pagos',
  loginSubtitle: 'Bienvenido al portal corporativo',
  footerText: null,
  reportTitle: 'Reporte de Pagos a Proveedor',
  logoPath: null,
  faviconPath: null,
  primaryColor: '#3b82f6',
  accentColor: '#2563eb'
};

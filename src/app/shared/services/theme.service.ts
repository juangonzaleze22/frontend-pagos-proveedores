import { Injectable, signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const STORAGE_KEY = 'app-theme';
const LEGACY_STORAGE_KEY = 'vencedora-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);

  /** true = modo oscuro, false = modo claro */
  readonly isDark = signal<boolean>(false);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const saved =
        (localStorage.getItem(STORAGE_KEY) as 'dark' | 'light' | null) ??
        (localStorage.getItem(LEGACY_STORAGE_KEY) as 'dark' | 'light' | null);
      const prefersDark = saved === 'dark' || (saved === null && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
      this.apply(prefersDark);
      this.isDark.set(prefersDark);
    }
  }

  toggleTheme(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const next = !this.isDark();
    this.apply(next);
    this.isDark.set(next);
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
  }

  setDark(value: boolean): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.apply(value);
    this.isDark.set(value);
    localStorage.setItem(STORAGE_KEY, value ? 'dark' : 'light');
  }

  private apply(dark: boolean): void {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    if (dark) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }
}

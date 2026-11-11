import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthContext } from '../../../../contexts/auth.context';
import { BrandingService } from '../../../services/branding.service';
import { environment } from '../../../../../environments/environment';
import { ButtonModule } from 'primeng/button';

export interface MenuItem {
  label: string;
  icon: string;
  route: string;
  active?: boolean;
}

@Component({
  selector: 'app-app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, ButtonModule],
  templateUrl: './app-sidebar.html',
  styleUrl: './app-sidebar.scss'
})
export class AppSidebar {
  sidebarVisible = signal<boolean>(false);

  private readonly baseMenuItems: MenuItem[] = [
    { label: 'Dashboard', icon: 'pi pi-th-large', route: '/dashboard' },
    { label: 'Proveedores', icon: 'pi pi-users', route: '/providers/locate' },
    { label: 'Pagos', icon: 'pi pi-wallet', route: '/payments/register' },
    { label: 'Reportes', icon: 'pi pi-chart-bar', route: '/reports/detailed' },
    { label: 'Cierre de Caja', icon: 'pi pi-calculator', route: '/cashier-close' }
  ];

  menuItems: MenuItem[] = [];

  constructor(
    public authContext: AuthContext,
    public branding: BrandingService,
    private router: Router
  ) {
    this.updateActiveRoute();
    this.router.events.subscribe(() => {
      this.updateActiveRoute();
      // Cerrar sidebar móvil al navegar
      this.sidebarVisible.set(false);
    });
  }

  private canManageBranding(): boolean {
    return environment.showBrandingModule && this.authContext.hasRole('ADMINISTRADOR');
  }

  private updateActiveRoute() {
    const currentRoute = this.router.url;
    const items = this.canManageBranding()
      ? [...this.baseMenuItems, { label: 'Apariencia', icon: 'pi pi-palette', route: '/settings/branding' }]
      : [...this.baseMenuItems];

    this.menuItems = items.map(item => ({
      ...item,
      active: currentRoute.startsWith(item.route)
    }));
  }

  get userName(): string {
    const user = this.authContext.user();
    return user?.email?.split('@')[0] || 'Supervisor';
  }

  get userInitials(): string {
    const name = this.userName;
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  logout() {
    this.authContext.logout();
  }

  toggleSidebar() {
    this.sidebarVisible.set(!this.sidebarVisible());
  }

  closeSidebar() {
    this.sidebarVisible.set(false);
  }
}

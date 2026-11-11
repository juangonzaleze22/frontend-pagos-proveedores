import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { brandingAdminGuard } from './core/guards/branding-admin.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login').then(m => m.Login)
  },
  {
    path: '',
    loadComponent: () => import('./shared/components/layout/main-layout/main-layout').then(m => m.MainLayout),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./supervisor-dashboard/supervisor-dashboard').then(m => m.SupervisorDashboard)
      },
      {
        path: 'payments/register',
        loadComponent: () => import('./register-payment/register-payment').then(m => m.RegisterPayment)
      },
      {
        path: 'payments/verify',
        loadComponent: () => import('./payment-verification/payment-verification').then(m => m.PaymentVerification)
      },
      {
        path: 'providers/register',
        loadComponent: () => import('./register-provider/register-provider').then(m => m.RegisterProvider)
      },
      {
        path: 'providers/locate',
        loadComponent: () => import('./locate-provider/locate-provider').then(m => m.LocateProvider)
      },
      {
        path: 'providers/list',
        loadComponent: () => import('./supplier-list/supplier-list').then(m => m.SupplierList)
      },
      {
        path: 'reports/detailed',
        loadComponent: () => import('./payment-report/payment-report').then(m => m.PaymentReport)
      },
      {
        path: 'cashier-close',
        loadComponent: () => import('./cashier-close/cashier-close').then(m => m.CashierClose)
      },
      {
        path: 'settings/branding',
        loadComponent: () => import('./settings/branding/branding-settings').then(m => m.BrandingSettings),
        canActivate: [brandingAdminGuard]
      },
      {
        path: 'payments/:id',
        loadComponent: () => import('./payment-detail/payment-detail').then(m => m.PaymentDetail)
      }
    ]
  },
  {
    path: '**',
    redirectTo: '/login'
  }
];

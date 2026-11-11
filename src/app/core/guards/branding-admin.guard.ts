import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { environment } from '../../../environments/environment';

/** Permite el panel de marca solo al rol ADMINISTRADOR y si el módulo está habilitado. */
export const brandingAdminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!environment.showBrandingModule || !authService.hasRole('ADMINISTRADOR')) {
    return router.createUrlTree(['/dashboard']);
  }

  return true;
};

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthTenantService } from '../services/auth-tenant.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthTenantService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
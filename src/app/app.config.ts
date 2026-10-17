// src/app/app.config.ts
import {
  ApplicationConfig,
  provideZonelessChangeDetection,
  provideAppInitializer,
  inject,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { routes } from './app.routes';
import { AuthTenantService } from './core/services/auth-tenant.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })
    ),
    provideHttpClient(withFetch()),

    // Sync tenant subscription status before the app finishes booting
    provideAppInitializer(() => {
      const auth = inject(AuthTenantService);
      return auth.syncTenantSubscriptionOnBoot();
    }),
  ],
};
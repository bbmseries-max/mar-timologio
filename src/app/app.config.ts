import { ApplicationConfig, ErrorHandler, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import * as Sentry from '@sentry/angular';
import { routes } from './app.routes';
import { registerLocaleData } from '@angular/common';
import localeEl from '@angular/common/locales/el';
import localeElExtra from '@angular/common/locales/extra/el';

registerLocaleData(localeEl, 'el-GR', localeElExtra);
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    {
      provide: ErrorHandler,
      useValue: Sentry.createErrorHandler({
        showDialog: false,
      }),
    },
  ],
};
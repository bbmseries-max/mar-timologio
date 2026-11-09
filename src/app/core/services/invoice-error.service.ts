import { Injectable } from '@angular/core';
import * as Sentry from '@sentry/angular';

export interface MyDataErrorContext {
  tenantVat: string;
  invoiceType: string;
  series?: string;
  invoiceNumber?: number | string;
  rawPayloadSummary?: Record<string, unknown>;
  aadeStatusCode?: string;
}

@Injectable({
  providedIn: 'root'
})
export class InvoiceErrorService {

  public captureMyDataError(error: unknown, context: MyDataErrorContext): void {
    // 1. Always log locally for immediate DevTools debugging
    console.error('[InvoiceErrorService] Captured myDATA Error:', {
      error,
      context
    });

    // 2. Normalize raw payload strings / objects into an Error instance
    let exceptionToLog: Error;
    if (error instanceof Error) {
      exceptionToLog = error;
    } else if (typeof error === 'string') {
      exceptionToLog = new Error(error);
    } else if (error && typeof error === 'object') {
      const msg = (error as any).message || (error as any).error || JSON.stringify(error);
      exceptionToLog = new Error(`[myDATA Rejection] ${msg}`);
    } else {
      exceptionToLog = new Error('[myDATA Rejection] Unknown transmission failure');
    }

    // 3. Dispatch to Sentry with enriched scope tags and context
    try {
      Sentry.withScope((scope) => {
        scope.setTag('app_component', 'maranth-timologio');
        scope.setTag('tenant_vat', context.tenantVat || '067424104');
        scope.setTag('invoice_type', context.invoiceType || 'UNKNOWN');

        if (context.series) {
          scope.setTag('invoice_series', context.series);
        }
        if (context.aadeStatusCode) {
          scope.setTag('aade_status_code', context.aadeStatusCode);
        }

        scope.setContext('invoice_details', {
          invoiceNumber: context.invoiceNumber,
          series: context.series,
          type: context.invoiceType,
          payloadSummary: context.rawPayloadSummary ?? null,
        });

        Sentry.captureException(exceptionToLog);
      });
    } catch (sentryErr) {
      console.warn('[InvoiceErrorService] Failed to dispatch exception to Sentry:', sentryErr);
    }
  }
}
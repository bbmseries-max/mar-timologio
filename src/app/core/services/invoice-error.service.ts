import { Injectable } from '@angular/core';
import * as Sentry from '@sentry/angular';

@Injectable({
  providedIn: 'root'
})
export class InvoiceErrorService {

  captureMyDataError(error: unknown, context: { 
    tenantVat: string; 
    invoiceType: string; 
    series?: string; 
    invoiceNumber?: number;
    rawPayloadSummary?: Record<string, unknown>;
  }) {
    Sentry.withScope((scope) => {
      scope.setTag('app_component', 'maranth-timologio');
      scope.setTag('tenant_vat', context.tenantVat);
      scope.setTag('invoice_type', context.invoiceType);
      
      if (context.series) scope.setTag('invoice_series', context.series);
      if (context.invoiceNumber) scope.setExtra('invoice_num', context.invoiceNumber);
      if (context.rawPayloadSummary) scope.setExtra('payload', context.rawPayloadSummary);

      Sentry.captureException(error);
    });
  }
}
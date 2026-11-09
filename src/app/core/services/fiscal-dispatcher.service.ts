// src/app/core/services/fiscal-dispatcher.service.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { MyDataService } from './mydata.service';
import { LocalDbService } from './local-db.service';
import { AuthTenantService } from './auth-tenant.service';
import { LocalInvoiceRecord, TenantSettingsRecord } from '../models/database.models';

export interface FiscalDispatchResult {
  success: boolean;
  mark?: string;
  uid?: string;
  qrUrl?: string;
  providerSignature?: string;
  error?: string;
  rawResponse?: any;
}

@Injectable({ providedIn: 'root' })
export class FiscalDispatcherService {
  private readonly http = inject(HttpClient);
  private readonly myData = inject(MyDataService);
  private readonly db = inject(LocalDbService);
  private readonly auth = inject(AuthTenantService);

  /**
   * Public dispatch method called by InvoiceBuilderComponent
   */
  public async transmit(invoice: LocalInvoiceRecord): Promise<FiscalDispatchResult> {
    const tenantId = invoice.tenantId || this.auth.currentTenantId() || 'tenant_minimarket';
    
    let settings: TenantSettingsRecord | null = null;
    try {
      settings = (await this.db.getSettings(tenantId)) as TenantSettingsRecord | null;
      if (!settings) {
        // Fallback to primary record if tenantId lookup didn't match
        const all = await (this.db as any).settings?.toArray?.();
        if (all && all.length > 0) settings = all[0];
      }
    } catch (e) {
      console.warn('[FiscalDispatcher] Settings lookup warning:', e);
    }

    const mode = settings?.fiscalMode || 'DIRECT_AADE';

    if (mode === 'PROVIDER') {
      return this.transmitViaProvider(invoice, settings);
    }

    // Default: Direct AADE ERP via your existing MyDataService
    try {
      const res = await this.myData.transmitInvoice(invoice);
      const rawRes = (res as any) || {};

      const resolvedUid = res.uid || rawRes.invoiceUid || rawRes.uid || '';
      const resolvedMark = res.mark ? String(res.mark).trim() : (rawRes.invoiceMark ? String(rawRes.invoiceMark).trim() : undefined);
      const resolvedQr = res.qrUrl || rawRes.qrUrl || (resolvedMark ? `https://mydataapidev.aade.gr/TimologioQR/QRInfo?q=${resolvedMark}` : '');

      return {
        success: Boolean(res.success && resolvedMark),
        mark: resolvedMark,
        uid: resolvedUid,
        qrUrl: resolvedQr,
        providerSignature: (res as any)?.providerSignature ?? rawRes.providerSignature,
        error: res.error || rawRes.message,
        rawResponse: rawRes.rawResponse ?? rawRes.raw ?? res,
      };
    } catch (err: any) {
      console.error('[FiscalDispatcher] Direct transmission unexpected error:', err);
      return {
        success: false,
        error: err?.message || 'Σφάλμα σύνδεσης κατά τη διαβίβαση στην ΑΑΔΕ',
        rawResponse: err,
      };
    }
  }

  private async transmitViaProvider(
    invoice: LocalInvoiceRecord,
    settings: TenantSettingsRecord | null
  ): Promise<FiscalDispatchResult> {
    try {
      const payload = {
        invoice,
        providerConfig: {
          providerName: settings?.providerName || 'IMPACT',
          apiKey: settings?.providerApiKey || '',
          clientId: settings?.providerClientId || '',
          environment: settings?.fiscalEnvironment || 'dev',
        },
      };

      const response = await firstValueFrom(
        this.http.post<FiscalDispatchResult>('/api/provider/transmit', payload)
      );

      return response;
    } catch (err: any) {
      return {
        success: false,
        error: err.error?.error || err.message || 'Αποτυχία διαβίβασης μέσω Παρόχου',
      };
    }
  }
}
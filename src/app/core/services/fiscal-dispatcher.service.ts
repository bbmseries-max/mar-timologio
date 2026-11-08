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
    const tenantId = invoice.tenantId || this.auth.currentTenantId() || 'default-tenant';
    const settings = await this.db.getSettings(tenantId) as TenantSettingsRecord | null;

    const mode = settings?.fiscalMode || 'DIRECT_AADE';

    if (mode === 'PROVIDER') {
      return this.transmitViaProvider(invoice, settings);
    }

    // Default: Direct AADE ERP via your existing MyDataService
    const res = await this.myData.transmitInvoice(invoice);
    return {
      success: res.success,
      mark: res.mark,
      uid: res.uid,
      qrUrl: res.qrUrl,
      error: res.error,
      // Cast with `(res as any).rawResponse` or omit if unneeded:
      rawResponse: (res as any).rawResponse ?? null
    };
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
          environment: settings?.fiscalEnvironment || 'dev'
        }
      };

      const response = await firstValueFrom(
        this.http.post<FiscalDispatchResult>('/api/provider/transmit', payload)
      );

      return response;
    } catch (err: any) {
      return {
        success: false,
        error: err.error?.error || err.message || 'Αποτυχία διαβίβασης μέσω Παρόχου'
      };
    }
  }
}
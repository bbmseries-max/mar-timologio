import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LocalDbService } from './local-db.service';
import { AuthTenantService } from './auth-tenant.service';
import { TenantSettingsRecord } from '@core/models/database.models';
import { AadeSerializerService } from './aade-serializer.service';

export interface MyDataResponse {
  success: boolean;
  mark?: string;
  uid?: string;
  qrUrl?: string;
  error?: string;
  raw?: string;
}

export interface CancelInvoiceResult {
  success: boolean;
  cancellationMark?: string;
  errors?: string[];
  rawResponse?: string;
}

export type FiscalEnvironment = 'production' | 'dev' | 'mock';

@Injectable({ providedIn: 'root' })
export class MyDataService {
  private readonly http = inject(HttpClient);
  private readonly db = inject(LocalDbService);
  private readonly auth = inject(AuthTenantService);
  private readonly aadeSerializer = inject(AadeSerializerService);

  public readonly currentEnvironment = signal<FiscalEnvironment>('dev');
  public async setEnvironment(env: FiscalEnvironment): Promise<void> {
    this.currentEnvironment.set(env);
    
    const tenantId = this.auth.currentTenantId();
    if (!tenantId) return;

    await (this.db as any).saveSettingsForTenant(tenantId, {
      fiscalEnvironment: env
    });
  }

  public async loadTenantEnvironment(): Promise<void> {
    const tenantId = this.auth.currentTenantId();
    if (!tenantId) return;

    const settings = typeof (this.db as any).getSettingsForTenant === 'function'
      ? await (this.db as any).getSettingsForTenant(tenantId)
      : await (this.db as any).getSettings(tenantId);

    const env: FiscalEnvironment = settings?.fiscalEnvironment === 'production' ? 'production' : 'dev';
    this.currentEnvironment.set(env);
  }

  private readonly workerUrl = 'https://gsis-lookup.bbmseries.workers.dev/send-invoice';

  /**
   * Transmits any invoice or transport document (1.1, 9.3, etc.) to AADE myDATA.
   */
  public async transmitInvoice(invoice: any): Promise<MyDataResponse> {
    const tenantId = this.auth.currentTenantId();
    if (!tenantId) {
      throw new Error('Αδυναμία αποστολής: Δεν υπάρχει ενεργός συνδεδεμένος χρήστης/tenant.');
    }

    // 1. Fetch tenant-specific settings strictly by tenantId
    const settings = typeof (this.db as any).getSettingsForTenant === 'function'
      ? await (this.db as any).getSettingsForTenant(tenantId)
      : await (this.db as any).getSettings(tenantId);

    const issuerAfm = settings?.afm ? String(settings.afm).replace(/\D/g, '').trim() : '';
    const userId = (settings?.aadeUserId || '').trim();
    const subKey = (settings?.aadeSubscriptionKey || '').trim();
    const fiscalEnv = settings?.fiscalEnvironment === 'production' ? 'production' : 'sandbox';

    if (!issuerAfm) {
      throw new Error(`Δεν έχει ρυθμιστεί Α.Φ.Μ. εκδότη για το tenant: ${tenantId}. Ελέγξτε το προφίλ της επιχείρησης.`);
    }

    if (!userId || !subKey) {
      throw new Error(`Λείπουν τα διαπιστευτήρια myDATA (User ID ή Subscription Key) για το tenant: ${tenantId}.`);
    }

    // 2. Delegate XML generation exclusively to AadeSerializerService
    const xmlPayload = this.aadeSerializer.serializeToXml(invoice, issuerAfm, settings);

    console.log(`📤 [myDATA] Transmitting to worker | Env: ${fiscalEnv} | Tenant: ${tenantId} | Issuer: ${issuerAfm}`);
    console.log('📄 [myDATA] RAW XML PAYLOAD:\n', xmlPayload);

    const envelope = {
      userId,
      subscriptionKey: subKey,
      environment: fiscalEnv,
      xml: xmlPayload,
    };

    try {
      const res = await firstValueFrom(
        this.http.post<MyDataResponse>(this.workerUrl, envelope, {
          headers: { 'Content-Type': 'application/json' }
        })
      );

      console.log('📡 [myDATA] Worker Raw Response:', res);

      let parsedMark = res.mark;
      let parsedUid = res.uid;
      let parsedQrUrl = res.qrUrl;
      let isSuccess = res.success;
      let errorMessage = res.error;

      // 3. Parse XML response doc from AADE
      if (res.raw) {
        try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(res.raw, 'application/xml');
          const statusCode = xmlDoc.querySelector('statusCode')?.textContent?.trim();

          if (statusCode === 'Success') {
            isSuccess = true;
            parsedMark = xmlDoc.querySelector('invoiceMark, mark')?.textContent?.trim() || parsedMark;
            parsedUid = xmlDoc.querySelector('invoiceUid, uid')?.textContent?.trim() || parsedUid;
            parsedQrUrl = xmlDoc.querySelector('qrUrl')?.textContent?.trim() || parsedQrUrl;
            errorMessage = undefined;
          } else {
            isSuccess = false;
            const errNodes = Array.from(xmlDoc.querySelectorAll('errors > error'));
            const errMsgs = errNodes.map(e => {
              const code = e.querySelector('code')?.textContent?.trim() || '';
              const msg = e.querySelector('message')?.textContent?.trim() || '';
              return `${code ? `[${code}] ` : ''}${msg}`.trim();
            });
            errorMessage = errMsgs.join(' | ') || res.error || 'Απόρριψη myDATA χωρίς συγκεκριμένο μήνυμα σφάλματος.';
          }
        } catch (xmlErr) {
          console.warn('[MyDataService] XML parser error on raw AADE response:', xmlErr);
        }
      }

      const finalResponse: MyDataResponse = {
        success: isSuccess,
        mark: parsedMark,
        uid: parsedUid,
        qrUrl: parsedQrUrl,
        error: errorMessage,
        raw: res.raw,
      };

      // 4. Update and persist invoice record in Dexie upon success
      if (finalResponse.success && finalResponse.mark) {
        invoice.mark = finalResponse.mark;
        invoice.uid = finalResponse.uid;
        invoice.qrUrl = finalResponse.qrUrl;
        invoice.status = 'transmitted';
        invoice.transmissionStatus = 'TRANSMITTED';
        invoice.updatedAt = Date.now();
        invoice.tenantId = tenantId;

        await (this.db as any).invoices.put(invoice);
      }

      return finalResponse;
    } catch (httpErr: any) {
      console.error('❌ [myDATA] HTTP Transmission Error:', httpErr);
      const networkMsg = httpErr?.error?.error || httpErr?.message || 'Αποτυχία επικοινωνίας με την υπηρεσία myDATA.';
      return {
        success: false,
        error: networkMsg,
      };
    }
  }

  /**
   * Cancels a previously submitted invoice using its MARK.
   */
  public async cancelInvoice(
  invoiceOrMark: any,
  tenantSettings?: any
): Promise<CancelInvoiceResult> {
  const mark = typeof invoiceOrMark === 'string' ? invoiceOrMark : invoiceOrMark?.mark;
  
  if (!mark) {
    throw new Error('Δεν βρέθηκε MARK στο επιλεγμένο παραστατικό.');
  }

  const tenantId = this.auth.currentTenantId();
  if (!tenantId && !tenantSettings) {
    throw new Error('Tenant context missing.');
  }

  const settings = tenantSettings || (
    typeof (this.db as any).getSettingsForTenant === 'function'
      ? await (this.db as any).getSettingsForTenant(tenantId)
      : await (this.db as any).getSettings(tenantId)
  );

  const userId = (settings?.aadeUserId || '').trim();
  const subscriptionKey = (settings?.aadeSubscriptionKey || '').trim();
  const fiscalEnv = settings?.fiscalEnvironment === 'production' ? 'production' : 'sandbox';

  const baseUrl = fiscalEnv === 'production'
    ? 'https://mydatapi.aade.gr'
    : 'https://mydataapidev.aade.gr';

  const targetEndpoint = `${baseUrl}/CancelInvoice?mark=${encodeURIComponent(mark.trim())}`;

  const envelope = {
    userId,
    subscriptionKey,
    environment: fiscalEnv,
    targetEndpoint,
    method: 'POST',
    mark: mark.trim(),
    xml: ''
  };

  console.log(`🗑️ [myDATA] Cancelling MARK: ${mark} via endpoint: ${targetEndpoint}`);

  try {
    const res: any = await firstValueFrom(
      this.http.post(this.workerUrl, envelope, {
        headers: { 'Content-Type': 'application/json' }
      })
    );

    console.log('📡 [myDATA] Cancel Worker Raw Response:', res);

    const responseXml = res.raw || '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(responseXml, 'application/xml');

    const statusCode = doc.querySelector('statusCode')?.textContent?.trim();
    const cancellationMark = doc.querySelector('cancellationMark')?.textContent?.trim();

    if (statusCode === 'Success' && cancellationMark) {
      return {
        success: true,
        cancellationMark
      };
    }

    const errorNodes = Array.from(doc.querySelectorAll('errors > error'));
    const errors = errorNodes.map(e => {
      const code = e.querySelector('code')?.textContent?.trim() || '';
      const msg = e.querySelector('message')?.textContent?.trim() || '';
      return `${code ? `[${code}] ` : ''}${msg}`.trim();
    });

    return {
      success: false,
      errors: errors.length ? errors : [res.error || 'Απόρριψη ακύρωσης από την ΑΑΔΕ.'],
      rawResponse: responseXml
    };
  } catch (err: any) {
    console.error('CancelInvoice HTTP Error:', err);
    return {
      success: false,
      errors: [err?.error?.error || err?.message || 'Αποτυχία δικτύου κατά την κλήση ακύρωσης.']
    };
  }
}
}
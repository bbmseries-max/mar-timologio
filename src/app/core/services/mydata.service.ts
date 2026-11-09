import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LocalDbService } from './local-db.service';
import { AuthTenantService } from './auth-tenant.service';
import { AadeSerializerService } from './aade-serializer.service';

export interface MyDataResponse {
  success: boolean;
  mark?: string;
  uid?: string;
  qrUrl?: string;
  providerSignature?: string; // 👈 Resolved compilation gap
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

    await this.db.saveSettingsForTenant(tenantId, {
      fiscalEnvironment: env,
      isProduction: env === 'production',
    });
  }

  public async loadTenantEnvironment(): Promise<void> {
    const tenantId = this.auth.currentTenantId();
    if (!tenantId) return;

    const settings = await this.db.getSettings(tenantId);
    const env: FiscalEnvironment = settings?.fiscalEnvironment === 'production' ? 'production' : 'dev';
    this.currentEnvironment.set(env);
  }

  private readonly workerUrl = 'https://gsis-lookup.bbmseries.workers.dev/send-invoice';

  /**
   * Transmits any invoice or transport document (1.1, 9.2, 9.3, etc.) to AADE myDATA.
   */
  public async transmitInvoice(invoice: any): Promise<MyDataResponse> {
    const tenantId = invoice?.tenantId || this.auth.currentTenantId() || 'tenant_minimarket';

    // 1. Fetch tenant-specific settings strictly by tenantId
    const settings = await this.db.getSettings(tenantId);

    const isProd = settings?.isProduction === true || settings?.fiscalEnvironment === 'production';
    const fiscalEnv: FiscalEnvironment = isProd ? 'production' : 'dev';

    let issuerAfm = settings?.afm ? String(settings.afm).replace(/\D/g, '').trim() : '';
    let userId = (settings?.aadeUserId || '').trim();
    let subKey = (settings?.aadeSubscriptionKey || '').trim();

    // Dev fallbacks for local integration testing
    if (!isProd) {
      issuerAfm = issuerAfm || '067424104';
      userId = userId || 'cuko93dev';
      subKey = subKey || 'eaba5813069d0833f4ccb06dc219ee46';
    }

    if (!issuerAfm) {
      throw new Error(`Δεν έχει ρυθμιστεί Α.Φ.Μ. εκδότη για το tenant: ${tenantId}. Ελέγξτε τις Ρυθμίσεις.`);
    }

    if (!userId || !subKey) {
      throw new Error(`Λείπουν τα διαπιστευτήρια myDATA (User ID ή Subscription Key) για το tenant: ${tenantId}.`);
    }

    // 2. Delegate XML generation to serializer
    const xmlPayload = this.aadeSerializer.serializeToXml(invoice, issuerAfm, settings);

    console.log(`📤 [myDATA] Transmitting to worker | Env: ${fiscalEnv} | Tenant: ${tenantId} | Issuer: ${issuerAfm}`);
    console.log('📄 [myDATA] RAW XML PAYLOAD:\n', xmlPayload);

    // Support dual payload envelope (JSON wrapped with headers for Cloudflare proxy)
    const envelope = {
      userId,
      subscriptionKey: subKey,
      environment: fiscalEnv,
      xml: xmlPayload,
    };

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      'x-fiscal-env': fiscalEnv,
      'aade-user-id': userId,
      'ocp-apim-subscription-key': subKey,
    });

    try {
      const res = await firstValueFrom(
        this.http.post<any>(this.workerUrl, envelope, { headers })
      );

      console.log('📡 [myDATA] Worker Raw Response:', res);

      let parsedMark = res.mark ? String(res.mark).trim() : undefined;
      let parsedUid = res.uid || res.invoiceUid;
      let parsedQrUrl = res.qrUrl;
      let isSuccess = Boolean(res.success && parsedMark);
      let errorMessage = res.error;

      // 3. Parse XML response doc from AADE
      const rawXml = res.raw || res.rawXmlResponse;
      if (rawXml) {
        try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(rawXml, 'application/xml');
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

      if (parsedMark && !parsedQrUrl) {
        const qrBase = fiscalEnv === 'production'
          ? 'https://mydatapi.aade.gr/TimologioQR/QRInfo'
          : 'https://mydataapidev.aade.gr/TimologioQR/QRInfo';
        parsedQrUrl = `${qrBase}?q=${parsedMark}`;
      }

      const finalResponse: MyDataResponse = {
        success: isSuccess,
        mark: parsedMark,
        uid: parsedUid,
        qrUrl: parsedQrUrl,
        providerSignature: res.providerSignature,
        error: errorMessage,
        raw: rawXml,
      };

      // 4. Update and persist invoice record in Dexie upon success if valid id exists
      if (finalResponse.success && finalResponse.mark && invoice?.id) {
        await this.db.markInvoiceAsTransmitted(invoice.id, {
          mark: finalResponse.mark,
          uid: finalResponse.uid || '',
          qrUrl: finalResponse.qrUrl,
        });
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

    const tenantId = this.auth.currentTenantId() || 'tenant_minimarket';
    const settings = tenantSettings || (await this.db.getSettings(tenantId));

    const isProd = settings?.isProduction === true || settings?.fiscalEnvironment === 'production';
    const fiscalEnv: FiscalEnvironment = isProd ? 'production' : 'dev';

    const userId = (settings?.aadeUserId || (isProd ? '' : 'cuko93dev')).trim();
    const subscriptionKey = (settings?.aadeSubscriptionKey || (isProd ? '' : 'eaba5813069d0833f4ccb06dc219ee46')).trim();

    const baseUrl = isProd
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
      xml: '',
    };

    try {
      const res: any = await firstValueFrom(
        this.http.post(this.workerUrl, envelope, {
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': tenantId,
            'x-fiscal-env': fiscalEnv,
          },
        })
      );

      const responseXml = res.raw || '';
      const parser = new DOMParser();
      const doc = parser.parseFromString(responseXml, 'application/xml');

      const statusCode = doc.querySelector('statusCode')?.textContent?.trim();
      const cancellationMark = doc.querySelector('cancellationMark')?.textContent?.trim();

      if (statusCode === 'Success' && cancellationMark) {
        return {
          success: true,
          cancellationMark,
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
        rawResponse: responseXml,
      };
    } catch (err: any) {
      console.error('CancelInvoice HTTP Error:', err);
      return {
        success: false,
        errors: [err?.error?.error || err?.message || 'Αποτυχία δικτύου κατά την κλήση ακύρωσης.'],
      };
    }
  }
}
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
  providerSignature?: string;
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

  private readonly workerUrl = 'https://gsis-lookup.bbmseries.workers.dev/send-invoice';

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
    const env: FiscalEnvironment =
      settings?.fiscalEnvironment === 'production' || settings?.isProduction
        ? 'production'
        : settings?.fiscalEnvironment === 'mock'
          ? 'mock'
          : 'dev';

    this.currentEnvironment.set(env);
  }

  /**
   * Transmits any invoice or transport document (1.1, 1.2, 1.3, 9.1, 9.2, 9.3, etc.) to AADE myDATA.
   */
  public async transmitInvoice(invoice: any): Promise<MyDataResponse> {
    const tenantId = invoice?.tenantId || this.auth.currentTenantId() || 'tenant_minimarket';
    const settings = await this.db.getSettings(tenantId);

    const fiscalEnv: FiscalEnvironment =
      settings?.fiscalEnvironment === 'production' || settings?.isProduction
        ? 'production'
        : settings?.fiscalEnvironment === 'mock' || this.currentEnvironment() === 'mock'
          ? 'mock'
          : 'dev';

    this.currentEnvironment.set(fiscalEnv);

    // 0. OFFLINE SIMULATION MODE (mock) — Local Dexie persistence only, zero AADE network calls
    if (fiscalEnv === 'mock') {
      const mockMark = `40000${Date.now().toString().slice(-10)}`;
      const mockUid = `MOCK-${crypto.randomUUID().replace(/-/g, '').substring(0, 16).toUpperCase()}`;
      const mockQrUrl = `https://mydataapidev.aade.gr/TimologioQR/QRInfo?q=${mockMark}`;

      if (invoice?.id) {
        await this.db.markInvoiceAsTransmitted(invoice.id, {
          mark: mockMark,
          uid: mockUid,
          qrUrl: mockQrUrl,
        });
      }

      return {
        success: true,
        mark: mockMark,
        uid: mockUid,
        qrUrl: mockQrUrl,
        raw: `<ResponseDoc><response><statusCode>Success</statusCode><invoiceMark>${mockMark}</invoiceMark><invoiceUid>${mockUid}</invoiceUid></response></ResponseDoc>`,
      };
    }

    const isProd = fiscalEnv === 'production';

    let issuerAfm = settings?.afm ? String(settings.afm).replace(/\D/g, '').trim() : '';
    const userId = (settings?.aadeUserId || '').trim();
    const subKey = (settings?.aadeSubscriptionKey || '').trim();

    // In Sandbox (dev) mode, Cloudflare Worker auto-injects SANDBOX_AADE_USER_ID / SUB_KEY / ISSUER_AFM
    if (!isProd) {
      issuerAfm = issuerAfm || '067424104';
    }

    if (!issuerAfm) {
      throw new Error(`Δεν έχει ρυθμιστεί Α.Φ.Μ. εκδότη για το tenant: ${tenantId}. Ελέγξτε τις Ρυθμίσεις.`);
    }

    if (isProd && (!userId || !subKey)) {
      throw new Error(`Λείπουν τα παραγωγικά διαπιστευτήρια myDATA (User ID ή Subscription Key) για το tenant: ${tenantId}.`);
    }

    // 2. Delegate XML generation to serializer
    const xmlPayload = this.aadeSerializer.serializeToXml(invoice, issuerAfm, settings);

    if (!xmlPayload || !xmlPayload.trim()) {
      throw new Error('Αποτυχία δημιουργίας XML παραστατικού (κενό payload).');
    }

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
      ...(userId ? { 'aade-user-id': userId } : {}),
      ...(subKey ? { 'ocp-apim-subscription-key': subKey } : {}),
    });

    try {
      const res = await firstValueFrom(
        this.http.post<any>(this.workerUrl, envelope, { headers })
      );

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
        const qrBase = isProd
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

      // 4. Update and persist invoice record in Dexie upon success
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

    const fiscalEnv: FiscalEnvironment =
      settings?.fiscalEnvironment === 'production' || settings?.isProduction
        ? 'production'
        : settings?.fiscalEnvironment === 'mock' || this.currentEnvironment() === 'mock'
          ? 'mock'
          : 'dev';

    // Offline simulation cancellation
    if (fiscalEnv === 'mock') {
      return {
        success: true,
        cancellationMark: `90000${Date.now().toString().slice(-10)}`,
      };
    }

    const isProd = fiscalEnv === 'production';
    const userId = (settings?.aadeUserId || '').trim();
    const subscriptionKey = (settings?.aadeSubscriptionKey || '').trim();

    if (isProd && (!userId || !subscriptionKey)) {
      return {
        success: false,
        errors: ['Λείπουν τα παραγωγικά διαπιστευτήρια myDATA για την ακύρωση παραστατικού.'],
      };
    }

    const baseUrl = isProd
      ? 'https://mydatapi.aade.gr/myDATA'
      : 'https://mydataapidev.aade.gr';

    const targetEndpoint = `${baseUrl}/CancelInvoice?mark=${encodeURIComponent(mark.trim())}`;

    const envelope = {
      action: 'CancelInvoice',
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
            ...(userId ? { 'aade-user-id': userId } : {}),
            ...(subscriptionKey ? { 'ocp-apim-subscription-key': subscriptionKey } : {}),
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
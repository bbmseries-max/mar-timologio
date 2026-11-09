// src/app/core/services/aade-client.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LocalDbService } from './local-db.service';
import { AuthTenantService } from './auth-tenant.service';

export interface SendInvoicesResult {
  success: boolean;
  mark?: string;
  uid?: string;
  qrUrl?: string;
  statusCode?: string;
  rawXmlResponse?: string;
  errorMessage?: string;
}

@Injectable({ providedIn: 'root' })
export class AadeClientService {
  private readonly http = inject(HttpClient);
  private readonly db = inject(LocalDbService);
  private readonly auth = inject(AuthTenantService);

  private readonly WORKER_BASE = 'https://gsis-lookup.bbmseries.workers.dev';

  /**
   * Dispatches the invoice XML payload via the Cloudflare Worker proxy.
   */
  public async sendInvoiceXml(xmlPayload: string): Promise<SendInvoicesResult> {
    try {
      const tenantId = this.auth.currentTenantId() || 'tenant_minimarket';
      const settings = await this.db.getSettings(tenantId);

      const headers: Record<string, string> = {
        'Content-Type': 'application/xml; charset=utf-8',
        'x-tenant-id': tenantId,
        'x-fiscal-env': settings?.fiscalEnvironment || 'dev',
      };

      if (settings?.aadeUserId) {
        headers['aade-user-id'] = settings.aadeUserId;
      }
      if (settings?.aadeSubscriptionKey) {
        headers['ocp-apim-subscription-key'] = settings.aadeSubscriptionKey;
      }

      const res = await firstValueFrom(
        this.http.post<{
          success: boolean;
          statusCode?: string;
          mark?: string;
          uid?: string;
          qrUrl?: string;
          error?: string;
          raw?: string;
        }>(`${this.WORKER_BASE}/send-invoice`, xmlPayload, {
          headers: new HttpHeaders(headers),
        })
      );

      // 1. Success with a valid MARK returned
      if (res.success && res.mark) {
        return {
          success: true,
          mark: String(res.mark).trim(),
          uid: res.uid,
          qrUrl: res.qrUrl || `https://mydataapidev.aade.gr/TimologioQR/QRInfo?q=${res.mark}`,
          statusCode: res.statusCode || 'Success',
          rawXmlResponse: res.raw,
        };
      }

      // 2. AADE Validation error details inside raw XML response
      if (res.raw) {
        const parsed = this.parseAadeXmlErrors(res.raw);
        if (parsed.errorMessage) {
          return parsed;
        }
      }

      return {
        success: false,
        errorMessage: res.error || 'Απόρριψη παραστατικού από την ΑΑΔΕ.',
        rawXmlResponse: res.raw,
      };
    } catch (err: any) {
      console.error('[AADE Gateway Error]', err);
      return {
        success: false,
        errorMessage: err.error?.error || err.message || 'Αποτυχία επικοινωνίας με το Gateway της ΑΑΔΕ.',
      };
    }
  }

  /**
   * Cancels an existing invoice through the Cloudflare Worker to avoid browser CORS blocks.
   */
  public async cancelInvoice(mark: string): Promise<SendInvoicesResult> {
    try {
      const tenantId = this.auth.currentTenantId() || 'tenant_minimarket';
      const settings = await this.db.getSettings(tenantId);

      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId,
        'x-fiscal-env': settings?.fiscalEnvironment || 'dev',
        'aade-user-id': settings?.aadeUserId || '',
        'ocp-apim-subscription-key': settings?.aadeSubscriptionKey || '',
      });

      const res = await firstValueFrom(
        this.http.post<{
          success: boolean;
          cancellationMark?: string;
          error?: string;
          raw?: string;
        }>(`${this.WORKER_BASE}/cancel-invoice`, { mark }, { headers })
      );

      if (res.success && res.cancellationMark) {
        return {
          success: true,
          mark: String(res.cancellationMark).trim(),
          statusCode: 'Success',
          rawXmlResponse: res.raw,
        };
      }

      if (res.raw) {
        return this.parseAadeXmlErrors(res.raw);
      }

      return {
        success: false,
        errorMessage: res.error || 'Αποτυχία ακύρωσης παραστατικού.',
        rawXmlResponse: res.raw,
      };
    } catch (err: any) {
      return {
        success: false,
        errorMessage: err.error?.error || err.message || 'Σφάλμα διακομιστή κατά την ακύρωση.',
      };
    }
  }

  /**
   * Extracts detailed error codes and descriptions from AADE XML ResponseDoc.
   */
  private parseAadeXmlErrors(xmlStr: string): SendInvoicesResult {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

      const errorMessages: string[] = [];
      const errorNodes = xmlDoc.querySelectorAll('errors > error');
      
      errorNodes.forEach((node) => {
        const code = node.querySelector('code')?.textContent?.trim() || '';
        const message = node.querySelector('message')?.textContent?.trim() || '';
        if (code || message) {
          errorMessages.push(`[Κωδ. ${code}] ${message}`);
        }
      });

      return {
        success: false,
        errorMessage: errorMessages.length > 0
          ? errorMessages.join(' | ')
          : 'Απόρριψη myDATA χωρίς σαφή περιγραφή.',
        rawXmlResponse: xmlStr,
      };
    } catch {
      return {
        success: false,
        errorMessage: 'Αποτυχία ανάλυσης απάντησης ΑΑΔΕ.',
        rawXmlResponse: xmlStr,
      };
    }
  }
}
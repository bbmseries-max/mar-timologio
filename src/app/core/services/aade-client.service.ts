// src/app/core/services/aade-client.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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

  // Cloudflare Worker handles CORS, upstream AADE endpoints & credential signing
  private readonly WORKER_URL = 'https://gsis-lookup.bbmseries.workers.dev/send-invoice';
  // Add ?mock=true or ?env=sandbox to prevent production liabilities during testing
  //private readonly WORKER_URL = 'https://gsis-lookup.bbmseries.workers.dev/send-invoice?mock=true';

  /**
   * Dispatches the invoice XML payload via the secure Cloudflare Worker proxy.
   */
  public async sendInvoiceXml(xmlPayload: string): Promise<SendInvoicesResult> {
    try {
      // The Cloudflare Worker accepts raw XML and returns structured JSON
      const res = await firstValueFrom(
        this.http.post<{
          success: boolean;
          statusCode?: string;
          mark?: string;
          uid?: string;
          qrUrl?: string;
          error?: string;
          raw?: string;
        }>(this.WORKER_URL, xmlPayload, {
          headers: { 'Content-Type': 'application/xml; charset=utf-8' },
        })
      );

      if (res.success && res.mark) {
        return {
          success: true,
          mark: res.mark,
          uid: res.uid,
          qrUrl: res.qrUrl,
          statusCode: res.statusCode,
          rawXmlResponse: res.raw,
        };
      }

      // If the worker returned an error response or raw XML with rejection codes
      if (res.raw && !res.error) {
        return this.parseAadeXmlErrors(res.raw);
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
   * Parses error details if raw XML was returned from an AADE rejection.
   */
  private parseAadeXmlErrors(xmlStr: string): SendInvoicesResult {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

      const errorMessages: string[] = [];
      const errorNodes = xmlDoc.querySelectorAll('errors > error');
      errorNodes.forEach((node) => {
        const code = node.querySelector('code')?.textContent || '';
        const message = node.querySelector('message')?.textContent || '';
        if (code || message) {
          errorMessages.push(`${code}: ${message}`.trim());
        }
      });

      return {
        success: false,
        errorMessage: errorMessages.join(' | ') || 'Απόρριψη myDATA χωρίς σαφή περιγραφή.',
        rawXmlResponse: xmlStr,
      };
    } catch (e) {
      return {
        success: false,
        errorMessage: 'Αποτυχία ανάλυσης απάντησης ΑΑΔΕ.',
        rawXmlResponse: xmlStr,
      };
    }
  }
}
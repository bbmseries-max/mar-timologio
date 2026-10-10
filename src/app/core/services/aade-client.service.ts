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
  rawXmlResponse?: string;
  errorMessage?: string;
}

@Injectable({ providedIn: 'root' })
export class AadeClientService {
  private readonly http = inject(HttpClient);
  private readonly db = inject(LocalDbService);
  private readonly auth = inject(AuthTenantService);

  private readonly SANDBOX_URL = 'https://mydataapidev.aade.gr/SendInvoices';
  private readonly PROD_URL = 'https://mydatapi.aade.gr/myDATA/SendInvoices';

  /**
   * Dispatches the 9.1 Return XML to AADE and extracts the MARK.
   */
  public async sendInvoiceXml(xmlPayload: string): Promise<SendInvoicesResult> {
    const tenantId = this.auth.currentTenantId();
    const settings = await this.db.getSettingsForTenant(tenantId);

    if (!settings || !settings.aadeUserId || !settings.aadeSubscriptionKey) {
      return {
        success: false,
        errorMessage: 'Δεν βρέθηκαν διαπιστευτήρια AADE στις Ρυθμίσεις.',
      };
    }

    const targetUrl = settings.isProduction ? this.PROD_URL : this.SANDBOX_URL;

    // AADE mandatory custom authentication headers
    const headers = new HttpHeaders({
      'Content-Type': 'application/xml; charset=utf-8',
      'aade-user-id': settings.aadeUserId,
      'Ocp-Apim-Subscription-Key': settings.aadeSubscriptionKey,
    });

    try {
      const responseXmlText = await firstValueFrom(
        this.http.post(targetUrl, xmlPayload, {
          headers,
          responseType: 'text',
        })
      );

      return this.parseAadeResponse(responseXmlText);
    } catch (err: any) {
      console.error('[AADE API Error]', err);
      return {
        success: false,
        errorMessage: err.error || err.message || 'Αποτυχία επικοινωνίας με το API της ΑΑΔΕ.',
      };
    }
  }

  /**
   * Parses the XML response from AADE:
   * <response>
   *   <index>1</index>
   *   <invoiceUid>...</invoiceUid>
   *   <invoiceMark>...</invoiceMark>
   *   <statusCode>Success</statusCode>
   * </response>
   */
  private parseAadeResponse(xmlStr: string): SendInvoicesResult {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

    const statusCode = xmlDoc.querySelector('statusCode')?.textContent;
    const mark = xmlDoc.querySelector('invoiceMark')?.textContent;
    const uid = xmlDoc.querySelector('invoiceUid')?.textContent;
    const qrUrl = xmlDoc.querySelector('qrUrl')?.textContent;

    if (statusCode === 'Success' && mark) {
      return {
        success: true,
        mark,
        uid: uid || undefined,
        qrUrl: qrUrl || undefined,
        rawXmlResponse: xmlStr,
      };
    }

    // Extract errors if rejected
    const errorMessages: string[] = [];
    const errorNodes = xmlDoc.querySelectorAll('errors > error');
    errorNodes.forEach((node) => {
      const code = node.querySelector('code')?.textContent || '';
      const message = node.querySelector('message')?.textContent || '';
      errorNodes.length > 0 && errorMessages.push(`${code}: ${message}`);
    });

    return {
      success: false,
      errorMessage: errorMessages.join(' | ') || 'Απόρριψη από myDATA χωρίς σαφή περιγραφή.',
      rawXmlResponse: xmlStr,
    };
  }
}
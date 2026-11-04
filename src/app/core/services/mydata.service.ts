import { Injectable, computed, signal, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { LocalDbService } from './local-db.service';
import { firstValueFrom } from 'rxjs';
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
  readonly currentEnvironment = signal<FiscalEnvironment>('dev');
  private readonly aadeSerializer = inject(AadeSerializerService);

  async setEnvironment(env: FiscalEnvironment): Promise<void> {
    this.currentEnvironment.set(env);
    const tenantId = this.auth.currentTenantId();
    if (!tenantId) return;

    await this.db.saveSettingsForTenant(tenantId, {
      fiscalEnvironment: env
    });
  }

  public readonly baseUrl = computed(() => {
    const env = this.currentEnvironment();
    return env === 'production'
      ? '/api/mydata-prod'
      : '/api/mydata-dev';
  });

  private readonly workerUrl = 'https://gsis-lookup.bbmseries.workers.dev/send-invoice';

  public async transmitInvoice(invoice: any): Promise<MyDataResponse> {
    const tenantId = this.auth?.currentTenantId?.() || 'tenant_minimarket';

    const settings = typeof (this.db as any).getSettingsForTenant === 'function'
      ? await (this.db as any).getSettingsForTenant(tenantId)
      : await (this.db as any).getSettings(tenantId);

    const issuerAfm = settings?.afm || '';
    const userId = (settings?.aadeUserId || '').trim();
    const subKey = (settings?.aadeSubscriptionKey || '').trim();

    const fiscalEnv = settings?.fiscalEnvironment === 'production' ? 'production' : 'sandbox';

    if (!userId || !subKey) {
      throw new Error(
        `Λείπουν τα διαπιστευτήρια myDATA (User ID ή Subscription Key) για το tenant: ${tenantId}. Ελέγξτε τις Ρυθμίσεις.`
      );
    }

    //const xmlPayload = this.buildInvoicesDocXml(invoice, issuerAfm);
    const xmlPayload = this.aadeSerializer.serializeToXml(invoice, issuerAfm, settings);

    const envelope = {
      userId: userId,
      subscriptionKey: subKey,
      environment: fiscalEnv,
      xml: xmlPayload,
    };

    console.log('📤 Transmitting to worker with env:', fiscalEnv, 'userId:', userId);

    return new Promise((resolve, reject) => {
      this.http.post<MyDataResponse>(this.workerUrl, envelope, {
        headers: {
          'Content-Type': 'application/json'
        }
      }).subscribe({
        next: async (res) => {
          console.log('📡 Worker Response Object:', res);
          console.log('📄 RAW XML BEING SENT TO WORKER:\n', xmlPayload);
          
          let parsedMark = res.mark;
          let parsedUid = res.uid;
          let parsedQrUrl = res.qrUrl;
          let isSuccess = res.success;
          let errorMessage = res.error;

          // Parse AADE ResponseDoc XML from the raw field
          if (res.raw) {
            try {
              const parser = new DOMParser();
              const xmlDoc = parser.parseFromString(res.raw, 'application/xml');
              const statusCode = xmlDoc.querySelector('statusCode')?.textContent;
              
              if (statusCode === 'Success') {
                isSuccess = true;
                parsedMark = xmlDoc.querySelector('invoiceMark')?.textContent || parsedMark;
                parsedUid = xmlDoc.querySelector('invoiceUid')?.textContent || parsedUid;
                parsedQrUrl = xmlDoc.querySelector('qrUrl')?.textContent || parsedQrUrl;
              } else {
                isSuccess = false;
                const errNodes = Array.from(xmlDoc.querySelectorAll('errors > error'));
                const errMsgs = errNodes.map(e => {
                  const c = e.querySelector('code')?.textContent || '';
                  const m = e.querySelector('message')?.textContent || '';
                  return `${c ? `[${c}] ` : ''}${m}`.trim();
                });
                errorMessage = errMsgs.join(' | ') || 'Απόρριψη myDATA';
              }
            } catch (xmlErr) {
              console.warn('[MyDataService] Failed to parse raw XML response:', xmlErr);
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

          if (finalResponse.success && finalResponse.mark) {
            invoice.mark = finalResponse.mark;
            invoice.uid = finalResponse.uid;
            invoice.qrUrl = finalResponse.qrUrl;
            invoice.status = 'transmitted';
            invoice.transmissionStatus = 'TRANSMITTED';
            invoice.updatedAt = Date.now();
            await (this.db as any).invoices.put(invoice);
          }

          resolve(finalResponse);
        },
        error: (err) => {
          console.error('❌ HTTP Error:', err);
          reject(err);
        }
      });
    });
  }

  private buildInvoicesDocXml(invoice: any, issuerAfm: string): string {
    let parsedPayload: any = {};
    if (invoice?.payloadJson) {
      try {
        parsedPayload = typeof invoice.payloadJson === 'string'
          ? JSON.parse(invoice.payloadJson)
          : invoice.payloadJson;
      } catch {
        parsedPayload = {};
      }
    }

    const invType: string = String(invoice?.invoiceType ?? parsedPayload?.invoiceType ?? '1.1').trim();
    const is93 = invType === '9.3';
    const isPureDispatch = is93 || invType === '9.1';
    const isService = invType === '2.1' || invType === '11.1';

    // 1. Calculations
    const rawNet = Number(invoice?.totalNet ?? invoice?.netTotal ?? invoice?.netAmount ?? 0);
    const rawVat = Number(invoice?.totalVat ?? invoice?.vatTotal ?? invoice?.vatAmount ?? 0);
    const rawGross = Number(invoice?.totalGross ?? invoice?.grossTotal ?? invoice?.totalAmount ?? 0);

    const netVal: string = (isPureDispatch ? 0 : rawNet).toFixed(2);
    const vatVal: string = (isPureDispatch ? 0 : rawVat).toFixed(2);
    const grossVal: string = (isPureDispatch ? 0 : rawGross).toFixed(2);

    // 2. Issuer Details (Strict AADE Rule: GR entities must include Name & Address for 9.3)
    const cleanIssuerAfm = String(issuerAfm || invoice?.issuerAfm || '067424104').replace(/\D/g, '').trim();
    let issuerXml = `    <issuer>
      <vatNumber>${cleanIssuerAfm}</vatNumber>
      <country>GR</country>
      <branch>0</branch>`;

    if (isPureDispatch) {
      const issuerName = this.escapeXml(invoice?.issuerName ?? parsedPayload?.issuer?.legalName ?? 'MARANTH ENTERPRISE');
      const issuerStreet = this.escapeXml(parsedPayload?.issuer?.address?.street ?? parsedPayload?.issuer?.street ?? 'Σταδίου');
      const issuerNumber = this.escapeXml(parsedPayload?.issuer?.address?.number ?? parsedPayload?.issuer?.number ?? '10');
      const issuerPostal = this.escapeXml(parsedPayload?.issuer?.address?.postalCode ?? parsedPayload?.issuer?.postalCode ?? '10564');
      const issuerCity = this.escapeXml(parsedPayload?.issuer?.address?.city ?? parsedPayload?.issuer?.city ?? 'Αθήνα');

      issuerXml += `
      <name>${issuerName}</name>
      <address>
        <street>${issuerStreet}</street>
        <number>${issuerNumber}</number>
        <postalCode>${issuerPostal}</postalCode>
        <city>${issuerCity}</city>
      </address>`;
    }
    issuerXml += `\n    </issuer>`;

    // 3. Counterpart Details
const cust = parsedPayload?.customer ?? invoice?.customer;
let counterpartXml = '';
const cleanCounterpartAfm = String(
  invoice?.customerAfm ?? invoice?.afm ?? cust?.afm ?? ''
).replace(/\D/g, '').trim();

if (cleanCounterpartAfm) {
  const counterpartName = this.escapeXml(invoice?.customerName ?? cust?.legalName ?? cust?.name ?? 'ΠΕΛΑΤΗΣ');
  
  const rawCustStreet = cust?.street ?? cust?.address?.street ?? '';
  const rawCustNumber = cust?.number ?? cust?.address?.number ?? '';
  const rawCustPostal = cust?.postalCode ?? cust?.address?.postalCode ?? '';
  const rawCustCity = cust?.city ?? cust?.address?.city ?? '';

  const parsedCust = this.parseAddress(rawCustStreet, rawCustNumber, rawCustPostal, rawCustCity);

  counterpartXml = `\n    <counterpart>
      <vatNumber>${cleanCounterpartAfm}</vatNumber>
      <country>GR</country>
      <branch>0</branch>
      <name>${counterpartName}</name>
      <address>
        <street>${this.escapeXml(parsedCust.street)}</street>
        <number>${this.escapeXml(parsedCust.number)}</number>
        <postalCode>${this.escapeXml(parsedCust.postalCode)}</postalCode>
        <city>${this.escapeXml(parsedCust.city)}</city>
      </address>
    </counterpart>`;
}

    // 4. Header parameters
    const invoiceSeries = this.escapeXml(String(invoice?.series ?? parsedPayload?.series ?? 'DEV').trim());
    const invoiceAa = parseInt(String(invoice?.documentNumber ?? invoice?.number ?? invoice?.aa ?? 1), 10) || 1;
    const issueDateStr = String(invoice?.issueDate ?? parsedPayload?.issueDate ?? new Date().toISOString().split('T')[0]).trim();

    const mov = parsedPayload?.movement ?? invoice?.movement;
    let movePurpose = Number(mov?.movePurpose) || (is93 ? 4 : 1);
    if (is93 && movePurpose === 6) {
      movePurpose = 4;
    }

    let headerTags = `
      <series>${invoiceSeries}</series>
      <aa>${invoiceAa}</aa>
      <issueDate>${issueDateStr}</issueDate>
      <invoiceType>${invType}</invoiceType>`;

    if (!isPureDispatch) {
      headerTags += `\n      <currency>EUR</currency>`;
    }

    if (invType === '9.1' && mov?.correlatedMark) {
      headerTags += `\n      <correlatedInvoices>${mov.correlatedMark}</correlatedInvoices>`;
    }

    if (isPureDispatch && mov) {
      const dt = mov.dispatchDateTime ? String(mov.dispatchDateTime).trim() : '';
      let dDate = issueDateStr;
      let dTime = '12:00:00';

      if (dt.includes('T')) {
        const parts = dt.split('T');
        dDate = parts[0];
        dTime = parts[1].length === 5 ? parts[1] + ':00' : parts[1];
      }

      headerTags += `\n      <dispatchDate>${dDate}</dispatchDate>`;
      headerTags += `\n      <dispatchTime>${dTime}</dispatchTime>`;

      if (mov.vehicleNumber) {
        headerTags += `\n      <vehicleNumber>${this.escapeXml(mov.vehicleNumber.trim())}</vehicleNumber>`;
      }

      headerTags += `\n      <movePurpose>${movePurpose}</movePurpose>`;

      // otherDeliveryNoteHeader MUST sit INSIDE <invoiceHeader>
      const loadStreet = this.escapeXml(mov?.addressFrom?.street || 'Σταδίου');
      const loadNum = this.escapeXml(mov?.addressFrom?.number || '10');
      const loadZip = this.escapeXml(mov?.addressFrom?.postalCode || '10564');
      const loadCity = this.escapeXml(mov?.addressFrom?.city || 'Αθήνα');

      const delivStreetRaw = mov?.addressTo?.street || cust?.street || '';
      const delivNumRaw = mov?.addressTo?.number || cust?.number || '';
      const delivZipRaw = mov?.addressTo?.postalCode || cust?.postalCode || '';
      const delivCityRaw = mov?.addressTo?.city || cust?.city || '';

      const parsedDeliv = this.parseAddress(delivStreetRaw, delivNumRaw, delivZipRaw, delivCityRaw);

headerTags += `
<otherDeliveryNoteHeader>
  <loadingAddress>
    <street>${loadStreet}</street>
    <number>${loadNum}</number>
    <postalCode>${loadZip}</postalCode>
    <city>${loadCity}</city>
  </loadingAddress>
  <deliveryAddress>
    <street>${this.escapeXml(parsedDeliv.street)}</street>
    <number>${this.escapeXml(parsedDeliv.number)}</number>
    <postalCode>${this.escapeXml(parsedDeliv.postalCode)}</postalCode>
    <city>${this.escapeXml(parsedDeliv.city)}</city>
  </deliveryAddress>
</otherDeliveryNoteHeader>`;

      if (movePurpose === 19 && mov.otherMovePurposeTitle) {
        headerTags += `\n      <otherMovePurposeTitle>${this.escapeXml(mov.otherMovePurposeTitle)}</otherMovePurposeTitle>`;
      }
    }

    // 5. Payment Methods (omitted on pure delivery notes)
    let paymentMethodsXml = '';
    if (!isPureDispatch) {
      const paymentType: number = Number(invoice?.paymentMethodType ?? 3);
      paymentMethodsXml = `\n    <paymentMethods>
      <paymentMethodDetails>
        <type>${paymentType}</type>
        <amount>${grossVal}</amount>
      </paymentMethodDetails>
    </paymentMethods>`;
    }

    // 6. Line items
    const rawLines: any[] = parsedPayload?.lines && parsedPayload.lines.length > 0
      ? parsedPayload.lines
      : [{ description: 'Εμπορεύματα Διακίνησης', netValue: rawNet, vatAmount: rawVat, quantity: 1, vatRateCategory: 1 }];

    const linesXml: string = rawLines.map((line: any, idx: number) => {
      const lineNum = idx + 1;
      const qty = Number(line.quantity) || 1;
      const descr = this.escapeXml(line.description || 'Εμπορεύματα');

      if (is93) {
        return `    <invoiceDetails>
      <lineNumber>${lineNum}</lineNumber>
      <itemDescr>${descr}</itemDescr>
      <quantity>${qty.toFixed(2)}</quantity>
      <measurementUnit>${line.unitMeasurement || 1}</measurementUnit>
      <invoiceDetailType>1</invoiceDetailType>
      <netValue>0.00</netValue>
      <vatCategory>8</vatCategory>
      <vatAmount>0.00</vatAmount>
      <incomeClassification>
        <icls:classificationCategory>category3</icls:classificationCategory>
        <icls:amount>0.00</icls:amount>
      </incomeClassification>
    </invoiceDetails>`;
      }

      const vatCat = Number(line.vatRateCategory ?? line.vatCategory ?? 1);
      const lineNet = (Number(line.netValue) || 0).toFixed(2);
      const lineVat = (Number(line.vatAmount) || 0).toFixed(2);
      const exemptionCat = Number(line.vatExemptionCategory) || 27;
      const vatExemptionXml = vatCat === 7 ? `\n      <vatExemptionCategory>${exemptionCat}</vatExemptionCategory>` : '';
      const classificationType = isService ? 'E3_561_003' : 'E3_561_001';
      const classificationCategory = isService ? 'category1_3' : 'category1_1';

      return `    <invoiceDetails>
      <lineNumber>${lineNum}</lineNumber>
      <itemDescr>${descr}</itemDescr>
      <quantity>${qty.toFixed(2)}</quantity>
      <measurementUnit>${line.unitMeasurement || 1}</measurementUnit>
      <invoiceDetailType>${isService ? 2 : 1}</invoiceDetailType>
      <netValue>${lineNet}</netValue>
      <vatCategory>${vatCat}</vatCategory>
      <vatAmount>${lineVat}</vatAmount>${vatExemptionXml}
      <incomeClassification>
        <icls:classificationType>${classificationType}</icls:classificationType>
        <icls:classificationCategory>${classificationCategory}</icls:classificationCategory>
        <icls:amount>${lineNet}</icls:amount>
      </incomeClassification>
    </invoiceDetails>`;
    }).join('\n');

    // 7. Summary
    let summaryClassificationXml = '';
    if (is93) {
      summaryClassificationXml = `
      <incomeClassification>
        <icls:classificationCategory>category3</icls:classificationCategory>
        <icls:amount>0.00</icls:amount>
      </incomeClassification>`;
    } else {
      const classificationType = isService ? 'E3_561_003' : 'E3_561_001';
      const classificationCategory = isService ? 'category1_3' : 'category1_1';
      summaryClassificationXml = `
      <incomeClassification>
        <icls:classificationType>${classificationType}</icls:classificationType>
        <icls:classificationCategory>${classificationCategory}</icls:classificationCategory>
        <icls:amount>${netVal}</icls:amount>
      </incomeClassification>`;
    }

    const summaryXml = `    <invoiceSummary>
      <totalNetValue>${netVal}</totalNetValue>
      <totalVatAmount>${vatVal}</totalVatAmount>
      <totalWithheldAmount>0.00</totalWithheldAmount>
      <totalFeesAmount>0.00</totalFeesAmount>
      <totalStampDutyAmount>0.00</totalStampDutyAmount>
      <totalOtherTaxesAmount>0.00</totalOtherTaxesAmount>
      <totalDeductionsAmount>0.00</totalDeductionsAmount>
      <totalGrossValue>${grossVal}</totalGrossValue>${summaryClassificationXml}
    </invoiceSummary>`;

    // 8. Root XML output
    const finalXml = `<?xml version="1.0" encoding="UTF-8"?>
<InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0" xmlns:icls="https://www.aade.gr/myDATA/incomeClassificaton/v1.0">
  <invoice>
${issuerXml}${counterpartXml}
    <invoiceHeader>${headerTags}
    </invoiceHeader>${paymentMethodsXml}
${linesXml}
${summaryXml}
  </invoice>
</InvoicesDoc>`.trim();

    return finalXml;
  }

 public async cancelInvoice(
    mark: string,
    tenant: TenantSettingsRecord
  ): Promise<CancelInvoiceResult> {
    if (!mark) {
      throw new Error('Δεν βρέθηκε MARK για το παραστατικό προς ακύρωση.');
    }

    // 1. Read top-level properties from TenantSettingsRecord
    const userId = tenant.aadeUserId || '';
    const subscriptionKey = tenant.aadeSubscriptionKey || '';
    const fiscalEnv: FiscalEnvironment = tenant.fiscalEnvironment || 'dev';

    const isProduction = fiscalEnv === 'production';
    const baseUrl = isProduction 
      ? 'https://mydatapi.aade.gr' 
      : 'https://mydataapidev.aade.gr';

    const targetEndpoint = `${baseUrl}/CancelInvoice?mark=${encodeURIComponent(mark.trim())}`;

    // 2. Dispatch via Cloudflare Worker proxy
    const envelope = {
      userId,
      subscriptionKey,
      environment: isProduction ? 'production' : 'sandbox',
      targetEndpoint,
      method: 'POST',
      xml: ''
    };

    try {
      const res: any = await firstValueFrom(
        this.http.post(this.workerUrl, envelope, {
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const responseXml = res.raw || '';
      const parser = new DOMParser();
      const doc = parser.parseFromString(responseXml, 'application/xml');

      const statusCode = doc.querySelector('statusCode')?.textContent;
      const cancellationMark = doc.querySelector('cancellationMark')?.textContent;

      if (statusCode === 'Success' && cancellationMark) {
        return {
          success: true,
          cancellationMark
        };
      }

      const errorNodes = Array.from(doc.querySelectorAll('errors > error'));
      const errors = errorNodes.map(e => {
        const code = e.querySelector('code')?.textContent || '';
        const msg = e.querySelector('message')?.textContent || '';
        return `${code ? `[${code}] ` : ''}${msg}`.trim();
      });

      return {
        success: false,
        errors: errors.length ? errors : [res.error || 'Η ακύρωση απορρίφθηκε από την ΑΑΔΕ.'],
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

  private escapeXml(unsafe: string | null | undefined): string {
    if (!unsafe) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private parseAddress(rawStreet: string, rawNumber: string, rawPostal: string, rawCity: string): {
  street: string;
  number: string;
  postalCode: string;
  city: string;
} {
  let street = (rawStreet || '').trim().replace(/\s+/g, ' ');
  let number = (rawNumber || '').trim();
  let postalCode = (rawPostal || '').trim();
  let city = (rawCity || '').trim();

  // If postalCode or city are missing, parse the composite street string
  if ((!postalCode || !city) && street) {
    // Matches: "<Street> [<Number>] <5-digit ZIP> - <City>"
    const matchWithHyphen = street.match(/^(.*?)(?:\s+(\d+[A-Za-z\u0370-\u03ff]*))?\s+(\d{5})\s*-\s*(.*)$/);
    if (matchWithHyphen) {
      street = matchWithHyphen[1]?.trim() || street;
      number = number || matchWithHyphen[2]?.trim() || '1';
      postalCode = postalCode || matchWithHyphen[3]?.trim() || '';
      city = city || matchWithHyphen[4]?.trim() || '';
    } else {
      // Matches: "<Street> [<Number>] <5-digit ZIP> <City>"
      const matchLoose = street.match(/^(.*?)(?:\s+(\d+[A-Za-z\u0370-\u03ff]*))?\s+(\d{5})\s+(.*)$/);
      if (matchLoose) {
        street = matchLoose[1]?.trim() || street;
        number = number || matchLoose[2]?.trim() || '1';
        postalCode = postalCode || matchLoose[3]?.trim() || '';
        city = city || matchLoose[4]?.trim() || '';
      }
    }
  }

  return {
    street: street || 'Έδρα Πελάτη',
    number: number || '1',
    postalCode: postalCode || '10000',
    city: city || 'Αθήνα'
  };
}
}
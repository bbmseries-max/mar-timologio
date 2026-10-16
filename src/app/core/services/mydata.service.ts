import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LocalDbService } from './local-db.service';
import { AuthTenantService } from './auth-tenant.service';

export interface MyDataResponse {
  success: boolean;
  mark?: string;
  uid?: string;
  qrUrl?: string;
  error?: string;
  raw?: string;
}

@Injectable({ providedIn: 'root' })
export class MyDataService {
  private readonly http = inject(HttpClient);
  private readonly db = inject(LocalDbService);
  private readonly auth = inject(AuthTenantService);

  private readonly workerUrl = 'https://gsis-lookup.bbmseries.workers.dev/send-invoice';

  public async transmitInvoice(invoice: any): Promise<MyDataResponse> {
    const tenantId = this.auth.currentTenantId();
    const settings = await this.db.getSettingsForTenant(tenantId);
    const issuerAfm = settings?.afm || '';

    const userId = (settings?.aadeUserId || '').trim();
    const subKey = (settings?.aadeSubscriptionKey || '').trim();

    const xmlPayload = this.buildInvoicesDocXml(invoice, issuerAfm);

    // Prepare JSON Envelope
    const envelope = {
      userId: userId,
      subscriptionKey: subKey,
      environment: 'production', // 'production' or 'sandbox'
      xml: xmlPayload,
    };

    return new Promise((resolve, reject) => {
      this.http.post<MyDataResponse>(this.workerUrl, envelope, {
        headers: {
          'Content-Type': 'application/json'
        }
      }).subscribe({
        next: async (res) => {
          console.log('📡 Worker Response Object:', res);
          if (res.raw) {
            console.log('📄 Raw AADE body:\n', res.raw);
          }
          if (res.success && res.mark) {
            invoice.mark = res.mark;
            invoice.uid = res.uid;
            invoice.status = 'transmitted';
            await (this.db as any).invoices.put(invoice);
          }
          resolve(res);
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

    const rawType: string = String(invoice?.invoiceType ?? parsedPayload?.invoiceType ?? '1.1').trim();
    const invType: string = rawType;
    const isPureDispatch = invType === '9.1' || invType === '9.3';
    const isService = invType === '2.1';

    // AADE E3 Classifications: Goods (1.1) vs Services (2.1)
    const classificationType = 'E3_561_001';
    const classificationCategory = isService ? 'category1_3' : 'category1_1';

    // 1. Calculate values safely
    const rawNet = Number(invoice?.totalNet ?? invoice?.netTotal ?? invoice?.netAmount ?? 0);
    const rawVat = Number(invoice?.totalVat ?? invoice?.vatTotal ?? invoice?.vatAmount ?? 0);
    const rawGross = Number(invoice?.totalGross ?? invoice?.grossTotal ?? invoice?.totalAmount ?? 0);

    const netVal: string = (isPureDispatch ? 0 : rawNet).toFixed(2);
    const vatVal: string = (isPureDispatch ? 0 : rawVat).toFixed(2);
    const grossVal: string = (isPureDispatch ? 0 : rawGross).toFixed(2);

    // 2. Metadata & parties
    const cleanIssuerAfm: string = String(issuerAfm || '').trim();
    const cleanCounterpartAfm: string = String(
      invoice?.customerAfm ?? invoice?.afm ?? parsedPayload?.customer?.afm ?? ''
    ).trim();
    const invoiceSeries: string = String(invoice?.series ?? parsedPayload?.series ?? 'TEST').trim();
    const invoiceAa: number = parseInt(String(invoice?.documentNumber ?? invoice?.number ?? invoice?.aa ?? 1), 10) || 1;
    const issueDateStr: string = String(invoice?.issueDate ?? parsedPayload?.issueDate ?? new Date().toISOString().split('T')[0]).trim();

    // 3. Counterpart Address (Always included if present)
    const cust = parsedPayload?.customer ?? invoice?.customer;
    const custStreet = String(cust?.street ?? cust?.address?.street ?? '').trim();
    const custNumber = String(cust?.number ?? cust?.address?.number ?? '').trim();
    const custPostal = String(cust?.postalCode ?? cust?.address?.postalCode ?? '').trim();
    const custCity = String(cust?.city ?? cust?.address?.city ?? '').trim();

    const counterpartAddressXml = (custStreet && custPostal && custCity)
      ? `
      <address>
        <street>${custStreet}</street>
        <number>${custNumber || '1'}</number>
        <postalCode>${custPostal}</postalCode>
        <city>${custCity}</city>
      </address>`
      : '';

    // 4. Payment Methods (Required for 1.1 & 2.1, omitted for 9.x)
    let paymentMethodsXml = '';
    if (!isPureDispatch) {
      const paymentType: number = Number(invoice?.paymentMethodType ?? 1);
      paymentMethodsXml = `
    <paymentMethods>
      <paymentMethodDetails>
        <type>${paymentType}</type>
        <amount>${grossVal}</amount>
      </paymentMethodDetails>
    </paymentMethods>`;
    }

    // 5. Line Items
    const lines: any[] = parsedPayload?.lines && parsedPayload.lines.length > 0
      ? parsedPayload.lines
      : [{ netValue: rawNet, vatAmount: rawVat, quantity: 1, vatRateCategory: 1 }];

    const linesXml: string = lines.map((line: any, idx: number) => {
      const lineNum = idx + 1;
      const vatCat = Number(line.vatRateCategory ?? line.vatCategory ?? 1);
      const qty = Number(line.quantity) || 1;
      const lineNet = (Number(line.netValue) || 0).toFixed(2);
      const lineVat = (Number(line.vatAmount) || 0).toFixed(2);

      const exemptionCat = Number(line.vatExemptionCategory) || 27;

      // Pure dispatches (9.1 / 9.3)
      if (isPureDispatch) {
        return `    <invoiceDetails>
      <lineNumber>${lineNum}</lineNumber>
      <netValue>0.00</netValue>
      <vatCategory>8</vatCategory>
      <vatAmount>0.00</vatAmount>
      <vatExemptionCategory>27</vatExemptionCategory>
      <quantity15>${qty}</quantity15>
    </invoiceDetails>`;
      }

      // Commercial Invoices (1.1 and 2.1)
      const vatExemptionXml = (vatCat === 7 || vatCat === 8)
        ? `\n      <vatExemptionCategory>${exemptionCat}</vatExemptionCategory>`
        : '';

      return `    <invoiceDetails>
      <lineNumber>${lineNum}</lineNumber>
      <netValue>${lineNet}</netValue>
      <vatCategory>${vatCat}</vatCategory>
      <vatAmount>${lineVat}</vatAmount>${vatExemptionXml}
      <incomeClassification>
        <ic:classificationType>${classificationType}</ic:classificationType>
        <ic:classificationCategory>${classificationCategory}</ic:classificationCategory>
        <ic:amount>${lineNet}</ic:amount>
      </incomeClassification>
    </invoiceDetails>`;
    }).join('\n');

    // 6. Summary & Income Classifications
    const summaryIncomeXml = isPureDispatch
      ? ''
      : `
      <incomeClassification>
        <ic:classificationType>${classificationType}</ic:classificationType>
        <ic:classificationCategory>${classificationCategory}</ic:classificationCategory>
        <ic:amount>${netVal}</ic:amount>
      </incomeClassification>`;

    const summaryXml = `    <invoiceSummary>
      <totalNetValue>${netVal}</totalNetValue>
      <totalVatAmount>${vatVal}</totalVatAmount>
      <totalWithheldAmount>0.00</totalWithheldAmount>
      <totalFeesAmount>0.00</totalFeesAmount>
      <totalStampDutyAmount>0.00</totalStampDutyAmount>
      <totalOtherTaxesAmount>0.00</totalOtherTaxesAmount>
      <totalDeductionsAmount>0.00</totalDeductionsAmount>
      <totalGrossValue>${grossVal}</totalGrossValue>${summaryIncomeXml}
    </invoiceSummary>`;

    // 7. Movement Header (for pure dispatches)
    const mov = parsedPayload?.movement ?? invoice?.movement;
    const purpose = Number(mov?.movePurpose) || 1;

    const dispatchHeaderXml = isPureDispatch
      ? `
      <movePurpose>${purpose}</movePurpose>`
      : '';

    // 8. Assemble Document XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0"
             xmlns:ic="https://www.aade.gr/myDATA/incomeClassificaton/v1.0">
  <invoice>
    <issuer>
      <vatNumber>${cleanIssuerAfm}</vatNumber>
      <country>GR</country>
      <branch>0</branch>
    </issuer>
    <counterpart>
      <vatNumber>${cleanCounterpartAfm}</vatNumber>
      <country>GR</country>
      <branch>0</branch>${counterpartAddressXml}
    </counterpart>
    <invoiceHeader>
      <series>${invoiceSeries}</series>
      <aa>${invoiceAa}</aa>
      <issueDate>${issueDateStr}</issueDate>
      <invoiceType>${invType}</invoiceType>
      <currency>EUR</currency>${dispatchHeaderXml}
    </invoiceHeader>${paymentMethodsXml}
${linesXml}
${summaryXml}
  </invoice>
</InvoicesDoc>`.trim();

    return xml;
  }
}
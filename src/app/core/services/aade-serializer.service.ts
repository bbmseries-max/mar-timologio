import { Injectable, inject } from '@angular/core';
import {
  InvoiceLineItem,
  GoodsMovementData,
  InvoiceTotals,
  InvoiceDocument,
  Customer,
} from '../models/aade.models';
import { LocalDbService } from './local-db.service';
import { CompanySettingsRecord } from '@core/models/database.models';

export interface CompanyIssuerInfo {
  afm: string;
  country: string;
  branch: number;
}

export interface InvoiceDocPayload {
  series: string;
  documentNumber: number;
  issueDate: string;
  invoiceType: string;
  currency: 'EUR';
  issuer: CompanyIssuerInfo;
  counterpart: Customer;
  lines: InvoiceLineItem[];
  totals: InvoiceTotals;
  paymentMethodType?: number;
  movement?: GoodsMovementData;
}

@Injectable({ providedIn: 'root' })
export class AadeSerializerService {
  private readonly db = inject(LocalDbService);

  /**
   * Main entry point: preserves signature while accepting dynamic issuer settings
   */
  public serializeToXml(
    invoice: InvoiceDocument | any,
    issuerAfm: string,
    issuerSettings?: Partial<CompanySettingsRecord>
  ): string {
    return this.generateInvoicesDocXml({
      series: invoice.series,
      documentNumber: invoice.documentNumber,
      issueDate: invoice.issueDate,
      invoiceType: invoice.invoiceType || invoice.documentType || '1.1',
      currency: invoice.currency || 'EUR',
      issuer: {
        afm: (issuerAfm || issuerSettings?.afm || '').replace(/\D/g, '').trim(),
        country: 'GR',
        branch: Number(issuerSettings?.branch ?? 0),
      },
      counterpart: invoice.customer,
      lines: invoice.lines,
      totals: invoice.totals,
      paymentMethodType: invoice.paymentMethod?.type ?? 1,
      movement: invoice.movement,
    });
  }

  /**
   * Generates strict, XSD-compliant InvoicesDoc XML for AADE myDATA
   */
  public generateInvoicesDocXml(data: InvoiceDocPayload): string {
    const isMovementOnly = data.invoiceType === '9.1';
    const isMovementDoc = data.invoiceType === '1.2' || data.invoiceType === '9.1';
    const isServiceInvoice = data.invoiceType === '2.1';

    // 1. Counterpart Address (Only emit if street/city/postal are non-empty)
    const street = this.escapeXml(data.counterpart?.address?.street?.trim() || '');
    const postal = this.escapeXml(data.counterpart?.address?.postalCode?.trim() || '');
    const city = this.escapeXml(data.counterpart?.address?.city?.trim() || '');
    const number = this.escapeXml(data.counterpart?.address?.number?.trim() || '');

    const counterpartAddressXml = (street && postal && city)
      ? `\n      <address>
        <street>${street}</street>
        <number>${number}</number>
        <postalCode>${postal}</postalCode>
        <city>${city}</city>
      </address>`
      : '';

    // 2. Line Items (Adhering to strict AADE XSD sequence)
    const linesXml = (data.lines || [])
      .map((line, idx) => {
        const lineNum = line.lineNumber || idx + 1;
        const vatCategory = Number(line.vatRateCategory ?? 1);
        const quantity = Number(line.quantity) || 1;

        const exemptionCat = Number((line as any).vatExemptionCategory) || 27;
        const exemptionXml = (vatCategory === 7 || vatCategory === 8)
          ? `\n      <vatExemptionCategory>${exemptionCat}</vatExemptionCategory>`
          : '';

        if (isMovementOnly) {
          return `    <invoiceDetails>
      <lineNumber>${lineNum}</lineNumber>
      <netValue>0.00</netValue>
      <vatCategory>8</vatCategory>
      <vatAmount>0.00</vatAmount>
      <vatExemptionCategory>27</vatExemptionCategory>
      <quantity15>${quantity}</quantity15>
    </invoiceDetails>`;
        }

        // Default classifications: category1_3 for services (2.1), category1_1 for goods (1.1)
        const defaultCategory = isServiceInvoice ? 'category1_3' : 'category1_1';
        const classificationType =
          line.incomeClassification?.classificationType ?? 'E3_561_001';
        const classificationCategory =
          line.incomeClassification?.classificationCategory ?? defaultCategory;

        const rawNet = (line.netValue !== undefined && line.netValue !== null)
          ? Number(line.netValue)
          : (quantity * (Number(line.unitPrice) || 0));
        const finalNet = rawNet.toFixed(2);
        const vatAmt = Number(line.vatAmount || 0).toFixed(2);
        const classificationAmount = Number(line.incomeClassification?.amount ?? rawNet).toFixed(2);

        return `    <invoiceDetails>
      <lineNumber>${lineNum}</lineNumber>
      <netValue>${finalNet}</netValue>
      <vatCategory>${vatCategory}</vatCategory>
      <vatAmount>${vatAmt}</vatAmount>${exemptionXml}
      <incomeClassification>
        <ic:classificationType>${classificationType}</ic:classificationType>
        <ic:classificationCategory>${classificationCategory}</ic:classificationCategory>
        <ic:amount>${classificationAmount}</ic:amount>
      </incomeClassification>
    </invoiceDetails>`;
      })
      .join('\n');

    // 3. Summary Totals
    const netSummary = isMovementOnly ? '0.00' : Number(data.totals?.totalNetValue || 0).toFixed(2);
    const vatSummary = isMovementOnly ? '0.00' : Number(data.totals?.totalVatAmount || 0).toFixed(2);
    const grossSummary = isMovementOnly ? '0.00' : Number(data.totals?.totalGrossValue || 0).toFixed(2);

    const summaryCategory = isServiceInvoice ? 'category1_3' : 'category1_1';
    const summaryClassificationXml = !isMovementOnly
      ? `\n      <incomeClassification>
        <ic:classificationType>E3_561_001</ic:classificationType>
        <ic:classificationCategory>${summaryCategory}</ic:classificationCategory>
        <ic:amount>${netSummary}</ic:amount>
      </incomeClassification>`
      : '';

    // 4. Payment Methods (Omitted for 9.1; ordered after invoiceSummary)
    let paymentMethodsXml = '';
    if (!isMovementOnly) {
      const paymentType = data.paymentMethodType ?? 1;
      paymentMethodsXml = `\n    <paymentMethods>
      <paymentMethodDetails>
        <type>${paymentType}</type>
        <amount>${grossSummary}</amount>
      </paymentMethodDetails>
    </paymentMethods>`;
    }

    // 5. Transport Details (Strict XSD: vehicleNumber -> transportType -> timeStamp -> carrierVatNumber)
    let transportXml = '';
    if (isMovementDoc && data.movement) {
      const vehicle = this.escapeXml(data.movement.vehicleNumber?.trim() || '');
      const carrierAfm = this.escapeXml((data.movement as any).carrierVatNumber || data.issuer.afm);

      let dateTimeStr = data.movement.dispatchDateTime ? String(data.movement.dispatchDateTime).trim() : '';
      if (dateTimeStr.length === 16) {
        dateTimeStr = `${dateTimeStr}:00`;
      } else if (!dateTimeStr.includes('T')) {
        dateTimeStr = `${data.issueDate}T08:00:00`;
      }

      transportXml = `\n    <otherTransportDetails>
      ${vehicle ? `<vehicleNumber>${vehicle}</vehicleNumber>` : ''}
      <transportType>1</transportType>
      <timeStamp>${dateTimeStr}</timeStamp>
      <carrierVatNumber>${carrierAfm}</carrierVatNumber>
    </otherTransportDetails>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0"
             xmlns:ic="https://www.aade.gr/myDATA/incomeClassificaton/v1.0"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <invoice>
    <issuer>
      <vatNumber>${this.escapeXml(data.issuer.afm)}</vatNumber>
      <country>${data.issuer.country || 'GR'}</country>
      <branch>${data.issuer.branch ?? 0}</branch>
    </issuer>
    <counterpart>
      <vatNumber>${this.escapeXml(data.counterpart?.afm || '')}</vatNumber>
      <country>${data.counterpart?.country || 'GR'}</country>
      <branch>${data.counterpart?.branch ?? 0}</branch>${counterpartAddressXml}
    </counterpart>
    <invoiceHeader>
      <series>${this.escapeXml(data.series)}</series>
      <aa>${data.documentNumber}</aa>
      <issueDate>${data.issueDate}</issueDate>
      <invoiceType>${data.invoiceType}</invoiceType>
      <currency>${data.currency}</currency>
    </invoiceHeader>
${linesXml}
    <invoiceSummary>
      <totalNetValue>${netSummary}</totalNetValue>
      <totalVatAmount>${vatSummary}</totalVatAmount>
      <totalWithheldAmount>0.00</totalWithheldAmount>
      <totalFeesAmount>0.00</totalFeesAmount>
      <totalStampDutyAmount>0.00</totalStampDutyAmount>
      <totalOtherTaxesAmount>0.00</totalOtherTaxesAmount>
      <totalDeductionsAmount>0.00</totalDeductionsAmount>
      <totalGrossValue>${grossSummary}</totalGrossValue>${summaryClassificationXml}
    </invoiceSummary>${transportXml}
  </invoice>
</InvoicesDoc>`.trim();
  }

  private escapeXml(unsafe: string): string {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
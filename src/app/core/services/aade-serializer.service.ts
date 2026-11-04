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

@Injectable({ providedIn: 'root' })
export class AadeSerializerService {
  private readonly db = inject(LocalDbService);

  public serializeToXml(
    invoice: InvoiceDocument | any,
    issuerAfm: string,
    issuerSettings?: Partial<CompanySettingsRecord> | any
  ): string {
    const rawAfm = (issuerAfm || issuerSettings?.afm || '067424104').replace(/\D/g, '').trim();

    return this.generateInvoicesDocXml({
      series: invoice.series || 'DEV',
      documentNumber: Number(invoice.documentNumber) || 1,
      issueDate: invoice.issueDate || new Date().toISOString().substring(0, 10),
      invoiceType: invoice.invoiceType || invoice.documentType || '1.1',
      currency: invoice.currency || 'EUR',
      issuer: {
        afm: rawAfm,
        country: 'GR',
        branch: Number(issuerSettings?.branch ?? 0),
      },
      counterpart: invoice.customer,
      lines: invoice.lines || [],
      totals: invoice.totals || { totalNetValue: 0, totalVatAmount: 0, totalGrossValue: 0 },
      paymentMethodType: invoice.paymentMethod?.type ?? 1,
      movement: invoice.movement,
    });
  }

  public generateInvoicesDocXml(data: any): string {
    const is93 = data.invoiceType === '9.3';
    const isMovementOnly = is93 || data.invoiceType === '9.1';
    const isServiceInvoice = data.invoiceType === '11.1' || data.invoiceType === '2.1';
    const isRetail = data.invoiceType === '11.1' || data.invoiceType === '11.2';

    // 1. Issuer - Greek entities must NOT include name or address
    const issuerAfm = String(data.issuer?.afm || '067424104').replace(/\D/g, '').trim();
    const issuerXml = `    <issuer>
      <vatNumber>${issuerAfm}</vatNumber>
      <country>GR</country>
      <branch>${data.issuer?.branch ?? 0}</branch>
    </issuer>`;

    // 2. Counterpart - Optional for 11.1 (retail B2C), mandatory for B2B
    let counterpartXml = '';
    if (data.counterpart && data.counterpart.afm && String(data.counterpart.afm).trim() !== '') {
      const cpAfm = String(data.counterpart.afm).replace(/\D/g, '').trim();
      const cpCountry = data.counterpart.country || 'GR';
      const isGreek = cpCountry === 'GR';

      // Rule 220: <name> is forbidden for Greek VAT counterparts
      const nameTag = (!isGreek && (data.counterpart.legalName || data.counterpart.name))
        ? `\n      <name>${this.escapeXml(data.counterpart.legalName || data.counterpart.name)}</name>`
        : '';

      const cpStreet = this.escapeXml(data.counterpart.address?.street || '');
      const cpNum = this.escapeXml(data.counterpart.address?.number || '');
      const cpZip = this.escapeXml(data.counterpart.address?.postalCode || '');
      const cpCity = this.escapeXml(data.counterpart.address?.city || '');

      let addressXml = '';
      if (cpStreet) {
        addressXml = `\n      <address>
        <street>${cpStreet}</street>
        <number>${cpNum}</number>
        <postalCode>${cpZip}</postalCode>
        <city>${cpCity}</city>
      </address>`;
      }

      counterpartXml = `\n    <counterpart>
      <vatNumber>${cpAfm}</vatNumber>
      <country>${cpCountry}</country>
      <branch>${data.counterpart.branch ?? 0}</branch>${nameTag}${addressXml}
    </counterpart>`;
    }

    // 3. Header Construction
    let headerTags = `
      <series>${this.escapeXml(data.series || 'DEV')}</series>
      <aa>${data.documentNumber || 1}</aa>
      <issueDate>${data.issueDate}</issueDate>
      <invoiceType>${data.invoiceType}</invoiceType>`;

    if (!isMovementOnly) {
      headerTags += `\n      <currency>${data.currency || 'EUR'}</currency>`;
    }

    // Movement details inside invoiceHeader
    if (isMovementOnly && data.movement) {
      const dt = data.movement.dispatchDateTime ? String(data.movement.dispatchDateTime).trim() : '';
      let dDate = data.issueDate;
      let dTime = '09:30:00';

      if (dt.includes('T')) {
        const parts = dt.split('T');
        dDate = parts[0];
        dTime = parts[1].length === 5 ? parts[1] + ':00' : parts[1];
      }

      headerTags += `\n      <dispatchDate>${dDate}</dispatchDate>`;
      headerTags += `\n      <dispatchTime>${dTime}</dispatchTime>`;

      if (data.movement.vehicleNumber) {
        headerTags += `\n      <vehicleNumber>${this.escapeXml(data.movement.vehicleNumber.trim())}</vehicleNumber>`;
      }

      const movePurpose = Number(data.movement.movePurpose) || (is93 ? 4 : 1);
      headerTags += `\n      <movePurpose>${movePurpose}</movePurpose>`;

      const from = data.movement.addressFrom || {};
      const to = data.movement.addressTo || {};
      headerTags += `
      <otherDeliveryNoteHeader>
        <loadingAddress>
          <street>${this.escapeXml(from.street || 'ΒΑΡΔΟΥΝΙΩΤΗ')}</street>
          <number>${this.escapeXml(from.number || '11')}</number>
          <postalCode>${this.escapeXml(from.postalCode || '11522')}</postalCode>
          <city>${this.escapeXml(from.city || 'ΑΘΗΝΑ')}</city>
        </loadingAddress>
        <deliveryAddress>
          <street>${this.escapeXml(to.street || 'ΒΑΡΔΟΥΝΙΩΤΗ')}</street>
          <number>${this.escapeXml(to.number || '11')}</number>
          <postalCode>${this.escapeXml(to.postalCode || '11522')}</postalCode>
          <city>${this.escapeXml(to.city || 'ΑΘΗΝΑ')}</city>
        </deliveryAddress>
      </otherDeliveryNoteHeader>`;

      if (movePurpose === 19 && data.movement.otherMovePurposeTitle) {
        headerTags += `\n      <otherMovePurposeTitle>${this.escapeXml(data.movement.otherMovePurposeTitle)}</otherMovePurposeTitle>`;
      }
    }

    // 4. Payment Methods (Omitted on 9.3 movement notes, mandatory for 1.1, 2.1, 11.1)
    let paymentMethodsXml = '';
    const grossVal = isMovementOnly ? '0.00' : Number(data.totals?.totalGrossValue || 0).toFixed(2);
    if (!isMovementOnly) {
      paymentMethodsXml = `\n    <paymentMethods>
      <paymentMethodDetails>
        <type>${data.paymentMethodType ?? (isRetail ? 1 : 3)}</type>
        <amount>${grossVal}</amount>
      </paymentMethodDetails>
    </paymentMethods>`;
    }

    // 5. Lines Generation
    const rawLines = data.lines && data.lines.length > 0 ? data.lines : [{ description: 'Υπηρεσίες / Αγαθά', quantity: 1, netValue: 0 }];
    const linesXml = rawLines
      .map((line: any, idx: number) => {
        const lineNum = idx + 1;
        const qty = Number(line.quantity) || 1;

        if (is93) {
          // 9.3 Delivery Note Line: <itemDescr> is mandatory
          const itemDescr = this.escapeXml(line.description || 'Εμπορεύματα');
          return `    <invoiceDetails>
      <lineNumber>${lineNum}</lineNumber>
      <itemDescr>${itemDescr}</itemDescr>
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

        // Standard commercial fallback (1.1, 2.1)
        // Rule 247: <itemDescr> is STRICTLY FORBIDDEN here. Only 9.3 allows <itemDescr>.
        const net = Number(line.netValue || 0).toFixed(2);
        const vat = Number(line.vatAmount || 0).toFixed(2);
        const vatCat = Number(line.vatRateCategory ?? line.vatCategory ?? 1);
        const e3 = isServiceInvoice ? 'E3_561_003' : 'E3_561_001';
        const cat = isServiceInvoice ? 'category1_3' : 'category1_1';

        return `    <invoiceDetails>
      <lineNumber>${lineNum}</lineNumber>
      <quantity>${qty.toFixed(2)}</quantity>
      <measurementUnit>${line.unitMeasurement || 1}</measurementUnit>
      <invoiceDetailType>${isServiceInvoice ? 2 : 1}</invoiceDetailType>
      <netValue>${net}</netValue>
      <vatCategory>${vatCat}</vatCategory>
      <vatAmount>${vat}</vatAmount>
      <incomeClassification>
        <icls:classificationType>${e3}</icls:classificationType>
        <icls:classificationCategory>${cat}</icls:classificationCategory>
        <icls:amount>${net}</icls:amount>
      </incomeClassification>
    </invoiceDetails>`;
      })
      .join('\n');

    // 6. Summary Block
    const netSummary = isMovementOnly ? '0.00' : Number(data.totals?.totalNetValue || 0).toFixed(2);
    const vatSummary = isMovementOnly ? '0.00' : Number(data.totals?.totalVatAmount || 0).toFixed(2);

    let summaryClassificationXml = '';
    if (is93) {
      summaryClassificationXml = `
      <incomeClassification>
        <icls:classificationCategory>category3</icls:classificationCategory>
        <icls:amount>0.00</icls:amount>
      </incomeClassification>`;
    } else {
      const e3 = (isServiceInvoice || isRetail) ? 'E3_561_003' : 'E3_561_001';
      const cat = (isServiceInvoice || isRetail) ? 'category1_3' : 'category1_1';
      summaryClassificationXml = `
      <incomeClassification>
        <icls:classificationType>${e3}</icls:classificationType>
        <icls:classificationCategory>${cat}</icls:classificationCategory>
        <icls:amount>${netSummary}</icls:amount>
      </incomeClassification>`;
    }

    // 7. Assemble Document with Strict Schema Order in invoiceSummary:
    // Net -> Vat -> Withheld -> OtherTaxes -> StampDuty -> Fees -> Deductions -> Gross
    return `<?xml version="1.0" encoding="UTF-8"?>
<InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0" xmlns:icls="https://www.aade.gr/myDATA/incomeClassificaton/v1.0">
  <invoice>
${issuerXml}${counterpartXml}
    <invoiceHeader>${headerTags}
    </invoiceHeader>${paymentMethodsXml}
${linesXml}
    <invoiceSummary>
      <totalNetValue>${netSummary}</totalNetValue>
      <totalVatAmount>${vatSummary}</totalVatAmount>
      <totalWithheldAmount>0.00</totalWithheldAmount>
      <totalOtherTaxesAmount>0.00</totalOtherTaxesAmount>
      <totalStampDutyAmount>0.00</totalStampDutyAmount>
      <totalFeesAmount>0.00</totalFeesAmount>
      <totalDeductionsAmount>0.00</totalDeductionsAmount>
      <totalGrossValue>${grossVal}</totalGrossValue>${summaryClassificationXml}
    </invoiceSummary>
  </invoice>
</InvoicesDoc>`.trim();
  }

  public parseCancelResponse(xmlText: string): { success: boolean; cancellationMark?: string; error?: string } {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const statusCode = xmlDoc.getElementsByTagName('statusCode')[0]?.textContent;
    const cancellationMark = xmlDoc.getElementsByTagName('cancellationMark')[0]?.textContent;

    if (statusCode === 'Success' && cancellationMark) {
      return { success: true, cancellationMark };
    }

    const errorMsg =
      xmlDoc.getElementsByTagName('message')[0]?.textContent ||
      xmlDoc.getElementsByTagName('code')[0]?.textContent ||
      'Unknown AADE cancellation error';

    return { success: false, error: errorMsg };
  }

  private escapeXml(unsafe: string): string {
    if (!unsafe) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
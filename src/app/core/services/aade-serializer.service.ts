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
    const rawAfm = (issuerAfm || issuerSettings?.afm || '').replace(/\D/g, '').trim();

    if (!rawAfm) {
      throw new Error('Tenant issuer AFM is missing. Cannot serialize invoice.');
    }

    // 1. Resolve payload if passed a LocalInvoiceRecord with payloadJson string
    let parsedPayload: any = {};
    if (typeof invoice.payloadJson === 'string') {
      try {
        parsedPayload = JSON.parse(invoice.payloadJson);
      } catch {
        parsedPayload = {};
      }
    } else if (invoice.payloadJson && typeof invoice.payloadJson === 'object') {
      parsedPayload = invoice.payloadJson;
    }

    // 2. Resolve customer / counterpart object from all possible locations
    const customer =
      invoice.customer ||
      parsedPayload.customer ||
      invoice.counterparty ||
      invoice.counterpart ||
      {
        afm: invoice.customerAfm,
        legalName: invoice.customerName,
      };

    return this.generateInvoicesDocXml({
      series: invoice.series || parsedPayload.series || 'DEV',
      documentNumber: Number(invoice.documentNumber || parsedPayload.documentNumber) || 1,
      issueDate: invoice.issueDate || parsedPayload.issueDate || new Date().toISOString().substring(0, 10),
      invoiceType: String(invoice.invoiceType || parsedPayload.invoiceType || '1.1').trim(),
      currency: invoice.currency || parsedPayload.currency || 'EUR',
      issuer: {
        afm: rawAfm,
        country: (issuerSettings?.country || 'GR').toUpperCase(),
        branch: Number(issuerSettings?.branch ?? 0),
      },
      counterpart: customer,
      lines: (invoice.lines && invoice.lines.length > 0) ? invoice.lines : (parsedPayload.lines || []),
      totals: invoice.totals || parsedPayload.totals || {
        totalNetValue: invoice.totalNet || 0,
        totalVatAmount: invoice.totalVat || 0,
        totalGrossValue: invoice.totalGross || 0,
      },
      paymentMethodType: invoice.paymentMethod?.type ?? parsedPayload.paymentMethod?.type ?? 1,
      movement: invoice.movement || parsedPayload.movement,
    });
  }

  public generateInvoicesDocXml(data: any): string {
    const invType = String(data.invoiceType || '1.1').trim();
    const is93 = invType === '9.3';
    const isMovementOnly = is93 || invType === '9.1';
    
    // Corrected service vs retail flags
    const isServiceInvoice = invType === '2.1' || invType === '11.2';
    const isRetail = invType === '11.1' || invType === '11.2';

    // 1. Issuer Validation (Strictly dynamic from tenant)
    const issuerAfm = String(data.issuer?.afm || '').replace(/\D/g, '').trim();
    if (!issuerAfm) {
      throw new Error('Issuer AFM is required for myDATA generation.');
    }
    const issuerCountry = (data.issuer?.country || 'GR').toUpperCase();
    const issuerBranch = Number(data.issuer?.branch ?? 0);

    const issuerXml = `    <issuer>
      <vatNumber>${issuerAfm}</vatNumber>
      <country>${issuerCountry}</country>
      <branch>${issuerBranch}</branch>
    </issuer>`;

    // 2. Counterpart - Strictly omitted in 9.3 or when B2C without AFM
    let counterpartXml = '';
    const cp = data.counterpart || data.counterparty;
    const rawCpAfm = cp?.afm || cp?.vatNumber || '';

    if (!is93 && rawCpAfm && String(rawCpAfm).trim() !== '') {
      const cpAfm = String(rawCpAfm).replace(/\D/g, '').trim();
      const cpCountry = (cp.country || 'GR').toUpperCase();
      const isGreek = cpCountry === 'GR';

      // Rule 220: <name> is forbidden for Greek VAT counterparts
      const nameTag = (!isGreek && (cp.legalName || cp.name))
        ? `\n      <name>${this.escapeXml(cp.legalName || cp.name)}</name>`
        : '';

      const cpStreet = this.escapeXml(cp.street || cp.address?.street || '');
      const rawCpNumber = cp.number || cp.address?.number || '';
      const cpNum = this.escapeXml((rawCpNumber && rawCpNumber !== '0' && rawCpNumber !== '00') ? rawCpNumber : '1');
      const cpZip = this.escapeXml(cp.postalCode || cp.address?.postalCode || '');
      const cpCity = this.escapeXml(cp.city || cp.address?.city || '');
      const cpBranch = isNaN(Number(cp.branch)) ? 0 : Number(cp.branch);

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
      <branch>${cpBranch}</branch>${nameTag}${addressXml}
    </counterpart>`;
    }

    // 3. Header Construction
    let headerTags = `
      <series>${this.escapeXml(data.series || 'DEV')}</series>
      <aa>${data.documentNumber || 1}</aa>
      <issueDate>${data.issueDate}</issueDate>
      <invoiceType>${invType}</invoiceType>`;

    if (!isMovementOnly) {
      headerTags += `\n      <currency>${data.currency || 'EUR'}</currency>`;
    }

    // Movement details inside invoiceHeader (Strict XSD element ordering)
    if (isMovementOnly && data.movement) {
      if (data.movement.correlatedMark) {
        headerTags += `\n      <correlatedInvoices>${this.escapeXml(data.movement.correlatedMark)}</correlatedInvoices>`;
      }

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

      // XSD requires otherMovePurposeTitle BEFORE otherDeliveryNoteHeader
      if (movePurpose === 19 && data.movement.otherMovePurposeTitle) {
        headerTags += `\n      <otherMovePurposeTitle>${this.escapeXml(data.movement.otherMovePurposeTitle)}</otherMovePurposeTitle>`;
      }

      const from = data.movement.addressFrom || {};
      const to = data.movement.addressTo || {};
      headerTags += `
      <otherDeliveryNoteHeader>
        <loadingAddress>
          <street>${this.escapeXml(from.street || '')}</street>
          <number>${this.escapeXml(from.number || '1')}</number>
          <postalCode>${this.escapeXml(from.postalCode || '')}</postalCode>
          <city>${this.escapeXml(from.city || '')}</city>
        </loadingAddress>
        <deliveryAddress>
          <street>${this.escapeXml(to.street || '')}</street>
          <number>${this.escapeXml(to.number || '1')}</number>
          <postalCode>${this.escapeXml(to.postalCode || '')}</postalCode>
          <city>${this.escapeXml(to.city || '')}</city>
        </deliveryAddress>
      </otherDeliveryNoteHeader>`;
    }

    // 4. Payment Methods (Omitted on 9.3 movement notes, mandatory for commercial)
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
    const rawLines = data.lines && data.lines.length > 0
      ? data.lines
      : [{ description: 'Εμπορεύματα', quantity: 1, netValue: 0 }];

    const linesXml = rawLines
      .map((line: any, idx: number) => {
        const lineNum = idx + 1;
        const qty = Number(line.quantity || 1);
        const unit = line.unitMeasurement || line.measurementUnit || 1;

        if (is93) {
          const itemDescr = this.escapeXml(line.description || line.itemDescr || 'Εμπορεύματα');
          return `    <invoiceDetails>
      <lineNumber>${lineNum}</lineNumber>
      <itemDescr>${itemDescr}</itemDescr>
      <quantity>${qty.toFixed(2)}</quantity>
      <measurementUnit>${unit}</measurementUnit>
      <netValue>0.00</netValue>
      <vatCategory>8</vatCategory>
      <vatAmount>0.00</vatAmount>
      <incomeClassification>
        <icls:classificationCategory>category3</icls:classificationCategory>
        <icls:amount>0.00</icls:amount>
      </incomeClassification>
    </invoiceDetails>`;
        }

        const net = Number(line.netValue || 0).toFixed(2);
        const vat = Number(line.vatAmount || 0).toFixed(2);
        const vatCat = Number(line.vatRateCategory ?? line.vatCategory ?? 1);

        const e3 = 'E3_561_001';
        const cat = isServiceInvoice ? 'category1_3' : 'category1_1';

        // Quantity and unit are omitted strictly on service invoices (2.1, 11.2)
        const qtyAndUnitTags = isServiceInvoice
          ? ''
          : `\n      <quantity>${qty.toFixed(2)}</quantity>\n      <measurementUnit>${unit}</measurementUnit>`;

        return `    <invoiceDetails>
      <lineNumber>${lineNum}</lineNumber>${qtyAndUnitTags}
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
    const grossSummary = isMovementOnly ? '0.00' : Number(data.totals?.totalGrossValue || 0).toFixed(2);

    let summaryClassificationXml = '';
    if (is93) {
      summaryClassificationXml = `
      <incomeClassification>
        <icls:classificationCategory>category3</icls:classificationCategory>
        <icls:amount>0.00</icls:amount>
      </incomeClassification>`;
    } else {
      const summaryE3 = 'E3_561_001';
      const summaryCat = isServiceInvoice ? 'category1_3' : 'category1_1';

      summaryClassificationXml = `
      <incomeClassification>
        <icls:classificationType>${summaryE3}</icls:classificationType>
        <icls:classificationCategory>${summaryCat}</icls:classificationCategory>
        <icls:amount>${netSummary}</icls:amount>
      </incomeClassification>`;
    }

    // 7. Strict Summary Child Sequence
    const summaryXml = `    <invoiceSummary>
      <totalNetValue>${netSummary}</totalNetValue>
      <totalVatAmount>${vatSummary}</totalVatAmount>
      <totalWithheldAmount>0.00</totalWithheldAmount>
      <totalFeesAmount>0.00</totalFeesAmount>
      <totalStampDutyAmount>0.00</totalStampDutyAmount>
      <totalOtherTaxesAmount>0.00</totalOtherTaxesAmount>
      <totalDeductionsAmount>0.00</totalDeductionsAmount>
      <totalGrossValue>${grossSummary}</totalGrossValue>${summaryClassificationXml}
    </invoiceSummary>`;

    // 8. Document Assembly
    return `<?xml version="1.0" encoding="UTF-8"?>
<InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0" xmlns:icls="https://www.aade.gr/myDATA/incomeClassificaton/v1.0">
  <invoice>
${issuerXml}${counterpartXml}
    <invoiceHeader>${headerTags}
    </invoiceHeader>${paymentMethodsXml}
${linesXml}
${summaryXml}
  </invoice>
</InvoicesDoc>`.trim();
  }

  public parseCancelResponse(xmlText: string): { success: boolean; cancellationMark?: string; error?: string } {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    const getVal = (tag: string) =>
      xmlDoc.getElementsByTagName(tag)[0]?.textContent ||
      xmlDoc.querySelector(tag)?.textContent ||
      '';

    const statusCode = getVal('statusCode');
    const cancellationMark = getVal('cancellationMark');

    if (statusCode === 'Success' && cancellationMark) {
      return { success: true, cancellationMark };
    }

    const errorMsg = getVal('message') || getVal('code') || 'Unknown AADE cancellation error';
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
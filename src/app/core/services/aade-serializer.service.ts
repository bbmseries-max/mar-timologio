import { Injectable } from '@angular/core';
import {
  InvoiceLineItem,
  GoodsMovementData,
  InvoiceTotals,
  InvoiceDocument,
  Customer,
} from '../models/aade.models';

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
  /**
   * Generates the official InvoicesDoc XML string mandated by AADE myDATA v1.0.8+.
   */
  public serializeToXml(invoice: InvoiceDocument | any, issuerAfm: string): string {
    return this.generateInvoicesDocXml({
      series: invoice.series,
      documentNumber: invoice.documentNumber,
      issueDate: invoice.issueDate,
      invoiceType: invoice.invoiceType || invoice.documentType || '9.1',
      currency: invoice.currency || 'EUR',
      issuer: {
        afm: issuerAfm,
        country: 'GR',
        branch: 0,
      },
      counterpart: invoice.customer,
      lines: invoice.lines,
      totals: invoice.totals,
      paymentMethodType: invoice.paymentMethod?.type ?? 1,
      movement: invoice.movement,
    });
  }

  public generateInvoicesDocXml(data: InvoiceDocPayload): string {
    const isMovementOnly = data.invoiceType === '9.1';
    const isMovementDoc = data.invoiceType === '1.2' || data.invoiceType === '9.1';

    // 1. Transport Details (Mandatory for 9.1 and 1.2)
    let transportXml = '';
    if (isMovementDoc && data.movement) {
      const dispatchDate = data.movement.dispatchDateTime
        ? data.movement.dispatchDateTime.split('T')[0]
        : data.issueDate;
      const dispatchTime = data.movement.dispatchDateTime?.includes('T')
        ? `${data.movement.dispatchDateTime.split('T')[1].slice(0, 5)}:00`
        : '08:00:00';

      transportXml = `\n    <otherTransportDetails>
      <vehicleNumber>${this.escapeXml(data.movement.vehicleNumber?.trim() || '')}</vehicleNumber>
      <movementPurpose>${data.movement.movePurpose ?? 6}</movementPurpose>
      <dispatchDate>${dispatchDate}</dispatchDate>
      <dispatchTime>${dispatchTime}</dispatchTime>
      <loadingAddress>
        <street>${this.escapeXml(data.movement.addressFrom?.street || '')}</street>
        <number>${this.escapeXml(data.movement.addressFrom?.number || '')}</number>
        <postalCode>${this.escapeXml(data.movement.addressFrom?.postalCode || '')}</postalCode>
        <city>${this.escapeXml(data.movement.addressFrom?.city || '')}</city>
      </loadingAddress>
      <deliveryAddress>
        <street>${this.escapeXml(data.movement.addressTo?.street || '')}</street>
        <number>${this.escapeXml(data.movement.addressTo?.number || '')}</number>
        <postalCode>${this.escapeXml(data.movement.addressTo?.postalCode || '')}</postalCode>
        <city>${this.escapeXml(data.movement.addressTo?.city || '')}</city>
      </deliveryAddress>
    </otherTransportDetails>`;
    }

    // 2. Payment Methods: STRICTLY OMITTED for Type 9.1
    let paymentMethodsXml = '';
    if (!isMovementOnly) {
      const paymentType = data.paymentMethodType ?? 1;
      paymentMethodsXml = `\n    <paymentMethods>
      <paymentMethodDetails>
        <type>${paymentType}</type>
        <amount>${data.totals.totalGrossValue.toFixed(2)}</amount>
      </paymentMethodDetails>
    </paymentMethods>`;
    }

    // 3. Line Items: 9.1 requires quantity/unit, zero values, and NO incomeClassification
    const linesXml = data.lines
      .map((line, idx) => {
        const lineNum = line.lineNumber || idx + 1;
        const vatCategory = line.vatRateCategory ?? 1;
        const quantity = Number(line.quantity) || 1;
        // 1 = Pieces (Τεμάχια), 2 = Kilograms (Κιλά)
        const measurementUnit = (line as any).isWeighted ? 2 : 1;

        if (isMovementOnly) {
          return `      <invoiceDetails>
        <lineNumber>${lineNum}</lineNumber>
        <quantity>${quantity}</quantity>
        <measurementUnit>${measurementUnit}</measurementUnit>
        <netValue>0.00</netValue>
        <vatCategory>${vatCategory}</vatCategory>
        <vatAmount>0.00</vatAmount>
      </invoiceDetails>`;
        }

        // Standard financial line (1.1, 1.2, etc.)
        const exemptionXml =
          vatCategory === 7 || vatCategory === 8
            ? `\n        <vatExemptionCategory>14</vatExemptionCategory>`
            : '';

        const classificationType =
          line.incomeClassification?.classificationType ?? 'E3_561_001';
        const classificationCategory =
          line.incomeClassification?.classificationCategory ?? 'category1_1';
        const classificationAmount =
          line.incomeClassification?.amount ?? line.netValue;

        return `      <invoiceDetails>
        <lineNumber>${lineNum}</lineNumber>
        <quantity>${quantity}</quantity>
        <measurementUnit>${measurementUnit}</measurementUnit>
        <netValue>${line.netValue.toFixed(2)}</netValue>
        <vatCategory>${vatCategory}</vatCategory>
        <vatAmount>${line.vatAmount.toFixed(2)}</vatAmount>${exemptionXml}
        <incomeClassification>
          <classificationType>${classificationType}</classificationType>
          <classificationCategory>${classificationCategory}</classificationCategory>
          <amount>${classificationAmount.toFixed(2)}</amount>
        </incomeClassification>
      </invoiceDetails>`;
      })
      .join('\n');

    // 4. Totals Summary: 0.00 across the board for 9.1
    const netSummary = isMovementOnly ? '0.00' : data.totals.totalNetValue.toFixed(2);
    const vatSummary = isMovementOnly ? '0.00' : data.totals.totalVatAmount.toFixed(2);
    const grossSummary = isMovementOnly ? '0.00' : data.totals.totalGrossValue.toFixed(2);

    return `<?xml version="1.0" encoding="UTF-8"?>
<InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <invoice>
    <issuer>
      <vatNumber>${this.escapeXml(data.issuer.afm)}</vatNumber>
      <country>${data.issuer.country || 'GR'}</country>
      <branch>${data.issuer.branch ?? 0}</branch>
    </issuer>
    <counterpart>
      <vatNumber>${this.escapeXml(data.counterpart.afm)}</vatNumber>
      <country>${data.counterpart.country || 'GR'}</country>
      <branch>${data.counterpart.branch ?? 0}</branch>
      <address>
        <street>${this.escapeXml(data.counterpart.address?.street || '')}</street>
        <number>${this.escapeXml(data.counterpart.address?.number || '')}</number>
        <postalCode>${this.escapeXml(data.counterpart.address?.postalCode || '')}</postalCode>
        <city>${this.escapeXml(data.counterpart.address?.city || '')}</city>
      </address>
    </counterpart>
    <invoiceHeader>
      <series>${this.escapeXml(data.series)}</series>
      <aa>${data.documentNumber}</aa>
      <issueDate>${data.issueDate}</issueDate>
      <invoiceType>${data.invoiceType}</invoiceType>
      <currency>${data.currency}</currency>
      ${isMovementDoc ? '<isMovementDoc>true</isMovementDoc>' : ''}
    </invoiceHeader>${paymentMethodsXml}${transportXml}
${linesXml}
    <invoiceSummary>
      <totalNetValue>${netSummary}</totalNetValue>
      <totalVatAmount>${vatSummary}</totalVatAmount>
      <totalWithheldAmount>0.00</totalWithheldAmount>
      <totalOtherTaxesAmount>0.00</totalOtherTaxesAmount>
      <totalStampDutyAmount>0.00</totalStampDutyAmount>
      <totalFeesAmount>0.00</totalFeesAmount>
      <totalDeductionsAmount>0.00</totalDeductionsAmount>
      <totalGrossValue>${grossSummary}</totalGrossValue>
    </invoiceSummary>
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
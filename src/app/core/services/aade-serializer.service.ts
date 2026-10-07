import { Injectable } from '@angular/core';
import { InvoiceLineItem, GoodsMovementData, InvoiceTotals, InvoiceDocument, Customer } from '../models/aade.models';


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
   * Generates the official InvoicesDoc XML string mandated by AADE myDATA v1.0.8.
   */
  public serializeToXml(invoice: InvoiceDocument | any, issuerAfm: string): string {
    return this.generateInvoicesDocXml({
      series: invoice.series,
      documentNumber: invoice.documentNumber,
      issueDate: invoice.issueDate,
      invoiceType: invoice.invoiceType,
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
    const paymentType = data.paymentMethodType ?? 1;

    // Movement XML fragment for 1.2 and 9.1
    const isMovementDoc = data.invoiceType === '1.2' || data.invoiceType === '9.1';
    let transportXml = '';
    if (isMovementDoc && data.movement) {
      transportXml = `
    <otherTransportDetails>
      <vehicleNumber>${this.escapeXml(data.movement.vehicleNumber)}</vehicleNumber>
      <movementPurpose>${data.movement.movePurpose}</movementPurpose>
      <dispatchDate>${data.movement.dispatchDateTime.split('T')[0] || data.issueDate}</dispatchDate>
      <dispatchTime>${data.movement.dispatchDateTime.split('T')[1] || '08:00'}:00</dispatchTime>
      <loadingAddress>
        <street>${this.escapeXml(data.movement.addressFrom.street)}</street>
        <number>${this.escapeXml(data.movement.addressFrom.number)}</number>
        <postalCode>${this.escapeXml(data.movement.addressFrom.postalCode)}</postalCode>
        <city>${this.escapeXml(data.movement.addressFrom.city)}</city>
      </loadingAddress>
      <deliveryAddress>
        <street>${this.escapeXml(data.movement.addressTo.street)}</street>
        <number>${this.escapeXml(data.movement.addressTo.number)}</number>
        <postalCode>${this.escapeXml(data.movement.addressTo.postalCode)}</postalCode>
        <city>${this.escapeXml(data.movement.addressTo.city)}</city>
      </deliveryAddress>
    </otherTransportDetails>`;
    }

    const linesXml = data.lines
      .map((line) => {
        const vatCategory = line.vatRateCategory ?? 1;
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
        <lineNumber>${line.lineNumber}</lineNumber>
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
    </invoiceHeader>
    <paymentMethods>
      <paymentMethodDetails>
        <type>${paymentType}</type>
        <amount>${data.totals.totalGrossValue.toFixed(2)}</amount>
      </paymentMethodDetails>
    </paymentMethods>${transportXml}
${linesXml}
    <invoiceSummary>
      <totalNetValue>${data.totals.totalNetValue.toFixed(2)}</totalNetValue>
      <totalVatAmount>${data.totals.totalVatAmount.toFixed(2)}</totalVatAmount>
      <totalWithheldAmount>0.00</totalWithheldAmount>
      <totalOtherTaxesAmount>0.00</totalOtherTaxesAmount>
      <totalStampDutyAmount>0.00</totalStampDutyAmount>
      <totalFeesAmount>0.00</totalFeesAmount>
      <totalDeductionsAmount>0.00</totalDeductionsAmount>
      <totalGrossValue>${data.totals.totalGrossValue.toFixed(2)}</totalGrossValue>
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
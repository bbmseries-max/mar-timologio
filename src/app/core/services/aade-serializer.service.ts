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

    // 2. Identify Document Archetype
    const invType = String(invoice.invoiceType || parsedPayload.invoiceType || '1.1').trim();
    const isMovementOnly = invType === '9.3' || invType === '9.1' || invType === '9.2';
    const is12 = invType === '1.2';
    const isRetail = invType === '11.1' || invType === '11.2';

    // 3. Resolve Customer / Counterpart Object
    const rawCustomer =
      invoice.customer ||
      parsedPayload.customer ||
      invoice.counterparty ||
      invoice.counterpart ||
      {
        afm: invoice.customerAfm || parsedPayload.customerAfm,
        legalName: invoice.customerName || parsedPayload.customerName,
      };

    // Rule 243 Guard: If 1.2 (Intra-Community), counterpart country CANNOT be GR
    let counterpartCountry = (rawCustomer?.country || 'GR').toUpperCase();
    const customerVat = String(rawCustomer?.afm || rawCustomer?.vatNumber || '').trim();

    if (is12 && (counterpartCountry === 'GR' || !counterpartCountry)) {
      // Auto-extract leading 2-character country code if present (e.g., CY10253361B -> CY)
      const potentialPrefix = customerVat.slice(0, 2).toUpperCase();
      if (/^[A-Z]{2}$/.test(potentialPrefix) && potentialPrefix !== 'EL' && potentialPrefix !== 'GR') {
        counterpartCountry = potentialPrefix;
      } else {
        // Fallback default for sandbox testing of intra-community delivery
        counterpartCountry = 'CY';
      }
    }

    const cleanCounterpart = {
      ...rawCustomer,
      country: counterpartCountry,
      vatNumber: customerVat.replace(/^[A-Z]{2}/i, ''), // Clean VAT without prefix for XML
    };

    // 4. Resolve Lines First to Guarantee True Recalculation
    const resolvedLines: any[] = (invoice.lines && invoice.lines.length > 0)
      ? invoice.lines
      : (parsedPayload.lines || []);

    const netSum = resolvedLines.reduce((acc, l) => acc + Number(l.netValue || 0), 0);
    const vatSum = resolvedLines.reduce((acc, l) => acc + Number(l.vatAmount || 0), 0);
    const grossSum = resolvedLines.reduce((acc, l) => acc + Number(l.totalValue ?? (Number(l.netValue || 0) + Number(l.vatAmount || 0))), 0);

    // 5. Enforce Strict Financial Boundaries Per Document Type
    const safeNet = isMovementOnly ? 0 : Number((invoice.totalNet ?? parsedPayload.totalNet ?? netSum).toFixed(2));
    const safeVat = (isMovementOnly || is12) ? 0 : Number((invoice.totalVat ?? parsedPayload.totalVat ?? vatSum).toFixed(2));
    const safeGross = isMovementOnly ? 0 : (is12 ? safeNet : Number((invoice.totalGross ?? parsedPayload.totalGross ?? grossSum).toFixed(2)));

    // 6. Resolve Movement & Correlated Invoices
    const movementData = invoice.movement || parsedPayload.movement;
    const correlatedMark =
      movementData?.correlatedMark ||
      invoice.correlatedMark ||
      parsedPayload.correlatedMark ||
      invoice.correlatedInvoices ||
      parsedPayload.correlatedInvoices;

    const mergedMovement = movementData ? { ...movementData, correlatedMark } : (correlatedMark ? { correlatedMark } : undefined);

    // 7. Resolve Payment Method Type (1=Cash for Retail, 3=Transfer/Credit for B2B)
    const paymentMethodType =
      invoice.paymentMethod?.type ??
      parsedPayload.paymentMethod?.type ??
      invoice.paymentMethodType ??
      parsedPayload.paymentMethodType ??
      (isRetail ? 1 : 3);

    return this.generateInvoicesDocXml({
      series: invoice.series || parsedPayload.series || 'DEV',
      documentNumber: Number(invoice.documentNumber || parsedPayload.documentNumber) || 1,
      issueDate: invoice.issueDate || parsedPayload.issueDate || new Date().toISOString().substring(0, 10),
      invoiceType: invType,
      currency: invoice.currency || parsedPayload.currency || 'EUR',
      issuer: {
        afm: rawAfm,
        country: (issuerSettings?.country || 'GR').toUpperCase(),
        branch: Number(issuerSettings?.branch ?? 0),
      },
      counterpart: cleanCounterpart,
      lines: resolvedLines,
      totals: {
        totalNetValue: safeNet,
        totalVatAmount: safeVat,
        totalGrossValue: safeGross,
      },
      paymentMethodType,
      movement: mergedMovement,
    });
  }

  public generateInvoicesDocXml(data: any): string {
    const invType = String(data.invoiceType || '1.1').trim();
    const is93 = invType === '9.3';
    const is91 = invType === '9.1';
    const is92 = invType === '9.2';
    const is12 = invType === '1.2';

    // Pure movement documents (Zero value, no payment methods, category3)
    const isMovementOnly = is93 || is91 || is92;
    // Documents that carry vehicle, transport, & dispatch metadata
    const hasMovementDetails = isMovementOnly || is12;

    // Classification flags
    const isServiceInvoice = invType === '2.1' || invType === '11.2';
    const isRetailGoods = invType === '11.1';
    const isRetailServices = invType === '11.2';
    const isRetail = isRetailGoods || isRetailServices;

    // 1. Dynamic Issuer Construction
    const issuerAfm = String(data.issuer?.afm || '').replace(/\D/g, '').trim();
    if (!issuerAfm) {
      throw new Error('Issuer AFM is required for myDATA generation.');
    }
    const issuerCountry = (data.issuer?.country || 'GR').toUpperCase();
    const issuerBranch = Number(data.issuer?.branch ?? 0);

    // Dynamic loading address: movement form -> fallback to issuer profile
    const fromAddr = data.movement?.addressFrom || {};
    const issuerName = this.escapeXml(data.issuer?.name || data.issuer?.legalName || 'MARANTH MON IKE');
    const loadStreet = this.escapeXml((fromAddr.street || data.issuer?.street || '').trim());
    const loadNum    = this.escapeXml((fromAddr.number || data.issuer?.number || '1').trim());
    const loadZip    = this.escapeXml((fromAddr.postalCode || data.issuer?.postalCode || '').trim());
    const loadCity   = this.escapeXml((fromAddr.city || data.issuer?.city || '').trim());

    let issuerExtraXml = '';
    if (isMovementOnly) {
      issuerExtraXml = `
      <name>${issuerName}</name>
      <address>
        <street>${loadStreet}</street>
        <number>${loadNum}</number>
        <postalCode>${loadZip}</postalCode>
        <city>${loadCity}</city>
      </address>`;
    }

    const issuerXml = `    <issuer>
      <vatNumber>${issuerAfm}</vatNumber>
      <country>${issuerCountry}</country>
      <branch>${issuerBranch}</branch>${issuerExtraXml}
    </issuer>`;

    // 2. Dynamic Delivery / Counterpart Resolution (Reads straight from AFM lookup)
    const cp = data.counterpart || data.counterparty || data.customer || {};
    const rawCpAfm = cp?.afm || cp?.vatNumber || '';
    const toAddr = data.movement?.addressTo || {};

    // Prioritize manual edit in movement panel -> fallback directly to AFM lookup result
    const delStreet = this.escapeXml((toAddr.street || cp.street || cp.address?.street || '').trim());
    const rawDelNum = toAddr.number || cp.number || cp.address?.number || '1';
    const delNum    = this.escapeXml((rawDelNum && rawDelNum !== '0') ? rawDelNum : '1');
    const delZip    = this.escapeXml((toAddr.postalCode || cp.postalCode || cp.address?.postalCode || '').trim());
    const delCity   = this.escapeXml((toAddr.city || cp.city || cp.address?.city || '').trim());

    let counterpartXml = '';

    if (is92) {
      // Type 9.2: strictly 000000000 with destination address populated from AFM lookup
      counterpartXml = `\n    <counterpart>
      <vatNumber>000000000</vatNumber>
      <country>GR</country>
      <branch>0</branch>
      <name>ΣΥΓΚΕΝΤΡΩΤΙΚΗ ΔΙΑΚΙΝΗΣΗ</name>
      <address>
        <street>${delStreet}</street>
        <number>${delNum}</number>
        <postalCode>${delZip}</postalCode>
        <city>${delCity}</city>
      </address>
    </counterpart>`;
    } else if (rawCpAfm && String(rawCpAfm).replace(/\D/g, '').trim() !== '') {
      const cpAfm = String(rawCpAfm).replace(/\D/g, '').trim();
      const cpCountry = (cp.country || 'GR').toUpperCase();
      const isGreek = cpCountry === 'GR';

      const shouldIncludeName = !isGreek || isMovementOnly;
      const nameVal = cp.legalName || cp.name;
      const nameTag = (shouldIncludeName && nameVal)
        ? `\n      <name>${this.escapeXml(nameVal)}</name>`
        : '';

      const cpBranch = isNaN(Number(cp.branch)) ? 0 : Number(cp.branch);

      let addressXml = '';
      if (delStreet) {
        addressXml = `\n      <address>
        <street>${delStreet}</street>
        <number>${delNum}</number>
        <postalCode>${delZip}</postalCode>
        <city>${delCity}</city>
      </address>`;
      }

      counterpartXml = `\n    <counterpart>
      <vatNumber>${cpAfm}</vatNumber>
      <country>${cpCountry}</country>
      <branch>${cpBranch}</branch>${nameTag}${addressXml}
    </counterpart>`;
    }

    // 3. Header Construction & otherDeliveryNoteHeader
    let headerTags = `
      <series>${this.escapeXml(data.series || 'DEV')}</series>
      <aa>${data.documentNumber || 1}</aa>
      <issueDate>${data.issueDate}</issueDate>
      <invoiceType>${invType}</invoiceType>`;

    if (!isMovementOnly) {
      headerTags += `\n      <currency>${data.currency || 'EUR'}</currency>`;
    }

    // correlatedInvoices forbidden on 9.2, mandatory on 9.1
    const corrMark = data.movement?.correlatedMark || data.correlatedInvoices;
    if (corrMark && !is92) {
      headerTags += `\n      <correlatedInvoices>${this.escapeXml(String(corrMark).trim())}</correlatedInvoices>`;
    }

    if (hasMovementDetails && data.movement) {
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

      const movePurpose = Number(data.movement.movePurpose) || (isMovementOnly ? 4 : 1);
      headerTags += `\n      <movePurpose>${movePurpose}</movePurpose>`;

      if (movePurpose === 19 && data.movement.otherMovePurposeTitle) {
        headerTags += `\n      <otherMovePurposeTitle>${this.escapeXml(data.movement.otherMovePurposeTitle)}</otherMovePurposeTitle>`;
      }

      // Both loading and delivery addresses are purely dynamic from session & AFM lookup
      headerTags += `
      <otherDeliveryNoteHeader>
        <loadingAddress>
          <street>${loadStreet}</street>
          <number>${loadNum}</number>
          <postalCode>${loadZip}</postalCode>
          <city>${loadCity}</city>
        </loadingAddress>
        <deliveryAddress>
          <street>${delStreet}</street>
          <number>${delNum}</number>
          <postalCode>${delZip}</postalCode>
          <city>${delCity}</city>
        </deliveryAddress>
      </otherDeliveryNoteHeader>`;
    }

    // 4. Payment Methods (Omitted on pure movement notes; mandatory for commercial/retail)
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

        // Pure movement lines (9.1, 9.2, 9.3)
        if (isMovementOnly) {
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

        // Commercial Invoices (1.1, 1.2, 2.1, 11.1, 11.2)
        const net = Number(line.netValue || 0).toFixed(2);
        const vatCat = is12 ? 7 : Number(line.vatRateCategory ?? line.vatCategory ?? 1);
        const vat = (isMovementOnly || is12) ? '0.00' : Number(line.vatAmount || 0).toFixed(2);

        let e3 = 'E3_561_001';
        let cat = 'category1_1';

        if (is12) {
          e3 = 'E3_561_005';
          cat = 'category1_2';
        } else if (isRetailGoods) {
          e3 = 'E3_561_003';
          cat = 'category1_1';
        } else if (isRetailServices) {
          e3 = 'E3_561_003';
          cat = 'category1_3';
        } else if (isServiceInvoice) {
          e3 = 'E3_561_002';
          cat = 'category1_3';
        }

        let vatExemptionTag = '';
        if (vatCat === 7 || is12) {
          const exCode = line.vatExemptionCategory || 1;
          vatExemptionTag = `\n      <vatExemptionCategory>${exCode}</vatExemptionCategory>`;
        }

        const qtyAndUnitTags = isServiceInvoice
          ? ''
          : `\n      <quantity>${qty.toFixed(2)}</quantity>\n      <measurementUnit>${unit}</measurementUnit>`;

        return `    <invoiceDetails>
      <lineNumber>${lineNum}</lineNumber>${qtyAndUnitTags}
      <netValue>${net}</netValue>
      <vatCategory>${vatCat}</vatCategory>
      <vatAmount>${vat}</vatAmount>${vatExemptionTag}
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
    const vatSummary = (isMovementOnly || is12) ? '0.00' : Number(data.totals?.totalVatAmount || 0).toFixed(2);
    const grossSummary = isMovementOnly ? '0.00' : (is12 ? netSummary : Number(data.totals?.totalGrossValue || 0).toFixed(2));

    let summaryClassificationXml = '';
    if (isMovementOnly) {
      summaryClassificationXml = `
      <incomeClassification>
        <icls:classificationCategory>category3</icls:classificationCategory>
        <icls:amount>0.00</icls:amount>
      </incomeClassification>`;
    } else {
      let summaryE3 = 'E3_561_001';
      let summaryCat = 'category1_1';

      if (is12) {
        summaryE3 = 'E3_561_005';
        summaryCat = 'category1_2';
      } else if (isRetailGoods) {
        summaryE3 = 'E3_561_003';
        summaryCat = 'category1_1';
      } else if (isRetailServices) {
        summaryE3 = 'E3_561_003';
        summaryCat = 'category1_3';
      } else if (isServiceInvoice) {
        summaryE3 = 'E3_561_002';
        summaryCat = 'category1_3';
      }

      summaryClassificationXml = `
      <incomeClassification>
        <icls:classificationType>${summaryE3}</icls:classificationType>
        <icls:classificationCategory>${summaryCat}</icls:classificationCategory>
        <icls:amount>${netSummary}</icls:amount>
      </incomeClassification>`;
    }

    // 7. Strict Summary Sequence
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
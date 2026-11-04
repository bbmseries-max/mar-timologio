// src/app/services/mydata-xml-builder.ts

export interface InvoiceMovementData {
  vehicleNumber?: string;
  movePurpose?: number; // 1 = Sale, 6 = Movement, etc.
  dispatchDateTime?: string;
  correlatedMark?: string;
  addressFrom?: { street: string; number?: string; postalCode: string; city: string };
  addressTo?: { street: string; number?: string; postalCode: string; city: string };
}

export interface InvoiceLineItem {
  lineNumber?: number;
  description?: string;
  quantity?: number;
  unitMeasurement?: string | number;
  unitPrice?: number;
  netValue: number;
  vatCategory?: number;        // 1 = 24%, 2 = 13%, 3 = 6%, etc.
  vatRateCategory?: number;    // fallback compatibility
  vatAmount: number;
  classificationType?: string;      // e.g. 'E3_561_001', 'E3_561_003'
  classificationCategory?: string;  // e.g. 'category1_1', 'category1_3'
  incomeClassification?: {
    classificationType?: string;
    classificationCategory?: string;
    amount?: number;
  };
}

export interface InvoicePayload {
  series: string;
  aa: string | number;
  issueDate: string; // YYYY-MM-DD
  invoiceType: string; // '1.1', '2.1', '9.3', '11.1', etc.
  currency?: string;
  issuerAfm: string;
  issuerCountry?: string;
  issuerBranch?: number;
  counterpartAfm?: string;
  counterpartName?: string;
  counterpartCountry?: string;
  counterpartBranch?: number;
  counterpartAddress?: {
    street?: string;
    number?: string;
    postalCode?: string;
    city?: string;
  };
  movement?: InvoiceMovementData;
  lines: InvoiceLineItem[];
  totalNet: number;
  totalVat: number;
  totalGross: number;
  paymentMethodType?: number; // 1 = Cash, 3 = Bank, 5 = POS
}

export function buildInvoicesDocXml(data: InvoicePayload): string {
  const isType93 = data.invoiceType === '9.3' || data.invoiceType === '9.1';
  const isRetailService = data.invoiceType === '11.1' || data.invoiceType === '11.2';
  const isServiceInvoice = data.invoiceType === '2.1';

  // 1. Counterpart XML (Rules: Omit <name> for Greek AFM; Omit entire block if retail customer has no AFM)
  let counterpartXml = '';
  if (data.counterpartAfm && data.counterpartAfm.trim() !== '') {
    const cpCountry = data.counterpartCountry || 'GR';
    const isGreek = cpCountry === 'GR';

    // AADE Rule 220: <name> is strictly forbidden if counterpart is Greek
    const nameTag = (!isGreek && data.counterpartName)
      ? `<name>${escapeXml(data.counterpartName)}</name>`
      : '';

    let addressXml = '';
    if (data.counterpartAddress?.street) {
      addressXml = `
      <address>
        <street>${escapeXml(data.counterpartAddress.street)}</street>
        <number>${escapeXml(data.counterpartAddress.number || '')}</number>
        <postalCode>${escapeXml(data.counterpartAddress.postalCode || '')}</postalCode>
        <city>${escapeXml(data.counterpartAddress.city || '')}</city>
      </address>`;
    }

    counterpartXml = `
    <counterpart>
      <vatNumber>${data.counterpartAfm.trim()}</vatNumber>
      <country>${cpCountry}</country>
      <branch>${data.counterpartBranch ?? 0}</branch>${nameTag}${addressXml}
    </counterpart>`;
  }

  // 2. Transport Header (Only for 9.3 or movement-bearing invoices)
  let transportHeaderXml = '';
  if (isType93 && data.movement) {
    const mv = data.movement;
    const loadingAddr = mv.addressFrom?.street
      ? `<loadingAddress>
          <street>${escapeXml(mv.addressFrom.street)}</street>
          <number>${escapeXml(mv.addressFrom.number || '')}</number>
          <postalCode>${escapeXml(mv.addressFrom.postalCode)}</postalCode>
          <city>${escapeXml(mv.addressFrom.city)}</city>
        </loadingAddress>`
      : '';

    const deliveryAddr = mv.addressTo?.street
      ? `<deliveryAddress>
          <street>${escapeXml(mv.addressTo.street)}</street>
          <number>${escapeXml(mv.addressTo.number || '')}</number>
          <postalCode>${escapeXml(mv.addressTo.postalCode)}</postalCode>
          <city>${escapeXml(mv.addressTo.city)}</city>
        </deliveryAddress>`
      : '';

    transportHeaderXml = `
      <otherDeliveryNoteHeader>
        ${loadingAddr}
        ${deliveryAddr}
        <startDateTime>${mv.dispatchDateTime || data.issueDate + 'T08:00:00'}</startDateTime>
        <vehicleNumber>${escapeXml(mv.vehicleNumber || '')}</vehicleNumber>
        <movePurpose>${mv.movePurpose || 1}</movePurpose>
      </otherDeliveryNoteHeader>`;
  }

  // 3. Payment Methods (Omitted for 9.3 movement notes, mandatory for 1.1, 2.1, 11.1)
  let paymentMethodsXml = '';
  if (!isType93) {
    const payType = data.paymentMethodType ?? (isRetailService ? 1 : 3);
    paymentMethodsXml = `
    <paymentMethods>
      <paymentMethodDetails>
        <type>${payType}</type>
        <amount>${data.totalGross.toFixed(2)}</amount>
      </paymentMethodDetails>
    </paymentMethods>`;
  }

  // 4. Line Items XML
  const lineItemsXml = data.lines
    .map((line, index) => {
      const lineNum = line.lineNumber ?? (index + 1);
      const net = Number(line.netValue || 0).toFixed(2);
      const vatAmt = Number(line.vatAmount || 0).toFixed(2);
      const vatCat = line.vatCategory ?? line.vatRateCategory ?? (isType93 ? 8 : 1);

      // AADE Rule 247: <itemDescr> is ONLY allowed on Type 9.3 Delivery Notes
      const itemDescrTag = (isType93 && line.description)
        ? `\n      <itemDescr>${escapeXml(line.description)}</itemDescr>`
        : '';

      const recTypeTag = isType93 ? '\n      <recType>6</recType>' : '';

      // Determine classification according to document type:
      // 1.1 => category1_1 (Goods/Merchandise)
      // 2.1 => category1_3 (Services)
      // 11.1 => category1_3 (Retail Services)
      let classificationXml = '';
      if (!isType93) {
        const defaultCategory = (isServiceInvoice || isRetailService) ? 'category1_3' : 'category1_1';
        const defaultType = (isServiceInvoice || isRetailService) ? 'E3_561_003' : 'E3_561_001';

        const classCat = line.incomeClassification?.classificationCategory || line.classificationCategory || defaultCategory;
        const classType = line.incomeClassification?.classificationType || line.classificationType || defaultType;

        classificationXml = `
      <incomeClassification>
        <ic:classificationType>${classType}</ic:classificationType>
        <ic:classificationCategory>${classCat}</ic:classificationCategory>
        <ic:amount>${net}</ic:amount>
      </incomeClassification>`;
      }

      return `
    <invoiceDetails>
      <lineNumber>${lineNum}</lineNumber>${recTypeTag}${itemDescrTag}
      <netValue>${net}</netValue>
      <vatCategory>${vatCat}</vatCategory>
      <vatAmount>${vatAmt}</vatAmount>${classificationXml}
    </invoiceDetails>`;
    })
    .join('');

  // 5. Summary Income Classification (Omitted for 9.3)
  let summaryClassificationXml = '';
  if (!isType93) {
    const defaultCategory = (isServiceInvoice || isRetailService) ? 'category1_3' : 'category1_1';
    const defaultType = (isServiceInvoice || isRetailService) ? 'E3_561_003' : 'E3_561_001';

    summaryClassificationXml = `
      <incomeClassification>
        <ic:classificationType>${defaultType}</ic:classificationType>
        <ic:classificationCategory>${defaultCategory}</ic:classificationCategory>
        <ic:amount>${data.totalNet.toFixed(2)}</ic:amount>
      </incomeClassification>`;
  }

  // 6. Strict XSD-ordered InvoiceSummary
  // Order: totalNetValue -> totalVatAmount -> totalWithheldAmount -> totalOtherTaxesAmount -> totalStampDutyAmount -> totalFeesAmount -> totalDeductionsAmount -> totalGrossValue
  const invoiceSummaryXml = `
    <invoiceSummary>
      <totalNetValue>${data.totalNet.toFixed(2)}</totalNetValue>
      <totalVatAmount>${data.totalVat.toFixed(2)}</totalVatAmount>
      <totalWithheldAmount>0.00</totalWithheldAmount>
      <totalOtherTaxesAmount>0.00</totalOtherTaxesAmount>
      <totalStampDutyAmount>0.00</totalStampDutyAmount>
      <totalFeesAmount>0.00</totalFeesAmount>
      <totalDeductionsAmount>0.00</totalDeductionsAmount>
      <totalGrossValue>${data.totalGross.toFixed(2)}</totalGrossValue>${summaryClassificationXml}
    </invoiceSummary>`;

  // 7. Full Document Envelope
  return `<?xml version="1.0" encoding="UTF-8"?>
<InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0"
             xmlns:ic="https://www.aade.gr/myDATA/incomeClassificaton/v1.0">
  <invoice>
    <issuer>
      <vatNumber>${data.issuerAfm}</vatNumber>
      <country>${data.issuerCountry || 'GR'}</country>
      <branch>${data.issuerBranch ?? 0}</branch>
    </issuer>${counterpartXml}
    <invoiceHeader>
      <series>${data.series}</series>
      <aa>${data.aa}</aa>
      <issueDate>${data.issueDate}</issueDate>
      <invoiceType>${data.invoiceType}</invoiceType>
      <currency>${data.currency || 'EUR'}</currency>${transportHeaderXml}
    </invoiceHeader>${paymentMethodsXml}
    ${lineItemsXml}
    ${invoiceSummaryXml}
  </invoice>
</InvoicesDoc>`.trim();
}

function escapeXml(unsafe: string | number): string {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
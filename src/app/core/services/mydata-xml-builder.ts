// src/app/services/mydata-xml-builder.ts

export interface InvoiceLineItem {
  lineNumber?: number;
  netValue: number;
  vatCategory?: number;       // 1 = 24%, 2 = 13%, 3 = 6%, etc.
  vatRateCategory?: number;   // fallback compatibility
  vatAmount: number;
  classificationType?: string;      // e.g. 'E3_561_001'
  classificationCategory?: string;  // e.g. 'category1_1'
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
  invoiceType: string; // '1.1', '9.1', etc.
  currency: string;
  issuerAfm: string;
  counterpartAfm: string;
  lines: InvoiceLineItem[];
  totalNet: number;
  totalVat: number;
  totalGross: number;
  mydataMark?: string;
  mydataUid?: string;
  mydataQrUrl?: string;
  mydataTransmittedAt?: string;
  mydataStatus?: 'DRAFT' | 'TRANSMITTED' | 'FAILED';
}

export function buildInvoicesDocXml(data: InvoicePayload): string {
  const isDispatch = data.invoiceType === '9.1';

  // 1. Build line items XML dynamically
  const lineItemsXml = data.lines
    .map((line, index) => {
      const lineNum = line.lineNumber ?? (index + 1);
      const net = Number(line.netValue || 0).toFixed(2);
      const vatAmt = Number(line.vatAmount || 0).toFixed(2);
      const vatCat = line.vatCategory ?? line.vatRateCategory ?? 1;
      const recTypeTag = isDispatch ? '<recType>6</recType>' : '';

      let classificationXml = '';
      if (!isDispatch) {
        const classType =
          line.incomeClassification?.classificationType ||
          line.classificationType ||
          'E3_561_001';
        const classCat =
          line.incomeClassification?.classificationCategory ||
          line.classificationCategory ||
          'category1_1';
        classificationXml = `
      <incomeClassification>
        <ic:classificationType>${classType}</ic:classificationType>
        <ic:classificationCategory>${classCat}</ic:classificationCategory>
        <ic:amount>${net}</ic:amount>
      </incomeClassification>`;
      }

      return `
    <invoiceDetails>
      <lineNumber>${lineNum}</lineNumber>
      ${recTypeTag}
      <netValue>${net}</netValue>
      <vatCategory>${vatCat}</vatCategory>
      <vatAmount>${vatAmt}</vatAmount>${classificationXml}
    </invoiceDetails>`;
    })
    .join('');

  // 2. Summary Income Classification (Omitted for 9.1 Dispatch Notes)
  const summaryIncomeClassificationXml = isDispatch
    ? ''
    : `
      <incomeClassification>
        <ic:classificationType>E3_561_001</ic:classificationType>
        <ic:classificationCategory>category1_1</ic:classificationCategory>
        <ic:amount>${data.totalNet.toFixed(2)}</ic:amount>
      </incomeClassification>`;

  // 3. Assemble root XML
  return `<?xml version="1.0" encoding="UTF-8"?>
<InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0"
             xmlns:ic="https://www.aade.gr/myDATA/incomeClassificaton/v1.0">
  <invoice>
    <issuer>
      <vatNumber>${data.issuerAfm}</vatNumber>
      <country>GR</country>
      <branch>0</branch>
    </issuer>
    <counterpart>
      <vatNumber>${data.counterpartAfm}</vatNumber>
      <country>GR</country>
      <branch>0</branch>
    </counterpart>
    <invoiceHeader>
      <series>${data.series}</series>
      <aa>${data.aa}</aa>
      <issueDate>${data.issueDate}</issueDate>
      <invoiceType>${data.invoiceType}</invoiceType>
      <currency>${data.currency || 'EUR'}</currency>
    </invoiceHeader>
    <paymentMethods>
      <paymentMethodDetails>
        <type>1</type>
        <amount>${data.totalGross.toFixed(2)}</amount>
      </paymentMethodDetails>
    </paymentMethods>
    ${lineItemsXml}
    <invoiceSummary>
      <totalNetValue>${data.totalNet.toFixed(2)}</totalNetValue>
      <totalVatAmount>${data.totalVat.toFixed(2)}</totalVatAmount>
      <totalWithheldAmount>0.00</totalWithheldAmount>
      <totalFeesAmount>0.00</totalFeesAmount>
      <totalStampDutyAmount>0.00</totalStampDutyAmount>
      <totalOtherTaxesAmount>0.00</totalOtherTaxesAmount>
      <totalDeductionsAmount>0.00</totalDeductionsAmount>
      <totalGrossValue>${data.totalGross.toFixed(2)}</totalGrossValue>${summaryIncomeClassificationXml}
    </invoiceSummary>
  </invoice>
</InvoicesDoc>`.trim();
}
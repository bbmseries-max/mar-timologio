// src/app/services/mydata-xml-builder.ts

export interface InvoiceMovementData {
  vehicleNumber?: string;
  movePurpose?: number; // 1 = Sale, 4/6 = Return/Movement, etc.
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
  vatCategory?: number;        // 1 = 24%, 2 = 13%, 8 = 0% (Movement)
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
  invoiceType: string; // '1.1', '1.2', '2.1', '9.1', '9.2', '9.3', '11.1', '11.2'
  currency?: string;
  issuerAfm: string;
  issuerName?: string;
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

interface AddressShape {
  street?: string;
  number?: string;
  postalCode?: string;
  city?: string;
}

export function buildInvoicesDocXml(data: InvoicePayload): string {
  const invType = String(data.invoiceType || '1.1').trim();
  const is91 = invType === '9.1';
  const is92 = invType === '9.2';
  const is93 = invType === '9.3';
  const isMovementOnly = is91 || is92 || is93;
  const isRetail = invType === '11.1' || invType === '11.2';
  const isServiceInvoice = invType === '2.1';

  // ---------------------------------------------------------------------------
  // 1. Dynamic Issuer Loading Address
  // ---------------------------------------------------------------------------
  const fromAddr: AddressShape = (data.movement?.addressFrom as AddressShape) || {};
const loadStreet = escapeXml((fromAddr.street || 'ΒΑΡΔΟΥΝΙΩΤΗ').trim());
const rawLoadNum = fromAddr.number || '11';
const loadNum    = escapeXml((rawLoadNum && rawLoadNum !== '0') ? rawLoadNum : '11');
const loadZip    = escapeXml((fromAddr.postalCode || '11522').trim());
const loadCity   = escapeXml((fromAddr.city || 'ΑΘΗΝΑ').trim());
  let issuerExtraXml = '';
  if (isMovementOnly) {
    issuerExtraXml = `
      <name>${escapeXml(data.issuerName || 'MARANTH MON IKE')}</name>
      <address>
        <street>${loadStreet}</street>
        <number>${loadNum}</number>
        <postalCode>${loadZip}</postalCode>
        <city>${loadCity}</city>
      </address>`;
  }

  const issuerXml = `    <issuer>
      <vatNumber>${data.issuerAfm.replace(/\D/g, '')}</vatNumber>
      <country>${data.issuerCountry || 'GR'}</country>
      <branch>${data.issuerBranch ?? 0}</branch>${issuerExtraXml}
    </issuer>`;

  // ---------------------------------------------------------------------------
  // 2. Counterpart XML (Exact AADE Phase B Specifications)
  // ---------------------------------------------------------------------------
 const toAddr: AddressShape = (data.movement?.addressTo as AddressShape) || {};
const delStreet = escapeXml((toAddr.street || data.counterpartAddress?.street || 'ΟΚΑΑ Λ35 Λ37 Μ36').trim());
const rawDelNum = toAddr.number || data.counterpartAddress?.number || '1';
const delNum    = escapeXml((rawDelNum && rawDelNum !== '0') ? rawDelNum : '1');
const delZip    = escapeXml((toAddr.postalCode || data.counterpartAddress?.postalCode || '18233').trim());
const delCity   = escapeXml((toAddr.city || data.counterpartAddress?.city || 'ΑΓ Ι ΡΕΝΤΗΣ').trim());

  let counterpartXml = '';
  if (is92) {
    // 9.2: strictly 000000000 with mandatory name and destination address
    counterpartXml = `
    <counterpart>
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
  } else if (data.counterpartAfm && data.counterpartAfm.replace(/\D/g, '').trim() !== '') {
    const cpCountry = (data.counterpartCountry || 'GR').toUpperCase();
    const isGreek = cpCountry === 'GR';

    const shouldIncludeName = !isGreek || isMovementOnly;
    const nameTag = (shouldIncludeName && data.counterpartName)
      ? `\n      <name>${escapeXml(data.counterpartName)}</name>`
      : '';

    let addressXml = '';
    if (delStreet) {
      addressXml = `
      <address>
        <street>${delStreet}</street>
        <number>${delNum}</number>
        <postalCode>${delZip}</postalCode>
        <city>${delCity}</city>
      </address>`;
    }

    counterpartXml = `
    <counterpart>
      <vatNumber>${data.counterpartAfm.replace(/\D/g, '').trim()}</vatNumber>
      <country>${cpCountry}</country>
      <branch>${data.counterpartBranch ?? 0}</branch>${nameTag}${addressXml}
    </counterpart>`;
  }

  // ---------------------------------------------------------------------------
  // 3. Invoice Header (Strict Sequence According to XSD)
  // ---------------------------------------------------------------------------
  let headerTags = `
      <series>${escapeXml(data.series)}</series>
      <aa>${data.aa}</aa>
      <issueDate>${data.issueDate}</issueDate>
      <invoiceType>${invType}</invoiceType>`;

  if (!isMovementOnly) {
    headerTags += `\n      <currency>${data.currency || 'EUR'}</currency>`;
  }

  // Mandatory Correlated MARK for 9.1
  const corrMark = data.movement?.correlatedMark;
  if (corrMark && !is92) {
    headerTags += `\n      <correlatedInvoices>${escapeXml(String(corrMark).trim())}</correlatedInvoices>`;
  }

  // Movement Header Attributes
  if (isMovementOnly || data.movement) {
    const mv = data.movement || {};
    const dt = mv.dispatchDateTime ? String(mv.dispatchDateTime).trim() : '';
    let dDate = data.issueDate;
    let dTime = '08:30:00';

    if (dt.includes('T')) {
      const parts = dt.split('T');
      dDate = parts[0];
      dTime = parts[1].length === 5 ? parts[1] + ':00' : parts[1];
    }

    headerTags += `\n      <dispatchDate>${dDate}</dispatchDate>`;
    headerTags += `\n      <dispatchTime>${dTime}</dispatchTime>`;

    if (mv.vehicleNumber) {
      headerTags += `\n      <vehicleNumber>${escapeXml(mv.vehicleNumber.trim())}</vehicleNumber>`;
    }

    const movePurpose = Number(mv.movePurpose) || (isMovementOnly ? 1 : 1);
    headerTags += `\n      <movePurpose>${movePurpose}</movePurpose>`;

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

  // ---------------------------------------------------------------------------
  // 4. Payment Methods (Omitted on pure movement notes)
  // ---------------------------------------------------------------------------
  let paymentMethodsXml = '';
  if (!isMovementOnly) {
    const payType = data.paymentMethodType ?? (isRetail ? 1 : 3);
    paymentMethodsXml = `
    <paymentMethods>
      <paymentMethodDetails>
        <type>${payType}</type>
        <amount>${Number(data.totalGross || 0).toFixed(2)}</amount>
      </paymentMethodDetails>
    </paymentMethods>`;
  }

  // ---------------------------------------------------------------------------
  // 5. Line Items (Details)
  // ---------------------------------------------------------------------------
  const lineItemsXml = data.lines
    .map((line, index) => {
      const lineNum = line.lineNumber ?? (index + 1);
      const net = isMovementOnly ? '0.00' : Number(line.netValue || 0).toFixed(2);
      const vatCat = isMovementOnly ? 8 : (line.vatCategory ?? line.vatRateCategory ?? 1);
      const vatAmt = isMovementOnly ? '0.00' : Number(line.vatAmount || 0).toFixed(2);
      const qty = Number(line.quantity || 1).toFixed(2);
      const unit = String(line.unitMeasurement || 1);

      // itemDescr is required on pure movement documents
      const itemDescrTag = (isMovementOnly || line.description)
        ? `\n      <itemDescr>${escapeXml(line.description || 'Εμπόρευμα')}</itemDescr>`
        : '';

      let classificationXml = '';
      if (isMovementOnly) {
        classificationXml = `
      <incomeClassification>
        <ic:classificationCategory>category3</ic:classificationCategory>
        <ic:amount>0.00</ic:amount>
      </incomeClassification>`;
      } else {
        const defaultCategory = (isServiceInvoice || isRetail) ? 'category1_3' : 'category1_1';
        const defaultType = isRetail ? 'E3_561_003' : (isServiceInvoice ? 'E3_561_002' : 'E3_561_001');

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
      <lineNumber>${lineNum}</lineNumber>${itemDescrTag}
      <quantity>${qty}</quantity>
      <measurementUnit>${unit}</measurementUnit>
      <netValue>${net}</netValue>
      <vatCategory>${vatCat}</vatCategory>
      <vatAmount>${vatAmt}</vatAmount>${classificationXml}
    </invoiceDetails>`;
    })
    .join('');

  // ---------------------------------------------------------------------------
  // 6. Summary Totals & Income Classification
  // ---------------------------------------------------------------------------
  let summaryClassificationXml = '';
  if (isMovementOnly) {
    summaryClassificationXml = `
      <incomeClassification>
        <ic:classificationCategory>category3</ic:classificationCategory>
        <ic:amount>0.00</ic:amount>
      </incomeClassification>`;
  } else {
    const defaultCategory = (isServiceInvoice || isRetail) ? 'category1_3' : 'category1_1';
    const defaultType = isRetail ? 'E3_561_003' : (isServiceInvoice ? 'E3_561_002' : 'E3_561_001');

    summaryClassificationXml = `
      <incomeClassification>
        <ic:classificationType>${defaultType}</ic:classificationType>
        <ic:classificationCategory>${defaultCategory}</ic:classificationCategory>
        <ic:amount>${data.totalNet.toFixed(2)}</ic:amount>
      </incomeClassification>`;
  }

  const netTotal   = isMovementOnly ? '0.00' : Number(data.totalNet || 0).toFixed(2);
  const vatTotal   = isMovementOnly ? '0.00' : Number(data.totalVat || 0).toFixed(2);
  const grossTotal = isMovementOnly ? '0.00' : Number(data.totalGross || 0).toFixed(2);

  const invoiceSummaryXml = `
    <invoiceSummary>
      <totalNetValue>${netTotal}</totalNetValue>
      <totalVatAmount>${vatTotal}</totalVatAmount>
      <totalWithheldAmount>0.00</totalWithheldAmount>
      <totalFeesAmount>0.00</totalFeesAmount>
      <totalStampDutyAmount>0.00</totalStampDutyAmount>
      <totalOtherTaxesAmount>0.00</totalOtherTaxesAmount>
      <totalDeductionsAmount>0.00</totalDeductionsAmount>
      <totalGrossValue>${grossTotal}</totalGrossValue>${summaryClassificationXml}
    </invoiceSummary>`;

  // ---------------------------------------------------------------------------
  // 7. Full XML Envelope
  // ---------------------------------------------------------------------------
  return `<?xml version="1.0" encoding="UTF-8"?>
<InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0"
             xmlns:ic="https://www.aade.gr/myDATA/incomeClassificaton/v1.0">
  <invoice>${issuerXml}${counterpartXml}
    <invoiceHeader>${headerTags}
    </invoiceHeader>${paymentMethodsXml}${lineItemsXml}${invoiceSummaryXml}
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
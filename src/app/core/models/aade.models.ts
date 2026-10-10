// src/app/core/models/aade-types.ts

export type AadeInvoiceType =
  | '1.1' // Τιμολόγιο Πώλησης
  | '1.2' // Τιμολόγιο Πώλησης / Δελτίο Αποστολής
  | '2.1' // Τιμολόγιο Παροχής Υπηρεσιών
  | '5.1' // Πιστωτικό Τιμολόγιο
  | '9.1' // Δελτίο Αποστολής
  | 'PROFORMA'; // Internal non-fiscal quotation

export type VatRateCategory = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
// 1: 24%, 2: 13%, 3: 6%, 4: 17% (Islands), 5: 9% (Islands), 6: 4% (Islands), 7: 0%, 8: Without VAT

export type VatExemptionCategory =
  | 1  // Without VAT - article 3, 5, 22 etc.
  | 2  // Without VAT - article 4
  | 3  // Without VAT - article 5
  | 14 // Without VAT - article 39a (Electronics, Laptops, Mobile phones)
  | 15 // Without VAT - article 44 (Tobacco, telecom pre-payments)
  | 27; // Without VAT - other special provisions

export type IncomeClassificationType =
  | 'E3_561_001' // Πωλήσεις αγαθών και υπηρεσιών Χονδρικές
  | 'E3_561_003' // Παροχή υπηρεσιών
  | 'E3_562';     // Λοιπά συνήθη έσοδα

export type IncomeClassificationCategory =
  | 'category1_1' // Έσοδα από Πώληση Εμπορευμάτων
  | 'category1_2' // Έσοδα από Πώληση Προϊόντων
  | 'category1_3' // Έσοδα από Παροχή Υπηρεσιών
  | 'category1_95'; // Λοιπά Πληροφοριακά Στοιχεία Εσόδων

export type PaymentMethodCode =
  | 1 // Επαγ. Λογαριασμός Πληρωμών Ημεδαπής (Bank Transfer)
  | 3 // Μετρητά (Cash)
  | 4 // Επιταγή (Cheque)
  | 5 // Επί Πιστώσει (On Credit)
  | 7; // POS / e-Commerce Card

export interface Address {
  street: string;
  number: string;
  postalCode: string;
  city: string;
}

export interface Company {
  id: string;
  afm: string;
  branch: number;
  tradeName: string;
  legalName: string;
  doy: string;
  gemiNumber: string;
  address: Address;
  phone: string;
  email: string;
  logoUrl?: string;
  aadeSettings: {
    userId: string;
    subscriptionKey: string;
    isProduction: boolean;
  };
}

export interface Customer {
  id: string;
  afm: string;
  branch: number;
  legalName: string;
  tradeName?: string;
  doy: string;
  address: Address;
  country: string; // ISO 2-letter: 'GR' default
  email: string;
  phone?: string;
}

export interface InvoiceLineItem {
  id: string;
  lineNumber: number;
  sku?: string;
  description: string;
  quantity: number;
  unitMeasurement: '1' | '2' | '3'; // 1: Pieces (Τεμ), 2: Kg, 3: Hours
  unitPrice: number;
  discountPercentage: number;
  netValue: number;
  vatRateCategory: VatRateCategory;
  vatPercentage: number;
  vatAmount: number;
  vatExemptionCategory?: VatExemptionCategory;
  totalValue: number;
  incomeClassification?: {
    classificationType: IncomeClassificationType;
    classificationCategory: IncomeClassificationCategory;
    amount: number;
  };
}

export interface InvoiceTotals {
  totalNetValue: number;
  totalVatAmount: number;
  totalGrossValue: number;
  vatBreakdowns: {
    rateCategory: VatRateCategory;
    ratePercentage: number;
    netAmount: number;
    vatAmount: number;
  }[];
}

export interface AadeTransmissionResult {
  mark: string;
  uid: string;
  qrCodeUrl: string;
  transmittedAt: string;
  statusCode: 'SUCCESS' | 'REJECTED';
  errors?: { code: string; message: string }[];
}

export interface InvoiceDocument {
  id: string;
  companyId: string;
  series: string;
  documentNumber: number;
  issueDate: string; // YYYY-MM-DD
  invoiceType: AadeInvoiceType;
  currency: 'EUR';
  customer: Customer;
  lines: InvoiceLineItem[];
  totals: InvoiceTotals;
  paymentMethod: {
    type: PaymentMethodCode;
    amount: number;
  };
  aadeData?: AadeTransmissionResult;
}

export type MovementPurposeCode =
  | 1 // Πώληση (Sale)
  | 2 // Διακίνηση μεταξύ εγκαταστάσεων (Branch Transfer)
  | 3 // Αποθήκευση σε τρίτους (Third-party Storage)
  | 4 // Επεξεργασία / Συναρμολόγηση (Processing)
  | 5 // Δειγματισμός / Έκθεση (Sampling / Exhibition)
  | 6; // Επιστροφή (Return)

export interface GoodsMovementData {
  vehicleNumber: string;
  movePurpose: MovementPurposeCode;
  dispatchDateTime: string; // ISO or YYYY-MM-DDTHH:mm
  addressFrom: Address;
  addressTo: Address;
}
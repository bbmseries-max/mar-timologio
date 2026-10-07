export interface ColumnMappingConfig {
  nameCol: string;
  barcodeCol?: string;
  priceCol: string;
  vatCol?: string;
  isPriceGross: boolean; // true: price includes VAT; false: wholesale net
  defaultVatRate: number; // fallback e.g. 24 or 13
}

export interface ParsedRawRow {
  [columnName: string]: string | number | undefined | null;
}

export interface ImportPreviewItem {
  name: string;
  barcode?: string;
  rawPrice: number;
  netPrice: number;
  vatRate: number;
  grossPrice: number;
  isValid: boolean;
  validationError?: string;
}
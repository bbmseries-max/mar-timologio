import { Customer } from './aade.models';

export interface HandoverCartItem {
  name: string;
  barcode?: string;
  quantity: number;
  unitPrice: number; // Unit price (Net or Gross depending on isGross)
  discountPercentage?: number;
  vatRate?: number; // 24, 13, 6, 0
  isGross?: boolean; // If true, auto-converts to net
}

export interface HandoverCartPayload {
  sourceSystem?: string; // e.g. "Maranth POS", "WooCommerce", "Ex-Van Mobile"
  invoiceType?: string; // '1.1', '1.2', '9.1'
  customer?: Partial<Customer>;
  items: HandoverCartItem[];
  notes?: string;
}
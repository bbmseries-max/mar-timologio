export interface LocalInvoiceRecord {
  id: string; // UUID primary key
  tenantId: string;
  series: string;
  documentNumber: number;
  issueDate: string;
  invoiceType: string;
  customerAfm: string;
  customerName: string;
  totalNet: number;
  totalVat: number;
  totalGross: number;
  transmissionStatus: 'DRAFT' | 'TRANSMITTED' | 'FAILED';
  mark?: string;
  uid?: string;
  qrUrl?: string;
  payloadJson: string; // Complete serialized form snapshot
  updatedAt: number;
  createdAt: number;
}

export interface CompanySettingsRecord {
  id: string; // 'active_company'
  afm: string;
  legalName: string;
  tradeName: string;
  doy: string;
  gemiNumber: string;
  street: string;
  number: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  defaultSeries: string;
  defaultVehiclePlate: string;
  bankIban: string;
}

export interface Product {
  id: string;
  tenantId: string; // <-- Partition key
  name: string;
  price: number;
  stockQuantity: number;
  categoryId?: string;
  isActive?: boolean;
  barcode?: string;
  altBarcodes?: string[];
  taxRate?: number;
  isPinned?: boolean;
}

export interface TenantSettingsRecord {
  id: string; // equals tenantId
  tenantId: string;
  fiscalIdentityJson: string;
  updatedAt: number;
}
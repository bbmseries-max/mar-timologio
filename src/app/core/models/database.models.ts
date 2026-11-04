import { FiscalEnvironment, SubscriptionTier, SubscriptionStatus } from './tenant.models';

export interface LocalInvoiceRecord {
  id: string; // UUID primary key
  tenantId: string; // Partition key
  series: string;
  documentNumber: number;
  issueDate: string; // YYYY-MM-DD
  invoiceType: string; // e.g. '1.1', '2.1', '9.3'
  customerAfm: string;
  customerName: string;
  totalNet: number;
  totalVat: number;
  totalGross: number;
  transmissionStatus: 'DRAFT' | 'TRANSMITTED' | 'FAILED' | 'CANCELLED';
  mark?: string;
  uid?: string;
  qrUrl?: string;
  payloadJson: string; // Complete serialized form snapshot
  updatedAt: number;
  createdAt: number;
  cancellationMark?: string;
  cancelledAt?: string;
  isArchived?: boolean;
}

export interface TenantSettingsRecord {
  // Primary key in Dexie
  tenantId: string;
  id?: string; // Optional alias for legacy code reading record.id

  // Company Tax & Business Details
  afm: string;
  doy: string;
  legalName: string;
  tradeName?: string;
  gemiNumber?: string;
  street: string;
  number: string;
  postalCode: string;
  city: string;
  branch: number;
  phone?: string;
  email?: string;
  defaultSeries: string;
  defaultVehiclePlate?: string;
  bankIban?: string;

  // myDATA REST API Credentials & Environment
  aadeUserId?: string;
  aadeSubscriptionKey?: string;
  fiscalEnvironment: FiscalEnvironment; // 'mock' | 'dev' | 'production'
  isProduction?: boolean;

  // GSIS Taxisnet Lookup Credentials (RgWsPublic2)
  gsisUsername?: string;
  gsisPassword?: string;

  // Subscription & Tier Limits
  subscriptionTier?: SubscriptionTier | string;
  subscriptionStatus?: SubscriptionStatus | string;
  validUntil?: string | null;
  maxMonthlyDocuments?: number;
  currentMonthDocumentCount?: number;

  updatedAt: string;
}

/**
 * Backward compatibility alias so legacy code expecting 
 * CompanySettingsRecord compiles without throwing TS errors
 */
export type CompanySettingsRecord = TenantSettingsRecord;

export interface Product {
  id: string;
  tenantId: string;
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

export interface TenantFiscalRecord {
  id: string;
  tenantId: string;
  fiscalIdentityJson: string;
  updatedAt: number;
}
// src/app/core/models/database.models.ts

import { FiscalEnvironment, SubscriptionTier, SubscriptionStatus } from './tenant.models';

export type FiscalTransmissionMode = 'DIRECT_AADE' | 'PROVIDER';
export type ProviderType = 'IMPACT' | 'SOFTONE' | 'EPSILON' | 'OTHER';

export interface LocalInvoiceRecord {
  id: string; // UUID primary key
  tenantId: string; // Partition key
  series: string;
  documentNumber: number;
  issueDate: string; // YYYY-MM-DD
  invoiceType: string; // e.g. '1.1', '2.1', '9.3', '11.1', '11.2'
  customerAfm: string;
  customerName: string;
  totalNet: number;
  totalVat: number;
  totalGross: number;
  transmissionStatus: 'DRAFT' | 'TRANSMITTED' | 'FAILED' | 'CANCELLED';
  
  // myDATA / Fiscal Response Fields
  mark?: string;
  uid?: string;
  qrUrl?: string;

  // Provider (ΥΠΑΗΕΣ) Specific Response Fields
  fiscalModeUsed?: FiscalTransmissionMode;
  providerSignature?: string;   // Cryptographic signature from Provider HSM
  providerDocId?: string;       // Provider internal transaction ID
  providerInvoiceUrl?: string;  // Public verification/PDF link hosted by Provider
  
  payloadJson: string; // Complete serialized form snapshot
  updatedAt: number;
  createdAt: number;
  cancellationMark?: string;
  cancelledAt?: string;
  isArchived?: boolean;
}

export interface TenantSettingsRecord {
  tenantId: string;
  id?: string;

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

  // Fiscal Transmission Mode
  fiscalMode: FiscalTransmissionMode; // 'DIRECT_AADE' | 'PROVIDER'

  // Direct myDATA REST API Credentials & Environment
  aadeUserId?: string;
  aadeSubscriptionKey?: string;
  fiscalEnvironment: FiscalEnvironment; // 'mock' | 'dev' | 'production'
  isProduction?: boolean;

  // Certified Provider (ΥΠΑΗΕΣ) Credentials
  providerName?: ProviderType;
  providerApiKey?: string;
  providerClientId?: string;
  providerCustomUrl?: string;

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
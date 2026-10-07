export type UserRole = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'ACCOUNTANT';

export type BusinessProfileType =
  | 'RETAIL_MINIMARKET'
  | 'SERVICES_FREELANCE'
  | 'EX_VAN_DISTRIBUTOR'
  | 'WHOLESALE_TRADER';

export interface TenantFeatureFlags {
  enableBarcodeScanner: boolean;
  enableGoodsMovement: boolean;
  enableThermalReceipt: boolean;
  defaultDocType: '1.1' | '1.2' | '2.1' | '9.1';
  allowOfflineDrafts: boolean;
}

export interface TenantFiscalIdentity {
  afm: string;
  legalName: string;
  tradeName?: string;
  doy: string;
  gemiNumber?: string;
  street: string;
  number: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  bankIban?: string;
  defaultSeries: string;
  defaultVehiclePlate?: string;
}

export interface TenantOrganization {
  id: string; // Global Tenant UUID / slug (e.g. 'tenant_maranth_hq')
  name: string;
  businessType: BusinessProfileType;
  fiscalIdentity: TenantFiscalIdentity;
  subscription?: TenantSubscription;
  features: TenantFeatureFlags;
  createdAt: string;
  isActive: boolean;
}

export interface AuthUserSession {
  uid: string;
  email: string;
  displayName?: string;
  tenantId: string;
  role: UserRole;
  token: string;
}

export type SubscriptionTier = 'STARTER_FREELANCE' | 'RETAIL_SHOP' | 'EX_VAN_PRO';

export type SubscriptionStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'GRACE_PERIOD' // 1-7 days past due: warning shown, issuance allowed
  | 'READ_ONLY'    // 8-30 days past due: issuance blocked, export allowed
  | 'SUSPENDED';   // 31+ days: locked out completely

export interface TenantSubscription {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  validUntil: string; // ISO date
  gracePeriodEndsAt?: string; // ISO date
  maxMonthlyDocuments?: number;
  currentMonthDocumentCount: number;
}
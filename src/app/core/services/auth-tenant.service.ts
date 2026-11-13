import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SubscriptionStatus } from '../models/tenant.models';
import { LocalDbService } from './local-db.service';

export interface TenantSubscription {
  status: SubscriptionStatus;
  planName: string;
  validUntil: string;
  daysRemainingInGrace?: number;
  maxMonthlyDocuments?: number;
}

export interface FiscalIdentity {
  afm: string;
  doy: string;
  legalName?: string;
  tradeName?: string;
  gemiNumber?: string;
  address?: {
    street: string;
    number: string;
    postalCode: string;
    city: string;
  };
}

export interface TenantFeatureFlags {
  enableGoodsMovement: boolean;
  enableThermalPrint: boolean;
  enableXmlExport: boolean;
}

export interface TenantProfile {
  id: string;
  name: string;
  afm: string;
  doy: string;
  gemh?: number;
  fiscalIdentity?: FiscalIdentity;
  subscription?: TenantSubscription;
  features?: TenantFeatureFlags;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'accountant' | 'operator';
}

const STORAGE_KEYS = {
  USER: 'maranth_auth_user',
  TENANT: 'maranth_active_tenant',
} as const;

@Injectable({ providedIn: 'root' })
export class AuthTenantService {
  private readonly router = inject(Router);
  private readonly db = inject(LocalDbService);

  private readonly authChannel = typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('maranth_auth_bus')
    : null;

  public readonly currentUser = signal<AuthUser | null>(null);
  public readonly activeTenant = signal<TenantProfile | null>(null);
  public readonly subscription = signal<TenantSubscription | null>(null);

  // Synonyms and aliases for backward and cross-component compatibility
  public readonly currentTenant = this.activeTenant;
  public readonly currentTenantProfile = this.activeTenant;

  public readonly isAuthenticated = computed(() => this.currentUser() !== null);
  public readonly currentTenantId = computed(() => this.activeTenant()?.id || '');

  public readonly currentTenantAfm = computed(() => {
    const tenant = this.activeTenant();
    return tenant?.fiscalIdentity?.afm || tenant?.afm || '';
  });

  public readonly isTenantConfigured = computed(() => {
  const tenant = this.activeTenant();
  const afm = (tenant?.fiscalIdentity?.afm || tenant?.afm || '').replace(/\D/g, '').trim();
  if (afm.length === 9 && afm !== '000000000') return true;
  return this.subscription()?.status === 'ACTIVE';
});

  public readonly isGracePeriod = computed(() => {
    return this.subscription()?.status === 'GRACE_PERIOD';
  });

  public readonly daysLeftInGrace = computed(() => {
    return this.subscription()?.daysRemainingInGrace ?? 0;
  });

  public readonly isReadOnlyMode = computed(() => {
    const sub = this.subscription();
    if (!sub) return false;
    return sub.status === 'READ_ONLY' || sub.status === 'SUSPENDED';
  });

  public readonly canIssueInvoices = computed(() => {
    const sub = this.subscription();
    if (!sub) return true;
    return sub.status === 'ACTIVE' || sub.status === 'TRIAL' || sub.status === 'GRACE_PERIOD';
  });

  public readonly featureFlags = computed<TenantFeatureFlags>(() => {
    return this.activeTenant()?.features ?? {
      enableGoodsMovement: true,
      enableThermalPrint: true,
      enableXmlExport: true,
    };
  });

  constructor() {
    this.hydrateSessionFromStorage();
    this.initCrossTabAuthSync();
  }

  /**
   * Initializes tenant license and settings on app boot.
   */
  public async syncTenantSubscriptionOnBoot(forceAfm?: string): Promise<void> {
  const tenantId = this.currentTenantId();
  if (!tenantId && !forceAfm) return;

  try {
    const savedSettings = tenantId ? await this.db.getSettingsForTenant(tenantId) : null;

    // Seed activeTenant from settings if needed
    if (!this.activeTenant() && savedSettings) {
      this.seedTenantFromSettings(savedSettings);
    }

    const rawAfm = forceAfm || this.currentTenantAfm() || savedSettings?.afm;
    if (!rawAfm) return;

    const cleanAfm = rawAfm.replace(/\D/g, '').trim();
    if (cleanAfm.length !== 9 || cleanAfm === '000000000') return;

    // Read credentials dynamically from user's saved settings
    const userId = savedSettings?.aadeUserId?.trim() || '';
    const subKey = savedSettings?.aadeSubscriptionKey?.trim() || '';

    // If settings have no API keys yet, fall back immediately to local trial
    if (!userId || !subKey) {
      this.subscription.set({
        status: 'ACTIVE',
        planName: 'FREE_TRIAL',
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        maxMonthlyDocuments: 100,
      });
      return;
    }

    const workerUrl = new URL('https://gsis-lookup.bbmseries.workers.dev/check-subscription');
    workerUrl.searchParams.set('afm', cleanAfm);
    workerUrl.searchParams.set('userId', userId);
    workerUrl.searchParams.set('subscriptionKey', subKey);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(workerUrl.toString(), {
      headers: {
        'aade-user-id': userId,
        'ocp-apim-subscription-key': subKey,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Worker HTTP status ${response.status}`);
    }

    const data = await response.json();

    // Verify worker reported success, not a validation failure
    if (data.success === false) {
      console.warn('[AuthTenantService] License server rejected credentials:', data.error);
      this.subscription.set({
        status: 'ACTIVE',
        planName: 'FREE_TRIAL',
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        maxMonthlyDocuments: 100,
      });
      return;
    }

    // Set confirmed subscription
    const updatedSub: TenantSubscription = {
      status: (data.status as SubscriptionStatus) || 'ACTIVE',
      planName: data.tier || 'RETAIL_SHOP',
      validUntil: data.validUntil || '2099-12-31T23:59:59Z',
      maxMonthlyDocuments: data.monthlyLimit || 999999,
    };

    this.subscription.set(updatedSub);
  } catch (err) {
    console.warn('[AuthTenantService] Subscription sync fallback:', err);
    if (!this.subscription()) {
      this.subscription.set({
        status: 'ACTIVE',
        planName: 'OFFLINE_TRIAL',
        validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
        maxMonthlyDocuments: 100,
      });
    }
  }
}

  private async hydrateSessionFromStorage(): Promise<void> {
  try {
    const storedUser = localStorage.getItem(STORAGE_KEYS.USER);
    if (storedUser) {
      this.currentUser.set(JSON.parse(storedUser));
    }

    const storedTenant = localStorage.getItem(STORAGE_KEYS.TENANT);
    if (storedTenant) {
      const tenant: TenantProfile = JSON.parse(storedTenant);
      this.activeTenant.set(tenant);
      if (tenant.subscription) {
        this.subscription.set(tenant.subscription);
      }
    } else {
      // Look up ANY tenant currently saved in Dexie (not just hardcoded 'tenant_minimarket')
      const allSettings = await this.db.settings.toArray();
      if (allSettings && allSettings.length > 0) {
        this.seedTenantFromSettings(allSettings[0]);
      }
    }
  } catch (err) {
    console.warn('[AuthTenantService] Failed to hydrate stored session:', err);
    this.clearLocalSession(false);
  }
}

  public seedTenantFromSettings(s: any): void {
  if (!s) return;
  const rawAfm = (s.afm || '').replace(/\D/g, '').trim();
  const tenantId = s.id || s.tenantId || (rawAfm ? `tenant_${rawAfm}` : 'tenant_default');

  const profile: TenantProfile = {
    id: tenantId,
    name: s.legalName || s.companyName || 'Κατάστημα',
    afm: rawAfm,
    doy: s.doy || '',
    fiscalIdentity: {
      afm: rawAfm,
      doy: s.doy || '',
      legalName: s.legalName || '',
      tradeName: s.companyName || s.legalName || '',
      address: {
        street: s.street || '',
        number: s.number || '',
        postalCode: s.postalCode || '',
        city: s.city || '',
      },
    },
    subscription: {
      status: (s.subscriptionStatus as SubscriptionStatus) || 'ACTIVE',
      planName: s.subscriptionTier || 'RETAIL_SHOP',
      validUntil: s.validUntil || '2099-12-31T23:59:59Z',
      maxMonthlyDocuments: s.maxMonthlyDocuments || 999999,
    },
  };

  this.activeTenant.set(profile);
  if (profile.subscription) {
    this.subscription.set(profile.subscription);
  }
  localStorage.setItem(STORAGE_KEYS.TENANT, JSON.stringify(profile));
}

  private initCrossTabAuthSync(): void {
    if (!this.authChannel) return;

    this.authChannel.onmessage = (event: MessageEvent<{ action: string; tenantId?: string }>) => {
      if (event.data?.action === 'LOGOUT') {
        this.clearLocalSession(false);
      } else if (event.data?.action === 'LOGIN' || event.data?.action === 'TENANT_UPDATED') {
        this.refreshCurrentSession();
      }
    };
  }

  public updateTenantProfile(profile: TenantProfile): void {
    this.activeTenant.set(profile);
    if (profile.subscription) {
      this.subscription.set(profile.subscription);
    }
    localStorage.setItem(STORAGE_KEYS.TENANT, JSON.stringify(profile));

    if (this.authChannel) {
      this.authChannel.postMessage({ action: 'TENANT_UPDATED', tenantId: profile.id });
    }
  }

  public updateFiscalIdentity(identity: FiscalIdentity): void {
    const current = this.activeTenant();
    if (!current) return;

    const updated: TenantProfile = {
      ...current,
      afm: identity.afm,
      doy: identity.doy,
      name: identity.tradeName || identity.legalName || current.name,
      fiscalIdentity: identity,
    };

    this.updateTenantProfile(updated);
  }

  public async login(
    user: AuthUser,
    tenant: TenantProfile,
    redirectUrl: string = '/invoices'
  ): Promise<void> {
    this.currentUser.set(user);
    this.activeTenant.set(tenant);
    this.subscription.set(tenant.subscription ?? null);

    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    localStorage.setItem(STORAGE_KEYS.TENANT, JSON.stringify(tenant));

    if (this.authChannel) {
      this.authChannel.postMessage({ action: 'LOGIN', tenantId: tenant.id });
    }

    await this.router.navigate([redirectUrl]);
  }

  public refreshCurrentSession(): void {
    this.hydrateSessionFromStorage();
  }

  public logout(): void {
    this.clearLocalSession(true);
  }

  private clearLocalSession(notifyBroadcast: boolean): void {
    this.currentUser.set(null);
    this.activeTenant.set(null);
    this.subscription.set(null);

    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.TENANT);

    if (notifyBroadcast && this.authChannel) {
      this.authChannel.postMessage({ action: 'LOGOUT' });
    }

    this.router.navigate(['/login']);
  }

 private ensureDemoUserSession(): void {
    if (this.currentUser()) return;

    const demoUser: AuthUser = {
      id: 'demo_user_067424104',
      email: 'demo@maranth.gr',
      displayName: 'Sandbox Demo User',
      role: 'admin',
    };

    this.currentUser.set(demoUser);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(demoUser));
  }

  public async startSandboxDemo(): Promise<void> {
    const demoTenantId = 'tenant_067424104';
    const demoSettings = {
      id: demoTenantId,
      tenantId: demoTenantId,
      afm: '067424104',
      doy: 'Δ\' ΑΘΗΝΩΝ',
      legalName: 'MARANTH DEMO STORE ΜΟΝ. ΙΚΕ',
      street: 'Ακαδημίας',
      number: '45',
      postalCode: '10672',
      city: 'Αθήνα',
      branch: 0,
      defaultSeries: 'A',
      aadeUserId: '',              // Blank -> Cloudflare Worker injects SANDBOX_AADE_USER_ID
      aadeSubscriptionKey: '',     // Blank -> Cloudflare Worker injects SANDBOX_AADE_SUB_KEY
      fiscalEnvironment: 'dev' as const,
      isProduction: false,
      subscriptionTier: 'RETAIL_SHOP',
      subscriptionStatus: 'ACTIVE',
      validUntil: '2099-12-31T23:59:59Z',
      maxMonthlyDocuments: 1000,
      currentMonthDocumentCount: 0,
      updatedAt: new Date().toISOString(),
    };

    await this.db.saveSettingsForTenant(demoTenantId, demoSettings);
    this.seedTenantFromSettings(demoSettings);
    this.ensureDemoUserSession();
  }

  public async ensureInitializedOrSeedDemo(): Promise<void> {
    const existingSettings = await this.db.settings.toArray();
    const validTenant = existingSettings.find(
      (s) => String(s?.afm || '').replace(/\D/g, '').trim().length === 9
    );

    // Case 1: Returning user or live paying customer with valid AFM — hydrate their saved tenant
    if (validTenant) {
      this.seedTenantFromSettings(validTenant);
      this.ensureDemoUserSession();
      return;
    }

    // Case 2: Fresh browser or empty/unconfigured record — auto-seed zero-config Sandbox Demo
    await this.startSandboxDemo();
  }

  public async resetToSandboxDemo(): Promise<void> {
    await this.db.settings.clear();
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.TENANT);
    this.currentUser.set(null);
    await this.ensureInitializedOrSeedDemo();
  }
}
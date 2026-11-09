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
  public readonly currentTenantId = computed(() => this.activeTenant()?.id || 'tenant_minimarket');

  public readonly currentTenantAfm = computed(() => {
    const tenant = this.activeTenant();
    return tenant?.fiscalIdentity?.afm || tenant?.afm || '067424104';
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
  public async syncTenantSubscriptionOnBoot(): Promise<void> {
    const tenantId = this.currentTenantId();
    if (!tenantId) return;

    try {
      const savedSettings = await this.db.getSettingsForTenant(tenantId);

      // If activeTenant is not populated, seed it from Dexie settings
      if (!this.activeTenant() && savedSettings) {
        this.seedTenantFromSettings(savedSettings);
      }

      const afm = this.currentTenantAfm() || savedSettings?.afm;
      if (!afm) return;

      const cleanAfm = afm.replace(/\D/g, '').trim();
      const workerUrl = 'https://gsis-lookup.bbmseries.workers.dev/check-subscription';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(`${workerUrl}?afm=${encodeURIComponent(cleanAfm)}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) return;

      const data = await response.json();
      const updatedSub: TenantSubscription = {
        status: data.status as SubscriptionStatus,
        planName: data.tier || 'RETAIL_SHOP',
        validUntil: data.validUntil || '2099-12-31T23:59:59Z',
        maxMonthlyDocuments: data.monthlyLimit || 999999,
      };

      this.subscription.set(updatedSub);
    } catch (err) {
      console.warn('[AuthTenantService] Subscription sync skipped (offline or unreachable):', err);
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
        // Fallback to IndexedDB settings table if localStorage is empty
        const s = await this.db.getSettings('tenant_minimarket');
        if (s) {
          this.seedTenantFromSettings(s);
        }
      }
    } catch (err) {
      console.warn('[AuthTenantService] Failed to hydrate stored session:', err);
      this.clearLocalSession(false);
    }
  }

  private seedTenantFromSettings(s: any): void {
    const profile: TenantProfile = {
      id: s.id || s.tenantId || 'tenant_minimarket',
      name: s.legalName || s.companyName || 'MARANTH ENTERPRISE',
      afm: s.afm || '067424104',
      doy: s.doy || 'ΚΕΦΟΔΕ ΑΤΤΙΚΗΣ',
      fiscalIdentity: {
        afm: s.afm || '067424104',
        doy: s.doy || 'ΚΕΦΟΔΕ ΑΤΤΙΚΗΣ',
        legalName: s.legalName || 'MARANTH MON IKE',
        tradeName: s.companyName || 'MARANTH ENTERPRISE',
        address: {
          street: s.street || 'ΒΑΡΔΟΥΝΙΩΤΗ',
          number: s.number || '11',
          postalCode: s.postalCode || '11522',
          city: s.city || 'ΑΘΗΝΑ',
        },
      },
      subscription: {
        status: (s.subscriptionStatus as SubscriptionStatus) || 'ACTIVE',
        planName: s.subscriptionTier || 'RETAIL_SHOP',
        validUntil: s.validUntil || '2099-12-31T23:59:59Z',
        maxMonthlyDocuments: s.maxMonthlyDocuments || 1000,
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
}
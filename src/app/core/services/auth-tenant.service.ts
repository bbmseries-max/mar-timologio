import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SubscriptionTier, SubscriptionStatus } from '../models/tenant.models';
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

  public readonly currentTenant = this.activeTenant;

  public readonly isAuthenticated = computed(() => this.currentUser() !== null);
  public readonly currentTenantId = computed(() => this.activeTenant()?.id || 'tenant_minimarket');

  public readonly currentTenantAfm = computed(() => {
    const tenant = this.activeTenant();
    return tenant?.fiscalIdentity?.afm || tenant?.afm || '';
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
    // In standalone/offline/local mode without an active subscription object, permit issuance
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
   * Initializes tenant license on app boot.
   * Runs non-blockingly so the offline-first app loads instantly even with no internet.
   */
  public async syncTenantSubscriptionOnBoot(): Promise<void> {
    console.info('[Boot Init] 🚀 syncTenantSubscriptionOnBoot triggered via provideAppInitializer');

    const tenantId = this.currentTenantId();
    if (!tenantId) {
      console.warn('[Boot Init] ⚠️ No tenant ID resolved. Boot sync aborted.');
      return;
    }

    try {
      let afm = this.currentTenantAfm();
      const savedSettings = await this.db.getSettingsForTenant(tenantId);

      if (!afm && savedSettings?.afm) {
        afm = savedSettings.afm;
      }

      if (!afm) {
        console.warn('[Boot Init] ⚠️ No AFM found in session or Dexie settings. Skipping remote check.');
        return;
      }

      const cleanAfm = afm.replace(/\D/g, '').trim();
      console.info(`[Boot Init] 🔍 Checking Cloudflare KV subscription for AFM: ${cleanAfm}...`);

      const workerUrl = 'https://gsis-lookup.bbmseries.workers.dev/check-subscription';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(`${workerUrl}?afm=${encodeURIComponent(cleanAfm)}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[Boot Init] ❌ Cloudflare returned status ${response.status}`);
        return;
      }

      const data = await response.json();
      console.info('[Boot Init] ✅ Subscription synced successfully:', data);

      const updatedSub: TenantSubscription = {
        status: data.status as SubscriptionStatus,
        planName: data.tier || 'RETAIL_SHOP',
        validUntil: data.validUntil || '2099-12-31T23:59:59Z',
        maxMonthlyDocuments: data.monthlyLimit || 999999,
      };

      this.subscription.set(updatedSub);
      console.info('[Boot Init] 📡 Reactive subscription signal updated:', this.subscription());
    } catch (err) {
      console.warn('[Boot Init] ⚠️ Subscription sync skipped (offline or unreachable):', err);
    }
  }

  private hydrateSessionFromStorage(): void {
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
      }
    } catch (err) {
      console.warn('[AuthTenantService] Failed to hydrate stored session:', err);
      this.clearLocalSession(false);
    }
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
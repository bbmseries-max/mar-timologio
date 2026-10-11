import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

export type SubscriptionStatus = 'ACTIVE' | 'TRIAL' | 'GRACE_PERIOD' | 'READ_ONLY' | 'SUSPENDED';

export interface TenantSubscription {
  status: SubscriptionStatus;
  planName: string;
  validUntil: string;
  daysRemainingInGrace?: number;
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
  private readonly authChannel = typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('maranth_auth_bus')
    : null;

  // Writable State - Boot with dynamic nulls instead of hardcoded demo mocks
  public readonly currentUser = signal<AuthUser | null>(null);
  public readonly activeTenant = signal<TenantProfile | null>(null);
  public readonly subscription = signal<TenantSubscription | null>(null);

  // Backward compatibility alias
  public readonly currentTenant = this.activeTenant;

  // Computed state helpers
  public readonly isAuthenticated = computed(() => this.currentUser() !== null);
  public readonly currentTenantId = computed(() => this.activeTenant()?.id ?? '');

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
    if (!sub) return false;
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
   * Hydrates state dynamically from browser storage on app start
   */
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

  /**
   * Sets up or updates the dynamic tenant identity (e.g. from Settings or Setup Wizard)
   */
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

  /**
   * Updates only fiscal identity attributes (AFM, DOY, Trade Name) from Settings
   */
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

  /**
   * Dynamic login handler: accepts user and associated tenant identity
   */
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
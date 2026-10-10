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

@Injectable({ providedIn: 'root' })
export class AuthTenantService {
  private readonly router = inject(Router);
  private readonly authChannel = typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('maranth_auth_bus')
    : null;

  // Writable State
  public readonly currentUser = signal<AuthUser | null>({
    id: 'usr_demo_1',
    email: 'admin@maranth.gr',
    displayName: 'Διαχειριστής Maranth',
    role: 'admin',
  });

  public readonly activeTenant = signal<TenantProfile | null>({
    id: 'tenant_minimarket',
    name: 'Maranth Demo Store IKE',
    afm: '801234567',
    doy: 'ΧΑΛΑΝΔΡΙΟΥ',
    fiscalIdentity: {
      afm: '801234567',
      doy: 'ΧΑΛΑΝΔΡΙΟΥ',
      legalName: 'Maranth IKE',
      tradeName: 'Maranth Software B2B',
      gemiNumber: '154823901000',
    },
    subscription: {
      status: 'ACTIVE',
      planName: 'Pro Ex-Van & Retail',
      validUntil: '2027-12-31',
      daysRemainingInGrace: 7,
    },
    features: {
      enableGoodsMovement: true,
      enableThermalPrint: true,
      enableXmlExport: true,
    },
  });

  // Alias for backward compatibility if any component calls currentTenant
  public readonly currentTenant = this.activeTenant;

  public readonly subscription = signal<TenantSubscription | null>({
    status: 'ACTIVE',
    planName: 'Pro Ex-Van & Retail',
    validUntil: '2027-12-31',
    daysRemainingInGrace: 7,
  });

  // Computed state helpers for App & Navigation Shell
  public readonly isAuthenticated = computed(() => this.currentUser() !== null);
  public readonly currentTenantId = computed(() => this.activeTenant()?.id ?? 'tenant_minimarket');

  public readonly isGracePeriod = computed(() => {
    const sub = this.subscription();
    return sub?.status === 'GRACE_PERIOD';
  });

  public readonly daysLeftInGrace = computed(() => {
    return this.subscription()?.daysRemainingInGrace ?? 7;
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
    this.initCrossTabAuthSync();
  }

  private initCrossTabAuthSync(): void {
    if (!this.authChannel) return;

    this.authChannel.onmessage = (event: MessageEvent<{ action: string; tenantId?: string }>) => {
      if (event.data?.action === 'LOGOUT') {
        this.clearLocalSession(false);
      } else if (event.data?.action === 'LOGIN') {
        this.refreshCurrentSession();
      }
    };
  }

  /**
   * Login handler used by login.component.ts
   */
  public async login(email: string, tenantPreset: string = 'tenant_minimarket'): Promise<void> {
    const isGrace = tenantPreset === 'grace_test';
    const isReadOnly = tenantPreset === 'readonly_test';

    const subStatus: SubscriptionStatus = isGrace
      ? 'GRACE_PERIOD'
      : isReadOnly
      ? 'READ_ONLY'
      : 'ACTIVE';

    const newTenant: TenantProfile = {
      id: tenantPreset,
      name: isGrace ? 'Maranth Mini Market (Grace Period)' : 'Maranth Demo Store IKE',
      afm: '801234567',
      doy: 'ΧΑΛΑΝΔΡΙΟΥ',
      fiscalIdentity: {
        afm: '801234567',
        doy: 'ΧΑΛΑΝΔΡΙΟΥ',
        legalName: 'Maranth IKE',
        tradeName: 'Maranth Software B2B',
        gemiNumber: '154823901000',
      },
      subscription: {
        status: subStatus,
        planName: 'Pro Ex-Van & Retail',
        validUntil: '2027-12-31',
        daysRemainingInGrace: isGrace ? 4 : 0,
      },
      features: {
        enableGoodsMovement: true,
        enableThermalPrint: true,
        enableXmlExport: true,
      },
    };

    this.currentUser.set({
      id: 'usr_' + Date.now(),
      email,
      displayName: email.split('@')[0],
      role: 'admin',
    });

    this.activeTenant.set(newTenant);
    this.subscription.set(newTenant.subscription!);

    localStorage.setItem('maranth_active_tenant', JSON.stringify(newTenant));

    if (this.authChannel) {
      this.authChannel.postMessage({ action: 'LOGIN', tenantId: newTenant.id });
    }

    await this.router.navigate(['/invoices/new']);
  }

  public refreshCurrentSession(): void {
    const cachedTenant = localStorage.getItem('maranth_active_tenant');
    if (cachedTenant) {
      try {
        const parsed: TenantProfile = JSON.parse(cachedTenant);
        this.activeTenant.set(parsed);
        if (parsed.subscription) {
          this.subscription.set(parsed.subscription);
        }
      } catch (err) {
        console.warn('Could not parse cached tenant data', err);
      }
    }
  }

  public logout(): void {
    this.clearLocalSession(true);
  }

  private clearLocalSession(notifyBroadcast: boolean): void {
    this.currentUser.set(null);
    this.activeTenant.set(null);
    this.subscription.set(null);
    localStorage.removeItem('maranth_active_tenant');

    if (notifyBroadcast && this.authChannel) {
      this.authChannel.postMessage({ action: 'LOGOUT' });
    }

    this.router.navigate(['/login']);
  }
}
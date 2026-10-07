import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  AuthUserSession,
  TenantOrganization,
  BusinessProfileType,
} from '../models/tenant.models';

const STORAGE_KEY_SESSION = 'maranth_auth_session';

@Injectable({ providedIn: 'root' })
export class AuthTenantService {
  private readonly router = inject(Router);

  // Core signals
  public readonly session = signal<AuthUserSession | null>(this.restoreSession());
  public readonly activeTenant = signal<TenantOrganization | null>(null);
  public readonly subscription = computed(() => this.activeTenant()?.subscription);

  // Computed state
  public readonly isAuthenticated = computed(() => !!this.session());
  public readonly currentTenantId = computed(() => this.session()?.tenantId ?? '');
  public readonly userRole = computed(() => this.session()?.role ?? 'OPERATOR');

  public readonly featureFlags = computed(() => {
    return (
      this.activeTenant()?.features ?? {
        enableBarcodeScanner: false,
        enableGoodsMovement: false,
        enableThermalReceipt: true,
        defaultDocType: '1.1',
        allowOfflineDrafts: true,
      }
    );
  });

  public readonly isReadOnlyMode = computed(() => {
  const sub = this.subscription();
  if (!sub) return false;
  return sub.status === 'READ_ONLY' || sub.status === 'SUSPENDED';
});

public readonly isGracePeriod = computed(() => {
  return this.subscription()?.status === 'GRACE_PERIOD';
});

public readonly canIssueInvoices = computed(() => {
  const sub = this.subscription();
  if (!sub) return false;
  return sub.status === 'ACTIVE' || sub.status === 'TRIAL' || sub.status === 'GRACE_PERIOD';
});

public readonly daysLeftInGrace = computed(() => {
  const graceEnd = this.subscription()?.gracePeriodEndsAt;
  if (!graceEnd) return 0;
  const diffTime = new Date(graceEnd).getTime() - new Date().getTime();
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
});

  constructor() {
    if (this.session()) {
      this.loadTenantProfile(this.session()!.tenantId);
    }
  }

  /**
   * Mock / Real Authentication Entrypoint.
   * Can plug into Firebase Auth, Supabase Auth, or your custom Backend JWT.
   */
  public async login(email: string, tenantIdPreset?: string): Promise<void> {
    const tenantId = tenantIdPreset || 'tenant_maranth_demo';

    const mockSession: AuthUserSession = {
      uid: 'user_' + Math.random().toString(36).substring(2, 9),
      email: email.trim().toLowerCase(),
      displayName: email.split('@')[0],
      tenantId: tenantId,
      role: 'ADMIN',
      token: 'jwt_mock_token_secure_payload',
    };

    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(mockSession));
    this.session.set(mockSession);
    await this.loadTenantProfile(tenantId);
    await this.router.navigate(['/invoices/new']);
  }

  public logout(): void {
    localStorage.removeItem(STORAGE_KEY_SESSION);
    this.session.set(null);
    this.activeTenant.set(null);
    this.router.navigate(['/login']);
  }

  /**
   * Loads the Tenant's configuration and business profile
   */
  public async loadTenantProfile(tenantId: string): Promise<void> {
    // In production, this queries your backend: GET /api/tenants/:tenantId
    // For now, it initializes tenant profile templates based on tenant ID
    const profile = this.resolveTenantProfile(tenantId);
    this.activeTenant.set(profile);
  }

  private resolveTenantProfile(tenantId: string): TenantOrganization {
    if (tenantId === 'tenant_minimarket') {
      return {
        id: 'tenant_minimarket',
        name: 'Μίνι Μάρκετ "Η Γειτονιά"',
        businessType: 'RETAIL_MINIMARKET',
        subscription: {
  tier: 'RETAIL_SHOP',
  status: 'ACTIVE',
  validUntil: '2027-12-31',
  currentMonthDocumentCount: 14,
},
        fiscalIdentity: {
          afm: '801234567',
          legalName: 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΕΩΡΓΙΟΣ & ΣΙΑ Ε.Ε.',
          tradeName: 'MINI MARKET Η ΓΕΙΤΟΝΙΑ',
          doy: 'ΧΑΛΑΝΔΡΙΟΥ',
          gemiNumber: '154823901000',
          street: 'Λεωφ. Κηφισίας',
          number: '200',
          postalCode: '15231',
          city: 'Χαλάνδρι',
          phone: '+30 210 1234567',
          email: 'market@maranth.gr',
          defaultSeries: 'A',
        },
        features: {
          enableBarcodeScanner: true,
          enableGoodsMovement: false,
          enableThermalReceipt: true,
          defaultDocType: '1.1',
          allowOfflineDrafts: true,
        },
        createdAt: '2026-01-01',
        isActive: true,
      };
    }

    if (tenantId === 'tenant_exvan') {
      return {
        id: 'tenant_exvan',
        name: 'Maranth Ex-Van Logistics',
        businessType: 'EX_VAN_DISTRIBUTOR',
        subscription: {
  tier: 'EX_VAN_PRO',
  status: 'GRACE_PERIOD',
  validUntil: '2026-10-01',
  gracePeriodEndsAt: '2026-10-15',
  currentMonthDocumentCount: 88,
},
        fiscalIdentity: {
          afm: '800987654',
          legalName: 'LOGISTICS DISTRIBUTORS I.K.E.',
          tradeName: 'EX-VAN LOGISTICS',
          doy: 'ΦΑΕ ΑΘΗΝΩΝ',
          street: 'Πέτρου Ράλλη',
          number: '50',
          postalCode: '11855',
          city: 'Αθήνα',
          phone: '+30 210 9876543',
          email: 'van@maranth.gr',
          defaultSeries: 'VAN-1',
          defaultVehiclePlate: 'IEB-4892',
        },
        features: {
          enableBarcodeScanner: true,
          enableGoodsMovement: true,
          enableThermalReceipt: true,
          defaultDocType: '1.2',
          allowOfflineDrafts: true,
        },
        createdAt: '2026-01-01',
        isActive: true,
      };
    }

    // Default Services / Freelancer profile
    return {
      id: tenantId,
      name: 'Maranth Tech Services',
      businessType: 'SERVICES_FREELANCE',
      fiscalIdentity: {
        afm: '094123456',
        legalName: 'MARANTH CONSULTING SERVICES',
        doy: 'Δ\' ΑΘΗΝΩΝ',
        street: 'Σταδίου',
        number: '10',
        postalCode: '10564',
        city: 'Αθήνα',
        phone: '+30 210 3344556',
        email: 'info@maranth.gr',
        defaultSeries: 'SER-1',
      },
      features: {
        enableBarcodeScanner: false,
        enableGoodsMovement: false,
        enableThermalReceipt: false,
        defaultDocType: '2.1',
        allowOfflineDrafts: true,
      },
      createdAt: '2026-01-01',
      isActive: true,
    };
  }

  private restoreSession(): AuthUserSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SESSION);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
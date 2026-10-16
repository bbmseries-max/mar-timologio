import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of, throwError } from 'rxjs';
import { switchMap, catchError, delay, tap } from 'rxjs/operators';
import { isValidGreekAfm } from '../utils/fiscal-engine';
import { LocalDbService, LocalCustomerRecord } from './local-db.service';
import { AuthTenantService } from './auth-tenant.service';

export interface GsisCompanyRecord {
  afm: string;
  legalName: string;
  commercialTitle?: string;
  doy?: string;
  doyDescr?: string;
  legalStatus?: string;
  postalAddress?: string;
  postalAddressNo?: string;
  postalZipCode?: string;
  postalAreaDescription?: string;
  isNormalVatRegime?: boolean;
  active: boolean;
}

@Injectable({ providedIn: 'root' })
export class GsisLookupService {
  private readonly db = inject(LocalDbService);
  private readonly auth = inject(AuthTenantService);
  private readonly http = inject(HttpClient);

  // Cloudflare Worker Live Gateway Endpoint
  private readonly apiEndpoint = 'https://gsis-lookup.bbmseries.workers.dev/gsis/lookup';

  /**
   * Performs an automated lookup for an AFM.
   * Priority:
   * 1. Own Store Settings in Dexie
   * 2. Saved Customers / Suppliers in Dexie
   * 3. Cloudflare Worker GSIS Proxy
   * 4. Safe Offline Fallback
   */
  public lookupAfm(afm: string): Observable<GsisCompanyRecord> {
    const cleanAfm = (afm || '').replace(/\D/g, '').trim();

    if (!isValidGreekAfm(cleanAfm)) {
      return throwError(() => new Error('Το Α.Φ.Μ. δεν είναι αριθμητικά έγκυρο (Modulo 11).'));
    }

    return from(this.checkLocalDexieStorage(cleanAfm)).pipe(
      switchMap((localRecord) => {
        // 1. Instant hit from Dexie cache
        if (localRecord) {
          return of(localRecord);
        }

        // 2. Fetch from Cloudflare Worker proxy endpoint
        return this.http.get<GsisCompanyRecord>(`${this.apiEndpoint}?afm=${cleanAfm}`).pipe(
          tap((remoteRecord) => {
            if (remoteRecord && remoteRecord.legalName) {
              this.saveToDexieStorage(remoteRecord).catch((err) =>
                console.warn('Failed to cache GSIS record in Dexie:', err)
              );
            }
          }),
          catchError((httpErr) => {
            console.warn(`GSIS network lookup failed for ${cleanAfm}:`, httpErr);
            return this.getMockFallbackRecord(cleanAfm);
          })
        );
      })
    );
  }

  /**
   * Checks Dexie for shop profile or cached suppliers/customers.
   */
  private async checkLocalDexieStorage(afm: string): Promise<GsisCompanyRecord | null> {
    const tenantId = this.auth.currentTenantId();

    // 1. Is this your own shop from /settings?
    const settings = await this.db.getSettingsForTenant(tenantId);
    if (settings && (settings.afm || '').replace(/\D/g, '') === afm) {
      const s = settings as any;
      return {
        afm: settings.afm,
        legalName: settings.legalName || s.name || '',
        commercialTitle: s.tradeName || s.commercialTitle || settings.legalName || '',
        doy: settings.doy || s.taxOffice || '',
        doyDescr: settings.doy || s.taxOffice || '',
        postalAddress: s.street || s.address?.street || s.address || '',
        postalAddressNo: s.number || s.address?.number || s.addressNo || '',
        postalZipCode: s.postalCode || s.address?.postalCode || s.zipCode || '',
        postalAreaDescription: s.city || s.address?.city || '',
        isNormalVatRegime: true,
        active: true,
      };
    }

    // 2. Is this an existing customer/supplier saved in Dexie?
    const cachedCustomer = await this.db.getCustomerByAfm(tenantId, afm);
    if (cachedCustomer) {
      const c = cachedCustomer as any;
      return {
        afm: cachedCustomer.afm,
        legalName: cachedCustomer.legalName || c.name || '',
        commercialTitle: c.tradeName || c.commercialTitle || cachedCustomer.legalName || '',
        doy: cachedCustomer.doy || c.taxOffice || '',
        doyDescr: cachedCustomer.doy || c.taxOffice || '',
        postalAddress: cachedCustomer.address?.street || c.street || c.postalAddress || '',
        postalAddressNo: cachedCustomer.address?.number || c.number || c.postalAddressNo || '',
        postalZipCode: cachedCustomer.address?.postalCode || c.postalCode || c.postalZipCode || '',
        postalAreaDescription: cachedCustomer.address?.city || c.city || c.postalAreaDescription || '',
        isNormalVatRegime: c.isNormalVatRegime ?? true,
        active: c.active ?? true,
      };
    }

    return null;
  }

  /**
   * Persists newly fetched registry records into Dexie storage.
   */
  private async saveToDexieStorage(record: GsisCompanyRecord): Promise<void> {
    const tenantId = this.auth.currentTenantId();
    if (!tenantId || !record.afm) return;

    const existing = await this.db.getCustomerByAfm(tenantId, record.afm);
    const now = new Date().toISOString();

    const customerRecord: LocalCustomerRecord = {
      id: existing?.id || crypto.randomUUID(),
      tenantId,
      afm: record.afm,
      branch: 0,
      country: 'GR',
      legalName: record.legalName,
      doy: record.doyDescr || record.doy || '',
      email: existing?.email || '',
      phone: existing?.phone || '',
      address: {
        street: record.postalAddress || existing?.address?.street || '',
        number: record.postalAddressNo || existing?.address?.number || '',
        postalCode: record.postalZipCode || existing?.address?.postalCode || '',
        city: record.postalAreaDescription || existing?.address?.city || '',
      },
      updatedAt: now,
    };

    await this.db.saveCustomer(customerRecord);
  }

  /**
   * Fallback for unknown external AFMs when network is unavailable.
   */
  private getMockFallbackRecord(afm: string): Observable<GsisCompanyRecord> {
    const record: GsisCompanyRecord = {
      afm,
      legalName: '',
      commercialTitle: '',
      doy: '',
      doyDescr: '',
      postalAddress: '',
      postalAddressNo: '',
      postalZipCode: '',
      postalAreaDescription: '',
      isNormalVatRegime: true,
      active: true,
    };

    return of(record).pipe(delay(200));
  }
}
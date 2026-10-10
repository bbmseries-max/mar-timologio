import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of, throwError } from 'rxjs';
import { switchMap, catchError, delay } from 'rxjs/operators';
import { isValidGreekAfm } from '../utils/fiscal-engine';
import { LocalDbService } from './local-db.service';
import { AuthTenantService } from './auth-tenant.service';

export interface GsisCompanyRecord {
  afm: string;
  legalName: string;
  commercialTitle?: string;
  doy: string;
  doyDescr: string;
  postalAddress: string;
  postalAddressNo: string;
  postalZipCode: string;
  postalAreaDescription: string;
  firmActivationDate?: string;
  isNormalVatRegime: boolean;
  active: boolean;
}

@Injectable({ providedIn: 'root' })
export class GsisLookupService {
  private readonly db = inject(LocalDbService);
  private readonly auth = inject(AuthTenantService);
  private readonly http = inject(HttpClient);
  private readonly apiEndpoint = '/api/gsis/lookup';

  /**
   * Performs an automated lookup for an AFM.
   * Priority:
   * 1. Own Store Settings in Dexie
   * 2. Saved Customers / Suppliers in Dexie
   * 3. Backend GSIS Proxy (if available)
   * 4. Offline Fallback
   */
  public lookupAfm(afm: string): Observable<GsisCompanyRecord> {
    const cleanAfm = (afm || '').trim();

    if (!isValidGreekAfm(cleanAfm)) {
      return throwError(() => new Error('Το Α.Φ.Μ. δεν είναι αριθμητικά έγκυρο (Modulo 11).'));
    }

    return from(this.checkLocalDexieStorage(cleanAfm)).pipe(
      switchMap((localRecord) => {
        // If found in local Dexie, return it immediately without network requests
        if (localRecord) {
          return of(localRecord);
        }

        // Otherwise try the proxy, and fallback if offline/unreachable
        return this.http.get<GsisCompanyRecord>(`${this.apiEndpoint}?afm=${cleanAfm}`).pipe(
          catchError(() => {
            return this.getMockFallbackRecord(cleanAfm);
          })
        );
      })
    );
  }

  /**
   * Checks Dexie for your own shop profile or cached suppliers/customers.
   */
  private async checkLocalDexieStorage(afm: string): Promise<GsisCompanyRecord | null> {
    const tenantId = this.auth.currentTenantId();

   // 1. Is this your own shop from /settings?
    const settings = await this.db.getSettingsForTenant(tenantId);
    if (settings && settings.afm === afm) {
      const s = settings as any; // Safe fallback for flat or nested models
      return {
        afm: settings.afm,
        legalName: settings.legalName,
        commercialTitle: s.tradeName || settings.legalName,
        doy: settings.doy || '',
        doyDescr: settings.doy || '',
        postalAddress: s.street || s.address?.street || '',
        postalAddressNo: s.number || s.address?.number || '',
        postalZipCode: s.postalCode || s.address?.postalCode || '',
        postalAreaDescription: s.city || s.address?.city || '',
        isNormalVatRegime: true,
        active: true,
      };
    }

    // 2. Is this an existing customer/supplier saved in Dexie?
    const cachedCustomer = await this.db.getCustomerByAfm(tenantId, afm);
    if (cachedCustomer) {
      return {
        afm: cachedCustomer.afm,
        legalName: cachedCustomer.legalName,
        commercialTitle: cachedCustomer.tradeName || cachedCustomer.legalName,
        doy: cachedCustomer.doy || '',
        doyDescr: cachedCustomer.doy || '',
        postalAddress: cachedCustomer.address?.street || '',
        postalAddressNo: cachedCustomer.address?.number || '',
        postalZipCode: cachedCustomer.address?.postalCode || '',
        postalAreaDescription: cachedCustomer.address?.city || '',
        isNormalVatRegime: true,
        active: true,
      };
    }

    return null;
  }

  /**
   * Fallback for unknown external AFMs when no backend GSIS service is configured.
   */
  private getMockFallbackRecord(afm: string): Observable<GsisCompanyRecord> {
    // If not found anywhere, return empty details so the user can type the real name manually
    const record: GsisCompanyRecord = {
      afm: afm,
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
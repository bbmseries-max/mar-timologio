import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of, throwError } from 'rxjs';
import { switchMap, catchError, tap } from 'rxjs/operators';
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
  source?: 'LOCAL_CACHE' | 'GSIS' | 'EU_VIES';
}

@Injectable({ providedIn: 'root' })
export class GsisLookupService {
  private readonly db = inject(LocalDbService);
  private readonly auth = inject(AuthTenantService);
  private readonly http = inject(HttpClient);

  private readonly gsisEndpoint = 'https://gsis-lookup.bbmseries.workers.dev/gsis/lookup';
  private readonly viesEndpoint = 'https://gsis-lookup.bbmseries.workers.dev/vies/lookup';

  /**
   * Resilient Lookup Chain:
   * 1. Local Dexie Storage (Instant 1ms cache)
   * 2. GSIS Greek Registry (If credentials exist)
   * 3. EU VIES Open Registry (Free fallback, no credentials required)
   */
  public lookupAfm(afm: string): Observable<GsisCompanyRecord> {
    const cleanAfm = (afm || '').replace(/\D/g, '').trim();

    if (!isValidGreekAfm(cleanAfm)) {
      return throwError(() => new Error('Το Α.Φ.Μ. δεν είναι αριθμητικά έγκυρο (Modulo 11).'));
    }

    const tenantId = this.auth.currentTenantId();

    return from(this.checkLocalDexieStorage(cleanAfm)).pipe(
      switchMap((localRecord) => {
        // Step 1: Hit from Dexie Cache
        if (localRecord && localRecord.legalName?.trim()) {
          return of({ ...localRecord, source: 'LOCAL_CACHE' as const });
        }

        // Step 2: Attempt GSIS or proceed straight to EU VIES
        return from(this.db.getSettingsForTenant(tenantId)).pipe(
          switchMap((settings: any) => {
            const username = (settings?.gsisUsername || '').trim();
            const password = (settings?.gsisPassword || '').trim();
            const callerAfm = settings?.afm ? settings.afm.replace(/\D/g, '').trim() : '';

            // If store hasn't configured GSIS credentials yet, skip straight to VIES
            if (!username || !password) {
              return this.lookupViaVies(cleanAfm);
            }

            // Attempt GSIS first
            const gsisPayload = {
              afm: cleanAfm,
              callerAfm: callerAfm || '067424104',
              username,
              password,
            };

            return this.http.post<any>(this.gsisEndpoint, gsisPayload).pipe(
              switchMap((res: any) => {
                if (!res || res.success === false || !res.legalName) {
                  // If GSIS fails or is blocked by WAF, fall back to VIES immediately
                  return this.lookupViaVies(cleanAfm);
                }

                const mapped: GsisCompanyRecord = {
                  afm: cleanAfm,
                  legalName: res.legalName,
                  commercialTitle: res.tradeName || res.legalName,
                  doy: res.doy || '',
                  doyDescr: res.doy || '',
                  postalAddress: res.street || '',
                  postalAddressNo: res.number || '',
                  postalZipCode: res.postalCode || '',
                  postalAreaDescription: res.city || '',
                  isNormalVatRegime: true,
                  active: res.active !== false,
                  source: 'GSIS',
                };
                return of(mapped);
              }),
              catchError(() => this.lookupViaVies(cleanAfm))
            );
          }),
          tap((record) => {
            if (record && record.legalName?.trim()) {
              this.saveToDexieStorage(record).catch((err) =>
                console.warn('Failed to cache customer in Dexie:', err)
              );
            }
          })
        );
      })
    );
  }

  /**
   * Queries EU VIES and parses the combined Greek address string.
   */
  private lookupViaVies(afm: string): Observable<GsisCompanyRecord> {
    return this.http.post<any>(this.viesEndpoint, { afm }).pipe(
      switchMap((viesRes: any) => {
        if (!viesRes || viesRes.success === false || !viesRes.legalName) {
          return throwError(() => new Error('Δεν βρέθηκαν στοιχεία επιχείρησης στο μητρώο (GSIS & VIES).'));
        }

        const parsedAddress = this.parseGreekAddressString(viesRes.rawAddress || '');

        const record: GsisCompanyRecord = {
          afm,
          legalName: viesRes.legalName,
          commercialTitle: viesRes.legalName,
          doy: '',
          doyDescr: '',
          postalAddress: parsedAddress.street,
          postalAddressNo: parsedAddress.number,
          postalZipCode: parsedAddress.postalCode,
          postalAreaDescription: parsedAddress.city,
          isNormalVatRegime: true,
          active: true,
          source: 'EU_VIES',
        };

        return of(record);
      })
    );
  }

  /**
   * Parses raw VIES addresses such as:
   * "ΛΕΩΦΟΡΟΣ ΚΗΦΙΣΙΑΣ 99\n15124 ΜΑΡΟΥΣΙ" or "ΣΤΑΔΙΟΥ 15, 10561, ΑΘΗΝΑ"
   */
  private parseGreekAddressString(raw: string): { street: string; number: string; postalCode: string; city: string } {
    if (!raw) return { street: '', number: '', postalCode: '', city: '' };

    const lines = raw.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    let streetLine = lines[0] || '';
    let cityLine = lines[1] || '';

    // If address is single-line with commas
    if (lines.length === 1 && raw.includes(',')) {
      const parts = raw.split(',').map((p) => p.trim());
      streetLine = parts[0] || '';
      cityLine = parts.slice(1).join(' ');
    }

    // Extract street name and street number
    let street = streetLine;
    let number = '';
    const streetMatch = streetLine.match(/^(.*?)\s+(\d+[\w\-\/]*)$/);
    if (streetMatch) {
      street = streetMatch[1].trim();
      number = streetMatch[2].trim();
    }

    // Extract 5-digit Greek Postal Code (e.g. 15124 or 151 24)
    let postalCode = '';
    let city = cityLine;
    const pcMatch = cityLine.match(/(\b\d{3}\s?\d{2}\b)/);
    if (pcMatch) {
      postalCode = pcMatch[1].replace(/\s/g, '');
      city = cityLine.replace(pcMatch[0], '').replace(/[-–,]/g, '').trim();
    }

    return { street, number, postalCode, city };
  }

  /**
   * Cache checks and Dexie persistence routines.
   */
  private async checkLocalDexieStorage(afm: string): Promise<GsisCompanyRecord | null> {
    const tenantId = this.auth.currentTenantId();
    const cachedCustomer = await this.db.getCustomerByAfm(tenantId, afm);

    if (cachedCustomer && cachedCustomer.legalName?.trim()) {
      return {
        afm: cachedCustomer.afm,
        legalName: cachedCustomer.legalName,
        commercialTitle: cachedCustomer.legalName,
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

  private async saveToDexieStorage(record: GsisCompanyRecord): Promise<void> {
    const tenantId = this.auth.currentTenantId();
    if (!tenantId || !record.afm) return;

    const existing = await this.db.getCustomerByAfm(tenantId, record.afm);
    const customerRecord: LocalCustomerRecord = {
      id: existing?.id || crypto.randomUUID(),
      tenantId,
      afm: record.afm,
      branch: 0,
      country: 'GR',
      legalName: record.legalName,
      doy: record.doy || '',
      email: existing?.email || '',
      phone: existing?.phone || '',
      address: {
        street: record.postalAddress || '',
        number: record.postalAddressNo || '',
        postalCode: record.postalZipCode || '',
        city: record.postalAreaDescription || '',
      },
      updatedAt: new Date().toISOString(),
    };

    await this.db.saveCustomer(customerRecord);
  }
}
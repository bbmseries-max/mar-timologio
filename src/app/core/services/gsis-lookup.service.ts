import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of, throwError } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { isValidGreekAfm } from '../utils/fiscal-engine';
import { LocalDbService, LocalCustomerRecord } from './local-db.service';
import { AuthTenantService } from './auth-tenant.service';
import { resolveGreekDoy } from '../constants/greek-doy.constants';

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
   * 1. Local Dexie Storage (Instant cache)
   * 2. GSIS Greek Registry SOAP 1.2
   * 3. EU VIES Open Registry (Fallback)
   */
  public lookupAfm(afm: string): Observable<GsisCompanyRecord> {
    const cleanAfm = (afm || '').replace(/\D/g, '').trim();

    if (!isValidGreekAfm(cleanAfm)) {
      return throwError(() => new Error('Το Α.Φ.Μ. δεν είναι αριθμητικά έγκυρο (Modulo 11).'));
    }

    const tenantId = this.auth.currentTenantId() || 'tenant_minimarket';

    return from(this.checkLocalDexieStorage(cleanAfm)).pipe(
      switchMap((localRecord) => {
        // Step 1: Hit from Dexie Cache
        if (localRecord && localRecord.legalName?.trim()) {
          console.log('[GSIS Service] Serving from local Dexie cache:', localRecord);
          return of({ ...localRecord, source: 'LOCAL_CACHE' as const });
        }

        // Step 2: Query Settings for GSIS Credentials
        return from(this.db.getSettingsForTenant(tenantId)).pipe(
          switchMap((settings: any) => {
            const isProd = settings?.isProduction === true || settings?.fiscalEnvironment === 'production';

let username = (settings?.gsisUsername || '').trim();
let password = (settings?.gsisPassword || '').trim();
let callerAfm = (settings?.afm ? String(settings.afm).replace(/\D/g, '').trim() : '');

// Allow sandbox defaults ONLY when outside production
if (!isProd) {
  username = username || 'MARANTH-APP26';
  password = password || 'Test@Test33';
  callerAfm = callerAfm || '067424104';
}

if (isProd && (!username || !password || !callerAfm)) {
  // If production user omitted credentials, fail gracefully to EU VIES
  console.warn('[GSIS Service] Production tenant has not configured GSIS credentials. Falling back to VIES.');
  return this.lookupViaVies(cleanAfm);
}

            const gsisPayload = {
              action: 'gsis_lookup',
              tenantId: tenantId,
              targetAfm: cleanAfm,
              afm: cleanAfm,
              callerAfm: callerAfm,
              username: username,
              password: password,
            };

            return this.http.post<any>(this.gsisEndpoint, gsisPayload).pipe(
              switchMap((res: any) => {
                const data = res?.data || res;
                const legalName = data?.legalName || res?.legalName;

                if (!res || res.success === false || !legalName) {
                  console.warn('[GSIS Service] GSIS lookup unsuccessful, falling back to VIES:', res);
                  return this.lookupViaVies(cleanAfm);
                }

                const rawDoy = data.doyDescr || data.doy || res.doyDescr || res.doy || '';
                const resolvedDoy = resolveGreekDoy(rawDoy);
                const street = (data.street || res.street || data.postalAddress || '').trim();
                const rawNum = data.number || res.number || data.postalAddressNo || '';
                const number = (rawNum && rawNum !== '0') ? String(rawNum).trim() : '1';
                const postalCode = (data.postalCode || res.postalCode || data.postalZipCode || '').trim();
                const city = (data.city || res.city || data.postalAreaDescription || '').trim();

                // Accurate deactivation logic: deactivation_flag '1' or 'Y' means DEACTIVATED
                const isDeactivated = data.deactivation_flag != null
                  ? String(data.deactivation_flag).trim() === '1' || String(data.deactivation_flag).trim().toUpperCase() === 'Y'
                  : data.active === false;

                const mapped: GsisCompanyRecord = {
                  afm: cleanAfm,
                  legalName: legalName.trim(),
                  commercialTitle: (data.commercialTitle || res.commercialTitle || legalName).trim(),
                  doy: resolvedDoy,
                  doyDescr: resolvedDoy,
                  postalAddress: street,
                  postalAddressNo: number,
                  postalZipCode: postalCode,
                  postalAreaDescription: city,
                  isNormalVatRegime: true,
                  active: !isDeactivated,
                  source: 'GSIS',
                };

                // Cache valid GSIS record in Dexie
                this.saveToDexieStorage(mapped).catch((err) =>
                  console.warn('Failed to cache customer in Dexie:', err)
                );

                return of(mapped);
              }),
              catchError((httpErr) => {
                console.error('[GSIS Service] GSIS HTTP call failed, falling back to VIES:', httpErr);
                return this.lookupViaVies(cleanAfm);
              })
            );
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

        const parsedAddress = this.parseGreekAddressString(viesRes.rawAddress || viesRes.street || '');

        const record: GsisCompanyRecord = {
          afm,
          legalName: viesRes.legalName.trim(),
          commercialTitle: viesRes.legalName.trim(),
          doy: '',
          doyDescr: '',
          postalAddress: parsedAddress.street,
          postalAddressNo: parsedAddress.number || '1',
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
   * or single-line combined addresses: "ΟΚΑΑ Λ35 Λ37 Μ36 18233 ΑΓ Ι ΡΕΝΤΗΣ"
   */
  private parseGreekAddressString(raw: string): { street: string; number: string; postalCode: string; city: string } {
    if (!raw) return { street: '', number: '1', postalCode: '', city: '' };

    const cleaned = raw.trim().replace(/\s+/g, ' ');

    // 1. Check for 5-digit Greek postal code pattern anywhere in the string
    const zipMatches = [...cleaned.matchAll(/\b(\d{5})\b/g)];
    if (zipMatches.length > 0) {
      const match = zipMatches[zipMatches.length - 1];
      const postalCode = match[1];
      const idx = match.index!;

      let beforeZip = cleaned.substring(0, idx).trim().replace(/[\-–—.,]+$/, '');
      let afterZip = cleaned.substring(idx + 5).trim().replace(/^[\s\-–—.,]+/, '').replace(/[\s\-–—]+(GR|GREECE|ΕΛΛΑΔΑ)$/i, '');

      // Extract street number if trailing digits exist
      const numMatch = beforeZip.match(/^(.*?)(?:\s+(\d+[A-Za-z\u0370-\u03ff]*))$/);
      let street = beforeZip;
      let number = '1';

      if (numMatch && numMatch[2] && numMatch[2] !== '0') {
        street = numMatch[1]?.trim() || beforeZip;
        number = numMatch[2].trim();
      }

      return {
        street: street || beforeZip,
        number: number || '1',
        postalCode,
        city: afterZip || '',
      };
    }

    // 2. Multiline fallback if no 5-digit zip is matched
    const lines = raw.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    return {
      street: lines[0] || cleaned,
      number: '1',
      postalCode: '',
      city: lines[1] || '',
    };
  }

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
        postalAddressNo: cachedCustomer.address?.number || '1',
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
        number: record.postalAddressNo || '1',
        postalCode: record.postalZipCode || '',
        city: record.postalAreaDescription || '',
      },
      updatedAt: new Date().toISOString(),
    };

    await this.db.saveCustomer(customerRecord);
  }

  
}
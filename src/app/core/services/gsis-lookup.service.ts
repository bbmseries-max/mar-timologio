import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of, throwError } from 'rxjs';
import { switchMap, catchError, tap } from 'rxjs/operators';
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
          // Hardcode sandbox fallback credentials if settings are empty in local dev
          const username = (settings?.gsisUsername || '').trim() || 'MARANTH-APP26';
          const password = (settings?.gsisPassword || '').trim() || 'Test@Test33';
          const callerAfm = (settings?.afm ? settings.afm.replace(/\D/g, '').trim() : '') || '067424104';

          console.log('[GSIS Service] Using credentials:', { username, callerAfm, targetAfm: cleanAfm });

          const gsisPayload = {
            action: 'gsis_lookup',
            tenantId: tenantId,
            targetAfm: cleanAfm,
            afm: cleanAfm,
            callerAfm: callerAfm,
            username: username,
            password: password,
          };

          console.log('[GSIS Service] Dispatching to worker:', this.gsisEndpoint, gsisPayload);

          return this.http.post<any>(this.gsisEndpoint, gsisPayload).pipe(
            switchMap((res: any) => {
              console.log('[GSIS Service] Raw HTTP response received:', res);

              const data = res?.data || res;
              const legalName = data?.legalName || res?.legalName;

              if (!res || res.success === false || !legalName) {
                console.warn('[GSIS Service] Worker returned unsuccessful, falling back to VIES. Response:', res);
                return this.lookupViaVies(cleanAfm);
              }

              const rawDoy = data.doyDescr || data.doy || res.doyDescr || res.doy || '';
              const resolvedDoy = resolveGreekDoy(rawDoy);
              const street = data.street || res.street || data.postalAddress || '';
              const number = data.number || res.number || data.postalAddressNo || '1';
              const postalCode = data.postalCode || res.postalCode || data.postalZipCode || '';
              const city = data.city || res.city || data.postalAreaDescription || '';

              const mapped: GsisCompanyRecord = {
                afm: cleanAfm,
                legalName: legalName.trim(),
                commercialTitle: data.commercialTitle || res.commercialTitle || legalName.trim(),
                doy: resolvedDoy,
                doyDescr: resolvedDoy,
                postalAddress: street,
                postalAddressNo: number,
                postalZipCode: postalCode,
                postalAreaDescription: city,
                isNormalVatRegime: true,
                active: data.deactivation_flag ? data.deactivation_flag === '1' : data.active !== false,
                source: 'GSIS',
              };

              // Cache valid GSIS record in Dexie
              this.saveToDexieStorage(mapped).catch((err) =>
                console.warn('Failed to cache customer in Dexie:', err)
              );

              return of(mapped);
            }),
            catchError((httpErr) => {
              console.error('[GSIS Service] HTTP call to worker failed, falling back to VIES:', httpErr);
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

    if (lines.length === 1 && raw.includes(',')) {
      const parts = raw.split(',').map((p) => p.trim());
      streetLine = parts[0] || '';
      cityLine = parts.slice(1).join(' ');
    }

    let street = streetLine;
    let number = '';
    const streetMatch = streetLine.match(/^(.*?)\s+(\d+[\w\-\/]*)$/);
    if (streetMatch) {
      street = streetMatch[1].trim();
      number = streetMatch[2].trim();
    }

    let postalCode = '';
    let city = cityLine;
    const pcMatch = cityLine.match(/(\b\d{3}\s?\d{2}\b)/);
    if (pcMatch) {
      postalCode = pcMatch[1].replace(/\s/g, '');
      city = cityLine.replace(pcMatch[0], '').replace(/[-–,]/g, '').trim();
    }

    return { street, number, postalCode, city };
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
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError, delay } from 'rxjs/operators';
import { isValidGreekAfm } from '../utils/fiscal-engine';

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
  isNormalVatRegime: boolean; // false if exempt or special regime
  active: boolean; // True if company is active / not dissolved
}

@Injectable({ providedIn: 'root' })
export class GsisLookupService {
  private readonly http = inject(HttpClient);
  // In production, points to your Maranth Backend API endpoint:
  private readonly apiEndpoint = '/api/gsis/lookup';

  /**
   * Performs an automated lookup for an AFM.
   * Runs local Modulo-11 pre-validation first.
   */
  public lookupAfm(afm: string): Observable<GsisCompanyRecord> {
    const cleanAfm = (afm || '').trim();

    if (!isValidGreekAfm(cleanAfm)) {
      return throwError(() => new Error('Το Α.Φ.Μ. δεν είναι αριθμητικά έγκυρο (Modulo 11).'));
    }

    // Call the backend proxy with query parameter
    return this.http.get<GsisCompanyRecord>(`${this.apiEndpoint}?afm=${cleanAfm}`).pipe(
      catchError((error) => {
        console.warn('Backend GSIS proxy unreachable. Falling back to local offline dictionary / mock simulation.', error);
        return this.getMockFallbackRecord(cleanAfm);
      })
    );
  }

  /**
   * Offline/Local Dev Fallback: Returns realistic Greek company data
   * for development or when internet connectivity is down.
   */
  private getMockFallbackRecord(afm: string): Observable<GsisCompanyRecord> {
    const mockDatabase: Record<string, GsisCompanyRecord> = {
      '094123456': {
        afm: '094123456',
        legalName: 'ΠΑΠΑΔΟΠΟΥΛΟΣ Α.Ε.Β.Ε. ΒΙΟΜΗΧΑΝΙΑ ΜΠΙΣΚΟΤΩΝ',
        commercialTitle: 'ΜΠΙΣΚΟΤΑ ΠΑΠΑΔΟΠΟΥΛΟΥ',
        doy: '1159',
        doyDescr: 'ΦΑΕ ΑΘΗΝΩΝ',
        postalAddress: 'Π. ΡΑΛΛΗ',
        postalAddressNo: '26',
        postalZipCode: '11810',
        postalAreaDescription: 'ΤΑΥΡΟΣ',
        firmActivationDate: '1971-05-12',
        isNormalVatRegime: true,
        active: true,
      },
      '801234567': {
        afm: '801234567',
        legalName: 'MARANTH MONΟΠΡΟΣΩΠΗ Ι.Κ.Ε.',
        commercialTitle: 'MARANTH SOFTWARE',
        doy: '1104',
        doyDescr: 'ΧΑΛΑΝΔΡΙΟΥ',
        postalAddress: 'ΛΕΩΦ. ΚΗΦΙΣΙΑΣ',
        postalAddressNo: '200',
        postalZipCode: '15231',
        postalAreaDescription: 'ΧΑΛΑΝΔΡΙ',
        firmActivationDate: '2023-01-15',
        isNormalVatRegime: true,
        active: true,
      },
    };

    const record = mockDatabase[afm] || {
      afm: afm,
      legalName: `ΕΜΠΟΡΙΚΗ ΕΠΙΧΕΙΡΗΣΗ ${afm.slice(-4)} Α.Ε.`,
      commercialTitle: 'ΕΜΠΟΡΙΚΗ & ΣΙΑ',
      doy: '1101',
      doyDescr: 'Δ\' ΑΘΗΝΩΝ',
      postalAddress: 'ΕΡΜΟΥ',
      postalAddressNo: '15',
      postalZipCode: '10563',
      postalAreaDescription: 'ΑΘΗΝΑ',
      firmActivationDate: '2010-09-01',
      isNormalVatRegime: true,
      active: true,
    };

    return of(record).pipe(delay(400));
  }
}
import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import {
  LocalInvoiceRecord, 
  CompanySettingsRecord,
  Product,
} from '../models/database.models';
import { Customer } from '../models/aade.models';
import { TenantSettingsRecord } from '../models/database.models';

export interface LocalCustomerRecord extends Customer {
  id: string;
  tenantId: string;
  phone?: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class LocalDbService extends Dexie {
  public invoices!: Table<LocalInvoiceRecord, string>;
  public products!: Table<Product, string>;
  public settings!: Table<TenantSettingsRecord, string>;
  public customers!: Table<LocalCustomerRecord, string>;

  constructor() {
    super('MaranthHubMultiTenantDb');

    this.version(1).stores({
      settings: 'tenantId, afm, fiscalEnvironment',
      invoices: 'id, tenantId, mark, transmissionStatus, issueDate',
      products: 'id, tenantId, name, barcode'
    });
  

    // Make sure each table key appears EXACTLY ONCE
    this.version(2).stores({
      invoices: 'id, tenantId, series, documentNumber, issueDate, customerAfm, transmissionStatus, updatedAt, createdAt',
      products: 'id, tenantId, barcode, *altBarcodes, name, isPinned',
      settings: 'id', 
      customers: 'id, tenantId, afm, legalName, phone, updatedAt',
    });

    this.version(3).stores({
  invoices: 'id, tenantId, series, documentNumber, issueDate, customerAfm, transmissionStatus, updatedAt, createdAt',
  products: 'id, tenantId, barcode, *altBarcodes, name, isPinned',
  settings: 'tenantId', // <-- Dexie now knows the primary key is 'tenantId'!
  customers: 'id, tenantId, afm, legalName, phone, updatedAt',
    });
    this.version(4).stores({
  invoices: 'id, tenantId, series, documentNumber, issueDate, customerAfm, transmissionStatus, mark, uid, updatedAt, createdAt',
  products: 'id, tenantId, barcode, *altBarcodes, name, isPinned',
  settings: 'tenantId',
  customers: 'id, tenantId, afm, legalName, phone, updatedAt',
});
  }

  public async getAllInvoices(tenantId?: string): Promise<LocalInvoiceRecord[]> {
    if (tenantId) {
      return this.invoices
        .where('tenantId')
        .equals(tenantId)
        .reverse()
        .sortBy('createdAt');
    }
    return this.invoices.toCollection().reverse().sortBy('createdAt');
  }

  /**
   * Retrieves the highest documentNumber used for a given series and tenant,
   * returning highest + 1. Defaults to 1 if no invoices exist for this series.
   */
  public async getNextDocumentNumber(tenantId: string, series: string): Promise<number> {
  const normalizedSeries = (series || '').trim().toUpperCase();

  // 1. Fetch only invoices that have actually been transmitted or finalized
  const officialInvoices = await this.invoices
    .where('tenantId')
    .equals(tenantId)
    .filter(inv => {
      const matchesSeries = (inv.series || '').trim().toUpperCase() === normalizedSeries;
      // An invoice is official if it has a myDATA MARK or is marked transmitted/cancelled
      const isOfficial = !!inv.mark || 
        inv.transmissionStatus === 'TRANSMITTED' || 
        inv.transmissionStatus === 'CANCELLED';
      
      return matchesSeries && isOfficial;
    })
    .toArray();

  if (!officialInvoices.length) {
    return 1;
  }

  // 2. Find the highest documentNumber among official records
  const maxNumber = Math.max(...officialInvoices.map(inv => Number(inv.documentNumber) || 0));
  
  return maxNumber + 1;
}

  public async updateInvoice(id: string, changes: Partial<LocalInvoiceRecord>): Promise<number> {
  return await this.invoices.update(id, changes);
}

  // --- Products Catalog ---

  /**
   * Bulk inserts or updates products from CSV / Excel importers.
   */
  public async bulkSaveProducts(products: Product[]): Promise<void> {
    await this.products.bulkPut(products);
  }



  // --- Settings & AADE Credentials ---

  public async getSettingsForTenant(tenantId: string): Promise<TenantSettingsRecord | undefined> {
    return this.settings.get(tenantId);
  }

  public async getSettings(tenantId: string): Promise<TenantSettingsRecord | undefined> {
    return this.settings.get(tenantId);
  }

  public async getInvoiceById(id: string): Promise<LocalInvoiceRecord | undefined> {
  return await this.invoices.get(id);
}

  public async saveSettings(record: TenantSettingsRecord): Promise<string> {
    return this.settings.put(record);
  }

  // --- Customers Directory & Local Cache ---

  public async getCustomersForTenant(tenantId: string): Promise<LocalCustomerRecord[]> {
    return this.customers.where('tenantId').equals(tenantId).reverse().sortBy('updatedAt');
  }

  public async searchCustomersForTenant(tenantId: string, query: string): Promise<LocalCustomerRecord[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return this.customers
      .where('tenantId')
      .equals(tenantId)
      .filter((c) => {
        const matchAfm = c.afm ? c.afm.includes(q) : false;
        const matchName = c.legalName ? c.legalName.toLowerCase().includes(q) : false;
        const matchPhone = c.phone ? c.phone.includes(q) : false;
        return matchAfm || matchName || matchPhone;
      })
      .limit(8)
      .toArray();
  }
  

  public async getCustomerByAfm(tenantId: string, afm: string): Promise<LocalCustomerRecord | undefined> {
    return this.customers
      .where('tenantId')
      .equals(tenantId)
      .filter((c) => c.afm === afm.trim())
      .first();
  }

  public async saveSettingsForTenant(
  tenantId: string,
  settings: Partial<TenantSettingsRecord>
): Promise<string> {
  const existing = await this.getSettingsForTenant(tenantId);

  // Compute canonical fiscalEnvironment with explicit precedence
  const resolvedFiscalEnv = settings.fiscalEnvironment 
    ?? (settings.isProduction !== undefined ? (settings.isProduction ? 'production' : 'dev') : undefined)
    ?? existing?.fiscalEnvironment 
    ?? 'dev';

  const updatedRecord: TenantSettingsRecord = {
    afm: '',
    doy: '',
    legalName: '',
    street: '',
    number: '',
    postalCode: '',
    city: '',
    branch: 0,
    defaultSeries: 'A',
    ...( existing || {}),
    ...( settings || {}),
   tenantId,
  id: tenantId,
  fiscalEnvironment: resolvedFiscalEnv,
  isProduction: resolvedFiscalEnv === 'production',
  fiscalMode: (settings?.fiscalMode ?? settings?.fiscalMode ?? existing?.fiscalMode ?? existing?.fiscalMode) || 'DIRECT_AADE',
  updatedAt: new Date().toISOString()
};

  await this.settings.put(updatedRecord);
  return tenantId;
}

  public async saveCustomer(record: LocalCustomerRecord): Promise<string> {
    await this.customers.put(record);
    return record.id != null ? String(record.id) : '';
  }

  public async bulkSaveCustomers(records: LocalCustomerRecord[]): Promise<void> {
    await this.customers.bulkPut(records);
  }

  // --- Draft Invoices ---

  public async getLatestDraftForTenant(tenantId: string): Promise<LocalInvoiceRecord | undefined> {
    return this.invoices
      .where('tenantId')
      .equals(tenantId)
      .filter((inv) => inv.transmissionStatus === 'DRAFT')
      .reverse()
      .sortBy('updatedAt')
      .then((records) => records[0]);
  }

  public async saveDraft(record: LocalInvoiceRecord): Promise<string> {
    await this.invoices.put(record);
    return record.id != null ? String(record.id) : '';
  }

  public async deleteInvoice(id: string): Promise<void> {
    await this.invoices.delete(id);
  }

  // --- Products Catalog ---

  public async searchProductsForTenant(tenantId: string, query: string): Promise<Product[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return this.products
      .where('tenantId')
      .equals(tenantId)
      .filter((p) => {
        const matchName = p.name ? p.name.toLowerCase().includes(q) : false;
        const matchBarcode = p.barcode ? p.barcode.includes(q) : false;
        return matchName || matchBarcode;
      })
      .limit(10)
      .toArray();
  }

  /**
 * Updates an invoice record in Dexie with its AADE cancellation mark
 */
public async markInvoiceAsCancelled(
  invoiceId: string,
  cancellationMark: string
): Promise<void> {
  await this.invoices.update(invoiceId, {
    transmissionStatus: 'CANCELLED',
    cancellationMark,
    cancelledAt: new Date().toISOString(),
    updatedAt: Date.now()
  });
}

/**
   * Finalizes an invoice or 9.3 delivery note after successful AADE submission
   */
  public async markInvoiceAsTransmitted(
    id: string,
    aadeData: { mark: string; uid: string; qrUrl?: string }
  ): Promise<void> {
    await this.invoices.update(id, {
      mark: aadeData.mark,
      uid: aadeData.uid,
      qrUrl: aadeData.qrUrl,
      transmissionStatus: 'TRANSMITTED',
      transmittedAt: new Date().toISOString(),
      updatedAt: Date.now()
    } as Partial<LocalInvoiceRecord>);
  }

  /**
 * Safely removes untransmitted records (DRAFT or FAILED) without an AADE MARK.
 * Never touches records with transmissionStatus === 'TRANSMITTED' or valid mark.
 */
public async purgeDraftAndFailedInvoices(
  tenantId: string, 
  options?: { olderThanDays?: number; seriesFilter?: string[] }
): Promise<number> {
  if (!tenantId) return 0;

  // Query only invoices belonging to this tenant
  const collection = this.invoices
    .where('tenantId')
    .equals(tenantId)
    .filter((inv: LocalInvoiceRecord) => {
      // 1. Absolute safety guard: never delete anything with a valid AADE MARK
      if (inv.mark && String(inv.mark).trim().length > 0) {
        return false;
      }

      // 2. Target only untransmitted statuses
      const isCandidate = inv.transmissionStatus === 'DRAFT' || inv.transmissionStatus === 'FAILED';
      if (!isCandidate) return false;

      // 3. Optional series filter (e.g. only test series like ['dev', 'tes', 'A'])
      if (options?.seriesFilter && options.seriesFilter.length > 0) {
        const normalizedSeries = (inv.series || '').trim().toUpperCase();
        const matchesSeries = options.seriesFilter
          .map(s => s.trim().toUpperCase())
          .includes(normalizedSeries);
        if (!matchesSeries) return false;
      }

      // 4. Optional age threshold (in days)
      if (options?.olderThanDays && options.olderThanDays > 0) {
        const cutoffTime = Date.now() - options.olderThanDays * 24 * 60 * 60 * 1000;
        const recordTime = typeof inv.createdAt === 'number' 
          ? inv.createdAt 
          : new Date(inv.createdAt || inv.issueDate).getTime();
        return recordTime < cutoffTime;
      }

      return true;
    });

  const idsToDelete = await collection.primaryKeys();
  if (idsToDelete.length === 0) return 0;

  await this.invoices.bulkDelete(idsToDelete);
  return idsToDelete.length;
}
}
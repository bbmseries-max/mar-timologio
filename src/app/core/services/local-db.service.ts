import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import {
  LocalInvoiceRecord,
  Product,
  TenantSettingsRecord,
} from '../models/database.models';
import { Customer } from '../models/aade.models';

export interface LocalCustomerRecord extends Customer {
  id: string;
  tenantId: string;
  phone?: string;
  updatedAt: string;
}

export interface DocumentSequenceRecord {
  id: string; // e.g., `${tenantId}_${series}_${invoiceType}`
  tenantId: string;
  series: string;
  invoiceType: string;
  lastNumber: number;
  updatedAt: number;
}

@Injectable({ providedIn: 'root' })
export class LocalDbService extends Dexie {
  public invoices!: Table<LocalInvoiceRecord, string>;
  public products!: Table<Product, string>;
  public settings!: Table<TenantSettingsRecord, string>;
  public customers!: Table<LocalCustomerRecord, string>;
  public sequences!: Table<DocumentSequenceRecord, string>;

  constructor() {
    super('MaranthHubDb_v2');

    // Version 2 schema: indexes transmissionStatus, mark, and sequences
    this.version(2).stores({
      invoices: 'id, tenantId, invoiceType, mark, transmissionStatus, createdAt, updatedAt',
      settings: 'id, tenantId',
      customers: 'id, [tenantId+afm], tenantId, afm',
      products: 'id, tenantId, barcode, name',
      sequences: 'id, [tenantId+series+invoiceType]',
    });
  }

  // =========================================================================
  // Invoices & Transmission
  // =========================================================================

  public async getAllInvoices(tenantId?: string): Promise<LocalInvoiceRecord[]> {
    let records: LocalInvoiceRecord[];
    if (tenantId) {
      records = await this.invoices.where('tenantId').equals(tenantId).toArray();
    } else {
      records = await this.invoices.toArray();
    }

    // Reliable in-memory descending sort (newest first)
    return records.sort((a, b) => {
      const timeA = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt || a.issueDate).getTime() || 0;
      const timeB = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt || b.issueDate).getTime() || 0;
      return timeB - timeA;
    });
  }

  public async getInvoiceById(id: string | number): Promise<LocalInvoiceRecord | undefined> {
    const key = String(id);
    let record = await this.invoices.get(key);
    if (!record && typeof id === 'number') {
      record = await this.invoices.get(id as any);
    }
    return record;
  }

  public async updateInvoice(id: string | number, changes: Partial<LocalInvoiceRecord>): Promise<number> {
    const key = String(id);
    const count = await this.invoices.update(key, { ...changes, updatedAt: Date.now() });
    if (count === 0 && typeof id === 'number') {
      return await this.invoices.update(id as any, { ...changes, updatedAt: Date.now() });
    }
    return count;
  }

  /**
   * Resiliently locks in official AADE signature details.
   * If lookup by primary key fails, it recovers by series + documentNumber matching.
   */
  public async markInvoiceAsTransmitted(
    id: string | number,
    aadeData: { mark: string; uid: string; qrUrl?: string },
    fallbackMeta?: { tenantId?: string; series?: string; documentNumber?: number | string }
  ): Promise<boolean> {
    const now = Date.now();
    const isoDate = new Date().toISOString();

    const patch: any = {
      mark: String(aadeData.mark).trim(),
      uid: String(aadeData.uid).trim(),
      qrUrl: aadeData.qrUrl || '',
      transmissionStatus: 'TRANSMITTED',
      transmittedAt: isoDate,
      updatedAt: now,
    };

    // 1. Try standard primary key update
    let updatedCount = await this.updateInvoice(id, patch);

    // 2. Fallback: Search by series & documentNumber if primary key update affected 0 rows
    if (updatedCount === 0 && fallbackMeta?.series && fallbackMeta?.documentNumber) {
      const match = await this.invoices
        .filter((inv) => {
          const sameSeries = (inv.series || '').trim().toUpperCase() === String(fallbackMeta.series).trim().toUpperCase();
          const sameDoc = Number(inv.documentNumber) === Number(fallbackMeta.documentNumber);
          const sameTenant = fallbackMeta.tenantId ? inv.tenantId === fallbackMeta.tenantId : true;
          return sameSeries && sameDoc && sameTenant;
        })
        .first();

      if (match?.id) {
        updatedCount = await this.invoices.update(match.id, patch);
      }
    }

    return updatedCount > 0;
  }

  public async markInvoiceAsCancelled(invoiceId: string | number, cancellationMark: string): Promise<void> {
    await this.updateInvoice(invoiceId, {
      transmissionStatus: 'CANCELLED',
      cancellationMark,
      cancelledAt: new Date().toISOString(),
      updatedAt: Date.now(),
    });
  }

  public async getNextDocumentNumber(tenantId: string, series: string): Promise<number> {
    const normalizedSeries = (series || '').trim().toUpperCase();

    const officialInvoices = await this.invoices
      .where('tenantId')
      .equals(tenantId)
      .filter((inv) => {
        const matchesSeries = (inv.series || '').trim().toUpperCase() === normalizedSeries;
        const isOfficial =
          Boolean(inv.mark) ||
          inv.transmissionStatus === 'TRANSMITTED' ||
          inv.transmissionStatus === 'CANCELLED';

        return matchesSeries && isOfficial;
      })
      .toArray();

    if (!officialInvoices.length) {
      return 1;
    }

    const maxNumber = Math.max(...officialInvoices.map((inv) => Number(inv.documentNumber) || 0));
    return maxNumber + 1;
  }

  public async deleteInvoice(id: string | number): Promise<void> {
    await this.invoices.delete(String(id));
  }

  // =========================================================================
  // Drafts Handling
  // =========================================================================

  public async getLatestDraftForTenant(tenantId: string): Promise<LocalInvoiceRecord | undefined> {
    const drafts = await this.invoices
      .where('tenantId')
      .equals(tenantId)
    .filter((inv) => inv.transmissionStatus === 'DRAFT' || (!inv.mark && inv.transmissionStatus !== 'TRANSMITTED'))      .toArray();

    if (!drafts.length) return undefined;

    // Correct newest-first descending sort
    drafts.sort((a, b) => {
      const tA = typeof a.updatedAt === 'number' ? a.updatedAt : new Date(a.updatedAt || 0).getTime() || 0;
      const tB = typeof b.updatedAt === 'number' ? b.updatedAt : new Date(b.updatedAt || 0).getTime() || 0;
      return tB - tA;
    });

    return drafts[0];
  }

  public async saveDraft(record: LocalInvoiceRecord): Promise<string> {
    if (!record.id) {
      record.id = crypto.randomUUID();
    }
    record.updatedAt = Date.now();
    await this.invoices.put(record);
    return String(record.id);
  }

  // =========================================================================
  // Tenant Settings & AADE Profile
  // =========================================================================

  public async getSettingsForTenant(tenantId: string): Promise<TenantSettingsRecord | undefined> {
    return this.getSettings(tenantId);
  }

  public async getSettings(tenantId: string): Promise<TenantSettingsRecord | undefined> {
    let s = await this.settings.get(tenantId);
    if (!s) {
      s = await this.settings.where('tenantId').equals(tenantId).first();
    }
    if (!s) {
      const all = await this.settings.toArray();
      if (all.length > 0) s = all[0];
    }
    return s;
  }

  public async saveSettingsForTenant(
    tenantId: string,
    settings: Partial<TenantSettingsRecord>
  ): Promise<string> {
    const existing = await this.getSettingsForTenant(tenantId);

    const resolvedFiscalEnv =
      settings.fiscalEnvironment ??
      (settings.isProduction !== undefined
        ? settings.isProduction
          ? 'production'
          : 'dev'
        : undefined) ??
      existing?.fiscalEnvironment ??
      'dev';

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
      ...(existing || {}),
      ...(settings || {}),
      tenantId,
      id: tenantId,
      fiscalEnvironment: resolvedFiscalEnv,
      isProduction: resolvedFiscalEnv === 'production',
      fiscalMode: settings?.fiscalMode ?? existing?.fiscalMode ?? 'DIRECT_AADE',
      updatedAt: new Date().toISOString(),
    };

    await this.settings.put(updatedRecord);
    return tenantId;
  }

  // =========================================================================
  // Customers Directory
  // =========================================================================

  public async getCustomersForTenant(tenantId: string): Promise<LocalCustomerRecord[]> {
    const list = await this.customers.where('tenantId').equals(tenantId).toArray();
    return list.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
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

  public async saveCustomer(record: LocalCustomerRecord): Promise<string> {
    if (!record.id) {
      record.id = crypto.randomUUID();
    }
    record.updatedAt = new Date().toISOString();
    await this.customers.put(record);
    return String(record.id);
  }

  public async bulkSaveCustomers(records: LocalCustomerRecord[]): Promise<void> {
    await this.customers.bulkPut(records);
  }

  // =========================================================================
  // Products Catalog
  // =========================================================================

  public async bulkSaveProducts(products: Product[]): Promise<void> {
    await this.products.bulkPut(products);
  }

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

  // =========================================================================
  // Maintenance & Purging
  // =========================================================================

  public async purgeDraftAndFailedInvoices(
    tenantId: string,
    options?: { olderThanDays?: number; seriesFilter?: string[] }
  ): Promise<number> {
    if (!tenantId) return 0;

    const collection = this.invoices
      .where('tenantId')
      .equals(tenantId)
      .filter((inv: LocalInvoiceRecord) => {
        if (inv.mark && String(inv.mark).trim().length > 0) return false;

        const isCandidate =
          inv.transmissionStatus === 'DRAFT' ||
          inv.transmissionStatus === 'FAILED' ;
        if (!isCandidate) return false;

        if (options?.seriesFilter && options.seriesFilter.length > 0) {
          const normalizedSeries = (inv.series || '').trim().toUpperCase();
          const matches = options.seriesFilter
            .map((s) => s.trim().toUpperCase())
            .includes(normalizedSeries);
          if (!matches) return false;
        }

        if (options?.olderThanDays && options.olderThanDays > 0) {
          const cutoffTime = Date.now() - options.olderThanDays * 24 * 60 * 60 * 1000;
          const recordTime =
            typeof inv.createdAt === 'number'
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
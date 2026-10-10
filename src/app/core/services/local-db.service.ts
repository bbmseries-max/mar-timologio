import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import {
  LocalInvoiceRecord,
  Product,
  CompanySettingsRecord,
} from '../models/database.models';
import { Customer } from '../models/aade.models';

export interface LocalCustomerRecord extends Customer {
  id: string;
  tenantId: string;
  phone?: string;
  updatedAt: string;
}

export interface TenantSettingsRecord {
  tenantId: string;
  afm: string;
  doy: string;
  legalName: string;
  street: string;
  number: string;
  postalCode: string;
  city: string;
  branch: number;
  defaultSeries?: string;
  aadeUserId?: string;
  aadeSubscriptionKey?: string;
  isProduction?: boolean;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class LocalDbService extends Dexie {
  public invoices!: Table<LocalInvoiceRecord, string>;
  public products!: Table<Product, string>;
  public settings!: Table<CompanySettingsRecord, string>;
  public customers!: Table<LocalCustomerRecord, string>;

  constructor() {
    super('MaranthHubMultiTenantDb');

    // Make sure each table key appears EXACTLY ONCE
    this.version(2).stores({
      invoices: 'id, tenantId, series, documentNumber, issueDate, customerAfm, transmissionStatus, updatedAt, createdAt',
      products: 'id, tenantId, barcode, *altBarcodes, name, isPinned',
      settings: 'id',
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

  // --- Products Catalog ---

  /**
   * Bulk inserts or updates products from CSV / Excel importers.
   */
  public async bulkSaveProducts(products: Product[]): Promise<void> {
    await this.products.bulkPut(products);
  }



  // --- Settings & AADE Credentials ---

  public async getSettingsForTenant(tenantId: string): Promise<CompanySettingsRecord | undefined> {
    return this.settings.get(tenantId);
  }

  public async getInvoiceById(id: string): Promise<LocalInvoiceRecord | undefined> {
  return await this.invoices.get(id);
}

  public async saveSettings(record: CompanySettingsRecord): Promise<string> {
    await this.settings.put(record);
    return record.id;
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
): Promise<void> {
  const existing = await this.getSettingsForTenant(tenantId);
  const updatedRecord = {
    ...existing,
    ...settings,
    tenantId,
    updatedAt: new Date().toISOString(),
  };

  // Uses Dexie put() which acts as upsert (insert or update by primary key)
  await this.settings.put(updatedRecord as any);
}

  public async saveCustomer(record: LocalCustomerRecord): Promise<string> {
    await this.customers.put(record);
    return record.id;
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
    return record.id;
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
}
import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import {
  LocalInvoiceRecord,
  Product,
  CompanySettingsRecord,
} from '../models/database.models';

@Injectable({ providedIn: 'root' })
export class LocalDbService extends Dexie {
  public invoices!: Table<LocalInvoiceRecord, string>;
  public products!: Table<Product, string>;
  public settings!: Table<CompanySettingsRecord, string>;

  constructor() {
    super('MaranthHubMultiTenantDb');
    this.version(1).stores({
      invoices: 'id, tenantId, series, documentNumber, issueDate, customerAfm, transmissionStatus, updatedAt, createdAt',
      products: 'id, tenantId, barcode, *altBarcodes, name, isPinned',
      settings: 'id',
    });
  }

  // --- Invoices & Drafts ---

  public async getInvoicesForTenant(tenantId: string): Promise<LocalInvoiceRecord[]> {
    return this.invoices
      .where('tenantId')
      .equals(tenantId)
      .reverse()
      .sortBy('updatedAt');
  }

  public async getAllInvoices(tenantId?: string): Promise<LocalInvoiceRecord[]> {
    if (tenantId) {
      return this.getInvoicesForTenant(tenantId);
    }
    return this.invoices.orderBy('updatedAt').reverse().toArray();
  }

  public async getLatestDraftForTenant(tenantId: string): Promise<LocalInvoiceRecord | undefined> {
    return this.invoices
      .where('tenantId')
      .equals(tenantId)
      .filter((inv) => inv.transmissionStatus === 'DRAFT')
      .reverse()
      .sortBy('updatedAt')
      .then((records) => records[0]);
  }

  public async getLatestDraft(tenantId = 'tenant_minimarket'): Promise<LocalInvoiceRecord | undefined> {
    return this.getLatestDraftForTenant(tenantId);
  }

  public async saveInvoice(record: LocalInvoiceRecord): Promise<string> {
    await this.invoices.put(record);
    return record.id;
  }

  public async saveDraft(record: LocalInvoiceRecord): Promise<string> {
    return this.saveInvoice(record);
  }

  public async deleteInvoice(id: string, tenantId?: string): Promise<void> {
    const doc = await this.invoices.get(id);
    if (!doc) return;
    if (tenantId && doc.tenantId !== tenantId) {
      console.warn(`Tenant ${tenantId} unauthorized to delete document ${id}`);
      return;
    }
    await this.invoices.delete(id);
  }

  // --- Products & Catalog ---

  public async getProductsForTenant(tenantId: string): Promise<Product[]> {
    return this.products.where('tenantId').equals(tenantId).toArray();
  }

  public async searchProductsForTenant(tenantId: string, query: string): Promise<Product[]> {
    const q = query.trim().toLowerCase();
    return this.products
      .where('tenantId')
      .equals(tenantId)
      .filter((p) => {
        const matchesName = p.name ? p.name.toLowerCase().includes(q) : false;
        const matchesBarcode = p.barcode ? p.barcode.includes(q) : false;
        return matchesName || matchesBarcode;
      })
      .limit(10)
      .toArray();
  }

  public async bulkSaveProducts(items: Product[]): Promise<void> {
    await this.products.bulkPut(items);
  }

  public async getProductByBarcode(barcode: string): Promise<Product | undefined> {
    const clean = barcode.trim();
    const match = await this.products.where('barcode').equals(clean).first();
    if (match) return match;
    return this.products.where('altBarcodes').equals(clean).first();
  }

  public async searchProducts(query: string, limit = 8): Promise<Product[]> {
    const q = query.trim().toLowerCase();
    return this.products
      .filter((p) => {
        const matchesName = p.name ? p.name.toLowerCase().includes(q) : false;
        const matchesBarcode = p.barcode ? p.barcode.includes(q) : false;
        return matchesName || matchesBarcode;
      })
      .limit(limit)
      .toArray();
  }

  // --- Company Settings ---

  public async getCompanySettings(): Promise<CompanySettingsRecord | undefined> {
    return this.settings.get('active_company');
  }

  public async saveCompanySettings(settings: CompanySettingsRecord): Promise<void> {
    await this.settings.put({ ...settings, id: 'active_company' });
  }
}
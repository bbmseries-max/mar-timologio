import { Injectable, inject } from '@angular/core';
import * as XLSX from 'xlsx';
import { LocalDbService } from './local-db.service';
import { ColumnMappingConfig, ImportPreviewItem, ParsedRawRow } from '../models/import.models';
import { Product } from '../models/database.models';

@Injectable({ providedIn: 'root' })
export class ProductImporterService {
  private readonly db = inject(LocalDbService);

  /**
   * Reads an Excel (.xlsx/.xls) or CSV file and extracts sheet headers + raw rows.
   */
  public async readSpreadsheet(file: File): Promise<{ headers: string[]; rows: ParsedRawRow[] }> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert sheet to JSON array with header row
    const rows = XLSX.utils.sheet_to_json<ParsedRawRow>(worksheet, { defval: '' });
    if (rows.length === 0) {
      return { headers: [], rows: [] };
    }

    const headers = Object.keys(rows[0]);
    return { headers, rows };
  }

  /**
   * Intelligently auto-detects column names based on common Greek and English headers.
   */
  public guessColumnMapping(headers: string[]): ColumnMappingConfig {
    const findMatch = (candidates: string[]): string => {
      for (const c of candidates) {
        const match = headers.find((h) => h.trim().toLowerCase() === c.toLowerCase());
        if (match) return match;
      }
      for (const c of candidates) {
        const partial = headers.find((h) => h.trim().toLowerCase().includes(c.toLowerCase()));
        if (partial) return partial;
      }
      return '';
    };

    const nameCol = findMatch(['περιγραφη', 'ειδος', 'προιον', 'name', 'description', 'title']);
    const barcodeCol = findMatch(['barcode', 'bar code', 'κωδικος', 'ean', 'code', 'sku']);
    const priceCol = findMatch(['τιμη', 'τιμη λιανικης', 'τιμη χονδρικης', 'price', 'retail price', 'cost']);
    const vatCol = findMatch(['φπα', 'vat', 'tax', 'κατηγορια φπα']);

    return {
      nameCol: nameCol || (headers[0] ?? ''),
      barcodeCol: barcodeCol || '',
      priceCol: priceCol || (headers[1] ?? ''),
      vatCol: vatCol || '',
      isPriceGross: false,
      defaultVatRate: 24,
    };
  }

  /**
   * Normalizes raw rows into valid preview items with fiscal VAT arithmetic.
   */
  public mapRowsToPreview(rows: ParsedRawRow[], config: ColumnMappingConfig): ImportPreviewItem[] {
    return rows.map((row) => {
      const rawName = String(row[config.nameCol] ?? '').trim();
      const rawBarcode = config.barcodeCol ? String(row[config.barcodeCol] ?? '').trim() : undefined;
      const rawPriceVal = this.parseNumeric(row[config.priceCol]);

      let vatRate = config.defaultVatRate;
      if (config.vatCol && row[config.vatCol] !== undefined) {
        const parsedVat = this.parseNumeric(row[config.vatCol]);
        if (parsedVat > 0) vatRate = parsedVat;
      }

      if (!rawName) {
        return {
          name: '— Χωρίς Όνομα —',
          barcode: rawBarcode,
          rawPrice: 0,
          netPrice: 0,
          vatRate,
          grossPrice: 0,
          isValid: false,
          validationError: 'Λείπει η περιγραφή',
        };
      }

      if (isNaN(rawPriceVal) || rawPriceVal < 0) {
        return {
          name: rawName,
          barcode: rawBarcode,
          rawPrice: 0,
          netPrice: 0,
          vatRate,
          grossPrice: 0,
          isValid: false,
          validationError: 'Μη έγκυρη τιμή',
        };
      }

      let netPrice: number;
      let grossPrice: number;

      if (config.isPriceGross) {
        // Price includes VAT (Retail) -> extract net
        grossPrice = rawPriceVal;
        netPrice = Number((rawPriceVal / (1 + vatRate / 100)).toFixed(4));
      } else {
        // Price is Net (Wholesale) -> add VAT
        netPrice = rawPriceVal;
        grossPrice = Number((rawPriceVal * (1 + vatRate / 100)).toFixed(2));
      }

      return {
        name: rawName,
        barcode: rawBarcode ? String(rawBarcode).replace(/\.0$/, '') : undefined,
        rawPrice: rawPriceVal,
        netPrice,
        vatRate,
        grossPrice,
        isValid: true,
      };
    });
  }

  /**
   * Commits validated items directly into the tenant's Dexie product partition.
   */
  public async commitImport(
    tenantId: string,
    items: ImportPreviewItem[]
  ): Promise<number> {
    const validItems = items.filter((i) => i.isValid);

    const entities: Product[] = validItems.map((item) => ({
      id: crypto.randomUUID(),
      tenantId,
      name: item.name,
      price: item.netPrice,
      taxRate: item.vatRate,
      barcode: item.barcode || undefined,
      stockQuantity: 0,
      isActive: true,
    }));

    await this.db.bulkSaveProducts(entities);
    return entities.length;
  }

  private parseNumeric(value: any): number {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    // Replace Greek/European comma decimals: "12,50" -> "12.50"
    const cleaned = String(value).replace(/[^0-9.,-]/g, '').replace(',', '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
}
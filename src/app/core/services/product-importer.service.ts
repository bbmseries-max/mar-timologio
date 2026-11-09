import { Injectable, inject } from '@angular/core';
import * as XLSX from 'xlsx';
import { LocalDbService } from './local-db.service';
import { ColumnMappingConfig, ImportPreviewItem, ParsedRawRow } from '../models/import.models';
import { Product } from '../models/database.models';
import { roundToTwoDecimals } from '../utils/fiscal-engine';

@Injectable({ providedIn: 'root' })
export class ProductImporterService {
  private readonly db = inject(LocalDbService);

  /**
   * Reads an Excel (.xlsx/.xls) or CSV file and extracts sheet headers + raw rows.
   */
  public async readSpreadsheet(file: File): Promise<{ headers: string[]; rows: ParsedRawRow[] }> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Read cells formatted as text to prevent barcode float corruption
    const rows = XLSX.utils.sheet_to_json<ParsedRawRow>(worksheet, {
      defval: '',
      raw: false,
    });

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
    const normalize = (str: string) =>
      String(str || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const normalizedHeaders = headers.map((h) => ({ original: h, clean: normalize(h) }));

    const findMatch = (candidates: string[]): string => {
      const cleanCandidates = candidates.map(normalize);

      // Exact match
      for (const c of cleanCandidates) {
        const found = normalizedHeaders.find((h) => h.clean === c);
        if (found) return found.original;
      }

      // Partial match
      for (const c of cleanCandidates) {
        const found = normalizedHeaders.find((h) => h.clean.includes(c));
        if (found) return found.original;
      }

      return '';
    };

    const nameCol = findMatch(['περιγραφη', 'ειδος', 'προιον', 'name', 'description', 'title', 'item']);
    const barcodeCol = findMatch(['barcode', 'bar code', 'κωδικος', 'ean', 'code', 'sku']);
    const priceCol = findMatch(['τιμη', 'τιμη λιανικης', 'τιμη χονδρικης', 'price', 'retail price', 'cost', 'αξια']);
    const vatCol = findMatch(['φπα', 'vat', 'tax', 'κατηγορια φπα', 'συντελεστης']);

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
      let rawBarcode = config.barcodeCol ? String(row[config.barcodeCol] ?? '').trim() : '';

      if (rawBarcode) {
        rawBarcode = rawBarcode.replace(/\.0+$/, '').trim();
      }

      const rawPriceVal = this.parseNumeric(row[config.priceCol]);

      let vatRate = config.defaultVatRate;
      if (config.vatCol && row[config.vatCol] !== undefined && row[config.vatCol] !== '') {
        const parsedVat = this.parseNumeric(row[config.vatCol]);
        // Handle decimal Excel percentage formatting (0.24 -> 24)
        if (parsedVat > 0 && parsedVat < 1) {
          vatRate = Math.round(parsedVat * 100);
        } else if (parsedVat >= 1) {
          vatRate = parsedVat;
        } else if (parsedVat === 0) {
          vatRate = 0;
        }
      }

      if (!rawName) {
        return {
          name: '— Χωρίς Όνομα —',
          barcode: rawBarcode || undefined,
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
          barcode: rawBarcode || undefined,
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
        grossPrice = roundToTwoDecimals(rawPriceVal);
        netPrice = roundToTwoDecimals(rawPriceVal / (1 + vatRate / 100));
      } else {
        netPrice = roundToTwoDecimals(rawPriceVal);
        grossPrice = roundToTwoDecimals(rawPriceVal * (1 + vatRate / 100));
      }

      return {
        name: rawName,
        barcode: rawBarcode || undefined,
        rawPrice: rawPriceVal,
        netPrice,
        vatRate,
        grossPrice,
        isValid: true,
      };
    });
  }

  /**
   * Commits validated items directly into the tenant's Dexie product partition with full deduplication.
   */
  public async commitImport(
    tenantId: string,
    items: ImportPreviewItem[]
  ): Promise<number> {
    const validItems = items.filter((i) => i.isValid);
    if (validItems.length === 0) return 0;

    const existingProducts = await this.db.products
      .where('tenantId')
      .equals(tenantId)
      .toArray();

    const barcodeMap = new Map<string, string>();
    const nameMap = new Map<string, string>();

    for (const p of existingProducts) {
      if (p.barcode && p.barcode.trim()) {
        barcodeMap.set(p.barcode.trim(), p.id);
      }
      if (p.name && p.name.trim()) {
        nameMap.set(p.name.toLowerCase().trim(), p.id);
      }
    }

    const now = Date.now();
    const entities: Product[] = [];

    for (const item of validItems) {
      const cleanBarcode = (item.barcode || '').trim();
      const cleanName = item.name.toLowerCase().trim();

      // Deduplicate by barcode first (primary unique key in retail)
      let existingId: string | undefined;
      if (cleanBarcode) {
        existingId = barcodeMap.get(cleanBarcode);
      }
      // If no barcode or barcode not found, match by exact name
      if (!existingId && cleanName) {
        existingId = nameMap.get(cleanName);
      }

      const assignedId = existingId || crypto.randomUUID();

      // Register in maps for the batch
      if (cleanBarcode) barcodeMap.set(cleanBarcode, assignedId);
      if (cleanName) nameMap.set(cleanName, assignedId);

      entities.push({
        id: assignedId,
        tenantId,
        name: item.name.trim(),
        price: item.netPrice,
        taxRate: item.vatRate,
        barcode: cleanBarcode,
        stockQuantity: 0,
        isActive: true,
        unitMeasurement: '1',
        createdAt: now,
        updatedAt: now,
      } as any);
    }

    // Atomic bulk insert/update
    await this.db.products.bulkPut(entities);
    return entities.length;
  }

  /**
   * Robust European and standard currency parsing (handles "1.250,50", "12,50", "12.50 €").
   */
  private parseNumeric(value: any): number {
    if (typeof value === 'number') return value;
    if (!value) return 0;

    let str = String(value).trim().replace(/[^0-9.,-]/g, '');

    if (str.includes('.') && str.includes(',')) {
      if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
        str = str.replace(/\./g, '').replace(',', '.');
      } else {
        str = str.replace(/,/g, '');
      }
    } else if (str.includes(',')) {
      str = str.replace(',', '.');
    }

    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
  }
}
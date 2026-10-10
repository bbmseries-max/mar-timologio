// src/app/core/models/tenant-integration.models.ts

export type DocumentTypePreset = '9.1' | '1.1' | '2.1';

export interface ExternalReturnItem {
  sku?: string;
  barcode: string;
  description: string;
  quantity: number;
  unitPrice: number;        // Wholesale price or last purchase cost
  vatRate: number;          // 24, 13, 6, or 0
  unitOfMeasure?: 'pcs' | 'kg' | 'm'; // Defaults to 'pcs' (Κωδικός 1)
  reason?: string;          // e.g., 'EXPIRED', 'DEFECTIVE', 'RECALLED'
}

export interface ExternalDocumentHandover {
  version: '1.0';
  tenantId: string;         // Identifies the tenant store
  apiKey?: string;          // Security token if incoming via HTTP
  documentType: DocumentTypePreset;
  movementPurpose: 6;       // 6 = Επιστροφή (Return)
  
  // Counterpart (Supplier)
  supplier: {
    afm: string;
    branch?: number;        // Default 0
    legalName?: string;
    address?: {
      street?: string;
      postalCode?: string;
      city?: string;
    };
  };

  // Logistics / Vehicle
  transport?: {
    vehiclePlate?: string;
    driverName?: string;
  };

  items: ExternalReturnItem[];
}
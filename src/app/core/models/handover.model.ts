export interface ExternalHandoverSupplier {
  afm: string;
  legalName?: string;
  doy?: string;
  address?: {
    street?: string;
    number?: string;
    postalCode?: string;
    city?: string;
  };
}

export interface ExternalHandoverTransport {
  vehiclePlate?: string;
  vehicleNumber?: string;
}

export interface ExternalReturnItem {
  barcode?: string;
  description: string;
  quantity: number;
  unitPrice?: number;
  vatRate: number | string;
  reason?: string;
}

export interface ExternalDocumentHandover {
  version?: string;
  tenantId?: string;
  messageId?: string;
  documentType?: string;
  supplier: ExternalHandoverSupplier;
  transport?: ExternalHandoverTransport;
  items: ExternalReturnItem[];
}
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
  documentType?: '1.1' | '2.1' | '9.3' | '11.1' | '11.2';
  items: Array<{
    description: string;
    quantity: number;
    measurementUnit?: number;
    price?: number;
    vatRate?: number;
    barcode?: string;
  }>;
  customer?: any;
  supplier?: any;
  movement?: {
    movePurpose?: number;
    vehicleNumber?: string;
    dispatchDateTime?: string;
    correlatedMark?: string;
    addressFrom?: any;
    addressTo?: any;
  };
  version?: string;
  tenantId?: string;
  messageId?: string;
  transport?: ExternalHandoverTransport;
}

export interface HandoverAck {
  messageId: string;
  status: 'ACCEPTED' | 'REJECTED';
  importedItemCount: number;
  correlationId?: string;
  error?: string;
  type?: 'MARANTH_HANDOVER_ACK';
}
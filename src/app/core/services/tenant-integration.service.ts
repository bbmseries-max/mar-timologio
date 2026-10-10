import { Injectable, signal, inject, OnDestroy } from '@angular/core';
import { LocalDbService } from './local-db.service';
import { AuthTenantService } from './auth-tenant.service';
import { isValidGreekAfm } from '@core/validators/afm.validator';

export interface ExternalReturnItem {
  sku?: string;
  barcode: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number; // 24, 13, 6, 0
  measurementUnit?: string;
  reason?: string;
}

export interface ExternalDocumentHandover {
  version: '1.0';
  tenantId: string;
  messageId: string;
  documentType: '9.1';
  movementPurpose: 6; // 6 = Επιστροφή
  supplier: {
    afm: string;
    branch?: number;
    legalName?: string;
    doy?: string;
    address: {
      street: string;
      number: string;
      postalCode: string;
      city: string;
    };
  };
  transport?: {
    vehiclePlate?: string;
    driverName?: string;
  };
  items: ExternalReturnItem[];
}

export interface HandoverAck {
  messageId: string;
  status: 'ACCEPTED' | 'REJECTED';
  importedItemCount: number;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class TenantIntegrationService implements OnDestroy {
  private readonly db = inject(LocalDbService);
  private readonly auth = inject(AuthTenantService);

  private channel: BroadcastChannel | null = null;
  private currentChannelName: string | null = null;
  private readonly messageHandler = (event: MessageEvent) => this.handleWindowMessage(event);

  public readonly pendingHandover = signal<ExternalDocumentHandover | null>(null);
  public readonly channelStatus = signal<string>('Ανενεργό');

  constructor() {
    this.connectChannel();
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.messageHandler);
    }
  }

  private async handleWindowMessage(event: MessageEvent): Promise<void> {
    // Only accept cross-origin messages from Market POS (port 4200)
    if (event.origin !== 'http://localhost:4200') return;

    if (event.data?.type === 'MARANTH_HANDOVER_REQUEST') {
      const payload = event.data.payload;
      const result = await this.validateAndEnrich(payload);

      if (result.success && result.data) {
        this.pendingHandover.set(result.data);

        // Send ACK back to the POS caller window
        if (event.source && 'postMessage' in event.source) {
          (event.source as Window).postMessage(
            {
              type: 'MARANTH_HANDOVER_ACK',
              correlationId: payload.messageId,
              status: 'ACCEPTED',
              importedItemCount: result.data.items.length,
            },
            event.origin
          );
        }
      } else {
        // Send rejection ACK
        if (event.source && 'postMessage' in event.source) {
          (event.source as Window).postMessage(
            {
              type: 'MARANTH_HANDOVER_ACK',
              correlationId: payload?.messageId || 'unknown',
              status: 'REJECTED',
              error: result.error || 'Απόρριψη δεδομένων',
            },
            event.origin
          );
        }
      }
    }
  }

  /**
   * Connects to a BroadcastChannel isolated by tenant ID for same-origin tabs.
   */
  public connectChannel(): void {
    const tenantId = this.auth.currentTenantId() || 'tenant_minimarket';
    const channelName = `maranth_bridge_${tenantId}`;

    if (this.channel && this.currentChannelName === channelName) {
      return;
    }

    if (this.channel) {
      this.channel.close();
    }

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.currentChannelName = channelName;
      this.channel = new BroadcastChannel(channelName);
      this.channelStatus.set(`Ενεργό (${channelName})`);

      this.channel.onmessage = async (event: MessageEvent<ExternalDocumentHandover>) => {
        await this.handleIncomingMessage(event.data);
      };
    } else {
      this.channelStatus.set('Μη υποστηριζόμενο από τον browser');
    }
  }

  private async handleIncomingMessage(payload: ExternalDocumentHandover): Promise<void> {
    const validationResult = await this.validateAndEnrich(payload);

    if (validationResult.success && validationResult.data) {
      // Use enriched data containing resolved Dexie supplier address
      this.pendingHandover.set(validationResult.data);
      this.sendAck({
        messageId: payload.messageId,
        status: 'ACCEPTED',
        importedItemCount: validationResult.data.items.length,
      });
    } else {
      this.sendAck({
        messageId: payload?.messageId || 'unknown',
        status: 'REJECTED',
        importedItemCount: 0,
        error: validationResult.error,
      });
    }
  }

  private async validateAndEnrich(
    payload: any
  ): Promise<{ success: boolean; data?: ExternalDocumentHandover; error?: string }> {
    if (!payload || payload.documentType !== '9.1') {
      return { success: false, error: 'Μη έγκυρος τύπος παραστατικού (απαιτείται 9.1).' };
    }

    if (!payload.supplier?.afm) {
      return { success: false, error: 'Λείπει το Α.Φ.Μ. του προμηθευτή.' };
    }

    // Strip non-digits and normalize 8-digit inputs
    let cleanAfm = String(payload.supplier.afm).replace(/\D/g, '');
    if (cleanAfm.length === 8) {
      cleanAfm = '0' + cleanAfm;
      payload.supplier.afm = cleanAfm;
    }

    if (!isValidGreekAfm(cleanAfm)) {
      return { success: false, error: `Μη έγκυρο Α.Φ.Μ. προμηθευτή: ${cleanAfm}` };
    }

    if (!payload.items || payload.items.length === 0) {
      return { success: false, error: 'Το καλάθι επιστροφής είναι κενό.' };
    }

    // Enrich missing supplier data from Dexie cache if present
    const cachedCustomer = await this.db.getCustomerByAfm(payload.tenantId, cleanAfm);

    if (cachedCustomer) {
      payload.supplier.legalName = payload.supplier.legalName || cachedCustomer.legalName;
      payload.supplier.doy = payload.supplier.doy || cachedCustomer.doy;
      payload.supplier.address = {
        street: payload.supplier.address?.street || cachedCustomer.address?.street || '',
        number: payload.supplier.address?.number || cachedCustomer.address?.number || '',
        postalCode: payload.supplier.address?.postalCode || cachedCustomer.address?.postalCode || '',
        city: payload.supplier.address?.city || cachedCustomer.address?.city || '',
      };
    } else {
      // Safe fallback if not in cache so address is always an object
      payload.supplier.address = {
        street: payload.supplier.address?.street || '',
        number: payload.supplier.address?.number || '',
        postalCode: payload.supplier.address?.postalCode || '',
        city: payload.supplier.address?.city || '',
      };
    }

    return {
      success: true,
      data: payload as ExternalDocumentHandover,
    };
  }

  private sendAck(ack: HandoverAck): void {
    if (this.channel) {
      this.channel.postMessage(ack);
    }
  }

  public clearPending(): void {
    this.pendingHandover.set(null);
  }

  ngOnDestroy(): void {
    this.channel?.close();
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', this.messageHandler);
    }
  }
}
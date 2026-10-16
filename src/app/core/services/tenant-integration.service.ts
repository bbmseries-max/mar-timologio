import { Injectable, signal, inject, OnDestroy, effect, NgZone } from '@angular/core';
import { LocalDbService } from './local-db.service';
import { AuthTenantService } from './auth-tenant.service';
import { isValidGreekAfm } from '../utils/fiscal-engine';
import { ExternalDocumentHandover, HandoverAck } from '../models/handover.model';

@Injectable({ providedIn: 'root' })
export class TenantIntegrationService implements OnDestroy {
  private readonly db = inject(LocalDbService);
  private readonly auth = inject(AuthTenantService);
  private readonly ngZone = inject(NgZone);

  private tenantChannel: BroadcastChannel | null = null;
  private genericChannel: BroadcastChannel | null = null;
  private currentChannelName: string | null = null;
  private readonly messageHandler = (event: MessageEvent) => this.handleWindowMessage(event);

  public readonly pendingHandover = signal<ExternalDocumentHandover | null>(null);
  public readonly channelStatus = signal<string>('Ανενεργό');

  private readonly allowedOrigins = [
    'http://localhost:4200',
    'http://127.0.0.1:4200',
    'https://maranth.vercel.app',
    'https://maranth.gr',
    'https://www.maranth.gr',
  ];

  constructor() {
    this.initGenericChannel();
    this.initWindowListener();

    // Re-connect tenant channel whenever the active tenant changes
    effect(() => {
      const tenantId = this.auth.currentTenantId();
      this.connectTenantChannel(tenantId);
    });
  }

  private initGenericChannel(): void {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.genericChannel = new BroadcastChannel('maranth_cart_handover_bus');
      this.genericChannel.onmessage = async (event: MessageEvent) => {
        await this.handleIncomingMessage(event.data, this.genericChannel);
      };
    }
  }

  public connectTenantChannel(tenantId: string): void {
    const channelName = `maranth_bridge_${tenantId || 'tenant_minimarket'}`;

    if (this.tenantChannel && this.currentChannelName === channelName) {
      return;
    }

    if (this.tenantChannel) {
      this.tenantChannel.close();
    }

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.currentChannelName = channelName;
      this.tenantChannel = new BroadcastChannel(channelName);
      this.channelStatus.set(`Ενεργό (${channelName})`);

      this.tenantChannel.onmessage = async (event: MessageEvent<ExternalDocumentHandover>) => {
        await this.handleIncomingMessage(event.data, this.tenantChannel);
      };
    } else {
      this.channelStatus.set('Μη υποστηριζόμενο από τον browser');
    }
  }

  private async handleWindowMessage(event: MessageEvent): Promise<void> {
    const isAllowed = this.allowedOrigins.some(
      (origin) => event.origin === origin || event.origin.startsWith(origin)
    );
    if (!isAllowed) return;

    if (
      event.data?.type === 'MARANTH_HANDOVER_REQUEST' ||
      event.data?.type === 'MARANTH_CART_HANDOVER'
    ) {
      const payload = event.data.payload || event.data;
      const result = await this.validateAndEnrich(payload);

      this.ngZone.run(() => {
        if (result.success && result.data) {
          this.pendingHandover.set(result.data);

          if (event.source && 'postMessage' in event.source) {
            (event.source as Window).postMessage(
              {
                type: 'MARANTH_HANDOVER_ACK',
                correlationId: payload.messageId || event.data.correlationId,
                status: 'ACCEPTED',
                importedItemCount: result.data.items.length,
              },
              event.origin
            );
          }
        } else {
          if (event.source && 'postMessage' in event.source) {
            (event.source as Window).postMessage(
              {
                type: 'MARANTH_HANDOVER_ACK',
                correlationId: payload?.messageId || event.data?.correlationId || 'unknown',
                status: 'REJECTED',
                error: result.error || 'Απόρριψη δεδομένων',
              },
              event.origin
            );
          }
        }
      });
    }
  }

  private async handleIncomingMessage(
    payload: any,
    targetChannel: BroadcastChannel | null
  ): Promise<void> {
    const validationResult = await this.validateAndEnrich(payload);

    this.ngZone.run(() => {
      if (validationResult.success && validationResult.data) {
        this.pendingHandover.set(validationResult.data);
        this.sendAck(targetChannel, {
          messageId: payload.messageId || 'pos_cart',
          status: 'ACCEPTED',
          importedItemCount: validationResult.data.items.length,
        });
      } else {
        this.sendAck(targetChannel, {
          messageId: payload?.messageId || 'unknown',
          status: 'REJECTED',
          importedItemCount: 0,
          error: validationResult.error,
        });
      }
    });
  }

  private async validateAndEnrich(
    payload: any
  ): Promise<{ success: boolean; data?: ExternalDocumentHandover; error?: string }> {
    if (!payload) {
      return { success: false, error: 'Κενό αντικείμενο δεδομένων handover.' };
    }

    const docType = payload.documentType || payload.invoiceType || '9.1';

    // Normalize customer / supplier block
    const party = payload.supplier || payload.customer;
    let cleanAfm = party?.afm ? String(party.afm).replace(/\D/g, '') : '';

    if (cleanAfm.length === 8) {
      cleanAfm = '0' + cleanAfm;
      if (party) party.afm = cleanAfm;
    }

    if (cleanAfm && !isValidGreekAfm(cleanAfm)) {
      return { success: false, error: `Μη έγκυρο Α.Φ.Μ. αντισυμβαλλομένου: ${cleanAfm}` };
    }

    if (!payload.items || payload.items.length === 0) {
      return { success: false, error: 'Το καλάθι είναι κενό.' };
    }

    const tenantId = payload.tenantId || this.auth.currentTenantId();

    // Enrich from Dexie customer directory if available
    if (cleanAfm) {
      const cachedCustomer = await this.db.getCustomerByAfm(tenantId, cleanAfm);
      if (cachedCustomer && party) {
        party.legalName = party.legalName || cachedCustomer.legalName;
        party.doy = party.doy || cachedCustomer.doy;
        party.address = {
          street: party.address?.street || cachedCustomer.address?.street || '',
          number: party.address?.number || cachedCustomer.address?.number || '',
          postalCode: party.address?.postalCode || cachedCustomer.address?.postalCode || '',
          city: party.address?.city || cachedCustomer.address?.city || '',
        };
      }
    }

    return {
      success: true,
      data: {
        ...payload,
        documentType: docType,
        supplier: party || {
          afm: '',
          address: { street: '', number: '', postalCode: '', city: '' },
        },
      } as ExternalDocumentHandover,
    };
  }

  private sendAck(channel: BroadcastChannel | null, ack: HandoverAck): void {
    if (channel) {
      channel.postMessage({
        type: 'MARANTH_HANDOVER_ACK',
        ...ack,
      });
    }
  }

  private initWindowListener(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.messageHandler);
    }
  }

  public clearPending(): void {
    this.pendingHandover.set(null);
  }

  ngOnDestroy(): void {
    this.tenantChannel?.close();
    this.genericChannel?.close();
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', this.messageHandler);
    }
  }
}
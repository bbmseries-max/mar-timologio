import { Injectable, OnDestroy, inject, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ExternalDocumentHandover } from '../models/handover.model';
import { TenantIntegrationService } from './tenant-integration.service';

@Injectable({
  providedIn: 'root'
})
export class CartBridgeService implements OnDestroy {
  private readonly ngZone = inject(NgZone);
  private readonly tenantIntegration = inject(TenantIntegrationService);

  private readonly cartSubject = new BehaviorSubject<ExternalDocumentHandover | null>(null);
  public readonly cart$ = this.cartSubject.asObservable();

  private broadcastChannel: BroadcastChannel | null = null;
  private readonly channelName = 'maranth_cart_handover_bus';
  private windowMessageListener: ((event: MessageEvent) => void) | null = null;

  constructor() {
    this.initWindowListener();
    this.initBroadcastChannel();
  }

  private initBroadcastChannel(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel(this.channelName);
      this.broadcastChannel.onmessage = (event: MessageEvent) => {
        this.ngZone.run(() => {
          const data = event.data;
          if (!data) return;

          console.log('[CartBridge] Received via BroadcastChannel:', data);
          const payload = data.payload || data;
          this.forwardHandover(payload as ExternalDocumentHandover);

          if (data.correlationId || data.messageId) {
            this.broadcastChannel?.postMessage({
              type: 'MARANTH_HANDOVER_ACK',
              correlationId: data.correlationId || data.messageId,
              status: 'ACCEPTED'
            });
          }
        });
      };
    }
  }

  private initWindowListener(): void {
    const allowedOrigins = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost:4201',
  'http://127.0.0.1:4201',
  'https://maranth.vercel.app',
  'https://maranth-timologio.vercel.app',
  'https://maranth.gr',
  'https://www.maranth.gr'
];

    this.windowMessageListener = (event: MessageEvent) => {
      const isAllowed = allowedOrigins.some(origin => 
        event.origin === origin || event.origin.startsWith(origin)
      );
      if (!isAllowed) return;

      const data = event.data;
      if (!data) return;

      if (data.type === 'MARANTH_HANDOVER_REQUEST' || data.type === 'MARANTH_CART_HANDOVER') {
        this.ngZone.run(() => {
          const payload = data.payload || data;
          const correlationId = payload.messageId || data.correlationId;

          if (event.source && 'postMessage' in event.source) {
            (event.source as Window).postMessage(
              {
                type: 'MARANTH_HANDOVER_ACK',
                correlationId: correlationId,
                status: 'ACCEPTED',
              },
              event.origin
            );
          }

          console.log('[CartBridge] Accepted window postMessage:', payload);
          this.forwardHandover(payload as ExternalDocumentHandover);
        });
      }
    };

    window.addEventListener('message', this.windowMessageListener);
  }

  public checkUrlPayload(): void {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      let raw = urlParams.get('handover') || urlParams.get('data');
      if (raw) {
        // Clean and normalize URL-safe Base64
        raw = raw.replace(/-/g, '+').replace(/_/g, '/');
        while (raw.length % 4) {
          raw += '=';
        }

        const binaryStr = atob(raw);
        const bytes = Uint8Array.from(binaryStr, c => c.charCodeAt(0));
        const decodedJson = new TextDecoder('utf-8').decode(bytes);
        const parsed = JSON.parse(decodedJson);
        const handoverPayload = (parsed?.payload || parsed) as ExternalDocumentHandover;

        console.log('[CartBridge] Successfully loaded payload via URL parameter:', handoverPayload);
        this.forwardHandover(handoverPayload);

        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (err) {
      console.warn('[CartBridge] Failed to parse URL payload parameter:', err);
    }
  }

  /**
   * Forwards incoming handover to both local reactive streams and TenantIntegrationService signal.
   */
  private forwardHandover(payload: ExternalDocumentHandover): void {
    if (!payload) return;
    this.cartSubject.next(payload);

    // Sync directly to the signal that InvoiceBuilderComponent monitors
    if (typeof (this.tenantIntegration as any).setPendingHandover === 'function') {
      (this.tenantIntegration as any).setPendingHandover(payload);
    } else if (typeof (this.tenantIntegration as any).pendingHandover === 'function' && 'set' in (this.tenantIntegration as any).pendingHandover) {
      (this.tenantIntegration as any).pendingHandover.set(payload);
    }
  }

  public clear(): void {
    this.cartSubject.next(null);
  }

  ngOnDestroy(): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    if (this.windowMessageListener) {
      window.removeEventListener('message', this.windowMessageListener);
      this.windowMessageListener = null;
    }
  }
}
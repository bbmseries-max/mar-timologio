import { Injectable, OnDestroy, inject, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ExternalDocumentHandover } from '../models/handover.model';

@Injectable({
  providedIn: 'root'
})
export class CartBridgeService implements OnDestroy {
  private readonly ngZone = inject(NgZone);
  private readonly cartSubject = new BehaviorSubject<ExternalDocumentHandover | null>(null);
  public readonly cart$ = this.cartSubject.asObservable();

  private broadcastChannel: BroadcastChannel | null = null;
  private readonly channelName = 'maranth_cart_handover_bus';

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
          this.cartSubject.next(payload as ExternalDocumentHandover);

          // Acknowledge receipt if request included correlationId
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
    window.addEventListener('message', (event: MessageEvent) => {
      const allowedOrigins = [
        'http://localhost:4200',
        'http://127.0.0.1:4200',
        'https://maranth.vercel.app',
        'https://maranth.gr',
        'https://www.maranth.gr'
      ];

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
          this.cartSubject.next(payload as ExternalDocumentHandover);
        });
      }
    });
  }

  public checkUrlPayload(): void {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const raw = urlParams.get('handover') || urlParams.get('data');
      if (raw) {
        // Safe UTF-8 Base64 decoding supporting Greek characters
        const binaryStr = atob(decodeURIComponent(raw));
        const bytes = Uint8Array.from(binaryStr, c => c.charCodeAt(0));
        const decodedJson = new TextDecoder('utf-8').decode(bytes);
        const parsed = JSON.parse(decodedJson);

        console.log('[CartBridge] Successfully loaded payload via URL parameter:', parsed);
        this.cartSubject.next(parsed);

        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (err) {
      console.warn('[CartBridge] Failed to parse URL payload parameter:', err);
    }
  }

  ngOnDestroy(): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
  }
}
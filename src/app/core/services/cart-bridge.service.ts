import { Injectable, NgZone, inject } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { HandoverCartPayload } from '../models/cart-handover.models';

@Injectable({ providedIn: 'root' })
export class CartBridgeService {
  private readonly ngZone = inject(NgZone);
  private readonly CHANNEL_NAME = 'maranth_cart_handover_bus';
  private broadcastChannel: BroadcastChannel | null = null;

  private readonly cartSubject = new Subject<HandoverCartPayload>();

  /**
   * Stream of incoming carts from any source (BroadcastChannel, postMessage, DeepLink)
   */
  public readonly cart$: Observable<HandoverCartPayload> = this.cartSubject.asObservable();

  constructor() {
    this.initBroadcastChannel();
    this.initWindowMessageListener();
  }

  private initBroadcastChannel(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel(this.CHANNEL_NAME);
      this.broadcastChannel.onmessage = (event: MessageEvent<HandoverCartPayload>) => {
        if (event.data && Array.isArray(event.data.items)) {
          // Run inside Angular zone so the UI updates immediately
          this.ngZone.run(() => {
            this.cartSubject.next(event.data);
          });
        }
      };
    }
  }

  private initWindowMessageListener(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'MARANTH_LOAD_CART' && event.data.payload) {
          this.ngZone.run(() => {
            this.cartSubject.next(event.data.payload);
          });
        }
      });
    }
  }

  public checkUrlPayload(): void {
    if (typeof window === 'undefined') return;

    try {
      const hash = window.location.hash;
      if (hash && hash.includes('cart=')) {
        const base64Data = hash.split('cart=')[1];
        if (base64Data) {
          const jsonString = decodeURIComponent(atob(base64Data));
          const parsed: HandoverCartPayload = JSON.parse(jsonString);
          if (parsed && Array.isArray(parsed.items)) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
            this.ngZone.run(() => {
              this.cartSubject.next(parsed);
            });
          }
        }
      }
    } catch (err) {
      console.warn('Failed to parse URL cart handover payload:', err);
    }
  }
}
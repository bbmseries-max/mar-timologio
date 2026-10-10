import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ExternalDocumentHandover } from '../models/handover.model';

@Injectable({
  providedIn: 'root'
})
export class CartBridgeService {
  private readonly cartSubject = new BehaviorSubject<ExternalDocumentHandover | null>(null);
  public readonly cart$ = this.cartSubject.asObservable();

  constructor() {
    this.initWindowListener();
  }

  private initWindowListener(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      // Validate origin: Localhost & Vercel Production
      const allowedOrigins = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'https://maranth.vercel.app',
];

const isAllowed = allowedOrigins.some(origin => event.origin === origin || event.origin.startsWith(origin));
if (!isAllowed) return;
      const data = event.data;
      if (!data) return;

      // Handle handover from Market POS
      if (data.type === 'MARANTH_HANDOVER_REQUEST' || data.type === 'MARANTH_CART_HANDOVER') {
        const payload = data.payload || data;
        const correlationId = payload.messageId || data.correlationId;

        // 1. Reply with the exact ACK required by Port 4200's ackPromise
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

        // 2. Ingest payload into RxJS Subject for InvoiceBuilder
        console.log('[CartBridge] Accepted handover:', payload);
        this.cartSubject.next(payload);
      }
    });
  }

  public checkUrlPayload(): void {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const raw = urlParams.get('handover') || urlParams.get('data');
    if (raw) {
      const decodedJson = decodeURIComponent(escape(atob(decodeURIComponent(raw))));
      const parsed = JSON.parse(decodedJson);
      
      console.log('[CartBridge] Successfully loaded payload via URL parameter:', parsed);
      this.cartSubject.next(parsed);

      // Clean the URL so refreshing doesn't re-trigger
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } catch (err) {
    console.warn('[CartBridge] Failed to parse URL payload parameter:', err);
  }
}
}
import { Injectable } from '@angular/core';
import { PrintableInvoiceData } from '@features/invoices/invoice-print/invoice-print.component';

@Injectable({
  providedIn: 'root',
})
export class InvoicePrintEngineService {
  private isPrinting = false;

  public async printElement(sourceEl: HTMLElement, mode: 'a4' | 'thermal80'): Promise<void> {
    if (this.isPrinting) return;
    this.isPrinting = true;

    // 1. Ensure the dedicated portal exists directly under <body>
    let portal = document.getElementById('maranth-print-portal');
    if (!portal) {
      portal = document.createElement('div');
      portal.id = 'maranth-print-portal';
      document.body.appendChild(portal);
    }

    // 2. Clear old prints & clone DOM tree
    portal.innerHTML = '';
    const clone = sourceEl.cloneNode(true) as HTMLElement;

    // 3. Preserve <canvas> contents if barcodes or QR codes are canvas-based
    const sourceCanvases = sourceEl.querySelectorAll('canvas');
    const cloneCanvases = clone.querySelectorAll('canvas');
    sourceCanvases.forEach((srcCanvas, i) => {
      const destCanvas = cloneCanvases[i];
      if (destCanvas) {
        destCanvas.width = srcCanvas.width;
        destCanvas.height = srcCanvas.height;
        const ctx = destCanvas.getContext('2d');
        if (ctx) ctx.drawImage(srcCanvas, 0, 0);
      }
    });

    portal.appendChild(clone);

    // 4. Set thermal class on body & portal container
    if (mode === 'thermal80') {
      document.body.classList.add('thermal-mode');
      portal.classList.add('thermal-mode');
    } else {
      document.body.classList.remove('thermal-mode');
      portal.classList.remove('thermal-mode');
    }

    // 5. Wait for all images in the clone (QR code, logos) to finish decoding
    const images = Array.from(clone.querySelectorAll('img'));
    await Promise.all(
      images.map(img => {
        if (img.complete) return Promise.resolve();
        return img.decode?.().catch(() => Promise.resolve()) ?? Promise.resolve();
      })
    );

    // 6. Wait for fonts to finish rendering
    if ('fonts' in document) {
      await (document as any).fonts.ready;
    }

    // 7. Controlled print trigger & deferred cleanup
    const cleanup = () => {
      // Delay emptying portal so browser spooler has finished rasterization
      setTimeout(() => {
        if (portal) {
          portal.innerHTML = '';
          portal.className = '';
        }
        document.body.classList.remove('thermal-mode');
        this.isPrinting = false;
      }, 500);

      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);

    // Give layout engine one paint tick
    requestAnimationFrame(() => {
      window.print();
    });
  }

  public print(invoice: PrintableInvoiceData, mode: 'a4' | 'thermal80'): void {
    const selector = mode === 'a4' ? '.print-sheet' : '.thermal-receipt';
    const el = document.querySelector(selector) as HTMLElement | null;

    if (!el) {
      console.error(`[InvoicePrintEngine] Element not found for selector: ${selector}`);
      window.print();
      return;
    }

    this.printElement(el, mode);
  }
}
import { Injectable } from '@angular/core';
import { PrintableInvoiceData } from '@features/invoices/invoice-print/invoice-print.component';

@Injectable({
  providedIn: 'root',
})
export class InvoicePrintEngineService {
  /**
   * Primary method: Takes the live rendered DOM element from Angular ViewChild
   */
  public printElement(sourceEl: HTMLElement, mode: 'a4' | 'thermal80'): void {
    console.log('[InvoicePrintEngine] Target source element:', sourceEl);

    // 1. Ensure the dedicated portal exists directly under <body>
    let portal = document.getElementById('maranth-print-portal');
    if (!portal) {
      portal = document.createElement('div');
      portal.id = 'maranth-print-portal';
      document.body.appendChild(portal);
    }

    // 2. Clone the live element and attach to portal
    portal.innerHTML = '';
    const clone = sourceEl.cloneNode(true) as HTMLElement;
    portal.appendChild(clone);

    console.log('[InvoicePrintEngine] Portal child count:', portal.children.length);

    // 3. Set orientation / roll styling on body
    if (mode === 'thermal80') {
      document.body.classList.add('thermal-mode');
    } else {
      document.body.classList.remove('thermal-mode');
    }

    // 4. Trigger print with automatic cleanup listener
    const cleanup = () => {
      if (portal) {
        portal.innerHTML = '';
      }
      document.body.classList.remove('thermal-mode');
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);

    // Small delay to allow images and styles to paint
    setTimeout(() => {
      window.print();
    }, 150);
  }

  /**
   * Fallback method: Queries the DOM if no ElementRef is passed directly
   */
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
import { Component, ViewChild, ElementRef, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InvoicePrintEngineService } from '@core/services/invoice-print-engine.service';

export interface PrintableVatBreakdown {
  vatPercentage: number;
  netValue: number;
  vatAmount: number;
}

export interface PrintableAddress {
  street?: string;
  number?: string;
  postalCode?: string;
  city?: string;
  [key: string]: any;
}

export interface PrintableInvoiceData {
  series: string;
  documentNumber: number | string;
  issueDate: string;
  invoiceType?: string;
  status?: string;
  isCancelled?: boolean;
  issuer?: {
    legalName?: string;
    tradeName?: string;
    afm?: string;
    doy?: string;
    activity?: string;
    branch?: number | string;
    address?: {
      street?: string;
      number?: string;
      postalCode?: string;
      city?: string;
      [key: string]: any;
    };
    phone?: string;
    email?: string;
    [key: string]: any;
  } | any;
  customer?: {
    id?: string;
    legalName?: string;
    tradeName?: string;
    afm?: string;
    doy?: string;
    doyDescr?: string;
    email?: string;
    phone?: string;
    address?: {
      street?: string;
      number?: string;
      postalCode?: string;
      city?: string;
      [key: string]: any;
    };
    [key: string]: any;
  } | any;
  lines: Array<{
    lineNumber?: number;
    description: string;
    quantity: number;
    unitPrice: number;
    discountPercentage?: number;
    netValue: number;
    vatPercentage?: number;
    totalValue: number;
    measurementUnit?: string | number;
    unitMeasurement?: string | number;
    [key: string]: any;
  }>;
  totals?: {
    totalNetValue: number;
    totalVatAmount: number;
    totalWithheldAmount?: number;
    totalFeesAmount?: number;
    totalStampDutyAmount?: number;
    totalOtherTaxesAmount?: number;
    totalDeductionsAmount?: number;
    totalGrossValue: number;
    vatBreakdowns?: any[];
    [key: string]: any;
  } | any;
  mark?: string;
  uid?: string;
  qrUrl?: string;
  xmlPayload?: string;
  movement?: any;
  providerSignature?: string;
  [key: string]: any;
}

@Component({
  selector: 'maranth-invoice-print',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './invoice-print.component.html',
  styleUrls: ['./invoice-print.component.css'],
})
export class InvoicePrintComponent {
  @ViewChild('printContainer') printContainerRef?: ElementRef<HTMLElement>;
  private readonly printEngine = inject(InvoicePrintEngineService);
  private readonly elRef = inject(ElementRef);

  // Input accepting either PrintableInvoiceData or any invoice payload
  readonly invoice = input<any>(null);

  // UI state signals bound in the template
  readonly activeMode = signal<'a4' | 'thermal80'>('a4');
  readonly copied = signal<boolean>(false);

  // ---------------------------------------------------------------------------
  // Print Dispatcher
  // ---------------------------------------------------------------------------
  public triggerBrowserPrint(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    console.log('👉 triggerBrowserPrint called in InvoicePrintComponent');
    this.triggerPrint();
  }

 public triggerPrint(): void {
  // Grab the native DOM element directly from Angular ViewChild
  const element = this.printContainerRef?.nativeElement;
  
  if (!element) {
    console.error('Print container element not found via ViewChild!');
    return;
  }

  this.printEngine.printElement(element, this.activeMode());
}

  // ---------------------------------------------------------------------------
  // Template Helpers (Required by invoice-print.component.html)
  // ---------------------------------------------------------------------------
  public copyXml(): void {
    const xml = this.invoice()?.xmlPayload;
    if (xml) {
      navigator.clipboard.writeText(xml);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  public getDocTitle(type?: string): string {
    switch (type) {
      case '1.1': return 'ΤΙΜΟΛΟΓΙΟ ΠΩΛΗΣΗΣ';
      case '1.2': return 'ΤΙΜΟΛΟΓΙΟ ΠΩΛΗΣΗΣ / ΕΝΔΟΚΟΙΝΟΤΙΚΕΣ';
      case '2.1': return 'ΤΙΜΟΛΟΓΙΟ ΠΑΡΟΧΗΣ ΥΠΗΡΕΣΙΩΝ';
      case '8.1': return 'ΕΝΔΟΚΟΙΝΟΤΙΚΗ ΠΑΡΟΧΗ ΥΠΗΡΕΣΙΩΝ';
      case '9.1': return 'ΔΕΛΤΙΟ ΑΠΟΣΤΟΛΗΣ';
      case '11.1': return 'ΑΠΟΔΕΙΞΗ ΛΙΑΝΙΚΗΣ';
      case '11.2': return 'ΑΠΟΔΕΙΞΗ ΠΑΡΟΧΗΣ ΥΠΗΡΕΣΙΩΝ';
      default: return 'ΠΑΡΑΣΤΑΤΙΚΟ';
    }
  }

  public isDispatch(): boolean {
    const inv = this.invoice();
    return inv?.invoiceType === '9.1' || !!inv?.movement;
  }

  public isRetailDoc(type?: string): boolean {
    const t = type || this.invoice()?.invoiceType;
    return t === '11.1' || t === '11.2';
  }

  public getCustomerAddress(customer: any): string {
    if (!customer?.address) return '';
    const { street, number, postalCode, city } = customer.address;
    return [street, number, postalCode, city].filter(Boolean).join(' ');
  }

  public getPurposeLabel(purposeCode?: string | number): string {
    switch (String(purposeCode)) {
      case '1': return 'Πώληση';
      case '2': return 'Δειγματισμός';
      case '3': return 'Έκθεση';
      case '4': return 'Επιστροφή';
      case '5': return 'Επεξεργασία';
      default: return 'Διακίνηση';
    }
  }

  public getUnitLabel(unit: string | number | undefined, _type?: string): string {
    switch (String(unit)) {
      case '1': return 'Τεμ.';
      case '2': return 'Κιλά';
      case '3': return 'Λίτρα';
      case '4': return 'Μέτρα';
      case '5': return 'Ώρες';
      case '6': return 'Μήνες';
      default: return 'Τεμ.';
    }
  }

  public getQrImageUrl(qrUrl?: string): string {
    if (!qrUrl) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrUrl)}`;
  }
}
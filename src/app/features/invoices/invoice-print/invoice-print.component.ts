import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QrCodeComponent } from '../../../shared/components/qr-code/qr-code.component';
import {
  InvoiceLineItem,
  InvoiceTotals,
  Customer,
  GoodsMovementData,
} from '../../../core/models/aade.models';

export interface PrintableInvoiceData {
  series: string;
  documentNumber: number;
  issueDate: string;
  invoiceType: string;
  issuer: {
    legalName: string;
    tradeName?: string;
    afm: string;
    doy?: string;
    branch?: number;
    address?: {
      street: string;
      number: string;
      postalCode: string;
      city: string;
    };
    phone?: string;
    email?: string;
  };
  customer: Customer;
  lines: InvoiceLineItem[];
  totals: InvoiceTotals;
  mark: string;
  uid: string;
  qrUrl: string;
  xmlPayload?: string;
  movement?: GoodsMovementData;
}

type PrintLayoutMode = 'a4' | 'thermal80' | 'xml';

@Component({
  selector: 'maranth-invoice-print',
  standalone: true,
  imports: [CommonModule, QrCodeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Root Overlay: notice NO 'no-print' here so children can print! -->
    <div class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6 overflow-y-auto print-modal-backdrop">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden print-modal-window">
        
        <!-- Modal Toolbar: Hidden when printing -->
        <div class="px-4 sm:px-6 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 no-print">
          <div class="flex items-center gap-3">
            <div>
              <h2 class="text-sm sm:text-base font-semibold tracking-tight">Επίσημο Παραστατικό & myDATA</h2>
              <p class="text-[11px] text-slate-400">Εκτύπωση A4, Φορητό Θερμικό (Ex-Van) ή XML</p>
            </div>
            
            <!-- View Mode Switcher -->
            <div class="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-xs">
              <button
                type="button"
                (click)="activeMode.set('a4')"
                [class.bg-indigo-600]="activeMode() === 'a4'"
                [class.text-white]="activeMode() === 'a4'"
                [class.text-slate-400]="activeMode() !== 'a4'"
                class="px-2.5 py-1 rounded-md transition font-medium"
              >
                Έντυπο A4
              </button>
              <button
                type="button"
                (click)="activeMode.set('thermal80')"
                [class.bg-indigo-600]="activeMode() === 'thermal80'"
                [class.text-white]="activeMode() === 'thermal80'"
                [class.text-slate-400]="activeMode() !== 'thermal80'"
                class="px-2.5 py-1 rounded-md transition font-medium flex items-center gap-1.5"
              >
                <span>Θερμικό 80mm</span>
                <span class="text-[9px] px-1 py-0.2 bg-amber-500 text-slate-950 font-bold rounded">Van</span>
              </button>
              <button
                type="button"
                (click)="activeMode.set('xml')"
                [class.bg-indigo-600]="activeMode() === 'xml'"
                [class.text-white]="activeMode() === 'xml'"
                [class.text-slate-400]="activeMode() !== 'xml'"
                class="px-2.5 py-1 rounded-md transition font-medium"
              >
                XML
              </button>
            </div>
          </div>

          <div class="flex items-center gap-2">
            @if (activeMode() !== 'xml') {
              <button
                type="button"
                (click)="triggerPrint()"
                class="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold shadow-sm transition flex items-center gap-2 text-white"
              >
                <span>Εκτύπωση ({{ activeMode() === 'thermal80' ? '80mm' : 'A4' }})</span>
              </button>
            } @else {
              <button
                type="button"
                (click)="copyXml()"
                class="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-xs font-semibold transition text-slate-200"
              >
                {{ copied() ? 'Αντιγράφηκε!' : 'Αντιγραφή XML' }}
              </button>
            }

            <button
              type="button"
              (click)="close.emit()"
              class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition"
            >
              Κλείσιμο
            </button>
          </div>
        </div>

        <!-- Body Area: clean wrapper that expands naturally in print -->
        <div class="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 flex justify-center print-body-area">
          
          <!-- ========================================== -->
          <!-- 1. MODE: A4 CORPORATE PRINT SHEET          -->
          <!-- ========================================== -->
          @if (activeMode() === 'a4') {
            <div class="print-sheet bg-white border border-slate-300 shadow-md p-8 w-full max-w-[210mm] min-h-[297mm] text-slate-900 font-sans text-xs flex flex-col justify-between">
              
              <div class="space-y-5">
                <!-- Header -->
                <div class="flex justify-between items-start border-b-2 border-slate-900 pb-5">
                  <!-- DYNAMIC TENANT ISSUER -->
<div class="flex items-center gap-2 mb-1">
  <span class="w-6 h-6 rounded bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
    {{ (invoice().issuer.tradeName || invoice().issuer.legalName).charAt(0) }}
  </span>
  <h1 class="text-lg font-black tracking-tight uppercase">
    {{ invoice().issuer.tradeName || invoice().issuer.legalName }}
  </h1>
</div>
@if (invoice().issuer.tradeName && invoice().issuer.legalName !== invoice().issuer.tradeName) {
  <p class="font-medium text-slate-700">{{ invoice().issuer.legalName }}</p>
}
<p class="text-[11px] text-slate-600 mt-1">
  Α.Φ.Μ.: <span class="font-bold font-mono">{{ invoice().issuer.afm }}</span>
  @if (invoice().issuer.doy) {
    | Δ.Ο.Υ.: {{ invoice().issuer.doy }}
  }
</p>
@if (invoice().issuer.address?.street) {
  <p class="text-[11px] text-slate-600">
    {{ invoice().issuer.address?.street }} {{ invoice().issuer.address?.number }}, 
    {{ invoice().issuer.address?.postalCode }} {{ invoice().issuer.address?.city }}
  </p>
}
@if (invoice().issuer.phone || invoice().issuer.email) {
  <p class="text-[11px] text-slate-600">
    {{ invoice().issuer.phone ? 'Τηλ: ' + invoice().issuer.phone : '' }} 
    {{ invoice().issuer.email ? '| ' + invoice().issuer.email : '' }}
  </p>
}

                  <div class="text-right flex flex-col items-end">
                    <div class="border-2 border-slate-900 bg-slate-50 px-4 py-2 rounded-md text-center inline-block">
                      <span class="block text-[9px] font-bold uppercase tracking-wider text-slate-500">Ειδος Παραστατικου</span>
                      <span class="text-sm font-black text-slate-900 uppercase">
                        {{ getDocTitle(invoice().invoiceType) }}
                      </span>
                    </div>
                    <div class="mt-3 space-y-0.5 text-right text-[11px]">
                      <p><span class="text-slate-500">Σειρά:</span> <span class="font-bold font-mono text-slate-900">{{ invoice().series }}</span></p>
                      <p><span class="text-slate-500">Αριθμός:</span> <span class="font-bold font-mono text-slate-900">{{ invoice().documentNumber }}</span></p>
                      <p><span class="text-slate-500">Ημερομηνία:</span> <span class="font-mono text-slate-900">{{ invoice().issueDate }}</span></p>
                    </div>
                  </div>
                </div>

                <!-- Recipient Box -->
                <div class="border border-slate-300 rounded-lg p-3.5 bg-slate-50/70">
                  <span class="block text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-1.5">Στοιχεια Ληπτη / Προμηθευτη</span>
                  <div class="grid grid-cols-2 gap-4 text-[11px]">
                    <div>
                      <p class="font-bold text-slate-900 text-xs">{{ invoice().customer.legalName }}</p>
                      <p class="text-slate-600">{{ invoice().customer.address?.street }} {{ invoice().customer.address?.number }}</p>
                      <p class="text-slate-600">{{ invoice().customer.address?.postalCode }} {{ invoice().customer.address?.city }}</p>
                    </div>
                    <div class="space-y-0.5 text-right sm:text-left sm:pl-8 border-l border-slate-200">
                      <p><span class="text-slate-500">Α.Φ.Μ.:</span> <span class="font-bold font-mono text-slate-900">{{ invoice().customer.afm }}</span></p>
                      <p><span class="text-slate-500">Δ.Ο.Υ.:</span> <span class="text-slate-800">{{ invoice().customer.doy || '—' }}</span></p>
                      <p><span class="text-slate-500">Email:</span> <span class="font-mono text-slate-800">{{ invoice().customer.email || '—' }}</span></p>
                    </div>
                  </div>
                </div>

                <!-- Goods Movement Box -->
                @if (invoice().movement) {
                  <div class="border border-amber-300 bg-amber-50/60 rounded-lg p-3 text-[10px] space-y-1">
                    <div class="flex justify-between items-center border-b border-amber-200 pb-1">
                      <span class="font-bold uppercase tracking-wider text-amber-900">Στοιχεια Ψηφιακης Διακινησης (ΑΑΔΕ Phase B)</span>
                      <span class="font-mono font-bold text-amber-950">
                        Αρ. Οχήματος: {{ invoice().movement!.vehicleNumber }}
                      </span>
                    </div>
                    <div class="grid grid-cols-3 gap-2 pt-1 text-slate-700">
                      <div>
                        <span class="text-slate-500">Σκοπός:</span>
                        <span class="font-semibold block">{{ getPurposeLabel(invoice().movement!.movePurpose) }}</span>
                      </div>
                      <div>
                        <span class="text-slate-500">Τόπος Έναρξης:</span>
                        <span class="block font-medium">
                          {{ invoice().movement!.addressFrom.street }} {{ invoice().movement!.addressFrom.number }}, {{ invoice().movement!.addressFrom.city }}
                        </span>
                      </div>
                      <div>
                        <span class="text-slate-500">Τόπος Παράδοσης:</span>
                        <span class="block font-medium">
                          {{ invoice().movement!.addressTo.street }} {{ invoice().movement!.addressTo.number }}, {{ invoice().movement!.addressTo.city }}
                        </span>
                      </div>
                    </div>
                  </div>
                }

                <!-- Lines Table -->
                <table class="w-full border-collapse text-left text-[11px]">
                  <thead>
                    <tr class="border-b-2 border-slate-900 text-[10px] uppercase font-bold text-slate-700">
                      <th class="py-2 w-8">#</th>
                      <th class="py-2">Περιγραφη Ειδους</th>
                      <th class="py-2 text-right w-20">Ποσοτητα</th>
                      @if (invoice().invoiceType !== '9.1') {
                        <th class="py-2 text-right w-20">Τιμη Μον.</th>
                        <th class="py-2 text-right w-16">Εκπτ. %</th>
                        <th class="py-2 text-right w-20">Καθαρη</th>
                      }
                      <th class="py-2 text-right w-16">ΦΠΑ</th>
                      @if (invoice().invoiceType !== '9.1') {
                        <th class="py-2 text-right w-24">Συνολο</th>
                      }
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-200">
                    @for (line of invoice().lines; track line.id) {
                      <tr>
                        <td class="py-2 font-mono text-slate-500">{{ line.lineNumber }}</td>
                        <td class="py-2 font-medium text-slate-900">{{ line.description }}</td>
                        <td class="py-2 text-right font-mono font-bold">{{ line.quantity }} Τεμ.</td>
                        @if (invoice().invoiceType !== '9.1') {
                          <td class="py-2 text-right font-mono">{{ line.unitPrice | number:'1.2-2' }} €</td>
                          <td class="py-2 text-right font-mono">{{ line.discountPercentage }}%</td>
                          <td class="py-2 text-right font-mono">{{ line.netValue | number:'1.2-2' }} €</td>
                        }
                        <td class="py-2 text-right font-mono">{{ line.vatPercentage }}%</td>
                        @if (invoice().invoiceType !== '9.1') {
                          <td class="py-2 text-right font-mono font-bold text-slate-900">{{ line.totalValue | number:'1.2-2' }} €</td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <!-- Footer with AADE QR & Totals/Signatures -->
              <div class="border-t-2 border-slate-900 pt-4 mt-6">
                <div class="flex justify-between items-end">
                  <div class="flex items-center gap-4">
                    <maranth-qr-code [data]="invoice().qrUrl" [size]="100" caption="ΑΑΔΕ myDATA"></maranth-qr-code>
                    <div class="text-[10px] space-y-1">
                      <p class="font-extrabold uppercase tracking-wider text-slate-900">Ψηφιακη Σημανση myDATA</p>
                      <p><span class="text-slate-500">MARK:</span> <span class="font-bold font-mono text-slate-900">{{ invoice().mark }}</span></p>
                      <p class="max-w-[260px] truncate"><span class="text-slate-500">UID:</span> <span class="font-mono text-[9px] text-slate-700">{{ invoice().uid }}</span></p>
                      @if (invoice().invoiceType === '9.1') {
                        <p class="text-[9px] font-bold text-amber-800">Μηδενική Χρηματική Αξία (Σκοπός: 6 - Επιστροφή)</p>
                      } @else {
                        <p class="text-[9px] text-slate-500 italic">Επαλήθευση εγκυρότητας μέσω σάρωσης του QR Code</p>
                      }
                    </div>
                  </div>

                  @if (invoice().invoiceType === '9.1') {
                    <div class="w-80 space-y-3 text-xs border border-slate-300 bg-slate-50 p-3 rounded-lg">
                      <div class="flex justify-between font-bold text-slate-800 pb-1 border-b border-slate-200">
                        <span>ΣΥΝΟΛΟ ΕΙΔΩΝ:</span>
                        <span class="font-mono font-black">{{ invoice().lines.length }} γραμμές</span>
                      </div>
                      <div class="grid grid-cols-2 gap-4 pt-2 text-[10px] text-center">
                        <div>
                          <span class="block text-slate-500 font-bold mb-6">Ο ΠΑΡΑΔΩΣΑΣ</span>
                          <span class="block border-t border-slate-400 pt-1">Υπογραφή</span>
                        </div>
                        <div>
                          <span class="block text-slate-500 font-bold mb-6">Ο ΠΑΡΑΛΑΒΩΝ</span>
                          <span class="block border-t border-slate-400 pt-1">Υπογραφή / Σφραγίδα</span>
                        </div>
                      </div>
                    </div>
                  } @else {
                    <div class="w-64 space-y-1.5 text-right text-xs">
                      <div class="flex justify-between text-slate-600">
                        <span>Καθαρή Αξία:</span>
                        <span class="font-mono font-medium text-slate-900">{{ invoice().totals.totalNetValue | number:'1.2-2' }} €</span>
                      </div>
                      <div class="flex justify-between text-slate-600">
                        <span>Συνολικός Φ.Π.Α.:</span>
                        <span class="font-mono font-medium text-slate-900">{{ invoice().totals.totalVatAmount | number:'1.2-2' }} €</span>
                      </div>
                      <div class="border-t border-slate-900 pt-2 flex justify-between text-sm font-black text-slate-900">
                        <span>Πληρωτέο Σύνολο:</span>
                        <span class="font-mono text-indigo-700 text-base">{{ invoice().totals.totalGrossValue | number:'1.2-2' }} €</span>
                      </div>
                    </div>
                  }
                </div>

                <div class="mt-6 pt-3 border-t border-slate-200 text-center text-[9px] text-slate-400">
                  Εκδόθηκε μέσω Maranth Timologio SaaS — myDATA Technical Protocol v1.0.8
                </div>
              </div>

            </div>
          }

          <!-- ======================================================== -->
          <!-- 2. MODE: 80mm ESC/POS THERMAL RECEIPT (FOR MOBILE VANS) -->
          <!-- ======================================================== -->
          @if (activeMode() === 'thermal80') {
            <div class="thermal-receipt bg-white text-black font-mono text-[11px] leading-tight p-3 w-[80mm] max-w-[80mm] border border-slate-300 shadow-md">
              
              <!-- Company Header -->
              <div class="text-center pb-2 border-b border-dashed border-black">
                <!-- DYNAMIC TENANT ISSUER -->
<p class="font-black text-sm tracking-wider uppercase">
  {{ invoice().issuer.tradeName || invoice().issuer.legalName }}
</p>
<p class="text-[10px]">
  ΑΦΜ: {{ invoice().issuer.afm }}
  {{ invoice().issuer.doy ? '- ΔΟΥ: ' + invoice().issuer.doy : '' }}
</p>
@if (invoice().issuer.address?.street) {
  <p class="text-[9px]">
    {{ invoice().issuer.address?.street }} {{ invoice().issuer.address?.number }}, {{ invoice().issuer.address?.city }}
  </p>
}
@if (invoice().issuer.phone) {
  <p class="text-[9px]">ΤΗΛ: {{ invoice().issuer.phone }}</p>
}
              </div>

              <!-- Document Metadata -->
              <div class="py-2 border-b border-dashed border-black text-[10px] space-y-0.5">
                <div class="font-bold text-center text-xs uppercase my-0.5">
                  {{ getDocTitle(invoice().invoiceType) }}
                </div>
                <div class="flex justify-between">
                  <span>ΣΕΙΡΑ-ΑΡΙΘΜΟΣ:</span>
                  <span class="font-bold">{{ invoice().series }}-{{ invoice().documentNumber }}</span>
                </div>
                <div class="flex justify-between">
                  <span>ΗΜΕΡΟΜΗΝΙΑ:</span>
                  <span>{{ invoice().issueDate }}</span>
                </div>
              </div>

              <!-- Client Details -->
              <div class="py-2 border-b border-dashed border-black text-[10px] space-y-0.5">
                <p class="font-bold uppercase truncate">{{ invoice().customer.legalName }}</p>
                <p>ΑΦΜ: <span class="font-bold">{{ invoice().customer.afm }}</span> | ΔΟΥ: {{ invoice().customer.doy || '—' }}</p>
                <p class="truncate">{{ invoice().customer.address?.street }} {{ invoice().customer.address?.number }}, {{ invoice().customer.address?.city }}</p>
              </div>

              <!-- Goods Movement (If 1.2 or 9.1 Ex-Van) -->
              @if (invoice().movement) {
                <div class="py-2 border-b border-dashed border-black text-[9px] space-y-0.5 bg-slate-50/50">
                  <p class="font-bold uppercase text-[10px] text-center">** ΔΙΑΚΙΝΗΣΗ ΑΓΑΘΩΝ (AADE) **</p>
                  <div class="flex justify-between font-bold">
                    <span>ΟΧΗΜΑ:</span>
                    <span>{{ invoice().movement!.vehicleNumber }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span>ΣΚΟΠΟΣ:</span>
                    <span>{{ getPurposeLabel(invoice().movement!.movePurpose) }}</span>
                  </div>
                  <p class="truncate">ΕΝΑΡΞΗ: {{ invoice().movement!.addressFrom.city }}</p>
                  <p class="truncate">ΠΑΡΑΔΟΣΗ: {{ invoice().movement!.addressTo.city }}</p>
                </div>
              }

              <!-- Items Table -->
              <div class="py-2 border-b border-dashed border-black">
                @if (invoice().invoiceType === '9.1') {
                  <div class="flex justify-between font-bold text-[9px] pb-1 border-b border-black">
                    <span class="w-[70%]">ΕΙΔΟΣ/ΠΕΡΙΓΡΑΦΗ</span>
                    <span class="w-[30%] text-right">ΠΟΣΟΤΗΤΑ</span>
                  </div>

                  <div class="divide-y divide-dotted divide-slate-400 py-1">
                    @for (line of invoice().lines; track line.id) {
                      <div class="py-1 text-[10px]">
                        <div class="font-bold truncate">{{ line.description }}</div>
                        <div class="flex justify-between text-[9px]">
                          <span>ΦΠΑ: {{ line.vatPercentage }}%</span>
                          <span class="font-bold font-mono">{{ line.quantity }} Τεμ.</span>
                        </div>
                      </div>
                    }
                  </div>
                } @else {
                  <div class="flex justify-between font-bold text-[9px] pb-1 border-b border-black">
                    <span class="w-[50%]">ΕΙΔΟΣ/ΠΕΡΙΓΡΑΦΗ</span>
                    <span class="w-[20%] text-right">ΠΟΣxΤΙΜ</span>
                    <span class="w-[30%] text-right">ΑΞΙΑ</span>
                  </div>

                  <div class="divide-y divide-dotted divide-slate-400 py-1">
                    @for (line of invoice().lines; track line.id) {
                      <div class="py-1 text-[10px]">
                        <div class="font-bold truncate">{{ line.description }}</div>
                        <div class="flex justify-between text-[9px]">
                          <span>{{ line.quantity }} x {{ line.unitPrice | number:'1.2-2' }}€ ({{ line.vatPercentage }}%)</span>
                          <span class="font-bold">{{ line.totalValue | number:'1.2-2' }} €</span>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>

              <!-- Totals / Signatures -->
              @if (invoice().invoiceType === '9.1') {
                <div class="py-2 border-b border-dashed border-black text-center text-[10px] font-bold space-y-1">
                  <p>ΜΗΔΕΝΙΚΗ ΧΡΗΜΑΤΙΚΗ ΑΞΙΑ</p>
                  <p class="text-[9px] font-normal">ΣΥΝΟΛΙΚΑ ΕΙΔΗ: {{ invoice().lines.length }} γραμμές</p>
                </div>
                <div class="py-3 text-[9px] grid grid-cols-2 gap-2 text-center border-b border-dashed border-black">
                  <div>
                    <p class="font-bold pb-4">ΠΑΡΑΔΟΣΗ</p>
                    <p>..................</p>
                  </div>
                  <div>
                    <p class="font-bold pb-4">ΠΑΡΑΛΑΒΗ</p>
                    <p>..................</p>
                  </div>
                </div>
              } @else {
                <div class="py-2 border-b border-dashed border-black space-y-1 text-right text-[11px]">
                  <div class="flex justify-between text-slate-700">
                    <span>ΚΑΘΑΡΗ ΑΞΙΑ:</span>
                    <span>{{ invoice().totals.totalNetValue | number:'1.2-2' }} €</span>
                  </div>
                  <div class="flex justify-between text-slate-700">
                    <span>ΣΥΝΟΛΟ ΦΠΑ:</span>
                    <span>{{ invoice().totals.totalVatAmount | number:'1.2-2' }} €</span>
                  </div>
                  <div class="flex justify-between font-black text-sm pt-1 border-t border-black">
                    <span>ΠΛΗΡΩΤΕΟ:</span>
                    <span>{{ invoice().totals.totalGrossValue | number:'1.2-2' }} €</span>
                  </div>
                </div>
              }

              <!-- AADE Fiscal QR Code -->
              <div class="py-3 text-center flex flex-col items-center space-y-1.5">
                <maranth-qr-code [data]="invoice().qrUrl" [size]="85" caption="myDATA QR"></maranth-qr-code>
                <div class="text-[9px] leading-tight space-y-0.5">
                  <p class="font-bold">MARK: {{ invoice().mark }}</p>
                  <p class="font-mono text-[8px] break-all">UID: {{ invoice().uid }}</p>
                  <p class="text-[8px] italic pt-1">ΕΛΕΓΧΟΣ ΕΓΚΥΡΟΤΗΤΑΣ: aade.gr/mydata</p>
                </div>
              </div>

              <!-- Paper Tear Notch / Feed Space -->
              <div class="text-center text-[8px] text-slate-500 pt-1 pb-4">
                *** ΤΕΛΟΣ ΠΑΡΑΣΤΑΤΙΚΟΥ ***
              </div>

            </div>
          }

          <!-- ========================================== -->
          <!-- 3. MODE: RAW AADE XML                      -->
          <!-- ========================================== -->
          @if (activeMode() === 'xml') {
            <div class="w-full bg-slate-950 rounded-xl p-5 border border-slate-800 text-slate-100 font-mono text-xs overflow-x-auto shadow-inner">
              <pre class="leading-relaxed"><code>{{ invoice().xmlPayload }}</code></pre>
            </div>
          }

        </div>

      </div>
    </div>
  `,
  styles: [`
    @media print {
      /* 1. Force the host component to take over the viewport */
      :host {
        display: block !important;
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: auto !important;
        min-height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        z-index: 9999999 !important;
      }

      /* 2. Strip all modal backdrops, scrollboxes, and flex restrictions */
      .print-modal-backdrop,
      .print-modal-window,
      .print-body-area {
        position: static !important;
        display: block !important;
        background: transparent !important;
        box-shadow: none !important;
        border: none !important;
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      .no-print {
        display: none !important;
      }

      /* 3. A4 Corporate Document */
      .print-sheet {
        position: relative !important;
        display: block !important;
        box-shadow: none !important;
        border: none !important;
        width: 100% !important;
        max-width: 100% !important;
        min-height: auto !important;
        height: auto !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      /* 4. 80mm Continuous Thermal Receipt */
      .thermal-receipt {
        display: block !important;
        box-shadow: none !important;
        border: none !important;
        width: 74mm !important;
        max-width: 74mm !important;
        margin: 0 auto !important;
        padding: 0 !important;
      }

      /* 5. Prevent elements from breaking mid-content */
      table, tr, td, th, canvas, img {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    }
  `],
})
export class InvoicePrintComponent {
  public readonly invoice = input.required<PrintableInvoiceData>();
  public readonly close = output<void>();

  public readonly activeMode = signal<PrintLayoutMode>('a4');
  public readonly copied = signal<boolean>(false);

  public triggerPrint(): void {
    const portal = document.getElementById('print-portal');
    const sheetToPrint = document.querySelector(
      this.activeMode() === 'thermal80' ? '.thermal-receipt' : '.print-sheet'
    ) as HTMLElement;

    if (!portal || !sheetToPrint) {
      window.print();
      return;
    }

    // 1. Deep clone the DOM tree
    portal.innerHTML = '';
    const cloned = sheetToPrint.cloneNode(true) as HTMLElement;

    // 2. Transfer live Canvas pixel buffer (QR code) to cloned Canvas
    const sourceCanvases = sheetToPrint.querySelectorAll('canvas');
    const clonedCanvases = cloned.querySelectorAll('canvas');

    sourceCanvases.forEach((srcCanvas, i) => {
      const destCanvas = clonedCanvases[i];
      if (destCanvas) {
        destCanvas.width = srcCanvas.width;
        destCanvas.height = srcCanvas.height;
        const ctx = destCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(srcCanvas, 0, 0);
        }
      }
    });

    // 3. Mount to portal and trigger print
    portal.appendChild(cloned);
    window.print();

    // 4. Clean up portal
    portal.innerHTML = '';
  }

  public copyXml(): void {
    const xml = this.invoice().xmlPayload;
    if (xml) {
      navigator.clipboard.writeText(xml);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  public getDocTitle(type: string): string {
    switch (type) {
      case '1.1': return '1.1 Τιμολόγιο Πώλησης';
      case '1.2': return '1.2 Τιμολόγιο / Δελτίο Αποστολής';
      case '2.1': return '2.1 Τιμολόγιο Υπηρεσιών';
      case '5.1': return '5.1 Πιστωτικό Τιμολόγιο';
      case '9.1': return '9.1 Δελτίο Αποστολής';
      default: return 'Προτιμολόγιο / Προσφορά';
    }
  }

  public getPurposeLabel(purposeCode?: number): string {
    switch (purposeCode) {
      case 1: return 'Πώληση';
      case 2: return 'Διακίνηση Εγκαταστάσεων';
      case 3: return 'Αποθήκευση';
      case 4: return 'Επεξεργασία';
      case 5: return 'Δειγματισμός';
      case 6: return 'Επιστροφή';
      default: return 'Πώληση';
    }
  }
}
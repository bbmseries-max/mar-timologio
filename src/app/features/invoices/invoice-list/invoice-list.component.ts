import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LocalDbService,  } from '@core/services/local-db.service';
import { LocalInvoiceRecord } from '@core/models/database.models';
import { PrintableInvoiceData, InvoicePrintComponent } from '../invoice-print/invoice-print.component';

@Component({
  selector: 'maranth-invoice-list',
  standalone: true,
  imports: [CommonModule, RouterLink, InvoicePrintComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-7xl mx-auto p-6 space-y-6">
      <div class="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 class="text-2xl font-bold text-slate-900 tracking-tight">Αρχείο Παραστατικών & myDATA</h1>
          <p class="text-sm text-slate-500">Τοπική βάση IndexedDB (Dexie) & συγχρονισμένα παραστατικά</p>
        </div>
        <a
          routerLink="/invoices/new"
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition"
        >
          + Νέο Τιμολόγιο
        </a>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        @if (invoices().length === 0) {
          <div class="p-12 text-center text-slate-500 space-y-3">
            <p class="text-sm font-medium">Δεν υπάρχουν καταχωρημένα παραστατικά ακόμη.</p>
            <a
              routerLink="/invoices/new"
              class="inline-block text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              Δημιουργήστε το πρώτο παραστατικό &rarr;
            </a>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead class="bg-slate-50 text-slate-500 font-medium uppercase">
                <tr>
                  <th class="px-4 py-3">Παραστατικό</th>
                  <th class="px-4 py-3">Ημερομηνία</th>
                  <th class="px-4 py-3">Πελάτης</th>
                  <th class="px-4 py-3">Α.Φ.Μ.</th>
                  <th class="px-4 py-3 text-right">Σύνολο (€)</th>
                  <th class="px-4 py-3 text-center">Κατάσταση</th>
                  <th class="px-4 py-3 text-right">Ενέργειες</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (inv of invoices(); track inv.id) {
                  <tr class="hover:bg-slate-50/50">
                    <td class="px-4 py-3 font-mono font-bold text-slate-900">
                      {{ inv.series }}-{{ inv.documentNumber }}
                      <span class="block text-[10px] font-normal text-slate-500">{{ inv.invoiceType }}</span>
                    </td>
                    <td class="px-4 py-3 font-mono text-slate-600">{{ inv.issueDate }}</td>
                    <td class="px-4 py-3 font-medium text-slate-800">{{ inv.customerName || '—' }}</td>
                    <td class="px-4 py-3 font-mono text-slate-600">{{ inv.customerAfm || '—' }}</td>
                    <td class="px-4 py-3 text-right font-mono font-bold text-slate-900">
                      {{ inv.totalGross | currency: 'EUR' }}
                    </td>
                    <td class="px-4 py-3 text-center">
                      <span
                        class="px-2 py-0.5 rounded-full text-[10px] font-medium"
                        [class.bg-amber-50]="inv.transmissionStatus === 'DRAFT'"
                        [class.text-amber-700]="inv.transmissionStatus === 'DRAFT'"
                        [class.border-amber-200]="inv.transmissionStatus === 'DRAFT'"
                        [class.bg-emerald-50]="inv.transmissionStatus === 'TRANSMITTED'"
                        [class.text-emerald-700]="inv.transmissionStatus === 'TRANSMITTED'"
                      >
                        {{ inv.transmissionStatus === 'DRAFT' ? 'Πρόχειρο' : 'Απεσταλμένο' }}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-right whitespace-nowrap space-x-2">
  <!-- DRAFT ACTION: Open in Invoice Builder for Editing & Final Issuance -->
  @if (inv.transmissionStatus === 'DRAFT') {
    <a
      [routerLink]="['/invoices/new']"
      [queryParams]="{ draftId: inv.id }"
      class="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-md transition"
    >
      <span>✏️</span>
      <span>Επεξεργασία</span>
    </a>
  } @else {
    <!-- TRANSMITTED / ISSUED: Read-only preview & print -->
    <button
      type="button"
      (click)="viewInvoice(inv)"
      class="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition"
    >
      <span>👁️</span>
      <span>Προβολή</span>
    </button>
  }

  <!-- Delete Action -->
  <button
    type="button"
    (click)="deleteItem(inv.id)"
    class="text-rose-600 hover:text-rose-800 text-[11px] font-semibold hover:underline"
  >
    Διαγραφή
  </button>
</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        <!-- Print / View Modal for Transmitted Invoices -->
@if (selectedInvoiceForPrint(); as printData) {
  <maranth-invoice-print
    [invoice]="printData"
    (close)="closePrintModal()"
  ></maranth-invoice-print>
}
      </div>
    </div>
  `,
})
export class InvoiceListComponent implements OnInit {
  private readonly db = inject(LocalDbService);
  public readonly selectedInvoiceForPrint = signal<PrintableInvoiceData | null>(null);
  public readonly invoices = signal<LocalInvoiceRecord[]>([]);

  async ngOnInit(): Promise<void> {
    await this.loadInvoices();
  }

  public viewInvoice(inv: LocalInvoiceRecord): void {
    if (!inv.payloadJson) {
      console.warn('No payloadJson found for invoice:', inv.id);
      return;
    }

    try {
      const payload = JSON.parse(inv.payloadJson);

      const printableData: PrintableInvoiceData = {
        series: inv.series,
        documentNumber: inv.documentNumber,
        issueDate: inv.issueDate,
        invoiceType: inv.invoiceType,
        issuer: payload.issuer || {
          legalName: 'Επωνυμία Επιχείρησης',
          afm: inv.customerAfm || '',
        },
        customer: {
          id: inv.id || crypto.randomUUID(),
          afm: inv.customerAfm || '',
          branch: 0,
          legalName: inv.customerName || '',
          doy: payload.customer?.doy || '',
          country: 'GR',
          email: payload.customer?.email || '',
          address: payload.customer?.address,
        },
        lines: payload.lines || [],
        totals: payload.totals || {
          totalNetValue: inv.totalNet,
          totalVatAmount: inv.totalVat,
          totalGrossValue: inv.totalGross,
          totalDiscountAmount: 0,
          totalWithheldAmount: 0,
          totalOtherTaxesAmount: 0,
          totalStampDutyAmount: 0,
          totalFeesAmount: 0,
          totalDeductionsAmount: 0,
        },
        mark: inv.mark || '—',
        uid: inv.uid || '—',
        qrUrl: inv.qrUrl || '',
        xmlPayload: payload.xmlPayload,
        movement: payload.movement,
      };

      this.selectedInvoiceForPrint.set(printableData);
    } catch (err) {
      console.error('Failed to parse invoice payload for preview:', err);
    }
  }

  private async loadInvoices(): Promise<void> {
    const list = await this.db.getAllInvoices();
    this.invoices.set(list);
  }

  public closePrintModal(): void {
    this.selectedInvoiceForPrint.set(null);
  }

  public async deleteItem(id: string): Promise<void> {
    const confirmed = confirm('Είστε βέβαιοι ότι θέλετε να διαγράψετε αυτό το παραστατικό;');
    if (confirmed) {
      await this.db.deleteInvoice(id);
      // Reload list
      this.invoices.update(list => list.filter(item => item.id !== id));
    }
  }
}
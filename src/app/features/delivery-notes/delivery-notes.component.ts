// src/app/features/delivery-notes/delivery-notes.component.ts
import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthTenantService } from '@core/services/auth-tenant.service';
import { LocalDbService } from '@core/services/local-db.service';
import { LocalInvoiceRecord } from '@core/models/database.models';

@Component({
  selector: 'maranth-delivery-notes',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-7xl mx-auto p-6 space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4 gap-4">
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-2xl font-bold text-slate-900 tracking-tight">Ψηφιακά Δελτία Αποστολής (9.1 / 1.2)</h1>
            <span class="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800 border border-amber-300">
              AADE Phase B
            </span>
          </div>
          <p class="text-sm text-slate-500">Πραγματικού χρόνου παρακολούθηση διακίνησης φορτίων, οχημάτων και παραδόσεων</p>
        </div>

        <button
          type="button"
          (click)="createNewMovementDoc()"
          class="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition"
        >
          + Νέο Δελτίο Διακίνησης (9.1)
        </button>
      </div>

      <!-- Quick Metrics -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
          <span class="block text-xs font-medium text-slate-500">Ενεργές Διακινήσεις Σήμερα</span>
          <span class="text-2xl font-bold font-mono text-slate-900 mt-1 block">{{ movementDocs().length }}</span>
        </div>
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
          <span class="block text-xs font-medium text-slate-500">Συχνότερο Όχημα</span>
          <span class="text-2xl font-bold font-mono text-indigo-600 mt-1 block">IEB-4892</span>
        </div>
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
          <span class="block text-xs font-medium text-slate-500">Κατάσταση myDATA</span>
          <span class="text-2xl font-bold font-mono text-emerald-600 mt-1 block">Online</span>
        </div>
      </div>

      <!-- Movement Docs Table -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div class="p-4 bg-slate-50 border-b border-slate-200">
          <h2 class="text-sm font-semibold uppercase tracking-wider text-slate-700">Ιστορικό Διακινήσεων Αγαθών</h2>
        </div>

        @if (movementDocs().length === 0) {
          <div class="p-12 text-center text-slate-500 space-y-3">
            <p class="text-sm font-medium">Δεν έχουν καταχωρηθεί παραστατικά διακίνησης (9.1 ή 1.2) ακόμη.</p>
            <button
              type="button"
              (click)="createNewMovementDoc()"
              class="inline-block text-xs font-semibold text-amber-600 hover:text-amber-800"
            >
              Έκδοση πρώτου δελτίου αποστολής &rarr;
            </button>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead class="bg-slate-50 text-slate-500 font-medium uppercase">
                <tr>
                  <th class="px-4 py-3">Παραστατικό</th>
                  <th class="px-4 py-3">Ημερομηνία</th>
                  <th class="px-4 py-3">Παραλήπτης</th>
                  <th class="px-4 py-3">Α.Φ.Μ.</th>
                  <th class="px-4 py-3 text-right">Σύνολο</th>
                  <th class="px-4 py-3 text-center">Κατάσταση</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (doc of movementDocs(); track doc.id) {
                  <tr class="hover:bg-slate-50/50">
                    <td class="px-4 py-3 font-mono font-bold text-slate-900">
                      {{ doc.series }}-{{ doc.documentNumber }}
                      <span class="block text-[10px] font-normal text-slate-500">{{ doc.invoiceType }}</span>
                    </td>
                    <td class="px-4 py-3 font-mono text-slate-600">{{ doc.issueDate }}</td>
                    <td class="px-4 py-3 font-medium text-slate-800">{{ doc.customerName || '—' }}</td>
                    <td class="px-4 py-3 font-mono text-slate-600">{{ doc.customerAfm || '—' }}</td>
                    <td class="px-4 py-3 text-right font-mono font-bold text-slate-900">
                      {{ doc.totalGross | currency: 'EUR' }}
                    </td>
                    <td class="px-4 py-3 text-center">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        Διακίνηση
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>
  `,
})
export class DeliveryNotesComponent implements OnInit {
  private readonly db = inject(LocalDbService);
  private readonly auth = inject(AuthTenantService);
  public readonly movementDocs = signal<LocalInvoiceRecord[]>([]);;
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    const currentTenantId = this.auth.currentTenantId();
  const all: LocalInvoiceRecord[] = await this.db.getAllInvoices(currentTenantId);

  // Filter only 1.2 (Invoice with Movement) and 9.1 (Digital Delivery Note)
  this.movementDocs.set(
    all.filter((i: LocalInvoiceRecord) => i.invoiceType === '1.2' || i.invoiceType === '9.1')
  );
}

  public createNewMovementDoc(): void {
    this.router.navigate(['/invoices/new']);
  }
}
import { Component, ChangeDetectionStrategy, signal, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthTenantService } from '@core/services/auth-tenant.service';
import { LocalDbService } from '@core/services/local-db.service';
import { MyDataService } from '@core/services/mydata.service';
import { LocalInvoiceRecord } from '@core/models/database.models';

@Component({
  selector: 'maranth-delivery-notes',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-7xl mx-auto p-6 space-y-6">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4 gap-4">
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-2xl font-bold text-slate-900 tracking-tight">Ψηφιακά Δελτία Αποστολής (myDATA)</h1>
            <span class="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800 border border-amber-300">
              AADE Phase B
            </span>
          </div>
          <p class="text-sm text-slate-500">Πραγματικού χρόνου παρακολούθηση διακίνησης φορτίων, οχημάτων και παραδόσεων</p>
        </div>

        <div class="flex items-center gap-2">
          <!-- Archive Visibility Toggle -->
          <button
            type="button"
            (click)="toggleArchiveVisibility()"
            [class.bg-indigo-50]="showArchived()"
            [class.text-indigo-700]="showArchived()"
            [class.border-indigo-300]="showArchived()"
            class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 transition cursor-pointer flex items-center gap-1.5"
            title="Εναλλαγή προβολής αρχειοθετημένων παραστατικών"
          >
            📦 {{ showArchived() ? 'Απόκρυψη Αρχείου' : 'Προβολή Αρχείου (' + archivedCount() + ')' }}
          </button>

          <!-- Cleanup Action -->
          <button
            type="button"
            (click)="onPurgeTestDrafts()"
            [disabled]="isPurging()"
            class="px-3 py-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 rounded-lg text-xs font-semibold border border-slate-200 transition cursor-pointer disabled:opacity-50"
            title="Εκκαθάριση δοκιμαστικών πρόχειρων (DRAFT/FAILED)"
          >
            {{ isPurging() ? 'Εκκαθάριση...' : '🗑️ Εκκαθάριση Δοκιμών' }}
          </button>

          <!-- New Doc Action -->
          <button
            type="button"
            (click)="createNewMovementDoc()"
            class="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            + Νέο Δελτίο Διακίνησης (9.3)
          </button>
        </div>
      </div>

      <!-- Quick Metrics -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span class="block text-xs font-medium text-slate-500">Ενεργές Διακινήσεις</span>
          <span class="text-2xl font-bold font-mono text-slate-900 mt-1 block">
            {{ activeCount() }}
          </span>
        </div>
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span class="block text-xs font-medium text-slate-500">Αρχειοθετημένα</span>
          <span class="text-2xl font-bold font-mono text-slate-500 mt-1 block">
            {{ archivedCount() }}
          </span>
        </div>
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span class="block text-xs font-medium text-slate-500">Κατάσταση myDATA</span>
          <span class="text-2xl font-bold font-mono text-emerald-600 mt-1 block">Online</span>
        </div>
      </div>

      <!-- Movement Docs Table -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div class="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <h2 class="text-sm font-semibold uppercase tracking-wider text-slate-700">
            {{ showArchived() ? 'Πλήρες Ιστορικό (Συμπεριλαμβάνονται Αρχειοθετημένα)' : 'Ενεργές Διακινήσεις Αγαθών' }}
          </h2>
          @if (showArchived()) {
            <span class="text-[11px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
              Εμφανίζονται και τα αρχειοθετημένα
            </span>
          }
        </div>

        @if (visibleMovementDocs().length === 0) {
          <div class="p-12 text-center text-slate-500 space-y-3">
            <p class="text-sm font-medium">Δεν υπάρχουν παραστατικά διακίνησης προς προβολή.</p>
            @if (archivedCount() > 0 && !showArchived()) {
              <button
                type="button"
                (click)="toggleArchiveVisibility()"
                class="inline-block text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
              >
                Υπάρχουν {{ archivedCount() }} αρχειοθετημένα παραστατικά. Προβολή &rarr;
              </button>
            } @else {
              <button
                type="button"
                (click)="createNewMovementDoc()"
                class="inline-block text-xs font-semibold text-amber-600 hover:text-amber-800 cursor-pointer"
              >
                Έκδοση πρώτου δελτίου αποστολής &rarr;
              </button>
            }
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
                  <th class="px-4 py-3 text-right">Αξία</th>
                  <th class="px-4 py-3 text-center">MARK myDATA</th>
                  <th class="px-4 py-3 text-center">Κατάσταση</th>
                  <th class="px-4 py-3 text-center">Ενέργειες</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (doc of visibleMovementDocs(); track doc.id) {
                  <tr [class.opacity-60]="isDocArchived(doc)" class="hover:bg-slate-50/50 transition">
                    <td class="px-4 py-3 font-mono font-bold text-slate-900">
                      {{ doc.series }}-{{ doc.documentNumber }}
                      <span class="block text-[10px] font-normal text-slate-500">Τύπος: {{ doc.invoiceType }}</span>
                    </td>
                    <td class="px-4 py-3 font-mono text-slate-600">{{ doc.issueDate }}</td>
                    <td class="px-4 py-3 font-medium text-slate-800 truncate max-w-xs" [title]="doc.customerName || ''">
                      {{ doc.customerName || '—' }}
                    </td>
                    <td class="px-4 py-3 font-mono text-slate-600">{{ doc.customerAfm || '—' }}</td>
                    <td class="px-4 py-3 text-right font-mono font-bold text-slate-900">
                      {{ (doc.totalGross || 0) | currency: 'EUR' }}
                    </td>
                    <td class="px-4 py-3 text-center font-mono text-[11px] text-slate-700">
                      {{ doc.mark || '—' }}
                    </td>
                    <td class="px-4 py-3 text-center">
                      @if (isDocCancelled(doc)) {
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          Ακυρωμένο
                        </span>
                      } @else if (isDocActiveTransmitted(doc)) {
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Διαβιβάστηκε
                        </span>
                      } @else if (doc.transmissionStatus === 'FAILED') {
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
                          Αποτυχία
                        </span>
                      } @else {
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          Πρόχειρο
                        </span>
                      }
                      @if (isDocArchived(doc)) {
                        <span class="block mt-1 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                          [Αρχειοθετημένο]
                        </span>
                      }
                    </td>
                    <td class="px-4 py-3 text-center">
                      <div class="flex items-center justify-center gap-1.5">
                        
                        <!-- 1. View / Print -->
                        <button
                          type="button"
                          (click)="onViewDocument(doc)"
                          class="text-indigo-600 hover:text-indigo-900 p-1.5 rounded hover:bg-indigo-50 transition cursor-pointer"
                          title="Προβολή"
                        >
                          👁️
                        </button>

                        <!-- 2. Cancel on myDATA (Only if Active & NOT Cancelled) -->
                        @if (isDocActiveTransmitted(doc)) {
                          <button
                            type="button"
                            (click)="onCancelDocument(doc)"
                            class="text-rose-600 hover:text-rose-900 p-1.5 rounded hover:bg-rose-50 transition cursor-pointer"
                            title="Ακύρωση στο myDATA"
                          >
                            🚫
                          </button>
                        }

                        <!-- 3. Archive / Restore Toggle (For Cancelled Docs) -->
                        @if (isDocCancelled(doc)) {
                          <button
                            type="button"
                            (click)="onToggleArchive(doc)"
                            class="text-slate-600 hover:text-indigo-600 p-1.5 rounded hover:bg-indigo-50 transition cursor-pointer text-xs font-semibold"
                            [title]="isDocArchived(doc) ? 'Επαναφορά από το αρχείο' : 'Αρχειοθέτηση (Απόκρυψη από ενεργά)'"
                          >
                            {{ isDocArchived(doc) ? '📤' : '📦' }}
                          </button>
                        }

                        <!-- 4. Hard Delete from Dexie (For Cancelled OR Draft/Failed) -->
                        @if (isDocCancelled(doc) || isDocDraftOrFailed(doc)) {
                          <button
                            type="button"
                            (click)="onHardDeleteDraft(doc)"
                            class="text-slate-400 hover:text-rose-700 p-1.5 rounded hover:bg-rose-50 transition cursor-pointer"
                            title="Οριστική διαγραφή από τη βάση"
                          >
                            ❌
                          </button>
                        }

                      </div>
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
  private readonly router = inject(Router);
  private readonly myDataService = inject(MyDataService);

  public readonly isPurging = signal<boolean>(false);
  public readonly showArchived = signal<boolean>(false);
  public readonly movementDocs = signal<LocalInvoiceRecord[]>([]);

  public readonly visibleMovementDocs = computed(() => {
    const docs = this.movementDocs();
    const showAll = this.showArchived();
    if (showAll) return docs;
    return docs.filter((d) => !d.isArchived);
  });

  public readonly activeCount = computed(() => {
    return this.movementDocs().filter((d) => !d.isArchived).length;
  });

  public readonly archivedCount = computed(() => {
    return this.movementDocs().filter((d) => Boolean(d.isArchived)).length;
  });

  async ngOnInit(): Promise<void> {
    await this.loadMovementDocs();
  }

  public toggleArchiveVisibility(): void {
    this.showArchived.update((prev) => !prev);
  }

  public isDocArchived(doc: LocalInvoiceRecord): boolean {
    return Boolean(doc.isArchived);
  }

  public isDocCancelled(doc: LocalInvoiceRecord): boolean {
    const s = String(doc.transmissionStatus || (doc as any).status || '').toUpperCase();
    return s === 'CANCELLED' || Boolean(doc.cancellationMark) || Boolean((doc as any).cancellationMark);
  }

  public isDocActiveTransmitted(doc: LocalInvoiceRecord): boolean {
    const s = String(doc.transmissionStatus || (doc as any).status || '').toUpperCase();
    return s === 'TRANSMITTED' && Boolean(doc.mark) && !this.isDocCancelled(doc);
  }

  public isDocDraftOrFailed(doc: LocalInvoiceRecord): boolean {
    const s = String(doc.transmissionStatus || (doc as any).status || '').toUpperCase();
    return s === 'DRAFT' || s === 'FAILED' || (!doc.mark && !this.isDocCancelled(doc));
  }

  public async loadMovementDocs(): Promise<void> {
    const currentTenantId = this.auth.currentTenantId();
    const all: LocalInvoiceRecord[] = await this.db.getAllInvoices(currentTenantId);

    const filtered = all.filter((i: LocalInvoiceRecord) => {
      if (i.invoiceType === '9.3' || i.invoiceType === '1.2' || i.invoiceType === '9.1') return true;
      if (i.invoiceType === '1.1') {
        try {
          const payload = JSON.parse(i.payloadJson || '{}');
          return Boolean(payload.movement?.vehicleNumber || payload.movement?.addressTo?.street);
        } catch {
          return false;
        }
      }
      return false;
    });

    this.movementDocs.set(filtered);
  }

  public async onToggleArchive(doc: LocalInvoiceRecord): Promise<void> {
    const nextArchivedState = !doc.isArchived;

    try {
      const tenantId = doc.tenantId || this.auth.currentTenantId() || 'tenant_minimarket';
      doc.isArchived = nextArchivedState;
      doc.updatedAt = Date.now();

      await (this.db as any).invoices
        .where('[tenantId+id]')
        .equals([tenantId, doc.id])
        .modify({
          isArchived: nextArchivedState,
          updatedAt: Date.now()
        });

      await this.loadMovementDocs();
    } catch (err) {
      console.error('Failed to toggle archive:', err);
      try {
        await (this.db as any).invoices.put(doc);
        await this.loadMovementDocs();
      } catch (e) {
        alert('Σφάλμα κατά την αρχειοθέτηση.');
      }
    }
  }

  public onViewDocument(doc: LocalInvoiceRecord): void {
    if (doc.transmissionStatus === 'DRAFT' || doc.transmissionStatus === 'FAILED') {
      this.router.navigate(['/invoices/new'], {
        queryParams: { editId: doc.id, type: doc.invoiceType }
      });
      return;
    }

    this.router.navigate(['/invoices/print', doc.id], {
      queryParams: { tenantId: doc.tenantId }
    });
  }

  public async onPurgeTestDrafts(): Promise<void> {
    const confirmed = confirm(
      'Προσοχή: Πρόκειται να διαγραφούν όλα τα μη διαβιβασθέντα πρόχειρα και οι αποτυχημένες δοκιμές (DRAFT & FAILED) χωρίς ΜΑΡΚ.\n\nΤα επίσημα παραστατικά myDATA δεν θα επηρεαστούν. Συνέχεια;'
    );

    if (!confirmed) return;

    this.isPurging.set(true);
    try {
      const tenantId = this.auth.currentTenantId() || 'tenant_minimarket';
      const deletedCount = await this.db.purgeDraftAndFailedInvoices(tenantId, {
        seriesFilter: ['DEV', 'TES', 'A']
      });

      alert(`Εκκαθάριση ολοκληρώθηκε: Διαγράφηκαν ${deletedCount} δοκιμαστικά αρχεία.`);
      await this.loadMovementDocs();
    } catch (err) {
      console.error('Purge error:', err);
      alert('Σφάλμα κατά την εκκαθάριση της βάσης δεδομένων.');
    } finally {
      this.isPurging.set(false);
    }
  }

  public async onCancelDocument(doc: LocalInvoiceRecord): Promise<void> {
    if (!doc.mark) {
      alert('Το παραστατικό δεν διαθέτει myDATA MARK.');
      return;
    }

    const docRef = `${doc.series}-${doc.documentNumber}`;
    const confirmed = confirm(`Είστε βέβαιοι για την οριστική ακύρωση του ${docRef} (MARK:${doc.mark}) στην ΑΑΔΕ;`);
    if (!confirmed) return;

    try {
      const tenantId = doc.tenantId || this.auth.currentTenantId() || 'tenant_minimarket';
      
      let tenant: any = await (this.db as any).tenants?.get(tenantId);
      if (!tenant && typeof (this.auth as any).currentTenant === 'function') {
        tenant = (this.auth as any).currentTenant();
      }

      if (!tenant) {
        alert(`Δεν βρέθηκαν στοιχεία επιχείρησης για Tenant: ${tenantId}`); return; }  const res = await this.myDataService.cancelInvoice(doc.mark, tenant);  if (res.success && res.cancellationMark) { doc.transmissionStatus = 'CANCELLED'; doc.cancellationMark = res.cancellationMark; doc.updatedAt = Date.now();  await (this.db as any).invoices .where('[tenantId+id]') .equals([tenantId, doc.id]) .modify({ transmissionStatus: 'CANCELLED', cancelMark: res.cancellationMark, updatedAt: Date.now() });  alert(`✅ Επιτυχής Ακύρωση myDATA!\nCancellation MARK: ${res.cancellationMark}`);
        await this.loadMovementDocs();
      } else {
        const errorMsg = res.errors?.join('\n') || 'Η ακύρωση απορρίφθηκε από το myDATA.';
        alert(`❌ Αποτυχία Ακύρωσης myDATA:\n${errorMsg}`); } } catch (err: any) { console.error('Cancellation error:', err); alert(`Σφάλμα κατά την ακύρωση: ${err?.message || err}`);
    }
  }

  public async onHardDeleteDraft(doc: LocalInvoiceRecord): Promise<void> {
    if (!doc.id) {
      console.error('Cannot delete document without ID:', doc);
      return;
    }

    if (this.isDocActiveTransmitted(doc)) {
      alert('Δεν επιτρέπεται απευθείας διαγραφή ενεργού παραστατικού myDATA. Ακυρώστε το πρώτα.');
      return;
    }

    if (this.isDocCancelled(doc)) {
      const confirmWipe = confirm(
        `Το παραστατικό ${doc.series}-${doc.documentNumber} έχει ήδη ακυρωθεί στην ΑΑΔΕ.\n\n` +
        `Θέλετε να διαγραφεί οριστικά και από την τοπική συσκευή;`
      );
      if (!confirmWipe) return;
    }

    try {
      const tenantId = doc.tenantId || this.auth.currentTenantId() || 'tenant_minimarket';

      try {
        await (this.db as any).invoices.delete([tenantId, doc.id]);
      } catch {
        await (this.db as any).invoices.delete(doc.id);
      }

      console.log(`🔥 [Hard Delete] Purged doc ${doc.series}-${doc.documentNumber} (ID: ${doc.id})`);
      await this.loadMovementDocs();
    } catch (err) {
      console.error('Failed to hard delete from Dexie:', err);
      alert('Σφάλμα διαγραφής από τη βάση δεδομένων.');
    }
  }

  public createNewMovementDoc(): void {
    this.router.navigate(['/invoices/new'], { queryParams: { type: '9.3' } });
  }
}
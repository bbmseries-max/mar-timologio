import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
} from '@angular/core';
import { CartBridgeService } from '@core/services/cart-bridge.service';
import { HandoverCartPayload, HandoverCartItem } from '@core/models/cart-handover.models';
import { ProductImportModalComponent } from '../../catalog/product-import-modal.component';
import { AuthTenantService } from '@core/services/auth-tenant.service';
import { GsisLookupService } from '@core/services/gsis-lookup.service';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  VatRateCategory,
  InvoiceLineItem,
  GoodsMovementData,
  MovementPurposeCode,
} from '@core/models/aade.models';
import { calculateLineValues, calculateInvoiceTotals, isValidGreekAfm } from '@core/utils/fiscal-engine';
import { AadeSerializerService } from '@core/services/aade-serializer.service';
import { LocalDbService } from '@core/services/local-db.service';
import { LocalInvoiceRecord, Product } from '@core/models/database.models';
import { InvoicePrintComponent, PrintableInvoiceData } from '../invoice-print/invoice-print.component';

@Component({
  selector: 'maranth-invoice-builder',
  standalone: true,
  imports: [CommonModule, 
    ReactiveFormsModule, 
    InvoicePrintComponent,
  ProductImportModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 no-print ">
      
    <!-- Top Action Bar -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5 gap-4">
        <div>
          <div class="flex items-center gap-2.5 flex-wrap">
            <h1 class="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Νέο Παραστατικό</h1>
            <span class="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg font-mono font-medium bg-slate-100 text-slate-600 border border-slate-200">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              {{ autoSaveStatus() }}
            </span>
            @if (isMovementDocument()) {
              <span class="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg font-semibold bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                AADE Phase B: Ψηφιακή Διακίνηση
              </span>
            }
          </div>
          <p class="text-xs text-slate-500 mt-1">Maranth B2B Timologio &bull; AADE myDATA Gateway</p>
        </div>

        <!-- Unified Action Buttons -->
        <div class="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          <!-- Reset -->
          <button
            type="button"
            (click)="onResetForm()"
            class="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition active:scale-98"
          >
            <span class="text-slate-400">↺</span>
            <span>Καθαρισμός</span>
          </button>

          <!-- Save Draft -->
          <button
            type="button"
            (click)="onSaveDraftManually()"
            class="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-semibold text-slate-700 hover:text-indigo-600 bg-white hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-200 shadow-2xs transition active:scale-98"
          >
            <span class="text-slate-400">💾</span>
            <span>Αποθήκευση</span>
          </button>

          <!-- Primary: Issue & Print -->
          <button
            type="button"
            (click)="onOpenPreview()"
            [disabled]="invoiceForm.invalid || !auth.canIssueInvoices()"
            class="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-sm shadow-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-98"
          >
            <span>📄</span>
            <span>Εκτύπωση</span>
          </button>
        </div>
      </div>

      <form [formGroup]="invoiceForm" class="space-y-6">
        <!-- Recipient & Document Info -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs md:col-span-2 space-y-4">
            <h2 class="text-sm font-semibold uppercase tracking-wider text-slate-700">Στοιχεία Πελάτη / Λήπτη</h2>
            <div formGroupName="customer" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Α.Φ.Μ.</label>
                <div class="flex rounded-md shadow-2xs">
                  <input
                    type="text"
                    formControlName="afm"
                    placeholder="9 ψηφία"
                    class="block w-full rounded-l-md border-slate-300 text-sm px-3 py-2 border focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  
                  <button
                   type="button"
                   (click)="triggerGsisLookup()"
                   [disabled]="gsisLoading()"
                   class="inline-flex items-center px-3 rounded-r-md border border-l-0 border-slate-300 bg-slate-50 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition"
                   >
                @if (gsisLoading()) {
                   <span class="inline-block animate-spin mr-1">⌛</span>
                }
                GSIS
                  </button>

                </div>
                @if (afmInvalid) {
                  <span class="text-xs text-rose-600 mt-1 block">Μη έγκυρο Α.Φ.Μ. (Modulo 11)</span>
                }
              </div>

              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Επωνυμία</label>
                <input
                  type="text"
                  formControlName="legalName"
                  class="w-full rounded-md border-slate-300 text-sm px-3 py-2 border focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Δ.Ο.Υ.</label>
                <input
                  type="text"
                  formControlName="doy"
                  class="w-full rounded-md border-slate-300 text-sm px-3 py-2 border"
                />
              </div>

              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Email</label>
                <input
                  type="email"
                  formControlName="email"
                  class="w-full rounded-md border-slate-300 text-sm px-3 py-2 border"
                />
              </div>
            </div>
          </div>

          <!-- Document Series & Type -->
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <h2 class="text-sm font-semibold uppercase tracking-wider text-slate-700">Στοιχεία Σειράς</h2>
            <div class="space-y-3">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Τύπος Παραστατικού</label>
                <select formControlName="invoiceType" class="w-full rounded-md border-slate-300 text-sm px-3 py-2 border font-medium">
                  <option value="1.1">1.1 Τιμολόγιο Πώλησης</option>
                  <option value="1.2">1.2 Τιμολόγιο Πώλησης / Δελτίο Αποστολής (Ex-Van)</option>
                  <option value="2.1">2.1 Τιμολόγιο Παροχής Υπηρεσιών</option>
                  <option value="9.1">9.1 Δελτίο Αποστολής (Διακίνηση Αγαθών)</option>
                  <option value="5.1">5.1 Πιστωτικό Τιμολόγιο</option>
                  <option value="PROFORMA">Προσφορά / Προτιμολόγιο</option>
                </select>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium text-slate-600 mb-1">Σειρά</label>
                  <input type="text" formControlName="series" class="w-full rounded-md border-slate-300 text-sm px-3 py-2 border uppercase" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-600 mb-1">Αριθμός</label>
                  <input type="number" formControlName="documentNumber" class="w-full rounded-md border-slate-300 text-sm px-3 py-2 border" />
                </div>
              </div>

              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Ημερομηνία</label>
                <input type="date" formControlName="issueDate" class="w-full rounded-md border-slate-300 text-sm px-3 py-2 border" />
              </div>
            </div>
          </div>
        </div>

        <!-- MUSCLE 4: DIGITAL GOODS MOVEMENT PANEL (Rendered for 1.2 and 9.1) -->
        @if (isMovementDocument()) {
          <div formGroupName="movement" class="bg-amber-50/70 border border-amber-300 rounded-xl p-5 shadow-2xs space-y-4">
            <div class="flex items-center justify-between border-b border-amber-200 pb-3">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <h3 class="text-sm font-bold uppercase tracking-wider text-amber-900">
                  Στοιχεία Διακίνησης Αγαθών (AADE Ψηφιακό Δελτίο Αποστολής)
                </h3>
              </div>
              <span class="text-[11px] font-mono font-medium text-amber-800">Υποχρεωτικό για διαδρομές van & φορτηγών</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">Αρ. Κυκλοφορίας Οχήματος</label>
                <input
                  type="text"
                  formControlName="vehicleNumber"
                  placeholder="π.χ. IEB-4892"
                  class="w-full rounded-md border-slate-300 text-sm px-3 py-2 border uppercase font-mono font-bold bg-white"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">Σκοπός Διακίνησης</label>
                <select formControlName="movePurpose" class="w-full rounded-md border-slate-300 text-sm px-3 py-2 border bg-white">
                  <option [value]="1">1 - Πώληση</option>
                  <option [value]="2">2 - Διακίνηση μεταξύ εγκαταστάσεων</option>
                  <option [value]="3">3 - Αποθήκευση σε τρίτους</option>
                  <option [value]="4">4 - Επεξεργασία / Συναρμολόγηση</option>
                  <option [value]="5">5 - Δειγματισμός / Έκθεση</option>
                  <option [value]="6">6 - Επιστροφή</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">Ημ/νία & Ώρα Έναρξης Διακίνησης</label>
                <input
                  type="datetime-local"
                  formControlName="dispatchDateTime"
                  class="w-full rounded-md border-slate-300 text-sm px-3 py-2 border bg-white font-mono"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <!-- Dispatch Location -->
              <div formGroupName="addressFrom" class="p-3 bg-white/80 rounded-lg border border-amber-200">
                <span class="block text-[10px] font-bold uppercase text-slate-500 mb-2">Τόπος Έναρξης (Φόρτωση / Έδρα)</span>
                <div class="grid grid-cols-3 gap-2">
                  <input type="text" formControlName="street" placeholder="Οδός" class="col-span-2 text-xs border rounded p-1.5" />
                  <input type="text" formControlName="number" placeholder="Αριθμός" class="text-xs border rounded p-1.5" />
                  <input type="text" formControlName="postalCode" placeholder="Τ.Κ." class="text-xs border rounded p-1.5" />
                  <input type="text" formControlName="city" placeholder="Πόλη" class="col-span-2 text-xs border rounded p-1.5" />
                </div>
              </div>

              <!-- Delivery Location -->
              <div formGroupName="addressTo" class="p-3 bg-white/80 rounded-lg border border-amber-200">
                <span class="block text-[10px] font-bold uppercase text-slate-500 mb-2">Τόπος Προορισμού (Παράδοση)</span>
                <div class="grid grid-cols-3 gap-2">
                  <input type="text" formControlName="street" placeholder="Οδός" class="col-span-2 text-xs border rounded p-1.5" />
                  <input type="text" formControlName="number" placeholder="Αριθμός" class="text-xs border rounded p-1.5" />
                  <input type="text" formControlName="postalCode" placeholder="Τ.Κ." class="text-xs border rounded p-1.5" />
                  <input type="text" formControlName="city" placeholder="Πόλη" class="col-span-2 text-xs border rounded p-1.5" />
                </div>
              </div>
            </div>
          </div>
        }

        <button
        type="button"
        (click)="showImportModal.set(true)"
        class="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
        >
        <span>📁</span>
        <span>Εισαγωγή Τιμοκαταλόγου (Excel/CSV)</span>
        </button>

        <!-- Catalog Search & Quick Picker Bar -->
<div class="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-3">
  <div class="flex items-center justify-between">
    <label class="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
      <span>🔍</span>
      <span>Αναζήτηση Προϊόντος / Σάρωση Barcode</span>
    </label>
  </div>
  <div class="relative">
    <input
      type="text"
      [value]="searchQuery()"
      (input)="onSearchChange($any($event.target).value)"
      (keydown.enter)="onBarcodeEnter(); $event.preventDefault()"
      placeholder="Πληκτρολογήστε όνομα ή σκανάρετε barcode και πατήστε Enter..."
      class="w-full text-xs rounded-xl border-slate-200 px-3.5 py-2.5 border bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition font-medium"
    />

    <!-- Dropdown Results Box -->
    @if (searchResults().length > 0) {
      <div class="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-60 overflow-y-auto divide-y divide-slate-100">
        @for (item of searchResults(); track item.id) {
          <button
            type="button"
            (click)="addProductToInvoice(item)"
            class="w-full px-4 py-2.5 text-left text-xs hover:bg-blue-50/60 transition flex items-center justify-between group"
          >
            <div>
              <p class="font-bold text-slate-800 group-hover:text-blue-700">{{ item.name }}</p>
              @if (item.barcode) {
                <p class="text-[10px] text-slate-400 font-mono">Barcode: {{ item.barcode }}</p>
              }
            </div>
            <div class="text-right">
              <span class="font-mono font-bold text-slate-900 block">{{ item.price | number:'1.2-2' }} €</span>
              <span class="text-[10px] text-slate-500">ΦΠΑ {{ item.taxRate || 24 }}%</span>
            </div>
          </button>
        }
      </div>
    }
  </div>
</div>

        <!-- Line Items -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div class="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <h2 class="text-sm font-semibold uppercase tracking-wider text-slate-700">Γραμμές Ειδών / Υπηρεσιών</h2>
            <button
              type="button"
              (click)="addLineItem()"
              class="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md text-xs font-semibold transition"
            >
              + Προσθήκη Γραμμής
            </button>
          </div>

          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead class="bg-slate-50 text-xs font-medium text-slate-500 uppercase">
                <tr>
                  <th class="px-4 py-3">Περιγραφή</th>
                  <th class="px-3 py-3 w-24">Ποσότητα</th>
                  <th class="px-3 py-3 w-28">Τιμή (€)</th>
                  <th class="px-3 py-3 w-20">Έκπτ. %</th>
                  <th class="px-3 py-3 w-28">Καθαρή</th>
                  <th class="px-3 py-3 w-28">ΦΠΑ</th>
                  <th class="px-3 py-3 w-28">Σύνολο</th>
                  <th class="px-2 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody formArrayName="lines" class="divide-y divide-slate-100">
                @for (line of linesArray.controls; track $index) {
                  <tr [formGroupName]="$index" class="hover:bg-slate-50/50">
                    <td class="p-3">
                      <input type="text" formControlName="description" placeholder="Είδος ή υπηρεσία" class="w-full text-sm border-slate-200 rounded px-2 py-1 border" />
                    </td>
                    <td class="p-3">
                      <input type="number" formControlName="quantity" (input)="recalculateLine($index)" class="w-full text-sm border-slate-200 rounded px-2 py-1 border" />
                    </td>
                    <td class="p-3">
                      <input type="number" step="0.01" formControlName="unitPrice" (input)="recalculateLine($index)" class="w-full text-sm border-slate-200 rounded px-2 py-1 border" />
                    </td>
                    <td class="p-3">
                      <input type="number" formControlName="discountPercentage" (input)="recalculateLine($index)" class="w-full text-sm border-slate-200 rounded px-2 py-1 border" />
                    </td>
                    <td class="p-3 font-mono text-slate-700">
                      {{ line.get('netValue')?.value | number: '1.2-2' }}
                    </td>
                    <td class="p-3">
                      <select formControlName="vatRateCategory" (change)="recalculateLine($index)" class="w-full text-xs border-slate-200 rounded px-1 py-1 border">
                        <option [value]="1">24%</option>
                        <option [value]="2">13%</option>
                        <option [value]="3">6%</option>
                        <option [value]="7">0%</option>
                      </select>
                    </td>
                    <td class="p-3 font-mono font-medium text-slate-900">
                      {{ line.get('totalValue')?.value | number: '1.2-2' }}
                    </td>
                    <td class="p-3 text-center">
                      <button type="button" (click)="removeLineItem($index)" class="text-rose-500 hover:text-rose-700 font-bold">×</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="flex justify-end">
          <div class="w-full md:w-80 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div class="flex justify-between text-sm text-slate-600">
              <span>Καθαρή Αξία:</span>
              <span class="font-mono font-medium">{{ computedTotals().totalNetValue | currency: 'EUR' }}</span>
            </div>
            <div class="flex justify-between text-sm text-slate-600">
              <span>Φ.Π.Α.:</span>
              <span class="font-mono font-medium">{{ computedTotals().totalVatAmount | currency: 'EUR' }}</span>
            </div>
            <div class="border-t border-slate-200 pt-3 flex justify-between text-base font-bold text-slate-900">
              <span>Σύνολο:</span>
              <span class="font-mono text-indigo-600">{{ computedTotals().totalGrossValue | currency: 'EUR' }}</span>
            </div>
          </div>
        </div>
      </form>

      <!-- PRINT PREVIEW MODAL -->
      @if (showPrintModal() && printableData()) {
        <maranth-invoice-print
          [invoice]="printableData()!"
          (close)="showPrintModal.set(false)"
        ></maranth-invoice-print>
      }
    </div>
    @if (printableData()) {
  <maranth-invoice-print 
    [invoice]="printableData()!" 
    (close)="printableData.set(null)">
  </maranth-invoice-print>
}
@if (showImportModal()) {
  <maranth-product-import-modal
    (close)="showImportModal.set(false)"
    (imported)="autoSaveStatus.set('Εισήχθησαν ' + $event + ' προϊόντα!')"
  ></maranth-product-import-modal>
}
  `,
})
export class InvoiceBuilderComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly serializer = inject(AadeSerializerService);
  private readonly db = inject(LocalDbService);

  private readonly auth = inject(AuthTenantService);

  private readonly gsisService = inject(GsisLookupService);
  public readonly gsisLoading = signal<boolean>(false);
  public readonly gsisError = signal<string | null>(null);

  public readonly currentDraftId = signal<string>(crypto.randomUUID());
  public readonly autoSaveStatus = signal<string>('Έτοιμο');

  public readonly showImportModal = signal<boolean>(false);

  private readonly cartBridge = inject(CartBridgeService);
  public readonly lineItemsSignal = signal<InvoiceLineItem[]>([]);
  public readonly searchQuery = signal<string>('');
  public readonly searchResults = signal<Product[]>([]);
  public readonly isSearching = signal<boolean>(false);
  public readonly computedTotals = computed(() => calculateInvoiceTotals(this.lineItemsSignal()));

  public readonly isMovementDocument = signal<boolean>(false);

  public readonly showPrintModal = signal<boolean>(false);
  public readonly printableData = signal<PrintableInvoiceData | null>(null);

  public async onSearchChange(term: string): Promise<void> {
  this.searchQuery.set(term);
  const clean = term.trim();
  if (clean.length < 2) {
    this.searchResults.set([]);
    return;
  }

  this.isSearching.set(true);
  const tenantId = this.auth.currentTenantId() || 'tenant_minimarket';
  const matches = await this.db.searchProductsForTenant(tenantId, clean);
  this.searchResults.set(matches);
  this.isSearching.set(false);
}

public addProductToInvoice(product: Product): void {
  // Map Greek taxRate (e.g., 24, 13, 6, 0) to AADE VAT Category (1=24%, 2=13%, 3=6%, 7=0%)
  let vatCategory = 1;
  if (product.taxRate === 13) vatCategory = 2;
  else if (product.taxRate === 6) vatCategory = 3;
  else if (product.taxRate === 0) vatCategory = 7;

  const unitPrice = Number(product.price || 0);
  const quantity = 1;
  const netValue = unitPrice * quantity;
  const vatRate = product.taxRate ?? 24;
  const vatAmount = Number((netValue * (vatRate / 100)).toFixed(2));
  const totalValue = Number((netValue + vatAmount).toFixed(2));

  this.linesArray.push(
    this.fb.group({
      description: [product.name, Validators.required],
      quantity: [quantity, [Validators.required, Validators.min(0.01)]],
      unitPrice: [unitPrice, [Validators.required, Validators.min(0)]],
      discountPercentage: [0],
      netValue: [{ value: netValue, disabled: true }],
      vatRateCategory: [vatCategory],
      vatAmount: [{ value: vatAmount, disabled: true }],
      totalValue: [{ value: totalValue, disabled: true }],
    })
  );

  this.syncLines();
  this.searchQuery.set('');
  this.searchResults.set([]);
}

public async onBarcodeEnter(): Promise<void> {
  const code = this.searchQuery().trim();
  if (!code) return;

  const tenantId = this.auth.currentTenantId() || 'tenant_minimarket';
  const exact = await this.db.searchProductsForTenant(tenantId, code);
  const match = exact.find((p) => p.barcode === code) || exact[0];

  if (match) {
    this.addProductToInvoice(match);
  }
}
  
  public readonly invoiceForm = this.fb.group({
    series: ['VAN-1', Validators.required],
    documentNumber: [101, [Validators.required, Validators.min(1)]],
    issueDate: [new Date().toISOString().substring(0, 10), Validators.required],
    invoiceType: ['1.2', Validators.required], // Default to Ex-Van
    customer: this.fb.group({
      afm: ['094123456', [Validators.required, (c: any) => (isValidGreekAfm(c.value) ? null : { invalidAfm: true })]],
      legalName: ['ΠΑΠΑΔΟΠΟΥΛΟΣ Α.Ε.Β.Ε.', Validators.required],
      doy: ['ΦΑΕ ΑΘΗΝΩΝ', Validators.required],
      email: ['contact@papadopoulos.gr', [Validators.required, Validators.email]],
    }),
    movement: this.fb.group({
      vehicleNumber: ['IEB-4892', Validators.required],
      movePurpose: [1, Validators.required],
      dispatchDateTime: [new Date().toISOString().substring(0, 16), Validators.required],
      addressFrom: this.fb.group({
        street: ['Λεωφ. Κηφισίας', Validators.required],
        number: ['200', Validators.required],
        postalCode: ['15231', Validators.required],
        city: ['Χαλάνδρι', Validators.required],
      }),
      addressTo: this.fb.group({
        street: ['Ερμού', Validators.required],
        number: ['15', Validators.required],
        postalCode: ['10563', Validators.required],
        city: ['Αθήνα', Validators.required],
      }),
    }),
    lines: this.fb.array([]),
  });

  get linesArray(): FormArray {
    return this.invoiceForm.get('lines') as FormArray;
  }

  get afmInvalid(): boolean {
    const ctrl = this.invoiceForm.get('customer.afm');
    return !!(ctrl?.touched && ctrl?.errors?.['invalidAfm']);
  }

  async ngOnInit(): Promise<void> {
    this.cartBridge.cart$.subscribe((payload) => {
    this.applyHandoverCart(payload);
  });

  // Check if page was opened with a URL deep link
  this.cartBridge.checkUrlPayload();
    this.updateMovementDocState(this.invoiceForm.get('invoiceType')?.value);

    // Watch invoiceType changes to toggle movement validator requirements
    this.invoiceForm.get('invoiceType')?.valueChanges.subscribe((type) => {
      this.updateMovementDocState(type);
    });

    const currentTenantId = this.auth.currentTenantId() || 'tenant_minimarket';
    const draft = await this.db.getLatestDraftForTenant(currentTenantId);

    if (draft) {
      try {
        const payload = JSON.parse(draft.payloadJson);
        this.currentDraftId.set(draft.id);
        this.invoiceForm.patchValue(payload);

        this.linesArray.clear();
        if (Array.isArray(payload.lines)) {
          for (const l of payload.lines) {
            this.linesArray.push(
              this.fb.group({
                description: [l.description, Validators.required],
                quantity: [l.quantity, [Validators.required, Validators.min(0.01)]],
                unitPrice: [l.unitPrice, [Validators.required, Validators.min(0)]],
                discountPercentage: [l.discountPercentage || 0],
                netValue: [{ value: l.netValue, disabled: true }],
                vatRateCategory: [l.vatRateCategory || 1],
                vatAmount: [{ value: l.vatAmount, disabled: true }],
                totalValue: [{ value: l.totalValue, disabled: true }],
              })
            );
          }
        }
        this.syncLines();
        this.autoSaveStatus.set('Ανακτήθηκε προσωρινό');
      } catch {
        this.seedInitialLine();
      }
    } else {
      this.seedInitialLine();
    }

    this.invoiceForm.valueChanges.subscribe(() => {
      this.autoSaveStatus.set('Αποθήκευση...');
      this.debouncedSave();
    });
  }

  public applyHandoverCart(payload: HandoverCartPayload): void {
    if (!payload.items || payload.items.length === 0) return;

    // Optional customer autofill
    if (payload.customer) {
  const c = payload.customer;
  this.invoiceForm.get('customer')?.patchValue({
    afm: c.afm ?? null,
    legalName: c.legalName ?? null,
    doy: c.doy ?? null,
    email: c.email ?? null,
  });
}

    if (payload.invoiceType) {
      this.invoiceForm.get('invoiceType')?.setValue(payload.invoiceType);
    }

    // Clear initial empty dummy row if only 1 blank row exists
    if (this.linesArray.length === 1 && !this.linesArray.at(0).get('description')?.value) {
      this.linesArray.clear();
    }

    // Ingest all cart items
    for (const item of payload.items) {
      const vatRate = item.vatRate ?? 24;
      let unitPrice = Number(item.unitPrice || 0);

      // If price was sent as Gross (retail POS), extract net
      if (item.isGross) {
        unitPrice = Number((unitPrice / (1 + vatRate / 100)).toFixed(4));
      }

      const qty = Number(item.quantity) || 1;
      const discount = Number(item.discountPercentage) || 0;
      const netValue = Number(((unitPrice * qty) * (1 - discount / 100)).toFixed(2));
      const vatAmount = Number((netValue * (vatRate / 100)).toFixed(2));
      const totalValue = Number((netValue + vatAmount).toFixed(2));

      let vatCategory = 1;
      if (vatRate === 13) vatCategory = 2;
      else if (vatRate === 6) vatCategory = 3;
      else if (vatRate === 0) vatCategory = 7;

      this.linesArray.push(
        this.fb.group({
          description: [item.name, Validators.required],
          quantity: [qty, [Validators.required, Validators.min(0.01)]],
          unitPrice: [unitPrice, [Validators.required, Validators.min(0)]],
          discountPercentage: [discount],
          netValue: [{ value: netValue, disabled: true }],
          vatRateCategory: [vatCategory],
          vatAmount: [{ value: vatAmount, disabled: true }],
          totalValue: [{ value: totalValue, disabled: true }],
        })
      );
    }

    this.syncLines();
    const source = payload.sourceSystem ? ` από ${payload.sourceSystem}` : '';
    this.autoSaveStatus.set(`Ελήφθησαν ${payload.items.length} είδη${source}`);
  }

  private updateMovementDocState(type: string | null | undefined): void {
    const isMov = type === '1.2' || type === '9.1';
    this.isMovementDocument.set(isMov);
    const movementCtrl = this.invoiceForm.get('movement');
    if (isMov) {
      movementCtrl?.enable();
    } else {
      movementCtrl?.disable();
    }
  }

  private seedInitialLine(): void {
    this.linesArray.clear();
    this.addLineItem();
  }

  private saveTimeout?: any;
  private debouncedSave(): void {
    clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(async () => {
      await this.persistDraft();
      this.autoSaveStatus.set('Αποθηκεύτηκε τοπικά');
    }, 800);
  }

  public async onSaveDraftManually(): Promise<void> {
    await this.persistDraft();
    this.autoSaveStatus.set('Αποθηκεύτηκε επιτυχώς!');
  }

  private async persistDraft(): Promise<void> {
    const formVal = this.invoiceForm.getRawValue();
    const totals = this.computedTotals();
    const tenantId = this.auth.currentTenantId() || 'tenant_minimarket';

    const record: LocalInvoiceRecord = {
      id: this.currentDraftId() || crypto.randomUUID(),
      tenantId: tenantId, // Enforces strict tenant isolation
      series: formVal.series || 'A',
      documentNumber: Number(formVal.documentNumber) || 1,
      issueDate: formVal.issueDate || new Date().toISOString().substring(0, 10),
      invoiceType: formVal.invoiceType || '1.1',
      customerAfm: formVal.customer?.afm || '',
      customerName: formVal.customer?.legalName || '',
      totalNet: totals.totalNetValue,
      totalVat: totals.totalVatAmount,
      totalGross: totals.totalGrossValue,
      transmissionStatus: 'DRAFT',
      payloadJson: JSON.stringify({
        ...formVal,
        lines: this.lineItemsSignal(),
      }),
      updatedAt: Date.now(),
      createdAt: Date.now(),
    };

    await this.db.saveDraft(record);
  }

  public async onResetForm(): Promise<void> {
    await this.db.deleteInvoice(this.currentDraftId());
    this.currentDraftId.set(crypto.randomUUID());
    this.invoiceForm.reset({
      series: 'VAN-1',
      documentNumber: 101,
      issueDate: new Date().toISOString().substring(0, 10),
      invoiceType: '1.2',
      customer: {
        afm: '',
        legalName: '',
        doy: '',
        email: '',
      },
      movement: {
        vehicleNumber: 'IEB-4892',
        movePurpose: 1,
        dispatchDateTime: new Date().toISOString().substring(0, 16),
        addressFrom: { street: 'Λεωφ. Κηφισίας', number: '200', postalCode: '15231', city: 'Χαλάνδρι' },
        addressTo: { street: '', number: '', postalCode: '', city: '' },
      },
    });
    this.seedInitialLine();
    this.autoSaveStatus.set('Καθαρίστηκε');
  }

  public addLineItem(): void {
    const row = this.fb.group({
      description: ['Εμπορεύματα / Προϊόντα Διανομής Ex-Van', Validators.required],
      quantity: [10, [Validators.required, Validators.min(0.01)]],
      unitPrice: [15.5, [Validators.required, Validators.min(0)]],
      discountPercentage: [0],
      netValue: [{ value: 155, disabled: true }],
      vatRateCategory: [1],
      vatAmount: [{ value: 37.2, disabled: true }],
      totalValue: [{ value: 192.2, disabled: true }],
    });
    this.linesArray.push(row);
    this.syncLines();
  }

  public removeLineItem(index: number): void {
    if (this.linesArray.length > 1) {
      this.linesArray.removeAt(index);
      this.syncLines();
    }
  }

  public recalculateLine(index: number): void {
    const row = this.linesArray.at(index);
    const qty = Number(row.get('quantity')?.value || 0);
    const price = Number(row.get('unitPrice')?.value || 0);
    const discount = Number(row.get('discountPercentage')?.value || 0);
    const vatCat = Number(row.get('vatRateCategory')?.value || 1) as VatRateCategory;

    const calc = calculateLineValues(qty, price, discount, vatCat);
    row.patchValue({
      netValue: calc.netValue,
      vatAmount: calc.vatAmount,
      totalValue: calc.totalValue,
    });
    this.syncLines();
  }

  public triggerGsisLookup(): void {
  const afmControl = this.invoiceForm.get('customer.afm');
  const afm = (afmControl?.value || '').trim();

  if (!isValidGreekAfm(afm)) {
    this.gsisError.set('Παρακαλώ εισάγετε έγκυρο 9-ψήφιο Α.Φ.Μ.');
    afmControl?.markAsTouched();
    return;
  }

  this.gsisLoading.set(true);
  this.gsisError.set(null);

  this.gsisService.lookupAfm(afm).subscribe({
    next: (data) => {
      this.gsisLoading.set(false);
      if (!data.active) {
        alert('Προσοχή: Η επιχείρηση με αυτό το Α.Φ.Μ. εμφανίζεται ως ΑΝΕΝΕΡΓΗ / ΔΙΑΚΟΠΕΙΣΑ στο μητρώο!');
      }

      // Autofill Customer Profile
      this.invoiceForm.patchValue({
        customer: {
          legalName: data.legalName,
          doy: data.doyDescr,
        },
      });

      // If movement document (1.2 or 9.1), also autofill delivery address
      if (this.isMovementDocument()) {
        this.invoiceForm.patchValue({
          movement: {
            addressTo: {
              street: data.postalAddress,
              number: data.postalAddressNo,
              postalCode: data.postalZipCode,
              city: data.postalAreaDescription,
            },
          },
        });
      }
    },
    error: (err) => {
      this.gsisLoading.set(false);
      this.gsisError.set(err.message || 'Αποτυχία ανάκτησης στοιχείων από το μητρώο.');
    },
  });
}

  public onOpenPreview(): void {
    if (this.invoiceForm.invalid) return;

    const formVal = this.invoiceForm.getRawValue();
    const totals = this.computedTotals();
    const issuerAfm = '801234567';
    const demoMark = '40000' + Math.floor(1000000000 + Math.random() * 9000000000);
    const demoUid = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();

    const officialQrUrl = `https://www.aade.gr/mydata/verify?afm=${issuerAfm}&d=${formVal.issueDate}&mark=${demoMark}&g=${totals.totalGrossValue.toFixed(2)}`;

    const customerData = {
      id: crypto.randomUUID(),
      afm: formVal.customer.afm!,
      branch: 0,
      legalName: formVal.customer.legalName!,
      doy: formVal.customer.doy!,
      country: 'GR',
      email: formVal.customer.email!,
      address: {
        street: formVal.movement?.addressTo?.street || 'Ερμού',
        number: formVal.movement?.addressTo?.number || '15',
        postalCode: formVal.movement?.addressTo?.postalCode || '10563',
        city: formVal.movement?.addressTo?.city || 'Αθήνα',
      },
    };

    const movementData: GoodsMovementData | undefined = this.isMovementDocument()
      ? {
          vehicleNumber: formVal.movement?.vehicleNumber || '',
          movePurpose: (Number(formVal.movement?.movePurpose) || 1) as MovementPurposeCode,
          dispatchDateTime: formVal.movement?.dispatchDateTime || new Date().toISOString().substring(0, 16),
          addressFrom: {
            street: formVal.movement?.addressFrom?.street || '',
            number: formVal.movement?.addressFrom?.number || '',
            postalCode: formVal.movement?.addressFrom?.postalCode || '',
            city: formVal.movement?.addressFrom?.city || '',
          },
          addressTo: {
            street: formVal.movement?.addressTo?.street || '',
            number: formVal.movement?.addressTo?.number || '',
            postalCode: formVal.movement?.addressTo?.postalCode || '',
            city: formVal.movement?.addressTo?.city || '',
          },
        }
      : undefined;

    const xmlPayload = this.serializer.generateInvoicesDocXml({
      series: formVal.series!,
      documentNumber: Number(formVal.documentNumber),
      issueDate: formVal.issueDate!,
      invoiceType: formVal.invoiceType!,
      currency: 'EUR',
      issuer: { afm: issuerAfm, country: 'GR', branch: 0 },
      counterpart: customerData,
      lines: this.lineItemsSignal(),
      totals,
      paymentMethodType: 1,
      movement: movementData,
    });

    this.printableData.set({
      series: formVal.series!,
      documentNumber: Number(formVal.documentNumber),
      issueDate: formVal.issueDate!,
      invoiceType: formVal.invoiceType!,
      customer: customerData,
      lines: this.lineItemsSignal(),
      totals,
      mark: demoMark,
      uid: demoUid,
      qrUrl: officialQrUrl,
      xmlPayload,
      movement: movementData,
    });

    this.showPrintModal.set(true);
  }

  private syncLines(): void {
    const raw = this.linesArray.getRawValue() as any[];
    const items: InvoiceLineItem[] = raw.map((r, i) => {
      const netVal = Number(r.netValue) || 0;
      return {
        id: String(i + 1),
        lineNumber: i + 1,
        description: r.description || '',
        quantity: Number(r.quantity) || 1,
        unitPrice: Number(r.unitPrice) || 0,
        discountPercentage: Number(r.discountPercentage) || 0,
        netValue: netVal,
        vatRateCategory: (Number(r.vatRateCategory) || 1) as VatRateCategory,
        vatPercentage: Number(r.vatRateCategory) === 1 ? 24 : 0,
        vatAmount: Number(r.vatAmount) || 0,
        totalValue: Number(r.totalValue) || 0,
        unitMeasurement: '1',
        incomeClassification: {
          classificationType: 'E3_561_001',
          classificationCategory: 'category1_1',
          amount: netVal,
        },
      };
    });
    this.lineItemsSignal.set(items);
  }
}
import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { greekAfmValidator, isValidGreekAfm } from '@core/validators/afm.validator';
import { LocalCustomerRecord, LocalDbService } from '@core/services/local-db.service';
import { CartBridgeService } from '@core/services/cart-bridge.service';
import { ProductImportModalComponent } from '../../catalog/product-import-modal.component';
import { AuthTenantService } from '@core/services/auth-tenant.service';
import { GsisLookupService } from '@core/services/gsis-lookup.service';
import {
  VatRateCategory,
  InvoiceLineItem,
  GoodsMovementData,
  MovementPurposeCode,
} from '@core/models/aade.models';
import { calculateLineValues, calculateInvoiceTotals } from '@core/utils/fiscal-engine';
import { AadeSerializerService } from '@core/services/aade-serializer.service';
import { LocalInvoiceRecord, Product } from '@core/models/database.models';
import { InvoicePrintComponent, PrintableInvoiceData } from '../invoice-print/invoice-print.component';
import { ExternalDocumentHandover } from '@core/models/handover.model';

@Component({
  selector: 'maranth-invoice-builder',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InvoicePrintComponent,
    ProductImportModalComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 no-print">
      
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

        <!-- Action Buttons -->
        <div class="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            (click)="onResetForm()"
            class="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition active:scale-98"
          >
            <span class="text-slate-400">↺</span>
            <span>Καθαρισμός</span>
          </button>

          <button
            type="button"
            (click)="onSaveDraftManually()"
            class="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-semibold text-slate-700 hover:text-indigo-600 bg-white hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-200 shadow-2xs transition active:scale-98"
          >
            <span class="text-slate-400">💾</span>
            <span>Αποθήκευση</span>
          </button>

          <button
            type="button"
            (click)="onOpenPreview()"
            [disabled]="invoiceForm.invalid"
            class="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-green-600 to-indigo-600 hover:from-green-700 hover:to-indigo-700 shadow-sm shadow-green-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-98"
          >
            <span>📄</span>
            <span>Εκτύπωση / Έκδοση</span>
          </button>
        </div>
      </div>

      <form [formGroup]="invoiceForm" class="space-y-6">
        <!-- Recipient & Document Info -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs md:col-span-2 space-y-4">
            <div class="flex items-center justify-between border-b border-slate-100 pb-2">
              <h2 class="text-sm font-semibold uppercase tracking-wider text-slate-700">Στοιχεία Πελάτη / Λήπτη</h2>
              @if (customerAfmValue) {
                @if (isAfmValid()) {
                  <span class="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    ✓ Έγκυρο Α.Φ.Μ.
                  </span>
                } @else {
                  <span class="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    ✕ Μη έγκυρο Α.Φ.Μ.
                  </span>
                }
              }
            </div>

            <div formGroupName="customer" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="relative">
                <label class="block text-xs font-medium text-slate-600 mb-1">Α.Φ.Μ. *</label>
                <div class="flex rounded-md shadow-2xs">
                  <input
                    type="text"
                    formControlName="afm"
                    maxlength="9"
                    (input)="onCustomerSearch($any($event.target).value)"
                    placeholder="9 ψηφία"
                    class="block w-full rounded-l-md border-slate-300 text-sm px-3 py-2 border font-mono focus:ring-indigo-500 focus:border-indigo-500"
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

                @if (customerResults().length > 0) {
                  <div class="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-52 overflow-y-auto divide-y divide-slate-100">
                    @for (cust of customerResults(); track cust.id) {
                      <button
                        type="button"
                        (click)="selectCustomer(cust)"
                        class="w-full px-3.5 py-2 text-left hover:bg-indigo-50/70 transition flex items-center justify-between text-xs"
                      >
                        <div>
                          <p class="font-bold text-slate-900">{{ cust.legalName }}</p>
                          <p class="text-[10px] text-slate-500 font-mono">ΑΦΜ: {{ cust.afm }} | ΔΟΥ: {{ cust.doy || '—' }}</p>
                        </div>
                        <span class="text-[10px] text-indigo-600 font-semibold">Επιλογή</span>
                      </button>
                    }
                  </div>
                }

                @if (afmInvalid) {
                  <span class="text-xs text-rose-600 mt-1 block">Μη έγκυρο Α.Φ.Μ. (Modulo 11)</span>
                }
                @if (gsisError()) {
                  <span class="text-xs text-amber-600 mt-1 block">{{ gsisError() }}</span>
                }
              </div>

              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Επωνυμία *</label>
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

        <!-- GOODS MOVEMENT PANEL (Rendered for 1.2 and 9.1) -->
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
              <div formGroupName="addressFrom" class="p-3 bg-white/80 rounded-lg border border-amber-200">
                <span class="block text-[10px] font-bold uppercase text-slate-500 mb-2">Τόπος Έναρξης (Φόρτωση / Έδρα)</span>
                <div class="grid grid-cols-3 gap-2">
                  <input type="text" formControlName="street" placeholder="Οδός" class="col-span-2 text-xs border rounded p-1.5" />
                  <input type="text" formControlName="number" placeholder="Αριθμός" class="text-xs border rounded p-1.5" />
                  <input type="text" formControlName="postalCode" placeholder="Τ.Κ." class="text-xs border rounded p-1.5" />
                  <input type="text" formControlName="city" placeholder="Πόλη" class="col-span-2 text-xs border rounded p-1.5" />
                </div>
              </div>

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

        <!-- Product Search Toolbar -->
        <div class="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-3">
          <div class="flex items-center justify-between">
            <label class="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <span>🔍</span>
              <span>Αναζήτηση Προϊόντος / Σάρωση Barcode</span>
            </label>

            <button
              type="button"
              (click)="showImportModal.set(true)"
              class="px-2.5 py-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100/70 border border-blue-200 rounded-lg transition flex items-center gap-1.5"
            >
              <span>📁</span>
              <span>Εισαγωγή Excel / CSV</span>
            </button>
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
                  @if (invoiceForm.get('invoiceType')?.value !== '9.1') {
                    <th class="px-3 py-3 w-28">Τιμή (€)</th>
                    <th class="px-3 py-3 w-20">Έκπτ. %</th>
                    <th class="px-3 py-3 w-28">Καθαρή</th>
                  }
                  <th class="px-3 py-3 w-32">ΦΠΑ</th>
                  @if (invoiceForm.get('invoiceType')?.value !== '9.1') {
                    <th class="px-3 py-3 w-28">Σύνολο</th>
                  }
                  <th class="px-2 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody formArrayName="lines" class="divide-y divide-slate-100">
                @for (line of linesArray.controls; track $index) {
                  <tr [formGroupName]="$index" class="hover:bg-slate-50/50">
                    <td class="p-3">
                      <input type="text" formControlName="description" placeholder="Περιγραφή είδους" class="w-full text-sm border-slate-200 rounded px-2 py-1.5 border font-medium text-slate-800" />
                    </td>
                    <td class="p-3">
                      <input type="number" formControlName="quantity" (input)="recalculateLine($index)" class="w-full text-sm border-slate-200 rounded px-2 py-1.5 border font-bold text-slate-900" />
                    </td>
                    @if (invoiceForm.get('invoiceType')?.value !== '9.1') {
                      <td class="p-3">
                        <input type="number" step="0.01" formControlName="unitPrice" (input)="recalculateLine($index)" class="w-full text-sm border-slate-200 rounded px-2 py-1 border" />
                      </td>
                      <td class="p-3">
                        <input type="number" formControlName="discountPercentage" (input)="recalculateLine($index)" class="w-full text-sm border-slate-200 rounded px-2 py-1 border" />
                      </td>
                      <td class="p-3 font-mono text-slate-700">
                        {{ line.get('netValue')?.value | number: '1.2-2' }}
                      </td>
                    }
                    <td class="p-3">
                      <select formControlName="vatRateCategory" (change)="recalculateLine($index)" class="w-full text-xs border-slate-200 rounded px-2 py-1.5 border bg-white font-medium">
                        <option [value]="1">24% (Κανονικό)</option>
                        <option [value]="2">13% (Μειωμένο - Τρόφιμα)</option>
                        <option [value]="3">6% (Υπερμειωμένο)</option>
                        <option [value]="7">0% (Απαλλαγή)</option>
                      </select>
                    </td>
                    @if (invoiceForm.get('invoiceType')?.value !== '9.1') {
                      <td class="p-3 font-mono font-bold text-slate-900">
                        {{ line.get('totalValue')?.value | number: '1.2-2' }}
                      </td>
                    }
                    <td class="p-3 text-center">
                      <button type="button" (click)="removeLineItem($index)" class="text-rose-400 hover:text-rose-600 font-bold text-lg">×</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="flex justify-end">
          <div class="w-full md:w-80 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            @if (invoiceForm.get('invoiceType')?.value === '9.1') {
              <div class="p-3 bg-amber-50 rounded-lg border border-amber-200 text-center">
                <span class="block text-xs font-bold text-amber-900 uppercase tracking-wide">Δελτίο Διακίνησης (9.1)</span>
                <span class="text-[11px] text-amber-700">Μη τιμολογιακό παραστατικό μεταφοράς. Καθαρή αξία: 0.00 €</span>
              </div>
            } @else {
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
            }
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

      <!-- EXCEL / CSV IMPORT MODAL -->
      @if (showImportModal()) {
        <maranth-product-import-modal
          (close)="showImportModal.set(false)"
          (imported)="autoSaveStatus.set('Εισήχθησαν ' + $event + ' προϊόντα!')"
        ></maranth-product-import-modal>
      }
    </div>
  `,
})
export class InvoiceBuilderComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly serializer = inject(AadeSerializerService);
  private readonly db = inject(LocalDbService);
  public readonly auth = inject(AuthTenantService);
  private readonly cartBridge = inject(CartBridgeService);
  private readonly gsisService = inject(GsisLookupService);
  private readonly route = inject(ActivatedRoute);

  public readonly gsisLoading = signal<boolean>(false);
  public readonly gsisError = signal<string | null>(null);

  public readonly currentDraftId = signal<string>(crypto.randomUUID());
  public readonly autoSaveStatus = signal<string>('Έτοιμο');
  public readonly showImportModal = signal<boolean>(false);

  public readonly lineItemsSignal = signal<InvoiceLineItem[]>([]);
  public readonly searchQuery = signal<string>('');
  public readonly searchResults = signal<Product[]>([]);
  public readonly isSearching = signal<boolean>(false);

  private handoverReceived = false;

  public readonly computedTotals = computed(() =>
    calculateInvoiceTotals(this.lineItemsSignal())
  );

  public readonly isMovementDocument = signal<boolean>(false);
  public readonly showPrintModal = signal<boolean>(false);
  public readonly printableData = signal<PrintableInvoiceData | null>(null);

  public readonly customerSearchQuery = signal<string>('');
  public readonly customerResults = signal<LocalCustomerRecord[]>([]);

  public readonly invoiceForm = this.fb.group({
    series: ['', Validators.required],
    documentNumber: [1, [Validators.required, Validators.min(1)]],
    issueDate: [new Date().toISOString().substring(0, 10), Validators.required],
    invoiceType: ['9.1', Validators.required],
    customer: this.fb.group({
      afm: ['', [Validators.required, greekAfmValidator()]],
      legalName: ['', Validators.required],
      doy: [''],
      email: ['', Validators.email],
      street: [''],
      number: [''],
      postalCode: [''],
      city: [''],
    }),
    movement: this.fb.group({
      vehicleNumber: ['', Validators.required],
      movePurpose: [6, Validators.required],
      dispatchDateTime: [new Date().toISOString().substring(0, 16), Validators.required],
      addressFrom: this.fb.group({
        street: ['', Validators.required],
        number: ['', Validators.required],
        postalCode: ['', Validators.required],
        city: ['', Validators.required],
      }),
      addressTo: this.fb.group({
        street: ['', Validators.required],
        number: ['', Validators.required],
        postalCode: ['', Validators.required],
        city: ['', Validators.required],
      }),
    }),
    lines: this.fb.array([]),
  });

  public readonly isAfmValid = computed(() => {
    const afm = this.invoiceForm.get('customer.afm')?.value;
    return Boolean(afm && isValidGreekAfm(afm));
  });

  get customerAfmValue(): string {
    return this.invoiceForm.get('customer.afm')?.value || '';
  }

  get linesArray(): FormArray {
    return this.invoiceForm.get('lines') as FormArray;
  }

  get afmInvalid(): boolean {
    const ctrl = this.invoiceForm.get('customer.afm');
    return !!(ctrl?.touched && ctrl?.errors?.['invalidGreekAfm']);
  }

  async ngOnInit(): Promise<void> {
    const currentTenantId = this.auth.currentTenantId();

    // 1. Listen for incoming POS cart
    this.cartBridge.cart$.subscribe((payload: any) => {
      if (payload && payload.items && payload.items.length > 0) {
        this.applyIncomingHandover(payload as ExternalDocumentHandover);
      }
    });
    this.cartBridge.checkUrlPayload();

    // 2. Populate Issuer Address and Default Series from Tenant Settings
    if (currentTenantId) {
      const myBusiness = await this.db.getSettingsForTenant(currentTenantId);
      if (myBusiness) {
        const b = myBusiness as any;
        if (!this.invoiceForm.get('series')?.value) {
          this.invoiceForm.get('series')?.setValue(b.defaultSeries || 'ΕΠΙΣΤΡ', { emitEvent: false });
        }
        this.invoiceForm.get('movement.addressFrom')?.patchValue({
          street: b.street || '',
          number: b.number || '',
          postalCode: b.postalCode || '',
          city: b.city || '',
        }, { emitEvent: false });
      }
    }

    // 3. Draft restoration
    const targetDraftId =
      this.route.snapshot.paramMap.get('id') ||
      this.route.snapshot.queryParamMap.get('draftId');

    if (!this.handoverReceived) {
      if (targetDraftId) {
        const draft = await this.db.getInvoiceById(targetDraftId);
        if (draft) {
          this.restoreDraft(draft);
        } else {
          this.seedInitialLine();
        }
      } else {
        this.seedInitialLine();
      }
    }

    this.updateMovementDocState(this.invoiceForm.get('invoiceType')?.value);

    this.invoiceForm.get('invoiceType')?.valueChanges.subscribe((type) => {
      this.updateMovementDocState(type);
    });

    this.invoiceForm.valueChanges.subscribe(() => {
      this.autoSaveStatus.set('Αποθήκευση...');
      this.debouncedSave();
    });
  }

  private restoreDraft(draft: LocalInvoiceRecord): void {
    try {
      const payload = JSON.parse(draft.payloadJson);
      this.currentDraftId.set(draft.id);

      this.invoiceForm.enable({ emitEvent: false });
      this.invoiceForm.patchValue(payload, { emitEvent: false });

      this.linesArray.clear();
      if (Array.isArray(payload.lines) && payload.lines.length > 0) {
        const isDeltio = (payload.invoiceType === '9.1' || payload.documentType === '9.1');

        for (const l of payload.lines) {
          this.linesArray.push(
            this.fb.group({
              description: [l.description, Validators.required],
              quantity: [l.quantity, [Validators.required, Validators.min(0.01)]],
              unitPrice: [isDeltio ? 0 : (l.unitPrice ?? 0), [Validators.required, Validators.min(0)]],
              discountPercentage: [l.discountPercentage || 0],
              netValue: [{ value: isDeltio ? 0 : (l.netValue ?? 0), disabled: true }],
              vatRateCategory: [l.vatRateCategory || 1],
              vatAmount: [{ value: isDeltio ? 0 : (l.vatAmount ?? 0), disabled: true }],
              totalValue: [{ value: isDeltio ? 0 : (l.totalValue ?? 0), disabled: true }],
            })
          );
        }
      } else {
        this.seedInitialLine();
      }

      this.syncLines();
      this.autoSaveStatus.set(`Επεξεργασία πρόχειρου: ${draft.series || ''} ${draft.documentNumber || ''}`);
    } catch (err) {
      console.error('[Draft Restore Error]', err);
      this.seedInitialLine();
    }
  }

  private applyIncomingHandover(data: ExternalDocumentHandover): void {
    if (!data || !data.items || data.items.length === 0) return;
    this.handoverReceived = true;

    this.setSupplierReturnPreset();

    const s = data.supplier;
    const t = data.transport;

    this.invoiceForm.patchValue({
      customer: {
        afm: s?.afm || '',
        legalName: s?.legalName || '',
        doy: s?.doy || '',
        street: s?.address?.street || '',
        number: s?.address?.number || '',
        postalCode: s?.address?.postalCode || '',
        city: s?.address?.city || '',
      },
      movement: {
        vehicleNumber: t?.vehiclePlate || t?.vehicleNumber || '',
        addressTo: {
          street: s?.address?.street || '',
          number: s?.address?.number || '',
          postalCode: s?.address?.postalCode || '',
          city: s?.address?.city || '',
        },
      },
    }, { emitEvent: false });

    this.linesArray.clear();

    for (const item of data.items) {
      const vatCat = this.mapVatRateToCategory(item.vatRate);

      this.linesArray.push(
        this.fb.group({
          description: [item.description, Validators.required],
          quantity: [item.quantity, [Validators.required, Validators.min(0.01)]],
          unitPrice: [0, [Validators.required, Validators.min(0)]],
          discountPercentage: [0],
          netValue: [{ value: 0, disabled: true }],
          vatRateCategory: [vatCat],
          vatAmount: [{ value: 0, disabled: true }],
          totalValue: [{ value: 0, disabled: true }],
        })
      );
    }

    this.syncLines();
    this.autoSaveStatus.set(`Εισήχθησαν ${data.items.length} είδη επιστροφής!`);
  }

  public setSupplierReturnPreset(): void {
    this.invoiceForm.patchValue({
      invoiceType: '9.1',
      series: 'ΕΠΙΣΤΡ',
      movement: {
        vehicleNumber: '',
        movePurpose: 6,
        dispatchDateTime: new Date().toISOString().substring(0, 16),
      },
    }, { emitEvent: false });
    this.updateMovementDocState('9.1');
  }

  public mapVatRateToCategory(rate: unknown): number {
    if (rate === null || rate === undefined) return 7;

    const num = typeof rate === 'string' ? parseFloat(rate.replace('%', '').trim()) : Number(rate);

    if (num === 0 || num === 1) return 7;

    if (num > 0 && num < 1) {
      const pct = Math.round(num * 100);
      if (pct === 24) return 1;
      if (pct === 13) return 2;
      if (pct === 6) return 3;
      if (pct === 17) return 4;
      if (pct === 9) return 5;
      if (pct === 4) return 6;
    }

    if (num === 24) return 1;
    if (num === 13) return 2;
    if (num === 6) return 3;

    return 7;
  }

  public async onCustomerSearch(query: string): Promise<void> {
    let clean = (query || '').replace(/\D/g, '');
    if (clean.length === 8) {
      clean = '0' + clean;
    }
    this.customerSearchQuery.set(clean);

    if (clean.length < 2) {
      this.customerResults.set([]);
      return;
    }

    const tenantId = this.auth.currentTenantId() || 'tenant_minimarket';
    const matches = await this.db.searchCustomersForTenant(tenantId, clean);
    this.customerResults.set(matches);
  }

  public selectCustomer(c: LocalCustomerRecord): void {
    this.invoiceForm.get('customer')?.patchValue({
      afm: c.afm,
      legalName: c.legalName,
      doy: c.doy ?? '',
      email: c.email ?? '',
      street: c.address?.street ?? '',
      number: c.address?.number ?? '',
      postalCode: c.address?.postalCode ?? '',
      city: c.address?.city ?? '',
    });

    if (this.isMovementDocument() && c.address) {
      this.invoiceForm.get('movement.addressTo')?.patchValue({
        street: c.address.street ?? '',
        number: c.address.number ?? '',
        postalCode: c.address.postalCode ?? '',
        city: c.address.city ?? '',
      });
    }

    this.customerResults.set([]);
    this.customerSearchQuery.set('');
  }

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
    const isDeltio = this.invoiceForm.get('invoiceType')?.value === '9.1';

    let vatCategory = 1;
    if (product.taxRate === 13) vatCategory = 2;
    else if (product.taxRate === 6) vatCategory = 3;
    else if (product.taxRate === 0) vatCategory = 7;

    const unitPrice = isDeltio ? 0 : Number(product.price || 0);
    const quantity = 1;
    const netValue = isDeltio ? 0 : Number((unitPrice * quantity).toFixed(2));
    const vatRate = product.taxRate ?? 24;
    const vatAmount = isDeltio ? 0 : Number((netValue * (vatRate / 100)).toFixed(2));
    const totalValue = isDeltio ? 0 : Number((netValue + vatAmount).toFixed(2));

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

  private updateMovementDocState(type: string | null | undefined): void {
    const isMov = type === '1.2' || type === '9.1';
    this.isMovementDocument.set(isMov);
    const movementCtrl = this.invoiceForm.get('movement');
    if (isMov) {
      movementCtrl?.enable({ emitEvent: false });
    } else {
      movementCtrl?.disable({ emitEvent: false });
    }
  }

  public seedInitialLine(): void {
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
      tenantId: tenantId,
      series: formVal.series || 'ΕΠΙΣΤΡ',
      documentNumber: Number(formVal.documentNumber) || 1,
      issueDate: formVal.issueDate || new Date().toISOString().substring(0, 10),
      invoiceType: formVal.invoiceType || '9.1',
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
    const currentId = this.currentDraftId();
    if (currentId) {
      await this.db.deleteInvoice(currentId);
    }
    this.currentDraftId.set(crypto.randomUUID());

    const tenantId = this.auth.currentTenantId();
    const settings = tenantId ? await this.db.getSettingsForTenant(tenantId) : null;
    const s = (settings || {}) as any;

    this.invoiceForm.reset({
      series: s.defaultSeries || 'ΕΠΙΣΤΡ',
      documentNumber: 1,
      issueDate: new Date().toISOString().substring(0, 10),
      invoiceType: '9.1',
      customer: {
        afm: '',
        legalName: '',
        doy: '',
        email: '',
        street: '',
        number: '',
        postalCode: '',
        city: '',
      },
      movement: {
        vehicleNumber: '',
        movePurpose: 6,
        dispatchDateTime: new Date().toISOString().substring(0, 16),
        addressFrom: {
          street: s.street || s.address?.street || '',
          number: s.number || s.address?.number || '',
          postalCode: s.postalCode || s.address?.postalCode || '',
          city: s.city || s.address?.city || '',
        },
        addressTo: {
          street: '',
          number: '',
          postalCode: '',
          city: '',
        },
      },
    });

    this.linesArray.clear();
    this.seedInitialLine();
    this.autoSaveStatus.set('Καθαρίστηκε');
  }

  public addLineItem(): void {
    const isDeltio = this.invoiceForm.get('invoiceType')?.value === '9.1';

    const row = this.fb.group({
      description: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
      unitPrice: [0, [Validators.required, Validators.min(0)]],
      discountPercentage: [0],
      netValue: [{ value: 0, disabled: true }],
      vatRateCategory: [1],
      vatAmount: [{ value: 0, disabled: true }],
      totalValue: [{ value: 0, disabled: true }],
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

  public async triggerGsisLookup(): Promise<void> {
    const afmControl = this.invoiceForm.get('customer.afm');
    let rawAfm = String(afmControl?.value ?? '').replace(/\D/g, '');

    if (rawAfm.length === 8) {
      rawAfm = '0' + rawAfm;
      afmControl?.setValue(rawAfm, { emitEvent: false });
    }

    if (rawAfm.length !== 9 || !isValidGreekAfm(rawAfm)) {
      this.gsisError.set('Παρακαλώ εισάγετε έγκυρο 9-ψήφιο Α.Φ.Μ.');
      afmControl?.markAsTouched();
      return;
    }

    const tenantId = this.auth.currentTenantId() || 'tenant_minimarket';

    try {
      const cachedCustomer = await this.db.getCustomerByAfm(tenantId, rawAfm);
      if (cachedCustomer) {
        this.populateCustomerForm(cachedCustomer);
        this.gsisError.set(null);
        return;
      }
    } catch (e) {
      console.warn('[GSIS] Local cache check failed:', e);
    }

    this.gsisLoading.set(true);
    this.gsisError.set(null);

    this.gsisService.lookupAfm(rawAfm).subscribe({
      next: async (data) => {
        this.gsisLoading.set(false);

        if (!data || !data.legalName) {
          this.gsisError.set('Το Α.Φ.Μ. είναι έγκυρο αλλά δεν βρέθηκαν στοιχεία στο μητρώο.');
          return;
        }

        if (data.active === false) {
          alert('Προσοχή: Η επιχείρηση με αυτό το Α.Φ.Μ. εμφανίζεται ως ΑΝΕΝΕΡΓΗ / ΔΙΑΚΟΠΕΙΣΑ στο μητρώο!');
        }

        const customerPayload = {
          legalName: data.legalName,
          doy: data.doyDescr || '',
          address: {
            street: data.postalAddress || '',
            number: data.postalAddressNo || '',
            postalCode: data.postalZipCode || '',
            city: data.postalAreaDescription || '',
          }
        };

        this.populateCustomerForm(customerPayload);

        try {
          const existing = await this.db.getCustomerByAfm(tenantId, rawAfm);
          await this.db.saveCustomer({
            id: existing?.id || crypto.randomUUID(),
            tenantId,
            afm: rawAfm,
            branch: 0,
            country: 'GR',
            legalName: customerPayload.legalName,
            doy: customerPayload.doy,
            email: this.invoiceForm.get('customer.email')?.value || '',
            address: customerPayload.address,
            updatedAt: new Date().toISOString(),
          });
        } catch (dbErr) {
          console.error('[GSIS] Failed to cache customer in Dexie:', dbErr);
        }
      },
      error: (err) => {
        this.gsisLoading.set(false);
        this.gsisError.set(
          err.status === 0 || err.message?.includes('Http failure')
            ? 'Αδυναμία σύνδεσης με την υπηρεσία μητρώου (GSIS). Συμπληρώστε τα στοιχεία χειροκίνητα.'
            : (err.message || 'Αποτυχία ανάκτησης στοιχείων.')
        );
      },
    });
  }

  private populateCustomerForm(data: {
    legalName: string;
    doy?: string;
    address: { street: string; number: string; postalCode: string; city: string };
  }): void {
    const customerGroup = this.invoiceForm.get('customer');
    if (customerGroup) {
      customerGroup.get('legalName')?.setValue(data.legalName);
      customerGroup.get('doy')?.setValue(data.doy || '');
      customerGroup.get('street')?.setValue(data.address.street);
      customerGroup.get('number')?.setValue(data.address.number);
      customerGroup.get('postalCode')?.setValue(data.address.postalCode);
      customerGroup.get('city')?.setValue(data.address.city);
    }

    if (this.isMovementDocument()) {
      const addressToGroup = this.invoiceForm.get('movement.addressTo');
      if (addressToGroup) {
        addressToGroup.get('street')?.setValue(data.address.street);
        addressToGroup.get('number')?.setValue(data.address.number);
        addressToGroup.get('postalCode')?.setValue(data.address.postalCode);
        addressToGroup.get('city')?.setValue(data.address.city);
      }
    }
  }

  public async onOpenPreview(): Promise<void> {
    if (this.invoiceForm.invalid) return;

    const tenantId = this.auth.currentTenantId();
    if (!tenantId) {
      alert('Σφάλμα: Δεν έχει επιλεγεί ενεργός οργανισμός (Tenant).');
      return;
    }

    const mySettings = await this.db.getSettingsForTenant(tenantId);
    const s = (mySettings || {}) as any;

    const issuerAfm = s.afm || this.auth.activeTenant()?.fiscalIdentity?.afm;

    if (!issuerAfm || !isValidGreekAfm(issuerAfm)) {
      alert('Απαιτείται καταχώρηση στοιχείων επιχείρησης! Παρακαλώ μεταβείτε στις Ρυθμίσεις και συμπληρώστε το Α.Φ.Μ. και τα στοιχεία του καταστήματος.');
      return;
    }

    const formVal = this.invoiceForm.getRawValue();
    const totals = this.computedTotals();

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
      doy: formVal.customer.doy || '',
      country: 'GR',
      email: formVal.customer.email || '',
      address: {
        street: formVal.movement?.addressTo?.street || formVal.customer?.street || '',
        number: formVal.movement?.addressTo?.number || formVal.customer?.number || '',
        postalCode: formVal.movement?.addressTo?.postalCode || formVal.customer?.postalCode || '',
        city: formVal.movement?.addressTo?.city || formVal.customer?.city || '',
      },
    };

    const isMovementOnly = formVal.invoiceType === '9.1';

    const movementData: GoodsMovementData | undefined = this.isMovementDocument()
      ? {
          vehicleNumber: formVal.movement?.vehicleNumber || '',
          movePurpose: (Number(formVal.movement?.movePurpose) || 6) as MovementPurposeCode,
          dispatchDateTime: formVal.movement?.dispatchDateTime || new Date().toISOString().substring(0, 16),
          addressFrom: {
            street: formVal.movement?.addressFrom?.street || s.street || s.address?.street || '',
            number: formVal.movement?.addressFrom?.number || s.number || s.address?.number || '',
            postalCode: formVal.movement?.addressFrom?.postalCode || s.postalCode || s.address?.postalCode || '',
            city: formVal.movement?.addressFrom?.city || s.city || s.address?.city || '',
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
      issuer: { 
        afm: issuerAfm, 
        country: 'GR', 
        branch: Number(s.branch ?? 0) 
      },
      counterpart: customerData,
      lines: this.lineItemsSignal(),
      totals,
      paymentMethodType: isMovementOnly ? undefined : 1,
      movement: movementData,
    });

    const issuerData = {
      legalName: s.legalName || this.auth.activeTenant()?.name || 'Επωνυμία Επιχείρησης',
      tradeName: s.tradeName || s.commercialTitle || '',
      afm: issuerAfm,
      doy: s.doy || '',
      branch: Number(s.branch ?? 0),
      address: {
        street: s.street || s.address?.street || '',
        number: s.number || s.address?.number || '',
        postalCode: s.postalCode || s.address?.postalCode || '',
        city: s.city || s.address?.city || '',
      },
      phone: s.phone || '',
      email: s.email || '',
    };

    this.printableData.set({
      series: formVal.series!,
      documentNumber: Number(formVal.documentNumber),
      issueDate: formVal.issueDate!,
      invoiceType: formVal.invoiceType!,
      issuer: issuerData,
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
    const isDeltio = this.invoiceForm.get('invoiceType')?.value === '9.1';

    if (isDeltio) {
      for (let i = 0; i < this.linesArray.length; i++) {
        const row = this.linesArray.at(i);
        row.get('unitPrice')?.setValue(0, { emitEvent: false });
        row.get('discountPercentage')?.setValue(0, { emitEvent: false });
        row.get('netValue')?.setValue(0, { emitEvent: false });
        row.get('vatAmount')?.setValue(0, { emitEvent: false });
        row.get('totalValue')?.setValue(0, { emitEvent: false });
      }
    }

    const raw = this.linesArray.getRawValue() as any[];
    const items: InvoiceLineItem[] = raw.map((r, i) => {
      const netVal = isDeltio ? 0 : Number(r.netValue) || 0;
      const vatCat = (Number(r.vatRateCategory) || 1) as VatRateCategory;
      const unitPr = isDeltio ? 0 : Number(r.unitPrice) || 0;
      const vatAmt = isDeltio ? 0 : Number(r.vatAmount) || 0;
      const totVal = isDeltio ? 0 : Number(r.totalValue) || 0;

      let vatPct = 24;
      if (vatCat === 2) vatPct = 13;
      else if (vatCat === 3) vatPct = 6;
      else if (vatCat === 7) vatPct = 0;

      return {
        id: String(i + 1),
        lineNumber: i + 1,
        description: r.description || '',
        quantity: Number(r.quantity) || 1,
        unitPrice: unitPr,
        discountPercentage: 0,
        netValue: netVal,
        vatRateCategory: vatCat,
        vatPercentage: vatPct,
        vatAmount: vatAmt,
        totalValue: totVal,
        unitMeasurement: '1',
        incomeClassification: isDeltio
          ? undefined
          : {
              classificationType: 'E3_561_001',
              classificationCategory: 'category1_1',
              amount: netVal,
            },
      };
    });

    this.lineItemsSignal.set(items);
  }
}
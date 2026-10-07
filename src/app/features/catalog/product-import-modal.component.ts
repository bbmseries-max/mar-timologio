import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductImporterService } from '@core/services/product-importer.service';
import { AuthTenantService } from '@core/services/auth-tenant.service';
import { ColumnMappingConfig, ImportPreviewItem, ParsedRawRow } from '@core/models/import.models';

@Component({
  selector: 'maranth-product-import-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        
        <!-- Header -->
        <div class="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h2 class="text-base font-bold tracking-tight">Εισαγωγή Τιμοκαταλόγου / Προϊόντων</h2>
            <p class="text-xs text-slate-400">Υποστήριξη αρχείων Excel (.xlsx, .xls) και CSV</p>
          </div>
          <button (click)="close.emit()" class="text-slate-400 hover:text-white text-sm font-semibold p-1">
            ✕
          </button>
        </div>

        <div class="p-6 overflow-y-auto flex-1 space-y-6">
          
          <!-- Step 1: Drag & Drop Zone (if no file loaded) -->
          @if (!fileLoaded()) {
            <div
              (dragover)="onDragOver($event)"
              (drop)="onFileDrop($event)"
              class="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-10 text-center bg-slate-50/50 hover:bg-blue-50/30 transition cursor-pointer flex flex-col items-center justify-center gap-3"
              (click)="fileInput.click()"
            >
              <input
                #fileInput
                type="file"
                (change)="onFileSelected($event)"
                accept=".xlsx, .xls, .csv"
                class="hidden"
              />
              <div class="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-2xl font-bold">
                📄
              </div>
              <div class="space-y-1">
                <p class="text-sm font-bold text-slate-800">Σύρετε το αρχείο εδώ ή κάντε κλικ για επιλογή</p>
                <p class="text-xs text-slate-500">Μορφές: Excel (.xlsx, .xls) ή CSV οποιουδήποτε προμηθευτή</p>
              </div>
            </div>
          } @else {
            
            <!-- Step 2: Visual Column Mapping Form -->
            <div class="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-4">
              <div class="flex items-center justify-between border-b border-slate-200 pb-2">
                <span class="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  1. Αντιστοίχιση Στηλών ({{ fileName() }})
                </span>
                <button
                  type="button"
                  (click)="resetFile()"
                  class="text-xs text-rose-600 hover:underline font-semibold"
                >
                  Αλλαγή Αρχείου
                </button>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                
                <div>
                  <label class="block font-semibold text-slate-700 mb-1">Περιγραφή / Όνομα *</label>
                  <select
                    [ngModel]="mapping().nameCol"
                    (ngModelChange)="updateMapping('nameCol', $event)"
                    class="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    @for (h of headers(); track h) {
                      <option [value]="h">{{ h }}</option>
                    }
                  </select>
                </div>

                <div>
                  <label class="block font-semibold text-slate-700 mb-1">Barcode / Κωδικός</label>
                  <select
                    [ngModel]="mapping().barcodeCol"
                    (ngModelChange)="updateMapping('barcodeCol', $event)"
                    class="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    <option value="">— Χωρίς Barcode —</option>
                    @for (h of headers(); track h) {
                      <option [value]="h">{{ h }}</option>
                    }
                  </select>
                </div>

                <div>
                  <label class="block font-semibold text-slate-700 mb-1">Τιμή *</label>
                  <select
                    [ngModel]="mapping().priceCol"
                    (ngModelChange)="updateMapping('priceCol', $event)"
                    class="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    @for (h of headers(); track h) {
                      <option [value]="h">{{ h }}</option>
                    }
                  </select>
                </div>

                <div>
                  <label class="block font-semibold text-slate-700 mb-1">Στήλη Φ.Π.Α.</label>
                  <select
                    [ngModel]="mapping().vatCol"
                    (ngModelChange)="updateMapping('vatCol', $event)"
                    class="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    <option value="">— Προεπιλογή ({{ mapping().defaultVatRate }}%) —</option>
                    @for (h of headers(); track h) {
                      <option [value]="h">{{ h }}</option>
                    }
                  </select>
                </div>

              </div>

              <!-- Options: Wholesale vs Retail pricing -->
              <div class="flex flex-wrap items-center gap-6 pt-2 border-t border-slate-200 text-xs">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    [ngModel]="mapping().isPriceGross"
                    (ngModelChange)="updateMapping('isPriceGross', $event)"
                    class="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span class="text-slate-700 font-medium">Η τιμή του αρχείου περιλαμβάνει Φ.Π.Α. (Λιανική)</span>
                </label>

                <div class="flex items-center gap-2">
                  <span class="text-slate-500">Προεπιλεγμένος Συντελεστής:</span>
                  <select
                    [ngModel]="mapping().defaultVatRate"
                    (ngModelChange)="updateMapping('defaultVatRate', +$event)"
                    class="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-semibold"
                  >
                    <option [value]="24">24%</option>
                    <option [value]="13">13%</option>
                    <option [value]="6">6%</option>
                    <option [value]="0">0%</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Step 3: Live Preview Table (First 5 Rows) -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  2. Προεπισκόπηση Δεδομένων (Πρώτα 5 από {{ previewItems().length }})
                </span>
                <span class="text-xs font-semibold text-emerald-600">
                  Έγκυρα είδη: {{ validCount() }} / {{ previewItems().length }}
                </span>
              </div>

              <div class="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table class="w-full text-left text-xs">
                  <thead class="bg-slate-100 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                    <tr>
                      <th class="py-2.5 px-3">Περιγραφή</th>
                      <th class="py-2.5 px-3">Barcode</th>
                      <th class="py-2.5 px-3 text-right">Καθαρή Αξία</th>
                      <th class="py-2.5 px-3 text-right">Φ.Π.Α.</th>
                      <th class="py-2.5 px-3 text-right">Τελική Αξία</th>
                      <th class="py-2.5 px-3 text-center">Κατάσταση</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 font-mono text-[11px]">
                    @for (item of samplePreview(); track $index) {
                      <tr [class.bg-rose-50]="!item.isValid">
                        <td class="py-2 px-3 font-sans text-slate-800 font-medium">{{ item.name }}</td>
                        <td class="py-2 px-3 text-slate-500">{{ item.barcode || '—' }}</td>
                        <td class="py-2 px-3 text-right text-slate-700">{{ item.netPrice | number:'1.2-2' }} €</td>
                        <td class="py-2 px-3 text-right text-slate-500">{{ item.vatRate }}%</td>
                        <td class="py-2 px-3 text-right font-bold text-slate-900">{{ item.grossPrice | number:'1.2-2' }} €</td>
                        <td class="py-2 px-3 text-center font-sans">
                          @if (item.isValid) {
                            <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">✓ Έγκυρο</span>
                          } @else {
                            <span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">{{ item.validationError }}</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }

        </div>

        <!-- Footer Actions -->
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            (click)="close.emit()"
            class="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            Ακύρωση
          </button>

          @if (fileLoaded()) {
            <button
              type="button"
              (click)="onConfirmImport()"
              [disabled]="validCount() === 0 || importing()"
              class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition flex items-center gap-2"
            >
              <span>{{ importing() ? 'Εισαγωγή...' : 'Αποθήκευση ' + validCount() + ' Προϊόντων' }}</span>
            </button>
          }
        </div>

      </div>
    </div>
  `,
})
export class ProductImportModalComponent {
  private readonly importer = inject(ProductImporterService);
  private readonly auth = inject(AuthTenantService);

  public readonly close = output<void>();
  public readonly imported = output<number>();

  public readonly fileLoaded = signal<boolean>(false);
  public readonly fileName = signal<string>('');
  public readonly headers = signal<string[]>([]);
  public readonly rawRows = signal<ParsedRawRow[]>([]);
  public readonly importing = signal<boolean>(false);

  public readonly mapping = signal<ColumnMappingConfig>({
    nameCol: '',
    barcodeCol: '',
    priceCol: '',
    vatCol: '',
    isPriceGross: false,
    defaultVatRate: 24,
  });

  public readonly previewItems = computed(() => {
    if (!this.fileLoaded() || this.rawRows().length === 0) return [];
    return this.importer.mapRowsToPreview(this.rawRows(), this.mapping());
  });

  public readonly samplePreview = computed(() => this.previewItems().slice(0, 5));

  public readonly validCount = computed(
    () => this.previewItems().filter((i) => i.isValid).length
  );

  public onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  public onFileDrop(event: DragEvent): void {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.processFile(files[0]);
    }
  }

  public onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.processFile(input.files[0]);
    }
  }

  private async processFile(file: File): Promise<void> {
    this.fileName.set(file.name);
    const { headers, rows } = await this.importer.readSpreadsheet(file);
    if (headers.length === 0) return;

    this.headers.set(headers);
    this.rawRows.set(rows);
    this.mapping.set(this.importer.guessColumnMapping(headers));
    this.fileLoaded.set(true);
  }

  public updateMapping(key: keyof ColumnMappingConfig, value: any): void {
    this.mapping.update((m) => ({ ...m, [key]: value }));
  }

  public resetFile(): void {
    this.fileLoaded.set(false);
    this.headers.set([]);
    this.rawRows.set([]);
    this.fileName.set('');
  }

  public async onConfirmImport(): Promise<void> {
    const tenantId = this.auth.currentTenantId();
    if (!tenantId) return;

    this.importing.set(true);
    const count = await this.importer.commitImport(tenantId, this.previewItems());
    this.importing.set(false);
    this.imported.emit(count);
    this.close.emit();
  }
}
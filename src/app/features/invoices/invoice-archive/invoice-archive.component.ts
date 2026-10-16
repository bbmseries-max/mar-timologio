import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LocalDbService } from '@core/services/local-db.service';
import { AuthTenantService } from '@core/services/auth-tenant.service';
import { MyDataService } from '@core/services/mydata.service';
import { LocalInvoiceRecord } from '@core/models/database.models';
import {
  InvoicePrintComponent,
  PrintableInvoiceData,
} from '../invoice-print/invoice-print.component';
type FilterStatus = 'ALL' | 'TRANSMITTED' | 'DRAFT' | 'FAILED';

@Component({
  selector: 'maranth-invoice-archive',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, InvoicePrintComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 no-print">
      <!-- Header & Top Summary -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5 gap-4">
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Αρχείο Παραστατικών</h1>
            <span class="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
              {{ filteredInvoices().length }} εγγραφές
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-1">Ιστορικό εκδόσεων myDATA, επανεκτυπώσεις (A4/80mm) και κατάσταση διαβίβασης</p>
        </div>

        <div class="flex items-center gap-2.5">
          <button
            type="button"
            (click)="loadInvoices()"
            class="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-2xs transition active:scale-98 cursor-pointer flex items-center gap-1.5"
          >
            <span>🔄</span>
            <span>Ανανέωση</span>
          </button>

          <a
            routerLink="/invoices/new"
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-indigo-500/20 transition active:scale-98 cursor-pointer flex items-center gap-1.5"
          >
            <span>⚡</span>
            <span>Νέο Παραστατικό</span>
          </a>
        </div>
      </div>

      <!-- Financial Metrics Tiles -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span class="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Συνολικος Τζιρος (Μεικτο)</span>
          <span class="text-xl font-black font-mono text-slate-900 mt-1 block">
            {{ totalsSummary().gross | number: '1.2-2' }} €
          </span>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span class="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Καθαρη Αξια</span>
          <span class="text-xl font-bold font-mono text-slate-700 mt-1 block">
            {{ totalsSummary().net | number: '1.2-2' }} €
          </span>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span class="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Συνολο Φ.Π.Α.</span>
          <span class="text-xl font-bold font-mono text-indigo-600 mt-1 block">
            {{ totalsSummary().vat | number: '1.2-2' }} €
          </span>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span class="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Επιτυχεις Διαβιβασεις</span>
          <div class="flex items-center justify-between mt-1">
            <span class="text-xl font-bold font-mono text-emerald-600">
              {{ totalsSummary().transmittedCount }} / {{ invoices().length }}
            </span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              {{ totalsSummary().successRate }}%
            </span>
          </div>
        </div>
      </div>

      <!-- Filters Bar -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div class="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
          <!-- Search Box -->
          <div class="relative flex-1 min-w-[180px]">
            <input
              type="text"
              [(ngModel)]="searchQuery"
              placeholder="Αναζήτηση με Α.Φ.Μ., Επωνυμία ή Σειρά/Αριθμό..."
              class="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition font-medium"
            />
            <span class="absolute left-2.5 top-2.5 text-slate-400">🔍</span>
          </div>

          <!-- Document Type Filter -->
          <select
            [(ngModel)]="selectedType"
            class="border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-700 font-medium cursor-pointer"
          >
            <option value="ALL">Όλοι οι Τύποι</option>
            <option value="1.1">1.1 - Τιμολόγιο Πώλησης</option>
            <option value="2.1">2.1 - Παροχή Υπηρεσιών</option>
            <option value="9.3">9.3 - Δελτίο Αποστολής</option>
          </select>
        </div>

        <!-- Status Filter Tabs -->
        <div class="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
          <button
            type="button"
            (click)="selectedStatus.set('ALL')"
            [class.bg-white]="selectedStatus() === 'ALL'"
            [class.text-slate-900]="selectedStatus() === 'ALL'"
            [class.shadow-2xs]="selectedStatus() === 'ALL'"
            [class.text-slate-500]="selectedStatus() !== 'ALL'"
            class="px-2.5 py-1.5 rounded-md font-semibold transition cursor-pointer"
          >
            Όλα
          </button>
          <button
            type="button"
            (click)="selectedStatus.set('TRANSMITTED')"
            [class.bg-white]="selectedStatus() === 'TRANSMITTED'"
            [class.text-emerald-700]="selectedStatus() === 'TRANSMITTED'"
            [class.shadow-2xs]="selectedStatus() === 'TRANSMITTED'"
            [class.text-slate-500]="selectedStatus() !== 'TRANSMITTED'"
            class="px-2.5 py-1.5 rounded-md font-semibold transition cursor-pointer"
          >
            myDATA (Επιτυχή)
          </button>
          <button
            type="button"
            (click)="selectedStatus.set('FAILED')"
            [class.bg-white]="selectedStatus() === 'FAILED'"
            [class.text-rose-700]="selectedStatus() === 'FAILED'"
            [class.shadow-2xs]="selectedStatus() === 'FAILED'"
            [class.text-slate-500]="selectedStatus() !== 'FAILED'"
            class="px-2.5 py-1.5 rounded-md font-semibold transition cursor-pointer"
          >
            Αποτυχίες
          </button>
          <button
            type="button"
            (click)="selectedStatus.set('DRAFT')"
            [class.bg-white]="selectedStatus() === 'DRAFT'"
            [class.text-amber-700]="selectedStatus() === 'DRAFT'"
            [class.shadow-2xs]="selectedStatus() === 'DRAFT'"
            [class.text-slate-500]="selectedStatus() !== 'DRAFT'"
            class="px-2.5 py-1.5 rounded-md font-semibold transition cursor-pointer"
          >
            Πρόχειρα
          </button>
        </div>
      </div>

      <!-- Invoices Data Table -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        @if (filteredInvoices().length === 0) {
          <div class="p-12 text-center text-slate-500 space-y-3">
            <span class="text-3xl block">📑</span>
            <p class="text-sm font-semibold text-slate-700">Δεν βρέθηκαν παραστατικά</p>
            <p class="text-xs text-slate-400">Δοκιμάστε διαφορετικά φίλτρα αναζήτησης ή εκδώστε ένα νέο τιμολόγιο.</p>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th class="py-3 px-4">Παραστατικο</th>
                  <th class="py-3 px-4">Ημερομηνια</th>
                  <th class="py-3 px-4">Ληπτης / Πελατης</th>
                  <th class="py-3 px-4 text-right">Καθαρη</th>
                  <th class="py-3 px-4 text-right">ΦΠΑ</th>
                  <th class="py-3 px-4 text-right">Συνολο</th>
                  <th class="py-3 px-4 text-center">Κατασταση myDATA</th>
                  <th class="py-3 px-4 text-center">Ενεργειες</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 font-sans">
                @for (inv of filteredInvoices(); track inv.id) {
                  <tr class="hover:bg-slate-50/70 transition">
                    <!-- Doc Series & Number -->
                    <td class="py-3 px-4">
                      <div class="font-bold font-mono text-slate-900 text-sm">
                        {{ inv.series }}-{{ inv.documentNumber }}
                      </div>
                      <span class="text-[10px] font-medium text-slate-500">
                        {{ getDocTypeBadge(inv.invoiceType) }}
                      </span>
                    </td>

                    <!-- Date -->
                    <td class="py-3 px-4 font-mono text-slate-600 text-xs">
                      {{ inv.issueDate }}
                    </td>

                    <!-- Recipient -->
                    <td class="py-3 px-4">
                      <div class="font-bold text-slate-900 max-w-[200px] truncate">
                        {{ inv.customerName || '—' }}
                      </div>
                      <span class="font-mono text-[10px] text-slate-500">
                        ΑΦΜ: {{ inv.customerAfm || '—' }}
                      </span>
                    </td>

                    <!-- Values -->
                    <td class="py-3 px-4 text-right font-mono text-slate-700">
                      {{ inv.totalNet | number: '1.2-2' }} €
                    </td>
                    <td class="py-3 px-4 text-right font-mono text-slate-500">
                      {{ inv.totalVat | number: '1.2-2' }} €
                    </td>
                    <td class="py-3 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                      {{ inv.totalGross | number: '1.2-2' }} €
                    </td>

                    <!-- Status Badge / MARK Link -->
                    <td class="py-3 px-4 text-center">
                      @if (inv.transmissionStatus === 'TRANSMITTED' && inv.mark) {
                        <div class="inline-flex flex-col items-center">
                          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            ✓ MARK: {{ inv.mark }}
                          </span>
                          @if (inv.qrUrl) {
                            <a
                              [href]="inv.qrUrl"
                              target="_blank"
                              class="text-[9px] text-indigo-600 hover:underline mt-0.5 font-medium"
                            >
                              Επαλήθευση ΑΑΔΕ ↗
                            </a>
                          }
                        </div>
                      } @else if (inv.transmissionStatus === 'FAILED') {
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          ✕ Αποτυχία
                        </span>
                      } @else {
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          ⏳ Πρόχειρο
                        </span>
                      }
                    </td>

                    <!-- Actions -->
                    <td class="py-3 px-4 text-center">
                      <div class="flex items-center justify-center gap-1.5">
                        <!-- Repost/Retry if failed or draft -->
                        @if (inv.transmissionStatus !== 'TRANSMITTED') {
                          <button
                            type="button"
                            (click)="retryTransmission(inv)"
                            [disabled]="retryingId() === inv.id"
                            title="Επαναποστολή στο myDATA"
                            class="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                          >
                            <span>{{ retryingId() === inv.id ? '⏳' : '⚡' }}</span>
                          </button>
                        }

                        <!-- Print / Duplicate Button -->
                        <button
                          type="button"
                          (click)="openPrintModal(inv)"
                          title="Επανεκτύπωση (A4 / Θερμικό 80mm)"
                          class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-lg text-xs transition cursor-pointer flex items-center gap-1"
                        >
                          <span>🖨️</span>
                          <span>Εκτύπωση</span>
                        </button>
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

    <!-- RE-PRINT MODAL OVERLAY -->
    @if (showPrintModal() && selectedPrintData()) {
      <maranth-invoice-print
        [invoice]="selectedPrintData()!"
        (close)="showPrintModal.set(false)"
      />
    }
  `,
})
export class InvoiceArchiveComponent implements OnInit {
  private readonly db = inject(LocalDbService);
  private readonly auth = inject(AuthTenantService);
  private readonly myData = inject(MyDataService);

  public readonly invoices = signal<LocalInvoiceRecord[]>([]);
  public readonly searchQuery = signal<string>('');
  public readonly selectedType = signal<string>('ALL');
  public readonly selectedStatus = signal<FilterStatus>('ALL');

  public readonly retryingId = signal<string | null>(null);

  // Print modal state
  public readonly showPrintModal = signal<boolean>(false);
  public readonly selectedPrintData = signal<PrintableInvoiceData | null>(null);

  async ngOnInit(): Promise<void> {
    await this.loadInvoices();
  }

  public async loadInvoices(): Promise<void> {
    const tenantId = this.auth.currentTenantId();
    if (!tenantId) return;

    const list = await this.db.getAllInvoices(tenantId);
    // Sort newest first by creation date or document number
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    this.invoices.set(list);
  }

  /**
   * Filtered items matching search term, document type, and transmission status
   */
  public readonly filteredInvoices = computed(() => {
    const list = this.invoices();
    const q = this.searchQuery().trim().toLowerCase();
    const type = this.selectedType();
    const status = this.selectedStatus();

    return list.filter((inv) => {
      // 1. Status Filter
      if (status === 'TRANSMITTED' && inv.transmissionStatus !== 'TRANSMITTED') return false;
      if (status === 'FAILED' && inv.transmissionStatus !== 'FAILED') return false;
      if (status === 'DRAFT' && inv.transmissionStatus === 'TRANSMITTED') return false;

      // 2. Type Filter
      if (type !== 'ALL' && inv.invoiceType !== type) return false;

      // 3. Search Query
      if (q) {
        const fullDoc = `${inv.series}-${inv.documentNumber}`.toLowerCase();
        const afm = (inv.customerAfm || '').toLowerCase();
        const name = (inv.customerName || '').toLowerCase();
        const mark = (inv.mark || '').toLowerCase();
        return fullDoc.includes(q) || afm.includes(q) || name.includes(q) || mark.includes(q);
      }

      return true;
    });
  });

  /**
   * Turnover calculations
   */
  public readonly totalsSummary = computed(() => {
    const list = this.filteredInvoices();
    const net = list.reduce((acc, i) => acc + (Number(i.totalNet) || 0), 0);
    const vat = list.reduce((acc, i) => acc + (Number(i.totalVat) || 0), 0);
    const gross = list.reduce((acc, i) => acc + (Number(i.totalGross) || 0), 0);

    const transmitted = list.filter((i) => i.transmissionStatus === 'TRANSMITTED').length;
    const rate = list.length > 0 ? Math.round((transmitted / list.length) * 100) : 0;

    return { net, vat, gross, transmittedCount: transmitted, successRate: rate };
  });

  public getDocTypeBadge(type: string): string {
    switch (type) {
      case '1.1': return '1.1 Τιμολόγιο Πώλησης';
      case '2.1': return '2.1 Παροχή Υπηρεσιών';
      case '9.3': return '9.3 Δελτίο Αποστολής';
      default: return type;
    }
  }

  /**
   * Opens the existing print component with stored invoice data & AADE QR code
   */
  public async openPrintModal(inv: LocalInvoiceRecord): Promise<void> {
    const tenantId = this.auth.currentTenantId();
    const settings = tenantId ? await this.db.getSettingsForTenant(tenantId) : null;
    const s = (settings || {}) as any;

    let parsed: any = {};
    try {
      parsed = typeof inv.payloadJson === 'string' ? JSON.parse(inv.payloadJson) : (inv.payloadJson || {});
    } catch {
      parsed = {};
    }

    const lines = parsed.lines || [];
    const isDispatch = inv.invoiceType === '9.1' || inv.invoiceType === '9.3';

    const printable: PrintableInvoiceData = {
      series: inv.series,
      documentNumber: Number(inv.documentNumber || 1),
      issueDate: inv.issueDate,
      invoiceType: inv.invoiceType,
      issuer: {
        legalName: s.legalName || this.auth.activeTenant()?.name || 'Επωνυμία Επιχείρησης',
        tradeName: s.tradeName || s.commercialTitle,
        afm: s.afm || '',
        doy: s.doy,
        branch: Number(s.branch ?? 0),
        address: {
          street: s.street || s.address?.street || '',
          number: s.number || s.address?.number || '',
          postalCode: s.postalCode || s.address?.postalCode || '',
          city: s.city || s.address?.city || '',
        },
        phone: s.phone,
        email: s.email,
      },
      customer: {
        id: parsed.customer?.id || crypto.randomUUID(),
        legalName: inv.customerName || 'ΙΔΙΩΤΗΣ / ΠΕΛΑΤΗΣ',
        afm: inv.customerAfm || '000000000',
        doy: parsed.customer?.doy || '',
        branch: Number(parsed.customer?.branch ?? 0),
        country: parsed.customer?.country || 'GR',
        email: parsed.customer?.email || '',
        address: {
          street: parsed.customer?.street || '',
          number: parsed.customer?.number || '',
          postalCode: parsed.customer?.postalCode || '',
          city: parsed.customer?.city || '',
        },
      },
      lines: lines.map((l: any, idx: number) => ({
        id: l.id || `l-${idx}`,
        lineNumber: idx + 1,
        description: l.description || '',
        quantity: Number(l.quantity) || 1,
        unitPrice: isDispatch ? 0 : Number(l.unitPrice || 0),
        discountPercentage: Number(l.discountPercentage || 0),
        netValue: isDispatch ? 0 : Number(l.netValue || 0),
        vatPercentage: isDispatch ? 0 : Number(l.vatPercentage ?? 24),
        vatAmount: isDispatch ? 0 : Number(l.vatAmount || 0),
        totalValue: isDispatch ? 0 : Number(l.totalValue || 0),
      })),
      totals: {
        totalNetValue: inv.totalNet,
        totalVatAmount: inv.totalVat,
        totalGrossValue: inv.totalGross,
        vatBreakdowns: [],
      },
      mark: inv.mark || '',
      uid: inv.uid || '',
      qrUrl: inv.qrUrl || (inv.mark ? `https://mydatapi.aade.gr/myDATA/qrUrl?mark=${inv.mark}` : ''),
      xmlPayload: inv.mark ? undefined : inv.payloadJson,
      movement: parsed.movement,
    };

    this.selectedPrintData.set(printable);
    this.showPrintModal.set(true);
  }

  /**
   * Retries submission to myDATA for unsubmitted or failed records
   */
  public async retryTransmission(inv: LocalInvoiceRecord): Promise<void> {
    const id = inv.id != null ? String(inv.id) : null;
    if (!id) return;

    this.retryingId.set(id);
    try {
      const res = await this.myData.transmitInvoice(inv);
      if (res.success && res.mark) {
        inv.mark = res.mark;
        inv.uid = res.uid;
        inv.qrUrl = res.qrUrl;
        inv.transmissionStatus = 'TRANSMITTED';
        inv.updatedAt = Date.now();

        await this.db.invoices.update(id, {
          mark: res.mark,
          uid: res.uid,
          qrUrl: res.qrUrl,
          transmissionStatus: 'TRANSMITTED',
          updatedAt: inv.updatedAt,
        });

        await this.loadInvoices();
      } else {
        alert(`Αποτυχία myDATA: ${res.error || 'Άγνωστο σφάλμα'}`);
      }
    } catch (err: any) {
      alert(`Σφάλμα δικτύου: ${err.message || err}`);
    } finally {
      this.retryingId.set(null);
    }
  }
}
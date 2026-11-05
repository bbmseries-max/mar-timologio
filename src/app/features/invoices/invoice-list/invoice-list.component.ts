import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LocalInvoiceRecord, TenantSettingsRecord } from '@core/models/database.models';
import { PrintableInvoiceData } from '../invoice-print/invoice-print.component';
import { MyDataService } from '@core/services/mydata.service';
import { LocalDbService } from '../../../core/services/local-db.service';
import { InvoicePrintComponent } from '../invoice-print/invoice-print.component';
import { TenantIntegrationService } from '@core/services/tenant-integration.service';

export type StatusFilterType = 'ALL' | 'TRANSMITTED' | 'CANCELLED' | 'DRAFT' | 'FAILED';

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, InvoicePrintComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './invoice-list.component.html'
})
export class InvoiceListComponent implements OnInit {
  private readonly myDataService = inject(MyDataService);
  private readonly db = inject(LocalDbService);
  private readonly tenantService = inject(TenantIntegrationService);

  // Raw data from Dexie
  public readonly allInvoices = signal<any[]>([]);
  public readonly isLoading = signal<boolean>(true);

  // Filter Signals
  public readonly searchQuery = signal<string>('');
  public readonly statusFilter = signal<StatusFilterType>('ALL');
  public readonly seriesFilter = signal<string>('ALL');
  public readonly dateFrom = signal<string>('');
  public readonly dateTo = signal<string>('');

  // Print modal state
  public readonly selectedInvoiceForPrint = signal<any | null>(null);
  public readonly isCancelling = signal<Record<string, boolean>>({});

  // Computed: Distinct available series (e.g. ['ALL', 'DEV', 'A', 'ΤΠΥ'])
  public readonly availableSeries = computed(() => {
    const set = new Set<string>();
    for (const inv of this.allInvoices()) {
      if (inv.series) set.add(inv.series.toUpperCase());
    }
    return ['ALL', ...Array.from(set)];
  });

  // Computed: Filtered list matching all criteria
  public readonly filteredInvoices = computed(() => {
    const list = this.allInvoices();
    const query = this.searchQuery().trim().toLowerCase();
    const status = this.statusFilter();
    const series = this.seriesFilter();
    const from = this.dateFrom();
    const to = this.dateTo();

    return list.filter(inv => {
      // 1. Status Filter
      if (status === 'TRANSMITTED' && (inv.transmissionStatus !== 'TRANSMITTED' || !inv.mark)) return false;
      if (status === 'CANCELLED' && inv.transmissionStatus !== 'CANCELLED') return false;
      if (status === 'DRAFT' && (inv.transmissionStatus !== 'DRAFT' || !!inv.mark)) return false;
      if (status === 'FAILED' && inv.transmissionStatus !== 'FAILED') return false;

      // 2. Series Filter
      if (series !== 'ALL' && (inv.series || '').toUpperCase() !== series) return false;

      // 3. Date Filters
      if (from && inv.issueDate < from) return false;
      if (to && inv.issueDate > to) return false;

      // 4. Text Search (Series-Number, Customer Name, AFM, MARK)
      if (query) {
        const fullDoc = `${inv.series || ''}-${inv.documentNumber || ''}`.toLowerCase();
        const name = (inv.customerName || '').toLowerCase();
        const afm = (inv.customerAfm || '').toLowerCase();
        const mark = (inv.mark || '').toLowerCase();
        const cancelMark = (inv.cancellationMark || '').toLowerCase();

        return fullDoc.includes(query) || name.includes(query) || afm.includes(query) || mark.includes(query) || cancelMark.includes(query);
      }

      return true;
    });
  });

  // Computed: KPI Totals from the currently filtered view (excluding cancelled)
  public readonly kpiSummary = computed(() => {
    const items = this.filteredInvoices();
    let grossTotal = 0;
    let netTotal = 0;
    let vatTotal = 0;
    let transmittedCount = 0;
    let cancelledCount = 0;
    let draftCount = 0;

    for (const inv of items) {
      if (inv.transmissionStatus === 'CANCELLED') {
        cancelledCount++;
        continue; // Exclude cancelled from active gross revenue
      }
      if (inv.transmissionStatus === 'DRAFT') {
        draftCount++;
      } else if (inv.mark) {
        transmittedCount++;
      }
      grossTotal += Number(inv.totalGross || 0);
      netTotal += Number(inv.totalNet || 0);
      vatTotal += Number(inv.totalVat || 0);
    }

    return { grossTotal, netTotal, vatTotal, transmittedCount, cancelledCount, draftCount, totalCount: items.length };
  });

  public async ngOnInit(): Promise<void> {
    await this.loadInvoices();
  }

  public async loadInvoices(): Promise<void> {
    this.isLoading.set(true);
    try {
      const records = await this.db.invoices.toArray();
      // Sort newest first
      records.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      this.allInvoices.set(records);
    } finally {
      this.isLoading.set(false);
    }
  }

  // Export filtered rows to CSV
  public exportCsv(): void {
    const rows = this.filteredInvoices();
    if (!rows.length) {
      alert('Δεν υπάρχουν δεδομένα προς εξαγωγή.');
      return;
    }

    const headers = ['Σειρά', 'Αριθμός', 'Ημερομηνία', 'Τύπος', 'Πελάτης', 'ΑΦΜ', 'Καθαρή', 'ΦΠΑ', 'Σύνολο', 'Κατάσταση', 'MARK', 'Cancel MARK'];
    const csvContent = [
      headers.join(';'),
      ...rows.map(r => [
        r.series,
        r.documentNumber,
        r.issueDate,
        r.invoiceType,
        `"${(r.customerName || '').replace(/"/g, '""')}"`,
        r.customerAfm,
        (r.totalNet || 0).toFixed(2),
        (r.totalVat || 0).toFixed(2),
        (r.totalGross || 0).toFixed(2),
        r.transmissionStatus,
        r.mark || '',
        r.cancellationMark || ''
      ].join(';'))
    ].join('\r\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Invoices_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  public async onCancelInvoice(inv: any): Promise<void> {
    if (!inv?.mark) {
      alert(`Το παραστατικό δεν έχει έγκυρο MARK από την ΑΑΔΕ (είναι πρόχειρο ή δεν απεστάλη).`);
      return;
    }

    const docRef = `${inv.series || 'DEV'}-${inv.documentNumber || inv.aa || 1}`;
    if (!confirm(`Είστε βέβαιοι για την ακύρωση του παραστατικού ${docRef} (MARK: ${inv.mark}) στην ΑΑΔΕ;`)) {
      return;
    }

    this.isCancelling.update(state => ({ ...state, [inv.id]: true }));

    try {
      // 1. Service call via injected myDataService (or this.myData)
      const res = await this.myDataService.cancelInvoice(inv);

      if (res.success && res.cancellationMark) {
        // 2. Type-safe update on Dexie LocalInvoiceRecord
        await (this.db as any).invoices.update(inv.id, {
          transmissionStatus: 'CANCELLED',
          status: 'cancelled',
          cancellationMark: res.cancellationMark,
          updatedAt: Date.now()
        });

        // 3. Reload list
        await this.loadInvoices();
        alert(`✅ Επιτυχής ακύρωση στην ΑΑΔΕ!\nΑριθμός Ακύρωσης (Cancellation MARK): ${res.cancellationMark}`);
      } else {
        const errMsg = res.errors?.join('\n') || 'Η ακύρωση απορρίφθηκε από την ΑΑΔΕ.';
        alert(`❌ Αποτυχία ακύρωσης:\n${errMsg}`);
      }
    } catch (err: any) {
      console.error('Cancel error:', err);
      alert(`❌ Σφάλμα συστήματος κατά την ακύρωση: ${err?.message || err}`);
    } finally {
      this.isCancelling.update(state => ({ ...state, [inv.id]: false }));
    }
  }

  public async deleteDraft(id: string): Promise<void> {
    if (!confirm('Θέλετε να διαγράψετε αυτό το πρόχειρο;')) return;
    await this.db.invoices.delete(id);
    await this.loadInvoices();
  }

  public viewInvoice(inv: LocalInvoiceRecord): void {
  if (!inv) return;

  let snapshot: any = {};
  try {
    snapshot = inv.payloadJson ? JSON.parse(inv.payloadJson) : {};
  } catch (e) {
    console.error('Failed to parse invoice payloadJson', e);
  }

  // 1. Try to get issuer from the saved invoice snapshot first (most accurate for historic invoices)
  const savedIssuer = snapshot.issuer || {};

  // 2. Fallback to active tenant settings from service
  const tenantSvc = this.tenantService as any;
  const tenant: Partial<TenantSettingsRecord> = 
    (typeof tenantSvc.settings === 'function' ? tenantSvc.settings() : null) ||
    (typeof tenantSvc.tenantRecord === 'function' ? tenantSvc.tenantRecord() : null) ||
    (typeof tenantSvc.currentTenantData === 'function' ? tenantSvc.currentTenantData() : null) ||
    tenantSvc.currentTenant ||
    {};

  const printableData: PrintableInvoiceData = {
    series: inv.series,
    documentNumber: inv.documentNumber,
    issueDate: inv.issueDate,
    invoiceType: inv.invoiceType,
    issuer: {
      legalName: savedIssuer.legalName || tenant.legalName || 'ΜΑΡΑΝΘ ΜΟΝΟΠΡΟΣΩΠΗ ΙΚΕ',
      tradeName: savedIssuer.tradeName || tenant.tradeName || '',
      afm: savedIssuer.afm || tenant.afm || '067424104',
      doy: savedIssuer.doy || tenant.doy || 'ΚΕΦΟΔΕ ΑΤΤΙΚΗΣ',
      branch: savedIssuer.branch ?? tenant.branch ?? 0,
      address: savedIssuer.address || {
        street: tenant.street || 'ΒΑΡΔΟΥΝΙΩΤΗ',
        number: tenant.number || '11',
        postalCode: tenant.postalCode || '11522',
        city: tenant.city || 'ΑΘΗΝΑ'
      },
      phone: savedIssuer.phone || tenant.phone || '',
      email: savedIssuer.email || tenant.email || ''
    },
    customer: snapshot.customer || snapshot.counterpart || {
      legalName: inv.customerName || '—',
      afm: inv.customerAfm || '',
      doy: snapshot.counterpart?.doy || snapshot.customer?.doy || '',
      address: snapshot.counterpart?.address || snapshot.customer?.address || {
        street: 'Λ ΚΗΦΙΣΣΟΥ',
        number: '40',
        postalCode: '12133',
        city: 'ΠΕΡΙΣΤΕΡΙ'
      }
    },
    lines: snapshot.lines || [],
    totals: snapshot.totals || {
      totalNetValue: inv.totalNet,
      totalVatAmount: inv.totalVat,
      totalGrossValue: inv.totalGross,
      totalWithheldAmount: 0,
      totalFeesAmount: 0,
      totalStampDutyAmount: 0,
      totalOtherTaxesAmount: 0,
      totalDeductionsAmount: 0
    },
    mark: inv.mark || '—',
    uid: inv.uid || '—',
    qrUrl: inv.qrUrl || '',
    xmlPayload: snapshot.xmlPayload || ''
  };

  this.selectedInvoiceForPrint.set(printableData);
}

  public closePrintModal(): void {
    this.selectedInvoiceForPrint.set(null);
  }
}
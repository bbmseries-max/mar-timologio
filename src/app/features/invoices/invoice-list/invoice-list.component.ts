import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LocalDbService } from '../../../core/services/local-db.service';
import { InvoicePrintComponent } from '../invoice-print/invoice-print.component';

export type StatusFilterType = 'ALL' | 'TRANSMITTED' | 'CANCELLED' | 'DRAFT' | 'FAILED';

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, InvoicePrintComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './invoice-list.component.html'
})
export class InvoiceListComponent implements OnInit {
  private readonly db = inject(LocalDbService);

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
    if (!confirm(`Είστε βέβαιοι για την ακύρωση του παραστατικού ${inv.series}-${inv.documentNumber};`)) return;
    this.isCancelling.update(state => ({ ...state, [inv.id]: true }));
    try {
      // Call your cancel service method here...
      // await this.myDataService.cancelInvoice(inv);
      await this.loadInvoices();
    } finally {
      this.isCancelling.update(state => ({ ...state, [inv.id]: false }));
    }
  }

  public async deleteDraft(id: string): Promise<void> {
    if (!confirm('Θέλετε να διαγράψετε αυτό το πρόχειρο;')) return;
    await this.db.invoices.delete(id);
    await this.loadInvoices();
  }

  public viewInvoice(inv: any): void {
    // Open preview using printable payload
    this.selectedInvoiceForPrint.set(inv);
  }

  public closePrintModal(): void {
    this.selectedInvoiceForPrint.set(null);
  }
}
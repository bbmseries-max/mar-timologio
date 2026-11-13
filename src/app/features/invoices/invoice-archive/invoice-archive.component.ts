import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router, Params } from '@angular/router';
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
  templateUrl: './invoice-archive.component.html' 
})
export class InvoiceArchiveComponent implements OnInit {
  private readonly db = inject(LocalDbService);
  private readonly auth = inject(AuthTenantService);
  private readonly myData = inject(MyDataService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  public readonly invoices = signal<LocalInvoiceRecord[]>([]);
  public readonly searchQuery = signal<string>('');
  public readonly selectedType = signal<string>('ALL');
  public readonly selectedStatus = signal<FilterStatus>('ALL');
  
  public readonly highlightedId = signal<string | null>(null);
  public readonly retryingId = signal<string | null>(null);

  public readonly showPrintModal = signal<boolean>(false);
  public readonly selectedPrintData = signal<PrintableInvoiceData | null>(null);

  async ngOnInit(): Promise<void> {
  // 1. Subscribe synchronously BEFORE any 'await' so injection context is valid!
  this.route.queryParams
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(async (params: Params) => {
      const rawTarget = params['createdId'] || params['mark'];
      if (rawTarget && String(rawTarget).trim() !== '') {
        this.highlightedId.set(String(rawTarget).trim());
      }
    });

  // 2. Also read snapshot immediately in case route already resolved
  const snapTarget =
    this.route.snapshot.queryParams['createdId'] ||
    this.route.snapshot.queryParams['mark'];
  if (snapTarget && String(snapTarget).trim() !== '') {
    this.highlightedId.set(String(snapTarget).trim());
  }

  // 3. Now load invoices from Dexie
  await this.loadInvoices();
}

  // Single consolidated method matching either internal UUID/ID or AADE MARK
  public isHighlighted(inv: LocalInvoiceRecord): boolean {
  const hl = this.highlightedId();
  if (!hl) return false;
  const target = String(hl).trim();
  return (
    String(inv.id ?? '').trim() === target ||
    String(inv.mark ?? '').trim() === target
  );
}

  public clearHighlight(): void {
    this.highlightedId.set(null);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { createdId: null, mark: null },
      queryParamsHandling: 'merge',
    });
  }

  public isRetrying(id: unknown): boolean {
    return this.retryingId() === (id != null ? String(id) : null);
  }

  public async loadInvoices(): Promise<void> {
    const tenantId = this.auth.currentTenantId();
    if (!tenantId) return;

    const list = await this.db.getAllInvoices(tenantId);
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    this.invoices.set(list);
  }

  public readonly filteredInvoices = computed(() => {
    const list = this.invoices();
    const hlId = this.highlightedId();

    // Supports matching both internal ID and AADE MARK
    if (hlId) {
      const matched = list.filter((inv) => String(inv.id) === hlId || String(inv.mark) === hlId);
      if (matched.length > 0) return matched;
    }

    const q = this.searchQuery().trim().toLowerCase();
    const type = this.selectedType();
    const status = this.selectedStatus();

    return list.filter((inv) => {
      if (status === 'TRANSMITTED' && inv.transmissionStatus !== 'TRANSMITTED') return false;
      if (status === 'FAILED' && inv.transmissionStatus !== 'FAILED') return false;
      if (status === 'DRAFT' && inv.transmissionStatus === 'TRANSMITTED') return false;

      if (type !== 'ALL' && inv.invoiceType !== type) return false;

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

  public readonly totalsSummary = computed(() => {
  const list = this.filteredInvoices();
  const active = list.filter((i) => !this.isInvoiceCancelled(i));

  const net = active.reduce((acc, i: any) => acc + (Number(i.totalNet ?? i.netTotal ?? i.totals?.totalNetValue) || 0), 0);
  const vat = active.reduce((acc, i: any) => acc + (Number(i.totalVat ?? i.vatTotal ?? i.totals?.totalVatAmount) || 0), 0);
  const gross = active.reduce((acc, i: any) => acc + (Number(i.totalGross ?? i.grossTotal ?? i.totals?.totalGrossValue) || 0), 0);

  const transmitted = active.filter((i) => i.transmissionStatus === 'TRANSMITTED').length;
  const rate = active.length > 0 ? Math.round((transmitted / active.length) * 100) : 0;

  return { net, vat, gross, transmittedCount: transmitted, successRate: rate };
});

  public getDocTypeBadge(type: string): string {
    switch (type) {
      case '1.1': return '1.1 Τιμολόγιο Πώλησης';
      case '1.2': return '1.2 Ενδοκοινοτική';
      case '2.1': return '2.1 Παροχή Υπηρεσιών';
      case '11.1': return '11.1 ΑΛΠ Λιανική';
      case '11.2': return '11.2 ΑΠΥ Παροχής';
      case '9.1': return '9.1 Δελτίο Αποστολής';
      case '9.2': return '9.2 Συγκεντρωτικό Δελτίο';
      case '9.3': return '9.3 Δελτίο Συνοδευτικό';
      default: return type;
    }
  }

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
    const isDispatch = inv.invoiceType === '9.1' || inv.invoiceType === '9.2' || inv.invoiceType === '9.3';

    const printable: PrintableInvoiceData = {
      series: inv.series,
      documentNumber: Number(inv.documentNumber || 1),
      issueDate: inv.issueDate,
      invoiceType: inv.invoiceType,
      isCancelled: this.isInvoiceCancelled(inv),
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
      xmlPayload: undefined,
      movement: parsed.movement,
    };

    this.selectedPrintData.set(printable);
    this.showPrintModal.set(true);
  }

  public async retryTransmission(inv: LocalInvoiceRecord): Promise<void> {
    if (this.isInvoiceCancelled(inv) || inv.transmissionStatus === 'TRANSMITTED') {
    return;
  }
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

        const tenantId = inv.tenantId || this.auth.currentTenantId();
        try {
          await (this.db as any).invoices
            .where('[tenantId+id]')
            .equals([tenantId, inv.id])
            .modify({
              mark: res.mark,
              uid: res.uid,
              qrUrl: res.qrUrl,
              transmissionStatus: 'TRANSMITTED',
              updatedAt: inv.updatedAt,
            });
        } catch {
          await (this.db as any).invoices.update(inv.id, {
            mark: res.mark,
            uid: res.uid,
            qrUrl: res.qrUrl,
            transmissionStatus: 'TRANSMITTED',
            updatedAt: inv.updatedAt,
          });
        }

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

  public async editDraft(inv: LocalInvoiceRecord): Promise<void> {
    if (inv.id == null) return;
    await this.router.navigate(['/invoices/new'], {
      queryParams: { draftId: String(inv.id) },
    });
  }

  public async deleteDraft(inv: LocalInvoiceRecord): Promise<void> {
    if (inv.id == null || inv.transmissionStatus === 'TRANSMITTED') return;

    const ok = confirm(
      `Διαγραφή προχείρου ${inv.series}-${inv.documentNumber};`
    );
    if (!ok) return;

    const tenantId = inv.tenantId || this.auth.currentTenantId();
    const invoicesTable = (this.db as any).invoices;

    try {
      await invoicesTable.where('[tenantId+id]').equals([tenantId, inv.id]).delete();
    } catch {
      await invoicesTable.delete(inv.id);
    }

    await this.loadInvoices();
  }

  public isInvoiceCancelled(inv: LocalInvoiceRecord): boolean {
    return Boolean(inv.cancelledAt) || inv.transmissionStatus === ('CANCELLED' as any);
  }

  public async confirmAndCancelInvoice(inv: LocalInvoiceRecord): Promise<void> {
    if (!inv.mark || inv.transmissionStatus !== 'TRANSMITTED' || this.isInvoiceCancelled(inv)) {
      return;
    }

    const parentMark = String(inv.mark).trim();

    if (inv.invoiceType === '9.2') {
      const activeChildren = this.invoices().filter((other) => {
        if (
          other.id === inv.id ||
          other.transmissionStatus !== 'TRANSMITTED' ||
          this.isInvoiceCancelled(other)
        ) {
          return false;
        }

        // 1. Check raw payloadJson string (catches XML <correlatedInvoices> or any nested JSON key)
        const rawPayload =
          typeof other.payloadJson === 'string'
            ? other.payloadJson
            : JSON.stringify(other.payloadJson || {});

        if (parentMark && rawPayload.includes(parentMark)) {
          return true;
        }

        // 2. Also check structured fields explicitly
        let parsed: any = {};
        try {
          parsed =
            typeof other.payloadJson === 'string'
              ? JSON.parse(other.payloadJson)
              : other.payloadJson || {};
        } catch {
          parsed = {};
        }

        const candidateMarks = [
          parsed.movement?.correlatedMark,
          parsed.correlatedMark,
          parsed.parentMark,
          parsed.aggregateMark,
          ...(Array.isArray(parsed.correlatedInvoices) ? parsed.correlatedInvoices : []),
          ...(Array.isArray(parsed.correlatedMarks) ? parsed.correlatedMarks : []),
        ]
          .filter(Boolean)
          .map((m) => String(m).trim());

        return candidateMarks.includes(parentMark);
      });

      if (activeChildren.length > 0) {
        const childRefs = activeChildren
          .map((c) => `• ${c.series}-${c.documentNumber} (Τύπος ${c.invoiceType}, ΜΑΡΚ: ${c.mark})`)
          .join('\n');

        const proceed = window.confirm(
          `⚠️ ΠΡΟΣΟΧΗ — ΣΥΣΧΕΤΙΣΜΕΝΑ ΔΕΛΤΙΑ ΑΠΟΣΤΟΛΗΣ\n\n` +
            `Το Συγκεντρωτικό Δελτίο ${inv.series}-${inv.documentNumber} (ΜΑΡΚ: ${inv.mark}) συνδέεται με ${activeChildren.length} ενεργό/ά παραστατικό/ά:\n\n` +
            `${childRefs}\n\n` +
            `Η ΑΑΔΕ ΔΕΝ ακυρώνει αυτόματα τα συσχετισμένα δελτία. Θα παραμείνουν ενεργά ως ορφανά αν δεν τα ακυρώσετε ξεχωριστά.\n\n` +
            `Θέλετε να συνεχίσετε με την ακύρωση του ${inv.series}-${inv.documentNumber};`
        );
        if (!proceed) return;
      } else {
        const standard92Confirm = window.confirm(
          `Είστε βέβαιοι ότι θέλετε να ακυρώσετε το Συγκεντρωτικό Δελτίο ${inv.series}-${inv.documentNumber} (ΜΑΡΚ: ${inv.mark}) στην ΑΑΔΕ;`
        );
        if (!standard92Confirm) return;
      }
    } else {
      const standardConfirm = window.confirm(
        `Είστε βέβαιοι ότι θέλετε να ακυρώσετε οριστικά το παραστατικό ${inv.series}-${inv.documentNumber} (ΜΑΡΚ: ${inv.mark}) στην ΑΑΔΕ;`
      );
      if (!standardConfirm) return;
    }

    await this.executeMyDataCancellation(inv);
  }

  private async executeMyDataCancellation(inv: LocalInvoiceRecord): Promise<void> {
    if (!inv.mark) return;
    const idStr = inv.id != null ? String(inv.id) : null;
    if (idStr) this.retryingId.set(idStr);

    try {
      const service = this.myData as any;
      const res =
        typeof service.cancelInvoice === 'function'
          ? await service.cancelInvoice(inv.mark, inv)
          : await service.cancelDocument(inv.mark, inv);

      if (res?.success) {
        const now = Date.now();
        const cancelledAtIso = new Date(now).toISOString();
        const cancellationMark = res.cancellationMark || res.mark || '';
        const invoicesTable = (this.db as any).invoices;

        const patch: Record<string, any> = {
          cancelledAt: cancelledAtIso,
          cancellationMark,
          transmissionStatus: 'CANCELLED',
          updatedAt: now,
        };

        await invoicesTable.update(inv.id, patch);
        await this.loadInvoices();
      } else {
        alert(`Αποτυχία ακύρωσης myDATA: ${res?.error || 'Άγνωστο σφάλμα'}`);
      }
    } catch (err: any) {
      alert(`Σφάλμα δικτύου κατά την ακύρωση: ${err?.message || err}`);
    } finally {
      this.retryingId.set(null);
    }
  }
}
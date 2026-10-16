import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  effect,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { MyDataService } from '@core/services/mydata.service';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { greekAfmValidator, isValidGreekAfm } from '@core/validators/afm.validator';
import { LocalCustomerRecord, LocalDbService } from '@core/services/local-db.service';
import { CartBridgeService } from '@core/services/cart-bridge.service';
import { ProductImportModalComponent } from '../../catalog/product-import-modal.component';
import { AuthTenantService } from '@core/services/auth-tenant.service';
import { TenantIntegrationService } from '@core/services/tenant-integration.service';
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
import { buildInvoicesDocXml } from '@core/services/mydata-xml-builder';

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
  templateUrl: `./invoice-builder.component.html`,
})
export class InvoiceBuilderComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly myData = inject(MyDataService);
  private readonly serializer = inject(AadeSerializerService);
  private readonly db = inject(LocalDbService);
  public readonly auth = inject(AuthTenantService);
  private readonly cartBridge = inject(CartBridgeService);
  private readonly gsisService = inject(GsisLookupService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy$ = new Subject<void>();
  private readonly tenantIntegration = inject(TenantIntegrationService);

  public readonly gsisLoading = signal<boolean>(false);
  public readonly gsisError = signal<string | null>(null);

  public readonly currentDraftId = signal<string | null>(crypto.randomUUID());
  public readonly autoSaveStatus = signal<string>('Έτοιμο');
  public readonly showImportModal = signal<boolean>(false);

  public readonly lineItemsSignal = signal<InvoiceLineItem[]>([]);
  public readonly searchQuery = signal<string>('');
  public readonly searchResults = signal<Product[]>([]);
  public readonly isSearching = signal<boolean>(false);

  private handoverConsumed = false;
public handoverReceived = false;

  public readonly computedTotals = computed(() =>
    calculateInvoiceTotals(this.lineItemsSignal())
  );
  

  public readonly showPrintModal = signal<boolean>(false);
  public readonly printableData = signal<PrintableInvoiceData | null>(null);

  public readonly customerSearchQuery = signal<string>('');
  public readonly customerResults = signal<LocalCustomerRecord[]>([]);

  public readonly invoiceForm = this.fb.group({
    series: ['', Validators.required],
    documentNumber: [1, [Validators.required, Validators.min(1)]],
    issueDate: [new Date().toISOString().substring(0, 10), Validators.required],
    invoiceType: ['1.1', Validators.required],
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
      vehicleNumber: [''],
      movePurpose: [1, Validators.required],
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
  
// Helper: read the current type safely
private get currentDocType(): string {
  return String(this.invoiceForm?.get('invoiceType')?.value ?? '').trim();
}

/**
 * Any document that moves physical goods and requires the Goods Movement Panel:
 * 9.1, 9.3 (pure dispatches) and 1.2 (combined invoice + dispatch)
 */
get isMovementDocument(): boolean {
  const type = this.currentDocType;
  return type === '1.1' || type === '9.1' || type === '9.3';
}

/**
 * Pure dispatch notes (non-fiscal: zero net/VAT totals, quantity15, no revenue classification):
 * 9.1 and 9.3
 */
get isPureDispatch(): boolean {
  const type = this.currentDocType;
  return type === '9.1' || type === '9.3';
}

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

  get isAfmInvalid(): boolean {
  const ctrl = this.invoiceForm.get('customer.afm');
  if (!ctrl) return false;
  const len = String(ctrl.value || '').trim().length;
  return ctrl.hasError('invalidGreekAfm') && (ctrl.touched || len >= 9);
}

  constructor() {
    // 1. Reactive bridge listener for background BroadcastChannel / postMessage handovers
    effect(() => {
      const handover = this.tenantIntegration.pendingHandover();
      if (handover && !this.handoverConsumed) {
        this.handoverConsumed = true;
        this.applyIncomingHandover(handover);
        this.tenantIntegration.clearPending();
      }
    });
  }

  public checkFormValidity(): void {
  const getInvalidControls = (formGroup: any, parentKey = ''): void => {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      const fullPath = parentKey ? `${parentKey}.${key}` : key;
      if (control?.invalid) {
        console.warn(`❌ INVALID FIELD: [${fullPath}]`, control.errors, 'Current value:', control.value);
      }
      if (control?.controls) {
        getInvalidControls(control, fullPath);
      }
    });
  };

  console.group('🔍 Form Validity Audit');
  console.log('Form Status:', this.invoiceForm.status);
  console.log('Form Valid?', this.invoiceForm.valid);
  getInvalidControls(this.invoiceForm);
  console.groupEnd();
}

  async ngOnInit(): Promise<void> {
    const currentTenantId = this.auth.currentTenantId();

    // 1. Pre-load Tenant Business Defaults (Address & Base Series)
    let tenantDefaultSeries = 'Α';
    if (currentTenantId) {
      const myBusiness = await this.db.getSettingsForTenant(currentTenantId);
      if (myBusiness) {
        const b = myBusiness as any;
        tenantDefaultSeries = b.defaultSeries || 'Α';

        this.invoiceForm.get('movement.addressFrom')?.patchValue({
          street: b.street || '',
          number: b.number || '',
          postalCode: b.postalCode || '',
          city: b.city || '',
        }, { emitEvent: false });
      }
    }

    // 2. Resolve Data Source (Priority: Direct Bridge -> Draft ID -> Empty Seed)
    const targetDraftId =
      this.route.snapshot.paramMap.get('id') ||
      this.route.snapshot.queryParamMap.get('draftId');

    // Trigger URL parse (void return)
    this.cartBridge.checkUrlPayload();

    if (this.tenantIntegration.pendingHandover() && !this.handoverConsumed) {
      this.handoverConsumed = true;
      const handover = this.tenantIntegration.pendingHandover()!;
      this.applyIncomingHandover(handover);
      this.tenantIntegration.clearPending();
    } else if (targetDraftId) {
      const draft = await this.db.getInvoiceById(targetDraftId);
      if (draft) {
        this.restoreDraft(draft);
      } else {
        this.applyDefaultSeriesAndSeed(tenantDefaultSeries);
      }
    } else if (!this.handoverConsumed) {
      this.applyDefaultSeriesAndSeed(tenantDefaultSeries);
    }

    // 3. Calculate initial document sequential number
    await this.updateNextDocumentNumber();

    // 4. Series change listener -> Auto calculate next AA
    this.invoiceForm.get('series')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (newSeries) => {
        if (newSeries) {
          await this.updateNextDocumentNumber();
        }
      });

    // 5. Document Type change listener -> Adjust Logistics / Movement rules
    this.updateMovementDocState(this.invoiceForm.get('invoiceType')?.value);
    this.invoiceForm.get('invoiceType')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((type) => {
        this.updateMovementDocState(type);
      });

    // 6. Global Form listener -> Validity Audit & Auto-save (debounced)
    this.invoiceForm.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300)
      )
      .subscribe(() => {
        this.checkFormValidity();
        this.autoSaveStatus.set('Αποθήκευση...');
        this.debouncedSave();
      });
  }

  private applyDefaultSeriesAndSeed(defaultSeries: string): void {
    const currentSeries = this.invoiceForm.get('series')?.value;
    if (!currentSeries) {
      this.invoiceForm.get('series')?.setValue(defaultSeries, { emitEvent: false });
    }
    if (this.linesArray.length === 0) {
      this.seedInitialLine();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }


  private restoreDraft(draft: LocalInvoiceRecord): void {
    try {
      const payload = JSON.parse(draft.payloadJson);
      this.currentDraftId.set(draft.id == null ? null : String(draft.id));

      this.invoiceForm.enable({ emitEvent: false });
      this.invoiceForm.patchValue(payload, { emitEvent: false });

      this.linesArray.clear();
      if (Array.isArray(payload.lines) && payload.lines.length > 0) {
  const currentType = String(payload.invoiceType ?? payload.documentType ?? '').trim();
  const isDeltio = currentType === '9.1' || currentType === '9.3';

  for (const l of payload.lines) {
    this.linesArray.push(
      this.fb.group({
        description: [l.description || '', Validators.required],
        quantity: [l.quantity ?? 1, [Validators.required, Validators.min(0.01)]],
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
    this.handoverConsumed = true;

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
    const returnSeries = 'ΕΠΙΣΤΡ';

    this.invoiceForm.patchValue({
      invoiceType: '9.3', // ✅ Standalone dispatch note (or keep as needed for returns)
      series: returnSeries,
      movement: {
        vehicleNumber: '',
        movePurpose: 6, // 6 = Επιστροφή (Return)
        dispatchDateTime: new Date().toISOString().substring(0, 16),
      },
    }, { emitEvent: false });

    this.updateMovementDocState('9.3');
    
    // Explicitly recalculate the sequential number for series 'ΕΠΙΣΤΡ'
    this.updateNextDocumentNumber();
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

    if (this.isMovementDocument && c.address) {
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
    const isMov = type === '1.1' || type === '9.1' || type === '9.3';
    // this.isMovementDocument.set(isMov);
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

  /**
   * Fetches the next available sequential number for the active tenant and series
   */
  public async updateNextDocumentNumber(): Promise<void> {
    const tenantId = this.auth.currentTenantId();
    const series = this.invoiceForm.get('series')?.value;
    if (!tenantId || !series) return;

    // Do not overwrite document number if we are viewing/editing an existing saved draft
    if (this.currentDraftId() && this.invoiceForm.get('documentNumber')?.dirty) {
      return;
    }

    const nextNumber = await this.db.getNextDocumentNumber(tenantId, series);
    this.invoiceForm.get('documentNumber')?.setValue(nextNumber, { emitEvent: false });
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
      series: formVal.series || 'A',
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
      series: s.defaultSeries || 'Α',
      documentNumber: 1,
      issueDate: new Date().toISOString().substring(0, 10),
      invoiceType: '1.1', // <-- Reset to 1.1
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
        movePurpose: 1,
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
    this.updateMovementDocState('1.1');
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
    const shopSettings = await this.db.getSettingsForTenant(tenantId);
if (shopSettings?.afm && rawAfm === shopSettings.afm.replace(/\D/g, '')) {
  // It's your own company AFM, not a customer
  alert('Το Α.Φ.Μ. αυτό ανήκει στο κατάστημά σας (Εκδότης), όχι σε πελάτη/παραλήπτη.');
  return;
}

    try {
      const cachedCustomer = await this.db.getCustomerByAfm(tenantId, rawAfm);
if (cachedCustomer) {
  this.populateCustomerForm({
    legalName: cachedCustomer.legalName,
    doy: cachedCustomer.doy,
    address: {
      street: cachedCustomer.address?.street || (cachedCustomer as any).street || '',
      number: cachedCustomer.address?.number || (cachedCustomer as any).number || '',
      postalCode: cachedCustomer.address?.postalCode || (cachedCustomer as any).postalCode || '',
      city: cachedCustomer.address?.city || (cachedCustomer as any).city || '',
    }
  });
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

    if (this.isMovementDocument) {
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

    const movementData: GoodsMovementData | undefined = this.isMovementDocument
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

  public async sendToMyData(invoice: LocalInvoiceRecord): Promise<void> {
    try {
      const result = await this.myData.transmitInvoice(invoice);

      if (result.success && result.mark) {
        console.log(`myDATA Transmission Successful! MARK: ${result.mark}, UID: ${result.uid}`);

        invoice.mark = result.mark;
        invoice.uid = result.uid;
        invoice.qrUrl = result.qrUrl ?? invoice.qrUrl ?? '';
        invoice.transmissionStatus = 'TRANSMITTED';
        invoice.updatedAt = Date.now();

        const invoiceId = invoice.id != null ? String(invoice.id) : null;
        if (invoiceId) {
          await this.db.invoices.update(invoiceId, {
            mark: result.mark,
            uid: result.uid,
            qrUrl: invoice.qrUrl,
            transmissionStatus: 'TRANSMITTED',
            updatedAt: invoice.updatedAt,
          });
          this.autoSaveStatus.set(`Εκδόθηκε με επιτυχία! ΜΑΡΚ: ${result.mark}`);
        }

        // Show print modal...
        // ... (existing printableData.set logic) ...

        // Prepare the counter for the NEXT invoice automatically:
        const tenantId = this.auth.currentTenantId();
        if (tenantId) {
          const nextAa = await this.db.getNextDocumentNumber(tenantId, invoice.series);
          // Set up a fresh draft ID and update documentNumber
          this.currentDraftId.set(crypto.randomUUID());
          this.invoiceForm.get('documentNumber')?.setValue(nextAa, { emitEvent: false });
        }
      } else {
        console.warn('myDATA Transmission rejected:', result.error);
        const invoiceId = invoice.id != null ? String(invoice.id) : null;
        if (invoiceId) {
          await this.db.invoices.update(invoiceId, {
            transmissionStatus: 'FAILED',
            updatedAt: Date.now(),
          });
        }
        this.autoSaveStatus.set(`Αποτυχία myDATA: ${result.error || 'Σφάλμα myDATA'}`);
      }
      const tenantId = this.auth.currentTenantId();
        if (tenantId) {
          const nextAa = await this.db.getNextDocumentNumber(tenantId, invoice.series);
          // Set up a fresh draft ID and update documentNumber
          this.currentDraftId.set(crypto.randomUUID());
          this.invoiceForm.get('documentNumber')?.setValue(nextAa, { emitEvent: false });
        }
    } catch (err: unknown) {
      console.error('Network or gateway failure during myDATA transmission:', err);
      this.autoSaveStatus.set('Σφάλμα δικτύου κατά την αποστολή');
    }
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
      const qty = Number(r.quantity) || 1;
      let unitPr = isDeltio ? 0 : Number(r.unitPrice) || 0;

      // Compute net value properly if not deltio
      let netVal = 0;
      if (!isDeltio) {
        netVal = Number(r.netValue) > 0 ? Number(r.netValue) : Number((qty * unitPr).toFixed(2));
      }

      const vatCat = (Number(r.vatRateCategory) || 1) as VatRateCategory;
      let vatPct = 24;
      if (vatCat === 2) vatPct = 13;
      else if (vatCat === 3) vatPct = 6;
      else if (vatCat === 7) vatPct = 0;

      const vatAmt = isDeltio ? 0 : Number(((netVal * vatPct) / 100).toFixed(2));
      const totVal = isDeltio ? 0 : Number((netVal + vatAmt).toFixed(2));

      return {
        id: String(i + 1),
        lineNumber: i + 1,
        description: r.description || '',
        quantity: qty,
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

  public async onSaveAndSubmit(): Promise<void> {
    if (this.invoiceForm.invalid) {
      this.invoiceForm.markAllAsTouched();
      return;
    }

    this.syncLines();
    const currentLines = this.lineItemsSignal();

    const totalNet = currentLines.reduce((acc, item) => acc + (item.netValue || 0), 0);
    const totalVat = currentLines.reduce((acc, item) => acc + (item.vatAmount || 0), 0);
    const totalGross = currentLines.reduce((acc, item) => acc + (item.totalValue || 0), 0);

    const invoiceRecord: LocalInvoiceRecord = {
      id: this.currentDraftId() || crypto.randomUUID(),
      tenantId: this.auth.currentTenantId() || 'tenant_minimarket',
      series: this.invoiceForm.get('series')?.value || 'TEST',
      documentNumber: Number(this.invoiceForm.get('documentNumber')?.value) || 1,
      issueDate: this.invoiceForm.get('issueDate')?.value || new Date().toISOString().split('T')[0],
      invoiceType: this.invoiceForm.get('invoiceType')?.value || '1.1',
      customerAfm: this.invoiceForm.get('customer.afm')?.value || '',
      customerName: this.invoiceForm.get('customer.legalName')?.value || '',
      totalNet: Number(totalNet.toFixed(2)),
      totalVat: Number(totalVat.toFixed(2)),
      totalGross: Number(totalGross.toFixed(2)),
      transmissionStatus: 'DRAFT',
      payloadJson: JSON.stringify(this.invoiceForm.getRawValue()),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.db.invoices.put(invoiceRecord);
    console.log('Saved draft to Dexie with ID:', invoiceRecord.id);

    await this.sendToMyData(invoiceRecord);
  }
}
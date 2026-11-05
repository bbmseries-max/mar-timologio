import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  effect,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { EnvironmentBannerComponent } from './environment-banner.component';
import { Subject } from 'rxjs';
import { GsisLookupService, GsisCompanyRecord } from '@core/services/gsis-lookup.service';
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
import {
  VatRateCategory,
  InvoiceLineItem,
} from '@core/models/aade.models';
import { ContractAgreementComponent, ContractCustomerData } from '../../contracts/contract-agreement.component';
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
    ContractAgreementComponent,
    EnvironmentBannerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: `./invoice-builder.component.html`,
})
export class InvoiceBuilderComponent implements OnInit, OnDestroy {
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
  readonly currentEnvironment = this.myData.currentEnvironment;

  public readonly computedTotals = computed(() => {
  if (this.isPureDispatch) {
    return {
      totalNetValue: 0,
      totalVatAmount: 0,
      totalGrossValue: 0
    };
  }

  const lines = this.lineItemsSignal();
  let netSum = 0;
  let vatSum = 0;

  for (const line of lines) {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unitPrice) || 0;
    const discount = Number(line.discountPercentage) || 0;

    const baseAmount = qty * price;
    const net = baseAmount - (baseAmount * (discount / 100));

    const vatCat = Number(line.vatRateCategory) || 1;
    let vatPct = 24;
    if (vatCat === 2) vatPct = 13;
    else if (vatCat === 3) vatPct = 6;
    else if (vatCat === 4) vatPct = 17;
    else if (vatCat === 5) vatPct = 9;
    else if (vatCat === 6) vatPct = 4;
    else if (vatCat === 7 || vatCat === 8) vatPct = 0;

    const vat = (net * vatPct) / 100;

    netSum += net;
    vatSum += vat;
  }

  const totalNet = Math.round(netSum * 100) / 100;
  const totalVat = Math.round(vatSum * 100) / 100;
  const totalGross = Math.round((totalNet + totalVat) * 100) / 100;

  return {
    totalNetValue: totalNet,
    totalVatAmount: totalVat,
    totalGrossValue: totalGross
  };
});
  public readonly selectedCustomerForContract = signal<ContractCustomerData | null>(null);

  public readonly showPrintModal = signal<boolean>(false);
  public readonly printableData = signal<PrintableInvoiceData | null>(null);

  public readonly customerSearchQuery = signal<string>('');
  public readonly customerResults = signal<LocalCustomerRecord[]>([]);

  // Default stays standard commercial invoice 1.1
public readonly invoiceForm = this.fb.group({
    series: ['A', Validators.required],
    documentNumber: [1, [Validators.required, Validators.min(1)]],
    issueDate: [new Date().toISOString().substring(0, 10), Validators.required],
    invoiceType: ['1.1', Validators.required],
    customer: this.fb.group({
      afm: ['', [Validators.required, greekAfmValidator()]],
      legalName: ['', Validators.required],
      doy: [''],
      email: [''],
      street: [''],
      number: [''],
      postalCode: [''],
      city: [''],
    }),
    movement: this.fb.group({
      vehicleNumber: [''],
      movePurpose: [1, Validators.required],
      correlatedMark: [''],
      dispatchDateTime: [new Date().toISOString().substring(0, 16), Validators.required],
      addressFrom: this.fb.group({
        street: [''],
        number: [''],
        postalCode: [''],
        city: [''],
      }),
      addressTo: this.fb.group({
        street: [''],
        number: [''],
        postalCode: [''],
        city: [''],
      }),
    }),
    lines: this.fb.array([]),
    totals: this.fb.group({
      totalNetValue: [0],
      totalVatAmount: [0],
      totalGrossValue: [0],
    }),
  });

  private get currentDocType(): string {
    return String(this.invoiceForm?.get('invoiceType')?.value ?? '').trim();
  }

  get isPureDispatch(): boolean {
    const type = this.currentDocType;
    return type === '9.1' || type === '9.3';
  }

  get isMovementDocument(): boolean {
    const type = this.currentDocType;
    return type === '9.1' || type === '9.3' || type === '1.2';
  }

  get customerAfmValue(): string {
    return this.invoiceForm.get('customer.afm')?.value || '';
  }

  public get linesArray(): FormArray {
    return this.invoiceForm.get('lines') as FormArray;
  }

  get afmControl() {
    return this.invoiceForm.get('customer.afm');
  }

  get isAfmValid(): boolean {
    const ctrl = this.afmControl;
    return Boolean(ctrl && ctrl.valid && ctrl.value);
  }

  get isAfmInvalid(): boolean {
    const ctrl = this.afmControl;
    if (!ctrl) return false;
    const len = String(ctrl.value || '').trim().length;
    return ctrl.invalid && (ctrl.touched || len >= 9);
  }

  constructor() {
    effect(() => {
      const handover = this.tenantIntegration.pendingHandover();
      if (handover && !this.handoverConsumed) {
        this.handoverConsumed = true;
        this.applyIncomingHandover(handover);
        this.tenantIntegration.clearPending();
      }
    });
  }

  public openContractModal(): void {
    const cust = this.invoiceForm.get('customer')?.value;
    if (!cust?.afm) return;

    this.selectedCustomerForContract.set({
      legalName: cust.legalName || '',
      afm: cust.afm,
      doy: cust.doy || '',
      address: cust.street ? `${cust.street} ${cust.postalCode || ''}`.trim() : '',
      city: cust.city || '',
      postalCode: cust.postalCode || '',
      activity: 'Εμπορική Επιχείρηση',
      representativeName: cust.legalName || '',
    });
  }

  public onProductsImported(count: number): void {
    this.showImportModal.set(false);
    this.autoSaveStatus.set(`Εισήχθησαν ${count} προϊόντα με επιτυχία!`);
    const query = this.searchQuery().trim();
    if (query.length >= 2) {
      this.onSearchChange(query);
    }
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
    this.linesArray.valueChanges.subscribe(() => {
    this.syncLines();
    });
  const currentTenantId = this.auth.currentTenantId();
  let tenantDefaultSeries = 'Α';

  if (currentTenantId) {
    const myBusiness = await this.db.getSettings(currentTenantId);
    if (myBusiness) {
      const b = myBusiness as any;
      tenantDefaultSeries = b.defaultSeries || 'Α';
    }
  }

  const targetDraftId =
    this.route.snapshot.paramMap.get('id') ||
    this.route.snapshot.queryParamMap.get('draftId');

  const queryDocType = this.route.snapshot.queryParamMap.get('type');

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
  } else {
    // Fresh invoice or dispatch note
    if (queryDocType === '9.3') {
      this.invoiceForm.patchValue({
        invoiceType: '9.3',
        series: 'ΔΕ',
        movement: {
          movePurpose: 4,
          dispatchDateTime: new Date().toISOString().substring(0, 16)
        }
      }, { emitEvent: false });
    } else {
      this.applyDefaultSeriesAndSeed(tenantDefaultSeries);
    }
  }

  // 1. Initialize movement & validation state based on active document type
  const activeType = this.invoiceForm.get('invoiceType')?.value;
  this.updateMovementDocState(activeType);
  this.updateCustomerValidation(activeType);

  if (activeType === '9.3' || activeType === '9.1' || activeType === '1.2') {
    await this.populateIssuerLoadingAddress();
  }

  await this.updateNextDocumentNumber();

  // 2. Reactive listeners (Single unified registration)
  this.invoiceForm
    .get('series')
    ?.valueChanges.pipe(takeUntil(this.destroy$))
    .subscribe(async (newSeries) => {
      if (newSeries) {
        await this.updateNextDocumentNumber();
      }
    });

  this.invoiceForm
    .get('invoiceType')
    ?.valueChanges.pipe(takeUntil(this.destroy$))
    .subscribe(async (type) => {
      this.updateMovementDocState(type);
      this.updateCustomerValidation(type);
      if (type === '9.3' || type === '9.1' || type === '1.2') {
        await this.populateIssuerLoadingAddress();
      }
    });

  this.invoiceForm.valueChanges
    .pipe(takeUntil(this.destroy$), debounceTime(400))
    .subscribe(() => {
      this.autoSaveStatus.set('Αποθήκευση...');
      this.debouncedSave();
    });
}

  public async populateIssuerLoadingAddress(): Promise<void> {
    const currentTenantId = this.auth.currentTenantId();
    
    // 1. Try to read from Dexie settings table
    let b: any = null;
    try {
      if (currentTenantId) {
        b = await this.db.getSettings(currentTenantId);
      }
      // If not found by tenantId, inspect first available record
      if (!b) {
        const allSettings = await (this.db as any).settings?.toArray?.();
        if (allSettings && allSettings.length > 0) {
          b = allSettings[0];
        }
      }
    } catch (e) {
      console.warn('[populateIssuerLoadingAddress] Dexie read error:', e);
    }

    // 2. Check activeTenant in Auth Service if Dexie had empty fields
    const activeTenant = (this.auth as any).activeTenant?.() || (this.auth as any).currentTenant?.();
    const tenantFiscal = activeTenant?.fiscalIdentity || activeTenant?.settings || {};

    const street =
      b?.street ||
      b?.address?.street ||
      tenantFiscal?.street ||
      tenantFiscal?.address?.street ||
      'Σταδίου';

    const number =
      b?.number ||
      b?.address?.number ||
      tenantFiscal?.number ||
      tenantFiscal?.address?.number ||
      '10';

    const postalCode =
      b?.postalCode ||
      b?.address?.postalCode ||
      tenantFiscal?.postalCode ||
      tenantFiscal?.address?.postalCode ||
      '10564';

    const city =
      b?.city ||
      b?.address?.city ||
      tenantFiscal?.city ||
      tenantFiscal?.address?.city ||
      'Αθήνα';

    // 3. Force values onto the controls directly
    this.invoiceForm.get('movement.addressFrom.street')?.setValue(street, { emitEvent: false });
    this.invoiceForm.get('movement.addressFrom.number')?.setValue(number, { emitEvent: false });
    this.invoiceForm.get('movement.addressFrom.postalCode')?.setValue(postalCode, { emitEvent: false });
    this.invoiceForm.get('movement.addressFrom.city')?.setValue(city, { emitEvent: false });

    // Mark dirty & refresh validity so Angular renders in the input fields
    this.invoiceForm.get('movement.addressFrom')?.markAsDirty();
    this.invoiceForm.get('movement.addressFrom')?.updateValueAndValidity({ emitEvent: false });
  }

  public async onSaveDraftManually(): Promise<void> {
    try {
      const tenantId = this.auth?.currentTenantId?.() || 'tenant_minimarket';
      const formVal: any = this.invoiceForm.getRawValue();
      const series = (formVal.series || 'DEV').trim().toUpperCase();

      const existingDraft = await (this.db as any).invoices
        .where('tenantId')
        .equals(tenantId)
        .filter(
          (inv: any) =>
            (inv.series || '').trim().toUpperCase() === series &&
            !inv.mark &&
            inv.transmissionStatus === 'DRAFT'
        )
        .first();

      const nextDocNum = await (this.db as any).getNextDocumentNumber(tenantId, series);

      const draftRecord: any = {
        ...formVal,
        id: existingDraft?.id || crypto.randomUUID(),
        tenantId,
        series,
        documentNumber: nextDocNum,
        customerAfm: formVal.customer?.afm || '',
        customerName: formVal.customer?.legalName || '',
        totalNet: this.computedTotals().totalNetValue,
        totalVat: this.computedTotals().totalVatAmount,
        totalGross: this.computedTotals().totalGrossValue,
        transmissionStatus: 'DRAFT',
        payloadJson: JSON.stringify({
          ...formVal,
          lines: this.lineItemsSignal(),
        }),
        updatedAt: Date.now(),
        createdAt: existingDraft?.createdAt || Date.now(),
      };

      await (this.db as any).invoices.put(draftRecord);
      this.autoSaveStatus.set('Αποθηκεύτηκε ως πρόχειρο!');
      alert('Το πρόχειρο παραστατικό αποθηκεύτηκε επιτυχώς!');
    } catch (err: any) {
      console.error('Error saving manual draft:', err);
      alert('Σφάλμα κατά την αποθήκευση του πρόχειρου: ' + (err.message || err));
    }
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
              vatRateCategory: [isDeltio ? 8 : (l.vatRateCategory || 1)],
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

    this.invoiceForm.patchValue(
      {
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
      },
      { emitEvent: false }
    );

    this.linesArray.clear();

    for (const item of data.items) {
      this.linesArray.push(
        this.fb.group({
          description: [item.description, Validators.required],
          quantity: [item.quantity, [Validators.required, Validators.min(0.01)]],
          unitPrice: [0, [Validators.required, Validators.min(0)]],
          discountPercentage: [0],
          netValue: [{ value: 0, disabled: true }],
          vatRateCategory: [8],
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

  this.invoiceForm.patchValue(
    {
      invoiceType: '9.3',
      series: returnSeries,
      movement: {
        vehicleNumber: '',
        movePurpose: 4, // 4: Επιστροφή (Return) in AADE myDATA specs
        dispatchDateTime: new Date().toISOString().substring(0, 16),
      },
    },
    { emitEvent: false }
  );

  this.updateMovementDocState('9.3');
  this.updateNextDocumentNumber();
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
    // 1. Resolve address fields whether they sit on root or nested in c.address
    const street = (c.address?.street || (c as any).street || '').trim();
    const number = (c.address?.number || (c as any).number || '').trim();
    const postalCode = (c.address?.postalCode || (c as any).postalCode || '').trim();
    const city = (c.address?.city || (c as any).city || '').trim();

    // 2. Patch customer details
    this.invoiceForm.get('customer')?.patchValue(
      {
        afm: c.afm || '',
        legalName: c.legalName || '',
        doy: c.doy ?? '',
        email: c.email ?? '',
        street,
        number,
        postalCode,
        city,
      },
      { emitEvent: true }
    );

    // 3. Populate delivery address if movement document
    if (this.isMovementDocument) {
      const movementGroup = this.invoiceForm.get('movement');
      if (movementGroup?.disabled) {
        movementGroup.enable({ emitEvent: false });
      }

      const addressToGroup = this.invoiceForm.get('movement.addressTo');
      if (addressToGroup) {
        if (addressToGroup.disabled) {
          addressToGroup.enable({ emitEvent: false });
        }
        addressToGroup.patchValue(
          {
            street,
            number,
            postalCode,
            city,
          },
          { emitEvent: true }
        );
        addressToGroup.markAsDirty();
        addressToGroup.updateValueAndValidity({ emitEvent: true });
      }
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
    const isDeltio = this.isPureDispatch;

    let vatCategory = 1;
    if (product.taxRate === 13) vatCategory = 2;
    else if (product.taxRate === 6) vatCategory = 3;
    else if (product.taxRate === 0) vatCategory = 7;

    const unitPrice = isDeltio ? 0 : Number(product.price || 0);
    const quantity = 1;
    const netValue = isDeltio ? 0 : Number((unitPrice * quantity).toFixed(2));
    const vatRate = isDeltio ? 0 : (product.taxRate ?? 24);
    const vatAmount = isDeltio ? 0 : Number((netValue * (vatRate / 100)).toFixed(2));
    const totalValue = isDeltio ? 0 : Number((netValue + vatAmount).toFixed(2));

    this.linesArray.push(
      this.fb.group({
        description: [product.name, Validators.required],
        quantity: [quantity, [Validators.required, Validators.min(0.01)]],
        unitPrice: [unitPrice, [Validators.required, Validators.min(0)]],
        discountPercentage: [0],
        netValue: [{ value: netValue, disabled: true }],
        vatRateCategory: [isDeltio ? 8 : vatCategory],
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
  const isMov = type === '9.1' || type === '9.3' || type === '1.2';
  const movementCtrl = this.invoiceForm.get('movement');
  const vehicleCtrl = this.invoiceForm.get('movement.vehicleNumber');

  if (isMov) {
    movementCtrl?.enable({ emitEvent: false });
    vehicleCtrl?.setValidators([Validators.required]);
  } else {
    movementCtrl?.disable({ emitEvent: false });
    vehicleCtrl?.clearValidators();
  }
  vehicleCtrl?.updateValueAndValidity({ emitEvent: false });
  this.syncLines();
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

  public async updateNextDocumentNumber(): Promise<void> {
    const tenantId = this.auth.currentTenantId();
    const series = this.invoiceForm.get('series')?.value;
    if (!tenantId || !series) return;

    if (this.currentDraftId() && this.invoiceForm.get('documentNumber')?.dirty) {
      return;
    }

    const nextNumber = await this.db.getNextDocumentNumber(tenantId, series);
    this.invoiceForm.get('documentNumber')?.setValue(nextNumber, { emitEvent: false });
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
    const currentId = this.currentDraftId();
    if (currentId) {
      await this.db.deleteInvoice(currentId);
    }
    this.currentDraftId.set(crypto.randomUUID());

    const tenantId = this.auth.currentTenantId();
    const settings = tenantId ? await this.db.getSettings(tenantId) : null;
    const s = (settings || {}) as any;

    this.invoiceForm.reset({
      series: s.defaultSeries || 'Α',
      documentNumber: 1,
      issueDate: new Date().toISOString().substring(0, 10),
      invoiceType: '1.1',
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
        correlatedMark: '',
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
    const isDeltio = this.isPureDispatch;

    const row = this.fb.group({
      description: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
      unitPrice: [isDeltio ? 0 : 0, [Validators.required, Validators.min(0)]],
      discountPercentage: [0],
      netValue: [{ value: 0, disabled: true }],
      vatRateCategory: [isDeltio ? 8 : 1],
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
    const line = this.linesArray.at(index);
    if (!line) return;

    const qty = Number(line.get('quantity')?.value) || 0;
    const unitPrice = Number(line.get('unitPrice')?.value) || 0;
    const discount = Number(line.get('discountPercentage')?.value) || 0;
    const vatCat = Number(line.get('vatRateCategory')?.value || 1);

    // If pure dispatch, keep monetary values at 0
    if (this.isPureDispatch) {
      line.patchValue({
        netValue: 0,
        vatAmount: 0,
        totalValue: 0,
      }, { emitEvent: false });
      return;
    }

    const grossBeforeDiscount = qty * unitPrice;
    const net = grossBeforeDiscount * (1 - discount / 100);

    let rate = 0.24;
    if (vatCat === 2) rate = 0.13;
    else if (vatCat === 3) rate = 0.06;
    else if (vatCat === 7 || vatCat === 8) rate = 0.00;

    const vat = net * rate;
    const total = net + vat;

    line.patchValue({
      netValue: Number(net.toFixed(2)),
      vatAmount: Number(vat.toFixed(2)),
      totalValue: Number(total.toFixed(2)),
    }, { emitEvent: false });

    this.recalculateInvoiceTotals();
  }

  public recalculateInvoiceTotals(): void {
  if (this.isPureDispatch) {
    this.invoiceForm.get('totals')?.patchValue({
      totalNetValue: 0,
      totalVatAmount: 0,
      totalGrossValue: 0,
    }, { emitEvent: false });
    return;
  }

  const rawLines = this.linesArray.getRawValue() as any[];

  let totalNet = 0;
  let totalVat = 0;

  for (const line of rawLines) {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unitPrice) || 0;
    const discount = Number(line.discountPercentage) || 0;

    const baseGross = qty * price;
    const net = baseGross - (baseGross * (discount / 100));

    const vatCat = Number(line.vatRateCategory) || 1;
    let vatPct = 24;
    if (vatCat === 2) vatPct = 13;
    else if (vatCat === 3) vatPct = 6;
    else if (vatCat === 4) vatPct = 17;
    else if (vatCat === 5) vatPct = 9;
    else if (vatCat === 6) vatPct = 4;
    else if (vatCat === 7 || vatCat === 8) vatPct = 0;

    const vat = (net * vatPct) / 100;

    totalNet += net;
    totalVat += vat;
  }

  const netRounded = Math.round(totalNet * 100) / 100;
  const vatRounded = Math.round(totalVat * 100) / 100;
  const grossRounded = Math.round((netRounded + vatRounded) * 100) / 100;

  this.invoiceForm.get('totals')?.patchValue({
    totalNetValue: netRounded,
    totalVatAmount: vatRounded,
    totalGrossValue: grossRounded,
  });
}

  /**
   * Deconstructs raw combined GSIS strings like:
   * "ΑΓΙΑΣ ΜΑΡΙΝΑΣ 26        19400 - ΚΟΡΩΠΙ"
   * into street, number, postalCode, and city.
   */
 private parseGsisAddress(rawAddress: string | null | undefined): {
  street: string;
  number: string;
  postalCode: string;
  city: string;
} {
  const fallback = { street: '', number: '1', postalCode: '', city: '' };
  if (!rawAddress || typeof rawAddress !== 'string') return fallback;

  // 1. Normalize whitespace, tabs, and special characters
  const cleaned = rawAddress.trim().replace(/\s+/g, ' ');

  // 2. Match all 5-digit sequences, preferring the last one before city
  const allZipMatches = [...cleaned.matchAll(/\b(\d{5})\b/g)];
  const zipMatch = allZipMatches.length > 0 ? allZipMatches[allZipMatches.length - 1] : null;

  if (zipMatch && zipMatch.index !== undefined) {
    const postalCode = zipMatch[1];
    let beforeZip = cleaned.substring(0, zipMatch.index).trim();
    
    // Clean trailing hyphens, dots, commas before zip
    beforeZip = beforeZip.replace(/[\-–—.,]+$/, '').trim();

    // Clean leading/trailing punctuation after zip
    let afterZip = cleaned.substring(zipMatch.index + 5).replace(/^[\s\-–—.,]+/, '').trim();

    // Remove any trailing country code like "GR" or "ΕΛΛΑΔΑ" if attached to city
    afterZip = afterZip.replace(/[\s\-–—]+(GR|GREECE|ΕΛΛΑΔΑ)$/i, '').trim();

    // 3. Extract street number:
    // Match trailing digits/letters, but ensure it's not "0" or part of "ΧΛΜ 11"
    const numMatch = beforeZip.match(/^(.*?)(?:\s+(\d+[A-Za-z\u0370-\u03ff]*))$/);

    let street = beforeZip;
    let number = '1';

    if (numMatch && numMatch[2]) {
      const candidateNum = numMatch[2].trim();
      // If candidate is "0" or beforeZip is a highway format, don't treat 0 as number
      if (candidateNum !== '0') {
        street = numMatch[1]?.trim() || beforeZip;
        number = candidateNum;
      } else {
        // Strip trailing zero from street name if it was a VIES placeholder
        street = numMatch[1]?.trim() || beforeZip;
      }
    }

    return {
      street: street || beforeZip,
      number: number || '1',
      postalCode: postalCode,
      city: afterZip || '', // Do not force 'Αθήνα' if outside Attica
    };
  }

  // Fallback when no 5-digit zip code exists
  return {
    street: cleaned,
    number: '1',
    postalCode: '',
    city: '',
  };
}

  public async triggerGsisLookup(): Promise<void> {
    const afmControl = this.invoiceForm.get('customer.afm');
    let rawAfm = String(afmControl?.value ?? '').replace(/\D/g, '').trim();

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
    const shopSettings = await this.db.getSettings(tenantId);

    if (shopSettings?.afm && rawAfm === String(shopSettings.afm).replace(/\D/g, '').trim()) {
      alert('Το Α.Φ.Μ. αυτό ανήκει στο κατάστημά σας (Εκδότης), όχι σε πελάτη/παραλήπτη.');
      return;
    }

    this.gsisLoading.set(true);
    this.gsisError.set(null);

    // GsisLookupService handles: 1. Dexie cache -> 2. GSIS SOAP 1.2 -> 3. EU VIES fallback
    this.gsisService.lookupAfm(rawAfm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (company: GsisCompanyRecord) => {
          this.gsisLoading.set(false);

          if (!company || !company.legalName) {
            this.gsisError.set('Δεν βρέθηκαν στοιχεία στο μητρώο για το συγκεκριμένο Α.Φ.Μ.');
            return;
          }

          if (company.active === false) {
            alert('Προσοχή: Η επιχείρηση με αυτό το Α.Φ.Μ. εμφανίζεται ως ΑΝΕΝΕΡΓΗ / ΔΙΑΚΟΠΕΙΣΑ στο μητρώο!');
          }

          this.populateCustomerForm({
            legalName: company.legalName,
            doy: company.doyDescr || company.doy || '',
            street: company.postalAddress || '',
            number: company.postalAddressNo || '',
            postalCode: company.postalZipCode || '',
            city: company.postalAreaDescription || '',
          });

          this.autoSaveStatus.set(
            company.source === 'LOCAL_CACHE'
              ? 'Ανακτήθηκε από τοπική μνήμη'
              : (company.source === 'GSIS' ? 'Επαληθεύτηκε από ΑΑΔΕ' : 'Επαληθεύτηκε από EU VIES')
          );
        },
        error: (err: any) => {
          this.gsisLoading.set(false);
          const errMsg = err?.message || 'Αδυναμία σύνδεσης με την υπηρεσία μητρώου (GSIS/VIES).';
          this.gsisError.set(errMsg);
        },
      });
  }

  private populateCustomerForm(data: any): void {
    if (!data) return;

    const legalName = (data.legalName || data.name || data.onomasia || '').trim();
    const doy = (data.doyDescr || data.doy || data.doy_descr || '').trim();
    

    // Map from either postalAddress* (GSIS) or street/number (Local/VIES)
    let street = (
      data.postalAddress ||
      data.postal_address ||
      data.street ||
      data.address?.street ||
      ''
    ).trim();

    let number = (
      data.postalAddressNo ||
      data.postal_address_no ||
      data.number ||
      data.address?.number ||
      ''
    ).trim();

    let postalCode = (
      data.postalZipCode ||
      data.postal_zip_code ||
      data.postalCode ||
      data.address?.postalCode ||
      ''
    ).trim();

    let city = (
      data.postalAreaDescription ||
      data.postal_area_description ||
      data.city ||
      data.address?.city ||
      ''
    ).trim();

    // Deconstruct street if it contains postal code or combined address
    if (street && (!postalCode || !city || /\d{5}/.test(street))) {
      const parsed = this.parseGsisAddress(street);
      street = parsed.street || street;
      number = number || parsed.number || '1';
      postalCode = postalCode || parsed.postalCode;
      city = city || parsed.city;
    }

    if (!number) number = '1';

    const normalizedNumber = (number && number !== '0' && number !== '00') ? number : '1';

   const customerGroup = this.invoiceForm.get('customer');
    if (customerGroup) {
      customerGroup.patchValue(
        {
          legalName,
          doy,
          street,
          number,
          postalCode,
          city,
        } as any,
        { emitEvent: true }
      );
      customerGroup.markAsDirty();
      customerGroup.updateValueAndValidity({ emitEvent: true });
    }

    // Auto-fill delivery address for movement documents
    if (this.isMovementDocument) {
      const addressTo = this.invoiceForm.get('movement.addressTo');
      if (addressTo) {
        addressTo.patchValue({ street, number, postalCode, city }, { emitEvent: true });
      }
    }
  }

  public async onOpenPreview(): Promise<void> {
    if (this.invoiceForm.invalid) {
      this.invoiceForm.markAllAsTouched();
      this.checkFormValidity();
      alert('Παρακαλώ συμπληρώστε όλα τα απαιτούμενα πεδία.');
      return;
    }

    const tenantId = this.auth?.currentTenantId?.() || 'tenant_minimarket';
    let settings: any = typeof (this.db as any).getSettingsForTenant === 'function'
      ? await (this.db as any).getSettingsForTenant(tenantId)
      : await (this.db as any).getSettings?.(tenantId);

    if (!settings?.afm) {
      const all = await (this.db as any).settings?.toArray?.();
      if (all && all.length > 0) settings = all[0];
    }

    const formVal: any = this.invoiceForm.getRawValue();
    const totals = this.computedTotals();
    const custRaw: any = formVal.customer || {};

    const printablePayload: any = {
      series: formVal.series || 'DEV',
      documentNumber: Number(formVal.documentNumber) || 1,
      issueDate: formVal.issueDate || new Date().toISOString().split('T')[0],
      invoiceType: formVal.invoiceType || '1.1',
      issuer: {
        legalName: settings?.legalName || 'MARANTH TEST ENTERPRISE',
        tradeName: settings?.tradeName || settings?.legalName || 'MARANTH TEST ENTERPRISE',
        afm: settings?.afm || '067424104',
        doy: settings?.doy || 'ΔΟΥ ΑΘΗΝΩΝ',
        branch: 0,
        address: {
          street: settings?.street || 'Σταδίου',
          number: settings?.number || '10',
          postalCode: settings?.postalCode || '10564',
          city: settings?.city || 'Αθήνα',
        },
        phone: settings?.phone || '',
        email: settings?.email || '',
      },
      customer: {
        id: (custRaw as any)?.id || 'cust-1',
        legalName: custRaw.legalName || '—',
        afm: custRaw.afm || '—',
        doy: custRaw.doy || '—',
        email: custRaw.email || '',
        address: {
          street: custRaw.street || '',
          number: custRaw.number || '',
          postalCode: custRaw.postalCode || '',
          city: custRaw.city || '',
        },
      },
      lines: this.lineItemsSignal(),
      totals: {
        totalNetValue: Number(totals.totalNetValue || 0),
        totalVatAmount: Number(totals.totalVatAmount || 0),
        totalWithheldAmount: 0,
        totalFeesAmount: 0,
        totalStampDutyAmount: 0,
        totalOtherTaxesAmount: 0,
        totalDeductionsAmount: 0,
        totalGrossValue: Number(totals.totalGrossValue || 0),
      },
      mark: formVal.mark || 'ΠΡΟΕΠΙΣΚΟΠΗΣΗ',
      uid: formVal.uid || 'PREVIEW-MODE-ONLY',
      qrUrl: formVal.qrUrl || 'https://mydata.aade.gr/preview',
      xmlPayload: '',
      movement: this.isMovementDocument ? formVal.movement : undefined,
    };

    this.printableData.set(printablePayload);
    this.showPrintModal.set(true);
  }

public async sendToMyData(invoice: LocalInvoiceRecord): Promise<void> {
    try {
      const result = await this.myData.transmitInvoice(invoice);

      if (result.success && result.mark) {
        invoice.mark = result.mark;
        invoice.uid = result.uid;
        invoice.qrUrl =
          result.qrUrl ??
          (invoice.mark ? `https://mydatapi.aade.gr/myDATA/qrUrl?mark=${invoice.mark}` : '');
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

        // 1. Open verified print preview with actual AADE MARK & QR
        await this.openVerifiedPreview(invoice, result.mark, result.uid, invoice.qrUrl);

        // 2. Prepare next sequential document number and fresh draft ID
        const tenantId = this.auth.currentTenantId();
        if (tenantId) {
          const nextAa = await this.db.getNextDocumentNumber(tenantId, invoice.series);
          this.currentDraftId.set(crypto.randomUUID());
          this.invoiceForm.get('documentNumber')?.setValue(nextAa, { emitEvent: false });
        }

        // 3. Clear lines, customer, and delivery destination cleanly
        this.linesArray.clear();
        this.seedInitialLine();
        this.invoiceForm.get('customer')?.reset();
        this.invoiceForm.get('movement.addressTo')?.reset();
        this.invoiceForm.get('movement.vehicleNumber')?.reset();
      } else {
        const invoiceId = invoice.id != null ? String(invoice.id) : null;
        if (invoiceId) {
          await this.db.invoices.update(invoiceId, {
            transmissionStatus: 'FAILED',
            updatedAt: Date.now(),
          });
        }
        this.autoSaveStatus.set(`Αποτυχία myDATA: ${result.error || 'Σφάλμα myDATA'}`);
        alert(`Απόρριψη myDATA:\n${result.error || 'Άγνωστο σφάλμα επικύρωσης'}`);
      }
    } catch (err: unknown) {
      console.error('Network or gateway failure during myDATA transmission:', err);
      this.autoSaveStatus.set('Σφάλμα δικτύου κατά την αποστολή');
    }
  }

private syncLines(): void {
    const isDeltio = this.isPureDispatch;
    const isServices = this.currentDocType === '2.1' || this.currentDocType === '11.1';

    if (isDeltio) {
      for (let i = 0; i < this.linesArray.length; i++) {
        const row = this.linesArray.at(i);
        row.get('unitPrice')?.setValue(0, { emitEvent: false });
        row.get('discountPercentage')?.setValue(0, { emitEvent: false });
        row.get('netValue')?.setValue(0, { emitEvent: false });
        row.get('vatAmount')?.setValue(0, { emitEvent: false });
        row.get('totalValue')?.setValue(0, { emitEvent: false });
        row.get('vatRateCategory')?.setValue(8, { emitEvent: false });
      }
    }

    const raw = this.linesArray.getRawValue() as any[];
    const items: InvoiceLineItem[] = raw.map((r, i) => {
      const qty = Number(r.quantity) || 1;
      const unitPr = isDeltio ? 0 : Number(r.unitPrice) || 0;
      const discount = Number(r.discountPercentage) || 0;

      // Ensure net value accounts for quantity and discount if netValue wasn't pre-computed
      let netVal = 0;
      if (!isDeltio) {
        if (Number(r.netValue) > 0) {
          netVal = Number(r.netValue);
        } else {
          const gross = qty * unitPr;
          netVal = Number((gross - (gross * (discount / 100))).toFixed(2));
        }
      }

      const vatCat = (Number(r.vatRateCategory) || (isDeltio ? 8 : 1)) as VatRateCategory;
      let vatPct = 24;
      if (vatCat === 2) vatPct = 13;
      else if (vatCat === 3) vatPct = 6;
      else if (vatCat === 4) vatPct = 17;
      else if (vatCat === 5) vatPct = 9;
      else if (vatCat === 6) vatPct = 4;
      else if (vatCat === 7 || vatCat === 8) vatPct = 0;

      const vatAmt = isDeltio ? 0 : Number(((netVal * vatPct) / 100).toFixed(2));
      const totVal = isDeltio ? 0 : Number((netVal + vatAmt).toFixed(2));

      const defaultClassificationCategory = isServices ? 'category1_3' : 'category1_1';
      const defaultClassificationType = isServices ? 'E3_561_003' : 'E3_561_001';

      return {
        id: String(i + 1),
        lineNumber: i + 1,
        sku: r.sku || '',
        description: r.description || '',
        quantity: qty,
        unitMeasurement: (r.unitMeasurement || '1') as '1' | '2' | '3',
        unitPrice: unitPr,
        discountPercentage: discount,
        netValue: netVal,
        vatRateCategory: vatCat,
        vatPercentage: vatPct,
        vatAmount: vatAmt,
        totalValue: totVal,
        incomeClassification: isDeltio
          ? {
              classificationCategory: 'category3',
              amount: 0,
            }
          : {
              classificationType: r.incomeClassification?.classificationType || defaultClassificationType,
              classificationCategory:
                r.incomeClassification?.classificationCategory || defaultClassificationCategory,
              amount: netVal,
            },
      };
    });

    this.lineItemsSignal.set(items);

    // --- Compute and set Totals ---
    const totalNet = items.reduce((sum, item) => sum + (Number(item.netValue) || 0), 0);
    const totalVat = items.reduce((sum, item) => sum + (Number(item.vatAmount) || 0), 0);
    const totalGross = items.reduce((sum, item) => sum + (Number(item.totalValue) || 0), 0);

    const computedTotals = {
      totalNetValue: Number(totalNet.toFixed(2)),
      totalVatAmount: Number(totalVat.toFixed(2)),
      totalGrossValue: Number(totalGross.toFixed(2)),
    };

    // Update whichever property your footer template binds to:
    if ((this as any).totalsSignal) {
      (this as any).totalsSignal.set(computedTotals);
    }
    if ((this as any).totals) {
      (this as any).totals = computedTotals;
    }
    if (typeof (this as any).calculateTotals === 'function') {
      (this as any).calculateTotals();
    }
    this.lineItemsSignal.set(items);
    this.recalculateInvoiceTotals();
  }

  private async openVerifiedPreview(
    invoice: LocalInvoiceRecord,
    mark: string,
    uid?: string,
    qrUrl?: string
  ): Promise<void> {
    const tenantId = this.auth.currentTenantId();
    const settings = tenantId ? await this.db.getSettings(tenantId) : null;
    const s = (settings || {}) as any;

    let parsedPayload: any = {};
    try {
      parsedPayload =
        typeof invoice.payloadJson === 'string'
          ? JSON.parse(invoice.payloadJson)
          : invoice.payloadJson || {};
    } catch {
      parsedPayload = {};
    }

    const rawIssuerAfm = s.afm || this.auth.activeTenant()?.fiscalIdentity?.afm || '';
    const issuerAfm = String(rawIssuerAfm).replace(/\D/g, '').trim();

    const customerData = {
      id: parsedPayload.customer?.id || crypto.randomUUID(),
      afm: invoice.customerAfm || '',
      branch: 0,
      legalName: invoice.customerName || 'ΙΔΙΩΤΗΣ / ΠΕΛΑΤΗΣ',
      doy: parsedPayload.customer?.doy || '',
      country: 'GR',
      email: parsedPayload.customer?.email || '',
      address: {
        street: parsedPayload.customer?.street || '',
        number: parsedPayload.customer?.number || '',
        postalCode: parsedPayload.customer?.postalCode || '',
        city: parsedPayload.customer?.city || '',
      },
    };

    const issuerData = {
      legalName: s.legalName || this.auth.activeTenant()?.name || 'Επωνυμία Επιχείρησης',
      tradeName: s.tradeName || s.commercialTitle || '',
      afm: issuerAfm,
      doy: s.doy || '',
      branch: Number(s.branch ?? 0),
      address: {
        street: s.street || '',
        number: s.number || '',
        postalCode: s.postalCode || '',
        city: s.city || '',
      },
      phone: s.phone || '',
      email: s.email || '',
    };

    const isDispatch = invoice.invoiceType === '9.1' || invoice.invoiceType === '9.3' || invoice.invoiceType === '1.2';

    this.printableData.set({
      series: invoice.series,
      documentNumber: Number(invoice.documentNumber),
      issueDate: invoice.issueDate,
      invoiceType: invoice.invoiceType,
      issuer: issuerData,
      customer: customerData,
      lines: this.lineItemsSignal(),
      totals: {
        totalNetValue: invoice.totalNet,
        totalVatAmount: invoice.totalVat,
        totalGrossValue: invoice.totalGross,
        vatBreakdowns: [],
      },
      mark: mark,
      uid: uid || '',
      qrUrl: qrUrl || `https://mydatapi.aade.gr/myDATA/qrUrl?mark=${mark}`,
      xmlPayload: undefined,
      movement: isDispatch ? parsedPayload.movement : undefined,
    });

    this.showPrintModal.set(true);
  }

  public async onSaveAndSubmit(): Promise<void> {
    if (this.invoiceForm.invalid) {
      this.invoiceForm.markAllAsTouched();
      this.checkFormValidity();
      alert('Παρακαλώ συμπληρώστε τα υποχρεωτικά πεδία (Σειρά, Αριθμός, Ημερομηνία, Α.Φ.Μ., Επωνυμία).');
      return;
    }

    this.syncLines();
    const currentLines = this.lineItemsSignal();

    const totalNet = currentLines.reduce((acc, item) => acc + (item.netValue || 0), 0);
    const totalVat = currentLines.reduce((acc, item) => acc + (item.vatAmount || 0), 0);
    const totalGross = currentLines.reduce((acc, item) => acc + (item.totalValue || 0), 0);

    const formRaw = this.invoiceForm.getRawValue();

    const invoiceRecord: LocalInvoiceRecord = {
      id: this.currentDraftId() || crypto.randomUUID(),
      tenantId: this.auth.currentTenantId() || 'tenant_minimarket',
      series: formRaw.series || 'DEV',
      documentNumber: Number(formRaw.documentNumber) || 1,
      issueDate: formRaw.issueDate || new Date().toISOString().split('T')[0],
      invoiceType: formRaw.invoiceType || '9.3', // Safe fallback
      customerAfm: formRaw.customer?.afm || '',
      customerName: formRaw.customer?.legalName || '',
      totalNet: Number(totalNet.toFixed(2)),
      totalVat: Number(totalVat.toFixed(2)),
      totalGross: Number(totalGross.toFixed(2)),
      transmissionStatus: 'DRAFT',
      payloadJson: JSON.stringify({
        ...formRaw,
        lines: currentLines,
      }),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.db.invoices.put(invoiceRecord);
    await this.sendToMyData(invoiceRecord);
  }

  public onMovePurposeChange(event: Event): void {
  const selectElem = event.target as HTMLSelectElement;
  const purpose = Number(selectElem.value);

  // Checks both 4 and 6 to cover both AADE table definitions of "Επιστροφή"
  const isReturn = purpose === 4 || purpose === 6;

  if (isReturn) {
    if (!this.invoiceForm.get('series')?.dirty) {
      this.invoiceForm.get('series')?.setValue('ΕΠΙΣΤΡ', { emitEvent: false });
      this.updateNextDocumentNumber();
    }
  } else {
    if (this.invoiceForm.get('series')?.value === 'ΕΠΙΣΤΡ') {
      const defaultSeries = this.isPureDispatch ? 'DEV' : 'A';
      this.invoiceForm.get('series')?.setValue(defaultSeries, { emitEvent: false });
      this.updateNextDocumentNumber();
    }
    this.invoiceForm.get('movement.correlatedMark')?.setValue('', { emitEvent: false });
  }
}

  private updateCustomerValidation(type: string | null | undefined): void {
  const afmCtrl = this.invoiceForm.get('customer.afm');
  const nameCtrl = this.invoiceForm.get('customer.legalName');

  if (type === '11.1') {
    // Retail Service Receipt - B2C customer is optional
    afmCtrl?.clearValidators();
    nameCtrl?.clearValidators();
  } else {
    // B2B Invoices (1.1, 1.2, 2.1) and Delivery Notes (9.1, 9.3) require valid customer
    afmCtrl?.setValidators([Validators.required, greekAfmValidator()]);
    nameCtrl?.setValidators([Validators.required]);
  }

  afmCtrl?.updateValueAndValidity({ emitEvent: false });
  nameCtrl?.updateValueAndValidity({ emitEvent: false });
}

}
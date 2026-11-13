import { Component, ChangeDetectionStrategy, inject, signal, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, FormControl } from '@angular/forms';
import { LocalDbService } from '@core/services/local-db.service';
import { AuthTenantService } from '@core/services/auth-tenant.service';
import { MyDataService } from '@core/services/mydata.service';
import { SubscriptionTier, FiscalEnvironment, SubscriptionStatus } from '@core/models/tenant.models';

@Component({
  selector: 'maranth-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <!-- Header -->
      <div class="border-b border-slate-200 pb-5 flex items-center justify-between">
        <div>
          <h1 class="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Ρυθμίσεις Καταστήματος &amp; myDATA</h1>
          <p class="text-xs text-slate-500 mt-1">Φορολογική ταυτότητα, συνδρομή και διαπιστευτήρια AADE API</p>
        </div>
      </div>

      <form [formGroup]="form" (ngSubmit)="onSave()" class="space-y-6">
        <!-- Section 0: Subscription & License Console (Maranth Executive) -->
        @if (auth.isTenantConfigured()) {
          <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <!-- Top Ribbon -->
            <div class="bg-slate-950 px-5 sm:px-6 py-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-lg text-blue-400 shrink-0 shadow-inner">
                  🛡️
                </div>
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Συνδρομή Συστήματος
                    </h3>
                    <span class="px-2 py-0.5 text-xs font-mono font-black rounded-md bg-white/10 text-white border border-white/20">
                      {{ form.get('subscriptionTier')?.value || 'TRIAL' }}
                    </span>
                  </div>
                  <p class="text-[11px] font-mono text-slate-400 mt-0.5">
                    Tenant: <span class="text-slate-200 font-bold select-all">{{ form.get('tenantId')?.value || auth.currentTenantId() }}</span>
                  </p>
                </div>
              </div>

              <!-- License Status Pill -->
              <div class="flex items-center sm:self-center">
                @switch (form.get('subscriptionStatus')?.value) {
                  @case ('ACTIVE') {
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      ΕΝΕΡΓΗ
                    </span>
                  }
                  @case ('GRACE_PERIOD') {
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                      ΧΑΡΙΣΤΙΚΗ ΠΕΡΙΟΔΟΣ
                    </span>
                  }
                  @case ('READ_ONLY') {
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                      <span class="w-2 h-2 rounded-full bg-rose-400"></span>
                      ΜΟΝΟ ΑΝΑΓΝΩΣΗ
                    </span>
                  }
                  @case ('SUSPENDED') {
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-rose-950 text-rose-300 border border-rose-800">
                      <span class="w-2 h-2 rounded-full bg-rose-500"></span>
                      ΑΝΕΣΤΑΛΗ
                    </span>
                  }
                  @default {
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      <span class="w-2 h-2 rounded-full bg-slate-400"></span>
                      ΔΟΚΙΜΑΣΤΙΚΗ (TRIAL)
                    </span>
                  }
                }
              </div>
            </div>

            <!-- Card Body: Quota & Validity -->
            <div class="p-5 sm:p-6 bg-slate-50/50 space-y-4 text-xs">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <!-- Validity Period -->
                <div class="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-1">
                  <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Διάρκεια Άδειας
                  </span>
                  <div>
                    @if (!form.get('validUntil')?.value || form.get('validUntil')?.value?.startsWith('2099') || form.get('validUntil')?.value?.startsWith('2999')) {
                      <span class="inline-flex items-center gap-1 font-black text-xs text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                        ★ ΑΠΕΡΙΟΡΙΣΤΗ (LIFETIME)
                      </span>
                    } @else {
                      <span class="font-mono text-sm font-bold text-slate-900">
                        Ισχύει έως {{ form.get('validUntil')?.value | date:'dd/MM/yyyy' }}
                      </span>
                    }
                  </div>
                </div>

                <!-- Monthly Quota -->
                <div class="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-1.5">
                  <div class="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <span>Χρήση Μηνός</span>
                    <span class="font-mono text-xs text-slate-900">
                      {{ form.get('currentMonthDocumentCount')?.value || 0 }} / {{ form.get('maxMonthlyDocuments')?.value || '50' }}
                    </span>
                  </div>
                  <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                    <div
                      class="bg-blue-600 h-full rounded-full transition-all"
                      [style.width.%]="quotaUsagePercentage"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        } @else {
          <!-- Clean Zero-State Notice for New Client -->
          <div class="p-5 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-start gap-3 text-xs text-blue-900">
            <div class="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-base shrink-0 shadow-xs">
              ℹ️
            </div>
            <div>
              <h4 class="font-bold text-sm text-blue-950">Νέα Εγκατάσταση Επιχείρησης</h4>
              <p class="mt-0.5 text-blue-800 leading-relaxed">
                Συμπληρώστε το Α.Φ.Μ. και τα φορολογικά στοιχεία της επιχείρησής σας στην παρακάτω φόρμα. Μόλις αποθηκευτούν, η άδεια χρήσης και το προφίλ εκδότη myDATA θα ενεργοποιηθούν αυτόματα.
              </p>
            </div>
          </div>
        }

        <!-- Section 1: Business Identity & Tax Details -->
        <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
          <h2 class="text-xs font-bold uppercase tracking-wider text-slate-700">Φορολογική Ταυτότητα (Εκδότης)</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Α.Φ.Μ. Καταστήματος *</label>
              <input type="text" formControlName="afm" maxlength="9" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500" placeholder="9 ψηφία" />
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Δ.Ο.Υ. *</label>
              <input type="text" formControlName="doy" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500" placeholder="π.χ. Δ' ΑΘΗΝΩΝ" />
            </div>
            <div class="sm:col-span-2">
              <label class="block font-semibold text-slate-700 mb-1">Επωνυμία / Εμπορικός Τίτλος *</label>
              <input type="text" formControlName="legalName" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500" placeholder="π.χ. ΜΙΝΙ ΜΑΡΚΕΤ Ο ΠΕΤΡΟΣ" />
            </div>
          </div>
        </div>

        <!-- Section 2: Store Physical Address -->
        <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
          <div>
            <h2 class="text-xs font-bold uppercase tracking-wider text-slate-700">Φυσική Διεύθυνση Έδρας / Καταστήματος</h2>
            <p class="text-[11px] text-slate-400 mt-0.5">Αποτελεί τον προεπιλεγμένο τόπο εκκίνησης (Τόπος Έναρξης) για τα Δελτία Αποστολής (9.1, 9.2, 9.3)</p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
            <div class="sm:col-span-2">
              <label class="block font-semibold text-slate-700 mb-1">Οδός *</label>
              <input type="text" formControlName="street" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500" placeholder="π.χ. Ακαδημίας" />
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Αριθμός *</label>
              <input type="text" formControlName="number" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500" placeholder="π.χ. 45" />
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Τ.Κ. *</label>
              <input type="text" formControlName="postalCode" maxlength="5" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500" placeholder="π.χ. 10672" />
            </div>
            <div class="sm:col-span-2">
              <label class="block font-semibold text-slate-700 mb-1">Πόλη / Περιοχή *</label>
              <input type="text" formControlName="city" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500" placeholder="π.χ. Αθήνα" />
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Εγκατάσταση / Branch (AADE)</label>
              <input type="number" formControlName="branch" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500" placeholder="0 = Έδρα" />
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Προεπιλεγμένη Σειρά</label>
              <input type="text" formControlName="defaultSeries" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500" placeholder="π.χ. ΔΑ ή ΕΠΙΣΤΡ" />
            </div>
          </div>
        </div>

        <!-- Section 3: AADE Friendly Credentials & Environment Switch -->
        <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 class="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <span>🔑</span>
                <span>AADE myDATA REST API Friendly Credentials</span>
              </h2>
              <p class="text-[11px] text-slate-400 mt-0.5">Κωδικοί διεπαφής από την ιστοσελίδα της ΑΑΔΕ (myDATA)</p>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Όνομα Χρήστη (aade-user-id)</label>
              <input type="text" formControlName="aadeUserId" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500" placeholder="User ID" />
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Κλειδί Συνδρομής (Subscription Key)</label>
              <input type="password" formControlName="aadeSubscriptionKey" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500" placeholder="32-ψήφιο API Key" />
            </div>
          </div>

          <!-- 3-Way Environment Mode Switch -->
          <div class="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span class="block text-xs font-bold text-slate-800">Λειτουργία Αποστολής myDATA</span>
              <span class="text-[11px] text-slate-500">
                @switch (form.get('fiscalEnvironment')?.value) {
                  @case ('production') { Ενεργό Παραγωγικό ΑΑΔΕ — Επίσημη υποβολή με νομικό ΜΑΡΚ. }
                  @case ('mock') { Τοπική Προσομοίωση (Offline Demo) — Χωρίς κλήσεις δικτύου ΑΑΔΕ. }
                  @default { Δοκιμαστικό AADE Sandbox — Δοκιμαστικό ΜΑΡΚ χωρίς φορολογική ισχύ. }
                }
              </span>
            </div>

            <div class="inline-flex rounded-xl border border-slate-200 p-1 bg-slate-100 self-start sm:self-center">
              <button
                type="button"
                (click)="form.patchValue({ fiscalEnvironment: 'mock', isProduction: false })"
                [class]="form.get('fiscalEnvironment')?.value === 'mock'
                  ? 'px-2.5 py-1.5 text-xs font-bold rounded-lg bg-cyan-600 text-white shadow-xs transition cursor-pointer'
                  : 'px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer'">
                OFFLINE DEMO
              </button>
              <button
                type="button"
                (click)="form.patchValue({ fiscalEnvironment: 'dev', isProduction: false })"
                [class]="(form.get('fiscalEnvironment')?.value || 'dev') === 'dev'
                  ? 'px-2.5 py-1.5 text-xs font-bold rounded-lg bg-amber-500 text-slate-950 shadow-xs transition cursor-pointer'
                  : 'px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer'">
                SANDBOX
              </button>
              <button
                type="button"
                (click)="form.patchValue({ fiscalEnvironment: 'production', isProduction: true })"
                [class]="form.get('fiscalEnvironment')?.value === 'production'
                  ? 'px-2.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white shadow-xs transition cursor-pointer'
                  : 'px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer'">
                PRODUCTION
              </button>
            </div>
          </div>
        </div>

        <!-- Section 4: GSIS Registry Credentials (Ειδικοί Κωδικοί) -->
        <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 class="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <span>🏛️</span>
                <span>GSIS Taxisnet Ειδικοί Κωδικοί (RgWsPublic2)</span>
              </h2>
              <p class="text-[11px] text-slate-400 mt-0.5">Απαραίτητοι για την αυτόματη ανάκτηση επωνυμίας &amp; στοιχείων πελατών/προμηθευτών βάσει ΑΦΜ</p>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Όνομα Χρήστη (GSIS Username)</label>
              <input type="text" formControlName="gsisUsername" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500" placeholder="π.χ. MARANTH-APP2026" />
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Κωδικός Πρόσβασης (GSIS Password)</label>
              <input type="password" formControlName="gsisPassword" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500" placeholder="••••••••" />
            </div>
          </div>
        </div>

        <!-- Submit Button -->
        <div class="flex justify-end gap-3 pt-2">
          @if (savedNotification()) {
            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span>✓</span> {{ savedNotification() }}
            </span>
          }
          <div class="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200/80">
  <button
    type="button"
    (click)="onResetToDemo()"
    [disabled]="isResettingDemo()"
    class="h-10 px-3.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
    title="Επαναφορά προεπιλεγμένου καταστήματος Sandbox Demo"
  >
    <span>🔄</span>
    <span>{{ isResettingDemo() ? 'Επαναφορά...' : 'Επαναφορά Demo' }}</span>
  </button>
          <button
            type="submit"
            [disabled]="isSaving()"
            class="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 disabled:opacity-50 transition active:scale-98 cursor-pointer"
          >
            <span>💾</span>
            <span>{{ isSaving() ? 'Αποθήκευση...' : 'Αποθήκευση Ρυθμίσεων' }}</span>
          </button>
        </div>
        </div>
      </form>
    </div>
  `
})
export class SettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly db = inject(LocalDbService);
  public readonly auth = inject(AuthTenantService);
  private readonly myDataService = inject(MyDataService);
  private readonly cdr = inject(ChangeDetectorRef);
  public readonly isResettingDemo = signal<boolean>(false);

  public readonly isSaving = signal<boolean>(false);
  public readonly savedNotification = signal<string | null>(null);

  public readonly form = this.fb.group({
    afm: [''],
    doy: [''],
    legalName: [''],
    street: [''],
    number: [''],
    postalCode: [''],
    city: [''],
    branch: [0],
    defaultSeries: ['A'],
    aadeUserId: [''],
    aadeSubscriptionKey: [''],
    isProduction: [false],
    fiscalEnvironment: ['dev' as FiscalEnvironment],
    gsisUsername: [''],
    gsisPassword: [''],
    subscriptionTier: ['RETAIL_SHOP' as SubscriptionTier],
    subscriptionStatus: ['ACTIVE' as SubscriptionStatus],
    validUntil: new FormControl<string | null>(null),
    maxMonthlyDocuments: [1000],
    currentMonthDocumentCount: [0],
    tenantId: ['']
  });

  async ngOnInit(): Promise<void> {
    let tenantId = this.auth.currentTenantId();

    let saved: any = null;
    if (tenantId) {
      saved = await this.db.getSettingsForTenant(tenantId);
    } else {
      const all = await this.db.settings.toArray();
      if (all.length > 0) {
        saved = all[0];
        tenantId = saved.tenantId || saved.id;
      }
    }

    if (saved) {
      const savedEnv: FiscalEnvironment = saved.fiscalEnvironment
        ? saved.fiscalEnvironment
        : (saved.isProduction ? 'production' : 'dev');
      const isProd = savedEnv === 'production';

      this.myDataService.setEnvironment(savedEnv);

      this.form.patchValue({
        tenantId: saved.tenantId || saved.id || '',
        afm: saved.afm ? saved.afm.replace(/\D/g, '') : '',
        doy: saved.doy ?? '',
        legalName: saved.legalName ?? '',
        branch: saved.branch ?? 0,
        street: saved.street ?? '',
        number: saved.number ?? '',
        postalCode: saved.postalCode ?? '',
        city: saved.city ?? '',
        defaultSeries: saved.defaultSeries ?? 'A',
        aadeUserId: saved.aadeUserId ?? '',
        aadeSubscriptionKey: saved.aadeSubscriptionKey ?? '',
        fiscalEnvironment: savedEnv,
        isProduction: isProd,
        gsisUsername: saved.gsisUsername ?? '',
        gsisPassword: saved.gsisPassword ?? '',
        subscriptionTier: (saved.subscriptionTier as SubscriptionTier) ?? 'RETAIL_SHOP',
        subscriptionStatus: (saved.subscriptionStatus as SubscriptionStatus) ?? 'ACTIVE',
        validUntil: saved.validUntil ?? null,
        maxMonthlyDocuments: saved.maxMonthlyDocuments ?? 1000,
        currentMonthDocumentCount: saved.currentMonthDocumentCount ?? 0,
      });
    }
  }

  async onSave(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      alert('Παρακαλώ διορθώστε τα πεδία στη φόρμα πριν την αποθήκευση.');
      return;
    }

    const val = this.form.getRawValue();
    const cleanAfm = (val.afm || '').replace(/\D/g, '').trim();

    if (!cleanAfm || cleanAfm.length !== 9) {
      alert('Παρακαλώ εισάγετε ένα έγκυρο 9-ψήφιο Α.Φ.Μ. καταστήματος.');
      return;
    }

    const resolvedEnv: FiscalEnvironment =
      val.fiscalEnvironment ?? (val.isProduction ? 'production' : 'dev');
    const isProdFlag = resolvedEnv === 'production';

    if (isProdFlag) {
      const confirmLive = confirm(
        '⚠️ ΠΡΟΣΟΧΗ: Ενεργοποιείτε το ΠΑΡΑΓΩΓΙΚΟ ΠΕΡΙΒΑΛΛΟΝ (LIVE AADE myDATA).\n\n' +
        'Όλα τα παραστατικά θα υποβάλλονται επίσημα στην ΑΑΔΕ με νομικό MARK.\n\n' +
        'Είστε σίγουροι ότι θέλετε να προχωρήσετε;'
      );
      if (!confirmLive) {
        return;
      }
    }

    const tenantId = this.auth.currentTenantId() || `tenant_${cleanAfm}`;

    this.isSaving.set(true);
    try {
      const payload = {
        id: tenantId,
        tenantId,
        afm: cleanAfm,
        doy: val.doy || '',
        legalName: val.legalName || '',
        street: val.street || '',
        number: val.number || '',
        postalCode: val.postalCode || '',
        city: val.city || '',
        branch: Number(val.branch ?? 0),
        defaultSeries: val.defaultSeries || 'A',
        aadeUserId: (val.aadeUserId || '').trim(),
        aadeSubscriptionKey: (val.aadeSubscriptionKey || '').trim(),
        fiscalEnvironment: resolvedEnv,
        isProduction: isProdFlag,
        gsisUsername: (val.gsisUsername || '').trim(),
        gsisPassword: (val.gsisPassword || '').trim(),
        subscriptionTier: val.subscriptionTier ?? 'RETAIL_SHOP',
        subscriptionStatus: val.subscriptionStatus ?? 'ACTIVE',
        validUntil: val.validUntil,
        maxMonthlyDocuments: val.maxMonthlyDocuments ?? 1000,
        currentMonthDocumentCount: val.currentMonthDocumentCount ?? 0,
        updatedAt: new Date().toISOString(),
      };

      // 1. Initial save to Dexie and seed active tenant identity
      await this.db.saveSettingsForTenant(tenantId, payload);
      this.auth.seedTenantFromSettings(payload);

      // 2. Fetch verified subscription status from Cloudflare Worker
      await this.auth.syncTenantSubscriptionOnBoot(cleanAfm);

      // 3. Synchronize confirmed subscription
      const currentSub = this.auth.subscription();
      if (currentSub) {
        this.form.patchValue({
          tenantId,
          subscriptionTier: currentSub.planName as SubscriptionTier,
          subscriptionStatus: currentSub.status,
          validUntil: currentSub.validUntil,
          maxMonthlyDocuments: currentSub.maxMonthlyDocuments,
        });

        const updatedPayload = {
          ...payload,
          subscriptionTier: currentSub.planName as SubscriptionTier,
          subscriptionStatus: currentSub.status,
          validUntil: currentSub.validUntil,
          maxMonthlyDocuments: currentSub.maxMonthlyDocuments,
        };

        await this.db.saveSettingsForTenant(tenantId, updatedPayload);
        this.auth.seedTenantFromSettings(updatedPayload);
      } else {
        this.form.patchValue({ tenantId });
      }

      // 4. Update runtime AADE service environment signal
      this.myDataService.setEnvironment(resolvedEnv);

      // 5. Force Angular OnPush change detection to render the subscription card
      this.cdr.markForCheck();

      this.savedNotification.set('Οι ρυθμίσεις αποθηκεύτηκαν επιτυχώς!');
      setTimeout(() => {
        this.savedNotification.set(null);
        this.cdr.markForCheck();
      }, 3000);
    } catch (err) {
      console.error('Failed to save tenant settings:', err);
      alert('Προέκυψε σφάλμα κατά την αποθήκευση στο Dexie.');
    } finally {
      this.isSaving.set(false);
      this.cdr.markForCheck();
    }
  }

  public get quotaUsagePercentage(): number {
    const max = Number(this.form.get('maxMonthlyDocuments')?.value);
    const current = Number(this.form.get('currentMonthDocumentCount')?.value || 0);

    if (!max || isNaN(max) || max <= 0) {
      return 5;
    }

    const pct = Math.round((current / max) * 100);
    return Math.min(100, Math.max(0, pct));
  }

  public async onResetToDemo(): Promise<void> {
  const confirmed = window.confirm(
    'Επαναφορά στις προεπιλεγμένες ρυθμίσεις Sandbox Demo;\n\n' +
    'Τα τρέχοντα στοιχεία επιχείρησης και τα κλειδιά API στον τοπικό browser θα αντικατασταθούν με το προφίλ επίδειξης.'
  );
  if (!confirmed) return;

  this.isResettingDemo.set(true);
  try {
    await this.auth.resetToSandboxDemo();
    await this.myDataService.loadTenantEnvironment();

    // Re-run your component's existing settings loader (check ngOnInit for the exact method name)
    await this.ngOnInit();
  } finally {
    this.isResettingDemo.set(false);
  }
}
}
import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { greekAfmValidator } from '../../core/validators/afm.validator';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LocalDbService } from '@core/services/local-db.service';
import { AuthTenantService } from '@core/services/auth-tenant.service';
import { SubscriptionTier, SubscriptionStatus } from '@core/models/tenant.models';
import { FormControl } from '@angular/forms';

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
          <h1 class="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Ρυθμίσεις Καταστήματος & myDATA</h1>
          <p class="text-xs text-slate-500 mt-1">Φορολογική ταυτότητα, συνδρομή και διαπιστευτήρια AADE API</p>
        </div>
        @if (savedNotification()) {
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span>✓</span> {{ savedNotification() }}
          </span>
        }
      </div>

      <form [formGroup]="form" (ngSubmit)="onSave()" class="space-y-6">
        <!-- Section 0: Subscription & License Status -->
        <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="flex items-center gap-3.5">
              <div class="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-lg shrink-0">
                🛡️
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Συνδρομη Maranth Τιμολόγιο:
                    <span class="font-mono text-indigo-600">{{ form.get('subscriptionTier')?.value }}</span>
                  </h3>
                  @switch (form.get('subscriptionStatus')?.value) {
                    @case ('ACTIVE') {
                      <span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ● ΕΝΕΡΓΗ
                      </span>
                    }
                    @case ('GRACE_PERIOD') {
                      <span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                        ▲ ΧΑΡΙΣΤΙΚΗ ΠΕΡΙΟΔΟΣ
                      </span>
                    }
                    @case ('READ_ONLY') {
                      <span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                        ✕ ΜΟΝΟ ΑΝΑΓΝΩΣΗ
                      </span>
                    }
                    @case ('SUSPENDED') {
                      <span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-red-100 text-red-800 border border-red-300">
                        ✕ ΑΝΕΣΤΑΛΗ
                      </span>
                    }
                    @default {
                      <span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                        TRIAL
                      </span>
                    }
                  }
                </div>
                <p class="text-[11px] text-slate-500 mt-1">
  @if (!form.get('validUntil')?.value || form.get('validUntil')?.value?.startsWith('2099')) {
    <span class="inline-flex items-center font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
      ★ ΑΠΕΡΙΟΡΙΣΤΗ (LIFETIME)
    </span>
  } @else {
    <span>Ισχύει έως: <strong class="text-slate-700">{{ form.get('validUntil')?.value | date:'dd/MM/yyyy' }}</strong></span>
  }
  &bull; Έγγραφα Μήνα: <span class="font-mono font-bold text-slate-800">{{ form.get('currentMonthDocumentCount')?.value || 0 }}</span> / {{ form.get('maxMonthlyDocuments')?.value || '∞' }}
</p>
              </div>
            </div>
            <div class="text-right">
              <span class="text-[10px] uppercase font-mono px-2 py-1 bg-slate-100 rounded text-slate-600 border border-slate-200">
                Tenant: {{ auth.currentTenantId() }}
              </span>
            </div>
          </div>
        </div>

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
            <p class="text-[11px] text-slate-400 mt-0.5">Αποτελεί τον προεπιλεγμένο τόπο εκκίνησης (Τόπος Έναρξης) για τα Δελτία Αποστολής (9.1)</p>
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

        <!-- Section 3: AADE Friendly Credentials -->
        <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 class="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <span>🔑</span>
                <span>AADE myDATA REST API Friendly Credentials</span>
              </h2>
              <p class="text-[11px] text-slate-400 mt-0.5">Κωδικοί διεπαφής από την ιστοσελίδα της ΑΑΔΕ</p>
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
          <div class="pt-2 flex items-center gap-2">
            <input type="checkbox" id="isProdCheck" formControlName="isProduction" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            <label for="isProdCheck" class="text-xs font-semibold text-slate-700 cursor-pointer">
              Παραγωγικό Περιβάλλον myDATA (Live Transmission)
            </label>
          </div>
        </div>

        <!-- Submit Button -->
        <div class="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            [disabled]="form.invalid || isSaving()"
            class="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 disabled:opacity-50 transition active:scale-98"
          >
            <span>💾</span>
            <span>{{ isSaving() ? 'Αποθήκευση...' : 'Αποθήκευση Ρυθμίσεων' }}</span>
          </button>
        </div>
      </form>
    </div>
  `
})
export class SettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly db = inject(LocalDbService);
  public readonly auth = inject(AuthTenantService);

  public readonly isSaving = signal<boolean>(false);
  public readonly savedNotification = signal<string | null>(null);

  public readonly form = this.fb.group({
    afm: ['', [Validators.required, greekAfmValidator()]],
    doy: ['', Validators.required],
    legalName: ['', Validators.required],
    street: ['', Validators.required],
    number: ['', Validators.required],
    postalCode: ['', Validators.required],
    city: ['', Validators.required],
    branch: [0],
    defaultSeries: ['A'],
    aadeUserId: [''],
    aadeSubscriptionKey: [''],
    isProduction: [false],
    // Subscription Controls
    subscriptionTier: ['RETAIL_SHOP' as SubscriptionTier],
    subscriptionStatus: ['ACTIVE' as SubscriptionStatus],
    validUntil: new FormControl<string | null>(null),
    maxMonthlyDocuments: [1000],
    currentMonthDocumentCount: [0]
  });

  async ngOnInit(): Promise<void> {
    const tenantId = this.auth.currentTenantId();
    if (!tenantId) return;

    const saved = await this.db.getSettingsForTenant(tenantId);
    if (saved) {
      this.form.patchValue({
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
        isProduction: !!saved.isProduction,
        subscriptionTier: (saved as any).subscriptionTier ?? 'RETAIL_SHOP',
        subscriptionStatus: (saved as any).subscriptionStatus ?? 'ACTIVE',
        validUntil: (saved as any).validUntil ?? null,
        maxMonthlyDocuments: (saved as any).maxMonthlyDocuments ?? 1000,
        currentMonthDocumentCount: (saved as any).currentMonthDocumentCount ?? 0
      });
    }
  }

  async onSave(): Promise<void> {
    if (this.form.invalid) return;

    const tenantId = this.auth.currentTenantId();
    if (!tenantId) {
      alert('Σφάλμα: Δεν βρέθηκε ενεργός οργανισμός (Tenant).');
      return;
    }

    this.isSaving.set(true);
    try {
      const effectiveTenantId = tenantId || 'tenant_default';
      const val = this.form.getRawValue();
      await this.db.saveSettingsForTenant(tenantId, {
        tenantId: effectiveTenantId,
        afm: val.afm!,
        doy: val.doy!,
        legalName: val.legalName!,
        street: val.street!,
        number: val.number!,
        postalCode: val.postalCode!,
        city: val.city!,
        branch: Number(val.branch ?? 0),
        defaultSeries: val.defaultSeries || 'ΕΠΙΣΤΡ',
        aadeUserId: val.aadeUserId || '',
        aadeSubscriptionKey: val.aadeSubscriptionKey || '',
        isProduction: !!val.isProduction,
        subscriptionTier: val.subscriptionTier,
        subscriptionStatus: val.subscriptionStatus,
        validUntil: val.validUntil,
        maxMonthlyDocuments: val.maxMonthlyDocuments,
        currentMonthDocumentCount: val.currentMonthDocumentCount,
        updatedAt: new Date().toISOString()
      } as any);

      this.savedNotification.set('Οι ρυθμίσεις αποθηκεύτηκαν επιτυχώς!');
      setTimeout(() => this.savedNotification.set(null), 3000);
    } catch (err) {
      console.error('Failed to save tenant settings:', err);
      alert('Προέκυψε σφάλμα κατά την αποθήκευση στο Dexie.');
    } finally {
      this.isSaving.set(false);
    }
  }
}
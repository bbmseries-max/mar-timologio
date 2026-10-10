import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { greekAfmValidator } from '../../core/validators/afm.validator';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LocalDbService } from '@core/services/local-db.service';
import { AuthTenantService } from '@core/services/auth-tenant.service';

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
      <p class="text-xs text-slate-500 mt-1">Φορολογική ταυτότητα, έδρα καταστήματος και διαπιστευτήρια AADE API</p>
    </div>
    
    @if (savedNotification()) {
      <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span>✓</span> {{ savedNotification() }}
      </span>
    }
  </div>

  <form [formGroup]="form" (ngSubmit)="onSave()" class="space-y-6">
    
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

    <!-- Section 2: Store Physical Address (Used as Default Τόπος Έναρξης for Transport) -->
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
  `,
  //changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly db = inject(LocalDbService);
  private readonly auth = inject(AuthTenantService);

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
    defaultSeries: ['ΕΠΙΣΤΡ'],
    aadeUserId: [''],
    aadeSubscriptionKey: [''],
    isProduction: [false],
  });

  async ngOnInit(): Promise<void> {
    const tenantId = this.auth.currentTenantId();
    if (!tenantId) return;

    const saved = await this.db.getSettingsForTenant(tenantId);
    if (saved) {
      this.form.patchValue(saved as any);
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
      const val = this.form.getRawValue();
      await this.db.saveSettingsForTenant(tenantId, {
        tenantId,
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
        updatedAt: new Date().toISOString()
      });

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
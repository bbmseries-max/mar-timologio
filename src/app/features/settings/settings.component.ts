import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LocalDbService } from '@core/services/local-db.service';
import { CompanySettingsRecord } from '@core/models/database.models';

@Component({
  selector: 'maranth-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-4xl mx-auto p-6 space-y-6">
      <div class="flex items-center justify-between border-b border-slate-200/80 pb-4">
        <div>
          <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Στοιχεία Επιχείρησης & myDATA</h1>
          <p class="text-xs text-slate-500 mt-0.5">Ρυθμίσεις εκδότη παραστατικών, προεπιλεγμένων σειρών και οχημάτων</p>
        </div>
        <button
          type="button"
          (click)="onSaveSettings()"
          class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition active:scale-98"
        >
          {{ savedStatus() }}
        </button>
      </div>

      <form [formGroup]="settingsForm" class="space-y-6">
        <!-- Fiscal Identity Card -->
        <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
          <div class="flex items-center gap-2 border-b border-slate-100 pb-3">
            <span class="w-2 h-2 rounded-full bg-blue-500"></span>
            <h2 class="text-xs font-bold uppercase tracking-wider text-slate-700">Φορολογική Ταυτότητα Επιχείρησης</h2>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Α.Φ.Μ. Εκδότη *</label>
              <input type="text" formControlName="afm" class="w-full text-xs rounded-lg border-slate-200 px-3 py-2 border font-mono bg-slate-50/50 focus:bg-white" />
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Δ.Ο.Υ. *</label>
              <input type="text" formControlName="doy" class="w-full text-xs rounded-lg border-slate-200 px-3 py-2 border bg-slate-50/50 focus:bg-white" />
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Επωνυμία Επιχείρησης *</label>
              <input type="text" formControlName="legalName" class="w-full text-xs rounded-lg border-slate-200 px-3 py-2 border bg-slate-50/50 focus:bg-white" />
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Διακριτικός Τίτλος</label>
              <input type="text" formControlName="tradeName" class="w-full text-xs rounded-lg border-slate-200 px-3 py-2 border bg-slate-50/50 focus:bg-white" />
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Αριθμός Γ.Ε.Μ.Η.</label>
              <input type="text" formControlName="gemiNumber" class="w-full text-xs rounded-lg border-slate-200 px-3 py-2 border font-mono bg-slate-50/50 focus:bg-white" />
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">IBAN Τράπεζας</label>
              <input type="text" formControlName="bankIban" placeholder="GR00 0000 0000..." class="w-full text-xs rounded-lg border-slate-200 px-3 py-2 border font-mono bg-slate-50/50 focus:bg-white" />
            </div>
          </div>
        </div>

        <!-- Headquarters Address -->
        <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
          <div class="flex items-center gap-2 border-b border-slate-100 pb-3">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <h2 class="text-xs font-bold uppercase tracking-wider text-slate-700">Διεύθυνση Έδρας & Επικοινωνία</h2>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div class="sm:col-span-3">
              <label class="block text-xs font-medium text-slate-600 mb-1">Οδός</label>
              <input type="text" formControlName="street" class="w-full text-xs rounded-lg border-slate-200 px-3 py-2 border" />
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Αριθμός</label>
              <input type="text" formControlName="number" class="w-full text-xs rounded-lg border-slate-200 px-3 py-2 border" />
            </div>
            <div class="sm:col-span-2">
              <label class="block text-xs font-medium text-slate-600 mb-1">Τ.Κ.</label>
              <input type="text" formControlName="postalCode" class="w-full text-xs rounded-lg border-slate-200 px-3 py-2 border font-mono" />
            </div>
            <div class="sm:col-span-2">
              <label class="block text-xs font-medium text-slate-600 mb-1">Πόλη</label>
              <input type="text" formControlName="city" class="w-full text-xs rounded-lg border-slate-200 px-3 py-2 border" />
            </div>
            <div class="sm:col-span-2">
              <label class="block text-xs font-medium text-slate-600 mb-1">Τηλέφωνο</label>
              <input type="text" formControlName="phone" class="w-full text-xs rounded-lg border-slate-200 px-3 py-2 border font-mono" />
            </div>
            <div class="sm:col-span-2">
              <label class="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input type="email" formControlName="email" class="w-full text-xs rounded-lg border-slate-200 px-3 py-2 border" />
            </div>
          </div>
        </div>

        <!-- Ex-Van & Defaults Card -->
        <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
          <div class="flex items-center gap-2 border-b border-slate-100 pb-3">
            <span class="w-2 h-2 rounded-full bg-amber-500"></span>
            <h2 class="text-xs font-bold uppercase tracking-wider text-slate-700">Προεπιλογές Φορητής Πώλησης (Ex-Van)</h2>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Προεπιλεγμένη Σειρά</label>
              <input type="text" formControlName="defaultSeries" class="w-full text-xs rounded-lg border-slate-200 px-3 py-2 border uppercase font-mono" />
              <span class="text-[10px] text-slate-400 mt-1 block">π.χ. VAN-1 ή A</span>
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Πινακίδα Οχήματος Van</label>
              <input type="text" formControlName="defaultVehiclePlate" class="w-full text-xs rounded-lg border-slate-200 px-3 py-2 border uppercase font-mono font-bold" />
              <span class="text-[10px] text-slate-400 mt-1 block">Υποχρεωτικό για 1.2 & 9.1</span>
            </div>
          </div>
        </div>
      </form>
    </div>
  `,
})
export class SettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly db = inject(LocalDbService);

  public readonly savedStatus = signal<string>('Αποθήκευση Ρυθμίσεων');

  public readonly settingsForm = this.fb.group({
    afm: ['801234567', Validators.required],
    legalName: ['MARANTH MONΟΠΡΟΣΩΠΗ Ι.Κ.Ε.', Validators.required],
    tradeName: ['MARANTH TIMOLOGIO', Validators.required],
    doy: ['ΧΑΛΑΝΔΡΙΟΥ', Validators.required],
    gemiNumber: ['154823901000', Validators.required],
    street: ['Λεωφ. Κηφισίας', Validators.required],
    number: ['200', Validators.required],
    postalCode: ['15231', Validators.required],
    city: ['Χαλάνδρι', Validators.required],
    phone: ['+30 210 1234567', Validators.required],
    email: ['info@maranth.gr', [Validators.required, Validators.email]],
    defaultSeries: ['VAN-1', Validators.required],
    defaultVehiclePlate: ['IEB-4892', Validators.required],
    bankIban: ['GR12 0110 1230 0000 1234 5678 901'],
  });

  async ngOnInit(): Promise<void> {
    const existing = await this.db.getCompanySettings();
    if (existing) {
      this.settingsForm.patchValue(existing);
    }
  }

  public async onSaveSettings(): Promise<void> {
    if (this.settingsForm.invalid) return;

    const data = this.settingsForm.getRawValue() as CompanySettingsRecord;
    await this.db.saveCompanySettings(data);
    this.savedStatus.set('✓ Αποθηκεύτηκε!');
    setTimeout(() => this.savedStatus.set('Αποθήκευση Ρυθμίσεων'), 2000);
  }
}
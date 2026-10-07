import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthTenantService } from '@core/services/auth-tenant.service';

@Component({
  selector: 'maranth-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div class="w-full max-w-md bg-white rounded-2xl border border-slate-200/80 shadow-xl p-8 space-y-6">
        
        <!-- Brand Header -->
        <div class="text-center space-y-2">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black flex items-center justify-center text-xl mx-auto shadow-md shadow-blue-500/20">
            M
          </div>
          <h1 class="text-xl font-bold tracking-tight text-slate-900">Maranth Hub</h1>
          <p class="text-xs text-slate-500">Πλατφόρμα Ηλεκτρονικής Τιμολόγησης & myDATA</p>
        </div>

        <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Email Χρήστη</label>
            <input
              type="email"
              formControlName="email"
              placeholder="user@company.gr"
              class="w-full text-xs rounded-xl border-slate-200 px-3.5 py-2.5 border bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Κωδικός Πρόσβασης</label>
            <input
              type="password"
              formControlName="password"
              placeholder="••••••••"
              class="w-full text-xs rounded-xl border-slate-200 px-3.5 py-2.5 border bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
            />
          </div>

          <!-- Quick Tenant Profile Switcher for Testing -->
          <div>
            <label class="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Επιλογή Επιχείρησης / Tenant (Demo Profiles)
            </label>
            <select
              formControlName="tenantPreset"
              class="w-full text-xs rounded-xl border-slate-200 px-3 py-2 border bg-slate-50 text-slate-800 font-medium"
            >
              <option value="tenant_minimarket">🏪 Μίνι Μάρκετ (Barcodes, Αποδείξεις 80mm)</option>
              <option value="tenant_exvan">🚚 Διανομές Ex-Van (Διακίνηση 1.2 & 9.1, Οχήματα)</option>
              <option value="tenant_services">💼 Παροχή Υπηρεσιών / Γραφείο (Τιμολόγιο 2.1, A4 PDF)</option>
            </select>
          </div>

          <button
            type="submit"
            [disabled]="loginForm.invalid || loading()"
            class="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition active:scale-98"
          >
            {{ loading() ? 'Σύνδεση...' : 'Είσοδος στην Εφαρμογή' }}
          </button>
        </form>

        <div class="pt-2 text-center border-t border-slate-100">
          <p class="text-[11px] text-slate-400">
            Ασφαλής κρυπτογράφηση &bull; Multi-Tenant Database Isolation
          </p>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthTenantService);

  public readonly loading = signal<boolean>(false);

  public readonly loginForm = this.fb.group({
    email: ['demo@maranth.gr', [Validators.required, Validators.email]],
    password: ['password123', Validators.required],
    tenantPreset: ['tenant_minimarket', Validators.required],
  });

  public async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) return;
    this.loading.set(true);

    const { email, tenantPreset } = this.loginForm.getRawValue();
    await this.auth.login(email!, tenantPreset!);
    this.loading.set(false);
  }
}
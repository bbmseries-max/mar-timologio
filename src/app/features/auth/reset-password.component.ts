import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

@Component({
  selector: 'maranth-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div class="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <h2 class="text-2xl font-bold tracking-tight text-white">Ορισμός Νέου Κωδικού</h2>
        <p class="mt-1 text-xs text-slate-400">Επιλέξτε έναν ισχυρό κωδικό για την προστασία των παραστατικών σας</p>
      </div>

      <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div class="bg-slate-900 border border-slate-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          
          @if (!token()) {
            <div class="rounded-xl bg-rose-500/10 border border-rose-500/20 p-4 text-center space-y-2">
              <p class="text-xs text-rose-300 font-medium">Μη έγκυρος ή ληγμένος σύνδεσμος επαναφοράς.</p>
              <a routerLink="/forgot-password" class="text-xs text-indigo-400 underline font-semibold block">
                Αίτηση νέου συνδέσμου
              </a>
            </div>
          } @else if (completed()) {
            <div class="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-center space-y-3">
              <p class="text-xs text-emerald-300 font-semibold">Ο κωδικός σας ενημερώθηκε επιτυχώς!</p>
              <a routerLink="/login" class="inline-block px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold">
                Σύνδεση τώρα
              </a>
            </div>
          } @else {
            <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1">Νέος Κωδικός</label>
                <input
                  type="password"
                  formControlName="password"
                  class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1">Επιβεβαίωση Κωδικού</label>
                <input
                  type="password"
                  formControlName="confirmPassword"
                  class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              @if (form.errors?.['mismatch'] && form.get('confirmPassword')?.touched) {
                <p class="text-[11px] text-rose-400">Οι κωδικοί δεν ταιριάζουν.</p>
              }

              <button
                type="submit"
                [disabled]="form.invalid || loading()"
                class="w-full h-10 inline-flex items-center justify-center rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition active:scale-98"
              >
                {{ loading() ? 'Ενημέρωση...' : 'Αποθήκευση Νέου Κωδικού' }}
              </button>
            </form>
          }

        </div>
      </div>
    </div>
  `,
})
export class ResetPasswordComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = new FormBuilder();

  public readonly token = signal<string | null>(null);
  public readonly loading = signal(false);
  public readonly completed = signal(false);

  public readonly form = this.fb.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: (g) => g.get('password')?.value === g.get('confirmPassword')?.value ? null : { mismatch: true } }
  );

  constructor() {
    this.route.queryParams.subscribe((params) => {
      this.token.set(params['token'] || null);
    });
  }

  public async onSubmit(): Promise<void> {
    if (this.form.invalid || !this.token()) return;

    this.loading.set(true);
    // Send { token: this.token(), newPassword: this.form.value.password } to backend
    setTimeout(() => {
      this.loading.set(false);
      this.completed.set(true);
    }, 800);
  }
}
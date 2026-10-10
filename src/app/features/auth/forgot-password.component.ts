import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'maranth-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div class="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 text-white font-black text-xl mb-4 shadow-lg shadow-indigo-500/20">
          M
        </div>
        <h2 class="text-2xl font-bold tracking-tight text-white">Επαναφορά Κωδικού</h2>
        <p class="mt-1 text-xs text-slate-400">Maranth Timologio &bull; myDATA B2B Portal</p>
      </div>

      <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div class="bg-slate-900 border border-slate-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          @if (submitted()) {
            <div class="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-center space-y-3">
              <div class="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-lg">
                ✓
              </div>
              <h3 class="text-sm font-semibold text-emerald-400">Έλεγχος Ηλεκτρονικού Ταχυδρομείου</h3>
              <p class="text-xs text-slate-300 leading-relaxed">
                Εάν υπάρχει καταχωρημένος λογαριασμός για το email <span class="font-mono font-medium text-white">{{ form.value.email }}</span>, 
                έχει αποσταλεί σύνδεσμος ενεργός για 15 λεπτά.
              </p>
              <div class="pt-2">
                <a routerLink="/login" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300 underline">
                  Επιστροφή στη Σύνδεση
                </a>
              </div>
            </div>
          } @else {
            <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-5">
              <div>
                <label for="email" class="block text-xs font-semibold text-slate-300 mb-1.5">
                  Email Λογαριασμού Επιχείρησης
                </label>
                <input
                  id="email"
                  type="email"
                  formControlName="email"
                  placeholder="logistirio@company.gr"
                  autocomplete="email"
                  class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition font-medium"
                />
                @if (form.get('email')?.touched && form.get('email')?.invalid) {
                  <p class="mt-1 text-[11px] text-rose-400">Παρακαλώ εισάγετε έγκυρη διεύθυνση email.</p>
                }
              </div>

              <button
                type="submit"
                [disabled]="form.invalid || loading()"
                class="w-full h-10 inline-flex items-center justify-center rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition active:scale-98 shadow-md shadow-indigo-600/20"
              >
                <span>{{ loading() ? 'Αποστολή...' : 'Αποστολή Συνδέσμου Επαναφοράς' }}</span>
              </button>

              <div class="text-center pt-2">
                <a routerLink="/login" class="text-xs font-medium text-slate-400 hover:text-white transition">
                  Θυμηθήκατε τον κωδικό; <span class="text-indigo-400 font-semibold">Σύνδεση</span>
                </a>
              </div>
            </form>
          }
        </div>
      </div>
    </div>
  `,
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);

  public readonly loading = signal<boolean>(false);
  public readonly submitted = signal<boolean>(false);

  public readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  public async onSubmit(): Promise<void> {
    if (this.form.invalid) return;

    this.loading.set(true);
    setTimeout(() => {
      this.loading.set(false);
      this.submitted.set(true);
    }, 800);
  }
}
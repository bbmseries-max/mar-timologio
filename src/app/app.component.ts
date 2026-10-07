import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthTenantService } from './core/services/auth-tenant.service';

@Component({
  selector: 'maranth-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (auth.isAuthenticated()) {
  <div class="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col font-sans antialiased">
    
    <!-- Subscription Status Bar -->
    @if (auth.isGracePeriod()) {
      <div id="app-root-shell" class="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col font-sans antialiased">
        <div class="flex items-center gap-2 mx-auto sm:mx-0">
          <span>⚠️</span>
          <span>
            Η συνδρομή σας έχει λήξει. Απομένουν <strong>{{ auth.daysLeftInGrace() }} ημέρες περιόδου χάριτος</strong> πριν την απενεργοποίηση έκδοσης νέων παραστατικών.
          </span>
        </div>
        <a href="https://maranth.gr/billing" target="_blank" class="hidden sm:inline-block px-3 py-1 bg-slate-950 text-white rounded-md text-[11px] font-bold hover:bg-slate-800 transition">
          Ανανέωση Τώρα
        </a>
      </div>
    }

    @if (auth.isReadOnlyMode()) {
      <div class="bg-rose-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-xs">
        <div class="flex items-center gap-2 mx-auto sm:mx-0">
          <span>🛑</span>
          <span>
            <strong>Λειτουργία Μόνο Ανάγνωσης:</strong> Η έκδοση παραστατικών έχει ανασταλεί λόγω ανεξόφλητης συνδρομής. Μπορείτε ακόμα να δείτε και να εξάγετε το αρχείο σας.
          </span>
        </div>
        <a href="https://maranth.gr/billing" target="_blank" class="hidden sm:inline-block px-3 py-1 bg-white text-rose-700 rounded-md text-[11px] font-bold hover:bg-slate-100 transition">
          Εξόφληση & Επανενεργοποίηση
        </a>
      </div>
    }

    <!-- Top Header -->
    <header class="bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        
        <div class="flex items-center gap-6">
          <a routerLink="/invoices/new" class="flex items-center gap-2.5 group">
            <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black flex items-center justify-center text-sm shadow-sm shadow-blue-500/20 group-hover:scale-105 transition-transform">
              M
            </div>
            <div>
              <span class="text-sm font-bold tracking-tight text-slate-900 block leading-tight">Maranth Hub</span>
              <span class="text-[10px] font-semibold text-blue-600 block leading-none truncate max-w-[140px] sm:max-w-[200px]">
                {{ auth.activeTenant()?.name }}
              </span>
            </div>
          </a>

          <nav class="hidden sm:flex items-center gap-1 text-xs font-semibold">
            @if (auth.canIssueInvoices()) {
              <a
                routerLink="/invoices/new"
                routerLinkActive="bg-blue-50 text-blue-700"
                class="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 transition"
              >
                + Έκδοση
              </a>
            }
            <a
              routerLink="/invoices"
              routerLinkActive="bg-blue-50 text-blue-700"
              class="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 transition"
            >
              Αρχείο
            </a>
            @if (auth.featureFlags().enableGoodsMovement && auth.canIssueInvoices()) {
              <a
                routerLink="/delivery-notes"
                routerLinkActive="bg-blue-50 text-blue-700"
                class="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 transition flex items-center gap-1.5"
              >
                <span>Διακίνηση (9.1)</span>
                <span class="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold border border-amber-200">Van</span>
              </a>
            }
          </nav>
        </div>

        <div class="flex items-center gap-3">
          <span class="hidden md:inline-block px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-mono">
            Α.Φ.Μ.: {{ auth.activeTenant()?.fiscalIdentity?.afm }}
          </span>

          <a
            routerLink="/settings"
            routerLinkActive="text-blue-600 bg-blue-50"
            class="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition text-xs"
            title="Ρυθμίσεις"
          >
            ⚙️
          </a>

          <button
            type="button"
            (click)="auth.logout()"
            class="text-xs text-rose-600 hover:text-rose-700 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition"
          >
            Έξοδος
          </button>
        </div>

      </div>
    </header>

    <main class="flex-1 pb-12">
      <router-outlet></router-outlet>
    </main>

    <footer class="border-t border-slate-200/60 py-6 text-center text-xs text-slate-400 bg-white/50">
      <p>Maranth Hub Multi-Tenant Platform &bull; AADE myDATA v1.0.8 &bull; Terms of Service Enforced</p>
    </footer>
  </div>
} @else {
  <router-outlet></router-outlet>
}
  `,
})
export class AppComponent {
  public readonly auth = inject(AuthTenantService);
}
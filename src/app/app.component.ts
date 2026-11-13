import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthTenantService } from './core/services/auth-tenant.service';
import { MyDataService } from './core/services/mydata.service';
import { EnvironmentBannerComponent } from '@features/invoices/invoice-builder/environment-banner.component';

@Component({
  selector: 'maranth-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, EnvironmentBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (auth.isAuthenticated()) {
      <div id="app-root-shell" class="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col font-sans antialiased">

        <!-- Fiscal Environment Banner (Sandbox / Offline Demo) -->
        <app-environment-banner class="no-print" />

        <!-- Subscription Status Bar -->
        @if (auth.isGracePeriod()) {
          <div class="bg-amber-100 border-b border-amber-300 text-amber-950 px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-xs no-print">
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
          <div class="bg-rose-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-xs no-print">
            <div class="flex items-center gap-2 mx-auto sm:mx-0">
              <span>🛑</span>
              <span>
                <strong>Λειτουργία Μόνο Ανάγνωσης:</strong> Η έκδοση παραστατικών έχει ανασταλεί λόγω ανεξόφλητης συνδρομής. Μπορείτε ακόμα να δείτε και να εξάγετε το αρχείο σας.
              </span>
            </div>
            <a href="https://maranth.gr/billing" target="_blank" class="hidden sm:inline-block px-3 py-1 bg-white text-rose-700 rounded-md text-[11px] font-bold hover:bg-slate-100 transition">
              Εξόφληση &amp; Επανενεργοποίηση
            </a>
          </div>
        }

        <!-- Top Header -->
        <header class="sticky top-0 z-40 w-full bg-slate-950 text-white border-b border-slate-800 shadow-md backdrop-blur-md no-print">
          <div class="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

            <!-- BRAND / LOGO & TENANT INFO -->
            <div class="flex items-center gap-6">
              <a routerLink="/invoices/new" class="flex items-center gap-3 group cursor-pointer">
                <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-black text-white text-base shadow-sm ring-1 ring-white/20 group-hover:scale-105 transition-transform">
                  M
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-black text-sm sm:text-base tracking-tight text-white uppercase leading-tight">
                      Maranth Hub
                    </span>
                    <span class="text-[9px] font-mono font-bold bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30">
                      ERP
                    </span>
                  </div>
                  <span class="text-[11px] font-semibold text-slate-400 block leading-none truncate max-w-[150px] sm:max-w-[220px] mt-0.5" [title]="auth.activeTenant()?.name || ''">
                    {{ auth.activeTenant()?.name || 'Επιχείρηση' }}
                  </span>
                </div>
              </a>

              <!-- DESKTOP NAVIGATION MENU -->
              <nav class="hidden md:flex items-center gap-1.5">
                @if (auth.canIssueInvoices()) {
                  <a
                    routerLink="/invoices/new"
                    routerLinkActive="bg-white/10 text-white font-bold border-white/20 shadow-xs"
                    class="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 border border-transparent transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span class="text-amber-400 text-sm">⚡</span>
                    <span>ΕΚΔΟΣΗ</span>
                  </a>
                }

                <a
                  routerLink="/invoices"
                  routerLinkActive="bg-white/10 text-white font-bold border-white/20 shadow-xs"
                  class="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 border border-transparent transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span class="text-slate-400 text-sm">📋</span>
                  <span>ΑΡΧΕΙΟ Παραστατικών</span>
                </a>
                <a
          routerLink="/help"
          routerLinkActive="bg-white/10 text-white font-bold border-white/20 shadow-xs"
          class="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 border border-transparent transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <span class="text-sky-400 text-sm">📘</span>
          <span>ΒΟΗΘΕΙΑ &amp; FAQ</span>
        </a>

                @if (auth.featureFlags().enableGoodsMovement && auth.canIssueInvoices()) {
                  <a
                    routerLink="/delivery-notes"
                    routerLinkActive="bg-white/10 text-white font-bold border-white/20 shadow-xs"
                    class="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 border border-transparent transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span class="text-slate-400 text-sm">🚚</span>
                    <span>ΔΕΛΤΙΑ Διακίνησης</span>
                    <span class="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Van
                    </span>
                  </a>
                 
                }
              </nav>
            </div>

            <!-- RIGHT UTILITY CONTROLS -->
            <div class="flex items-center gap-2.5 sm:gap-3">
              <!-- Tenant AFM Badge -->
              @if (auth.activeTenant()?.fiscalIdentity?.afm) {
                <div class="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 shadow-2xs">
                  <span class="text-slate-500 uppercase font-sans text-[10px] font-bold">ΑΦΜ:</span>
                  <span class="font-bold text-white select-all">{{ auth.activeTenant()?.fiscalIdentity?.afm }}</span>
                </div>
              }

              <!-- Settings Icon Button -->
              <a
                routerLink="/settings"
                routerLinkActive="bg-white/10 text-white border-white/20 shadow-xs"
                class="h-10 w-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 border border-slate-800/80 rounded-xl transition-all cursor-pointer"
                title="Ρυθμίσεις Συστήματος"
              >
                <span class="text-base leading-none">⚙️</span>
              </a>
              <a
          routerLink="/help"
          routerLinkActive="text-white font-bold bg-white/10 border-white/20"
          class="flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-lg text-slate-400 hover:text-white transition-all text-[11px] border border-transparent"
        >
          <span class="text-sm">📘</span>
          <span>ΒΟΗΘΕΙΑ</span>
             </a>

              <!-- Logout Button -->
              <button
                type="button"
                (click)="auth.logout()"
                class="h-10 px-3.5 rounded-xl text-xs font-bold text-rose-300 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-all active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
              >
                <span class="text-xs">🚪</span>
                <span>Έξοδος</span>
              </button>
            </div>

          </div>

          <!-- MOBILE SUB-NAVIGATION BAR (Visible on screens < 768px) -->
          <nav class="md:hidden flex items-center justify-around border-t border-slate-800/80 bg-slate-950 px-2 py-2">
            @if (auth.canIssueInvoices()) {
              <a
                routerLink="/invoices/new"
                routerLinkActive="text-white font-bold bg-white/10 border-white/20"
                class="flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-lg text-slate-400 hover:text-white transition-all text-[11px] border border-transparent"
              >
                <span class="text-sm">⚡</span>
                <span>ΕΚΔΟΣΗ</span>
              </a>
            }

            <a
              routerLink="/invoices"
              routerLinkActive="text-white font-bold bg-white/10 border-white/20"
              class="flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-lg text-slate-400 hover:text-white transition-all text-[11px] border border-transparent"
            >
              <span class="text-sm">📋</span>
              <span>ΑΡΧΕΙΟ</span>
            </a>

            @if (auth.featureFlags().enableGoodsMovement && auth.canIssueInvoices()) {
              <a
                routerLink="/delivery-notes"
                routerLinkActive="text-white font-bold bg-white/10 border-white/20"
                class="flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-lg text-slate-400 hover:text-white transition-all text-[11px] border border-transparent"
              >
                <span class="text-sm">🚚</span>
                <span>ΔΕΛΤΙΑ</span>
              </a>
            }
          </nav>
        </header>

        <main class="flex-1 pb-12">
          <router-outlet></router-outlet>
        </main>

        <footer class="border-t border-slate-200/60 py-6 text-center text-xs text-slate-400 bg-white/50 no-print">
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
  private readonly myDataService = inject(MyDataService);

  constructor() {
    effect(() => {
      const tenantId = this.auth.currentTenantId();
      if (tenantId) {
        this.myDataService.loadTenantEnvironment();
      }
    });
  }
}
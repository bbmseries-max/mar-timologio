import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MyDataService } from '@core/services/mydata.service';
@Component({
  selector: 'app-environment-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (env() === 'dev') {
      <aside 
        role="status"
        aria-live="polite"
        class="w-full bg-amber-500 text-slate-950 px-4 py-1.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-inner select-none">
        <span class="text-base leading-none">⚠️</span>
        <span>AADE DEV SANDBOX ACTIVE — No real tax liabilities created</span>
      </aside>
    } @else if (env() === 'mock') {
      <aside 
        role="status"
        aria-live="polite"
        class="w-full bg-cyan-600 text-white px-4 py-1.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-inner select-none">
        <span class="text-base leading-none">🧪</span>
        <span>OFFLINE SIMULATION MODE — Dexie DB only (No AADE network calls)</span>
      </aside>
    }
  `
})
export class EnvironmentBannerComponent {
  private readonly myDataService = inject(MyDataService);
  readonly env = this.myDataService.currentEnvironment;
}
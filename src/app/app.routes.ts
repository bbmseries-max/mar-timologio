import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
    title: 'Σύνδεση — Maranth Hub',
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'invoices/new',
      },
      {
        path: 'invoices/new',
        loadComponent: () =>
          import('./features/invoices/invoice-builder/invoice-builder.component').then(
            (m) => m.InvoiceBuilderComponent
          ),
        title: 'Νέο Παραστατικό — Maranth Hub',
      },
      {
        path: 'invoices',
        loadComponent: () =>
          import('./features/invoices/invoice-list/invoice-list.component').then(
            (m) => m.InvoiceListComponent
          ),
        title: 'Αρχείο Παραστατικών — Maranth Hub',
      },
      {
        path: 'delivery-notes',
        loadComponent: () =>
          import('./features/delivery-notes/delivery-notes.component').then(
            (m) => m.DeliveryNotesComponent
          ),
        title: 'Δελτία Διακίνησης — Maranth Hub',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then(
            (m) => m.SettingsComponent
          ),
        title: 'Ρυθμίσεις — Maranth Hub',
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'invoices/new',
  },
];
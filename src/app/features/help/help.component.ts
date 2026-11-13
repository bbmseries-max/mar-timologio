import { Component, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

interface HelpItem {
  id: string;
  category: 'INVOICES' | 'DISPATCH' | 'MYDATA' | 'SERVICES';
  badge?: string;
  question: string;
  answer: string;
  tips?: string[];
}

@Component({
  selector: 'maranth-help',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <!-- Header -->
      <div class="bg-slate-950 text-white rounded-2xl p-6 sm:p-8 border border-slate-800 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[11px] font-bold uppercase tracking-wider mb-2">
            <span>📘</span>
            <span>Κέντρο Βοήθειας &amp; Κανονιστικός Οδηγός</span>
          </div>
          <h1 class="text-xl sm:text-2xl font-black tracking-tight">
            Ηλεκτρονική Τιμολόγηση, Ψηφιακή Διακίνηση &amp; AADE myDATA
          </h1>
          <p class="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
            Τι αλλάζει με το νέο πλαίσιο της ΑΑΔΕ, πώς σας καλύπτει πλήρως το Maranth Hub και σε ποιες επιχειρήσεις απευθύνεται.
          </p>
        </div>

        <a
          routerLink="/invoices/new"
          class="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition shrink-0"
        >
          <span>⚡</span>
          <span>Έκδοση Παραστατικού</span>
        </a>
      </div>

      <!-- =================================================================== -->
      <!-- EXECUTIVE ENTRY BRIEFING: AADE LAW, WHAT CHANGES & WHO WE SERVE     -->
      <!-- =================================================================== -->
      <section class="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 sm:p-7 space-y-6">
        <div class="border-b border-slate-100 pb-4">
          <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
            Εισαγωγική Ανάλυση &amp; Νομοθετικό Πλαίσιο ΑΑΔΕ
          </span>
          <h2 class="text-lg font-extrabold text-slate-900 mt-0.5">
            Τι ισχύει, τι αλλάζει με τα νέα μέτρα της ΑΑΔΕ &amp; πώς λειτουργεί το Maranth Hub
          </h2>
          <p class="text-xs text-slate-600 mt-1.5 leading-relaxed">
            Η ψηφιακή διαβίβαση παραστατικών στο <strong>myDATA</strong> και το <strong>Ψηφιακό Δελτίο Αποστολής</strong> αποτελούν πλέον τον κεντρικό πυλώνα φορολογικής συμμόρφωσης στην Ελλάδα. Τα χειρόγραφα μπλοκ και τα ασύνδετα αρχεία αντικαθίστανται από διαβίβαση σε πραγματικό χρόνο (real-time) με Μοναδικό Αριθμό Καταχώρισης (<strong>ΜΑΡΚ</strong>) και επαληθεύσιμο <strong>QR Code</strong> επάνω σε κάθε εκτύπωση.
          </p>
        </div>

        <!-- 3-Column Analysis Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <!-- Column 1: What Changes -->
          <div class="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-2">
            <div class="flex items-center gap-2 font-bold text-amber-950 text-sm">
              <span>⚖️</span>
              <span>Τι Αλλάζει με το Νέο Πλαίσιο</span>
            </div>
            <ul class="space-y-1.5 text-amber-900/90 leading-relaxed">
              <li>• <strong>Real-Time Διαβίβαση:</strong> Κάθε τιμολόγιο και απόδειξη διαβιβάζεται άμεσα στην ΑΑΔΕ κατά την έκδοση και λαμβάνει ΜΑΡΚ &amp; QR Code.</li>
              <li>• <strong>Ψηφιακή Διακίνηση Αποθεμάτων:</strong> Υποχρεωτική ψηφιακή έκδοση Δελτίων Αποστολής (9.1, 9.2, 9.3) με στοιχεία οχήματος, τόπου φόρτωσης &amp; προορισμού πριν την αναχώρηση.</li>
              <li>• <strong>Τέλος στα Χειρόγραφα:</strong> Αυστηροί έλεγχοι σε διακινήσεις χωρίς ψηφιακό ΜΑΡΚ και υποχρεωτική αντιστοίχιση εσόδων/εξόδων.</li>
            </ul>
          </div>

          <!-- Column 2: What We Already Have & Cover -->
          <div class="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-2">
            <div class="flex items-center gap-2 font-bold text-emerald-950 text-sm">
              <span>🛡️</span>
              <span>Τι Καλύπτουμε Ήδη Πλήρως</span>
            </div>
            <ul class="space-y-1.5 text-emerald-900/90 leading-relaxed">
              <li>• <strong>Όλοι οι Τύποι Παραστατικών:</strong> B2B Ελλάδας (1.1), Ενδοκοινοτικές ΕΕ (1.2), Τρίτες Χώρες (1.3), Λιανική ΑΛΠ/ΑΠΥ (11.1/11.2) και Δελτία Αποστολής (9.1, 9.2, 9.3).</li>
              <li>• <strong>Αυτόματος Έλεγχος ΑΦΜ:</strong> Άμεση άντληση στοιχείων από ΑΑΔΕ (RgWsPublic2) &amp; έλεγχος κοινοτικών ΑΦΜ μέσω EU VIES.</li>
              <li>• <strong>Εκτύπωση &amp; Ακυρώσεις:</strong> Έτοιμα πρότυπα Α4 &amp; θερμικού 80mm με QR ΑΑΔΕ, ασφαλής ακύρωση ΜΑΡΚ και λειτουργία Offline Demo / Sandbox.</li>
            </ul>
          </div>

          <!-- Column 3: Who We Offer Our App To -->
          <div class="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200/80 space-y-2">
            <div class="flex items-center gap-2 font-bold text-indigo-950 text-sm">
              <span>🏢</span>
              <span>Σε Ποιους Απευθύνεται</span>
            </div>
            <ul class="space-y-1.5 text-indigo-900/90 leading-relaxed">
              <li>• <strong>Καταστήματα Λιανικής &amp; Mini Market:</strong> Ταχύτατη έκδοση αποδείξεων/τιμολογίων σε 80mm ή Α4 και σύνδεση με ταμειακό καλάθι POS.</li>
              <li>• <strong>Χονδρικό Εμπόριο &amp; Van Sales:</strong> Πλήρης κάλυψη φόρτωσης οχημάτων (9.2) και παραδόσεων (9.1 / 9.3) εν κινήσει.</li>
              <li>• <strong>Εξαγωγικές &amp; Ελεύθεροι Επαγγελματίες:</strong> Αυτόματη διαχείριση απαλλαγών ΦΠΑ (0%) για πελάτες ΕΕ &amp; Τρίτων Χωρών χωρίς πολύπλοκα λογιστικά προγράμματα.</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Search & Category Filter Bar -->
      <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
        <div class="relative">
          <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input
            type="text"
            [value]="searchQuery()"
            (input)="onSearch($event)"
            placeholder="Αναζήτηση σε ερωτήσεις & οδηγίες (π.χ. 1.2, Ενδοκοινοτική, Δελτίο Αποστολής, Ακύρωση, QR, Sandbox)..."
            class="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs">
          @for (cat of categories; track cat.key) {
            <button
              type="button"
              (click)="selectedCategory.set(cat.key)"
              [class]="selectedCategory() === cat.key
                ? 'px-3 py-1.5 rounded-lg font-bold bg-slate-900 text-white shadow-2xs transition cursor-pointer'
                : 'px-3 py-1.5 rounded-lg font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200/70 transition cursor-pointer'"
            >
              {{ cat.label }}
            </button>
          }
        </div>
      </div>

      <!-- Detailed FAQ & Reference Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        @for (item of filteredItems(); track item.id) {
          <article class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between space-y-3 hover:border-indigo-200 transition">
            <div class="space-y-2">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                  {{ categoryLabel(item.category) }}
                </span>
                @if (item.badge) {
                  <span class="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {{ item.badge }}
                  </span>
                }
              </div>

              <h2 class="text-sm font-bold text-slate-900 leading-snug">
                {{ item.question }}
              </h2>

              <p class="text-xs text-slate-600 leading-relaxed">
                {{ item.answer }}
              </p>
            </div>

            @if (item.tips?.length) {
              <ul class="pt-2 border-t border-slate-100 space-y-1">
                @for (tip of item.tips; track tip) {
                  <li class="text-[11px] text-slate-500 flex items-start gap-1.5">
                    <span class="text-emerald-600 font-bold">✓</span>
                    <span>{{ tip }}</span>
                  </li>
                }
              </ul>
            }
          </article>
        } @empty {
          <div class="md:col-span-2 bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-2">
            <p class="text-sm font-bold text-slate-800">Δεν βρέθηκαν αποτελέσματα για «{{ searchQuery() }}»</p>
            <p class="text-xs text-slate-500">Δοκιμάστε διαφορετικό όρο αναζήτησης ή επιλέξτε «Όλα τα Θέματα».</p>
          </div>
        }
      </div>
    </div>
  `,
})
export class HelpComponent {
  public readonly searchQuery = signal<string>('');
  public readonly selectedCategory = signal<'ALL' | HelpItem['category']>('ALL');

  public readonly categories: Array<{ key: 'ALL' | HelpItem['category']; label: string }> = [
    { key: 'ALL', label: 'Όλα τα Θέματα' },
    { key: 'INVOICES', label: 'Τύποι Τιμολογίων (1.1 - 11.2)' },
    { key: 'DISPATCH', label: 'Δελτία Διακίνησης (9.1 - 9.3)' },
    { key: 'MYDATA', label: 'myDATA & Λειτουργίες' },
    { key: 'SERVICES', label: 'Υπηρεσίες & Εργαλεία' },
  ];

  private readonly items: HelpItem[] = [
    {
      id: 'inv-1-1',
      category: 'INVOICES',
      badge: 'Τύπος 1.1',
      question: 'Πότε εκδίδω Τιμολόγιο Πώλησης (1.1);',
      answer: 'Χρησιμοποιείται για πωλήσεις αγαθών B2B εντός Ελλάδας (από ελληνική επιχείρηση προς ελληνική επιχείρηση/επαγγελματία) με κανονικούς συντελεστές ΦΠΑ (24%, 13%, 6%).',
      tips: [
        'Υποχρεωτικό 9-ψήφιο ΑΦΜ λήπτη.',
        'Χρησιμοποιήστε το κουμπί αναζήτησης ΑΦΜ για αυτόματη συμπλήρωση επωνυμίας, ΔΟΥ και διεύθυνσης.',
      ],
    },
    {
      id: 'inv-1-2',
      category: 'INVOICES',
      badge: 'Τύπος 1.2',
      question: 'Πότε εκδίδω Τιμολόγιο Πώλησης / Ενδοκοινοτικές Παραδόσεις (1.2);',
      answer: 'Εκδίδεται για πωλήσεις αγαθών B2B προς επιχειρήσεις εγκατεστημένες σε άλλο κράτος-μέλος της Ευρωπαϊκής Ένωσης (εκτός Ελλάδας), με απαλλαγή ΦΠΑ (0% — Άρθρο 28 Κώδικα ΦΠΑ).',
      tips: [
        'Επιλέξτε τη χώρα προορισμού (ΕΕ) — το σύστημα ρυθμίζει αυτόματα τον ΦΠΑ σε 0% με αιτία απαλλαγής.',
        'Επαληθεύστε το κοινοτικό ΑΦΜ του πελάτη μέσω EU VIES πριν την έκδοση.',
      ],
    },
    {
      id: 'inv-1-3',
      category: 'INVOICES',
      badge: 'Τύπος 1.3',
      question: 'Πότε εκδίδω Τιμολόγιο Πώλησης / Παραδόσεις Τρίτων Χωρών (1.3);',
      answer: 'Αφορά εξαγωγές αγαθών προς πελάτες σε χώρες εκτός Ευρωπαϊκής Ένωσης (π.χ. ΗΠΑ, Ηνωμένο Βασίλειο, Ελβετία, τρίτες αγορές), με απαλλαγή ΦΠΑ 0% (Άρθρο 24 Κώδικα ΦΠΑ).',
      tips: [
        'Διατίθεται λίστα χωρών εκτός ΕΕ καθώς και πεδίο χειροκίνητης καταχώρισης 2-ψήφιου κωδικού ISO.',
      ],
    },
    {
      id: 'inv-retail',
      category: 'INVOICES',
      badge: 'Τύποι 11.1 / 11.2',
      question: 'Ποια η διαφορά μεταξύ ΑΛΠ (11.1) και ΑΠΥ (11.2);',
      answer: 'Αφορούν πωλήσεις λιανικής προς ιδιώτες καταναλωτές (B2C) χωρίς απαίτηση ΑΦΜ πελάτη. Το 11.1 χρησιμοποιείται για πώληση φυσικών αγαθών, ενώ το 11.2 για παροχή υπηρεσιών.',
      tips: [
        'Υποστηρίζεται άμεση εκτύπωση θερμικής απόδειξης 80mm ή κλασικού Α4 με QR επαλήθευσης ΑΑΔΕ.',
      ],
    },
    {
      id: 'disp-9-1-9-2',
      category: 'DISPATCH',
      badge: 'Τύποι 9.1 & 9.2',
      question: 'Τι είναι το Δελτίο Αποστολής (9.1) και το Συγκεντρωτικό Δελτίο (9.2);',
      answer: 'Το 9.1 συνοδεύει τη διακίνηση αγαθών προς συγκεκριμένο παραλήπτη χωρίς άμεση τιμολόγηση. Το 9.2 (Συγκεντρωτικό) εκδίδεται για φόρτωση προϊόντων σε όχημα (Van Sales) για διανομή χωρίς προκαθορισμένο παραλήπτη.',
      tips: [
        'Η ακύρωση Συγκεντρωτικού 9.2 εμφανίζει προειδοποίηση εάν υπάρχουν συσχετισμένα ενεργά 9.1.',
      ],
    },
    {
      id: 'disp-9-3',
      category: 'DISPATCH',
      badge: 'Τύπος 9.3',
      question: 'Πότε χρησιμοποιώ το Δελτίο Αποστολής Συσχετιζόμενο (9.3);',
      answer: 'Εκδίδεται για τη διακίνηση αγαθών όταν υπάρχει συσχέτιση με προγενέστερο παραστατικό (όπως επιστροφές, διακίνηση βάσει παραγγελίας ή συσχετιζόμενη αποστολή).',
      tips: [
        'Συμπληρώστε τον αριθμό κυκλοφορίας οχήματος, τον τόπο φόρτωσης και τον προορισμό.',
      ],
    },
    {
      id: 'env-modes',
      category: 'MYDATA',
      badge: '3 Λειτουργίες',
      question: 'Ποια η διαφορά μεταξύ Offline Demo, Sandbox και Production;',
      answer: 'Στις Ρυθμίσεις επιλέγετε τον τρόπο λειτουργίας: Offline Demo (τοπική αποθήκευση χωρίς κλήσεις στην ΑΑΔΕ), Sandbox (δοκιμαστικό περιβάλλον ΑΑΔΕ με δοκιμαστικό ΜΑΡΚ) και Production (επίσημη παραγωγική διαβίβαση με νομική ισχύ).',
      tips: [
        'Όταν βρίσκεστε σε Demo ή Sandbox, εμφανίζεται ευδιάκριτη μπάρα ειδοποίησης στην κορυφή της οθόνης.',
      ],
    },
    {
      id: 'cancel-invoice',
      category: 'MYDATA',
      badge: 'Ακύρωση ΜΑΡΚ',
      question: 'Πώς ακυρώνω ένα διαβιβασμένο παραστατικό;',
      answer: 'Από το «Αρχείο Παραστατικών», επιλέξτε το παραστατικό που φέρει ΜΑΡΚ και πατήστε «Ακύρωση». Το σύστημα αποστέλλει αίτημα CancelInvoice στην ΑΑΔΕ και καταγράφει τον Μοναδικό Αριθμό Ακύρωσης.',
      tips: [
        'Παραστατικά που έχουν ήδη ακυρωθεί επισημαίνονται καθαρά στο αρχείο και δεν μπορούν να ακυρωθούν δεύτερη φορά.',
      ],
    },
    {
      id: 'srv-lookup',
      category: 'SERVICES',
      badge: 'GSIS & EU VIES',
      question: 'Πώς λειτουργεί η αυτόματη αναζήτηση στοιχείων πελάτη μέσω ΑΦΜ;',
      answer: 'Πληκτρολογώντας 9-ψήφιο ελληνικό ΑΦΜ, η εφαρμογή ανακτά αυτόματα επωνυμία, Δ.Ο.Υ., διεύθυνση και κατάσταση δραστηριότητας μέσω ΑΑΔΕ (RgWsPublic2). Για κοινοτικούς πελάτες ΕΕ γίνεται έλεγχος εγκυρότητας μέσω EU VIES.',
    },
    {
      id: 'srv-pos-print',
      category: 'SERVICES',
      badge: 'POS & Εκτύπωση A4/80mm',
      question: 'Ποιες άλλες υπηρεσίες περιλαμβάνει η πλατφόρμα;',
      answer: 'Υποστηρίζει σύνδεση καλαθιού από εφαρμογή POS λιανικής για άμεση τιμολόγηση, αποθήκευση πελατολογίου & προϊόντων ανά επιχείρηση, εξαγωγή αρχείου, και επαγγελματική εκτύπωση σε Α4 ή θερμικό εκτυπωτή 80mm με επίσημο QR Code ΑΑΔΕ.',
    },
  ];

  public readonly filteredItems = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const cat = this.selectedCategory();

    return this.items.filter(item => {
      const matchesCat = cat === 'ALL' || item.category === cat;
      if (!matchesCat) return false;
      if (!q) return true;

      return (
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        (item.badge && item.badge.toLowerCase().includes(q)) ||
        (item.tips && item.tips.some(t => t.toLowerCase().includes(q)))
      );
    });
  });

  public onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input?.value || '');
  }

  public categoryLabel(cat: HelpItem['category']): string {
    switch (cat) {
      case 'INVOICES':
        return 'Τιμολόγια';
      case 'DISPATCH':
        return 'Διακίνηση';
      case 'MYDATA':
        return 'AADE myDATA';
      case 'SERVICES':
        return 'Υπηρεσίες';
    }
  }
}
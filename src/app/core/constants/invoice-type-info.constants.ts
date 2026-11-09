// src/app/constants/invoice-type-info.constants.ts

export interface InvoiceTypeGuide {
  code: string;
  name: string;
  groupLabel: string;
  groupBadgeClass: string;
  shortSummary: string;
  counterpartRule: string;
  pricingRule: string;
  transportRule?: string;
  exampleScenario: string;
}

export const INVOICE_TYPE_GUIDES: Record<string, InvoiceTypeGuide> = {
  // GROUP 1: Τιμολόγηση & Παροχή (B2B)
  '1.1': {
    code: '1.1',
    name: 'Τιμολόγιο Πώλησης',
    groupLabel: 'Τιμολόγηση & Παροχή (B2B)',
    groupBadgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    shortSummary: 'Χονδρική πώληση αγαθών προς επιχειρήσεις ή ελεύθερους επαγγελματίες.',
    counterpartRule: 'Υποχρεωτικό έγκυρο Α.Φ.Μ. (Μητρώο GSIS).',
    pricingRule: 'Κανονική τιμολόγηση με συντελεστές Φ.Π.Α. (24%, 13%, 6%, κ.λπ.).',
    exampleScenario: 'Έκδοση τιμολογίου για παράδοση προϊόντων σε εταιρικό πελάτη.',
  },
  '2.1': {
    code: '2.1',
    name: 'Τιμολόγιο Παροχής Υπηρεσιών',
    groupLabel: 'Τιμολόγηση & Παροχή (B2B)',
    groupBadgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    shortSummary: 'Παροχή αμιγών υπηρεσιών (όχι φυσικά αγαθά) προς επιχειρήσεις.',
    counterpartRule: 'Υποχρεωτικό έγκυρο Α.Φ.Μ.',
    pricingRule: 'Φ.Π.Α. υπηρεσιών, υποχρεωτικός χαρακτηρισμός εσόδων category1_3 (E3_561_002).',
    exampleScenario: 'Αμοιβή για τεχνικές εργασίες, συντήρηση, μεταφορικά ή συμβουλευτική.',
  },

  // GROUP 2: Λιανικές Συναλλαγές (B2C)
  '11.1': {
    code: '11.1',
    name: 'Απόδειξη Λιανικής Πώλησης (ΑΛΠ)',
    groupLabel: 'Λιανικές Συναλλαγές (B2C)',
    groupBadgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    shortSummary: 'Απευθείας πώληση αγαθών σε τελικό καταναλωτή/ιδιώτη.',
    counterpartRule: 'Προαιρετικό Α.Φ.Μ. (ή 000000000 όταν είναι ανώνυμος πελάτης).',
    pricingRule: 'Τελικές τιμές λιανικής, υποχρεωτικός τρόπος πληρωμής (Μετρητά 1, POS 5).',
    exampleScenario: 'Έκδοση απόδειξης ταμείου για αγορά προϊόντων στο κατάστημα.',
  },
  '11.2': {
    code: '11.2',
    name: 'Απόδειξη Παροχής Υπηρεσιών (ΑΠΥ)',
    groupLabel: 'Λιανικές Συναλλαγές (B2C)',
    groupBadgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    shortSummary: 'Παροχή υπηρεσίας σε τελικό ιδιώτη καταναλωτή.',
    counterpartRule: 'Προαιρετικό Α.Φ.Μ. ιδιώτη.',
    pricingRule: 'Κανονικός Φ.Π.Α. υπηρεσίας, τρόπος πληρωμής (Μετρητά ή POS).',
    exampleScenario: 'Έκδοση απόδειξης για επιτόπια επισκευή ή υπηρεσία σε ιδιώτη.',
  },

  // GROUP 3: Ψηφιακή Διακίνηση (Phase B)
  '9.3': {
    code: '9.3',
    name: 'Αυτόνομο Δελτίο Αποστολής',
    groupLabel: 'Ψηφιακή Διακίνηση (Phase B)',
    groupBadgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    shortSummary: 'Μεταφορά αγαθών χωρίς προηγούμενο παραστατικό (π.χ. Επιστροφή σε προμηθευτή, διακίνηση).',
    counterpartRule: 'Α.Φ.Μ. παραλήπτη/προμηθευτή.',
    pricingRule: 'Αξίες 0.00€, Φ.Π.Α. Κατηγορία 8, υποχρεωτική περιγραφή είδους (<itemDescr>).',
    transportRule: 'Σκοπός διακίνησης (1 = Πώληση, 4 = Επιστροφή, 6 = Ενδοδιακίνηση), πινακίδα οχήματος, διευθύνσεις.',
    exampleScenario: 'Επιστροφή εμπορευμάτων στον προμηθευτή από το basket app (POS Return).',
  },
  '9.2': {
    code: '9.2',
    name: 'Συγκεντρωτικό Δελτίο Διακίνησης',
    groupLabel: 'Ψηφιακή Διακίνηση (Phase B)',
    groupBadgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    shortSummary: 'Έναρξη δρομολογίου διανομής/πώλησης επί αυτοκινήτου προς πολλαπλούς παραλήπτες.',
    counterpartRule: 'Α.Φ.Μ. υποχρεωτικά 000000000 με ονομασία "ΣΥΓΚΕΝΤΡΩΤΙΚΗ ΔΙΑΚΙΝΗΣΗ".',
    pricingRule: 'Μηδενικές αξίες (0.00€), Φ.Π.Α. Κατηγορία 8, χωρίς tag <currency>.',
    transportRule: 'Υποχρεωτική πινακίδα οχήματος, σημείο έναρξης (έδρα) και προορισμός διανομής.',
    exampleScenario: 'Φόρτωση του φορτηγού/van το πρωί με εμπορεύματα για παράδοση σε πελάτες.',
  },
  '9.1': {
    code: '9.1',
    name: 'Συσχετιζόμενο Δελτίο Αποστολής',
    groupLabel: 'Ψηφιακή Διακίνηση (Phase B)',
    groupBadgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    shortSummary: 'Διακίνηση αγαθών που έχει ήδη τιμολογηθεί με προγενέστερο τιμολόγιο.',
    counterpartRule: 'Α.Φ.Μ. πελάτη. Υποχρεωτικό MARK αρχικού παραστατικού (<correlatedInvoices>).',
    pricingRule: 'Αξίες 0.00€, Φ.Π.Α. Κατηγορία 8. Καταγράφονται μόνο ποσότητες/μονάδες.',
    transportRule: 'Πινακίδα οχήματος, σκοπός διακίνησης, διεύθυνση φόρτωσης και παράδοσης.',
    exampleScenario: 'Αποστολή εμπορευμάτων που τιμολογήθηκαν χθες με Τιμολόγιο 1.1.',
  },
  '1.2': {
    code: '1.2',
    name: 'Τιμολόγιο Πώλησης / Δελτίο Διακίνησης',
    groupLabel: 'Ψηφιακή Διακίνηση (Phase B)',
    groupBadgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    shortSummary: 'Συνδυασμένο παραστατικό: Ταυτόχρονη χονδρική πώληση και συνοδευτικό μεταφοράς αγαθών.',
    counterpartRule: 'Υποχρεωτικό έγκυρο Α.Φ.Μ. πελάτη.',
    pricingRule: 'Κανονική τιμολόγηση με ποσά και Φ.Π.Α. (όπως το 1.1).',
    transportRule: 'Συνδυάζει στοιχεία διακίνησης: Πινακίδα οχήματος, ώρα έναρξης αποστολής και διεύθυνση παράδοσης.',
    exampleScenario: 'Επί τόπου παράδοση εμπορευμάτων με φορτηγό και άμεση έκδοση τιμολογίου παράδοσης.',
  },
};
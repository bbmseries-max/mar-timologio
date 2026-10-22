# Τεχνικό Ερώτημα & Προδιαγραφή: myDATA Τύπος 9.3 (Δελτίο Αποστολής - Επιστροφές)

**Ημερομηνία Αρχειοθέτησης:** 18 Οκτωβρίου 2026  
**Σχετικό Endpoint:** `https://mydataapidev.aade.gr/SendInvoices` (Sandbox) / `https://mydatapi.aade.gr/myDATA/SendInvoices` (Production)  
**Κατάσταση:** Εκκρεμεί απάντηση & ευθυγράμμιση schema από την τεχνική ομάδα της ΑΑΔΕ  

---

## 1. Επίσημο Κείμενο Ερωτήματος προς Τεχνική Υποστήριξη ΑΑΔΕ (myDATA Developers)

**Προς:** Τεχνική Υπηρεσία Υποστήριξης myDATA (AADE myDATA Technical Support)  
**Θέμα:** Τεχνικές διευκρινίσεις και επίσημο δείγμα XML για Τύπο Παραστατικού 9.3 (Ψηφιακό Δελτίο Αποστολής / Επιστροφές) μέσω του REST API `SendInvoices`

Αξιότιμη ομάδα τεχνικής υποστήριξης myDATA,

Κατά την ανάπτυξη και δοκιμή διαβίβασης ψηφιακών παραστατικών διακίνησης (Phase B) στο περιβάλλον δοκιμών (`https://mydataapidev.aade.gr/SendInvoices`), αντιμετωπίζουμε σφάλματα επικύρωσης σχήματος (XML Schema Validation Faults) κατά την υποβολή **Τύπου 9.3 (Δελτίο Αποστολής - Επιστροφές)**, παρότι τα τιμολόγια 1.1 και 2.1 διαβιβάζονται και λαμβάνουν ΜΑΡΚ κανονικά.

Για την οριστική επίλυση της ασυμφωνίας στο XSD validator του gateway σας, θα θέλαμε να μας διευκρινίσετε τα εξής:

1. **Επίσημο Raw XML Sample:**  
   Μπορείτε να μας δώσετε ένα πλήρες, έγκυρο δείγμα XML (raw `.xml`) για **Τύπο 9.3** (π.χ. επιστροφή αλλοιωμένων ή ληγμένων προϊόντων προς προμηθευτή με `movePurpose: 6`) που περνάει επιτυχώς από το endpoint `SendInvoices` στο test environment;
2. **Namespace / XSD Version:**  
   Απαιτείται διαφορετικό root namespace ή διαφορετικό target endpoint/version για τα ψηφιακά δελτία διακίνησης πέραν του βασικού `http://www.aade.gr/myDATA/invoice/v1.0` (π.χ. εξειδικευμένο schema για Phase B / Digital Delivery Notes);
3. **Θέση & Sequence Tags:**  
   Ποια είναι η ακριβής ακολουθία (sequence) των στοιχείων `<movePurpose>`, `<withoutDigitalTransportTracking>`, `<isDeliveryNote>` και `<otherDeliveryNoteHeader>` μέσα στο `<invoiceHeader>` ή στο root του `<invoice>` σύμφωνα με το ενεργό XSD του δημόσιου gateway;
4. **Συσχετιζόμενα Παραστατικά (`<correlatedInvoices>`):**  
   Στην περίπτωση επιστροφής (σκοπός διακίνησης 6), είναι υποχρεωτική η αναφορά σε αρχικό ΜΑΡΚ διακίνησης ή τιμολογίου, και με ποια ακριβώς δομή στοιχείων στο `<invoiceHeader>`;

---

## 2. Εσωτερική Τεχνική Σύνοψη & Απαιτήσεις Υλοποίησης (Internal Spec)

| Παράμετρος | Τιμή / Κανόνας | Σημειώσεις |
| :--- | :--- | :--- |
| **Τύπος Παραστατικού** | `9.3` | Δελτίο Αποστολής (Επιστροφές Προμηθευτή) |
| **Σκοπός Διακίνησης (`movePurpose`)** | `6` | Επιστροφή Αγαθών |
| **Τύπος Γραμμής (`recType`)** | `6` | Μη τιμολογιακή γραμμή διακίνησης ποσοτήτων |
| **Καθαρή Αξία (`netValue`)** | `0.00` | Μηδενική οικονομική αξία |
| **Κατηγορία ΦΠΑ (`vatCategory`)** | `8` (ή `7` με εξαίρεση `27`) | Χωρίς χρέωση Φ.Π.Α. |
| **Ποσό ΦΠΑ (`vatAmount`)** | `0.00` | 0.00 € |
| **Ποσότητα (`quantity15`)** | Ακέραιος / Δεκαδικός ($\ge 1$) | Φυσική ποσότητα επιστρεφόμενων μονάδων |
| **Τρόποι Πληρωμής (`paymentMethods`)** | **Παραλείπεται πλήρως** | Μηδενικό σύνολο παραστατικού |
| **Χαρακτηρισμοί Εσόδων (`incomeClassification`)**| **Παραλείπεται πλήρως** | Δεν αναγνωρίζεται έσοδο |

---

## 3. Προσχέδιο Serialization Block (`aade-serializer.service.ts`)

Όταν ληφθεί η απάντηση και το επίσημο raw XML sample από την ΑΑΔΕ:

```typescript
// src/app/core/services/aade-serializer.service.ts

if (data.invoiceType === '9.3') {
  // 1. Enforce movePurpose 6 (Επιστροφή)
  // 2. Attach mandatory <correlatedInvoices> with original distributor MARK
  // 3. Inject verified <otherDeliveryNoteHeader> tag sequence
  // 4. Emit zero-value lines with recType: 6 and quantity15
}
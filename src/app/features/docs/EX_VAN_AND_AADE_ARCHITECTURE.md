# Maranth B2B Timologio — Architectural Reference & Roadmap
**Domain:** [https://www.maranth.gr/](https://www.maranth.gr/)  
**Document Revision:** 1.0.0  
**Context:** Standalone SaaS & Mobile PWA for AADE myDATA & Digital Goods Movement (Ex-Van & Services)

---

## 1. Product Vision & Target Audience

### Core Value Proposition
A lightweight, fast, offline-first Web & Mobile application designed for Greek businesses, wholesalers, tradespeople, and on-the-road sales drivers (**Ex-Van Sales**). 

The app allows an operator using an ordinary smartphone, tablet, or laptop connected to a portable printer (Bluetooth / Wi-Fi thermal or portable A4) to legally issue, fiscally seal, and print invoices or transport documents in seconds.

### Key Demographics
- **Ex-Van Distributors & Wholesalers**: Food & beverage, bakery distributors, auto parts, building materials.
- **Field Technicians & Service Providers**: Electricians, plumbers, HVAC, software & IT consulting.
- **Small Boutiques & B2B Freelancers**: Needing direct myDATA compliance without complex, expensive legacy ERPs.

---

## 2. AADE myDATA Compliance & Legal Mandates

### A. Digital Goods Movement (Ψηφιακό Δελτίο Αποστολής — AADE Phase B)
Every transport of goods within Greece requires digital pre-declaration to AADE prior to or at vehicle departure:
- **Vehicle License Plate (`vehicleNumber`)**: Mandatory string (e.g. `ABC-1234`).
- **Dispatch Address (`addressFrom`) vs Delivery Address (`addressTo`)**.
- **Transport Purpose**:
  - `1`: Πώληση (Sale)
  - `2`: Διακίνηση μεταξύ εγκαταστάσεων (Branch transfer)
  - `3`: Αποθήκευση (Storage / Warehousing)
  - `4`: Επεξεργασία / Συναρμολόγηση (Processing)
  - `5`: Δειγματισμός / Έκθεση (Exhibition / Sampling)

### B. Core Supported Document Types
| AADE Code | Greek Designation | Real-World Use Case |
|---|---|---|
| **1.1** | Τιμολόγιο Πώλησης | Standard B2B sale of goods |
| **1.2** | Τιμολόγιο Πώλησης / Δελτίο Αποστολής | **Ex-Van Primary**: Invoices and transports simultaneously |
| **2.1** | Τιμολόγιο Παροχής Υπηρεσιών | Services, consultations, labor |
| **9.1** | Δελτίο Αποστολής | Pure movement of goods without immediate sale |
| **5.1** | Πιστωτικό Τιμολόγιο | Returns, price corrections, credit notes |
| **PROFORMA** | Προσφορά / Προτιμολόγιο | Internal commercial quotation (Non-fiscal) |

### C. Fiscal Sealing & QR Verification
Every successful transmission generates:
1. **MARK** (Μοναδικός Αριθμός Καταχώρισης)
2. **UID** (Digital fiscal signature hash)
3. **Official AADE QR Verification String**:

https://www.aade.gr/mydata/verify?afm={ISSUER_AFM}&d={YYYY-MM-DD}&mark={MARK}&g={GROSS_AMOUNT}

*Note: This QR code must be rendered with high contrast (minimum 100x100px) so roadside tax inspectors (ΣΔΟΕ / ΑΑΔΕ) can scan and verify it on paper or screen.*

---

## 3. Technical Architecture Overview

┌────────────────────────────────────────────────────────┐
│               Maranth Angular 19+ Client               │
│    (Zoneless Signals, Tailwind CSS, Responsive UI)     │
└──────────────┬─────────────────────────┬───────────────┘
│                         │
[1. Local Persistence]    [2. Fiscal Dispatch]
▼                         ▼
┌───────────────────────┐ ┌───────────────────────────┐
│ IndexedDB (Dexie.js)  │ │ AADE myDATA Gateway       │
│ - Draft storage       │ │ - XML Payload Serializer  │
│ - Offline queue       │ │ - REST API Dispatcher     │
│ - Counter increments  │ │ - Response / Error Parser │
└───────────────────────┘ └───────────────────────────┘
│
[3. GSIS Registry]
▼
┌───────────────────────────┐
│ Automated AFM Lookup      │
│ - Name, DOY, Address      │
└───────────────────────────┘


---

## 4. Current State & Established Baseline

- **Framework**: Angular 19+ (Standalone Components, Zoneless Change Detection via `provideZonelessChangeDetection()`).
- **Styling**: Tailwind CSS with calibrated `@media print` rules.
- **Routing**: Functional lazy-loaded routes with title resolvers.
- **Domain Engine (`@core/utils/fiscal-engine.ts`)**:
  - Modulo-11 Greek AFM validator.
  - Cent-accurate VAT calculations across all tiers (24%, 13%, 6%, 0%).
  - Invoice summary aggregator.
- **Active Workspace**: Interactive `InvoiceBuilderComponent` operational at `/invoices/new`.

---

## 5. Roadmap for Tomorrow (Phase 2 & 3)

### Phase 2: Ex-Van & Digital Delivery Note (9.1 / 1.2)
1. **Goods Movement Form Controls**:
   - Add toggle for `1.2` and `9.1`.
   - Add fields for Vehicle Plate, Carrier AFM, Dispatch Date/Time, and Delivery Point.
2. **GSIS Live Registry Connector**:
   - Real-world integration endpoint to populate customer corporate records from their 9-digit AFM in 1 click.

### Phase 3: Hardware Output & Fiscal Printing
1. **AADE Vector QR Component**:
   - Canvas/SVG generator using the installed `qrcode` package.
2. **Dual-Format Print Engine**:
   - **A4 Format**: Formal corporate layout for office dispatch and PDF export.
   - **80mm ESC/POS Thermal Format**: Compact receipt layout for portable Bluetooth belt printers used in vans.

### Phase 4: Offline Queue & Sync (Dexie.js)
1. Automatic local autosave as the driver types.
2. Offline queue when cellular reception drops, automatically syncing to AADE once connection is restored.
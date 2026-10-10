# Maranth Timologio — Product & Technical Specification

**Maranth Timologio** is a client-side, offline-first Angular B2B invoicing application and AADE myDATA transmission gateway. It functions both as an independent electronic invoicing portal and as a specialized fiscal dispatch engine receiving real-time cart handovers from companion retail POS systems (e.g., Maranth Market POS).

---

## 1. Core Functional Scope

### 1.1 Document Types & Presets
* **1.1 Sales Invoice (Τιμολόγιο Πώλησης):** Standard B2B supply of physical commercial products.
* **1.2 Sales Invoice / Goods Movement Note (Τιμολόγιο Πώλησης / Δελτίο Αποστολής - Ex-Van):** Combined financial invoice and transport document for on-route sales.
* **2.1 Services Invoice (Τιμολόγιο Παροχής Υπηρεσιών):** Document for consulting, transport, or service tasks without physical logistics.
* **5.1 Credit Invoice (Πιστωτικό Τιμολόγιο):** Price corrections, commercial discounts, or post-factum fiscal reconciliations.
* **9.1 Goods Movement Note (Δελτίο Αποστολής - Διακίνηση Αγαθών):** Non-financial goods transfer. Specialized preset: **Purpose Code 6 (Επιστροφή - Returns)** for returning damaged, expired, or rejected goods to distributors.
* **PROFORMA / Quotation:** Non-fiscal quotations and order previews without AADE transmission.

### 1.2 Fiscal & Tax Compliance (AADE myDATA Phase B)
* **Digital Goods Movement (Ψηφιακή Διακίνηση):**
  * Auto-activates transport fields when selecting type `9.1` or `1.2`.
  * Captures vehicle registration plate (`vehicleNumber`), departure date/time (`dispatchDateTime`), start address (`addressFrom`), and destination address (`addressTo`).
  * Enforces mandatory vehicle plate entry prior to print/dispatch to comply with Greek road audit standards (ΣΔΟΕ / Κινητά Συνεργεία Ελέγχου).
* **Tax Identifiers & Modulo-11 Engine:**
  * Client-side Modulo-11 verification for Greek Tax IDs (Α.Φ.Μ.) before database insertion or API transmission.
  * Checksum verification prevents invalid tax IDs from reaching AADE servers.
* **AADE XML Schema Engine:**
  * Serializes reactive form states into strict `InvoicesDoc` XML complying with the official AADE XSD structure.
  * Omission rules: Automatically excludes payment methods and income classifications for movement-only documents (Type 9.1).
* **Dual Environment Safety Routing:**
  * **Sandbox Mode (Default):** Targets `https://mydataapidev.aade.gr/SendInvoices` using sandbox developer subscription keys.
  * **Production Mode (Guarded):** Targets `https://mydatapi.aade.gr/myDATA/SendInvoices` via an explicit, guarded toggle in Settings.

---

## 2. Market POS Integration Bridge

The application acts as a direct fiscal processor for third-party or companion POS terminals via an inter-tab, inter-window messaging protocol.

* **Transport Layer:** Browser `BroadcastChannel` (`maranth_bridge_{tenantId}`) with cross-port/cross-origin fallback compatibility.
* **Handshake Protocol:** Bidirectional ACK/NACK signaling confirming whether an incoming cart was accepted, parsed, or rejected.
* **Automated Form Ingestion:**
  * Detects return documents (`documentType: "9.1"` / `movementPurpose: 6`).
  * Locks document type to **9.1 (Επιστροφή)**.
  * Ingests supplier profile (AFM, legal name, tax office, physical address).
  * Clears existing lines and populates line items (description, quantity, unit price, tax rate, gross totals).
  * Keeps the vehicle plate field blank and requires operator completion before final document generation.

---

## 3. Data Architecture & Persistence

### 3.1 Local Storage (Dexie.js / IndexedDB)
* **Offline-First:** All business entities, customer directories, product catalogs, and draft documents reside in client-side storage.
* **Auto-Save & Draft Hydration:** Form state is debounced and serialized to IndexedDB (`LocalInvoiceRecord`), preventing data loss across page reloads.
* **Multi-Tenant Scoping:** Settings, drafts, and directory records are keyed by `tenantId` (e.g., `tenant_minimarket`).

### 3.2 Registry Lookup Priority Engine (`GsisLookupService`)
Resolves tax entity data through a multi-tier fallback pipeline:
1. **Own Store Profile:** Matches the entered AFM against locally saved company settings in Dexie.
2. **Local Address Book:** Matches against previously saved customer/supplier records in Dexie.
3. **Backend GSIS Proxy:** Queries a local proxy endpoint (`/api/gsis/lookup`) if active.
4. **Offline Manual Fallback:** Returns empty editable fields on unknown external AFMs to allow manual input and prevent placeholder corruption.

---

## 4. UI & Operational Workflow

| Workflow Step | Interface Action | Compliance / Functional Safeguard |
| :--- | :--- | :--- |
| **1. Ingestion** | POS transmits return cart or user selects document type | Sets series, document sequence, and switches form validators |
| **2. Verification** | Cashier reviews supplier details | Modulo-11 badge confirms AFM validity |
| **3. Transport Entry** | Driver license plate entered | Form submission disabled if empty for document type 9.1 |
| **4. Calculation** | Line additions, discounts, and VAT categories | Real-time tax breakdown (0%, 6%, 13%, 24%) via pure fiscal engine |
| **5. Dispatch / Print** | User clicks *Εκτύπωση / myDATA* | Generates valid XML, requests test MARK/UID, renders print layout with AADE verification QR |

---

## 5. Technology Stack

* **Framework:** Angular 19+ (Standalone Components, Signals, Reactive Forms, `OnPush` Change Detection).
* **Styling:** Tailwind CSS with dedicated print media styles (`@media print`, `.no-print`).
* **Client Database:** Dexie.js (IndexedDB wrapper).
* **Communication APIs:** Browser `BroadcastChannel`, `HttpClient`, RxJS reactive pipelines.
* **Fiscal Target:** AADE myDATA REST API (XML Payload Format).
Maranth Timologio — Full Service & Core Architecture Reference
Save this as SERVICES_ARCHITECTURE_REFERENCE.md in your project root:

Markdown
# Maranth Timologio — Service & Data Layer Reference
**Platform:** Angular 19 (Zoneless, Signals), Tailwind CSS, Dexie.js (IndexedDB)
**Domain Target:** https://www.maranth.gr / Offline Ex-Van PWA
**Compliance:** AADE myDATA v1.0.8 & Phase B Digital Goods Movement

---

## 1. Core Services & Utilities Matrix

| Service / Utility | Role & Execution Path | Key Methods / Handlers |
|---|---|---|
| **`LocalDbService`** | Primary IndexedDB wrapper (Dexie.js). Scoped by `tenantId`. | `saveDraft()`, `getInvoiceById()`, `getCustomerByAfm()`, `saveCustomer()`, `searchProductsForTenant()` |
| **`AadeSerializerService`** | Strict XML generator conforming to AADE XSD. | `generateInvoicesDocXml()`, `serializeToXml()` (handles 1.1, 1.2, 9.1 element order & `ic:` namespaces) |
| **`MyDataService`** | Dispatches serialized XML to Cloudflare Worker proxy. | `transmitInvoice()` (hydrates lines, sends to `/send-invoice`, returns MARK & UID) |
| **`GsisLookupService`** | 4-tier customer AFM resolution with automatic Dexie caching. | `lookupAfm()` (1. Shop Settings -> 2. Dexie Cache -> 3. Cloudflare `/gsis/lookup` -> 4. Offline Fallback) |
| **`CartBridgeService`** | Inter-app POS cart receiver with bidirectional ACK. | Listens via `BroadcastChannel('maranth_cart_handover_bus')`, `window.message`, and URL `#cart=` / `?handover=` |
| **`AuthTenantService`** | Session, tenant switching, and feature entitlement gating. | `currentTenantId()`, `canIssueInvoices()`, `updateFiscalIdentity()`, `maranth_auth_bus` sync |
| **`fiscal-engine.ts`** | Pure mathematical calculations for Greek invoicing. | `isValidGreekAfm()` (Modulo-11), `calculateLineValues()`, `calculateInvoiceTotals()`, `roundToTwoDecimals()` |

---

## 2. Fiscal Rulebook: 9.1 vs 1.1 vs 1.2

### A. Non-Financial Transport (`9.1` - Δελτίο Αποστολής)
- **Values:** Net value, VAT, and gross values are strictly `0.00`.
- **Income Classification:** Strictly **omitted** on all lines and summaries.
- **Payment Methods:** Strictly **omitted** (no `<paymentMethods>` element).
- **Transport Block:** Mandatory `<otherTransportDetails>` with vehicle registration plate, purpose, departure time, and addresses.

### B. Standard Sales Invoice (`1.1` - Τιμολόγιο Πώλησης)
- **Values:** Standard positive calculated amounts with cent rounding.
- **Income Classification:** Mandatory on each line and summary with `<ic:classificationType>`, `<ic:classificationCategory>`, and `<ic:amount>`.
- **Payment Methods:** Mandatory `<paymentMethods>` block matching gross total.
- **Transport Block:** Omitted.

### C. Combined Ex-Van Sale (`1.2` - Τιμολόγιο Πώλησης / Δελτίο Αποστολής)
- **Values & Classifications:** Same financial calculation rules as `1.1`.
- **Transport Block:** Same mandatory transport details as `9.1`.
- **Header:** `<invoiceType>1.2</invoiceType>` and `<isMovementDoc>true</isMovementDoc>`.

---

## 3. Storage Layer Schema (`LocalDbService` v4)

```typescript
invoices: 'id, tenantId, series, documentNumber, issueDate, customerAfm, transmissionStatus, mark, uid, updatedAt, createdAt'
products: 'id, tenantId, barcode, *altBarcodes, name, isPinned'
settings: 'tenantId'
customers: 'id, tenantId, afm, legalName, phone, updatedAt'
4. Operational End-to-End Flow
1. Input / POS Bridge
   └── CartBridgeService accepts handover -> Ingests lines -> Injects into invoiceForm

2. Customer Verification
   └── AFM entered -> isValidGreekAfm() -> GsisLookupService -> Dexie cache hit / Cloudflare worker fetch -> Auto-fills legal fields

3. Form Calculation
   └── line item inputs -> recalculateLine() -> calculateLineValues() -> calculateInvoiceTotals() -> Signals updated

4. Save & Submission
   └── onSaveAndSubmit()
       ├── 1. Saves record in Dexie as 'DRAFT'
       ├── 2. Calls MyDataService.transmitInvoice()
       ├── 3. Posts XML to Cloudflare Worker (/send-invoice) -> Upstream AADE REST API
       └── 4. On MARK/UID success -> Updates Dexie record to 'TRANSMITTED'
       # Maranth Timologio — Complete System Architecture & Progress Log

**Domain:** https://www.maranth.gr/ & PWA Mobile  
**Target:** AADE myDATA v1.0.8, Phase B Digital Goods Movement, Multi-Tenant Dexie.js (Offline-First)

---

## 1. Services & Utilities Matrix

| File | Purpose | Key Responsibilities |
|---|---|---|
| `LocalDbService` | Dexie.js (IndexedDB) Multi-Tenant Storage | Scoped stores (`invoices`, `products`, `settings`, `customers`). Fast queries, caching, and draft hydration. |
| `AadeSerializerService` | AADE myDATA XML Engine | Formats `InvoicesDoc` XML with strict XSD element ordering, `ic:` namespace definitions, and payment/transport logic. |
| `AadeClientService` | Transport Client | Posts XML to Cloudflare Worker proxy and parses AADE XML/JSON responses and rejection error nodes. |
| `MyDataService` | High-Level Fiscal Service | Coordinates Dexie drafts, serialization via `AadeSerializerService`, and dispatch via `AadeClientService`. |
| `CartBridgeService` | Companion POS Cart Handover | Ingests baskets via `BroadcastChannel('maranth_cart_handover_bus')`, `window.message`, or URL hash/query with bidirectional ACK. |
| `GsisLookupService` | 4-Tier Business Registry Lookup | Resolves Greek AFMs via: 1. Shop settings -> 2. Local Dexie cache -> 3. Cloudflare Worker proxy (`/gsis/lookup`) -> 4. Offline fallback. |
| `AuthTenantService` | Multi-Tenant Session & Licencing | Tenant isolation (`tenantId`), computed issuance permissions (`canIssueInvoices()`), and cross-tab sync via `maranth_auth_bus`. |
| `ProductImporterService` | Excel / CSV Universal Importer | Auto-detects Greek/English column headers, parses European currencies (`1.250,50 €`), and deduplicates items on re-import. |
| `fiscal-engine.ts` | Mathematical Calculations | Client-side Greek AFM Modulo-11 checksum validator, per-tier VAT calculations (24%, 13%, 6%, 0%), and cent-accurate rounding. |

---

## 2. Fiscal Rulebook: 9.1 vs 1.1 vs 1.2

- **9.1 (Δελτίο Αποστολής - Διακίνηση Αγαθών / Επιστροφή Purpose 6)**:
  - Values strictly zero (`0.00`).
  - Income classifications strictly **omitted**.
  - Payment methods strictly **omitted**.
  - Mandatory `<otherTransportDetails>` with vehicle plate, purpose code, departure timestamp, loading/delivery addresses.
- **1.1 (Τιμολόγιο Πώλησης)**:
  - Calculated financial net, VAT, and gross totals.
  - Mandatory line and summary `<incomeClassification>` with `<ic:...>` tags.
  - Mandatory `<paymentMethods>` block matching gross total.
  - Transport details omitted.
- **1.2 (Τιμολόγιο Πώλησης / Δελτίο Αποστολής - Ex-Van)**:
  - Financial calculations and income classifications of `1.1`.
  - Transport details of `9.1` included.
  - Header flag `<isMovementDoc>true</isMovementDoc>`.

---

## 3. Verified Cloudflare Gateway Endpoints

- **Invoice Dispatch:** `https://gsis-lookup.bbmseries.workers.dev/send-invoice` (POST XML)
- **GSIS AFM Lookup:** `https://gsis-lookup.bbmseries.workers.dev/gsis/lookup?afm={AFM}` (GET)
- **Live AADE MARK Verified:** `400015635821372`
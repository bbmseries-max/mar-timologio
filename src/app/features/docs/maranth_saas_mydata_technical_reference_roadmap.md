# Maranth SaaS Timologio — myDATA Integration Status & Roadmap

**Date Updated:** November 2026  
**AADE Technical Protocol:** v1.0.8 / Phase B Digital Delivery  
**Target Environment:** Sandbox (`https://mydataapidev.aade.gr`) & Production Ready (`https://mydatapi.aade.gr`)

---

## 1. Executive Summary & Current Operational Status

The application has achieved verified end-to-end myDATA integration. Both standard commercial invoices and pure movement/dispatch documents (Phase B) transmit through a secure Cloudflare Worker proxy directly to AADE Azure API Management, returning official `MARK`, `UID`, and scannable verification `QR-Code` URLs.

### Active Milestones Achieved
- [x] **AADE Azure APIM Authentication Solved**: Resolved the `403 Forbidden` (`content-length: 0`) gateway drop by fixing the Cloudflare Worker header from `aade-del-user-id` to the mandatory `aade-user-id`, paired with `Ocp-Apim-Subscription-Key`.
- [x] **AADE Error 204 Fixed (Issuer)**: Handled mandatory Greek issuer `<name>` and legal `<address>` tags inside `<issuer>` strictly required for document type `9.3`.
- [x] **AADE Error 204 Fixed (Counterpart Address)**: Implemented regex postal-code anchoring (`\b\d{5}\b`) in `InvoiceBuilder` and `MyDataService` to split composite GSIS lookup strings (e.g. `"ΑΓΙΑΣ ΜΑΡΙΝΑΣ 26        19400 - ΚΟΡΩΠΙ"`) into separate `<street>`, `<number>`, `<postalCode>`, and `<city>` tags.
- [x] **Verified Delivery Note Live Transmission (9.3)**: Series `TES`, No. `1` successfully dispatched on `2026-11-02` with **MARK `400001975159851`** and valid verification QR code URL.
- [x] **Single-Sheet Print CSS Engine**: Locked print layouts (both A4 and 80mm thermal receipts) using `@page { margin: 6mm 8mm; }`, `break-inside: avoid`, and `break-before: avoid` to prevent single-line footer spillovers onto page 2.
- [x] **Dexie Maintenance & Purge**: Implemented `purgeDraftAndFailedInvoices()` in `LocalDbService` to clean up un-transmitted test records without endangering records holding an AADE `MARK`.

---

## 2. Supported Document Types Matrix

| Code | Document Type Description | Greek Label | Value Status | Special Schema Requirements | App Status |
| :---: | :--- | :--- | :---: | :--- | :---: |
| **1.1** | Commercial Invoice | Τιμολόγιο Πώλησης | Financial $(>0.00)$ | Standard VAT classes (`1-7`), line classifications (`category1_1`, etc.). GR issuer omits name/address. | **Verified** |
| **2.1** | Service Invoice | Τιμολόγιο Παροχής Υπηρεσιών | Financial $(>0.00)$ | Standard classifications (`category1_3`, etc.), no physical transport required. | **Verified** |
| **9.3** | Non-Correlated Delivery Note | Μη Συσχετιζόμενο Δελτίο Αποστολής | Zeroed $(0.00)$ | `<otherDeliveryNoteHeader>` mandatory (loading/delivery addresses, dispatch time/date, vehicle plate, move purpose `4` or `1`). Issuer name & address mandatory. `category3` with `0.00`. | **Verified (MARK: 400001975159851)** |
| **1.2** | Sales Invoice & Delivery Note | Τιμολόγιο Πώλησης - Δελτίο Αποστολής | Financial $(>0.00)$ | Hybrid: Full commercial pricing/VAT **plus** full `<otherDeliveryNoteHeader>` movement tags. | **Ready for Test** |
| **9.1** | Correlated Delivery Note | Συσχετιζόμενο Δελτίο Αποστολής | Zeroed $(0.00)$ | Requires correlated invoice reference `<correlatedInvoices>` linking to the prior invoice MARK. | **Draft Ready** |
| **5.2** | Credit Note (Correlated) | Πιστωτικό Τιμολόγιο / Συσχετιζόμενο | Financial $(>0.00)$ | Requires reference to original invoice series/aa/date and initial MARK. | **Next Phase** |
| **11.1** | Retail Sales Receipt | Απόδειξη Λιανικής Πώλησης | Financial $(>0.00)$ | Requires cash/POS classification or ERP provider signature. | **Planned** |

---

## 3. Integration Architecture & Credentials

### Sandbox / DEV Configuration
- **Portal**: «ΦΟΡΜΑ ΕΓΓΡΑΦΗΣ ΣΤΟ myDATA REST API (ΤΕΣΤ / DEV)»
- **API Base URL**: `https://mydataapidev.aade.gr/SendInvoices`
- **User ID Header**: `aade-user-id: cuko93dev`
- **Subscription Key Header**: `Ocp-Apim-Subscription-Key: eaba5813069d0833f4ccb06dc219ee46`
- **Issuer AFM (Sandbox Binding)**: `067424104`

### Production Path
- **Base URL**: `https://mydatapi.aade.gr/SendInvoices`
- **Worker Configuration**: Pass `environment: 'production'` in JSON payload to route upstream calls to `mydatapi.aade.gr`.

---

## 4. Verification Test Checklist Before New Features

Execute these test cases to ensure complete application stability:

- [ ] **Test Case 1: 9.3 Live Dispatch from UI**
  - Form route: `/invoices/new?type=9.3`
  - Fill vehicle `IEB-4892`, counterpart `094014201`, purpose `4 (Επιστροφή)`.
  - Confirm transmission, MARK assignment, Dexie status `'TRANSMITTED'`, and single-page print rendering.
- [ ] **Test Case 2: 1.2 Combined Invoice & Delivery Note**
  - Form route: `/invoices/new?type=1.2`
  - Add positive price line item (`100.00€` + `24% VAT`).
  - Fill movement headers (vehicle plate, loading, destination).
  - Verify AADE accepts the hybrid XML without validation errors.
- [ ] **Test Case 3: Database Test Draft Purge**
  - In `/delivery-notes`, click **«Εκκαθάριση Δοκιμών»**.
  - Confirm all un-transmitted records (`DRAFT` / `FAILED` with series `TES`, `DEV`, `A`) are removed, while `TES 1` (MARK `400001975159851`) remains untouched.
- [ ] **Test Case 4: Thermal 80mm Print Mode**
  - Switch print preview to `80mm Thermal Receipt`.
  - Trigger print preview (`Ctrl + P`) and verify layout width is locked to `74mm` without page breaks.

---

## 5. Upcoming Feature Roadmap (Phase B & SaaS Expansion)

Once the core types (`1.1`, `2.1`, `9.3`, and `1.2`) are finalized, proceed with the following feature roadmap:

```
[Phase 1: Core Types Finalized]
    │
    ├──> 1. CancelInvoice Implementation
    │       ├── Call AADE /CancelInvoice with MARK
    │       ├── Update Dexie record status to 'CANCELLED'
    │       └── Display cancellation badge in UI list
    │
    ├──> 2. QR Code Scanner for Delivery Receipts
    │       ├── Camera / Web barcode scanner on mobile
    │       ├── Read counterpart MARK & verify dispatch validity
    │       └── Goods receiving workflow
    │
    ├──> 3. Automatic Daily myDATA Sync & Pull (RequestTransmittedDocs)
    │       ├── Background sync to pull server MARKs
    │       └── Conflict resolution between IndexedDB and AADE
    │
    └──> 4. Export & Financial Reporting
            ├── myDATA XML & CSV batch export
            └── VAT & Income classification balance sheet
```

---

## 6. Key Code References

- **Cloudflare Proxy Worker**: `gsis-lookup.bbmseries.workers.dev/send-invoice`
- **myDATA Transmission Engine**: `src/app/core/services/mydata.service.ts`
- **Dexie Local Database**: `src/app/core/services/local-db.service.ts`
- **Delivery Notes Component**: `src/app/features/delivery-notes/delivery-notes.component.ts`
- **Invoice & Thermal Print Layout**: `src/app/features/invoices/invoice-print/invoice-print.component.ts`
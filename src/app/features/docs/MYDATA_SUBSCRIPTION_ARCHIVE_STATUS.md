# Maranth B2B & POS Retail Suite: Milestone Archive & Architecture Status

**Status Date:** October 17, 2026  
**Milestone:** Production-Ready Core, Dual-Layer Multi-Tenant Subscription Engine & Phase B Delivery Notes  

---

## 1. Executive Summary & Production Readiness

The core application has reached production readiness across:
- **Offline-First Multi-Tenancy:** Partitioned Dexie IndexedDB caching per `tenantId`.
- **GSIS Lookup Integration:** Automated recipient auto-fill using the Greek corporate tax registry via Cloudflare Worker proxy.
- **Dual-Layer Subscription Licensing:**
  - *Hard Enforcement (Remote):* Cloudflare Worker KV acts as an authoritative gatekeeper checking AFM status prior to AADE gateway dispatch.
  - *Soft Enforcement (Client):* Modern Angular zoneless initialization via `provideAppInitializer` synchronizing status on app boot.
- **myDATA Transmission:** Successfully operating for **Type 1.1 (Sales Invoice)** with verified AADE MARKs across multiple VAT rates (24%, 13%).
- **Pending myDATA Integration:** Awaiting final public gateway schema alignment from AADE for **Type 9.3 (Goods Movement Return / Delivery Note)**.

---

## 2. Key Accomplishments

### A. Dual-Layer Subscription Engine
- **Cloudflare Worker KV Gatekeeper:**
  - Direct AFM extraction from XML payload (`<issuer><vatNumber>...`).
  - Zero-latency subscription validation prior to proxying requests to AADE.
  - Return of structured `403/200` errors (`subscriptionBlocked: true`) if a tenant is `SUSPENDED` or `EXPIRED`.
  - Support for permanent lifetime accounts (`validUntil: null` or `2099-12-31T23:59:59Z`).
  - Implemented `GET /check-subscription?afm=...` for remote client synchronization.
- **Client Bootstrap Engine (`AuthTenantService`):**
  - Integrated with `provideAppInitializer` in `src/app/app.config.ts`.
  - Non-blocking execution with a 4-second timeout to protect offline capability.
  - Reactive status signals (`canIssueInvoices`, `isGracePeriod`, `isReadOnlyMode`).
  - Settings UI displays status badges, document quotas, and a lifetime indicator (`★ ΑΠΕΡΙΟΡΙΣΤΗ (LIFETIME)`).

### B. SaaS Customer Agreement Generator
- Restored Customer Details Card in `InvoiceBuilderComponent`.
- Added contract generation modal (`<maranth-contract-agreement>`) bound to validated AFMs.
- Master provider defaults established under `src/app/core/constants/master-provider.constant.ts` (`MARANTH_MASTER_PROVIDER`, `MasterProviderProfile`).

### C. AADE myDATA Validated Workflows
- **Type 1.1 (Sales Invoice):** Fully functional with live AADE MARK and QR code generation.
- **VAT 0% Validation Rule:** Configured mandatory `<vatExemptionCategory>` injection (e.g., Code `27`) when VAT rate is 0% (`vatCategory: 7`).
- **Phase B Goods Movement (Type 9.1):**
  - Correct tag ordering in `invoiceDetails` (`lineNumber` -> `recType: 6` -> `netValue: 0.00` -> `vatCategory` -> `vatAmount: 0.00` -> `quantity15`).
  - `<otherTransportDetails>` schema sequence (`vehicleNumber` -> `transportType: 1` -> `timeStamp` -> `carrierVatNumber`).
  - `<movePurpose>` relocated to `<invoiceHeader>`.
  - Correlated invoices requirement constrained strictly to Return movements (`movePurpose: 6`).

---

## 3. Pending Model: AADE Type 9.3 (Digital Delivery Note - Return / Movement)

### Context & Current Blocker
While domestic wholesale accompanying transit is fulfilled via **Type 1.1** (with recipient delivery details under `counterpart -> address`) and outbound movement via **Type 9.1**, **Type 9.3** remains pending due to AADE schema synchronization:
- The public `SendInvoices` endpoint rejects Phase B tags under older XSD rules, while the server-side engine expects modern Phase B headers (`otherDeliveryNoteHeader`).
- Supplier physical returns are temporarily routed through the official AADE timologio portal until the public REST schema settles.

### Checklist for Type 9.3 XML Model Release:
1. [ ] **XSD Validation Update:** Update local serializer to match the unified AADE Phase B XML Schema definition for `otherDeliveryNoteHeader`.
2. [ ] **Correlated Invoices Guard:** Ensure Type 9.3 mandates reference to the original delivery document (`<correlatedInvoices>` containing original MARK/series/number).
3. [ ] **Zero-Value Line Enforcement:** Confirm line items carry `recType: 6`, `netValue: 0.00`, and `vatCategory: 7` (or designated exemption).
4. [ ] **Movement Header Tag:** Place `<movePurpose>6</movePurpose>` (Επιστροφή) within `<invoiceHeader>`.

---

## 4. Architecture Blueprint & Configuration Reference

### Cloudflare Worker KV Schema (`SUBSCRIPTIONS`)
- **Key:** Tenant 9-digit Greek AFM (e.g., `067424104`)
- **Value:**
  ```json
  {
    "tier": "RETAIL_SHOP",
    "status": "ACTIVE",
    "validUntil": null,
    "monthlyLimit": 999999
  }
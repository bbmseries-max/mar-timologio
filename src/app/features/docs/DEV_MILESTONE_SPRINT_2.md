# Maranth Timologio — Production Architecture & Progress Log

## Status: Sprint 1 & Sprint 2 Completed
**Date:** October 7, 2026  
**Platform:** Multi-Tenant PWA (Angular 19, Tailwind CSS, Dexie.js offline-first)  
**Fiscal Protocol:** AADE myDATA v1.0.8

---

## 1. Accomplished Architecture Milestones

### A. Sprint 1: Multi-Tenant Licensing & Grace Engine
- **Tenant Scoping:** Strict `tenantId` partitioning across all database tables (Dexie `invoices`, `products`, `settings`).
- **Subscription Lifecycle:** 
  - `ACTIVE` / `TRIAL`: Full feature access.
  - `GRACE_PERIOD` (Days 1–7): Unlocked with persistent amber warning banner.
  - `READ_ONLY` (Days 8–30): Issuance disabled (`canIssueInvoices() = false`), historical tax archive & exports preserved per EU Data Act / GDPR.
  - `SUSPENDED` (Day 31+): Authentication blocked.
- **Terms of Service:** Legally anchored with protection clauses covering suspension rights, archive access, and fiscal liability disclaimers under Greek Commercial Law.

### B. Print Engine Isolation (Body Print Portal)
- Solved browser SPA multi-page spill and blank print preview issues.
- **Architecture:** Dedicated `#print-portal` outside Angular root shell (`maranth-root`).
- **Dual Output Support:**
  - **A4 Corporate:** Precise margins (`8mm 10mm`), header details, tax breakdown, and AADE QR code locked to a single physical page.
  - **80mm Thermal (Continuous Roll):** Monospace ESC/POS format with tear notches, designed for Ex-Van mobile sales.

### C. Sprint 2: Universal Product Ingestion & POS Cart Bridge
- **Excel/CSV Column Mapper:**
  - Auto-detection for Greek/English headers (`Περιγραφή`, `Barcode`, `Τιμή`, `ΦΠΑ`).
  - Wholesale vs. Retail price calculation (automatic Net extraction from Gross).
  - Bulk ingestion into tenant-partitioned Dexie database.
- **Product Search & Barcode Quick-Picker:**
  - Sub-millisecond typeahead and scanner enter listener in invoice workspace.
- **App-to-App POS Cart Handover Bridge (`CartBridgeService`):**
  - Cross-tab, zero-latency handover using Web `BroadcastChannel` (`maranth_cart_handover_bus`).
  - Deep-link support via `#cart=<base64>`.
  - Direct zone-wrapped injection into Angular reactive form without page reloads.

---

## 2. Next Up: Sprint 3 Roadmap (Morning Launch)

### Sprint 3: High-Speed Client Address Book & AFM Engine
1. **Greek AFM Modulo-11 Validator:**
   - Real-time client-side algorithmic check of Greek 9-digit tax numbers before submission.
2. **Local Dexie Customers Cache:**
   - Instant search and autocomplete by AFM, corporate title, or phone number.
   - Elimination of redundant external lookups for repeat buyers.
3. **AADE / GSIS Registry Bridge:**
   - One-click legal data auto-fill from national business registry with offline fallback.

---

## 3. Quick Test Payloads

### Test POS Handover Payload (Run in Browser DevTools)
```javascript
new BroadcastChannel('maranth_cart_handover_bus').postMessage({
  sourceSystem: 'Maranth POS Terminal 1',
  customer: { legalName: 'ΔΟΚΙΜΑΣΤΙΚΟΣ ΠΕΛΑΤΗΣ ΕΠΕ', afm: '999999990', doy: 'ΧΑΛΑΝΔΡΙΟΥ' },
  items: [
    { name: 'Καφές Espresso Blend 1kg', quantity: 2, unitPrice: 22.50, vatRate: 24, isGross: false },
    { name: 'Γάλα Barista 1L', quantity: 6, unitPrice: 1.65, vatRate: 13, isGross: false }
  ]
});
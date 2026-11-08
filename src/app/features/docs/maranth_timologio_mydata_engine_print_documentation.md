# Maranth Timologio SaaS — myDATA Engine & Print Preview Specification

**Date:** November 5, 2026  
**Version:** v1.0.8 Compliance Release  
**Status:** In Production / Sandbox Verified (Types 1.1, 9.3, 2.1 & Cancellation)

---

## 1. Executive Summary

This document archives the complete implementation details, architectural patterns, serialization logic, cancellation protocol, and visual print engine designed for **Maranth Timologio SaaS**. 

The system operates against the Greek **AADE myDATA Technical Protocol (v1.0.8)** via a secure Cloudflare Worker proxy, IndexedDB/Dexie local data resilience, and an isolated browser printing subsystem supporting both standard A4 single-page layouts and 80mm thermal receipt formats.

---

## 2. Supported Document Types Matrix

| Document Code | Name (Greek) | Direction / Scope | Key Classification | Special Constraints | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1.1** | Τιμολόγιο Πώλησης | B2B Commercial Goods | `category1_1`<br>`E3_561_001` | Mandatory counterpart Greek AFM, quantity, measurementUnit, payment methods | **Active & Verified** |
| **9.3** | Δελτίο Αποστολής | Goods Movement / Transport | `category3`<br>*(No `classificationType`)* | `netValue: 0.00`, `vatCategory: 8`, `<itemDescr>` present, counterpart omitted, zero financial values | **Active & Verified** |
| **2.1** | Τιμολόγιο Παροχής Υπηρεσιών | B2B Services | `category1_3`<br>`E3_561_001` | **Rule 205:** Omit `<quantity>` & `<measurementUnit>`, matching line/summary classifications | **Active & Verified**<br>*(MARK: 400001975620443)* |
| **11.1** | Απόδειξη Λιανικής Πώλησης | B2C Retail Goods | `category1_1`<br>`E3_561_003` | Omit counterpart unless requested, retain quantity & unit, settlement type `1` or `3` | **Engine Ready** |

---

## 3. Serialization Rules & AADE Bug Prevention

### 3.1. Strict Service Invoice Rules (Type 2.1)
* **Rule 205 (Quantity / Measurement Unit):** Service lines must never contain `<quantity>` or `<measurementUnit>`. These tags are omitted dynamically:
  ```typescript
  const isServiceInvoice = invType === '2.1' || invType === '11.2';
  const qtyAndUnitTags = isServiceInvoice
    ? ''
    : `\n      <quantity>${qty.toFixed(2)}</quantity>\n      <measurementUnit>${unit}</measurementUnit>`;
  ```
* **Rules 311 & 313 (Income Classification Matching):**
  The classification category and type must match identically across line items and `<invoiceSummary>`:
  * Line Item: `<icls:classificationType>E3_561_001</icls:classificationType>` paired with `<icls:classificationCategory>category1_3</icls:classificationCategory>`
  * Invoice Summary: `<icls:classificationType>E3_561_001</icls:classificationType>` paired with `<icls:classificationCategory>category1_3</icls:classificationCategory>`

### 3.2. Goods Movement Rules (Type 9.3)
* Must use `<icls:classificationCategory>category3</icls:classificationCategory>` exclusively.
* Must **never** include `<icls:classificationType>`.
* Mandatory child order inside `<invoiceHeader>`:
  1. `<series>`
  2. `<aa>`
  3. `<issueDate>`
  4. `<invoiceType>`
  5. `<dispatchDate>`
  6. `<dispatchTime>`
  7. `<vehicleNumber>`
  8. `<movePurpose>`
  9. `<otherMovePurposeTitle>` *(only if movePurpose === 19)*
  10. `<otherDeliveryNoteHeader>` (`<loadingAddress>` followed by `<deliveryAddress>`)

### 3.3. Greek Counterpart Rules (Rule 220)
* When counterpart country is `GR`, the `<name>` element is **strictly forbidden** by AADE. Company name verification is conducted internally by AADE via the counterpart's AFM.
* Street numbers must be valid numbers (default fallback to `'1'` when empty or `'0'`).
* Branch numbers must default to `0` and be sanitized against `null` or `NaN`.

---

## 4. Invoice Cancellation Architecture

### 4.1. Protocol & Endpoints
* **Sandbox Endpoint:** `https://mydataapidev.aade.gr/CancelInvoice?mark={MARK}`
* **HTTP Method:** `POST`
* **Headers:** `aade-user-id`, `Ocp-Apim-Subscription-Key`

### 4.2. Response Parser Logic
DOM parsing supports prefixed and non-prefixed response XML documents:

```typescript
public parseCancelResponse(xmlText: string): { success: boolean; cancellationMark?: string; error?: string } {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  const getVal = (tag: string) =>
    xmlDoc.getElementsByTagName(tag)[0]?.textContent ||
    xmlDoc.querySelector(tag)?.textContent ||
    '';

  const statusCode = getVal('statusCode');
  const cancellationMark = getVal('cancellationMark');

  if (statusCode === 'Success' && cancellationMark) {
    return { success: true, cancellationMark };
  }

  const errorMsg = getVal('message') || getVal('code') || 'Unknown AADE cancellation error';
  return { success: false, error: errorMsg };
}
```

### 4.3. UI Representation of Cancelled Documents
Cancelled invoices display visual confirmation in the archive list and preview:
* Status badge: `❌ Ακυρωμένο`
* Cancellation MARK: Displayed adjacent to initial MARK (e.g., `Ακύρωση: 400001975620999`)
* Cancellation Diagonal Red Watermark / Line across the preview template:
  ```html
  @if (invoice().cancellationMark) {
    <div class="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden z-20">
      <div class="border-4 border-red-600/80 text-red-600/80 font-black text-4xl sm:text-6xl tracking-widest uppercase px-8 py-3 rotate-[-25deg] select-none shadow-sm rounded-lg">
        ΑΚΥΡΩΘΗΚΕ
      </div>
    </div>
  }
  ```

---

## 5. Print Engine Specification (A4 & 80mm Thermal)

### 5.1. The Isolated Iframe Pattern
To prevent Angular root style contamination, global media query conflicts, and unwanted second-page pagebreaks:
1. Clones the target DOM node (`.print-sheet` or `.thermal-receipt`).
2. Converts runtime `<canvas>` QR codes into static PNG base64 `<img>` tags.
3. Physically strips `.no-print` helper elements (such as avatar initials) prior to writing.
4. Injects cloned markup into a sandboxed, invisible iframe document with explicit `@page` CSS.
5. Invokes printing exclusively inside `iframe.contentWindow.print()` and cleans up the DOM node after 1000ms.

### 5.2. Page Budget & Layout Pinning (Single-Page Guarantee)
* **Height Budget:** `min-h-[calc(297mm-24mm)]` with `flex flex-col justify-between`.
* **Footer Anchoring:** Bottom totals, legal disclaimers, and myDATA QR code containers utilize `mt-auto` and `pt-3 border-t-2 border-slate-900` to anchor flush to the bottom of the page regardless of table row counts.
* **Thermal 80mm Constraints:**
  ```css
  @page { size: 80mm auto; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; width: 80mm !important; }
  .thermal-receipt { width: 80mm !important; max-width: 80mm !important; border: none !important; margin: 0 !important; }
  ```

---

## 6. Archive Unpacking Pattern (`LocalInvoiceRecord` to `PrintableInvoiceData`)

When retrieving historical records from Dexie IndexedDB:
1. Parse `LocalInvoiceRecord.payloadJson` safely within a `try/catch` block.
2. Resolve the issuer hierarchy: `snapshot.issuer` &rarr; `TenantIntegrationService` state &rarr; Default tenant company configuration.
3. Guarantee that legal business name, AFM, DOY, and GEMI numbers populate both issuer and customer panels.

---

## 7. Next Phase: Type 11.1 Retail Transition

Upon resumption, the engine is structured to support retail transactions:
* **Invoice Type:** `11.1` (Retail Goods)
* **Counterpart:** Omitted completely for consumer anonymous purchases.
* **Quantities & Units:** Included on all lines.
* **Classification:** `category1_1` paired with `E3_561_003`.
* **Settlement Types:** Type `1` (Cash) or Type `3` (POS Card Terminal).
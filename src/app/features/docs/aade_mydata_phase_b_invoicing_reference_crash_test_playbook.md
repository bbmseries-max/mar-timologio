# Maranth Timologio — AADE myDATA Phase B Reference & Crash Test Playbook

**Version:** 1.0.0 (Phase B Compliance — v1.0.8 XSD)  
**Target Environment:** AADE Development / Sandbox (`https://mydataapidev.aade.gr`)  
**Proxy Gateway:** Cloudflare Worker (`https://gsis-lookup.bbmseries.workers.dev`)  
**Storage Engine:** Dexie.js (Schema v40)  
**POS Origin Integration:** `https://maranth.vercel.app/pos` ↔ `http://localhost:4200` / `4201`

---

## 1. Quick Sandbox Credentials & Identity

| Property | Sandbox Value | Notes |
| :--- | :--- | :--- |
| **Issuer AFM (Εκδότης)** | `067424104` | MARANTH MON IKE (Dev Account) |
| **Issuer DOY** | `ΚΕΦΟΔΕ ΑΤΤΙΚΗΣ` | Official DOY identifier |
| **Issuer Address** | `ΒΑΡΔΟΥΝΙΩΤΗ 11, 11522, ΑΘΗΝΑ` | Auto-injected as origin address in delivery notes |
| **myDATA User ID** | `cuko93dev` | AADE dev user |
| **myDATA Subscription Key** | `eaba5813069d0833f4ccb06dc219ee46` | APIM dev key |
| **GSIS Special User** | `MARANTH-APP26` | `RgWsPublic2` test account |
| **GSIS Special Pass** | `Test@Test33` | Used for AFM lookups |
| **Active Tenant Key** | `tenant_minimarket` | Local partition key in Dexie |

---

## 2. The 7 Supported Document Types Matrix

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       DOCUMENT TYPE SPECIFICATIONS                          │
├───────┬───────────────────────────────────┬──────────────┬──────────────────┤
│ Code  │ Official Description              │ Counterpart  │ Pricing & VAT    │
├───────┼───────────────────────────────────┼──────────────┼──────────────────┤
│ 1.1   │ Τιμολόγιο Πώλησης                 │ Valid AFM    │ Standard (24/13) │
│ 1.2   │ Τιμολόγιο Πώλησης / Διακίνησης    │ Valid AFM    │ Standard + Goods │
│ 2.1   │ Τιμολόγιο Παροχής Υπηρεσιών       │ Valid AFM    │ Services (Cat1_3)│
│ 9.1   │ Συσχετιζόμενο Δελτίο Αποστολής    │ Valid AFM    │ 0.00€ (Cat 8)    │
│ 9.2   │ Συγκεντρωτικό Δελτίο Διακίνησης   │ 000000000    │ 0.00€ (Cat 8)    │
│ 9.3   │ Αυτόνομο Δελτίο Διακίνησης        │ Valid AFM    │ 0.00€ (Cat 8)    │
│ 11.1  │ Απόδειξη Λιανικής Πώλησης (ΑΛΠ)   │ Optional     │ Retail (Cash/POS)│
│ 11.2  │ Απόδειξη Παροχής Υπηρεσιών (ΑΠΥ)  │ Optional     │ Retail Services  │
└───────┴───────────────────────────────────┴──────────────┴──────────────────┘
```

### Detailed Rules per Type

#### Type 1.1 — Τιμολόγιο Πώλησης (B2B)
- **Counterpart:** Valid Greek or EU AFM verified via GSIS / VIES.
- **Classification:** `category1_1`, E3 code `E3_561_001`.
- **Requirements:** At least one valid `<paymentMethods>` block (Type 1 Cash, 3 Wire, 5 POS).

#### Type 1.2 — Τιμολόγιο Πώλησης / Δελτίο Διακίνησης (Phase B)
- **Counterpart:** Valid Greek AFM.
- **Classification:** Standard commercial sales line item + goods dispatch fields.
- **Requirements:** Must contain both pricing/VAT and movement data:
  - `<vehicleNumber>` (License plate)
  - `<movePurpose>` (Usually `1` = Πώληση)
  - `<dischargeAddress>` (Delivery destination)

#### Type 2.1 — Τιμολόγιο Παροχής Υπηρεσιών (B2B)
- **Counterpart:** Valid Greek AFM.
- **Classification:** `category1_3`, E3 code `E3_561_002`.
- **Constraint:** Pure services. No physical delivery headers (`otherDeliveryNoteHeader` MUST NOT exist).

#### Type 9.1 — Συσχετιζόμενο Δελτίο Αποστολής (Phase B)
- **Counterpart:** Valid Greek AFM of customer.
- **Fiscal Impact:** Zero monetary value (`netValue: 0.00`, `vatAmount: 0.00`, `vatCategory: 8`).
- **Critical Requirement:** **Mandatory parent MARK**.
  ```xml
  <correlatedInvoices>
    <invoiceMark>PASTE_PARENT_MARK_HERE</invoiceMark>
  </correlatedInvoices>
  ```

#### Type 9.2 — Συγκεντρωτικό Δελτίο Διακίνησης (Phase B)
- **Counterpart AFM:** Strictly `000000000`.
- **Counterpart Name:** Mandatory literal `<name>ΣΥΓΚΕΝΤΡΩΤΙΚΗ ΔΙΑΚΙΝΗΣΗ</name>`.
- **Fiscal Impact:** Zero monetary values (`0.00€`, VAT Category `8`).
- **Headers:** `<otherDeliveryNoteHeader>` is mandatory. `<currency>` tag is omitted.
- **Delivery Destination:** Generic distribution area (e.g. `ΑΤΤΙΚΗ`, `11522`, `ΑΘΗΝΑ`).

#### Type 9.3 — Αυτόνομο Δελτίο Διακίνησης / Επιστροφή (Phase B)
- **Primary Use Case:** Supplier Returns dispatched from the Basket POS app (`https://maranth.vercel.app/pos`).
- **Counterpart:** Supplier AFM (or customer AFM).
- **Move Purpose:** `4` (Επιστροφή) or `1` (Πώληση) or `6` (Ενδοδιακίνηση).
- **Line Requirements:** Zero monetary value, VAT Category `8`, mandatory line `<itemDescr>`.

#### Type 11.1 & 11.2 — ΑΛΠ & ΑΠΥ (B2C)
- **Counterpart:** Optional / Anonymous (`000000000` or omitted counterpart block).
- **Payment Method:** Mandatory (Type `1` Cash or Type `5` POS).
- **Rounding:** Must adhere to mathematical half-up rounding (`roundToTwoDecimals`) to prevent 1-cent reconciliation rejections.

---

## 3. Tomorrow's Crash Test Execution Sequence

Follow this step-by-step checklist in order:

```
[TEST 1] Type 9.2 Consolidated Dispatch
    │
    ├──► 1. Select "9.2 — Συγκεντρωτικό Δελτίο Διακίνησης"
    ├──► 2. Verify AFM locks to 000000000 and Name is "ΣΥΓΚΕΝΤΡΩΤΙΚΗ ΔΙΑΚΙΝΗΣΗ"
    ├──► 3. Add 2 test items (Quantities > 0, Price = 0)
    ├──► 4. Enter vehicle plate: "IEK-4821"
    ├──► 5. Click "Διαβίβαση στην ΑΑΔΕ"
    └──► 6. CAPTURE & SAVE THE RETURNED MARK: ____________________

[TEST 2] Type 9.1 Correlated Dispatch
    │
    ├──► 1. Select "9.1 — Συσχετιζόμενο Δελτίο Αποστολής"
    ├──► 2. Enter customer AFM: 094014201 (OTE)
    ├──► 3. Paste the MARK saved from Test 1 into "Συσχετιζόμενο MARK"
    ├──► 4. Transmit to AADE
    └──► 5. Verify successful acceptance without AADE 204 error.

[TEST 3] Type 9.3 POS Basket Return Handover
    │
    ├──► 1. Open Basket App (https://maranth.vercel.app/pos or local port 4201)
    ├──► 2. Add 2 items to basket, flag one as return
    ├──► 3. Click "Επιστροφή Προμηθευτή" -> "Διαβίβαση στο Τιμολόγιο"
    ├──► 4. Verify Maranth Timologio receives the payload via BroadcastChannel / URL
    ├──► 5. Verify Type 9.3 is auto-selected with series "ΕΠΙΣΤΡ" and VAT Cat 8
    └──► 6. Click "Διαβίβαση" and verify MARK returned.

[TEST 4] Type 1.1 Commercial Invoice (Rounding & Calculation Test)
    │
    ├──► 1. Select "1.1 — Τιμολόγιο Πώλησης"
    ├──► 2. Customer AFM: 094079101 (ΔΕΗ)
    ├──► 3. Add Line 1: Qty 3 @ 1.005€ (Vat 24%) -> Verify net/vat rounding
    ├──► 4. Add Line 2: Qty 1 @ 12.33€ (Vat 13%)
    ├──► 5. Payment method: Wire Transfer (Type 3)
    └──► 6. Transmit to AADE -> Confirm zero 201/203 calculation errors.
```

---

## 4. Key Error Codes & Quick Resolutions

| Error Code | Reason | Fix |
| :--- | :--- | :--- |
| **Error 201 / 203** | Total gross/net/vat sum mismatch (> 0.01€) | Ensure `roundToTwoDecimals()` is used on all line nets and total summaries. |
| **Error 204** | Invalid Correlated Invoice MARK | Parent MARK is invalid or was cancelled. Re-transmit parent document first. |
| **Error 247** | Invalid Move Purpose or Vehicle Plate | Ensure `<vehicleNumber>` is non-empty and `<movePurpose>` matches table (1–7). |
| **Error 274** | Invalid Postal Code | Greek postal codes must be exactly 5 digits (e.g. `11522`, `10564`). Avoid `10000`. |
| **ValidationError** | Schema violation / Bad XML | Check DevTools console for raw response; verify closing tags in serializer. |

---

## 5. Thermal & Document Print Verification

- **Format:** 80mm ESC/POS continuous roll and Standard A4 PDF.
- **QR Code Endpoint:**
  - Sandbox: `https://mydataapidev.aade.gr/TimologioQR/QRInfo?q={MARK}`
  - Production: `https://mydatapi.aade.gr/TimologioQR/QRInfo?q={MARK}`
- **CSS Isolation:** Printed elements must use `.print-area-only` with `overflow: hidden; width: 72mm;` to avoid feed overflow and blank page ejects.
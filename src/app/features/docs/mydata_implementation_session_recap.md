# myDATA Engineering Session Recap — October 14, 2026

## 1. Executive Summary & Accomplishments

Today's session resolved foundational bugs across validation, schema formatting, and fiscal/non-fiscal payload differentiation against the live AADE test environment (`mydataapidev.aade.gr`).

### Verified Milestones
- **Type 1.1 (Standard Commercial Sales Invoice): 100% Operational**
  - Live certified AADE test MARKs successfully generated:
    - 24% Standard VAT: `MARK: 400015651469440`
    - 13% Reduced VAT: `MARK: 400015653548848` (`UID: 07078A8B071B82A0CCC8DC414100DE684BE3678B`)
    - 0% Exempt VAT: `MARK: 400015656551763` (`UID: 923DC43FAEC6D97C1505324E4B7F0774D2ED6BD5`)
    - Sequential verification: `MARK: 400015659334179` (`UID: 36D59A4AFE3BD2ECF3886CEBFE6F28ADC6DA42C9`)
- **AFM Modulo 11 & GSIS Integration:**
  - Resolved false business deactivation alerts by properly mapping `active: result.deactivation_flag !== '1'`.
  - Audited bitwise Modulo 11 check digit calculation (`1 << (8 - i)`).
  - Fixed Angular strict template checking (`strictTemplates`) comparison error `ngtsc(2532)` for control lengths.
- **0% VAT Rule Enforcement:**
  - Enforced mandatory injection of `<vatExemptionCategory>27</vatExemptionCategory>` directly following `<vatAmount>` whenever `vatCategory` is `7` or `8`.
- **Infrastructure Verification:**
  - Confirmed the Cloudflare Worker gateway forwards requests to the official development environment (`https://mydataapidev.aade.gr/SendInvoices`) under real certificate/secret headers, producing genuine sandbox telemetry without fiscal liability.

---

## 2. Real-World timologio Legal Baseline

From inspection of your legally certified document (`MARK: 400015364020022` issued to *ΡΗΓΑΣ ΔΙΑΝΟΜΕΣ ΑΕ*):

| Element | Real Legal Value | Technical Meaning |
|---|---|---|
| **Document Type** | **Δελτίο Αποστολής (9.3)** | Standalone, non-correlated dispatch note. |
| **Move Purpose** | **Επιστροφή (`code 6`)** | Goods return to supplier. |
| **Correlated Invoices** | **Omitted / Blank** | No original invoice MARK is required when using Type 9.3 (unlike 9.1). |
| **VAT Category** | **Άνευ ΦΠΑ (`vatCategory 8`)** | VAT amount strictly `0.00`, exemption category `27`. |
| **Fiscal Totals** | **`0.00 €`** | `netValue: 0.00`, `totalGrossValue: 0.00`, no revenue classification. |
| **Payment Methods** | **Omitted / Blank** | Dispatches strictly forbid `<paymentMethods>`. |
| **Counterpart Address** | **Present** | Full recipient address is mandatory for all dispatches. |

---

## 3. Key Schema Lessons & Rules Discovered

### A. Document Code Mappings
- **1.1:** Commercial Sales Invoice (Domestic, Greece).
- **1.2:** Intra-Community EU B2B Delivery (Requires foreign EU VAT ID and `vatCategory: 7`; not a domestic dispatch note).
- **9.1:** Correlated Dispatch Note (Enforces `<correlatedInvoices>` with the original sales document MARK).
- **9.3:** Standalone Dispatch Note (Used for unlinked sales transit, sample movement, and return dispatches without prior MARK citations).

### B. Element Placement Inside `<invoice>`
1. `<issuer>` $\rightarrow$ `<counterpart>` (with complete `<address>` if dispatch or 1.2).
2. `<invoiceHeader>`:
   - Contains `series`, `aa`, `issueDate`, `invoiceType`, `currency`.
   - Dispatches include `<movePurpose>` (e.g. `1` for sale, `6` for return).
3. `<paymentMethods>`:
   - Placed directly between `</invoiceHeader>` and `${linesXml}`.
   - Encloses `<paymentMethodDetails><type>...</type><amount>...</amount></paymentMethodDetails>`.
   - **Strictly omitted** for Types 9.1 and 9.3.
4. `<invoiceDetails>`:
   - For 1.1: `lineNumber` $\rightarrow$ `netValue` $\rightarrow$ `vatCategory` $\rightarrow$ `vatAmount` $\rightarrow$ optional `<vatExemptionCategory>` $\rightarrow$ `<incomeClassification>`.
   - For 9.3: `lineNumber` $\rightarrow$ `netValue: 0.00` $\rightarrow$ `vatCategory: 8` $\rightarrow$ `vatAmount: 0.00` $\rightarrow$ `<vatExemptionCategory>27</vatExemptionCategory>` $\rightarrow$ `<quantity15>`. `recType: 6` is **omitted**.
5. `<invoiceSummary>`:
   - Dispatches require `0.00` across all fiscal totals and omit summary income classification.
6. `<otherTransportDetails>`:
   - Deprecated by AADE inside standard `SendInvoices` payloads; telematics and vehicle registrations now route via `RegisterTransfer`.

---

## 4. Immediate Action Items

1. **Physical Return Tomorrow Morning:**
   - Execute the goods return using the official **timologio** portal (`mytimologio.aade.gr`) with Document Type 9.3, purpose `6 - Επιστροφή`, and customer AFM `999802052` to guarantee legal roadside compliance and QR validity.
2. **Angular App Serialization (Next Session):**
   - Retain the clean `buildInvoicesDocXml` in `src/app/core/services/mydata.service.ts` with duplicate `<movePurpose>` tags removed.
   - Align `aade-serializer.service.ts` with the cleaned `mydata.service.ts` structure.
   - Connect the thermal print engine and QR code renderer to live `MARK` and `UID` database records.
```

This file documents everything established during today's session, including the real timologio parameters and the clean XML hierarchy. You can review it whenever you're ready to proceed.
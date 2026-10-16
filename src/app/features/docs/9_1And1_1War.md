# myDATA Transmission & App Bug Tracker

## 1. Verified Working & Key Wins
- **Type 1.1 Live Transmission:**
  - Standard VAT (24%): Verified with `MARK: 400015651469440`
  - Reduced VAT (13%): Verified with `MARK: 400015653548848` (`UID: 07078A8B071B82A0CCC8DC414100DE684BE3678B`)
- **Type 9.1 XML Structure:**
  - Resolved tag sequence for `<invoiceDetails>` (`lineNumber` → `recType: 6` → `netValue: 0.00` → `vatCategory` → `vatAmount: 0.00` → `quantity15`).
  - Resolved `<otherTransportDetails>` (`vehicleNumber` → `transportType: 1` → `timeStamp: xs:dateTime` → `carrierVatNumber`).
  - Moved `<movePurpose>` into `<invoiceHeader>`.
- **GSIS Proxy Status:**
  - Fixed false deactivation warning by mapping `active: result.deactivation_flag !== '1'`.

---

## 2. Issues to Address Next

### Issue A: VAT 0% Line Rejection on 1.1
- **Root Cause:** In AADE rules, when VAT rate is 0% (`vatCategory: 7` or `8`), `<vatExemptionCategory>` (codes 1–27) is **mandatory** inside `<invoiceDetails>`. Omitting it causes immediate validation rejection.
- **Action:** Ensure `<vatExemptionCategory>` is included whenever `vatCategory` is 0%.

### Issue B: 9.1 CorrelatedInvoices Mandatory
- **Root Cause:** Restoring saved drafts from Dexie injects `movePurpose: 6` (Επιστροφή / Return). For return dispatches, AADE requires correlated original invoice MARKs.
- **Action:** Update form and draft fallback logic to default `movePurpose` to `1` (Πώληση / Sale) or `2` (Διακίνηση).

### Issue C: Client-Side "✕ Μη έγκυρο Α.Φ.Μ."
- **Root Cause:** Frontend Modulo 11 checksum validator failure on specific valid AFM numbers (likely string padding or leading zeros handling).
- **Action:** Review the AFM validator regex and Modulo 11 check algorithm.
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
Fetch AFM from GSIS db
WAF / Reverse Proxy Behavior:

www1.gsis.gr/webtax/... routes through an Oracle Access Manager (OAM) SSO portal, triggering an F5 BIG-IP anti-bot challenge (f5_cspm) and issuing a 302 redirect to /oam/server/auth_cred_submit.

www1.gsis.gr/webtax2/... paths return pure WebLogic HTTP 404 errors, indicating the servlet context path is either blocked or mapped to an alternate URI.

Direct domain services.gsis.gr fails public DNS resolution (error code: 1016 on Cloudflare).

Requirements Verified:

Credentials (MARANTH-APP2026) are valid and authorized under service RgWsPublic2.

Request payload requires strict WS-Security <wsse:UsernameToken> headers.

afm_called_by must strictly be the 9 numeric digits (067424104), omitting any leading A.

XML elements inside <rg:INPUT_REC> must remain unqualified (no namespace prefixes).

AADE 
​Θα θέλαμε να μας διευκρινίσετε:
​Επίσημο Raw XML Sample: Μπορείτε να μας δώσετε ένα πλήρες, έγκυρο δείγμα XML (raw .xml) για Τύπο 9.3 που περνάει επιτυχώς από το endpoint SendInvoices στο test environment;
​Namespace / XSD Version: Απαιτείται διαφορετικό root namespace ή διαφορετικό target endpoint/version για τα ψηφιακά δελτία αποστολής πέραν του βασικού [http://www.aade.gr/myDATA/invoice/v1.0](http://www.aade.gr/myDATA/invoice/v1.0);
​Θέση & Sequence Tag: Ποια είναι η ακριβής ακολουθία (sequence) των στοιχείων <movePurpose>, <withoutDigitalTransportTracking>, <isDeliveryNote> και <otherDeliveryNoteHeader> στο XSD του gateway σας;
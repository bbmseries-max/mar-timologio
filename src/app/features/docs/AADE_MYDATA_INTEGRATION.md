AADE myDATA Integration Reference Guide (Maranth App)1. Architecture OverviewAngular UI (Client / Dexie DB)
   │
   │  POST (JSON or XML payload)
   ▼
Cloudflare Worker Gateway (`gsis-lookup.bbmseries.workers.dev/send-invoice`)
   │
   │  HTTPS POST with AADE Auth Headers
   ▼
AADE myDATA REST API (`https://mydatapi.aade.gr/myDATA/SendInvoices`)
Client Storage: Dexie.js (IndexedDB) for local-first persistence.Proxy: Cloudflare Worker handling CORS, request shaping, and credential security.Upstream: Official AADE Production REST API.2. Credentials & AuthenticationAADE requires two headers for every REST API call. These are created under myDATA > Εγγραφή στο myDATA > Διαχείριση Ειδικών Κωδικών (ERP) at [https://www1.aade.gr/saadeapps2/bookkeeper-web/](https://www1.aade.gr/saadeapps2/bookkeeper-web/):Header NameCloudflare Worker VariableSource / Descriptionaade-user-idMYDATA_USER_IDAPI Username created in AADE portalOcp-Apim-Subscription-KeyMYDATA_SUBSCRIPTION_KEY32-character hexadecimal key from portalEndpoints ReferenceEnvironmentBase URLProduction (Live)[https://mydatapi.aade.gr/myDATA/SendInvoices](https://mydatapi.aade.gr/myDATA/SendInvoices)Development Sandbox[https://mydata-dev.azure-api.net/SendInvoices](https://mydata-dev.azure-api.net/SendInvoices)Note: Production credentials only authenticate against mydatapi.aade.gr. Using them against the dev sandbox returns 401 Unauthorized or DNS 1016 / HTTP 530 errors.3. Strict XML Schema Rules (AADE XSD)AADE validates payloads using a strict schema engine. Elements must appear in exact hierarchical and sequential order, with proper namespaces:Mandatory NamespacesXML<InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0"
             xmlns:ic="https://www.aade.gr/myDATA/incomeClassificaton/v1.0">
Mandatory Element Sequence inside <invoice><issuer> (vatNumber, country, branch)<counterpart> (vatNumber, country, branch)<invoiceHeader> (series, aa, issueDate, invoiceType, currency)<paymentMethods> (Must come before invoiceDetails)<paymentMethodDetails> with <type> (1 = Bank, 3 = Cash, 5 = POS) and <amount><invoiceDetails><lineNumber>, <netValue>, <vatCategory>, <vatAmount><incomeClassification> with <ic:classificationType>, <ic:classificationCategory>, <ic:amount><invoiceSummary>Strict child sequence: totalNetValue $\rightarrow$ totalVatAmount $\rightarrow$ totalWithheldAmount $\rightarrow$ totalFeesAmount $\rightarrow$ totalStampDutyAmount $\rightarrow$ totalOtherTaxesAmount $\rightarrow$ totalDeductionsAmount $\rightarrow$ totalGrossValue $\rightarrow$ <incomeClassification>4. Cloudflare Worker Implementation (/send-invoice)JavaScriptexport default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, aade-user-id, Ocp-Apim-Subscription-Key",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === "/send-invoice" && request.method === "POST") {
      try {
        const xmlBody = await request.text();
        const mydataUserId = (env.MYDATA_USER_ID || "").trim();
        const mydataSubKey = (env.MYDATA_SUBSCRIPTION_KEY || "").trim();

        if (!mydataUserId || !mydataSubKey) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "Missing credentials: MYDATA_USER_ID or MYDATA_SUBSCRIPTION_KEY not configured.",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } }
          );
        }

        const endpoint = "https://mydatapi.aade.gr/myDATA/SendInvoices";

        const aadeResp = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "aade-user-id": mydataUserId,
            "Ocp-Apim-Subscription-Key": mydataSubKey,
          },
          body: xmlBody,
        });

        const respXml = await aadeResp.text();

        const getTag = (tag) => {
          const match = respXml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([^<]+)<\\/(?:\\w+:)?${tag}>`, "i"));
          return match ? match[1].trim() : null;
        };

        const statusCode = getTag("statusCode");
        const invoiceMark = getTag("invoiceMark");
        const invoiceUid = getTag("invoiceUid");
        const qrUrl = getTag("qrUrl");
        const errorMsg = getTag("message");

        return new Response(
          JSON.stringify({
            success: statusCode === "Success" && !!invoiceMark,
            httpStatus: aadeResp.status,
            statusCode,
            mark: invoiceMark,
            uid: invoiceUid,
            qrUrl: qrUrl,
            error: errorMsg || (aadeResp.ok ? null : `AADE returned HTTP ${aadeResp.status}`),
            raw: respXml,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Gateway internal execution error",
            details: String(err && err.stack ? err.stack : err),
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } }
        );
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
};
5. Angular Client IntegrationModel (local-invoice-record.model.ts)TypeScriptexport interface LocalInvoiceRecord {
  id?: number | string;
  tenantId: string;
  series: string;
  documentNumber: number;
  issueDate: string;
  invoiceType: string;
  customerAfm: string;
  customerName: string;
  totalNet: number;
  totalVat: number;
  totalGross: number;
  transmissionStatus: 'DRAFT' | 'TRANSMITTED' | 'FAILED';
  mark?: string;
  uid?: string;
  qrUrl?: string;
  payloadJson: string;
  updatedAt: number;
  createdAt: number;
}
Signal HandlingTypeScriptpublic readonly currentDraftId = signal<string | null>(crypto.randomUUID());

// Type-safe draft loading:
this.currentDraftId.set(draft.id == null ? null : String(draft.id));
Dexie Update WorkflowTypeScriptasync sendToMyData(invoice: LocalInvoiceRecord): Promise<void> {
  try {
    const result = await this.myData.transmitInvoice(invoice);

    if (result.success && result.mark) {
      invoice.mark = result.mark;
      invoice.uid = result.uid;
      invoice.qrUrl = result.qrUrl;
      invoice.transmissionStatus = 'TRANSMITTED';
      invoice.updatedAt = Date.now();

      if (invoice.id) {
        await this.db.invoices.update(invoice.id, {
          mark: result.mark,
          uid: result.uid,
          qrUrl: result.qrUrl,
          transmissionStatus: 'TRANSMITTED',
          updatedAt: Date.now(),
        });
      }
    } else {
      if (invoice.id) {
        await this.db.invoices.update(invoice.id, {
          transmissionStatus: 'FAILED',
          updatedAt: Date.now(),
        });
      }
    }
  } catch (err: unknown) {
    console.error('Transmission error:', err);
  }
}
6. Milestone CheckpointFirst Successful Live Submission Verified:Status: SuccessTest MARK: 400015635821372Test UID: A8B4ED89FE3B75D9035B71DBD2ED0497D5DEE8BEOfficial QR Verification link received and confirmed.
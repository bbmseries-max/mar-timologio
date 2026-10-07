// server/src/gsis-proxy.js
const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');

const router = express.Router();

// Production GSIS RgWsPublic2 SOAP Endpoint
const GSIS_ENDPOINT = 'https://www1.gsis.gr/webtax2/ws/RgWsPublic2/RgWsPublic2';

router.get('/lookup', async (req, res) => {
  const afmToLookup = req.query.afm;

  if (!afmToLookup || afmToLookup.length !== 9) {
    return res.status(400).json({ error: 'Valid 9-digit AFM is required' });
  }

  // Tenant / SaaS operator credentials for GSIS Web Services
  const gsisUsername = process.env.GSIS_WS_USER;
  const gsisPassword = process.env.GSIS_WS_PASSWORD;
  const callerAfm = process.env.MARANTH_ISSUER_AFM; // AFM of your company

  // 1. Build SOAP 1.1 Request Envelope
  const soapEnvelope = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:rg="http://gr/gsis/rgwspublic2/RgWsPublic2.wsdl"
                  xmlns:rgtypes="http://gr/gsis/rgwspublic2/RgWsPublic2Types.xsd">
   <soapenv:Header/>
   <soapenv:Body>
      <rg:rgWsPublic2AfmMethod>
         <rg:INPUT_REC>
            <rgtypes:afm_called_by>${callerAfm}</rgtypes:afm_called_by>
            <rgtypes:afm_called_for>${afmToLookup}</rgtypes:afm_called_for>
         </rg:INPUT_REC>
      </rg:rgWsPublic2AfmMethod>
   </soapenv:Body>
</soapenv:Envelope>`.trim();

  try {
    // 2. Dispatch SOAP call to GSIS with Basic Auth
    const response = await axios.post(GSIS_ENDPOINT, soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '',
      },
      auth: {
        username: gsisUsername,
        password: gsisPassword,
      },
      timeout: 8000,
    });

    // 3. Parse XML response
    const parser = new xml2js.Parser({ explicitArray: false, ignoreNamespaces: true });
    const parsed = await parser.parseStringPromise(response.data);

    const result = parsed.Envelope.Body.rgWsPublic2AfmMethodResponse.result_rec;

    // Check if GSIS returned an error code
    if (result.error_rec && result.error_rec.error_code) {
      return res.status(422).json({
        error: result.error_rec.error_descr || 'GSIS returned an error for this AFM',
      });
    }

    // 4. Return clean, sanitized JSON to Angular
    return res.json({
      afm: result.afm,
      legalName: result.onomasia,
      commercialTitle: result.commer_title,
      doy: result.doy,
      doyDescr: result.doy_descr,
      postalAddress: result.postal_address,
      postalAddressNo: result.postal_address_no,
      postalZipCode: result.postal_zip_code,
      postalAreaDescription: result.postal_area_description,
      firmActivationDate: result.firm_act_date,
      isNormalVatRegime: result.normal_vat_system === 'Y',
      active: result.deactivation_flag === '1', // '1' means Active
    });
  } catch (error) {
    console.error('GSIS SOAP Gateway Error:', error.message);
    return res.status(502).json({ error: 'Failed to contact GSIS registry service' });
  }
});

module.exports = router;
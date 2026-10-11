module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { afm } = req.query || {};

    if (!afm || typeof afm !== 'string' || afm.trim().length !== 9) {
      return res.status(400).json({ error: 'Valid 9-digit Greek AFM is required.' });
    }

    const cleanAfm = afm.trim();
    const gsisUser = process.env.GSIS_USER;
    const gsisPassword = process.env.GSIS_PASSWORD;
    const callingAfm = process.env.AFM_CALLING;

    if (!gsisUser || !gsisPassword || !callingAfm) {
      return res.status(500).json({
        error: 'Missing GSIS environment variables in Vercel.',
        details: {
          hasUser: Boolean(gsisUser),
          hasPass: Boolean(gsisPassword),
          hasAfm: Boolean(callingAfm),
        },
      });
    }

    // GSIS RgWsPublic2 SOAP Envelope with WS-Security
    const soapEnvelope = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:rg="http://gr/gsis/rgwspublic2/RgWsPublic2.wsdl">
        <soapenv:Header>
          <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
            <wsse:UsernameToken>
              <wsse:Username>${gsisUser.trim()}</wsse:Username>
              <wsse:Password>${gsisPassword.trim()}</wsse:Password>
            </wsse:UsernameToken>
          </wsse:Security>
        </soapenv:Header>
        <soapenv:Body>
          <rg:rgWsPublic2Version2>
            <rg:INPUT_REC>
              <rg:afm_called>${cleanAfm}</rg:afm_called>
              <rg:afm_called_by>${callingAfm.trim()}</rg:afm_called_by>
            </rg:INPUT_REC>
          </rg:rgWsPublic2Version2>
        </soapenv:Body>
      </soapenv:Envelope>
    `.trim();

    // Standard production endpoint candidates according to AADE WSDL definitions
    const endpoints = [
      'https://www.gsis.gr/webtax2/ws/RgWsPublic2/RgWsPublic2',
      'https://www1.aade.gr/webtax2/ws/RgWsPublic2/RgWsPublic2',
      'https://www.gsis.gr/rgwspublic2/RgWsPublic2Port',
      'https://www1.gsis.gr/webtax/rgwspublic2/RgWsPublic2Port'
    ];

    let xmlText = '';
    let lastUrl = '';
    let success = false;

    for (const url of endpoints) {
      lastUrl = url;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': '',
          },
          body: soapEnvelope,
        });

        const text = await response.text();
        // If it returns XML (SOAP response or fault) rather than HTML 404
        if (text.includes('<?xml') || text.includes('<soapenv:') || text.includes('<env:') || text.includes('<soap:')) {
          xmlText = text;
          success = true;
          break;
        }
      } catch (e) {
        console.warn(`Failed trying endpoint ${url}:`, e);
      }
    }

    if (!success) {
      return res.status(502).json({
        error: 'Unable to reach active GSIS RgWsPublic2 endpoint.',
        attemptedEndpoints: endpoints,
        lastUrl,
        sampleOutput: xmlText.substring(0, 300)
      });
    }

    // Check for SOAP Faults or explicit error messages from GSIS
    if (xmlText.includes('faultstring') || xmlText.includes('error_descr')) {
      const faultMatch =
        xmlText.match(/<faultstring>(.*?)<\/faultstring>/i) ||
        xmlText.match(/<error_descr>(.*?)<\/error_descr>/i);
      const faultMsg = faultMatch ? faultMatch[1] : 'GSIS SOAP Fault returned';
      return res.status(500).json({ error: faultMsg, raw: xmlText });
    }

    // Helper to safely extract case-insensitive and namespaced XML tags
    const getTag = (tag) => {
      const regex = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${tag}>([^<]*)</(?:[a-zA-Z0-9_-]+:)?${tag}>`, 'i');
      const match = xmlText.match(regex);
      return match ? match[1].trim() : '';
    };

    const legalName = getTag('onomasia') || getTag('firm_act_descr');
    const doyDescr = getTag('doy_descr');
    const postalAddress = getTag('postal_address');
    const postalAddressNo = getTag('postal_address_no');
    const postalZipCode = getTag('postal_zip_code');
    const postalAreaDescription = getTag('postal_area_description');

    if (!legalName) {
      return res.status(200).json({ legalName: null, message: 'No record found in registry', raw: xmlText });
    }

    return res.status(200).json({
      legalName,
      doyDescr,
      postalAddress,
      postalAddressNo,
      postalZipCode,
      postalAreaDescription,
      active: !xmlText.includes('ΔΙΑΚΟΠΗ'),
    });
  } catch (err) {
    const errorDetails = err && err.stack ? err.stack : String(err);
    console.error('GSIS Serverless Error:', errorDetails);
    return res.status(500).json({
      error: 'Unhandled server error in lookup function',
      details: errorDetails,
    });
  }
};
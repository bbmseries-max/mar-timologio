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

    // Official GSIS RgWsPublic2 SOAP 1.1 Envelope
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:rg="http://gr/gsis/rgwspublic2/RgWsPublic2Version2.wsdl" xmlns:ns="http://gr/gsis/rgwspublic2/RgWsPublic2Version2">
  <soapenv:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${gsisUser.trim()}</wsse:Username>
        <wsse:Password>${gsisPassword.trim()}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <rg:rgWsPublic2Version2Net>
      <rg:INPUT_REC>
        <ns:afm_called>${cleanAfm}</ns:afm_called>
        <ns:afm_called_by>${callingAfm.trim()}</ns:afm_called_by>
      </rg:INPUT_REC>
    </rg:rgWsPublic2Version2Net>
  </soapenv:Body>
</soapenv:Envelope>`.trim();

    // Canonical production targets defined by AADE WebLogic
    const endpoints = [
      'https://www1.gsis.gr/webtax2/ws/RgWsPublic2/RgWsPublic2SoapHttpPort',
      'https://www1.gsis.gr/rgwspublic2/RgWsPublic2',
      'https://www1.gsis.gr/webtax2/ws/RgWsPublic2/RgWsPublic2'
    ];

    let xmlText = '';
    let chosenUrl = '';
    let httpStatus = 0;

    for (const url of endpoints) {
      chosenUrl = url;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': '',
            'User-Agent': 'Apache-HttpClient/4.5.5 (Java/1.8.0)',
            'Accept': 'text/xml, text/html, */*'
          },
          body: soapEnvelope,
        });

        httpStatus = response.status;
        const text = await response.text();

        // If WebLogic returns SOAP XML (either success or SOAP fault)
        if (text.includes('Envelope') || text.includes('Fault') || text.includes('faultstring') || text.includes('result_descr')) {
          xmlText = text;
          break;
        }
      } catch (err) {
        console.warn(`Connection error on ${url}:`, err);
      }
    }

    if (!xmlText) {
      return res.status(502).json({
        error: 'AADE gateway did not return valid SOAP XML.',
        lastUrl: chosenUrl,
        httpStatus
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

    // Safe XML value extractor ignoring namespace prefixes
    const getTag = (tag) => {
      const regex = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${tag}[^>]*>([^<]*)</(?:[a-zA-Z0-9_-]+:)?${tag}>`, 'i');
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
      return res.status(200).json({
        legalName: null,
        message: 'No record found in registry',
        raw: xmlText,
      });
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
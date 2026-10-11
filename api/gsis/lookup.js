module.exports = async function handler(req, res) {
  // CORS configuration
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

    // GSIS RgWsPublic2 SOAP Envelope with WS-Security Header
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

    const gsisEndpoint = 'https://www1.gsis.gr/webtax2/ws/RgWsPublic2/RgWsPublic2';

    const response = await fetch(gsisEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '',
      },
      body: soapEnvelope,
    });

    const xmlText = await response.text();
    return res.status(200).json({ rawXml: xmlText });

    // Check for SOAP Faults or explicit error messages from GSIS
    if (xmlText.includes('faultstring') || xmlText.includes('error_descr')) {
      const faultMatch =
        xmlText.match(/<faultstring>(.*?)<\/faultstring>/) ||
        xmlText.match(/<error_descr>(.*?)<\/error_descr>/);
      const faultMsg = faultMatch ? faultMatch[1] : 'GSIS SOAP Fault returned';
      return res.status(500).json({ error: faultMsg, raw: xmlText });
    }

    const getTag = (tag) => {
      const match = xmlText.match(new RegExp(`<${tag}>(.*?)</${tag}>`));
      return match ? match[1].trim() : '';
    };

    const legalName = getTag('onomasia') || getTag('firm_act_descr');
    const doyDescr = getTag('doy_descr');
    const postalAddress = getTag('postal_address');
    const postalAddressNo = getTag('postal_address_no');
    const postalZipCode = getTag('postal_zip_code');
    const postalAreaDescription = getTag('postal_area_description');

    if (!legalName) {
      return res.status(200).json({ legalName: null, message: 'No record found in registry' });
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
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  const { afm } = req.query;

  if (!afm || typeof afm !== 'string' || afm.length !== 9) {
    return res.status(400).json({ error: 'Valid 9-digit Greek AFM is required.' });
  }

  const gsisUser = process.env.GSIS_USER;
  const gsisPassword = process.env.GSIS_PASSWORD;
  const callingAfm = process.env.AFM_CALLING;

  if (!gsisUser || !gsisPassword || !callingAfm) {
    return res.status(500).json({
      error: 'Missing GSIS credentials in Vercel environment variables (GSIS_USER, GSIS_PASSWORD, AFM_CALLING).'
    });
  }

  const soapEnvelope = `
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:rg="http://gr/gsis/rgwspublic2/RgWsPublic2.wsdl">
      <soapenv:Header/>
      <soapenv:Body>
        <rg:rgWsPublic2Version2>
          <rg:INPUT_REC>
            <rg:afm_called>${afm}</rg:afm_called>
            <rg:afm_called_by>${callingAfm}</rg:afm_called_by>
          </rg:INPUT_REC>
        </rg:rgWsPublic2Version2>
      </soapenv:Body>
    </soapenv:Envelope>
  `.trim();

  try {
    const gsisEndpoint = 'https://www1.gsis.gr/webtax2/ws/RgWsPublic2/RgWsPublic2';
    const authHeader = 'Basic ' + Buffer.from(`${gsisUser}:${gsisPassword}`).toString('base64');

    const response = await fetch(gsisEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': '',
        'Authorization': authHeader,
      },
      body: soapEnvelope,
    });

    const xmlText = await response.text();

    const getTag = (tag: string): string => {
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
      return res.status(200).json({ legalName: null, message: 'No records found.' });
    }

    return res.status(200).json({
      legalName,
      doyDescr,
      postalAddress,
      postalAddressNo,
      postalZipCode,
      postalAreaDescription,
      active: !xmlText.includes('ΔΙΑΚΟΠΗ')
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to connect to GSIS';
    return res.status(500).json({ error: errorMessage });
  }
}
// api/mydata/transmit.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { issuerAfm, aadeUserId, aadeSubscriptionKey, xmlPayload, isDev } = req.body;

  // 1. Read whitelist from environment variable
  const rawAllowed = process.env.ALLOWED_AFMS || '';
  const allowedAfms = new Set(
    rawAllowed.split(',').map((afm: string) => afm.trim()).filter(Boolean)
  );

  // 2. Pure AFM Gate Check
  const normalizedAfm = (issuerAfm || '').toString().trim();
  if (!normalizedAfm || !allowedAfms.has(normalizedAfm)) {
    return res.status(403).json({
      success: false,
      code: 'UNAUTHORIZED_AFM',
      message: `Το Α.Φ.Μ. ${normalizedAfm || 'N/A'} δεν διαθέτει ενεργή συνδρομή διαβίβασης Maranth. Επικοινωνήστε με την υποστήριξη.`,
    });
  }

  // 3. Ensure client sent their own credentials in the request
  if (!aadeUserId || !aadeSubscriptionKey || !xmlPayload) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_CLIENT_DATA',
      message: 'Απαιτούνται κωδικοί myDATA και έγκυρο XML έγγραφο.',
    });
  }

  // 4. Relay directly to AADE
  const aadeEndpoint = isDev
    ? 'https://mydata-dev.azure-api.net/SendInvoices'
    : 'https://mydatapi.aade.gr/myDATA/SendInvoices';

  try {
    const aadeResponse = await fetch(aadeEndpoint, {
      method: 'POST',
      headers: {
        'aade-user-id': aadeUserId,
        'Ocp-Apim-Subscription-Key': aadeSubscriptionKey,
        'Content-Type': 'application/xml',
      },
      body: xmlPayload,
    });

    const responseText = await aadeResponse.text();
    return res.status(aadeResponse.status).send(responseText);
  } catch (error: any) {
    console.error('[myDATA Relay Error]:', error);
    return res.status(502).json({
      success: false,
      error: 'Σφάλμα επικοινωνίας με την πύλη ΑΑΔΕ',
      details: error.message,
    });
  }
}
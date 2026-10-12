module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { afm } = req.query || {};

  if (!afm || typeof afm !== 'string' || afm.trim().length !== 9) {
    return res.status(400).json({ error: 'Valid 9-digit Greek AFM is required.' });
  }

  // Replace with your exact Cloudflare Worker URL
  const workerBaseUrl = 'https://gsis-lookup.bbmseries.workers.dev/';

  try {
    const upstream = await fetch(`${workerBaseUrl}/?afm=${encodeURIComponent(afm.trim())}`);
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error('Vercel forwarder error:', err);
    return res.status(502).json({
      error: 'Failed to communicate with GSIS lookup proxy worker.',
      details: String(err),
    });
  }
};
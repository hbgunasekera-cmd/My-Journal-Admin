import { requireTrustedMutation } from '../server/api-security.js';

const EXPECTED_HOST = 'www.myjournalview.com';
const EXPECTED_KEY = '24d0f44fba0b4dc7bf211372ab00f787';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!requireTrustedMutation(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  const { host, key, keyLocation, urlList } = req.body || {};
  if (
    host !== EXPECTED_HOST || key !== EXPECTED_KEY ||
    keyLocation !== `https://${EXPECTED_HOST}/${EXPECTED_KEY}.txt` ||
    !Array.isArray(urlList) || urlList.length === 0 || urlList.length > 10 ||
    urlList.some((value) => {
      try {
        const url = new URL(value);
        return url.protocol !== 'https:' || url.hostname !== EXPECTED_HOST || url.username || url.password;
      } catch {
        return true;
      }
    })
  ) {
    return res.status(400).json({ error: 'Invalid IndexNow payload.' });
  }

  try {
    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation, urlList }),
      signal: AbortSignal.timeout(15_000)
    });
    if (response.ok) return res.status(200).json({ success: true });
    console.warn('IndexNow returned HTTP', response.status);
    return res.status(502).json({ success: false, error: 'IndexNow rejected the submission.' });
  } catch (error) {
    console.error('IndexNow request failed:', error.message);
    return res.status(error.name === 'TimeoutError' ? 504 : 502).json({ success: false, error: 'IndexNow request failed.' });
  }
}

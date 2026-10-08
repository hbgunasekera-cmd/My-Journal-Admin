import { fetchTrustedImage, validateImageUrl } from '../server/api-security.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const rawUrl = typeof req.query?.url === 'string' ? req.query.url : '';
  if (!rawUrl) return res.status(400).json({ error: 'Missing image URL parameter.' });

  try {
    const parsedUrl = validateImageUrl(rawUrl);
    if (/^lh\d+\.googleusercontent\.com$/i.test(parsedUrl.hostname) && !parsedUrl.pathname.includes('=')) {
      parsedUrl.pathname += '=s0';
    }

    const { buffer, contentType } = await fetchTrustedImage(parsedUrl.toString());
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
    return res.status(200).send(buffer);
  } catch (error) {
    const status = error.name === 'AbortError' ? 504 : 400;
    console.warn('Instagram image proxy rejected a request:', error.message);
    return res.status(status).json({ error: 'Unable to fetch this image from an approved image host.' });
  }
}

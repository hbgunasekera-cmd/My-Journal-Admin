import { fetchTrustedImage, validateImageUrl } from '../server/api-security.js';
import sharp from 'sharp';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const rawUrl = typeof req.query?.url === 'string' ? req.query.url : '';
  if (!rawUrl) return res.status(400).json({ error: 'Missing image URL.' });

  try {
    const parsedUrl = validateImageUrl(rawUrl);
    if (/^lh\d+\.googleusercontent\.com$/i.test(parsedUrl.hostname)) {
      parsedUrl.pathname = `${parsedUrl.pathname.replace(/=[^/]*$/, '')}=s0`;
    }

    const { buffer, contentType } = await fetchTrustedImage(parsedUrl.toString());
    const shouldConvertToJpeg = req.query?.format === 'jpeg';
    const outputBuffer = shouldConvertToJpeg
      ? await sharp(buffer)
        .rotate()
        .resize({ width: 1440, height: 1440, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#fff' })
        .jpeg({ quality: 88 })
        .toBuffer()
      : buffer;

    res.setHeader('Content-Type', shouldConvertToJpeg ? 'image/jpeg' : contentType);
    res.setHeader('Content-Length', outputBuffer.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    return res.status(200).send(outputBuffer);
  } catch (error) {
    const status = error.name === 'AbortError' ? 504 : 400;
    console.warn('Cover image proxy rejected a request:', error.message);
    return res.status(status).json({ error: 'Unable to fetch this image from an approved image host.' });
  }
}

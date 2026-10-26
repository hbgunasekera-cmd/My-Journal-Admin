import { fetchTrustedImage, validateImageUrl } from '../server/api-security.js';
import { withApiErrorLogging } from '../server/error-logger.js';
import sharp from 'sharp';

async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
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
        .resize({
          width: 1080,
          height: 1080,
          fit: 'contain',
          background: '#fff'
        })
        .flatten({ background: '#fff' })
        .jpeg({ quality: 88 })
        .toBuffer()
      : buffer;

    res.setHeader('Content-Type', shouldConvertToJpeg ? 'image/jpeg' : contentType);
    res.setHeader('Content-Length', outputBuffer.length);
    if (shouldConvertToJpeg) res.setHeader('Content-Disposition', 'inline; filename="cover.jpg"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(outputBuffer);
  } catch (error) {
    const status = error.name === 'AbortError' ? 504 : 400;
    console.warn('Cover image proxy rejected a request:', error.message);
    return res.status(status).json({ error: 'Unable to fetch this image from an approved image host.' });
  }
}

export default withApiErrorLogging(handler);

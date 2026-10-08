const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_HOST_SUFFIXES = [
  '.googleusercontent.com',
  '.supabase.co',
  '.unsplash.com',
  '.pexels.com'
];
const IMAGE_HOSTS = new Set([
  'googleusercontent.com',
  'i.ytimg.com',
  'pbs.twimg.com',
  'cdn.bsky.app',
  'files.mastodon.social'
]);

export function isTrustedMutation(req) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization || req.headers.Authorization;
  if (cronSecret && authorization === `Bearer ${cronSecret}`) return true;

  const origin = req.headers.origin;
  if (!origin) return false;

  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }

  const trustedOrigins = new Set([
    'https://my-journal-admin.vercel.app',
    'https://my-journal-editor.vercel.app'
  ]);
  if (process.env.PUBLIC_APP_URL) {
    try {
      trustedOrigins.add(new URL(process.env.PUBLIC_APP_URL).origin);
    } catch {
      // Ignore malformed optional configuration.
    }
  }
  if (process.env.VERCEL_URL) {
    trustedOrigins.add(`https://${process.env.VERCEL_URL}`);
  }
  if (trustedOrigins.has(parsedOrigin.origin)) return true;

  const { hostname, port, protocol } = parsedOrigin;
  const localProtocol = protocol === 'http:' || protocol === 'https:';
  if (!localProtocol) return false;
  if (['localhost', '127.0.0.1', '[::1]'].includes(hostname) && ['5173', '3000', '4173'].includes(port)) {
    return true;
  }

  const octets = hostname.split('.').map(Number);
  const validIpv4 = octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255);
  const privateIpv4 = validIpv4 && (
    octets[0] === 10 ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
  );
  return Boolean(privateIpv4 && port === '5173');
}

export function requireTrustedMutation(req, res) {
  if (isTrustedMutation(req)) return true;
  res.setHeader('Cache-Control', 'no-store');
  res.status(403).json({ error: 'Request origin is not allowed.' });
  return false;
}

export function validateImageUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) {
    throw new Error('Image URL must be a valid URL under 2048 characters.');
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Image URL is invalid.');
  }

  const hostname = url.hostname.toLowerCase();
  const allowedHost = IMAGE_HOSTS.has(hostname) || IMAGE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
  const allowedPort = !url.port || url.port === '443' || (url.protocol === 'http:' && url.port === '80');
  if (!['https:', 'http:'].includes(url.protocol) || !allowedHost || url.username || url.password || !allowedPort) {
    throw new Error('Image host is not allowed.');
  }
  url.protocol = 'https:';
  url.port = '';
  return url;
}

export async function fetchTrustedImage(value) {
  let url = validateImageUrl(value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MyJournalImageFetcher/1.0)',
          'Accept': 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8'
        }
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirects === 3) throw new Error('Image redirect could not be followed safely.');
        url = validateImageUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw new Error(`Image host returned HTTP ${response.status}.`);

      const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (!contentType.startsWith('image/')) throw new Error('The requested resource is not an image.');
      if (contentLength > MAX_IMAGE_BYTES) throw new Error('Image exceeds the 10 MB limit.');
      if (!response.body) throw new Error('Image response had no body.');

      const reader = response.body.getReader();
      const chunks = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_IMAGE_BYTES) {
          await reader.cancel();
          throw new Error('Image exceeds the 10 MB limit.');
        }
        chunks.push(Buffer.from(value));
      }
      return { buffer: Buffer.concat(chunks), contentType, url: url.toString() };
    }
    throw new Error('Image redirect limit exceeded.');
  } finally {
    clearTimeout(timeout);
  }
}

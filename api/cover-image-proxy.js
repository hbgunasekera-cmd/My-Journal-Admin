// api/cover-image-proxy.js
export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  try {
    let targetUrl = url.replace(/^http:\/\//i, 'https://');

    // NEW LOGIC: Strip any existing size parameter and force the original size (=s0)
    // We split by '=' and take the first part, then append '=s0'
    const baseUrl = targetUrl.split('=')[0];
    targetUrl = `${baseUrl}=s0`;

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://photos.google.com/'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: "Google blocked the request." });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    // Cache the original image for longer since it's now full quality
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    
    return res.status(200).send(Buffer.from(arrayBuffer));

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
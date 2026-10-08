import { fetchTrustedImage, requireTrustedMutation } from '../server/api-security.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!requireTrustedMutation(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  const { tootText, coverImageUrl, locationName } = req.body || {};
  if (typeof tootText !== 'string' || !tootText.trim() || tootText.length > 500) {
    return res.status(400).json({ error: 'Post text must be between 1 and 500 characters.' });
  }

  const accessToken = process.env.MASTODON_ACCESS_TOKEN;
  if (!accessToken) return res.status(500).json({ error: 'Mastodon credentials are not configured.' });

  try {
    let mediaIds = [];
    if (coverImageUrl) {
      try {
        const { buffer, contentType } = await fetchTrustedImage(coverImageUrl);
        const formData = new FormData();
        formData.append('file', new Blob([buffer], { type: contentType }), 'cover');
        formData.append('description', `Scenic view of ${String(locationName || 'my journal entry').slice(0, 500)}`);

        const mediaUpload = await fetch('https://mastodon.social/api/v1/media', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: formData,
          signal: AbortSignal.timeout(20_000)
        });

        if (mediaUpload.ok) {
          const mediaData = await mediaUpload.json();
          if (mediaData.id) mediaIds = [mediaData.id];
        } else {
          console.warn('Mastodon media upload failed:', mediaUpload.status);
        }
      } catch (imageError) {
        console.warn('Mastodon image attachment was skipped:', imageError.message);
      }
    }

    const statusResponse = await fetch('https://mastodon.social/api/v1/statuses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: tootText.trim(), media_ids: mediaIds, visibility: 'public' }),
      signal: AbortSignal.timeout(20_000)
    });
    const result = await statusResponse.json();
    if (!statusResponse.ok) {
      return res.status(statusResponse.status).json({ error: result.error || 'Mastodon rejected the post.' });
    }

    return res.status(200).json({ ...result, imageAttached: mediaIds.length > 0 });
  } catch (error) {
    console.error('Mastodon request failed:', error.message);
    return res.status(error.name === 'TimeoutError' ? 504 : 502).json({ error: 'Mastodon request failed.' });
  }
}

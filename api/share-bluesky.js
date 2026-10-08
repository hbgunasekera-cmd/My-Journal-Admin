import { BskyAgent, RichText } from '@atproto/api';
import { fetchTrustedImage, requireTrustedMutation } from '../server/api-security.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!requireTrustedMutation(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  const { text, coverImageUrl, locationName } = req.body || {};
  if (typeof text !== 'string' || !text.trim() || Array.from(text).length > 300) {
    return res.status(400).json({ error: 'Bluesky post text must be between 1 and 300 characters.' });
  }

  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) {
    return res.status(500).json({ error: 'Bluesky credentials are not configured.' });
  }

  try {
    const agent = new BskyAgent({ service: 'https://bsky.social' });
    await agent.login({ identifier: handle, password });

    let imageBlob = null;
    if (coverImageUrl) {
      try {
        const { buffer, contentType } = await fetchTrustedImage(coverImageUrl);
        const uploadResponse = await agent.uploadBlob(buffer, { encoding: contentType });
        if (uploadResponse.success) imageBlob = uploadResponse.data.blob;
      } catch (imageError) {
        console.warn('Bluesky image attachment was skipped:', imageError.message);
      }
    }

    const richText = new RichText({ text: text.trim() });
    await richText.detectFacets(agent);

    const postRecord = {
      text: richText.text,
      facets: richText.facets,
      createdAt: new Date().toISOString()
    };
    if (imageBlob) {
      postRecord.embed = {
        $type: 'app.bsky.embed.images',
        images: [{
          alt: `Scenic view of ${String(locationName || 'my journal entry').slice(0, 1000)}`,
          image: imageBlob
        }]
      };
    }

    const response = await agent.post(postRecord);
    return res.status(200).json({ success: true, uri: response.uri, imageAttached: Boolean(imageBlob) });
  } catch (error) {
    console.error('Bluesky request failed:', error.message);
    return res.status(502).json({ error: 'Bluesky request failed.' });
  }
}

import { TwitterApi } from 'twitter-api-v2';
import { fetchTrustedImage, requireTrustedMutation } from '../server/api-security.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!requireTrustedMutation(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  const { text, link, imageUrl } = req.body || {};
  if (typeof text !== 'string' || !text.trim() || text.length > 2000) {
    return res.status(400).json({ error: 'Post text must be between 1 and 2000 characters.' });
  }
  let parsedLink;
  try {
    parsedLink = new URL(link);
  } catch {
    return res.status(400).json({ error: 'A valid gallery link is required.' });
  }
  if (parsedLink.protocol !== 'https:' || !['www.myjournalview.com', 'myjournalview.com'].includes(parsedLink.hostname)) {
    return res.status(400).json({ error: 'Gallery link host is not allowed.' });
  }

  const credentials = [
    process.env.TWITTER_API_KEY,
    process.env.TWITTER_API_SECRET,
    process.env.TWITTER_ACCESS_TOKEN,
    process.env.TWITTER_ACCESS_SECRET
  ];
  if (credentials.some((value) => !value)) {
    return res.status(503).json({ error: 'X credentials are not configured.' });
  }

  const client = new TwitterApi({
    appKey: credentials[0],
    appSecret: credentials[1],
    accessToken: credentials[2],
    accessSecret: credentials[3]
  });

  try {
    let mediaId;
    if (imageUrl) {
      const { buffer, contentType } = await fetchTrustedImage(imageUrl);
      mediaId = await client.v1.uploadMedia(buffer, { mimeType: contentType });
    }

    const fullStatus = `${text.trim()}\n\n🔗 Web: ${parsedLink.href}\n\n#MyJournal #SriLanka #Travel`;
    const tweetPayload = { text: fullStatus };
    if (mediaId) tweetPayload.media = { media_ids: [mediaId] };
    const { data } = await client.v2.tweet(tweetPayload);
    return res.status(200).json({ success: true, tweetId: data.id });
  } catch (error) {
    console.error('X post request failed:', error.data?.detail || error.message);
    return res.status(502).json({ error: 'X post request failed.' });
  }
}

import { createClient } from '@supabase/supabase-js';
import { validateImageUrl } from '../server/api-security.js';

const htmlEscape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[character]);
const xmlEscape = (value) => htmlEscape(value);
const cdata = (value) => `<![CDATA[${String(value ?? '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;

const generateCleanSlug = (text) => String(text || '')
  .toLowerCase()
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[–—]/g, '-')
  .replace(/[^a-z0-9\s-]/g, '')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-+|-+$/g, '');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({ error: 'RSS feed is not configured.' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: places, error } = await supabase
      .from('travel_bucket_list')
      .select('id, place_name, created_at, cover_photo_url, ai_article, status')
      .eq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;

    const rssItems = (places || []).map((place) => {
      const placeName = String(place.place_name || 'Untitled journal entry');
      const article = typeof place.ai_article === 'object'
        ? (place.ai_article?.story || place.ai_article?.content || '')
        : (place.ai_article || '');
      const firstParagraph = String(article).split(/\r?\n\r?\n|\r?\n/)[0]?.trim() || 'Explore this place in Sri Lanka.';
      const placeUrl = `https://www.myjournalview.com/gallery/${generateCleanSlug(placeName)}`;

      let imageUrl = '';
      try {
        imageUrl = validateImageUrl(place.cover_photo_url).toString();
      } catch {
        // Omit invalid images from the public feed.
      }

      const htmlContent = [
        imageUrl ? `<p><img src="${htmlEscape(imageUrl)}" alt="${htmlEscape(placeName)}" style="max-width:100%;height:auto" /></p>` : '',
        `<p>${htmlEscape(firstParagraph)}</p>`,
        `<p>📍Location: <a href="${htmlEscape(placeUrl)}">${htmlEscape(placeUrl)}</a></p>`,
        '<p><small>© My Journal | hasitha-gunasekera. Original photography available only at www.myjournalview.com</small></p>'
      ].filter(Boolean).join('\n');
      const publicationDate = new Date(place.created_at);
      const pubDate = Number.isNaN(publicationDate.getTime()) ? new Date().toUTCString() : publicationDate.toUTCString();

      return `
      <item>
        <title>${cdata(`✍️ New Journal Entry: ${placeName}`)}</title>
        <link>${xmlEscape(placeUrl)}</link>
        <description>${cdata(htmlContent)}</description>
        <pubDate>${xmlEscape(pubDate)}</pubDate>
        <guid isPermaLink="true">${xmlEscape(placeUrl)}</guid>
        ${imageUrl ? `<media:content url="${xmlEscape(imageUrl)}" medium="image">
          <media:credit role="photographer">Hasitha Gunasekera</media:credit>
          <media:copyright>My Journal | Sri Lanka</media:copyright>
        </media:content>` : ''}
      </item>`;
    }).join('');

    const feed = `<?xml version="1.0" encoding="UTF-8" ?>
      <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
        <channel>
          <title>My Journal | Sri Lanka Travel Gallery</title>
          <link>https://www.myjournalview.com/</link>
          <atom:link href="https://my-journal-admin.vercel.app/api/feed" rel="self" type="application/rss+xml" />
          <description>Official cinematic drone and iPhone photography by Hasitha Gunasekera.</description>
          <language>en-us</language>
          <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
          ${rssItems}
        </channel>
      </rss>`;

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(feed.trim());
  } catch (error) {
    console.error('RSS feed generation failed:', error.message);
    return res.status(500).json({ error: 'RSS feed could not be generated.' });
  }
}

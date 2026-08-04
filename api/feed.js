// api/feed.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_KEY
);

// Clean slug generator matching App.jsx routing logic
const generateCleanSlug = (text) => {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

export default async function handler(req, res) {
  // 1. CORS & Security (Allows Pinterest/RSS readers to fetch data)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 2. Data Fetching: Retrieve completed trips
  const { data: places, error } = await supabase
    .from('travel_bucket_list') 
    .select(`id, place_name, created_at, cover_photo_url, ai_article, status`)
    .eq('status', 'done') 
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return res.status(500).json({ error: error.message });

  // 3. Construct RSS Items formatted with Image, First Paragraph, and Gallery Link
  const rssItems = places.map(place => {
    // REVISED: Generate URL slugs matching generateCleanSlug in App.jsx
    const formattedName = generateCleanSlug(place.place_name);
    const rawUrl = `https://www.myjournalview.com/gallery/${formattedName}`;
    
    // Safety: Escape XML characters
    const escapedUrl = rawUrl.replace(/&/g, '&amp;');
    const escapedMediaUrl = (place.cover_photo_url || "").replace(/&/g, '&amp;');
    
    // Extract full text (supports string or object formatted ai_article)
    const articleText = typeof place.ai_article === 'object' 
      ? (place.ai_article?.story || place.ai_article?.content || '') 
      : (place.ai_article || '');
    
    // Extract only the first paragraph
    const firstParagraph = articleText.split(/\r?\n\r?\n|\r?\n/)[0]?.trim() || "Explore this hidden gem in Sri Lanka.";

    // Build item description layout: Cover Photo -> First Paragraph -> Location Link -> Copyright
    const formattedContent = `
      <p><img src="${escapedMediaUrl}" alt="${place.place_name}" style="max-width: 100%; height: auto;" /></p>
      <p>${firstParagraph}</p>
      <p>📍Location: <a href="${escapedUrl}">${escapedUrl}</a></p>
      <p><small>© My Journal | hasitha-gunasekera. Original photography available only at www.myjournalview.com</small></p>
    `.trim();

    return `
      <item>
        <title><![CDATA[✍️ New Journal Entry: ${place.place_name}]]></title>
        <link>${escapedUrl}</link>
        <description><![CDATA[${formattedContent}]]></description>
        <pubDate>${new Date(place.created_at).toUTCString()}</pubDate>
        
        <guid isPermaLink="true">${escapedUrl}</guid>
        
        <media:content url="${escapedMediaUrl}" medium="image">
           <media:credit role="photographer">Hasitha Gunasekera</media:credit>
           <media:copyright>My Journal | Sri Lanka</media:copyright>
        </media:content>
      </item>`;
  }).join('');

  // 4. Construct the Full RSS XML
  const rssFeed = `<?xml version="1.0" encoding="UTF-8" ?>
    <rss version="2.0" 
         xmlns:media="http://search.yahoo.com/mrss/" 
         xmlns:content="http://purl.org/rss/1.0/modules/content/"
         xmlns:atom="http://www.w3.org/2005/Atom">
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

  // 5. Headers & Delivery
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate'); 
  res.setHeader('Content-Type', 'application/xml; charset=utf-8'); 
  res.status(200).send(rssFeed.trim());
}
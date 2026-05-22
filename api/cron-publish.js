// api/cron-publish.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Security Verification
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized invocation' });
  }

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);

  try {
    // 1. FETCH LIVE CREDENTIALS FROM VAULT
    const { data: creds } = await supabase.from('system_credentials').select('*');
    const instagramToken = creds.find(c => c.key === 'instagram_access_token')?.value;
    const threadsToken = creds.find(c => c.key === 'threads_access_token')?.value;

    // 2. TARGET OLDEST ELIGIBLE COMPLETED LOCATION
    const { data: places, error: fetchError } = await supabase
      .from('travel_bucket_list')
      .select('*')
      .in('status', ['done'])
      .not('ai_article', 'is', null)
      .or('published_instagram_at.is.null,published_threads_at.is.null,published_masto_at.is.null,published_bsky_at.is.null')
      .order('created_at', { ascending: true })
      .limit(1);

    if (fetchError || !places || places.length === 0) {
      return res.status(200).json({ status: "Queue clean. All entries processed." });
    }

    const p = places[0];
    const locationName = p.place_name || "Island Vignette";
    const shareLink = `https://my-journal-view.vercel.app/?place=${encodeURIComponent(locationName)}`;

    // 3. TEXT ENGINE PARSING
    let tags = new Set(["#MyJournal", "#SriLanka", "#TravelSriLanka", "#TravelPhotography"]);
    const cat = (p.category || "").toLowerCase();
    const story = (p.ai_article?.story || p.ai_article?.description || "").toLowerCase();

    if (cat === "waterfall") tags.add("#WaterfallHunting").add("#NaturePhotography");
    if (["mountain", "trail", "viewpoint"].includes(cat)) tags.add("#LandscapePhotography").add("#Adventure");
    if (story.includes("iphone") || story.includes("mobile")) tags.add("#ShotOniPhone").add("#MobilePhotography");
    if (story.includes("camp") || story.includes("tent") || story.includes("trek")) tags.add("#Camping").add("#Outdoors");

    const coreTags = Array.from(tags).join(" ");
    const cleanText = story.replace(/[#*]/g, '').trim();
    const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
    let metaDesc = sentences[0] + (sentences[1] ? " " + sentences[1] : "");

    const metaText = `📍 ${locationName}\n\n${metaDesc.trim()}\n\n🔗 Explore more entries:\n${shareLink}\n\n${coreTags}`;
    const mastoText = `${locationName}\n\n${metaDesc.trim()}\n\n📍Location: ${shareLink}\n\n${coreTags}`;
    const bskyTags = Array.from(tags).slice(0, 3).join(" ");
    const bskyText = `${locationName}\n\n${sentences[0].trim().substring(0, 140)}\n\n📍Location: ${shareLink}\n\n${bskyTags}`;

    // 4. PARALLEL DEPLOYMENT ROUTINES
    const hostDomain = `https://${process.env.VERCEL_URL}`;
    const publishPromises = [];
    const successfulUpdates = {};
    const now = new Date().toISOString();

    // A. Instagram Pipeline
    if (!p.published_instagram_at && instagramToken) {
      publishPromises.push(
        fetch(`${hostDomain}/api/share-meta`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: 'instagram', text: metaText, imageUrl: p.cover_photo_url, fbAccessToken: instagramToken })
        }).then(res => { if (res.ok) successfulUpdates.published_instagram_at = now; })
      );
    }

    // B. Threads Pipeline
    if (!p.published_threads_at && threadsToken) {
      publishPromises.push(
        fetch(`${hostDomain}/api/share-meta`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: 'threads', text: metaText, imageUrl: p.cover_photo_url, threadsAccessToken: threadsToken })
        }).then(res => { if (res.ok) successfulUpdates.published_threads_at = now; })
      );
    }

    // C. Mastodon Pipeline
    if (!p.published_masto_at) {
      publishPromises.push(
        fetch(`${hostDomain}/api/share-mastodon`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tootText: mastoText, coverImageUrl: p.cover_photo_url, locationName })
        }).then(res => { if (res.ok) successfulUpdates.published_masto_at = now; })
      );
    }

    // D. Bluesky Pipeline
    if (!p.published_bsky_at) {
      publishPromises.push(
        fetch(`${hostDomain}/api/share-bluesky`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: bskyText, coverImageUrl: p.cover_photo_url, locationName })
        }).then(res => { if (res.ok) successfulUpdates.published_bsky_at = now; })
      );
    }

    await Promise.allSettled(publishPromises);

    // 5. UPDATE PROGRESS TRACKING
    if (Object.keys(successfulUpdates).length > 0) {
      await supabase.from('travel_bucket_list').update(successfulUpdates).eq('id', p.id);
    }

    return res.status(200).json({ status: "Success", location: p.place_name, posted: Object.keys(successfulUpdates) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
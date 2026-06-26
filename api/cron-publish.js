// api/cron-publish.js
import { createClient } from '@supabase/supabase-js';

const PLATFORM_COLUMNS = {
  instagram: 'published_instagram_at',
  threads: 'published_threads_at',
  mastodon: 'published_masto_at',
  bluesky: 'published_bsky_at'
};

export default async function handler(req, res) {
  // 0. CRITICAL: Force Vercel to never cache this GET request. 
  // This guarantees your function runs and writes logs on every single trigger.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  // 1. SECURITY CHECK: Verify Cron Token Secret
  const authHeader = req.headers['authorization'] || req.headers.authorization;
  
  // Alert logs explicitly if the environment variable hasn't been set up yet
  if (!process.env.CRON_SECRET) {
    console.error("CRON_SECRET environment variable is missing in Vercel settings.");
    return res.status(500).json({ error: "CRON_SECRET configuration required." });
  }

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.warn("Unauthorized cron execution attempt blocked.");
    return res.status(401).json({ error: 'Unauthorized invocation' });
  }

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);

  try {
    // 2. FETCH ACTIVE ACCESS TOKENS FROM THE SYSTEM VAULT
    const { data: creds } = await supabase.from('system_credentials').select('*');
    const instagramToken = creds?.find(c => c.key === 'instagram_access_token')?.value;
    const threadsToken = creds?.find(c => c.key === 'threads_access_token')?.value;

    // 3. SECURE TARGET: Select exactly ONE eligible unpublished location
    const { data: places, error: fetchError } = await supabase
      .from('travel_bucket_list')
      .select('*')
      .eq('status', 'done')
      .not('ai_article', 'is', null)
      .or('published_instagram_at.is.null,published_threads_at.is.null,published_masto_at.is.null,published_bsky_at.is.null')
      .order('created_at', { ascending: true })
      .limit(1);

    if (fetchError || !places || places.length === 0) {
      return res.status(200).json({ status: "Queue clean. All entries processed." });
    }

    const p = places[0];
    const locationName = p.place_name || "Island Vignette";
    const shareLink = `https://www.myjournalview.com/?place=${encodeURIComponent(locationName)}`;

    // 4. CLEAN AND EXTRACT CONTENT
    const storyText = p.ai_article?.story || p.ai_article?.description || "";
    const cleanText = storyText.replace(/[#*]/g, '').trim();
    const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];

    // 5. COMPUTE DYNAMIC TARGET HASHTAGS
    let tagSet = new Set(["#MyJournal", "#SriLanka", "#TravelSriLanka", "#TravelPhotography"]);
    const category = (p.category || "").toLowerCase();
    const storyLower = storyText.toLowerCase();

    if (category === "waterfall") tagSet.add("#WaterfallHunting").add("#NaturePhotography");
    if (["mountain", "trail", "viewpoint"].includes(category)) tagSet.add("#LandscapePhotography").add("#Adventure");
    if (storyLower.includes("iphone") || storyLower.includes("mobile")) tagSet.add("#ShotOniPhone").add("#MobilePhotography");
    if (storyLower.includes("camp") || storyLower.includes("tent") || storyLower.includes("trek")) tagSet.add("#Camping").add("#Outdoors");

    const fullHashtags = Array.from(tagSet).join(" ");

    // 6. PLATFORM TEXT GENERATORS WITH CHARACTER BUDGETS
    const buildMetaText = (limit) => {
      const fixedCost = locationName.length + shareLink.length + fullHashtags.length + 40;
      const budget = Math.max(0, limit - fixedCost - 5);
      let summary = "";
      for (let s of sentences) {
        if ((summary + " " + s.trim()).trim().length <= budget) summary = (summary + " " + s.trim()).trim();
        else break;
      }
      if (!summary && cleanText) summary = cleanText.substring(0, budget) + "...";
      return `📸 ${locationName}\n\n${summary}\n\n🌐 Explore more entries:\n${shareLink}\n\n${fullHashtags}`;
    };

    const buildMastodonText = () => {
      const fixedCost = locationName.length + 4 + 7 + 23 + 4 + fullHashtags.length;
      const budget = 500 - fixedCost - 5;
      let summary = "";
      for (let s of sentences) {
        if ((summary + " " + s.trim()).trim().length <= budget) summary = (summary + " " + s.trim()).trim();
        else break;
      }
      if (!summary && cleanText) summary = cleanText.substring(0, budget) + "...";
      return `${locationName}\n\n${summary}\n\n📍Location: ${shareLink}\n\n${fullHashtags}`;
    };

    const buildBlueskyText = () => {
      const bskyTags = Array.from(tagSet).slice(0, 3).join(" ");
      const fixedCost = locationName.length + 4 + 7 + shareLink.length + 4 + bskyTags.length;
      const budget = 300 - fixedCost - 5;
      let summary = "";
      for (let s of sentences) {
        if ((summary + " " + s.trim()).trim().length <= budget) summary = (summary + " " + s.trim()).trim();
        else break;
      }
      if (!summary && cleanText) summary = cleanText.substring(0, budget) + "...";
      return `${locationName}\n\n${summary}\n\n📍Location: ${shareLink}\n\n${bskyTags}`;
    };

    // 7. ASYNCHRONOUS ENGINE DISPATCH PIPELINES
    const hostDomain = `https://${process.env.VERCEL_URL || req.headers.host}`;
    const publishPromises = [];
    const successfulUpdates = {};
    const nowISO = new Date().toISOString();

    // Pipeline A: Instagram
    if (!p.published_instagram_at && instagramToken) {
      publishPromises.push(
        fetch(`${hostDomain}/api/share-meta`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: 'instagram', text: buildMetaText(2200), imageUrl: p.cover_photo_url, fbAccessToken: instagramToken })
        }).then(res => { if (res.ok) successfulUpdates[PLATFORM_COLUMNS.instagram] = nowISO; })
      );
    }

    // Pipeline B: Threads
    if (!p.published_threads_at && threadsToken) {
      publishPromises.push(
        fetch(`${hostDomain}/api/share-meta`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: 'threads', text: buildMetaText(500), imageUrl: p.cover_photo_url, threadsAccessToken: threadsToken })
        }).then(res => { if (res.ok) successfulUpdates[PLATFORM_COLUMNS.threads] = nowISO; })
      );
    }

    // Pipeline C: Mastodon
    if (!p.published_masto_at) {
      publishPromises.push(
        fetch(`${hostDomain}/api/share-mastodon`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tootText: buildMastodonText(), coverImageUrl: p.cover_photo_url, locationName })
        }).then(res => { if (res.ok) successfulUpdates[PLATFORM_COLUMNS.mastodon] = nowISO; })
      );
    }

    // Pipeline D: Bluesky
    if (!p.published_bsky_at) {
      publishPromises.push(
        fetch(`${hostDomain}/api/share-bluesky`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: buildBlueskyText(), coverImageUrl: p.cover_photo_url, locationName })
        }).then(res => { if (res.ok) successfulUpdates[PLATFORM_COLUMNS.bluesky] = nowISO; })
      );
    }

    await Promise.allSettled(publishPromises);

    // 8. COHESIVE TRANSACTION UPDATE
    if (Object.keys(successfulUpdates).length > 0) {
      await supabase
        .from('travel_bucket_list')
        .update(successfulUpdates)
        .eq('id', p.id);
    }

    return res.status(200).json({
      status: "Success",
      location: locationName,
      posted: Object.keys(successfulUpdates)
    });

  } catch (error) {
    console.error("Cron Processing Engine Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
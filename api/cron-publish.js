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

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  // 1. SECURITY CHECK: Verify Cron Token Secret
  const authHeader = req.headers['authorization'] || req.headers.authorization;
  
  // Alert logs explicitly if the environment variable hasn't been set up yet
  if (!process.env.CRON_SECRET) {
    console.error("CRON_SECRET environment variable is missing in Vercel settings.");
    return res.status(500).json({ error: "CRON_SECRET configuration required." });
  }

  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.warn("Unauthorized cron execution attempt blocked.");
    return res.status(401).json({ error: 'Unauthorized invocation' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({ error: 'Supabase credentials are not configured.' });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // 2. FETCH ACTIVE ACCESS TOKENS FROM THE SYSTEM VAULT
    const { data: creds, error: credentialsError } = await supabase.from('system_credentials').select('key, value');
    if (credentialsError) throw credentialsError;
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

    if (fetchError) throw fetchError;
    if (!places || places.length === 0) {
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
    const hostDomain = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://my-journal-admin.vercel.app';
    const publishJobs = [];
    const successfulUpdates = {};
    const failedPlatforms = [];
    const nowISO = new Date().toISOString();

    const dispatch = (platform, path, payload, column) => {
      publishJobs.push({
        platform,
        column,
        promise: fetch(`${hostDomain}${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.CRON_SECRET}`
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30_000)
        })
      });
    };

    // Pipeline A: Instagram
    if (!p.published_instagram_at && instagramToken) {
      dispatch('instagram', '/api/share-meta', {
        platform: 'instagram', text: buildMetaText(2200), imageUrl: p.cover_photo_url
      }, PLATFORM_COLUMNS.instagram);
    }

    // Pipeline B: Threads
    if (!p.published_threads_at && threadsToken) {
      dispatch('threads', '/api/share-meta', {
        platform: 'threads', text: buildMetaText(500), imageUrl: p.cover_photo_url
      }, PLATFORM_COLUMNS.threads);
    }

    // Pipeline C: Mastodon
    if (!p.published_masto_at) {
      dispatch('mastodon', '/api/share-mastodon', {
        tootText: buildMastodonText(), coverImageUrl: p.cover_photo_url, locationName
      }, PLATFORM_COLUMNS.mastodon);
    }

    // Pipeline D: Bluesky
    if (!p.published_bsky_at) {
      dispatch('bluesky', '/api/share-bluesky', {
        text: buildBlueskyText(), coverImageUrl: p.cover_photo_url, locationName
      }, PLATFORM_COLUMNS.bluesky);
    }

    const publishResults = await Promise.allSettled(publishJobs.map((job) => job.promise));
    publishResults.forEach((result, index) => {
      const job = publishJobs[index];
      if (result.status === 'fulfilled' && result.value.ok) {
        successfulUpdates[job.column] = nowISO;
      } else {
        failedPlatforms.push(job.platform);
      }
    });

    // 8. COHESIVE TRANSACTION UPDATE
    if (Object.keys(successfulUpdates).length > 0) {
      const { error: updateError } = await supabase
        .from('travel_bucket_list')
        .update(successfulUpdates)
        .eq('id', p.id);
      if (updateError) throw updateError;
    }

    return res.status(200).json({
      status: "Success",
      location: locationName,
      posted: Object.keys(successfulUpdates),
      failed: failedPlatforms
    });

  } catch (error) {
    console.error("Cron Processing Engine Error:", error);
    return res.status(500).json({ error: error.message });
  }
}

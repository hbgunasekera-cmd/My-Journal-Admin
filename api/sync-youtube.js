import { requireTrustedMutation } from '../server/api-security.js';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      error: "Method not allowed",
    });
  }
  if (!requireTrustedMutation(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  const { targetUrl } = req.body || {};
  const API_KEY = process.env.YOUTUBE_API_KEY;

  // Check API key configuration
  if (!API_KEY) {
    console.error("YouTube Sync Error: YOUTUBE_API_KEY is missing");

    return res.status(500).json({
      error: "YOUTUBE_API_KEY is not configured on the server",
    });
  }

  // Check target URL
  if (typeof targetUrl !== 'string' || targetUrl.length > 300) {
    return res.status(400).json({
      error: "Target URL is required",
    });
  }

  try {
    // ---------------------------------------------------------
    // 1. Extract YouTube handle
    // ---------------------------------------------------------
    let requestedUrl;
    try {
      requestedUrl = new URL(targetUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid YouTube channel URL.' });
    }
    if (
      requestedUrl.protocol !== 'https:' ||
      !['youtube.com', 'www.youtube.com'].includes(requestedUrl.hostname) ||
      requestedUrl.pathname.replace(/\/$/, '') !== '/@myjournalview'
    ) {
      return res.status(400).json({
        error: "Only the configured @myjournalview channel can be synchronized.",
      });
    }

    const handle = '@myjournalview';

    console.log("YouTube Sync: Resolving channel:", handle);

    // ---------------------------------------------------------
    // 2. Resolve YouTube Channel
    // ---------------------------------------------------------
    const channelUrl =
      `https://www.googleapis.com/youtube/v3/channels` +
      `?part=contentDetails` +
      `&forHandle=${encodeURIComponent(handle)}` +
      `&key=${encodeURIComponent(API_KEY)}`;

    const channelRes = await fetch(channelUrl, { signal: AbortSignal.timeout(15_000) });

    let channelData;

    try {
      channelData = await channelRes.json();
    } catch (jsonError) {
      console.error(
        "YouTube Channel API returned invalid JSON:",
        jsonError
      );

      return res.status(502).json({
        error: `YouTube API returned an invalid response (HTTP ${channelRes.status})`,
      });
    }

    console.log(
      "YouTube Channel API Status:",
      channelRes.status
    );

    // IMPORTANT:
    // Return the actual Google API error instead of hiding it.
    if (!channelRes.ok) {
      console.error("YouTube Channel API returned HTTP", channelRes.status);
      return res.status(502).json({ error: 'YouTube channel lookup failed.' });
    }

    // ---------------------------------------------------------
    // 3. Validate Channel
    // ---------------------------------------------------------
    if (!channelData?.items?.length) {
      return res.status(404).json({
        error: `YouTube channel not found for handle ${handle}`,
      });
    }

    const channel = channelData.items[0];

    const uploadsPlaylistId =
      channel?.contentDetails?.relatedPlaylists?.uploads;

    if (!uploadsPlaylistId) {
      return res.status(404).json({
        error: "YouTube uploads playlist not found",
      });
    }

    console.log(
      "YouTube Sync: Uploads playlist:",
      uploadsPlaylistId
    );

    // ---------------------------------------------------------
    // 4. Get ALL Videos From Uploads Playlist (Paginated Loop)
    // ---------------------------------------------------------
    const videos = [];
    let pageToken = "";

    do {
      let playlistUrl =
        `https://www.googleapis.com/youtube/v3/playlistItems` +
        `?part=snippet` +
        `&maxResults=50` +
        `&playlistId=${encodeURIComponent(uploadsPlaylistId)}` +
        `&key=${encodeURIComponent(API_KEY)}`;

      if (pageToken) {
        playlistUrl += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      const playlistRes = await fetch(playlistUrl, { signal: AbortSignal.timeout(15_000) });

      let playlistData;

      try {
        playlistData = await playlistRes.json();
      } catch (jsonError) {
        console.error(
          "YouTube Playlist API returned invalid JSON:",
          jsonError
        );

        return res.status(502).json({
          error: `YouTube API returned an invalid response (HTTP ${playlistRes.status})`,
        });
      }

      console.log(
        "YouTube Playlist API Status:",
        playlistRes.status
      );

      // IMPORTANT:
      // Expose actual Google API errors.
      if (!playlistRes.ok) {
        console.error("YouTube playlist API returned HTTP", playlistRes.status);
        return res.status(502).json({ error: 'YouTube playlist lookup failed.' });
      }

      // ---------------------------------------------------------
      // 5. Convert YouTube Items To App Video Format
      // ---------------------------------------------------------
      const pageVideos = (playlistData?.items || [])
        .map((item) => {
          const videoId =
            item?.snippet?.resourceId?.videoId;

          // Ignore malformed playlist items
          if (!videoId) {
            return null;
          }

          return {
            title:
              item?.snippet?.title ||
              "Untitled Video",

            url:
              `https://www.youtube.com/watch?v=${videoId}`,

            thumbnail:
              item?.snippet?.thumbnails?.high?.url ||
              item?.snippet?.thumbnails?.medium?.url ||
              item?.snippet?.thumbnails?.default?.url ||
              null,
          };
        })
        .filter(Boolean);

      videos.push(...pageVideos);

      // Check for next page token
      pageToken = videos.length < 1000 ? (playlistData?.nextPageToken || "") : "";

    } while (pageToken);

    // ---------------------------------------------------------
    // 6. Return Results
    // ---------------------------------------------------------
    console.log(
      `YouTube Sync: Successfully fetched total ${videos.length} videos/shorts`
    );

    return res.status(200).json({
      videos,
    });

  } catch (error) {
    // ---------------------------------------------------------
    // 7. Unexpected Server Error
    // ---------------------------------------------------------
    console.error("YouTube API proxy request failed:", error.message);

    return res.status(500).json({
      error: error?.name === 'TimeoutError' ? 'YouTube request timed out.' : 'YouTube sync failed.',
    });
  }
}

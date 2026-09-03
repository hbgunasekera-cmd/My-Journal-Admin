export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

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
  if (!targetUrl) {
    return res.status(400).json({
      error: "Target URL is required",
    });
  }

  try {
    // ---------------------------------------------------------
    // 1. Extract YouTube handle
    // ---------------------------------------------------------
    const handleMatch = targetUrl.match(/@[\w-]+/);

    if (!handleMatch) {
      return res.status(400).json({
        error: "Invalid YouTube handle URL format",
      });
    }

    const handle = handleMatch[0];

    console.log("YouTube Sync: Resolving channel:", handle);

    // ---------------------------------------------------------
    // 2. Resolve YouTube Channel
    // ---------------------------------------------------------
    const channelUrl =
      `https://www.googleapis.com/youtube/v3/channels` +
      `?part=contentDetails` +
      `&forHandle=${encodeURIComponent(handle)}` +
      `&key=${encodeURIComponent(API_KEY)}`;

    const channelRes = await fetch(channelUrl);

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
      console.error(
        "YouTube Channel API Error:",
        channelData
      );

      return res.status(channelRes.status).json({
        error:
          channelData?.error?.message ||
          `YouTube API returned HTTP ${channelRes.status}`,
        details:
          channelData?.error?.errors || null,
      });
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
    // 4. Get Videos From Uploads Playlist
    // ---------------------------------------------------------
    const playlistUrl =
      `https://www.googleapis.com/youtube/v3/playlistItems` +
      `?part=snippet` +
      `&maxResults=50` +
      `&playlistId=${encodeURIComponent(uploadsPlaylistId)}` +
      `&key=${encodeURIComponent(API_KEY)}`;

    const playlistRes = await fetch(playlistUrl);

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
      console.error(
        "YouTube Playlist API Error:",
        playlistData
      );

      return res.status(playlistRes.status).json({
        error:
          playlistData?.error?.message ||
          `YouTube API returned HTTP ${playlistRes.status}`,
        details:
          playlistData?.error?.errors || null,
      });
    }

    // ---------------------------------------------------------
    // 5. Convert YouTube Items To App Video Format
    // ---------------------------------------------------------
    const videos = (playlistData?.items || [])
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

    // ---------------------------------------------------------
    // 6. Return Results
    // ---------------------------------------------------------
    console.log(
      `YouTube Sync: Successfully fetched ${videos.length} videos`
    );

    return res.status(200).json({
      videos,
    });

  } catch (error) {
    // ---------------------------------------------------------
    // 7. Unexpected Server Error
    // ---------------------------------------------------------
    console.error(
      "YouTube API Proxy Error:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Internal server error while syncing YouTube content",
    });
  }
}
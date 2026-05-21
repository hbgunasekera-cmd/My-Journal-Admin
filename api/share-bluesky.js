// api/share-bluesky.js
import { BskyAgent, RichText } from '@atproto/api';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, coverImageUrl, locationName } = req.body;
  
  // Credentials from Vercel Environment Variables
  const handle = process.env.BLUESKY_HANDLE; 
  const password = process.env.BLUESKY_APP_PASSWORD;

  // 0. DEBUG: Validate Presence
  if (!handle || !password) {
    console.error("Bluesky Error: Missing credentials in ENV.");
    return res.status(500).json({ error: "Bluesky credentials missing in ENV." });
  }

  try {
    const agent = new BskyAgent({ service: 'https://bsky.social' });
    
    // 1. AUTHENTICATE
    await agent.login({ identifier: handle, password: password });

    let imageBlob = null;

    // 2. UPLOAD IMAGE BLOB
    if (coverImageUrl) {
      try {
        const imageResp = await fetch(coverImageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (imageResp.ok) {
          const arrayBuffer = await imageResp.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          const mimeType = coverImageUrl.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
          const uploadResponse = await agent.uploadBlob(buffer, { encoding: mimeType });
          
          if (uploadResponse.success) {
            imageBlob = uploadResponse.data.blob;
          }
        } else {
            console.warn("Bluesky Image Fetch failed, proceeding with text only.");
        }
      } catch (e) {
        console.error("Bluesky Image Processing Exception:", e.message);
      }
    }

    // 3. PARSE RICH TEXT
    const rt = new RichText({ text: text });
    await rt.detectFacets(agent); 

    // 4. BUILD POST RECORD
    const postRecord = {
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
    };

    if (imageBlob) {
      postRecord.embed = {
        $type: 'app.bsky.embed.images',
        images: [{
          alt: `Scenic view of ${locationName || 'my journal entry'}`,
          image: imageBlob
        }]
      };
    }

    // 5. PUBLISH
    const response = await agent.post(postRecord);
    
    // 206 status indicates text was posted but image was skipped/failed
    const finalStatus = (coverImageUrl && !imageBlob) ? 206 : 200;
    return res.status(finalStatus).json({ 
        success: true, 
        uri: response.uri,
        imageAttached: !!imageBlob
    });

  } catch (error) {
    console.error("Bluesky Handler Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
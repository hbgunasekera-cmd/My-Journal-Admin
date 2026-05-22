// api/share-meta.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // 1. Unpack data payloads sent by your React client or automation engine
  const { platform, text, imageUrl, fbAccessToken, threadsAccessToken } = req.body;
  
  // 2. Read global environment variables from Vercel
  const IG_USER_ID = process.env.IG_USER_ID;

  // Initialize the Supabase database connection
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_KEY
  );

  try {
    if (!imageUrl) {
      return res.status(400).json({ error: "Missing required imageUrl payload attribute." });
    }

    // Reflects your unified Vercel project domain name to target the active proxy
    const hostDomain = "https://my-journal-admin.vercel.app";
    const unblockableImageUrl = `${hostDomain}/api/ig-image-proxy?url=${encodeURIComponent(imageUrl)}&ignore=/image.jpg`;

    // ==========================================
    // INSTAGRAM ROUTE (Standalone Graph Engine)
    // ==========================================
    if (platform === 'instagram') {
      let tokenSource = "vercel";
      let ACCESS_TOKEN = fbAccessToken || process.env.META_ACCESS_TOKEN;
      
      // Pre-flight Fallback: If Vercel variables are completely missing, query Supabase
      if (!ACCESS_TOKEN) {
        const { data } = await supabase.from('system_credentials').select('value').eq('key', 'instagram_access_token').single();
        ACCESS_TOKEN = data?.value;
        tokenSource = "supabase";
      }

      if (!ACCESS_TOKEN) return res.status(400).json({ error: "Missing Instagram token across Vercel and Supabase vaults." });
      if (!IG_USER_ID) return res.status(400).json({ error: "Missing IG_USER_ID environment configuration." });

      // Step 1: Create Instagram Media Container
      const igCreateUrl = `https://graph.instagram.com/v21.0/${IG_USER_ID}/media`;
      let createRes = await fetch(igCreateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: unblockableImageUrl,
          caption: text,
          access_token: ACCESS_TOKEN
        })
      });
      
      let createData = await createRes.json();
      
      // Mid-flight Recovery: If the Vercel variable failed due to auth/expiry, fall back to Supabase and retry
      if (createData.error && tokenSource === "vercel" && !fbAccessToken) {
        const errMsg = createData.error.message ? createData.error.message.toLowerCase() : "";
        const isAuthError = createData.error.code === 190 || 
                            createData.error.type === 'OAuthException' || 
                            errMsg.includes('token') || 
                            errMsg.includes('session') || 
                            errMsg.includes('auth');
        
        if (isAuthError) {
          console.warn("Instagram Vercel token failed or expired. Initiating Supabase vault recovery fallback...");
          const { data } = await supabase.from('system_credentials').select('value').eq('key', 'instagram_access_token').single();
          if (data?.value) {
            ACCESS_TOKEN = data.value;
            tokenSource = "supabase";
            
            // Retry original API container initialization with the fresh token
            createRes = await fetch(igCreateUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                image_url: unblockableImageUrl,
                caption: text,
                access_token: ACCESS_TOKEN
              })
            });
            createData = await createRes.json();
          }
        }
      }
      
      // Diagnostic check post-fallback execution
      if (createData.error) {
        return res.status(400).json({
          error: `Meta rejected container creation: ${createData.error.message}`,
          code: createData.error.code,
          subcode: createData.error.error_subcode
        });
      }
      
      if (!createData.id) {
        return res.status(500).json({ error: "No Media ID returned from Meta framework payload mappings." });
      }
      
      // Meta CDN synchronization delay window for image processing
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Step 2: Publish the Container live
      const igPublishUrl = `https://graph.instagram.com/v21.0/${IG_USER_ID}/media_publish`;
      const publishRes = await fetch(igPublishUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: createData.id, access_token: ACCESS_TOKEN })
      });

      const publishData = await publishRes.json();
      if (publishData.error) return res.status(400).json({ error: publishData.error.message });
      
      return res.status(200).json({ success: true, id: publishData.id });

    // ==========================================
    // THREADS ROUTE (Dedicated Threads API Engine)
    // ==========================================
    } else if (platform === 'threads') {
      let tokenSource = "vercel";
      let ACCESS_TOKEN = threadsAccessToken || process.env.THREADS_ACCESS_TOKEN;

      // Pre-flight Fallback: If Vercel variables are completely missing, query Supabase
      if (!ACCESS_TOKEN) {
        const { data } = await supabase.from('system_credentials').select('value').eq('key', 'threads_access_token').single();
        ACCESS_TOKEN = data?.value;
        tokenSource = "supabase";
      }

      if (!ACCESS_TOKEN) return res.status(400).json({ error: "Authorization failed: Missing Threads token across Vercel and Supabase vaults." });

      // Step 1: Create Threads Media Container
      const threadsCreateUrl = `https://graph.threads.net/v1.0/me/threads`;
      let createRes = await fetch(threadsCreateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'IMAGE',
          image_url: unblockableImageUrl,
          text: text,
          access_token: ACCESS_TOKEN
        })
      });

      let createData = await createRes.json();
      
      // Mid-flight Recovery: If the Vercel variable failed due to auth/expiry, fall back to Supabase and retry
      if (createData.error && tokenSource === "vercel" && !threadsAccessToken) {
        const errMsg = createData.error.message ? createData.error.message.toLowerCase() : "";
        const isAuthError = createData.error.code === 190 || 
                            errMsg.includes('token') || 
                            errMsg.includes('session') || 
                            errMsg.includes('auth');
        
        if (isAuthError) {
          console.warn("Threads Vercel token failed or expired. Initiating Supabase vault recovery fallback...");
          const { data } = await supabase.from('system_credentials').select('value').eq('key', 'threads_access_token').single();
          if (data?.value) {
            ACCESS_TOKEN = data.value;
            tokenSource = "supabase";
            
            // Retry original Threads container initialization with the fresh token
            createRes = await fetch(threadsCreateUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                media_type: 'IMAGE',
                image_url: unblockableImageUrl,
                text: text,
                access_token: ACCESS_TOKEN
              })
            });
            createData = await createRes.json();
          }
        }
      }

      if (createData.error) return res.status(400).json({ error: createData.error.message });
      if (!createData.id) return res.status(500).json({ error: "Failed creating Threads post container allocation." });

      // Meta CDN synchronization delay window
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Step 2: Publish the Threads Container live
      const threadsPublishUrl = `https://graph.threads.net/v1.0/me/threads_publish`;
      const publishRes = await fetch(threadsPublishUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: createData.id,
          access_token: ACCESS_TOKEN
        })
      });

      const publishData = await publishRes.json();
      if (publishData.error) return res.status(400).json({ error: publishData.error.message });
      return res.status(200).json({ success: true, id: publishData.id });
    }

    return res.status(400).json({ error: "Unsupported platform selection." });

  } catch (error) {
    console.error("Serverless Function Runtime Exception:", error);
    
    let clientErrorMessage = error.message;
    if (clientErrorMessage.includes("access token") || clientErrorMessage.includes("session")) {
      clientErrorMessage = "The session has invalidated. Please check or renew your 60-day authorization tokens.";
    }
    
    return res.status(500).json({ error: clientErrorMessage });
  }
}
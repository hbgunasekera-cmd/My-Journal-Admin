// api/share-meta.js
import { createClient } from '@supabase/supabase-js';
import { requireTrustedMutation, validateImageUrl } from '../server/api-security.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!requireTrustedMutation(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  const { platform, text, imageUrl } = req.body || {};
  if (!['instagram', 'threads'].includes(platform)) {
    return res.status(400).json({ error: 'Unsupported platform selection.' });
  }
  const maxTextLength = platform === 'threads' ? 500 : 2200;
  if (typeof text !== 'string' || !text.trim() || text.length > maxTextLength) {
    return res.status(400).json({ error: `Post text must be between 1 and ${maxTextLength} characters.` });
  }
  if (typeof imageUrl !== 'string') return res.status(400).json({ error: 'Missing image URL.' });
  try {
    validateImageUrl(imageUrl);
  } catch {
    return res.status(400).json({ error: 'Image host is not allowed.' });
  }
  
  // 2. Read global environment variables from Vercel
  const IG_USER_ID = process.env.IG_USER_ID;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({ error: 'Supabase credentials are not configured on the server.' });
  }

  // Initialize the Supabase database connection
  const supabase = createClient(
    supabaseUrl,
    supabaseKey
  );

  // Robust validator to discard corrupt, falsy, or literal text representations of empty values
  const isValidToken = (t) => t && typeof t === 'string' && t.trim() !== '' && t !== 'undefined' && t !== 'null';

  // Dynamic helper to resolve the correct Graph Endpoint target based on Token Architecture
  // Standalone Instagram Tokens (IGQ...) bypass facebook.com and hit instagram.com
  const getMetaBaseUrl = (token) => {
    return token && token.trim().startsWith('EAA') 
      ? 'https://graph.facebook.com' 
      : 'https://graph.instagram.com';
  };

  try {
    if (!imageUrl) {
      return res.status(400).json({ error: "Missing required imageUrl payload attribute." });
    }

    // Reflects your unified Vercel project domain name to target the active proxy
    const hostDomain = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://my-journal-admin.vercel.app";
    const unblockableImageUrl = `${hostDomain}/api/ig-image-proxy?url=${encodeURIComponent(imageUrl)}&ignore=/image.jpg`;

    // ==========================================
    // INSTAGRAM ROUTE (Dynamic Architecture Router)
    // ==========================================
    if (platform === 'instagram') {
      let tokenSource = "vercel";
      
      // 2. Sanitize the Vercel environment token (checks for dedicated IG token or legacy Meta token)
      const rawEnvToken = process.env.IG_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
      let envIgToken = rawEnvToken && isValidToken(rawEnvToken)
        ? rawEnvToken.replace(/['"]/g, '').trim() 
        : null;

      let ACCESS_TOKEN = envIgToken;
      
      // Pre-flight Fallback: If Vercel variables are missing or invalid, query Supabase
      if (!ACCESS_TOKEN) {
        const { data } = await supabase.from('system_credentials').select('value').eq('key', 'instagram_access_token').single();
        if (isValidToken(data?.value)) {
          ACCESS_TOKEN = data.value.trim();
          tokenSource = "supabase";
        }
      }

      if (!ACCESS_TOKEN) return res.status(400).json({ error: "Missing or invalid Instagram token across Vercel and Supabase vaults." });
      if (!/^\d+$/.test(IG_USER_ID || '')) {
        return res.status(503).json({ error: "Instagram user configuration is invalid." });
      }

      // Step 1: Create Instagram Media Container using token-aware routing
      let metaBaseUrl = getMetaBaseUrl(ACCESS_TOKEN);
      let igCreateUrl = `${metaBaseUrl}/v21.0/${encodeURIComponent(IG_USER_ID)}/media`;

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
      
      // Mid-flight Recovery: If the Vercel variable failed due to auth/expiry/parsing, fall back to Supabase and retry
      if (createData.error && tokenSource === "vercel") {
        const errMsg = createData.error.message ? createData.error.message.toLowerCase() : "";
        const isAuthError = createData.error.code === 190 || 
                            createData.error.type === 'OAuthException' || 
                            errMsg.includes('token') || 
                            errMsg.includes('session') || 
                            errMsg.includes('parse') ||
                            errMsg.includes('auth');
        
        if (isAuthError) {
          console.warn("Instagram Vercel token failed or expired. Initiating Supabase vault recovery fallback...");
          const { data } = await supabase.from('system_credentials').select('value').eq('key', 'instagram_access_token').single();
          if (isValidToken(data?.value)) {
            ACCESS_TOKEN = data.value.trim();
            tokenSource = "supabase";
            
            // Recalculate dynamic destination based on the fresh database token
            metaBaseUrl = getMetaBaseUrl(ACCESS_TOKEN);
            igCreateUrl = `${metaBaseUrl}/v21.0/${encodeURIComponent(IG_USER_ID)}/media`;

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
      
      // Step 2: Publish the Container live using matching base URL routing
      const igPublishUrl = `${metaBaseUrl}/v21.0/${IG_USER_ID}/media_publish`;
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
      
      // 2. Sanitize the Vercel environment token
      let envThreadsToken = process.env.THREADS_ACCESS_TOKEN && isValidToken(process.env.THREADS_ACCESS_TOKEN)
        ? process.env.THREADS_ACCESS_TOKEN.replace(/['"]/g, '').trim() 
        : null;

      let ACCESS_TOKEN = envThreadsToken;

      // Pre-flight Fallback: If Vercel variables are missing or invalid, query Supabase
      if (!ACCESS_TOKEN) {
        const { data } = await supabase.from('system_credentials').select('value').eq('key', 'threads_access_token').single();
        if (isValidToken(data?.value)) {
          ACCESS_TOKEN = data.value.trim();
          tokenSource = "supabase";
        }
      }

      if (!ACCESS_TOKEN) return res.status(400).json({ error: "Authorization failed: Missing or invalid Threads token across Vercel and Supabase vaults." });

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
      
      // Mid-flight Recovery: If the Vercel variable failed due to auth/expiry/parsing, fall back to Supabase and retry
      if (createData.error && tokenSource === "vercel") {
        const errMsg = createData.error.message ? createData.error.message.toLowerCase() : "";
        const isAuthError = createData.error.code === 190 || 
                            errMsg.includes('token') || 
                            errMsg.includes('session') || 
                            errMsg.includes('parse') ||
                            errMsg.includes('auth');
        
        if (isAuthError) {
          console.warn("Threads Vercel token failed or expired. Initiating Supabase vault recovery fallback...");
          const { data } = await supabase.from('system_credentials').select('value').eq('key', 'threads_access_token').single();
          if (isValidToken(data?.value)) {
            ACCESS_TOKEN = data.value.trim();
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

      if (createData.error) {
        return res.status(400).json({
          error: `Meta rejected container creation: ${createData.error.message}`,
          code: createData.error.code,
          subcode: createData.error.error_subcode
        });
      }
      
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
    if (clientErrorMessage.includes("access token") || clientErrorMessage.includes("session") || clientErrorMessage.includes("parse")) {
      clientErrorMessage = "The session has invalidated. Please check or renew your 60-day authorization tokens.";
    }
    
    return res.status(500).json({ error: clientErrorMessage });
  }
}

// api/cron-refresh-tokens.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Security check to ensure only Vercel Cron can trigger this endpoint
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized invocation' });
  }

  // Initialize Supabase client
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL, 
    process.env.VITE_SUPABASE_KEY
  );

  try {
    // Fetch current credentials
    const { data: creds, error: fetchError } = await supabase
      .from('system_credentials')
      .select('*');

    if (fetchError) throw fetchError;

    const igToken = creds.find(c => c.key === 'instagram_access_token')?.value;
    const threadsToken = creds.find(c => c.key === 'threads_access_token')?.value;

    const updates = [];
    const now = new Date().toISOString();

    // 1. Refresh Long-Lived Instagram Token
    if (igToken) {
      const igRes = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${igToken}`);
      const igData = await igRes.json();
      
      if (igData.access_token) {
        updates.push({ key: 'instagram_access_token', value: igData.access_token, updated_at: now });
      } else {
        console.error("Failed auto-refreshing Instagram token:", igData);
      }
    }

    // 2. Refresh Long-Lived Threads Token
    if (threadsToken) {
      const thRes = await fetch(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${threadsToken}`);
      const thData = await thRes.json();
      
      if (thData.access_token) {
        updates.push({ key: 'threads_access_token', value: thData.access_token, updated_at: now });
      } else {
        console.error("Failed auto-refreshing Threads token:", thData);
      }
    }

    // 3. Batch Update Database
    if (updates.length > 0) {
      // Upsert the entire array in one network request
      const { error: updateError } = await supabase
        .from('system_credentials')
        .upsert(updates, { onConflict: 'key' });

      if (updateError) throw updateError;
    }

    return res.status(200).json({ status: "Success", refreshedCount: updates.length });
  } catch (error) {
    console.error("Token Recycler Exception Failure:", error);
    return res.status(500).json({ error: error.message });
  }
}
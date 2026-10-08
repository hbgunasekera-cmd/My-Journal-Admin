import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(503).json({ error: 'Cron authentication is not configured.' });
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized invocation.' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({ error: 'Supabase credentials are not configured.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  try {
    const { data: credentials, error: fetchError } = await supabase
      .from('system_credentials')
      .select('key, value');
    if (fetchError) throw fetchError;

    const tokenByKey = Object.fromEntries((credentials || []).map((credential) => [credential.key, credential.value]));
    const updates = [];
    const failedPlatforms = [];
    const now = new Date().toISOString();

    const refreshToken = async (platform, token, url) => {
      if (!token) return;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        const result = await response.json().catch(() => ({}));
        if (response.ok && typeof result.access_token === 'string' && result.access_token) {
          updates.push({ key: `${platform}_access_token`, value: result.access_token, updated_at: now });
        } else {
          failedPlatforms.push(platform);
          console.warn(`${platform} token refresh failed with HTTP ${response.status}.`);
        }
      } catch (error) {
        failedPlatforms.push(platform);
        console.warn(`${platform} token refresh failed:`, error.message);
      }
    };

    const igToken = tokenByKey.instagram_access_token;
    const threadsToken = tokenByKey.threads_access_token;
    await Promise.all([
      refreshToken('instagram', igToken, `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(igToken || '')}`),
      refreshToken('threads', threadsToken, `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(threadsToken || '')}`)
    ]);

    if (updates.length > 0) {
      const { error: updateError } = await supabase
        .from('system_credentials')
        .upsert(updates, { onConflict: 'key' });
      if (updateError) throw updateError;
    }

    return res.status(200).json({ refreshedCount: updates.length, failedPlatforms });
  } catch (error) {
    console.error('Token refresh job failed:', error.message);
    return res.status(500).json({ error: 'Token refresh job failed.' });
  }
}

import { createClient } from '@supabase/supabase-js';

const normalizePart = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

export const getSeasonGuideCacheKey = (place) => {
  const latitude = Number(place?.latitude);
  const longitude = Number(place?.longitude);
  return JSON.stringify([
    normalizePart(place?.placeName ?? place?.place_name),
    normalizePart(place?.category || 'Location'),
    normalizePart(place?.locality),
    Number.isFinite(latitude) ? latitude.toFixed(6) : '',
    Number.isFinite(longitude) ? longitude.toFixed(6) : ''
  ]);
};

export const getSeasonGuideAdmin = () => {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    const missing = !url
      ? 'Missing server-side Supabase project URL. Set SUPABASE_URL or VITE_SUPABASE_URL in the server environment.'
      : 'Missing privileged server-side Supabase key. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY in the server environment; do not expose it with a VITE_ prefix.';
    const error = new Error(missing);
    error.status = 503;
    throw error;
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
};

export const getSeasonGuideStorageError = (error) => {
  const message = error?.message || String(error || 'Unknown database error.');
  if (/location_season_guides|schema cache|does not exist|could not find the table/i.test(message)) {
    return 'Supabase table public.location_season_guides is missing or not exposed yet. Run the supplied SQL schema, then try again.';
  }
  return message;
};

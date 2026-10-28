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
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Season guide storage is not configured. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server environment.');
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

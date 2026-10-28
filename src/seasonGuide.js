const normalizePart = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

export const getSeasonGuideCacheKey = (place) => {
  const latitude = Number(place?.latitude);
  const longitude = Number(place?.longitude);
  return JSON.stringify([
    normalizePart(place?.place_name ?? place?.placeName),
    normalizePart(place?.category || 'Location'),
    normalizePart(place?.locality),
    Number.isFinite(latitude) ? latitude.toFixed(6) : '',
    Number.isFinite(longitude) ? longitude.toFixed(6) : ''
  ]);
};

export const clearLegacySeasonGuideBrowserStorage = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem('my-journal-admin-season-guides-v1');
    window.localStorage.removeItem('my-journal-admin-season-guide-batches-v1');
  } catch {
    // The current implementation reads and writes season guides only through the database API.
  }
};

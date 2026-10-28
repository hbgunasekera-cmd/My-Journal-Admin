const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[character]);

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

const renderSourceLinks = (sources) => {
  const validSources = (Array.isArray(sources) ? sources : []).filter((source) => {
    try {
      return ['http:', 'https:'].includes(new URL(source?.url).protocol);
    } catch {
      return false;
    }
  }).slice(0, 3);
  if (validSources.length === 0) return '';
  return `<div style="margin-top:8px;padding-top:6px;border-top:1px solid #e2e8f0;font-size:10px;color:#64748b"><b>Sources</b>: ${validSources.map((source, index) => (
    `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer" style="color:#4f46e5;text-decoration:underline">${index + 1}. ${escapeHtml(source.title || 'Climate reference')}</a>`
  )).join(' · ')}</div>`;
};

const renderLine = (label, value) => value
  ? `<div style="margin-top:5px"><b style="color:#334155">${escapeHtml(label)}:</b> ${escapeHtml(value)}</div>`
  : '';

export const renderSeasonGuidePopup = (place, guide) => {
  const title = escapeHtml(place?.place_name || 'Location');
  const locality = escapeHtml(place?.locality || 'Locality not entered');
  const category = escapeHtml(place?.category || 'Location');
  const frame = 'padding:6px 4px;font-family:Arial,sans-serif;min-width:220px;max-width:320px;color:#475569;font-size:11px;line-height:1.4';
  const header = `<div style="font-size:12px;font-weight:800;color:#0f172a">${title}</div><div style="font-size:10px;color:#64748b;margin-top:1px">${category} · ${locality}</div>`;

  if (!guide) {
    return `<div style="${frame}">${header}<div style="margin-top:8px;color:#64748b">Season guide is being researched from this pin, its locality, and category…</div></div>`;
  }
  if (guide.error) {
    return `<div style="${frame}">${header}<div style="margin-top:8px;color:#b91c1c"><b>Season guide unavailable</b><br/>${escapeHtml(guide.error)}</div><div style="margin-top:5px;color:#64748b">Use “Retry failed guides” in the map guide panel.</div></div>`;
  }

  const locationMatch = guide.locationMatch === 'AREA_CLIMATE_ONLY'
    ? 'Area-level climate match'
    : 'Location and area matched';
  return `<div style="${frame}">
    ${header}
    <div style="margin-top:8px;padding:7px;background:#eef2ff;border-radius:7px;color:#312e81">
      <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em">Best visit and photography balance</div>
      <div style="font-size:14px;font-weight:900;margin-top:2px">${escapeHtml(guide.primaryWindow)}</div>
      ${guide.secondaryWindow ? `<div style="font-size:10px;margin-top:2px">Alternative: ${escapeHtml(guide.secondaryWindow)}</div>` : ''}
    </div>
    ${renderLine('Fuller-flow period', guide.waterfallFlowWindow)}
    ${renderLine('Photo / drone balance', guide.photoWindow)}
    ${renderLine('Rain and monsoon', guide.rainAndMonsoon)}
    ${renderLine('Sky and light', guide.skyAndLight)}
    ${renderLine('Wind / drone note', guide.windAndDrone)}
    ${renderLine('Best shooting time', guide.bestTimeOfDay)}
    ${renderLine('Why this place and area', guide.rationale)}
    <div style="margin-top:7px;font-size:9px;color:#64748b">${escapeHtml(locationMatch)} · confidence: ${escapeHtml(guide.confidence || 'not rated')}.</div>
    <div style="margin-top:3px;font-size:9px;color:#64748b">Seasonal guidance, not a forecast or flight-safety check. Check the current weather and local drone rules.</div>
    ${renderSourceLinks(guide.sources)}
  </div>`;
};

export const renderSeasonGuideTooltip = (place, guide) => {
  const title = escapeHtml(place?.place_name || 'Location');
  const category = escapeHtml(place?.category || 'Location');
  if (!guide) return `${title} · ${category} · season guide is loading`;
  if (guide.error) return `${title} · ${category} · season guide unavailable`;
  return `${title} · ${category}<br/><b>Best season:</b> ${escapeHtml(guide.primaryWindow)}`;
};

import { requireTrustedMutation } from '../server/api-security.js';
import { withApiErrorLogging } from '../server/error-logger.js';
import { getSeasonGuideClient, getSeasonGuideCacheKey, getSeasonGuideStorageError } from '../server/season-guide-store.js';
import { getFactContext, getGroundedSources, getResearchPrompt, readText } from './generate-article.js';

const GEMINI_BATCH_MODEL = process.env.GEMINI_BATCH_MODEL || 'gemini-2.5-flash';
const MAX_BATCH_REQUESTS = 500;
const MAX_BATCH_BYTES = 18 * 1024 * 1024;
const TERMINAL_STATES = new Set([
  'JOB_STATE_SUCCEEDED', 'JOB_STATE_FAILED', 'JOB_STATE_CANCELLED', 'JOB_STATE_EXPIRED',
  'BATCH_STATE_SUCCEEDED', 'BATCH_STATE_FAILED', 'BATCH_STATE_CANCELLED', 'BATCH_STATE_EXPIRED'
]);
const cleanText = (value, limit) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit)
  : '';

const getApiKey = () => process.env.ARTICLE_KEY;

async function callGeminiBatch(apiKey, path, options = {}) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(25_000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result?.error?.message || `Gemini Batch API request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return result;
}

const unwrapBatch = (result) => result?.batch || result?.response?.batch || result?.response || result;

const getBatchState = (result, batch) => batch?.state
  || batch?.metadata?.state
  || result?.state
  || result?.metadata?.state
  || result?.response?.state
  || (result?.done === true ? (result?.error ? 'JOB_STATE_FAILED' : 'JOB_STATE_SUCCEEDED') : 'JOB_STATE_PENDING');

const getInlineResponses = (batch) => {
  const output = batch?.output || batch?.dest || batch?.response?.output || batch?.response?.dest || batch || {};
  const inline = output.inlinedResponses || output.inlined_responses;
  if (Array.isArray(inline)) return inline;
  if (Array.isArray(inline?.inlinedResponses)) return inline.inlinedResponses;
  if (Array.isArray(inline?.inlined_responses)) return inline.inlined_responses;
  if (Array.isArray(inline?.responses)) return inline.responses;
  return [];
};

const getInlineRequestKeys = (batch) => {
  const inputConfig = batch?.inputConfig || batch?.input_config || {};
  const requests = inputConfig?.requests?.requests
    || inputConfig?.requests?.inlinedRequests
    || inputConfig?.requests?.inlined_requests
    || [];
  return Array.isArray(requests) ? requests.map((request) => (
    cleanText(request?.metadata?.key || request?.metadata?.id || '', 120)
  )) : [];
};

const getResultError = (response) => {
  const error = response?.error || response?.output?.error;
  return error?.message || error?.status || (typeof error === 'string' ? error : 'The research request failed in the batch.');
};

const getSeasonGuidePrompt = (place) => `Use Google Search to prepare a concise, source-backed seasonal visit guide for this exact Sri Lankan pin. You must perform a web search and use at least one relevant result; search the place name with its category, locality, and coordinates, and use the coordinates to identify the correct area and reject similar-name places elsewhere. Prefer Sri Lanka Department of Meteorology, government/tourism or conservation sources, and reliable local climate sources. If the exact feature has no coverage, use a sourced climate reference for the nearest matching area and set location_match to AREA_CLIMATE_ONLY. Do not invent or name sources.
Use the local side of the island, highland/rain-shadow effects, monsoon and inter-monsoon rainfall, cloud/light, sunshine, and wind; do not copy one island-wide month range to every place.
Name: ${place.placeName}; category: ${place.category || 'Location'}; locality: ${place.locality}; coordinates: ${place.coordinates.latitude},${place.coordinates.longitude}.
For waterfalls, give a likely higher-flow rainfall window and separately choose the best photography compromise: strong flow with a better chance of dry, calmer, clearer periods for phone/drone images. Rainfall is only a flow clue, not measured discharge; never promise flyable weather or drone permission. For every other category, favor the category's appealing soft/charming light while avoiding persistently wet or windy periods. Prefer sunrise to about 08:00 and late afternoon from about 16:30 to sunset for softer light; avoid harsh midday light, adjusting these guide times to the local weather and terrain. Recommend month ranges, not unsupported exact dates. Say if a window is an area-level estimate rather than verified for the exact feature. Keep every value to one short sentence (12 words maximum); omit optional details instead of adding explanation. Do not write an article. Return only one compact JSON object with these string keys: location_match (CONFIRMED, AREA_CLIMATE_ONLY, or UNCONFIRMED), resolved_area, primary_window, secondary_window, waterfall_flow_window (empty if not a waterfall), photo_window, rationale, rain_and_monsoon, sky_and_light, wind_and_drone, best_time_of_day, confidence (high, medium, or low). If the pin conflicts with the supplied locality, use UNCONFIRMED. Do not invent measurements, exact flow, weather forecasts, safety, or access rules.`;

const extractJsonObject = (value) => {
  const text = String(value || '');
  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
};

const parseSeasonGuideJson = (text) => {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (initialError) {
    const objectText = extractJsonObject(cleaned);
    if (objectText && objectText !== cleaned) {
      try {
        return JSON.parse(objectText);
      } catch {
        // Keep one stable, user-facing error rather than exposing parser internals.
      }
    }
    const parseError = new Error('The Gemini response was not valid season-guide JSON.');
    parseError.cause = initialError;
    if (!objectText) parseError.incomplete = true;
    throw parseError;
  }
};

const getSeasonGuideGroundedSources = (response) => {
  const candidate = response?.candidates?.[0] || response?.response?.candidates?.[0];
  const groundingMetadata = candidate?.groundingMetadata
    || candidate?.grounding_metadata
    || response?.groundingMetadata
    || response?.grounding_metadata
    || response?.response?.groundingMetadata
    || response?.response?.grounding_metadata;
  const groundingChunks = groundingMetadata?.groundingChunks
    || groundingMetadata?.grounding_chunks
    || [];
  const fallbackSources = groundingChunks.flatMap((chunk) => {
    const web = chunk?.web || chunk?.webSearch || chunk?.web_search;
    const url = web?.uri || web?.url;
    return typeof url === 'string' ? [{ title: web?.title, url }] : [];
  });
  const deduplicatedSources = new Map();
  [...getGroundedSources(response), ...fallbackSources].forEach((source) => {
    try {
      const url = new URL(source?.url);
      if (['http:', 'https:'].includes(url.protocol)) {
        deduplicatedSources.set(url.href, { title: source?.title || url.hostname, url: url.href });
      }
    } catch {
      // Ignore malformed or non-web grounding chunks.
    }
  });
  return [...deduplicatedSources.values()].slice(0, 5);
};

const normalizeSeasonGuideResults = (batch, offset, limit) => {
  const inlineResponses = getInlineResponses(batch);
  const requestKeys = getInlineRequestKeys(batch);
  const total = inlineResponses.length;
  const results = inlineResponses.slice(offset, offset + limit).map((inline, pageIndex) => {
    const index = offset + pageIndex;
    const key = cleanText(
      inline?.metadata?.key
        || inline?.metadata?.id
        || inline?.output?.metadata?.key
        || inline?.output?.metadata?.id
        || requestKeys[index],
      120
    ) || String(index);
    const response = inline?.response || inline?.output?.response;
    if (!response) return { key, success: false, error: getResultError(inline) };

    const sources = getSeasonGuideGroundedSources(response);
    try {
      const parsedResponse = parseSeasonGuideJson(readText(response));
      const parsed = parsedResponse?.season_guide || parsedResponse?.seasonGuide || parsedResponse?.guide || parsedResponse;
      const readGuideValue = (...keys) => {
        for (const keyName of keys) {
          const value = parsed?.[keyName];
          if (typeof value === 'string' && value.trim()) return value;
        }
        return '';
      };
      const guide = {
        locationMatch: cleanText(readGuideValue('location_match', 'locationMatch'), 40).toUpperCase().replace(/[\s-]+/g, '_'),
        resolvedArea: cleanText(readGuideValue('resolved_area', 'resolvedArea'), 180),
        primaryWindow: cleanText(readGuideValue('primary_window', 'primaryWindow', 'best_season', 'bestSeason'), 100),
        secondaryWindow: cleanText(readGuideValue('secondary_window', 'secondaryWindow', 'alternative_window', 'alternativeWindow'), 100),
        waterfallFlowWindow: cleanText(readGuideValue('waterfall_flow_window', 'waterfallFlowWindow', 'flow_window', 'flowWindow'), 100),
        photoWindow: cleanText(readGuideValue('photo_window', 'photoWindow', 'photography_window', 'photographyWindow'), 100),
        rationale: cleanText(readGuideValue('rationale', 'reason'), 500),
        rainAndMonsoon: cleanText(readGuideValue('rain_and_monsoon', 'rainAndMonsoon', 'rainfall'), 500),
        skyAndLight: cleanText(readGuideValue('sky_and_light', 'skyAndLight', 'light'), 500),
        windAndDrone: cleanText(readGuideValue('wind_and_drone', 'windAndDrone', 'wind'), 500),
        bestTimeOfDay: cleanText(readGuideValue('best_time_of_day', 'bestTimeOfDay'), 240),
        confidence: cleanText(readGuideValue('confidence'), 20).toLowerCase()
      };

      // The primary season is the concise recommendation and can also serve as
      // the photography window when the model omits a redundant separate value.
      if (!guide.photoWindow) guide.photoWindow = guide.primaryWindow;

      if (!['CONFIRMED', 'AREA_CLIMATE_ONLY'].includes(guide.locationMatch)) {
        return { key, success: false, error: 'The pin and supplied locality could not be reconciled to a reliable local climate source.' };
      }
      const missingParts = [
        !guide.primaryWindow && 'best season',
        sources.length === 0 && 'grounded web sources'
      ].filter(Boolean);
      if (missingParts.length > 0) {
        return {
          key,
          success: false,
          error: `The season research omitted ${missingParts.join(', ')}. Retry this guide.`
        };
      }
      return {
        key,
        success: true,
        guide,
        sources,
        researchedAt: batch?.endTime || batch?.end_time || batch?.updateTime || batch?.update_time || new Date().toISOString()
      };
    } catch (error) {
      const finishReason = response?.candidates?.[0]?.finishReason
        || response?.candidates?.[0]?.finish_reason
        || response?.response?.candidates?.[0]?.finishReason
        || response?.response?.candidates?.[0]?.finish_reason;
      const truncated = error?.incomplete || /MAX_TOKENS|MAX_OUTPUT_TOKENS/i.test(String(finishReason || ''));
      return {
        key,
        success: false,
        error: truncated
          ? 'Gemini ended before the season guide JSON was complete. Retry this guide.'
          : error?.message || 'The season research response could not be read.'
      };
    }
  });
  return { results, total };
};

const seasonGuideDbResult = (row, ids) => {
  const guide = row?.guide && typeof row.guide === 'object' ? row.guide : {};
  const success = row?.status === 'ready' && !guide.error;
  return ids.map((id) => success
    ? { key: String(id), success: true, guide, sources: guide.sources || [], researchedAt: row.researched_at || guide.researchedAt }
    : { key: String(id), success: false, error: row?.error || guide.error || 'Season research failed. Retry this guide.' });
};

const createSeasonGuideBatch = async (apiKey, body) => {
  const store = getSeasonGuideClient();
  const forceIds = new Set(Array.isArray(body?.forceIds) ? body.forceIds.map((id) => String(id)) : []);
  const uniqueLocations = new Map();
  for (const location of body.locations) {
    const id = cleanText(location?.id, 120);
    const factContext = getFactContext(location);
    if (!id || !factContext) {
      const error = new Error('Each batch location requires an id, name, locality, and valid latitude/longitude.');
      error.status = 400;
      throw error;
    }
    const cacheKey = getSeasonGuideCacheKey(factContext);
    const legacyFactContext = { ...factContext };
    delete legacyFactContext.coordinates;
    const legacyCacheKey = getSeasonGuideCacheKey(legacyFactContext);
    const target = uniqueLocations.get(cacheKey) || { cacheKey, legacyCacheKey, factContext, ids: [] };
    if (!target.ids.includes(id)) target.ids.push(id);
    uniqueLocations.set(cacheKey, target);
  }

  const targets = [...uniqueLocations.values()];
  const lookupKeys = [...new Set(targets.flatMap((target) => [target.cacheKey, target.legacyCacheKey]))];
  const { data: existingRows, error: readError } = await store
    .from('location_season_guides')
    .select('*')
    .in('cache_key', lookupKeys);
  if (readError) throw new Error(getSeasonGuideStorageError(readError));
  const rowsByKey = new Map((existingRows || []).map((row) => [row.cache_key, row]));
  const cachedResults = [];
  const newTargets = [];
  const operationsByName = new Map();
  const now = Date.now();
  const isFresh = (row) => !row?.expires_at || Date.parse(row.expires_at) > now;

  targets.forEach((target) => {
    let row = rowsByKey.get(target.cacheKey);
    if (!row && target.legacyCacheKey !== target.cacheKey) {
      const legacyRow = rowsByKey.get(target.legacyCacheKey);
      const coordinatesMatch = legacyRow
        && Math.abs(Number(legacyRow.latitude) - target.factContext.coordinates.latitude) <= 0.000001
        && Math.abs(Number(legacyRow.longitude) - target.factContext.coordinates.longitude) <= 0.000001;
      if (coordinatesMatch) {
        row = legacyRow;
        target.persistCacheKey = legacyRow.cache_key;
      }
    }
    const forced = target.ids.some((id) => forceIds.has(id));
    if (!forced && row && ['ready', 'error'].includes(row.status) && isFresh(row)) {
      cachedResults.push(...seasonGuideDbResult(row, target.ids));
      return;
    }

    const activeBatch = row?.status === 'researching' && row.batch_operation_name
      && Date.now() - Date.parse(row.updated_at || 0) < 48 * 60 * 60 * 1000;
    if (!forced && activeBatch) {
      const operation = operationsByName.get(row.batch_operation_name) || {
        operationName: row.batch_operation_name,
        targetIds: [],
        keyMap: {}
      };
      operation.targetIds.push(...target.ids.filter((id) => !operation.targetIds.includes(id)));
      const requestKey = String(row.batch_request_key || target.ids[0]);
      const existingIds = Array.isArray(operation.keyMap[requestKey])
        ? operation.keyMap[requestKey]
        : operation.keyMap[requestKey] ? [String(operation.keyMap[requestKey])] : [];
      operation.keyMap[requestKey] = [...new Set([...existingIds, ...target.ids.map(String)])];
      operationsByName.set(row.batch_operation_name, operation);
      return;
    }
    newTargets.push(target);
  });

  if (newTargets.length > 0) {
    if (!apiKey) throw new Error('Article generation is not configured on the server.');
    const requests = newTargets.map((target, requestIndex) => {
      const requestKey = String(requestIndex);
      target.requestKey = requestKey;
      return {
        request: {
          contents: [{ role: 'user', parts: [{ text: getSeasonGuidePrompt(target.factContext) }] }],
          tools: [{ google_search: {} }],
          generation_config: {
            temperature: 0.1,
            max_output_tokens: 768,
            thinking_config: { thinking_budget: 0 }
          }
        },
        metadata: { key: requestKey }
      };
    });
    const requestBody = {
      batch: {
        display_name: cleanText(body?.displayName || `my-journal-admin-season-guide-${Date.now()}`, 128),
        input_config: { requests: { requests } }
      }
    };
    if (Buffer.byteLength(JSON.stringify(requestBody), 'utf8') > MAX_BATCH_BYTES) {
      const error = new Error('The Gemini inline batch is too large. Split the season guide operation into smaller groups.');
      error.status = 413;
      throw error;
    }
    const result = await callGeminiBatch(apiKey, `models/${GEMINI_BATCH_MODEL}:batchGenerateContent`, {
      method: 'POST',
      body: JSON.stringify(requestBody)
    });
    const batch = unwrapBatch(result);
    const operationName = cleanText(batch?.name || result?.name || result?.response?.name, 200);
    if (!/^batches\/[A-Za-z0-9_-]+$/.test(operationName)) {
      throw new Error('Gemini accepted the batch request but returned an invalid operation name.');
    }

    const timestamp = new Date().toISOString();
    const rowsToSave = newTargets.map((target) => ({
      cache_key: target.persistCacheKey || target.cacheKey,
      place_name: target.factContext.placeName,
      category: target.factContext.category || 'Location',
      locality: target.factContext.locality,
      latitude: target.factContext.coordinates.latitude,
      longitude: target.factContext.coordinates.longitude,
      status: 'researching',
      guide: null,
      error: null,
      batch_operation_name: operationName,
      batch_request_key: target.requestKey,
      researched_at: null,
      expires_at: null,
      updated_at: timestamp
    }));
    const { error: saveError } = await store.from('location_season_guides').upsert(rowsToSave, { onConflict: 'cache_key' });
    if (saveError) throw new Error(getSeasonGuideStorageError(saveError));

    operationsByName.set(operationName, {
      operationName,
      targetIds: newTargets.flatMap((target) => target.ids),
      keyMap: Object.fromEntries(newTargets.map((target) => [
        target.requestKey,
        target.ids.map(String)
      ]))
    });
  }

  return {
    status: operationsByName.size > 0 ? 202 : 200,
    body: {
      task: 'season-guide',
      state: operationsByName.size > 0 ? 'JOB_STATE_PENDING' : 'JOB_STATE_SUCCEEDED',
      requestCount: targets.length,
      cachedResults,
      results: cachedResults,
      operations: [...operationsByName.values()]
    }
  };
};

const persistSeasonGuideResults = async (store, operationName, results) => {
  if (!results.length) return;
  const { data: rows, error: readError } = await store
    .from('location_season_guides')
    .select('*')
    .eq('batch_operation_name', operationName)
    .in('batch_request_key', results.map((result) => String(result.key)));
  if (readError) throw new Error(getSeasonGuideStorageError(readError));
  const rowsByRequestKey = new Map((rows || []).map((row) => [String(row.batch_request_key), row]));
  const now = Date.now();
  const savedAt = new Date(now).toISOString();
  const records = results.flatMap((result) => {
    const row = rowsByRequestKey.get(String(result.key));
    if (!row) return [];
    const success = result.success === true;
    const guide = success
      ? { ...result.guide, sources: result.sources || [], researchedAt: result.researchedAt }
      : { error: result.error || 'Season research did not return a usable result.' };
    return [{
      ...row,
      status: success ? 'ready' : 'error',
      guide,
      error: success ? null : guide.error,
      batch_operation_name: null,
      batch_request_key: null,
      researched_at: success ? result.researchedAt || savedAt : null,
      expires_at: new Date(now + (success ? 365 : 1) * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: savedAt
    }];
  });
  if (records.length === 0) return;
  const { error: saveError } = await store.from('location_season_guides').upsert(records, { onConflict: 'cache_key' });
  if (saveError) throw new Error(getSeasonGuideStorageError(saveError));
};

const persistSeasonGuideBatchFailure = async (store, operationName, reason) => {
  const { data: rows, error: readError } = await store
    .from('location_season_guides')
    .select('*')
    .eq('batch_operation_name', operationName);
  if (readError) throw new Error(getSeasonGuideStorageError(readError));
  if (!rows?.length) return;
  const now = new Date().toISOString();
  const errorMessage = cleanText(reason || 'Season research batch failed.', 1000);
  const records = rows.map((row) => ({
    ...row,
    status: 'error',
    guide: { error: errorMessage },
    error: errorMessage,
    batch_operation_name: null,
    batch_request_key: null,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    updated_at: now
  }));
  const { error: saveError } = await store.from('location_season_guides').upsert(records, { onConflict: 'cache_key' });
  if (saveError) throw new Error(getSeasonGuideStorageError(saveError));
};

const persistUnreturnedSeasonGuideResults = async (store, operationName) => {
  const { data: rows, error: readError } = await store
    .from('location_season_guides')
    .select('*')
    .eq('batch_operation_name', operationName);
  if (readError) throw new Error(getSeasonGuideStorageError(readError));
  if (!rows?.length) return [];

  const now = Date.now();
  const updatedAt = new Date(now).toISOString();
  const errorMessage = 'Gemini finished the batch without returning a response for this location. Retry this guide.';
  const records = rows.map((row) => ({
    ...row,
    status: 'error',
    guide: { error: errorMessage },
    error: errorMessage,
    batch_operation_name: null,
    batch_request_key: null,
    expires_at: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    updated_at: updatedAt
  }));
  const { error: saveError } = await store.from('location_season_guides').upsert(records, { onConflict: 'cache_key' });
  if (saveError) throw new Error(getSeasonGuideStorageError(saveError));
  return rows.map((row) => ({
    key: String(row.batch_request_key || row.id),
    success: false,
    error: errorMessage
  }));
};

const normalizeResearchResults = (batch, offset, limit) => {
  const inlineResponses = getInlineResponses(batch);
  const total = inlineResponses.length;
  const finishedAt = batch?.endTime || batch?.end_time || batch?.updateTime || batch?.update_time || new Date().toISOString();
  const results = inlineResponses.slice(offset, offset + limit).map((inline, pageIndex) => {
    const index = offset + pageIndex;
    const key = cleanText(inline?.metadata?.key || inline?.metadata?.id || '', 120) || String(index);
    const response = inline?.response || inline?.output?.response;
    if (!response) return { key, success: false, error: getResultError(inline) };

    const researchText = readText(response);
    const entityMatch = researchText.match(/(?:^|\n)\s*ENTITY_MATCH:\s*(CONFIRMED|UNCONFIRMED)\b/im)
      || researchText.match(/\bENTITY_MATCH:\s*(CONFIRMED|UNCONFIRMED)\b/i);
    const localityMatch = researchText.match(/(?:^|\n)\s*LOCALITY_MATCH:\s*(CONSISTENT|INCONSISTENT)\b/im);
    const coordinateMatch = researchText.match(/(?:^|\n)\s*COORDINATE_MATCH:\s*(CONSISTENT|INCONSISTENT)\b/im);
    const factSources = getGroundedSources(response);
    if (entityMatch?.[1] !== 'CONFIRMED'
      || localityMatch?.[1] !== 'CONSISTENT'
      || coordinateMatch?.[1] !== 'CONSISTENT'
      || factSources.length === 0) {
      return {
        key,
        success: false,
        error: 'The exact location could not be confirmed against its locality, saved coordinates, and reliable web sources.'
      };
    }

    const factEvidence = [
      'SOURCE-GROUNDED LOCATION RESEARCH (use this evidence conservatively; it may contain uncertainty):',
      researchText.slice(0, 12_000),
      'Search sources returned for this research:',
      ...factSources.map((source, sourceIndex) => `[${sourceIndex + 1}] ${source.title} — ${source.url}`),
      'Use this research to fact-check only the sections identified as source-checked in the article request. For other fields, write prospective first-person editorial suggestions without adding location-specific factual claims or source-gap filler. Vertical-measurement exception: if this research marks the category-appropriate height/elevation UNVERIFIED or has no corroborated value, do not repeat or rely on the web-source measurement; provide a separate best estimate from the model’s learned geographic knowledge and label its basis AI estimate. Never label that estimate web-verified.'
    ].join('\n');

    return { key, success: true, factEvidence, factSources, factCheckedAt: finishedAt };
  });
  return { results, total };
};

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!requireTrustedMutation(req, res)) return;

  const apiKey = getApiKey();
  const action = req.body?.action;
  try {
    if (action === 'create') {
      const locations = req.body?.locations;
      if (!Array.isArray(locations) || locations.length === 0 || locations.length > MAX_BATCH_REQUESTS) {
        return res.status(400).json({ error: `Provide between 1 and ${MAX_BATCH_REQUESTS} locations for batch research.` });
      }
      const task = req.body?.task === 'season-guide' ? 'season-guide' : 'article-research';
      if (task === 'season-guide') {
        const result = await createSeasonGuideBatch(apiKey, { ...req.body, locations });
        return res.status(result.status).json(result.body);
      }
      if (!apiKey) return res.status(503).json({ error: 'Article generation is not configured on the server.' });

      const requests = [];
      for (const location of locations) {
        const id = cleanText(location?.id, 120);
        const factContext = getFactContext(location);
        if (!id || !factContext) {
          return res.status(400).json({ error: 'Each batch location requires an id, name, locality, and valid latitude/longitude.' });
        }
        requests.push({
          request: {
            contents: [{ role: 'user', parts: [{ text: getResearchPrompt(factContext) }] }],
            tools: [{ google_search: {} }],
            generation_config: {
              temperature: 0.1,
              max_output_tokens: 3_000,
              thinking_config: { thinking_budget: 512 }
            }
          },
          metadata: { key: id }
        });
      }

      const requestBody = {
        batch: {
          display_name: cleanText(req.body?.displayName || `my-journal-admin-${task}`, 128),
          input_config: { requests: { requests } }
        }
      };
      if (Buffer.byteLength(JSON.stringify(requestBody), 'utf8') > MAX_BATCH_BYTES) {
        return res.status(413).json({ error: 'The Gemini inline batch is too large. Split the bulk operation into smaller groups.' });
      }

      const result = await callGeminiBatch(apiKey, `models/${GEMINI_BATCH_MODEL}:batchGenerateContent`, {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });
      const batch = unwrapBatch(result);
      const operationName = cleanText(batch?.name || result?.name || result?.response?.name, 200);
      if (!/^batches\/[A-Za-z0-9_-]+$/.test(operationName)) {
        return res.status(502).json({ error: 'Gemini accepted the batch request but returned an invalid operation name.' });
      }
      return res.status(202).json({
        operationName,
        state: getBatchState(result, batch),
        requestCount: requests.length,
        task,
        displayName: batch?.displayName || batch?.display_name || requestBody.batch.display_name
      });
    }

    if (action === 'status') {
      if (!apiKey) return res.status(503).json({ error: 'Article generation is not configured on the server.' });
      const operationName = cleanText(req.body?.operationName, 200);
      if (!/^batches\/[A-Za-z0-9_-]+$/.test(operationName)) {
        return res.status(400).json({ error: 'A valid Gemini batch operation name is required.' });
      }
      const offsetValue = Number(req.body?.offset) || 0;
      const offset = Math.max(0, Math.floor(offsetValue));
      const limitValue = Number(req.body?.limit) || 20;
      const limit = Math.max(1, Math.min(25, Math.floor(limitValue)));
      const result = await callGeminiBatch(apiKey, operationName, { method: 'GET' });
      const batch = unwrapBatch(result);
      const state = getBatchState(result, batch);
      const batchStats = batch?.batchStats || batch?.batch_stats || batch?.metadata?.batchStats || result?.metadata?.batchStats || {};
      const response = {
        operationName,
        state,
        done: TERMINAL_STATES.has(state) || result?.done === true,
        error: batch?.error || result?.error || null,
        batchStats
      };
      if (req.body?.task === 'season-guide' && /(?:FAILED|CANCELLED|EXPIRED)$/.test(state)) {
        const store = getSeasonGuideClient();
        const detail = batch?.error?.message || result?.error?.message || state;
        await persistSeasonGuideBatchFailure(store, operationName, detail);
      }
      if (state.endsWith('SUCCEEDED')) {
        const isSeasonGuide = req.body?.task === 'season-guide';
        const { results, total } = isSeasonGuide
          ? normalizeSeasonGuideResults(batch, offset, limit)
          : normalizeResearchResults(batch, offset, limit);
        let completeResults = results;
        let completeTotal = total;
        if (isSeasonGuide) {
          const store = getSeasonGuideClient();
          await persistSeasonGuideResults(store, operationName, results);
          if (offset + results.length >= total) {
            const unreturnedResults = await persistUnreturnedSeasonGuideResults(store, operationName);
            completeResults = [...results, ...unreturnedResults];
            completeTotal += unreturnedResults.length;
          }
        }
        response.results = completeResults;
        response.totalResults = completeTotal;
        response.offset = offset;
        response.hasMore = offset + completeResults.length < completeTotal;
      }
      return res.status(200).json(response);
    }

    return res.status(400).json({ error: 'Batch action must be "create" or "status".' });
  } catch (error) {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 502;
    return res.status(status).json({ error: { message: getSeasonGuideStorageError(error) || error.message || 'Gemini Batch API request failed.' } });
  }
}

export default withApiErrorLogging(handler);

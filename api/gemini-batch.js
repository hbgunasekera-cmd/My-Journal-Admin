import { requireTrustedMutation } from '../server/api-security.js';
import { withApiErrorLogging } from '../server/error-logger.js';
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

const getResultError = (response) => {
  const error = response?.error || response?.output?.error;
  return error?.message || error?.status || (typeof error === 'string' ? error : 'The research request failed in the batch.');
};

const getSeasonGuidePrompt = (place) => `Use Google Search to prepare a very concise, source-backed seasonal visit guide for this exact Sri Lankan pin. Search the place name with its category, locality, and coordinates; use the coordinates to identify the correct area and reject similar-name places elsewhere. Prefer Sri Lanka Department of Meteorology, government/tourism or conservation sources, and reliable local climate sources. Use the local side of the island, highland/rain-shadow effects, monsoon and inter-monsoon rainfall, cloud/light, sunshine, and wind; do not copy one island-wide month range to every place.
Name: ${place.placeName}; category: ${place.category || 'Location'}; locality: ${place.locality}; coordinates: ${place.coordinates.latitude},${place.coordinates.longitude}.
For waterfalls, give a likely higher-flow rainfall window and separately choose the best photography compromise: strong flow with a better chance of dry, calmer, clearer periods for phone/drone images. Rainfall is only a flow clue, not measured discharge; never promise flyable weather or drone permission. For every other category, favor the category's appealing soft/charming light while avoiding persistently wet or windy periods. Prefer sunrise to about 08:00 and late afternoon from about 16:30 to sunset for softer light; avoid harsh midday light, adjusting these guide times to the local weather and terrain. Recommend month ranges, not unsupported exact dates. Say if a window is an area-level estimate rather than verified for the exact feature. Keep every field brief (one sentence, about 20 words maximum); do not write an article. Return only one JSON object with these string keys: location_match (CONFIRMED, AREA_CLIMATE_ONLY, or UNCONFIRMED), resolved_area, primary_window, secondary_window, waterfall_flow_window (empty if not a waterfall), photo_window, rationale, rain_and_monsoon, sky_and_light, wind_and_drone, best_time_of_day, confidence (high, medium, or low). If the exact feature is obscure but the coordinate and locality agree, use AREA_CLIMATE_ONLY and source the nearest relevant climate area. If the pin conflicts with the supplied locality, use UNCONFIRMED. Do not invent measurements, exact flow, weather forecasts, safety, or access rules.`;

const parseSeasonGuideJson = (text) => {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1));
    throw new Error('The Gemini response was not valid season-guide JSON.');
  }
};

const normalizeSeasonGuideResults = (batch, offset, limit) => {
  const inlineResponses = getInlineResponses(batch);
  const total = inlineResponses.length;
  const results = inlineResponses.slice(offset, offset + limit).map((inline, pageIndex) => {
    const index = offset + pageIndex;
    const key = cleanText(inline?.metadata?.key || inline?.metadata?.id || '', 120) || String(index);
    const response = inline?.response || inline?.output?.response;
    if (!response) return { key, success: false, error: getResultError(inline) };

    const sources = getGroundedSources(response).slice(0, 5);
    try {
      const parsed = parseSeasonGuideJson(readText(response));
      const guide = {
        locationMatch: cleanText(parsed?.location_match, 40).toUpperCase(),
        resolvedArea: cleanText(parsed?.resolved_area, 180),
        primaryWindow: cleanText(parsed?.primary_window, 100),
        secondaryWindow: cleanText(parsed?.secondary_window, 100),
        waterfallFlowWindow: cleanText(parsed?.waterfall_flow_window, 100),
        photoWindow: cleanText(parsed?.photo_window, 100),
        rationale: cleanText(parsed?.rationale, 500),
        rainAndMonsoon: cleanText(parsed?.rain_and_monsoon, 500),
        skyAndLight: cleanText(parsed?.sky_and_light, 500),
        windAndDrone: cleanText(parsed?.wind_and_drone, 500),
        bestTimeOfDay: cleanText(parsed?.best_time_of_day, 240),
        confidence: cleanText(parsed?.confidence, 20).toLowerCase()
      };

      if (!['CONFIRMED', 'AREA_CLIMATE_ONLY'].includes(guide.locationMatch)) {
        return { key, success: false, error: 'The pin and supplied locality could not be reconciled to a reliable local climate source.' };
      }
      if (!guide.primaryWindow || !guide.photoWindow || !guide.rainAndMonsoon || !guide.skyAndLight || sources.length === 0) {
        return { key, success: false, error: 'The season research did not return a complete recommendation with grounded sources.' };
      }
      return {
        key,
        success: true,
        guide,
        sources,
        researchedAt: batch?.endTime || batch?.end_time || batch?.updateTime || batch?.update_time || new Date().toISOString()
      };
    } catch (error) {
      return { key, success: false, error: error?.message || 'The season research response could not be read.' };
    }
  });
  return { results, total };
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
  if (!apiKey) return res.status(503).json({ error: 'Article generation is not configured on the server.' });

  const action = req.body?.action;
  try {
    if (action === 'create') {
      const locations = req.body?.locations;
      if (!Array.isArray(locations) || locations.length === 0 || locations.length > MAX_BATCH_REQUESTS) {
        return res.status(400).json({ error: `Provide between 1 and ${MAX_BATCH_REQUESTS} locations for batch research.` });
      }
      const task = req.body?.task === 'season-guide' ? 'season-guide' : 'article-research';
      const requests = [];
      for (const location of locations) {
        const id = cleanText(location?.id, 120);
        const factContext = getFactContext(location);
        if (!id || !factContext) {
          return res.status(400).json({ error: 'Each batch location requires an id, name, locality, and valid latitude/longitude.' });
        }
        requests.push({
          request: {
            contents: [{ role: 'user', parts: [{ text: task === 'season-guide' ? getSeasonGuidePrompt(factContext) : getResearchPrompt(factContext) }] }],
            tools: [{ google_search: {} }],
            generation_config: {
              temperature: 0.1,
              max_output_tokens: task === 'season-guide' ? 400 : 3_000,
              thinking_config: { thinking_budget: task === 'season-guide' ? 0 : 512 }
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
      if (state.endsWith('SUCCEEDED')) {
        const { results, total } = req.body?.task === 'season-guide'
          ? normalizeSeasonGuideResults(batch, offset, limit)
          : normalizeResearchResults(batch, offset, limit);
        response.results = results;
        response.totalResults = total;
        response.offset = offset;
        response.hasMore = offset + results.length < total;
      }
      return res.status(200).json(response);
    }

    return res.status(400).json({ error: 'Batch action must be "create" or "status".' });
  } catch (error) {
    const status = error.status === 429 ? 429 : error.status >= 400 && error.status < 500 ? error.status : 502;
    return res.status(status).json({ error: { message: error.message || 'Gemini Batch API request failed.' } });
  }
}

export default withApiErrorLogging(handler);

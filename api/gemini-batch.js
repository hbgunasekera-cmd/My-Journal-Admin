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
  const responseText = await response.text().catch(() => '');
  let result = {};
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    // Keep the empty response object when Gemini returns a non-JSON body.
  }
  if (!response.ok) {
    const apiError = result?.error || {};
    const errorDetails = Array.isArray(apiError.details) ? apiError.details : [];
    const fieldViolations = errorDetails
      .flatMap((detail) => detail?.fieldViolations || detail?.field_violations || [])
      .map((violation) => [violation?.field, violation?.description].filter(Boolean).join(': '))
      .filter(Boolean);
    const message = fieldViolations.length
      ? `Gemini rejected the batch request: ${fieldViolations.join('; ')}`
      : apiError.message || response.statusText || `Gemini Batch API request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    error.details = responseText.slice(0, 2_000);
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


const getSeasonGuidePrompt = (route) => {
  const stopSummary = route.stops.map((stop, index) => [
    String(index + 1) + '. ' + stop.name,
    stop.category || 'Location',
    stop.locality || route.mainArea,
    Number(stop.latitude).toFixed(5) + ',' + Number(stop.longitude).toFixed(5)
  ].join(' | ')).join('\n');

  return [
    'Before choosing a season, perform at least one Google Search for the supplied main area and its Sri Lankan monsoon/rainfall seasonality. Do not answer from memory alone.',
    'Research only the supplied main area as a whole, not each stop separately. Use the nearby stops, categories and coordinates to understand the route mix. Prefer Sri Lanka Department of Meteorology, government, tourism, conservation and reliable local climate sources. If only nearby-area climate evidence is available, set location_match to AREA_CLIMATE_ONLY. Do not invent or name sources.',
    'Route: ' + route.routeName,
    'Main area: ' + route.mainArea,
    'Route centre: ' + Number(route.center.latitude).toFixed(5) + ',' + Number(route.center.longitude).toFixed(5),
    'Stops (' + route.stops.length + '):\n' + stopSummary,
    'Consider the area’s monsoon and inter-monsoon periods, rainfall, clearer skies and seasonal light. Choose one best month range and one alternative for the route as a whole. For waterfall routes, balance fuller seasonal flow with a reasonable chance of clearer skies; for other routes, favor pleasant conditions and soft light. This is seasonal guidance, not a forecast or a promise of safe drone conditions.',
    'Return JSON only, with exactly these four short string fields: primary_window, secondary_window, location_match, rationale. Put primary_window first. Use month ranges, not exact dates. Keep primary_window and secondary_window under 12 words each and rationale under 25 words. Use the supplied main area; do not write an article, discuss every stop, include sources in the text, or add other fields. Set location_match to CONFIRMED when the main area is supported or AREA_CLIMATE_ONLY for a nearby-area climate estimate.'
  ].join('\n');
};

const getSeasonGuideCandidates = (response) => [
    response?.candidates?.[0],
    response?.response?.candidates?.[0],
    response?.output?.candidates?.[0],
    response?.generateContentResponse?.candidates?.[0],
    response?.response?.generateContentResponse?.candidates?.[0]
  ].filter(Boolean);

const getSeasonGuideText = (response) => {
  const candidates = getSeasonGuideCandidates(response);
  return candidates
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => part?.text)
    .filter((part) => typeof part === 'string')
    .join('\n')
    .trim() || readText(response);
};

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

const extractCompleteJsonFields = (value) => {
  const text = String(value || '');
  const start = text.indexOf('{');
  if (start < 0) return null;
  let objectDepth = 0;
  let arrayDepth = 0;
  let inString = false;
  let escaped = false;
  let fieldStart = start + 1;
  const fields = {};
  const saveField = (end) => {
    const fieldText = text.slice(fieldStart, end).trim().replace(/,$/, '').trim();
    if (!fieldText) return;
    try {
      Object.assign(fields, JSON.parse('{' + fieldText + '}'));
    } catch {
      // Ignore a truncated final field while keeping complete earlier fields.
    }
  };
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') objectDepth += 1;
    else if (character === '}') {
      if (objectDepth === 1 && arrayDepth === 0) saveField(index);
      objectDepth -= 1;
      if (objectDepth === 0) break;
    } else if (character === '[') arrayDepth += 1;
    else if (character === ']') arrayDepth = Math.max(0, arrayDepth - 1);
    else if (character === ',' && objectDepth === 1 && arrayDepth === 0) {
      saveField(index);
      fieldStart = index + 1;
    }
  }
  if (objectDepth > 0) saveField(text.length);
  return Object.keys(fields).length ? fields : null;
};

const parseSeasonGuideJson = (value) => {
  let cleaned = String(value || '').trim();
  const fence = String.fromCharCode(96).repeat(3);
  if (cleaned.startsWith(fence)) {
    cleaned = cleaned.slice(fence.length).replace(/^json\b/i, '').trim();
    if (cleaned.endsWith(fence)) cleaned = cleaned.slice(0, -fence.length).trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch (initialError) {
    const objectText = extractJsonObject(cleaned);
    if (objectText) {
      try {
        return JSON.parse(objectText);
      } catch {
        // Fall through to salvage complete fields from truncated output.
      }
    }
    const partial = extractCompleteJsonFields(cleaned);
    if (partial) return { ...partial, _partialResponse: true };
    const error = new Error('The Gemini response was not valid route season-guide JSON.');
    error.cause = initialError;
    error.incomplete = !objectText;
    throw error;
  }
};

const getSeasonGuideGroundingMetadata = (response) => [
  ...getSeasonGuideCandidates(response).flatMap((candidate) => [
    candidate?.groundingMetadata,
    candidate?.grounding_metadata
  ]),
  response?.groundingMetadata,
  response?.grounding_metadata,
  response?.response?.groundingMetadata,
  response?.response?.grounding_metadata,
  response?.output?.groundingMetadata,
  response?.output?.grounding_metadata
].filter((metadata) => metadata && typeof metadata === 'object');

const getSeasonGuideSearchQueries = (response) => [...new Set(
  getSeasonGuideGroundingMetadata(response)
    .flatMap((metadata) => metadata.webSearchQueries || metadata.web_search_queries || [])
    .filter((query) => typeof query === 'string' && query.trim())
    .map((query) => cleanText(query, 240))
)].slice(0, 5);

const getSeasonGuideGroundedSources = (response) => {
  const chunks = getSeasonGuideGroundingMetadata(response)
    .flatMap((metadata) => metadata.groundingChunks || metadata.grounding_chunks || []);
  const fallbackSources = chunks.flatMap((chunk) => {
    const web = chunk?.web || chunk?.webSearch || chunk?.web_search;
    const url = web?.uri || web?.url;
    return typeof url === 'string' ? [{ title: web?.title, url }] : [];
  });
  const citationSources = getSeasonGuideCandidates(response).flatMap((candidate) => {
    const citations = candidate?.citationMetadata?.citationSources
      || candidate?.citation_metadata?.citation_sources
      || [];
    return citations.map((citation) => ({
      title: citation?.title || citation?.publicationDate || '',
      url: citation?.uri || citation?.url
    }));
  });
  const unique = new Map();
  [...getGroundedSources(response), ...fallbackSources, ...citationSources].forEach((source) => {
    try {
      const url = new URL(source?.url);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        unique.set(url.href, { title: source?.title || url.hostname, url: url.href });
      }
    } catch {
      // Ignore malformed grounding links.
    }
  });
  return [...unique.values()].slice(0, 5);
};

const normalizeSeasonGuideResults = (batch, offset, limit) => {
  const inlineResponses = getInlineResponses(batch);
  const requestKeys = getInlineRequestKeys(batch);
  const total = inlineResponses.length;
  const finishedAt = batch?.endTime || batch?.end_time || batch?.updateTime || batch?.update_time || new Date().toISOString();
  const results = inlineResponses.slice(offset, offset + limit).map((inline, pageIndex) => {
    const index = offset + pageIndex;
    const key = cleanText(inline?.metadata?.key || inline?.metadata?.id
      || inline?.output?.metadata?.key || inline?.output?.metadata?.id || requestKeys[index], 120) || String(index);
    const response = inline?.response || inline?.output?.response;
    if (!response) return { key, success: false, error: getResultError(inline) };

    const sources = getSeasonGuideGroundedSources(response);
    const searchQueries = getSeasonGuideSearchQueries(response);
    try {
      const parsedResponse = parseSeasonGuideJson(getSeasonGuideText(response));
      const parsed = parsedResponse?.season_guide || parsedResponse?.seasonGuide || parsedResponse?.guide || parsedResponse;
      const readValue = (...keys) => {
        for (const field of keys) {
          const value = parsed?.[field];
          if (typeof value === 'string' && value.trim()) return value;
        }
        return '';
      };
      const guide = {
        locationMatch: cleanText(readValue('location_match', 'locationMatch'), 40).toUpperCase().replace(/[\s-]+/g, '_'),
        mainArea: cleanText(readValue('main_area', 'mainArea', 'resolved_area', 'resolvedArea'), 180),
        primaryWindow: cleanText(readValue('primary_window', 'primaryWindow', 'best_season', 'bestSeason'), 100),
        secondaryWindow: cleanText(readValue('secondary_window', 'secondaryWindow', 'alternative_window', 'alternativeWindow'), 100),
        rationale: cleanText(readValue('rationale', 'reason'), 400),
        confidence: cleanText(readValue('confidence'), 20).toLowerCase()
      };
      const sourceStatus = sources.length > 0
        ? 'grounded'
        : searchQueries.length > 0
          ? 'search_used_no_citations'
          : 'ai_estimate';
      if (!guide.locationMatch) guide.locationMatch = 'AREA_CLIMATE_ONLY';
      if (sourceStatus !== 'grounded') {
        // A usable period should not be discarded solely because the Batch API
        // omitted source metadata. Surface it transparently as an area estimate.
        guide.locationMatch = 'AREA_CLIMATE_ONLY';
      }
      if (!['CONFIRMED', 'AREA_CLIMATE_ONLY'].includes(guide.locationMatch)) {
        return { key, success: false, error: 'The saved route main area could not be matched to a reliable local climate source.' };
      }
      const missing = [!guide.primaryWindow && 'the best-season period'].filter(Boolean);
      if (missing.length) {
        return {
          key,
          success: false,
          error: parsedResponse?._partialResponse && !guide.primaryWindow
            ? 'Gemini output ended before the route season recommendation was complete. Retry this guide.'
            : 'The season research omitted ' + missing.join(' and ') + '. Retry this guide.'
        };
      }
      return { key, success: true, guide, sources, searchQueries, sourceStatus, researchedAt: finishedAt };
    } catch (error) {
      const candidate = getSeasonGuideCandidates(response)[0];
      const finishReason = candidate?.finishReason || candidate?.finish_reason;
      const truncated = error?.incomplete || /MAX_TOKENS|MAX_OUTPUT_TOKENS/i.test(String(finishReason || ''));
      return {
        key,
        success: false,
        error: truncated ? 'Gemini ended before the route season guide was complete. Retry this guide.' : error?.message || 'The route season research response could not be read.'
      };
    }
  });
  return { results, total };
};

const createSeasonGuideBatch = async (apiKey, routes, displayName) => {
  if (!apiKey) {
    const error = new Error('Season guide research is not configured on the server.');
    error.status = 503;
    throw error;
  }
  const uniqueRoutes = new Map();
  for (const route of routes) {
    const id = cleanText(route?.id, 120);
    const routeName = cleanText(route?.routeName || route?.route_name, 180);
    const mainArea = cleanText(route?.mainArea || route?.main_area, 180);
    const stops = Array.isArray(route?.stops) ? route.stops : [];
    const center = route?.center || {};
    const latitude = Number(center.latitude);
    const longitude = Number(center.longitude);
    const validStops = stops.map((stop) => ({
      name: cleanText(stop?.name, 180),
      category: cleanText(stop?.category || 'Location', 80),
      locality: cleanText(stop?.locality, 120),
      latitude: Number(stop?.latitude),
      longitude: Number(stop?.longitude)
    })).filter((stop) => stop.name && Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)
      && stop.latitude >= -90 && stop.latitude <= 90 && stop.longitude >= -180 && stop.longitude <= 180);
    if (!id || !routeName || !mainArea || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || validStops.length === 0) {
      const error = new Error('Each saved route requires an id, route name, main area and at least one geocoded stop.');
      error.status = 400;
      throw error;
    }
    uniqueRoutes.set(id, { id, routeName, mainArea, center: { latitude, longitude }, stops: validStops });
  }

  const targets = [...uniqueRoutes.values()];
  const requests = targets.map((route) => ({
    request: {
      contents: [{ role: 'user', parts: [{ text: getSeasonGuidePrompt(route) }] }],
      tools: [{ google_search: {} }],
      generation_config: {
        temperature: 0.1,
        // max_output_tokens includes any model thinking tokens. Keep enough
        // headroom while the prompt itself requests only a compact result.
        max_output_tokens: 2_048,
        thinking_config: { thinking_budget: 0 }
      }
    },
    metadata: { key: route.id }
  }));
  const requestBody = {
    batch: {
      display_name: cleanText(displayName || 'my-journal-admin-route-season-' + Date.now(), 128),
      input_config: { requests: { requests } }
    }
  };
  if (Buffer.byteLength(JSON.stringify(requestBody), 'utf8') > MAX_BATCH_BYTES) {
    const error = new Error('The saved route batch is too large. Split it into smaller groups.');
    error.status = 413;
    throw error;
  }
  const result = await callGeminiBatch(apiKey, 'models/' + GEMINI_BATCH_MODEL + ':batchGenerateContent', {
    method: 'POST',
    body: JSON.stringify(requestBody)
  });
  const batch = unwrapBatch(result);
  const operationName = cleanText(batch?.name || result?.name || result?.response?.name, 200);
  if (!/^batches\/[A-Za-z0-9_-]+$/.test(operationName)) {
    const error = new Error('Gemini accepted the route research but returned an invalid operation name.');
    error.status = 502;
    throw error;
  }
  return {
    status: 202,
    body: {
      task: 'season-guide',
      state: getBatchState(result, batch),
      requestCount: requests.length,
      operationName,
      targetIds: targets.map((route) => route.id),
      keyMap: Object.fromEntries(targets.map((route) => [route.id, [route.id]])),
      displayName: batch?.displayName || batch?.display_name || requestBody.batch.display_name
    }
  };
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
      const task = req.body?.task === 'season-guide' ? 'season-guide' : 'article-research';
      if (task === 'season-guide') {
        const routes = req.body?.routes;
        if (!Array.isArray(routes) || routes.length === 0 || routes.length > MAX_BATCH_REQUESTS) {
          return res.status(400).json({ error: `Provide between 1 and ${MAX_BATCH_REQUESTS} saved routes for season research.` });
        }
        const result = await createSeasonGuideBatch(apiKey, routes, req.body?.displayName);
        return res.status(result.status).json(result.body);
      }
      const locations = req.body?.locations;
      if (!Array.isArray(locations) || locations.length === 0 || locations.length > MAX_BATCH_REQUESTS) {
        return res.status(400).json({ error: `Provide between 1 and ${MAX_BATCH_REQUESTS} locations for batch research.` });
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
      if (state.endsWith('SUCCEEDED')) {
        const isSeasonGuide = req.body?.task === 'season-guide';
        const { results, total } = isSeasonGuide
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
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 502;
    return res.status(status).json({
      error: {
        message: error.message || 'Gemini Batch API request failed.',
        details: error?.details || null
      }
    });
  }
}

export default withApiErrorLogging(handler);

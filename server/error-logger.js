import { createClient } from '@supabase/supabase-js';

const MAX_MESSAGE_LENGTH = 4000;
const MAX_STACK_LENGTH = 8000;

const redact = (value, maxLength) => String(value ?? '')
  .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [redacted]')
  .replace(/([?&](?:key|token|access_token|client_secret|api_key)=)[^&#\s]+/gi, '$1[redacted]')
  .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)\b\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
  .slice(0, maxLength);

const getSupabaseAdmin = () => {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init = {}) => fetch(input, {
        ...init,
        signal: init.signal || AbortSignal.timeout(3000)
      })
    }
  });
};

const safeErrorDetails = (error) => {
  if (error instanceof Error || (error && typeof error === 'object')) {
    return {
      error_name: redact(error.name || error.constructor?.name || 'Error', 200),
      message: redact(error.message || error.error_description || error.error || 'Unknown error', MAX_MESSAGE_LENGTH),
      stack: redact(error.stack || '', MAX_STACK_LENGTH) || null,
      error_code: error.code == null ? null : redact(error.code, 100)
    };
  }
  return { error_name: 'Error', message: redact(error || 'Unknown error', MAX_MESSAGE_LENGTH), stack: null, error_code: null };
};

const safeContext = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, entry] of Object.entries(value).slice(0, 30)) {
    const safeKey = redact(key, 80);
    if (typeof entry === 'string') result[safeKey] = redact(entry, 1000);
    else if (typeof entry === 'number' || typeof entry === 'boolean' || entry === null) result[safeKey] = entry;
  }
  return result;
};

export async function writeAdminErrorLog(error, metadata = {}) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return false;

    const details = safeErrorDetails(error);
    const context = safeContext(metadata.context);
    const { error: insertError } = await supabase.from('error_logs').insert({
      reporter: 'Admin',
      session_id: typeof metadata.sessionId === 'string' ? redact(metadata.sessionId, 200) : null,
      error_type: redact(metadata.errorType || 'API error', 80),
      error_name: details.error_name,
      message: details.message || 'Unknown error',
      error_code: details.error_code,
      source: redact(metadata.source || '', 1000) || null,
      page_path: redact(metadata.pagePath || '', 1000) || null,
      line_number: Number.isInteger(metadata.lineNumber) ? metadata.lineNumber : null,
      column_number: Number.isInteger(metadata.columnNumber) ? metadata.columnNumber : null,
      user_agent: redact(metadata.userAgent || '', 1000) || null,
      is_webdriver: metadata.isWebdriver === true,
      stack: details.stack,
      component_stack: redact(metadata.componentStack || '', MAX_STACK_LENGTH) || null,
      context
    });
    return !insertError;
  } catch {
    // Logging must not change the result of the API request being logged.
    return false;
  }
}

export async function listErrorLogs(offset = 0, limit = 100) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Error log database access is not configured.');
  const { data, count, error } = await supabase
    .from('error_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { logs: data || [], total: count || 0 };
}

export async function deleteErrorLogs(ids) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Error log database access is not configured.');
  const { data, error } = await supabase
    .from('error_logs')
    .delete()
    .in('id', ids)
    .select('id');
  if (error) throw error;
  return (data || []).map((row) => row.id);
}

const responseError = (body, statusCode) => {
  let message = '';
  if (typeof body === 'string') message = body;
  else if (body && typeof body === 'object') {
    const candidate = body.error;
    message = typeof candidate === 'string'
      ? candidate
      : candidate?.message || body.message || body.error_description || '';
  }
  return {
    name: 'ApiResponseError',
    message: redact(message || `API request failed with HTTP ${statusCode}.`, MAX_MESSAGE_LENGTH),
    code: statusCode
  };
};

export function withApiErrorLogging(handler) {
  return async function apiErrorLoggingWrapper(req, res) {
    const apiPath = redact(req.url?.split('?')[0] || '/api/unknown', 1000);
    const shouldLog = apiPath !== '/api/log-error';
    let statusCode = 200;
    let pendingResponse = Promise.resolve();
    let errorResponseScheduled = false;
    const originalStatus = typeof res.status === 'function' ? res.status.bind(res) : null;
    const originalJson = typeof res.json === 'function' ? res.json.bind(res) : null;
    const originalSend = typeof res.send === 'function' ? res.send.bind(res) : null;
    const originalEnd = typeof res.end === 'function' ? res.end.bind(res) : null;

    if (originalStatus) {
      res.status = (code) => {
        statusCode = Number(code) || statusCode;
        return originalStatus(code);
      };
    }

    const scheduleResponse = (original, payload, args) => {
      if (statusCode < 400 || !shouldLog || errorResponseScheduled) return original(...args);
      errorResponseScheduled = true;
      pendingResponse = writeAdminErrorLog(responseError(payload, statusCode), {
        errorType: 'API response error',
        source: apiPath,
        context: { method: req.method || 'UNKNOWN', status: statusCode }
      }).then(() => original(...args));
      return res;
    };

    if (originalJson) res.json = (payload) => scheduleResponse(originalJson, payload, [payload]);
    if (originalSend) res.send = (payload) => scheduleResponse(originalSend, payload, [payload]);
    if (originalEnd) {
      res.end = (...args) => {
        if (statusCode >= 400 && shouldLog && !errorResponseScheduled) {
          errorResponseScheduled = true;
          pendingResponse = writeAdminErrorLog(responseError(null, statusCode), {
            errorType: 'API response error',
            source: apiPath,
            context: { method: req.method || 'UNKNOWN', status: statusCode }
          }).then(() => originalEnd(...args));
          return res;
        }
        return originalEnd(...args);
      };
    }

    try {
      const result = await handler(req, res);
      await pendingResponse;
      return result;
    } catch (error) {
      if (shouldLog) {
        await writeAdminErrorLog(error, {
          errorType: 'API exception',
          source: apiPath,
          context: { method: req.method || 'UNKNOWN', status: statusCode >= 400 ? statusCode : 500 }
        });
      }
      throw error;
    }
  };
}

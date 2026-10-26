const ERROR_ENDPOINT = '/api/log-error';
const MAX_MESSAGE_LENGTH = 4000;
const MAX_STACK_LENGTH = 8000;
const reportedErrors = new Map();
let installed = false;

const redact = (value, maxLength) => String(value ?? '')
  .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [redacted]')
  .replace(/([?&](?:key|token|access_token|client_secret|api_key)=)[^&#\s]+/gi, '$1[redacted]')
  .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)\b\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
  .slice(0, maxLength);

const getSessionId = () => {
  try {
    const key = 'admin-error-session-id';
    let value = window.sessionStorage.getItem(key);
    if (!value) {
      value = typeof crypto?.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.sessionStorage.setItem(key, value);
    }
    return value;
  } catch {
    return null;
  }
};

const describeError = (error) => {
  if (error instanceof Error) {
    return {
      error_name: redact(error.name || 'Error', 200),
      message: redact(error.message || error.name || 'Unknown error', MAX_MESSAGE_LENGTH),
      stack: redact(error.stack || '', MAX_STACK_LENGTH),
      error_code: error.code == null ? null : redact(error.code, 100)
    };
  }
  if (error && typeof error === 'object') {
    return {
      error_name: redact(error.name || error.constructor?.name || 'Error', 200),
      message: redact(error.message || error.error_description || error.error || 'Unknown error', MAX_MESSAGE_LENGTH),
      stack: redact(error.stack || '', MAX_STACK_LENGTH),
      error_code: error.code == null ? null : redact(error.code, 100)
    };
  }
  return {
    error_name: 'Error',
    message: redact(error || 'Unknown error', MAX_MESSAGE_LENGTH),
    stack: '',
    error_code: null
  };
};

const cleanContext = (context) => {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return {};
  const cleaned = {};
  for (const [key, value] of Object.entries(context).slice(0, 30)) {
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
      cleaned[redact(key, 80)] = typeof value === 'string' ? redact(value, 500) : value;
    }
  }
  return cleaned;
};

export function reportClientError(error, options = {}) {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;
  const details = describeError(error);
  const errorType = redact(options.errorType || 'Client runtime', 80);
  const source = redact(options.source || '', 1000) || null;
  const key = `${errorType}|${details.error_name}|${details.message}|${source || ''}`;
  const now = Date.now();
  const lastReported = reportedErrors.get(key) || 0;
  // Browser error and unhandled-rejection events can report the same failure twice.
  if (now - lastReported < 3000) return;
  reportedErrors.set(key, now);
  if (reportedErrors.size > 250) {
    for (const [entry, time] of reportedErrors) {
      if (now - time > 60_000) reportedErrors.delete(entry);
    }
  }

  const payload = {
    session_id: getSessionId(),
    error_type: errorType,
    ...details,
    source,
    page_path: redact(window.location?.pathname || '', 1000) || null,
    line_number: Number.isInteger(options.lineNumber) ? options.lineNumber : null,
    column_number: Number.isInteger(options.columnNumber) ? options.columnNumber : null,
    user_agent: redact(navigator.userAgent || '', 1000) || null,
    is_webdriver: navigator.webdriver === true,
    component_stack: redact(options.componentStack || '', MAX_STACK_LENGTH) || null,
    context: cleanContext(options.context)
  };

  try {
    void fetch(ERROR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(() => {});
  } catch {
    // Error reporting must never interrupt the application that is being reported.
  }
}

const summarizeConsoleArgument = (value) => {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') {
    const name = typeof value.name === 'string' ? value.name : value.constructor?.name;
    const message = typeof value.message === 'string' ? value.message : '';
    const code = typeof value.code === 'string' || typeof value.code === 'number' ? ` code=${value.code}` : '';
    return [name, message].filter(Boolean).join(': ') + code || '[object]';
  }
  return String(value ?? '');
};

export function installGlobalErrorHandlers() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    const target = event.target;
    const isResourceFailure = target && target !== window;
    const resource = isResourceFailure ? (target.currentSrc || target.src || target.href || '') : '';
    const error = event.error || (isResourceFailure
      ? new Error(`Failed to load ${target.tagName || 'resource'}${resource ? ` (${resource})` : ''}`)
      : new Error(event.message || 'Uncaught browser error'));
    reportClientError(error, {
      errorType: isResourceFailure ? 'Resource load' : 'Uncaught exception',
      source: event.filename || resource,
      lineNumber: event.lineno,
      columnNumber: event.colno,
      context: isResourceFailure ? { element: target.tagName || 'unknown' } : {}
    });
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(event.reason, { errorType: 'Unhandled promise rejection' });
  });

  const originalConsoleError = console.error.bind(console);
  console.error = (...args) => {
    originalConsoleError(...args);
    const error = args.find((value) => value instanceof Error) || args.find((value) => value && typeof value === 'object' && (value.message || value.error)) || args[0];
    reportClientError(error, {
      errorType: 'Console error',
      context: {
        argument_count: args.length,
        argument_types: args.map((value) => value instanceof Error ? 'Error' : typeof value).join(',').slice(0, 200),
        summary: redact(args.map(summarizeConsoleArgument).join(' ').slice(0, 1000), 1000)
      }
    });
  };
}

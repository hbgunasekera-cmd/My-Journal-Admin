import { requireTrustedMutation } from '../server/api-security.js';
import { writeAdminErrorLog } from '../server/error-logger.js';

const cleanText = (value, maxLength) => typeof value === 'string'
  ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').slice(0, maxLength)
  : '';

const optionalInteger = (value) => Number.isInteger(value) && value >= 0 ? value : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!requireTrustedMutation(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'An error log object is required.' });
  }

  const message = cleanText(body.message, 4000).trim();
  const errorType = cleanText(body.error_type, 80).trim();
  if (!message || !errorType) {
    return res.status(400).json({ error: 'Error type and message are required.' });
  }

  const sourceContext = body.context && typeof body.context === 'object' && !Array.isArray(body.context)
    ? body.context
    : {};
  const safeContext = {};
  for (const [key, value] of Object.entries(sourceContext).slice(0, 30)) {
    if (typeof value === 'string') safeContext[cleanText(key, 80)] = cleanText(value, 500);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) safeContext[cleanText(key, 80)] = value;
  }

  const stored = await writeAdminErrorLog({
    name: cleanText(body.error_name, 200) || 'Error',
    message,
    code: cleanText(body.error_code, 100) || null,
    stack: cleanText(body.stack, 8000)
  }, {
    errorType,
    source: cleanText(body.source, 1000),
    pagePath: cleanText(body.page_path, 1000),
    sessionId: cleanText(body.session_id, 200),
    lineNumber: optionalInteger(body.line_number),
    columnNumber: optionalInteger(body.column_number),
    userAgent: cleanText(body.user_agent, 1000),
    isWebdriver: body.is_webdriver === true,
    componentStack: cleanText(body.component_stack, 8000),
    context: safeContext
  });

  if (!stored) return res.status(503).json({ error: 'Error logging is not configured or the database insert failed.' });
  return res.status(202).json({ success: true });
}

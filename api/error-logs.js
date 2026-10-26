import { requireTrustedMutation } from '../server/api-security.js';
import {
  deleteErrorLogs,
  listErrorLogs,
  writeAdminErrorLog,
  withApiErrorLogging
} from '../server/error-logger.js';

const PAGE_SIZE = 100;
const MAX_DELETE_COUNT = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cleanText = (value, maxLength) => typeof value === 'string'
  ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').slice(0, maxLength)
  : '';
const optionalInteger = (value) => Number.isInteger(value) && value >= 0 ? value : null;

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireTrustedMutation(req, res)) return;

  if (req.method === 'GET') {
    const requestedOffset = Number.parseInt(req.query?.offset ?? '0', 10);
    const offset = Number.isFinite(requestedOffset) ? Math.max(0, requestedOffset) : 0;
    const result = await listErrorLogs(offset, PAGE_SIZE);
    return res.status(200).json({ ...result, offset, pageSize: PAGE_SIZE });
  }

  if (req.method === 'POST') {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'An error log object is required.' });
    }

    if (body.action === 'clear') {
      const { ids } = body;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_DELETE_COUNT
        || ids.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))) {
        return res.status(400).json({ error: `Select between 1 and ${MAX_DELETE_COUNT} valid error log IDs to clear.` });
      }
      const deletedIds = await deleteErrorLogs([...new Set(ids)]);
      return res.status(200).json({ success: true, deletedIds });
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
      const safeKey = cleanText(key, 80);
      if (typeof value === 'string') safeContext[safeKey] = cleanText(value, 500);
      else if (typeof value === 'number' || typeof value === 'boolean' || value === null) safeContext[safeKey] = value;
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

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}

export default withApiErrorLogging(handler);

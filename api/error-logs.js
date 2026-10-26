import { requireTrustedMutation } from '../server/api-security.js';
import {
  deleteErrorLogs,
  listErrorLogs,
  withApiErrorLogging
} from '../server/error-logger.js';

const PAGE_SIZE = 100;
const MAX_DELETE_COUNT = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const { action, ids } = req.body || {};
    if (action !== 'clear' || !Array.isArray(ids) || ids.length < 1 || ids.length > MAX_DELETE_COUNT
      || ids.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))) {
      return res.status(400).json({ error: `Select between 1 and ${MAX_DELETE_COUNT} valid error log IDs to clear.` });
    }
    const deletedIds = await deleteErrorLogs([...new Set(ids)]);
    return res.status(200).json({ success: true, deletedIds });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}

export default withApiErrorLogging(handler);

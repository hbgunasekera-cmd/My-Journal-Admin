import { requireTrustedMutation } from '../server/api-security.js';

const MAX_RECIPIENTS = 500;
const BATCH_SIZE = 100;
const APPROVED_FROM = 'My Journal Expedition Logs <notifications@info.myjournalview.com>';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!requireTrustedMutation(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  const emailPayload = req.body?.emailPayload;
  if (!Array.isArray(emailPayload) || emailPayload.length === 0 || emailPayload.length > MAX_RECIPIENTS) {
    return res.status(400).json({ error: `Email payload must contain 1 to ${MAX_RECIPIENTS} messages.` });
  }

  const normalizedMessages = [];
  for (const message of emailPayload) {
    const recipient = Array.isArray(message?.to) && message.to.length === 1 ? message.to[0] : null;
    if (
      typeof recipient !== 'string' || recipient.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) ||
      typeof message?.subject !== 'string' || message.subject.length > 200 ||
      typeof message?.html !== 'string' || message.html.length > 100_000
    ) {
      return res.status(400).json({ error: 'Email payload contains an invalid recipient or message.' });
    }
    normalizedMessages.push({ from: APPROVED_FROM, to: [recipient], subject: message.subject, html: message.html });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return res.status(500).json({ error: 'Email service is not configured.' });

  try {
    const results = [];
    for (let start = 0; start < normalizedMessages.length; start += BATCH_SIZE) {
      const response = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendApiKey}`
        },
        body: JSON.stringify(normalizedMessages.slice(start, start + BATCH_SIZE)),
        signal: AbortSignal.timeout(20_000)
      });

      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('Resend rejected an email batch:', response.status);
        return res.status(502).json({ error: 'Email provider rejected a batch.' });
      }
      results.push(responseData);
    }

    return res.status(200).json({ success: true, batchCount: results.length });
  } catch (error) {
    console.error('Email provider request failed:', error.message);
    return res.status(error.name === 'TimeoutError' ? 504 : 502).json({ error: 'Email provider request failed.' });
  }
}

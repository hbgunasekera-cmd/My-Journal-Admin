import { requireTrustedMutation } from '../server/api-security.js';

const MAX_PROMPT_CHARS = 40_000;
const MAX_OUTPUT_TOKENS = 8_192;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!requireTrustedMutation(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  const apiKey = process.env.ARTICLE_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Article generation is not configured on the server.' });

  const requestBody = req.body;
  if (!Array.isArray(requestBody?.contents)) {
    return res.status(400).json({ error: 'Generation contents are required.' });
  }
  const serializedLength = JSON.stringify(requestBody).length;
  if (serializedLength > 100_000) {
    return res.status(400).json({ error: 'Generation request is too large.' });
  }

  const safeContents = requestBody.contents.map((content) => ({
    role: content?.role === 'model' ? 'model' : 'user',
    parts: (Array.isArray(content?.parts) ? content.parts : [])
      .filter((part) => typeof part?.text === 'string')
      .map((part) => ({ text: part.text }))
  }));
  const promptText = safeContents.flatMap((content) => content.parts)
    .map((part) => part?.text)
    .filter((text) => typeof text === 'string')
    .join('\n');
  if (!promptText || promptText.length > MAX_PROMPT_CHARS) {
    return res.status(400).json({ error: 'Generation prompt is missing or too large.' });
  }

  const generationConfig = requestBody?.generationConfig || {};
  const requestedTokens = Number(generationConfig.maxOutputTokens) || 4096;
  const safeRequest = {
    contents: safeContents,
    generationConfig: {
      ...generationConfig,
      maxOutputTokens: Math.max(256, Math.min(requestedTokens, MAX_OUTPUT_TOKENS)),
      temperature: Math.max(0, Math.min(Number(generationConfig.temperature) || 0.1, 1)),
      responseMimeType: 'application/json'
    }
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(safeRequest),
        signal: AbortSignal.timeout(60_000)
      }
    );

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = response.status === 429 ? 429 : 502;
      return res.status(status).json({ error: { message: result?.error?.message || 'The article service rejected the request.' } });
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error('Article generation request failed:', error.message);
    return res.status(error.name === 'TimeoutError' ? 504 : 502).json({ error: { message: 'Article generation request failed.' } });
  }
}

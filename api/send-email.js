// api/send-email.js
export default async function handler(req, res) {
  // 1. Enforce POST requests only
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { emailPayload } = req.body;
  if (!emailPayload) {
    return res.status(400).json({ error: "Missing email payload metadata." });
  }

  // 2. Access the server-side private key safely
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return res.status(500).json({ error: "Server misconfiguration: Missing API Key." });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify(emailPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `Resend API Error: ${errorText}` });
    }

    const data = await response.json();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
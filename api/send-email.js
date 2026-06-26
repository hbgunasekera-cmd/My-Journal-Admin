// api/send-email.js

export default async function handler(req, res) {
  // Reject incoming non-POST traffic
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const { emailPayload } = req.body;
  if (!emailPayload) {
    return res.status(400).json({ error: "Missing email container compilation payload." });
  }

  // Retrieve private token bound exclusively to backend scope environments
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return res.status(500).json({ error: "Server error: RESEND_API_KEY environment variable is not configured." });
  }

  try {
    // Perform server-to-server connection to Resend (No CORS constraints apply)
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify(emailPayload)
    });

    const responseData = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: responseData.message || "Upstream provider communication error returned from Resend." 
      });
    }

    return res.status(200).json({ success: true, data: responseData });
  } catch (error) {
    return res.status(500).json({ error: `Internal execution error: ${error.message}` });
  }
}
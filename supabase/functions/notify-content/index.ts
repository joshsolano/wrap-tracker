import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const CONTENT_EMAIL  = Deno.env.get('CONTENT_EMAIL')!
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL') ?? 'onboarding@resend.dev'
const APP_URL        = 'https://wrap-tracker-hazel.vercel.app'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildEmail(projectName: string, type: 'before' | 'after'): { subject: string; html: string } {
  const isBefore = type === 'before'

  const subject = isBefore
    ? `📷 Before shots needed — ${projectName}`
    : `🎬 After shots needed — ${projectName}`

  const accentColor = isBefore ? '#FFB800' : '#30D158'
  const icon = isBefore ? '📷' : '🎬'
  const headline = isBefore ? 'Before Shots Needed' : 'After Shots Needed'
  const body = isBefore
    ? `<strong>${projectName}</strong> has just been added to the system and is ready to wrap. Head over before work begins to capture your <strong>before photos and video</strong>.`
    : `<strong>${projectName}</strong> has been completed. Now's the perfect time to capture your <strong>after photos and video</strong> while everything looks fresh.`
  const btnText = isBefore ? 'View Project →' : 'View Project →'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;">

        <!-- Header -->
        <tr><td style="background:#111;border-radius:16px 16px 0 0;padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="font-size:22px;font-weight:900;letter-spacing:-0.03em;color:#fff;">
                  <span style="color:${accentColor}">WRAP</span> GFX
                </span>
              </td>
              <td align="right">
                <span style="font-size:28px;">${icon}</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:32px;">

          <!-- Badge -->
          <div style="display:inline-block;background:${accentColor}20;border:1px solid ${accentColor}44;border-radius:30px;padding:5px 14px;margin-bottom:20px;">
            <span style="font-size:12px;font-weight:800;color:${accentColor};letter-spacing:0.07em;text-transform:uppercase;">${headline}</span>
          </div>

          <!-- Project name -->
          <h1 style="margin:0 0 16px;font-size:26px;font-weight:900;color:#111;letter-spacing:-0.02em;line-height:1.2;">${projectName}</h1>

          <!-- Description -->
          <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.6;">${body}</p>

          <!-- CTA Button -->
          <a href="${APP_URL}" style="display:inline-block;background:${accentColor};color:#111;font-size:15px;font-weight:800;text-decoration:none;padding:14px 28px;border-radius:12px;letter-spacing:-0.01em;">
            ${btnText}
          </a>

        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9f9f9;border-top:1px solid #eee;border-radius:0 0 16px 16px;padding:20px 32px;">
          <p style="margin:0;font-size:12px;color:#999;line-height:1.5;">
            You're receiving this because you're the content person for Wrap GFX.<br/>
            Log in at <a href="${APP_URL}" style="color:#999;">${APP_URL}</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { subject, html }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { projectName, type } = await req.json() as { projectName: string; type: 'before' | 'after' }
    const { subject, html } = buildEmail(projectName, type)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: CONTENT_EMAIL, subject, html }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('Resend error:', JSON.stringify(data))
      return new Response(
        JSON.stringify({ error: data?.message ?? JSON.stringify(data) }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
      )
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', ...CORS } })
  } catch (e) {
    console.error('Function error:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } })
  }
})

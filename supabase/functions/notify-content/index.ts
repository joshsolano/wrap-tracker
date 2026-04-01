import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const CONTENT_EMAIL  = Deno.env.get('CONTENT_EMAIL')!   // content guy's email
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL')!       // e.g. noreply@yourdomain.com

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const { projectName, type } = await req.json() as { projectName: string; type: 'before' | 'after' }

    const subject = type === 'before'
      ? `📷 New project — get before shots: ${projectName}`
      : `🎬 Project complete — get after shots: ${projectName}`

    const html = type === 'before'
      ? `<h2>New project added</h2><p><strong>${projectName}</strong> has been entered into the system.</p><p>Head over to get your <strong>before photos and video</strong> before the wrap starts.</p>`
      : `<h2>Project complete</h2><p><strong>${projectName}</strong> has been wrapped.</p><p>Now's the time to get your <strong>after photos and video</strong> for content.</p>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: CONTENT_EMAIL, subject, html }),
    })

    const data = await res.json()
    if (!res.ok) return new Response(JSON.stringify({ error: data }), { status: 500, headers: { 'Content-Type': 'application/json' } })

    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})

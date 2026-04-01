import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const CONTENT_EMAIL  = Deno.env.get('CONTENT_EMAIL')!
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL') ?? 'onboarding@resend.dev'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { projectName, type } = await req.json() as { projectName: string; type: 'before' | 'after' }

    const subject = type === 'before'
      ? `📷 Before shots needed — ${projectName}`
      : `🎬 After shots needed — ${projectName}`

    const html = type === 'before'
      ? `<h2 style="font-family:sans-serif">Before shots needed</h2><p style="font-family:sans-serif"><strong>${projectName}</strong> has just been added to the system.</p><p style="font-family:sans-serif">Get your <strong>before photos and video</strong> before the wrap begins.</p>`
      : `<h2 style="font-family:sans-serif">After shots needed</h2><p style="font-family:sans-serif"><strong>${projectName}</strong> has been completed.</p><p style="font-family:sans-serif">Time to get your <strong>after photos and video</strong> for content.</p>`

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

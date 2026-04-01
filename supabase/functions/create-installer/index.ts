import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify the calling user is an admin using their JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Admin client uses service role — only available server-side
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify caller is admin using their anon-key client
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user: callerUser }, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !callerUser) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if caller is an admin installer
    const { data: callerInstaller } = await adminClient
      .from('installers')
      .select('role')
      .eq('user_id', callerUser.id)
      .eq('active', true)
      .single()

    // If not an admin installer, check if they're a manager
    let isAdmin = callerInstaller?.role === 'admin'
    if (!isAdmin) {
      const { data: callerManager } = await adminClient
        .from('managers')
        .select('id')
        .eq('user_id', callerUser.id)
        .single()
      isAdmin = !!callerManager
    }

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse body
    const { email, password, name, color, birthday, role, is_manager } = await req.json()
    if (!email || !password || !name) {
      return new Response(JSON.stringify({ error: 'email, password, and name are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create auth user
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createErr || !newUser.user) {
      return new Response(JSON.stringify({ error: createErr?.message ?? 'Failed to create user' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (is_manager) {
      // Insert into managers table
      const { data: manager, error: insertErr } = await adminClient
        .from('managers')
        .insert({ user_id: newUser.user.id, name: name.trim() })
        .select()
        .single()

      if (insertErr) {
        await adminClient.auth.admin.deleteUser(newUser.user.id)
        return new Response(JSON.stringify({ error: insertErr.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ manager }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Insert installer row
    const { data: installer, error: insertErr } = await adminClient
      .from('installers')
      .insert({
        user_id:  newUser.user.id,
        name:     name.trim(),
        color:    color ?? '#F5C400',
        birthday: birthday ?? null,
        role:     role === 'admin' ? 'admin' : 'installer',
        active:   true,
      })
      .select()
      .single()

    if (insertErr) {
      // Roll back: delete the auth user if installer insert failed
      await adminClient.auth.admin.deleteUser(newUser.user.id)
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ installer }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

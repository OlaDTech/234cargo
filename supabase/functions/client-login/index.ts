import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

async function hashToken(token: string) {
  const bytes = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function createSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server configuration is incomplete' }, 500)

  try {
    const body = await req.json()
    const identifier = String(body.identifier || '').trim()
    const password = String(body.password || '')
    if (!identifier || !password) return json({ error: 'Enter your phone number or shipping mark and password.' }, 400)

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let result = await admin
      .from('clients')
      .select('id, full_name, phone, country, state, shipping_mark, notes, created_at, updated_at, password_hash')
      .eq('phone', identifier)
      .maybeSingle()

    if (!result.data && !result.error) {
      result = await admin
        .from('clients')
        .select('id, full_name, phone, country, state, shipping_mark, notes, created_at, updated_at, password_hash')
        .eq('shipping_mark', identifier)
        .maybeSingle()
    }

    const client = result.data
    const passwordMatches = client
      ? (client.password_hash.startsWith('$2')
        ? await bcrypt.compare(password, client.password_hash)
        : client.password_hash === password)
      : false
    if (result.error || !client || !passwordMatches) {
      return json({ error: 'Invalid phone number, shipping mark, or password.' }, 401)
    }

    // Existing demo passwords are upgraded to bcrypt at the first successful
    // secure sign-in. New passwords are hashed by the database trigger.
    if (!client.password_hash.startsWith('$2')) {
      await admin.from('clients').update({ password_hash: await bcrypt.hash(password, 12) }).eq('id', client.id)
    }

    const sessionToken = createSessionToken()
    const tokenHash = await hashToken(sessionToken)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    // Cleanup is best effort. It keeps the session table bounded without
    // interfering with a successful client sign-in.
    await admin.from('client_sessions').delete().lt('expires_at', new Date().toISOString())

    const { error: sessionError } = await admin.from('client_sessions').insert({
      client_id: client.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    if (sessionError) return json({ error: 'Could not create a secure client session.' }, 500)

    const { password_hash: _passwordHash, ...safeClient } = client
    return json({ client: safeClient, session_token: sessionToken, expires_at: expiresAt })
  } catch {
    return json({ error: 'Could not sign in right now. Please try again.' }, 500)
  }
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

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

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authorization = req.headers.get('Authorization') || ''
  const sessionToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!sessionToken) return json({ error: 'Client sign-in is required.' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server configuration is incomplete' }, 500)

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const tokenHash = await hashToken(sessionToken)
    const { data: session, error: sessionError } = await admin
      .from('client_sessions')
      .select('id, client_id')
      .eq('token_hash', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (sessionError || !session) return json({ error: 'Your secure client session has expired. Please sign in again.' }, 401)

    await admin.from('client_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', session.id)

    const [accountsResult, transactionsResult] = await Promise.all([
      admin
        .from('wallet_accounts')
        .select('currency, available_balance, held_balance, updated_at')
        .eq('client_id', session.client_id)
        .order('currency'),
      admin
        .from('wallet_transactions')
        .select('id, currency, entry_type, direction, amount, status, description, created_at, approved_at, balance_after')
        .eq('client_id', session.client_id)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    if (accountsResult.error || transactionsResult.error) {
      return json({ error: 'Could not load your prepaid balance.' }, 500)
    }

    return json({
      balances: accountsResult.data || [],
      transactions: transactionsResult.data || [],
    })
  } catch {
    return json({ error: 'Could not load your prepaid balance.' }, 500)
  }
})

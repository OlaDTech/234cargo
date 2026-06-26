import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

const supportedPlatforms = new Set(['1688', 'taobao', 'pinduoduo', 'other'])

async function hashToken(token: string) {
  const bytes = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function getClientSession(req: Request) {
  const authorization = req.headers.get('Authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return { error: 'Client sign-in is required.' }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return { error: 'Server configuration is incomplete' }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const tokenHash = await hashToken(token)
  const { data: session, error } = await admin
    .from('client_sessions')
    .select('id, client_id')
    .eq('token_hash', tokenHash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error || !session) return { error: 'Your secure client session has expired. Please sign in again.' }
  await admin.from('client_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', session.id)
  return { admin, clientId: session.client_id }
}

function text(value: unknown, maxLength: number) {
  return String(value || '').trim().slice(0, maxLength)
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const context = await getClientSession(req)
    if ('error' in context) return json({ error: context.error }, context.error.includes('configuration') ? 500 : 401)
    const { admin, clientId } = context

    if (req.method === 'GET') {
      const [clientResult, goodsResult, announcementsResult, suppliersResult, messagesResult, receiptsResult, settingsResult, purchasesResult] = await Promise.all([
        admin.from('clients').select('id, full_name, phone, country, state, shipping_mark, notes, created_at, updated_at').eq('id', clientId).single(),
        admin.from('goods').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
        admin.from('announcements').select('id, title, body, is_important, created_at').order('created_at', { ascending: false }),
        admin.from('suppliers').select('id, name, contact, category, address, notes, created_at').order('name'),
        admin.from('messages').select('id, sender, message, is_read, created_at').eq('client_id', clientId).order('created_at'),
        admin.from('receipts').select('id, receipt_no, goods_id, items, subtotal, discount, total, currency, status, issued_at, paid_at').eq('client_id', clientId).order('issued_at', { ascending: false }),
        admin.from('settings').select('key, value'),
        admin.from('purchase_requests').select('id, platform, product_name, variant, quantity, status, quoted_amount_rmb, team_notes, created_at, updated_at').eq('client_id', clientId).order('created_at', { ascending: false }),
      ])

      if (clientResult.error || goodsResult.error || announcementsResult.error || suppliersResult.error || messagesResult.error || receiptsResult.error || settingsResult.error || purchasesResult.error) {
        return json({ error: 'Could not load your client portal.' }, 500)
      }

      return json({
        client: clientResult.data,
        goods: goodsResult.data || [],
        announcements: announcementsResult.data || [],
        suppliers: suppliersResult.data || [],
        messages: messagesResult.data || [],
        receipts: receiptsResult.data || [],
        settings: Object.fromEntries((settingsResult.data || []).map(item => [item.key, item.value])),
        purchase_requests: purchasesResult.data || [],
      })
    }

    const body = await req.json()
    const action = text(body.action, 40)

    if (action === 'send_message') {
      const message = text(body.message, 2000)
      if (!message) return json({ error: 'Enter a message before sending.' }, 400)
      const { data, error } = await admin.from('messages').insert({ client_id: clientId, sender: 'client', message }).select('id, sender, message, is_read, created_at').single()
      return error ? json({ error: 'Could not send your message.' }, 500) : json({ message: data })
    }

    if (action === 'submit_purchase_request') {
      const platform = text(body.platform, 20).toLowerCase()
      const productLink = text(body.product_link, 2000)
      const quantity = Math.min(10000, Math.max(1, Number.parseInt(String(body.quantity || 1), 10) || 1))
      try {
        const parsed = new URL(productLink)
        if (!['https:', 'http:'].includes(parsed.protocol) || !supportedPlatforms.has(platform)) throw new Error('invalid')
      } catch {
        return json({ error: 'Enter a valid marketplace link and platform.' }, 400)
      }

      const { data, error } = await admin.from('purchase_requests').insert({
        client_id: clientId,
        platform,
        product_link: productLink,
        product_name: text(body.product_name, 250) || null,
        variant: text(body.variant, 250) || null,
        quantity,
        notes: text(body.notes, 2000) || null,
      }).select('id, platform, product_name, variant, quantity, status, created_at').single()
      return error ? json({ error: 'Could not submit your purchase request.' }, 500) : json({ purchase_request: data })
    }

    if (action === 'pay_receipt') {
      const receiptId = text(body.receipt_id, 80)
      if (!receiptId) return json({ error: 'Choose a receipt to pay.' }, 400)
      const { data, error } = await admin.rpc('pay_wallet_receipt', {
        p_client_id: clientId,
        p_receipt_id: receiptId,
        p_initiated_by_client: true,
      })
      return error ? json({ error: error.message || 'Could not pay this receipt from your wallet.' }, 400) : json({ transaction: data })
    }

    if (action === 'pay_purchase_request') {
      const purchaseRequestId = text(body.purchase_request_id, 80)
      if (!purchaseRequestId) return json({ error: 'Choose a purchase request to pay.' }, 400)
      const { data, error } = await admin.rpc('pay_wallet_purchase', {
        p_client_id: clientId,
        p_purchase_request_id: purchaseRequestId,
        p_initiated_by_client: true,
      })
      return error ? json({ error: error.message || 'Could not pay this purchase request from your wallet.' }, 400) : json({ transaction: data })
    }

    return json({ error: 'Unknown client portal action.' }, 400)
  } catch {
    return json({ error: 'Could not process your request right now.' }, 500)
  }
})

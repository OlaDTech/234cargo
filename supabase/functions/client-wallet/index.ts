import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

const TOPUP_RECEIPT_BUCKET = 'topup-receipts'
const paymentMethods = new Set(['cash_office', 'bank_transfer'])
const allowedProofTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

function text(value: unknown, maxLength: number) {
  return String(value || '').trim().slice(0, maxLength)
}

async function hashToken(token: string) {
  const bytes = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function decodeBase64(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function extensionForProof(fileName: string, mimeType: string) {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext && ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext)) return ext === 'jpeg' ? 'jpg' : ext
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'application/pdf') return 'pdf'
  return 'jpg'
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

    if (req.method === 'POST') {
      const body = await req.json()
      const action = text(body.action, 40)
      if (action !== 'request_topup') return json({ error: 'Unknown wallet action.' }, 400)

      const currency = text(body.currency, 10).toUpperCase()
      const amount = Math.round((Number(body.amount) || 0) * 100) / 100
      const paymentMethod = text(body.payment_method, 30)
      if (!['NGN', 'RMB'].includes(currency)) return json({ error: 'Choose NGN or RMB for the wallet currency.' }, 400)
      if (amount <= 0) return json({ error: 'Enter a top-up amount greater than zero.' }, 400)
      if (!paymentMethods.has(paymentMethod)) return json({ error: 'Choose cash to office or bank transfer.' }, 400)

      const proof = body.proof_file && typeof body.proof_file === 'object' ? (body.proof_file as Record<string, unknown>) : null
      if (paymentMethod === 'bank_transfer' && !proof) {
        return json({ error: 'Upload your bank transfer receipt before submitting.' }, 400)
      }

      let proofUrl: string | null = null
      if (proof) {
        const mimeType = text(proof.type, 80) || 'application/octet-stream'
        if (!allowedProofTypes.has(mimeType)) return json({ error: 'Receipt must be a JPG, PNG, WEBP, or PDF file.' }, 400)
        const proofData = typeof proof.data === 'string' ? proof.data : ''
        if (!proofData || proofData.length > 8 * 1024 * 1024) return json({ error: 'Receipt file must be under 5MB.' }, 400)
        const bytes = decodeBase64(proofData)
        if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
          return json({ error: 'Receipt file must be under 5MB.' }, 400)
        }
        const extension = extensionForProof(text(proof.name, 160), mimeType)
        const path = `${session.client_id}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await admin.storage
          .from(TOPUP_RECEIPT_BUCKET)
          .upload(path, new Blob([bytes], { type: mimeType }), { contentType: mimeType, upsert: false })
        if (uploadError) return json({ error: 'Could not upload your transaction receipt.' }, 500)
        const { data: publicUrl } = admin.storage.from(TOPUP_RECEIPT_BUCKET).getPublicUrl(path)
        proofUrl = publicUrl.publicUrl
      }

      const methodLabel = paymentMethod === 'bank_transfer' ? 'Bank transfer' : 'Cash to office'
      const { data, error } = await admin.from('wallet_transactions').insert({
        client_id: session.client_id,
        currency,
        entry_type: 'cash_topup',
        direction: 'credit',
        amount,
        status: 'pending',
        payment_method: paymentMethod,
        payment_proof_url: proofUrl,
        cash_reference: text(body.cash_reference, 120) || null,
        office_location: paymentMethod === 'cash_office' ? (text(body.office_location, 160) || 'Nigeria office') : null,
        description: text(body.description, 500) || `${methodLabel} top-up request`,
      }).select('id, currency, entry_type, direction, amount, status, description, cash_reference, office_location, payment_method, payment_proof_url, created_at').single()

      return error ? json({ error: 'Could not submit your top-up request.' }, 500) : json({ transaction: data })
    }

    const [accountsResult, transactionsResult] = await Promise.all([
      admin
        .from('wallet_accounts')
        .select('currency, available_balance, held_balance, updated_at')
        .eq('client_id', session.client_id)
        .order('currency'),
      admin
        .from('wallet_transactions')
        .select('id, currency, entry_type, direction, amount, status, description, cash_reference, office_location, payment_method, payment_proof_url, created_at, approved_at, balance_after')
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

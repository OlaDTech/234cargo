import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase env vars. Copy .env.example to .env and fill in your values.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
})

// ── Auth helpers ────────────────────────────────────────────

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getCurrentProfile(userId) {
  const session = userId ? null : await getSession()
  const id = userId || session?.user?.id
  if (!id) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

// ── Client auth ──────────────────────────────────────────────
export async function clientSignIn(identifier, password) {
  const credentials = { identifier: String(identifier || '').trim(), password: String(password || '') }
  const { data: secureData, error: secureError } = await supabase.functions.invoke('client-login', {
    body: credentials,
  })

  if (!secureError && secureData?.client && secureData?.session_token) {
    return {
      client: secureData.client,
      sessionToken: secureData.session_token,
      expiresAt: secureData.expires_at,
    }
  }
  throw new Error(secureData?.error || 'Could not sign in securely. Check your details and try again.')
}

export async function getClientWallet(sessionToken) {
  if (!sessionToken) throw new Error('Sign out and sign back in to view your secure prepaid balance.')
  const { data, error } = await supabase.functions.invoke('client-wallet', {
    method: 'GET',
    headers: { Authorization: `Bearer ${sessionToken}` },
  })
  if (error) throw new Error(await functionErrorMessage(error, data, 'Could not load your prepaid balance. Please sign in again if the problem continues.'))
  if (data?.error) throw new Error(data.error)
  return data
}

async function functionErrorMessage(error, data, fallback) {
  if (data?.error) return data.error

  const response = error?.context
  if (response && typeof response.clone === 'function') {
    try {
      const body = await response.clone().json()
      if (body?.error) return body.error
      if (body?.message) return body.message
    } catch {
      // Fall through to the generic fallback below.
    }
  }

  if (error?.message && !String(error.message).toLowerCase().includes('edge function returned')) {
    return error.message
  }
  return fallback
}

async function fileToBase64Payload(file) {
  if (!file) return null
  const prepared = file.type?.startsWith('image/') ? await compressImage(file, 1200, 0.78) : file
  if (prepared.size > 5 * 1024 * 1024) {
    throw new Error('Receipt file is too large. Please upload an image or PDF under 5MB.')
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read the receipt file.'))
    reader.readAsDataURL(prepared)
  })
  const [, base64 = ''] = dataUrl.split(',')
  return {
    name: prepared.name || file.name || 'payment-receipt',
    type: prepared.type || file.type || 'application/octet-stream',
    data: base64,
  }
}

export async function submitClientTopUpRequest(sessionToken, payload) {
  if (!sessionToken) throw new Error('Sign out and sign back in to request a wallet top-up.')
  const proof_file = await fileToBase64Payload(payload.proofFile)
  const { data, error } = await supabase.functions.invoke('client-wallet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sessionToken}` },
    body: {
      action: 'request_topup',
      currency: payload.currency,
      amount: payload.amount,
      payment_method: payload.paymentMethod,
      cash_reference: payload.reference || '',
      office_location: payload.officeLocation || '',
      description: payload.description || '',
      proof_file,
    },
  })
  if (error) throw new Error(await functionErrorMessage(error, data, 'Could not send your top-up request. Please try again.'))
  if (data?.error) throw new Error(data.error)
  return data
}

async function invokeClientPortal(sessionToken, options = {}) {
  if (!sessionToken) throw new Error('Sign out and sign back in to continue securely.')
  const { data, error } = await supabase.functions.invoke('client-portal', {
    ...options,
    headers: { Authorization: `Bearer ${sessionToken}`, ...(options.headers || {}) },
  })
  if (error) throw new Error(await functionErrorMessage(error, data, 'Could not reach your secure client portal. Please sign in again if the problem continues.'))
  if (data?.error) throw new Error(data.error)
  return data
}

export function getClientPortal(sessionToken) {
  return invokeClientPortal(sessionToken, { method: 'GET' })
}

export function sendClientPortalMessage(sessionToken, message) {
  return invokeClientPortal(sessionToken, { body: { action: 'send_message', message } })
}

export function submitClientPurchaseRequest(sessionToken, payload) {
  return invokeClientPortal(sessionToken, { body: { action: 'submit_purchase_request', ...payload } })
}

export function payClientReceipt(sessionToken, receiptId) {
  return invokeClientPortal(sessionToken, { body: { action: 'pay_receipt', receipt_id: receiptId } })
}

export function payClientPurchase(sessionToken, purchaseRequestId) {
  return invokeClientPortal(sessionToken, { body: { action: 'pay_purchase_request', purchase_request_id: purchaseRequestId } })
}

// ── Settings ───────────────────────────────────────────────

export async function createWalletCashTopup(payload) {
  const { data, error } = await supabase.rpc('create_wallet_cash_topup', {
    p_client_id: payload.clientId,
    p_currency: payload.currency,
    p_amount: payload.amount,
    p_cash_reference: payload.cashReference || null,
    p_description: payload.description || null,
    p_office_location: payload.officeLocation || 'Nigeria office',
  })
  if (error) throw error
  return data
}

export async function approveWalletCashTopup(transactionId) {
  const { data, error } = await supabase.rpc('approve_wallet_cash_topup', { p_transaction_id: transactionId })
  if (error) throw error
  return data
}

export async function recordWalletEntry(payload) {
  const { data, error } = await supabase.rpc('record_wallet_entry', {
    p_client_id: payload.clientId,
    p_currency: payload.currency,
    p_amount: payload.amount,
    p_entry_type: payload.entryType,
    p_reference_type: payload.referenceType || null,
    p_reference_id: payload.referenceId || null,
    p_description: payload.description || null,
  })
  if (error) throw error
  return data
}

export async function payWalletReceipt(clientId, receiptId) {
  const { data, error } = await supabase.rpc('pay_wallet_receipt', {
    p_client_id: clientId,
    p_receipt_id: receiptId,
    p_initiated_by_client: false,
  })
  if (error) throw error
  return data
}

export async function payWalletPurchase(clientId, purchaseRequestId) {
  const { data, error } = await supabase.rpc('pay_wallet_purchase', {
    p_client_id: clientId,
    p_purchase_request_id: purchaseRequestId,
    p_initiated_by_client: false,
  })
  if (error) throw error
  return data
}

export async function getSettings() {
  const { data, error } = await supabase.from('settings').select('key, value')
  if (error) throw error
  return Object.fromEntries(data.map(r => [r.key, r.value]))
}

export async function updateSetting(key, value) {
  const { error } = await supabase
    .from('settings')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key)
  if (error) throw error
}

// ── Clients ────────────────────────────────────────────────

export async function getClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getClientByIdentifier(identifier) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .or(`phone.eq.${identifier},shipping_mark.eq.${identifier}`)
    .single()
  if (error) return null
  return data
}

export async function createClientRecord(payload) {
  // Generate shipping mark via DB function
  const { data: mark, error: markErr } = await supabase
    .rpc('generate_shipping_mark', { client_name: payload.full_name })
  if (markErr) throw markErr

  const { data, error } = await supabase
    .from('clients')
    .insert({ ...payload, shipping_mark: mark })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateClient(id, payload) {
  const { data, error } = await supabase
    .from('clients')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Goods ──────────────────────────────────────────────────

export async function getGoods(filters = {}) {
  let q = supabase
    .from('goods')
    .select(`
      *,
      client:clients(id, full_name, phone, shipping_mark, country, state),
      container:containers(container_no, status, route)
    `)
    .order('created_at', { ascending: false })

  if (filters.clientId) q = q.eq('client_id', filters.clientId)
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.type) q = q.eq('type', filters.type)

  const { data, error } = await q
  if (error) throw error
  return data
}

export async function createGoods(payload) {
  const { data, error } = await supabase
    .from('goods')
    .insert(payload)
    .select(`*, client:clients(full_name, shipping_mark)`)
    .single()
  if (error) throw error
  return data
}

export async function updateGoods(id, payload) {
  const { data, error } = await supabase
    .from('goods')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getGoodsByTracking(trackingNo) {
  const { data, error } = await supabase
    .from('goods')
    .select(`*, client:clients(full_name, shipping_mark, phone)`)
    .eq('tracking_no', trackingNo)
    .single()
  if (error) return null
  return data
}

// ── Upload photo ───────────────────────────────────────────

async function compressImage(file, maxSize = 1600, quality = 0.78) {
  if (!file?.type?.startsWith('image/')) return file

  const bitmap = await createImageBitmap(file)
  const ratio = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * ratio))
  const height = Math.max(1, Math.round(bitmap.height * ratio))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) return file

  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
}

export async function uploadGoodsPhoto(file, goodsId) {
  const compressed = await compressImage(file)
  const ext = compressed.name.split('.').pop() || 'jpg'
  const path = `${goodsId}/${Date.now()}.${ext}`
  const { data, error } = await supabase.storage
    .from('goods-photos')
    .upload(path, compressed, { upsert: false, contentType: compressed.type || 'image/jpeg' })
  if (error) throw error
  const { data: urlData } = supabase.storage.from('goods-photos').getPublicUrl(path)
  return urlData.publicUrl
}

export async function uploadSupplierPhoto(file, supplierId) {
  const compressed = await compressImage(file, 1200, 0.76)
  const ext = compressed.name.split('.').pop() || 'jpg'
  const path = `${supplierId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage
    .from('supplier-photos')
    .upload(path, compressed, { upsert: false, contentType: compressed.type || 'image/jpeg' })
  if (error) throw error
  const { data: urlData } = supabase.storage.from('supplier-photos').getPublicUrl(path)
  return urlData.publicUrl
}

// ── Containers ─────────────────────────────────────────────

export async function getContainers() {
  const { data, error } = await supabase
    .from('containers')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createContainer(payload) {
  const { data, error } = await supabase
    .from('containers')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateContainer(id, payload) {
  const { data, error } = await supabase
    .from('containers')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Receipts ───────────────────────────────────────────────

export async function getReceipts(clientId) {
  let q = supabase
    .from('receipts')
    .select(`*, client:clients(full_name, phone, shipping_mark), goods:goods(description, type)`)
    .order('issued_at', { ascending: false })
  if (clientId) q = q.eq('client_id', clientId)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function createReceipt(payload) {
  const { data: recNo } = await supabase.rpc('generate_receipt_no')
  const { data, error } = await supabase
    .from('receipts')
    .insert({ ...payload, receipt_no: recNo })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateReceiptStatus(id, status) {
  const { error } = await supabase
    .from('receipts')
    .update({ status, paid_at: status === 'paid' ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}

// ── Announcements ──────────────────────────────────────────

export async function getAnnouncements() {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createAnnouncement(payload) {
  const { data, error } = await supabase
    .from('announcements')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteAnnouncement(id) {
  const { error } = await supabase.from('announcements').delete().eq('id', id)
  if (error) throw error
}

// ── Suppliers ──────────────────────────────────────────────

export async function getSuppliers() {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('name')
  if (error) throw error
  return data
}

export async function createSupplier(payload) {
  const { data, error } = await supabase.from('suppliers').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function deleteSupplier(id) {
  const { error } = await supabase.from('suppliers').delete().eq('id', id)
  if (error) throw error
}

// ── Messages ───────────────────────────────────────────────

export async function getMessages(clientId) {
  let q = supabase
    .from('messages')
    .select('*, client:clients(full_name)')
    .order('created_at', { ascending: true })
  if (clientId) q = q.eq('client_id', clientId)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function sendMessage(clientId, sender, message) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ client_id: clientId, sender, message })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function subscribeToMessages(clientId, callback) {
  return supabase
    .channel(`messages:${clientId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `client_id=eq.${clientId}`,
    }, payload => callback(payload.new))
    .subscribe()
}

// ── Scan log ───────────────────────────────────────────────

export async function logScan(scannedValue, goodsId, scannedBy, result) {
  await supabase.from('scan_logs').insert({ scanned_value: scannedValue, goods_id: goodsId, scanned_by: scannedBy, result })
}

// ── Dashboard stats ────────────────────────────────────────

export async function getDashboardStats() {
  const [
    { count: totalClients },
    { count: totalGoods },
    { count: inTransit },
    { count: delivered },
    { data: cbmData },
    { count: todayGoods },
  ] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('goods').select('*', { count: 'exact', head: true }),
    supabase.from('goods').select('*', { count: 'exact', head: true }).eq('status', 'in_transit'),
    supabase.from('goods').select('*', { count: 'exact', head: true }).eq('status', 'delivered'),
    supabase.from('goods').select('cbm').not('cbm', 'is', null),
    supabase.from('goods').select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString()),
  ])
  const totalCbm = (cbmData || []).reduce((s, r) => s + (r.cbm || 0), 0)
  return { totalClients, totalGoods, inTransit, delivered, totalCbm, todayGoods }
}

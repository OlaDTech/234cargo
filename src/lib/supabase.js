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
// Clients log in with phone/shipping_mark + a plaintext password column.
// NOTE: For production, swap password_hash comparison for a Supabase
// Edge Function that checks a bcrypt hash server-side instead of
// comparing plaintext client-side (see README "Hardening" section).

export async function clientSignIn(identifier, password) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .or(`phone.eq.${identifier},shipping_mark.eq.${identifier}`)
    .single()
  if (error || !data) throw new Error('Client not found')
  if (data.password_hash !== password) throw new Error('Incorrect password')
  return data
}

// ── Settings ───────────────────────────────────────────────

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

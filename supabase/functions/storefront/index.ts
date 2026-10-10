import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Content-Type': 'application/json' }
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (!['GET','POST'].includes(req.method)) return reply({error:'Method not allowed'},405)
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer /,'')
    if (!token) return reply({error:'Sign in to view your orders'},401)
    const db = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))
    const hash = Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')
    const {data:session,error} = await db.from('client_sessions').select('client_id').eq('token_hash',hash).gt('expires_at',new Date().toISOString()).maybeSingle()
    if (error || !session) return reply({error:'Session expired. Please sign in again.'},401)
    if (req.method === 'GET') {
      const {data,error} = await db.from('store_orders').select('*').eq('client_id',session.client_id).order('created_at',{ascending:false}).limit(100)
      if (error) throw error
      return reply({orders:data})
    }
    const raw = await req.text()
    if (raw.length > 20000) return reply({error:'Order is too large'},413)
    const body = JSON.parse(raw)
    if (body.action === 'cancel') {
      if (!/^[0-9a-f-]{36}$/i.test(body.order_id || '')) return reply({error:'Invalid order'},400)
      const {data,error} = await db.from('store_orders').update({status:'cancelled'})
        .eq('id',body.order_id).eq('client_id',session.client_id).eq('status','pending').select('id').maybeSingle()
      if(error) return reply({error:'Unable to cancel order'},500)
      if(!data) return reply({error:'Only your pending orders can be cancelled. Refresh to see the latest status.'},409)
      return reply({id:data.id})
    }
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 50 || !/^[0-9a-f-]{36}$/i.test(body.request_id || '')) return reply({error:'Invalid order'},400)
    const {data,error:orderError} = await db.rpc('place_store_order',{p_client:session.client_id,p_request:body.request_id,p_items:body.items,p_notes:String(body.notes || '').slice(0,1000)})
    if (orderError) return reply({error:orderError.message},400)
    return reply({id:data},201)
  } catch { return reply({error:'Unable to process the order. Please try again.'},500) }
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { validateSubscription } from '../_shared/push-validation.ts'
const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Content-Type':'application/json', 'Cache-Control':'no-store' }
const json=(body: unknown,status=200)=>new Response(JSON.stringify(body),{status,headers})
Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers})
 if(req.method!=='POST') return json({error:'Method not allowed'},405)
 try {
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'')
  if(!token) return json({error:'Sign in first'},401)
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')
  const {data:session,error:sessionError}=await db.from('client_sessions').select('id,client_id,expires_at').eq('token_hash',hash).gt('expires_at',new Date().toISOString()).maybeSingle()
  if(sessionError) throw sessionError
  let staffId:string|null=null
  if(!session) {
   const {data,error}=await db.auth.getUser(token)
   if(error||!data.user) return json({error:'Please sign in again'},401)
   const profile=await db.from('profiles').select('role').eq('id',data.user.id).single()
   if(profile.error||profile.data?.role!=='admin') return json({error:'Push notifications are available to clients and administrators'},403)
   staffId=data.user.id
  }
  const raw=await req.text()
  if(raw.length>4096) return json({error:'Request too large'},413)
  const body=JSON.parse(raw)
  const owner=(query:any)=>session?query.eq('client_id',session.client_id):query.eq('staff_id',staffId)
  if(body.action==='config') {
   const publicKey=Deno.env.get('VAPID_PUBLIC_KEY')
   if(!publicKey) return json({error:'Notifications are not configured yet'},503)
   return json({publicKey})
  }
  if(body.action==='remove') {
   if(typeof body.endpoint!=='string'||body.endpoint.length>2048) return json({error:'Invalid endpoint'},400)
   const result=await owner(db.from('push_subscriptions').delete().eq('endpoint',body.endpoint))
   if(result.error) throw result.error
   return json({ok:true})
  }
  if(body.action!=='subscribe') return json({error:'Invalid action'},400)
  let subscription
  try {subscription=validateSubscription(body.subscription)} catch {return json({error:'Invalid or unsupported push subscription'},400)}
  const existing=await db.from('push_subscriptions').select('client_id,staff_id').eq('endpoint',subscription.endpoint).maybeSingle()
  if(existing.error) throw existing.error
  if(existing.data && (existing.data.client_id!==(session?.client_id||null)||existing.data.staff_id!==staffId)) return json({error:'This device is linked to another account. Turn notifications off before switching accounts.'},409)
  const count=await owner(db.from('push_subscriptions').select('id',{count:'exact',head:true}))
  if(count.error) throw count.error
  if(!existing.data && (count.count||0)>=10) return json({error:'Device limit reached. Disable notifications on an old device.'},409)
  const expiry=new Date(Math.min(Date.now()+30*86400000,session?Date.parse(session.expires_at):Infinity)).toISOString()
  const result=await db.rpc('save_push_subscription',{p_endpoint:subscription.endpoint,p_p256dh:subscription.p256dh,p_auth:subscription.auth,p_client:session?.client_id||null,p_staff:staffId,p_session:session?.id||null,p_expiry:expiry})
  if(result.error) throw result.error
  return json({ok:true})
 } catch {return json({error:'Could not update notifications. Please try again.'},503)}
})

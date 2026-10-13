import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import webpush from 'npm:web-push@3.6.7'
import { validateSubscription } from '../_shared/push-validation.ts'
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})
Deno.serve(async req=>{
 const secret=Deno.env.get('PUSH_WORKER_SECRET')
 if(!secret||req.headers.get('x-push-secret')!==secret) return json({error:'Unauthorized'},401)
 if(req.method!=='POST') return json({error:'Method not allowed'},405)
 const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY'),subject=Deno.env.get('VAPID_SUBJECT')
 if(!publicKey||!privateKey||!subject) return json({error:'Push is not configured'},503)
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})
 try {
  webpush.setVapidDetails(subject,publicKey,privateKey)
  const {data:jobs,error}=await db.rpc('claim_push_deliveries')
  if(error) throw error
  async function deliver(job:any) {
   let code=0
   try {
    const {data:s,error}=await db.from('push_subscriptions').select('*').eq('id',job.subscription_id).gt('expires_at',new Date().toISOString()).maybeSingle()
    if(error) throw error
    let authorized=!!s
    if(s?.client_id) {
     const result=await db.from('client_sessions').select('id').eq('id',s.client_session_id).eq('client_id',s.client_id).gt('expires_at',new Date().toISOString()).maybeSingle()
     if(result.error) throw result.error
     authorized=!!result.data
    } else if(s?.staff_id) {
     const result=await db.from('profiles').select('role').eq('id',s.staff_id).maybeSingle()
     if(result.error) throw result.error
     authorized=result.data?.role==='admin'
    }
    if(!authorized) {
     if(s) await db.from('push_subscriptions').delete().eq('id',s.id)
     return
    }
    const subscription={endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}}
    validateSubscription(subscription)
    const request=webpush.generateRequestDetails(subscription,JSON.stringify({title:job.title,body:job.body,tag:job.id}),{TTL:3600,urgency:'normal'})
    const result=await fetch(request.endpoint,{method:'POST',headers:request.headers,body:request.body,redirect:'error',signal:AbortSignal.timeout(10000)})
    code=result.status
    await result.body?.cancel()
    if(code===404||code===410) {await db.from('push_subscriptions').delete().eq('id',s.id);return}
   } catch { /* Retry transport/provider failures without logging private endpoints. */ }
   const sent=code>=200&&code<300
   const permanent=code>=400&&code<500&&![408,429].includes(code)
   const updated=await db.from('push_deliveries').update({status:sent?'sent':permanent||job.attempts>=5?'failed':'pending',last_status:code||null,available_at:new Date(Date.now()+Math.min(60,2**job.attempts)*60000).toISOString()}).eq('id',job.id).eq('lease_token',job.lease_token)
   if(updated.error) throw updated.error
  }
  for(let i=0;i<(jobs||[]).length;i+=5) await Promise.all(jobs.slice(i,i+5).map(deliver))
  return json({processed:jobs?.length||0})
 }catch{return json({error:'Push delivery failed; queued jobs will retry'},503)}
})

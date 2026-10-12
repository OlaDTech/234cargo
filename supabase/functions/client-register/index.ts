import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3'
const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Content-Type':'application/json' }
const json=(body: unknown,status=200)=>new Response(JSON.stringify(body),{status,headers})
Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers})
 if(req.method!=='POST') return json({error:'Method not allowed'},405)
 try {
  const raw=await req.text()
  if(raw.length>4096) return json({error:'Request is too large'},413)
  const b=JSON.parse(raw)
  const name=String(b.full_name||'').trim(), phone=String(b.phone||'').trim(), country=String(b.country||'').trim(), state=String(b.state||'').trim(), password=String(b.password||'')
  if(name.length<2||name.length>120||!/^\+[1-9][0-9]{7,14}$/.test(phone)||country.length<2||country.length>80||state.length<2||state.length>100||password.length<10||new TextEncoder().encode(password).length>72) return json({error:'Enter your details, an international phone number (+country code), and a password of 10–72 bytes.'},400)
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})
  // Hash the gateway-supplied source address; do not persist raw addresses.
  const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown'
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip))
  const key=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')
  const limit=await db.rpc('registration_allow_attempt',{p_key:key})
  if(limit.error) throw limit.error
  if(!limit.data) return json({error:'Too many requests. Please try again in an hour.'},429)
  const hash=await bcrypt.hash(password,12)
  const result=await db.rpc('submit_client_registration',{p_name:name,p_phone:phone,p_country:country,p_state:state,p_hash:hash})
  if(result.error) throw result.error
  return json({message:'Your request has been received for review. Contact 234Cargo to confirm approval, then sign in with your international phone number and password. If you already have an account, contact the team for access; do not register again.'})
 }catch{return json({error:'Registration is unavailable. Please try again later or contact 234Cargo.'},503)}
})

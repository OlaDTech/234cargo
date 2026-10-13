import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 for(const width of [390,1440]) {
  const context=await browser.newContext({viewport:{width,height:900}})
  const user={id:'00000000-0000-4000-8000-000000000001',email:'preview@example.test'}
  const client={id:'00000000-0000-4000-8000-000000000002',full_name:'Chat Customer',shipping_mark:'TEST001'}
  const messages=[{id:'one',client_id:client.id,sender:'client',message:'Please check my cargo.',is_read:true,created_at:new Date().toISOString()}]
  let fail=true, online=true
  await context.addInitScript(user=>{
   const token=btoa(JSON.stringify({alg:'HS256'}))+'.'+btoa(JSON.stringify({sub:user.id,exp:4070908800}))+'.test'
   localStorage.setItem('sb-layout-test-auth-token',JSON.stringify({access_token:token,refresh_token:'test',expires_at:4070908800,token_type:'bearer',user}))
  },user)
  await context.route('**/*.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url());let data=[],status=200
   if(url.pathname.includes('/profiles')) { const profile={...user,role:'admin',full_name:'Test Admin'};data=url.searchParams.has('id')?profile:[profile] }
   if(url.pathname.includes('/auth/v1/user'))data=user
   if(url.pathname.includes('/clients'))data=[client]
   if(url.pathname.includes('/rpc/admin_client_presence'))data=[{client_id:client.id,last_seen_at:new Date(Date.now()-(online?0:120000)).toISOString(),is_online:online}]
   if(url.pathname.includes('/messages')) {
    data=messages
    if(req.method()==='POST') {
     if(fail){status=503;data={message:'Temporary send failure'}}
     else {data={...req.postDataJSON(),id:'two',is_read:false,created_at:new Date().toISOString()};messages.push(data)}
    }
   }
   await route.fulfill({status,contentType:'application/json',headers:{'content-range':'0-0/0'},body:JSON.stringify(data)})
  })
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(`${process.env.TEST_BASE_URL||'http://127.0.0.1:5175'}/#/admin-login`)
  await page.locator('.hub-notifications').click()
  await page.getByLabel('Search conversations').fill('TEST001')
  await page.getByRole('button',{name:'Open conversation with Chat Customer'}).click()
  await page.locator('.cargo-chat-header').getByText('Online',{exact:true}).waitFor()
  online=false
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')))
  await page.locator('.cargo-chat-header').getByText(/Last seen/).waitFor()
  await page.getByText('Please check my cargo.',{exact:true}).last().waitFor()
  await page.getByLabel('Message',{exact:true}).fill('We will check for you.')
  await page.getByRole('button',{name:'Send message',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'Your text is kept'}).waitFor()
  assert.equal(await page.getByLabel('Message',{exact:true}).inputValue(),'We will check for you.')
  fail=false
  await page.getByRole('button',{name:'Send message',exact:true}).click()
  await page.getByText('Sent',{exact:true}).waitFor()
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  assert.deepEqual(errors,[])
  console.log(`Admin inbox search, chat, failed draft and send passed at ${width}px`)
  await context.close()
 }
}finally{await browser.close()}

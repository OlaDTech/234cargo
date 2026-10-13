import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
const browser = await chromium.launch({channel:'msedge',headless:true})
try {
 for (const width of [390,1440]) {
  const context = await browser.newContext({viewport:{width,height:900}})
  await context.addInitScript(() => localStorage.setItem('oa_client',JSON.stringify({client:{id:'00000000-0000-4000-8000-000000000001',full_name:'Chat Tester',shipping_mark:'TEST001'},sessionToken:'test-session',expiresAt:'2099-01-01T00:00:00Z'})))
  let fail = true, sends = 0
  const messages = [{id:'one',sender:'admin',message:'Your goods have arrived.',is_read:true,created_at:new Date().toISOString()}]
  await context.route('**/*.supabase.co/**',async route => {
   let data = {}, status = 200
   const request = route.request()
   if(request.url().includes('client-portal')) {
    const action = request.postDataJSON()?.action
    if(action === 'send_message') {
     sends++
     if(fail) { status=503; data={error:'Temporary failure'} }
     else { const message={id:'two',sender:'client',message:request.postDataJSON().message,is_read:false,created_at:new Date().toISOString()};messages.push(message);data={message} }
    } else data={messages,goods:[],settings:{}}
   }
   if(request.url().includes('client-wallet'))data={balances:[],transactions:[]}
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)})
  })
  const page=await context.newPage(), errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:5175')
  await page.getByRole('button',{name:/Messages/}).first().click()
  await page.getByText('Your goods have arrived.').waitFor()
  await page.getByLabel('Search this conversation').fill('absent')
  await page.getByText('No matching messages').waitFor()
  await page.getByLabel('Search this conversation').fill('')
  const draft=page.getByLabel('Message',{exact:true})
  await draft.fill('Hello\nPlease confirm the container.')
  assert.ok(await draft.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16))
  await page.getByRole('button',{name:'Send message',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'Your text is kept'}).waitFor()
  assert.equal(await draft.inputValue(),'Hello\nPlease confirm the container.')
  fail=false
  await page.getByRole('button',{name:'Send message',exact:true}).click()
  await page.getByText('Sent',{exact:true}).waitFor()
  assert.equal(await draft.inputValue(),'')
  assert.equal(sends,2)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  assert.deepEqual(errors,[])
  await page.screenshot({path:path.join(os.tmpdir(),`234cargo-chat-${width}.png`),fullPage:true})
  console.log(`Chat search, multiline send, failure recovery and layout passed at ${width}px`)
  await context.close()
 }
} finally { await browser.close() }

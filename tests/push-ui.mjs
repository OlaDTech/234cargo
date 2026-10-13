// Mock permission and push service: does NOT prove real Apple delivery.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 for(const width of [390,1440]) {
  const context=await browser.newContext({viewport:{width,height:1000}})
  await context.addInitScript(()=>{
   localStorage.setItem('oa_client',JSON.stringify({client:{id:'00000000-0000-4000-8000-000000000001',full_name:'Push Tester',shipping_mark:'TEST001'},sessionToken:'test-session',expiresAt:'2099-01-01T00:00:00Z'}))
   let subscription=null
   const registration={pushManager:{getSubscription:async()=>subscription,subscribe:async()=>{
    subscription={endpoint:'https://web.push.apple.com/test',toJSON:()=>({endpoint:'https://web.push.apple.com/test',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}}),unsubscribe:async()=>{subscription=null;return true}}
    return subscription
   }}}
   Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>registration,ready:Promise.resolve(registration),getRegistration:async()=>registration}})
   window.PushManager=function(){}
   window.Notification={permission:'default',requestPermission:async()=>{window.Notification.permission='granted';return 'granted'}}
  })
  const actions=[]
  await context.route('**/*.supabase.co/**',async route=>{
   let data={}
   if(route.request().url().includes('/push-subscribe')) {
    assert.equal(route.request().headers().authorization,'Bearer test-session')
    const action=route.request().postDataJSON().action
    actions.push(action)
    data=action==='config'?{publicKey:'B'+'a'.repeat(86)}:{ok:true}
   }
   if(route.request().url().includes('client-wallet'))data={balances:[],transactions:[]}
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
  })
  const page=await context.newPage()
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(process.env.TEST_BASE_URL||'http://localhost:5175')
  await page.getByRole('button',{name:'Enable notifications',exact:true}).click()
  await page.getByText('Notifications are on for this account on this device.').waitFor()
  assert.ok(actions.includes('subscribe'))
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.getByRole('button',{name:'Turn notifications off'}).click()
  await page.getByRole('button',{name:'Enable notifications',exact:true}).waitFor()
  assert.ok(actions.includes('remove'))
  assert.equal(await page.evaluate(()=>localStorage.getItem('234cargo-push-owner')),null)
  assert.deepEqual(errors,[])
  console.log(`Push opt-in, subscription, opt-out and layout at ${width}px passed`)
  await context.close()
 }
}finally{await browser.close()}

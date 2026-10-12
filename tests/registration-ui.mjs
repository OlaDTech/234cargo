// Vite must use https://layout-test.supabase.co. All API responses are mocked.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 for(const width of [390,1440]) {
  const context=await browser.newContext({viewport:{width,height:1000}})
  let submitted=0
  await context.route('**/*.supabase.co/**',async route=>{
   if(route.request().url().includes('client-register')) {
    const body=route.request().postDataJSON()
    assert.equal(body.phone,'+2348012345678')
    assert.equal(body.full_name,'Example Customer')
    submitted++
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({message:'Your request has been received for review.'})})
   }
   return route.fulfill({status:200,contentType:'application/json',body:'[]'})
  })
  const page=await context.newPage()
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(`${process.env.TEST_BASE_URL || 'http://localhost:5173'}/#/client-login`)
  await page.getByRole('button',{name:'New customer? Create an account'}).click()
  await page.getByLabel('Full name',{exact:true}).fill('Example Customer')
  await page.getByLabel('Phone number with country code').fill('+2348012345678')
  await page.getByLabel('Destination city / state').fill('Lagos')
  await page.getByLabel('Password (at least 10 characters)').fill('test-only-password')
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Registration overflows')
  await page.getByRole('button',{name:'Submit for approval'}).click()
  await page.getByRole('heading',{name:'Request received'}).waitFor()
  assert.equal(submitted,1)
  assert.equal(await page.evaluate(()=>localStorage.getItem('oa_client')),null,'Pending applicant cannot receive a session')
  await page.getByRole('button',{name:'Go to client login'}).click()
  await page.getByRole('heading',{name:'Client portal',exact:true}).waitFor()
  assert.deepEqual(errors,[])
  console.log(`Registration ${width}px passed`)
  await context.close()
 }
} finally {await browser.close()}

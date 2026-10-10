// Run with Vite on port 5173 and Playwright installed. All backend calls are mocked.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } })
    await context.addInitScript(() => localStorage.setItem('oa_client', JSON.stringify({ client: { id: '00000000-0000-4000-8000-000000000001', full_name: 'Preview Client', shipping_mark: 'TEST001' }, sessionToken: 'test-session', expiresAt: '2099-01-01T00:00:00Z' })))
    await context.route('**/*.supabase.co/**', async route => {
      const url = route.request().url()
      let data = {}
      if (url.includes('store_products')) data = [{id:'00000000-0000-4000-8000-000000000002',name:'Travel accessories',category:'Travel',supplier:'234Cargo',price:120,currency:'RMB',active:true,description:'A useful travel accessory.'}]
      if (url.includes('/storefront')) data = { orders: [] }
      if (url.includes('client-wallet')) data = { balances: [], transactions: [] }
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
    })
    const page=await context.newPage()
    const errors=[];page.on('pageerror',error=>errors.push(error.message))
    await page.goto('http://localhost:5173')
    try { await page.locator('.client-welcome').waitFor({timeout:10000}) }
    catch(error) { console.log(errors, await page.locator('body').innerText()); throw error }
    if(width>=1000) await page.locator('.workspace-sidebar').getByRole('button',{name:'Shop products',exact:true}).click()
    else { await page.locator('.bottomnav').getByRole('button',{name:'More',exact:true}).click(); await page.getByRole('button',{name:'Storefront Shop products and track your orders.'}).click() }
    await page.getByRole('heading',{name:'Travel accessories'}).waitFor()
    const layout=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,sidebar:getComputedStyle(document.querySelector('.workspace-sidebar')).display,page:document.querySelector('.page').getBoundingClientRect().width}))
    assert.ok(layout.scroll<=width,`Horizontal overflow at ${width}`)
    assert.equal(layout.sidebar,width>=1000?'flex':'none')
    await page.screenshot({path:path.join(os.tmpdir(),`234cargo-catalog-${width}.png`)})
    await page.getByRole('button',{name:'Add',exact:true}).click()
    await page.getByRole('button',{name:'Cart (1)',exact:true}).click()
    await page.getByText('Products subtotal',{exact:true}).waitFor()
    assert.deepEqual(errors,[])
    await page.screenshot({path:path.join(os.tmpdir(),`234cargo-store-${width}.png`)})
    console.log(JSON.stringify({width,...layout,screenshot:path.join(os.tmpdir(),`234cargo-store-${width}.png`)}))
    await context.close()
  }
} finally { await browser.close() }

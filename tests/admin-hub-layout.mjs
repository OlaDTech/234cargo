// Run with Vite on port 5173 using layout-test.supabase.co and Playwright installed.
// All backend requests are mocked; this test never modifies production data.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  for (const role of ['admin', 'staff']) {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } })
      const user = { id: '00000000-0000-4000-8000-000000000001', email: 'preview@example.test' }
      const profile = { ...user, full_name: 'Preview Team', role, permissions: ['dashboard', 'goods', 'scan'] }
      await context.addInitScript(user => {
        const token = btoa(JSON.stringify({ alg: 'HS256' })) + '.' + btoa(JSON.stringify({ sub: user.id, exp: 4070908800 })) + '.test'
        localStorage.setItem('sb-layout-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test', expires_at: 4070908800, token_type: 'bearer', user }))
      }, user)
      await context.route('**/*.supabase.co/**', async route => {
        const url = new URL(route.request().url())
        let data = []
        if (url.pathname.includes('/profiles')) data = url.searchParams.has('id') ? profile : [profile]
        if (url.pathname.includes('/auth/v1/user')) data = user
        await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/0' }, body: JSON.stringify(data) })
      })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://localhost:5173/#/admin-login')
      await page.locator('.admin-hub-home').waitFor()
      const grid = page.locator('.hub-service-grid')
      assert.equal(await grid.getByRole('button', { name: 'Warehouse', exact: true }).count(), 1)
      assert.equal(await grid.getByRole('button', { name: 'Storefront', exact: true }).count(), role === 'admin' ? 1 : 0)
      assert.equal(await grid.getByRole('button', { name: 'Finance', exact: true }).count(), role === 'admin' ? 1 : 0)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Home overflows')
      await page.screenshot({ path: path.join(os.tmpdir(), `234cargo-${role}-${width}.png`) })
      await page.getByRole('textbox', { name: 'Search admin tools' }).fill('tracking')
      assert.equal(await grid.getByRole('button').count(), 1)
      await page.getByRole('button', { name: 'Clear admin search' }).click()
      if (role === 'admin') {
        await grid.getByRole('button', { name: 'Team & roles' }).click()
        assert.equal(await page.locator('#admin-team-panel').getAttribute('open'), '')
      }
      await grid.getByRole('button', { name: 'Warehouse', exact: true }).click()
      await page.getByText('Goods Management', { exact: true }).waitFor()
      assert.deepEqual(errors, [])
      console.log(`${role} ${width}px: navigation, search, permission visibility and layout passed`)
      await context.close()
    }
  }
} finally {
  await browser.close()
}

# Workspace design

Reference research:
- Shopify admin navigation: https://help.shopify.com/en/manual/shopify-admin/shopify-admin-overview
- Flexport shipment visibility: https://www.flexport.com/logistics/platform-visibility/

Applied patterns: persistent grouped desktop navigation, direct access to operational areas, clear shipment states, restrained cards and table styling, and a consistent navy/teal palette. This is an original implementation using the existing 234Cargo logo and Lucide icons, not a copy of either product.

Desktop sidebar begins at 1000px. Mobile keeps bottom navigation and uses the same screen content. Admin destinations respect existing role permissions. Finance, catalog, clients, shipments and messages are directly accessible without the desktop More menu.

Browser layout smoke checks use mocked backend data, never real orders. To run:

1. Install Playwright as a local test tool: `npm install --no-save --package-lock=false playwright`.
2. In a PowerShell terminal, set `$env:VITE_SUPABASE_URL='https://layout-test.supabase.co'` and `$env:VITE_SUPABASE_ANON_KEY='layout-test-key'`, then run `node node_modules/vite/bin/vite.js --host 127.0.0.1`.
3. In another terminal run `node tests/workspace-layout.mjs`. Microsoft Edge is required.

Checks cover the client storefront at 390px and 1440px, sidebar visibility, overflow, catalog navigation, cart opening and JavaScript errors. Screenshots are saved to the system temporary directory. These tests do not validate live payments, database policies or administrator workflows.

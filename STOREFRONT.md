# 234Cargo storefront

Admins: open More → Storefront & Orders. Add a product, upload a photo, set its price and currency, then enable Publish for clients. Unpublish products by editing and clearing that checkbox. Historical orders retain their original product names and prices.

Clients: open Shop our products on Home or More → Storefront. Browse, search, filter by category, view product details, add quantities to the cart and place an order. Orders await manual confirmation. Checkout does not collect payment or include shipping charges. Orders with different currencies must be placed separately.

## Backend activation

This module extends the existing single-company Supabase application; it does not introduce multi-tenant isolation.

1. Apply `supabase/migrations/202610100001_storefront.sql` to the existing project after the main schema. It creates products, orders, their access policies, atomic checkout and the product-image bucket. Do not rerun the entire legacy schema just to install the store.
2. Deploy `supabase functions deploy storefront --project-ref YOUR_PROJECT_REF`. The provided config disables Supabase JWT verification because the endpoint validates the application's hashed client session tokens itself.
3. Build and deploy the frontend using the existing deployment process (`npm run build`).

Supabase Functions provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Never put a service role key into frontend environment variables.

## Access and checkout

Only administrators can publish/edit products, upload images, view all store orders, or change their status. Clients read only published products. Client orders are accessed through the session-verified endpoint, scoped to the session's client ID. Browser-supplied client IDs and prices are not used. Checkout runs in one database transaction and deduplicates retries by client and request UUID. Catalog editing is locked against checkout reads while order prices are copied.

Database numeric values compute totals. Quantities are integers from 1 to 9999. A cart contains at most 50 lines in one currency. JPG, PNG and WebP uploads are limited to 5 MB. Product photos are public catalog assets; do not upload private documents.

## Verification after activation

- As admin, save a draft and confirm clients cannot see it. Publish it and check the client catalog.
- Upload an image from a phone. Reject unsupported or oversized files.
- Place an order with multiple quantities; verify the order total uses saved catalog prices.
- Retry the same checkout request ID; confirm a single order is created.
- Sign in as a different client; confirm the first client's orders are inaccessible.
- Change a product price; confirm historical orders keep their original price.
- Unpublish a cart product; checkout must reject it.
- As staff without admin role, direct product writes and order status changes must fail.

Payment collection, stock reservation, automatic shipping charges, refunds and multi-vendor seller accounts are not included. Availability is confirmed manually by the admin.

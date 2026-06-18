# OceanAir Logistics — Sea & Air Freight Web App

A mobile-first logistics platform for client, staff, and admin portals — built with React, Vite, and Supabase. Deploys as a static site to Cloudflare Pages.

## Features

- **Client portal** — view goods (photos, CBM, kg, status), download shipping label with QR code, view receipts, read announcements, browse suppliers, message staff
- **Staff portal** — dashboard stats, register clients (auto-generated shipping mark), record sea/air goods with camera-scan barcode lookup, CBM auto-calculated from L×W×H, quick scan to update status
- **Admin portal** — full goods/container/receipt management, staff permissions, announcements, suppliers, client messaging, warehouse settings that propagate to every shipping label instantly
- **Camera + manual scanning** throughout (`html5-qrcode`) for QR codes and barcodes, with manual text entry as fallback
- **Real-time messaging** via Supabase Realtime subscriptions

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. Open the SQL Editor and run the entire contents of `supabase_schema.sql` in this repo.
3. In **Storage**, create a public bucket named `goods-photos` (or run the commented `insert into storage.buckets` line at the bottom of the schema file).
4. In **Authentication → Providers**, make sure Email/Password is enabled.
5. Create your first admin user:
   - Go to **Authentication → Users → Add user**, set an email + password.
   - Copy the generated user UUID.
   - In the SQL Editor, run:
     ```sql
     insert into profiles (id, full_name, phone, role, permissions)
     values ('PASTE-UUID-HERE', 'Admin User', '60123456789', 'admin', array['dashboard','clients','goods','scan']);
     ```
6. Repeat for staff accounts, using `role => 'staff'` and whichever permissions you want them to start with (admin can also edit these later in-app under **Settings → Staff Accounts**).
7. Get your API keys from **Project Settings → API**: you need the **Project URL** and the **anon public key**.

## 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## 3. Run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:5173`. On mobile devices on the same network, camera scanning requires HTTPS — use `npm run build && npm run preview` with a tunnel (e.g. `ngrok`) or test on the deployed Cloudflare URL, which is HTTPS by default.

## 4. Deploy to Cloudflare Pages

**Option A — Cloudflare dashboard (recommended for first deploy)**

1. Push this project to a GitHub/GitLab repo.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
3. Select your repo. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Add environment variables under **Settings → Environment variables** (both Production and Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy. Cloudflare gives you a `*.pages.dev` URL immediately; attach a custom domain under **Custom domains** whenever you're ready.

**Option B — Wrangler CLI**

```bash
npm install -g wrangler
npm run build
wrangler pages deploy dist --project-name=oceanair-logistics
```
(Set the same two env vars with `wrangler pages secret put VITE_SUPABASE_URL` etc., or in the dashboard after first deploy.)

The included `_redirects` file routes all paths to `index.html` so client-side routing keeps working on refresh.

## 5. Camera scanning notes

- Built with `html5-qrcode`, which reads QR codes and most 1D barcodes (Code128, EAN, etc.) — covers shipping-mark QR codes and courier barcodes (快递号 labels).
- Requires camera permission and HTTPS (or `localhost`). Cloudflare Pages serves HTTPS automatically.
- Every scan modal also has a manual text field, so staff can keep working if a camera isn't available or a barcode won't scan (poor lighting, damaged label, etc.).

## 6. How key flows work

**Registering a client (staff/admin):** Clients tab → Register → fill name, phone, country, set an initial password → shipping mark is auto-generated via the `generate_shipping_mark` Postgres function (format `MY-001-ABC`).

**Recording goods (staff):** Record Goods → scan the client's QR/shipping mark or search by name/phone → choose Sea or Air → for sea, enter L×W×H in cm and CBM is calculated automatically (L×W×H÷1,000,000); for air, only weight + photo + tracking number are needed → optionally scan the courier barcode into the tracking field → save. The record appears instantly in that client's portal.

**Updating status:** Staff/admin can change status (`in_warehouse → in_transit → delivered`) from the Goods list, or via Quick Scan by looking up a tracking number and tapping the new status — this immediately reflects on the client's "My Goods" tab.

**Receipts:** Admin generates a receipt per goods record; rate is pulled from **Settings → Rates** (CBM rate + kg surcharge for sea, flat kg rate for air). Clients see a "View Receipt" button under any goods item once issued.

**Warehouse settings:** Admin-only. Editing the China warehouse name/address/phone or company name under Settings updates the data every shipping label reads from — every client's label reflects the change immediately, with no per-client editing needed.

## 7. Hardening before going live

The client portal intentionally skips Supabase Auth (clients log in with phone/shipping mark + password, not email) to match the brief. To make that work, several RLS policies in `supabase_schema.sql` allow public (`anon`) read access, with the app enforcing per-client filtering in the UI rather than the database. Read the security note at the top of `supabase_schema.sql` for two ways to close this gap — the short version: move client login behind a Supabase Edge Function that issues a scoped JWT, and hash passwords with bcrypt instead of storing them in plaintext as the demo schema does.

## Project structure

```
src/
  components/UI.jsx       — all shared UI: pills, modals, scanner, CBM calculator, shipping label, receipt view
  hooks/useAuth.jsx        — auth context (Supabase Auth for staff/admin, localStorage session for clients)
  lib/supabase.js          — Supabase client + all data-access functions
  pages/
    LoginPage.jsx
    staff/StaffApp.jsx, RecordGoods.jsx
    admin/AdminApp.jsx
    client/ClientApp.jsx
  styles/global.css        — design tokens, layout, component classes
supabase_schema.sql        — full DB schema, RLS policies, functions, seed data
```

# Home Screen push notifications

This is Web Push, not SMS. No per-SMS service is required. Supabase storage,
database work and Edge Function invocations still count toward your plan.

## One-time setup (do not skip the sender schedule)

1. Apply `supabase/migrations/202610120002_web_push.sql` after the registration
   and storefront migrations in Supabase SQL Editor.
2. Generate a VAPID key pair once on your own computer:
   `npx web-push generate-vapid-keys`. Save these privately; do not paste private
   keys into chat, source files or Git. Rotating VAPID keys requires users to
   unsubscribe and enable notifications again.
3. In **Supabase → Edge Functions → Secrets**, add:
   - `VAPID_PUBLIC_KEY`: generated public key
   - `VAPID_PRIVATE_KEY`: generated private key
   - `VAPID_SUBJECT`: `https://234cargos.pages.dev`
   - `PUSH_WORKER_SECRET`: a fresh random secret (at least 32 random bytes).
     Generate locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. Deploy both functions using the CLI from this repository:
   `npx supabase functions deploy push-subscribe`
   and `npx supabase functions deploy push-send`.
   They import `_shared/push-validation.ts`; include that module if using the
   dashboard editor instead. Both functions have JWT verification disabled in
   config because they do their own checks. `push-subscribe` validates either a
   client session or a Supabase admin login. `push-send` requires the private
   `x-push-secret` header; it is NOT an unauthenticated sender.
5. In Supabase Vault, add `push_project_url` with your project's HTTPS URL, and
   `push_worker_secret` with exactly the same value as `PUSH_WORKER_SECRET`.
   Keep these secrets private. Run `supabase/push-schedule.sql` in SQL Editor.
   Enable Cron, pg_net and Vault if your project prompts you. This runs once per
   minute and only invokes the Edge sender when a delivery is due. Do not create
   an additional schedule for the same sender.
6. Build and deploy the website. Open the installed Home Screen app, sign in,
   find **Phone notifications** on Home/Overview and tap **Enable notifications**.
   On iPhone use iOS 16.4+ and accept the system prompt. If needed remove the old
   shortcut and re-add the site as a Home Screen web app. Pinch zoom stays enabled.

## Delivery behavior

- Admins: new registration requests, store orders, client messages.
- Clients: newly recorded goods, changes to their goods' or assigned shipment's
  status, new receipts, and replies from staff/admins.
- Alerts contain generic text; no names, cargo descriptions, phone numbers,
  message contents or financial figures appear on a lock screen.
- Only devices subscribed at the event time receive a notification. No historical
  notifications are sent when first enabling. Delivery starts around the next
  minute, but device/network settings can delay or suppress it; delivery is not
  guaranteed. Focus mode and notification settings apply.
- Each delivery is leased, retried at most five times with backoff, and discarded
  if older than a day. Provider acceptance does not prove the user saw the alert.
  Duplicate delivery is possible after a network interruption; stable tags group
  retries. Invalid subscriptions (404/410) are removed. Logs are retained 7 days.
- Devices expire after 30 days without opening Home. Opening Home renews an
  already enabled subscription. Clients also stop receiving when their linked
  client session expires. Admin role is rechecked before sending.
- Turning notifications off or signing out unsubscribes this browser device.
  On shared phones always sign out. If offline cleanup fails, turn notifications
  off in device settings. Already accepted pushes can still arrive after sign-out;
  this is why payloads contain no private account information.
- No offline caching of API responses or private pages is added. Tapping an alert
  opens/focuses the app; users navigate to the appropriate section after signing in.

## Verification

Use two separate test clients and an admin device. Enable each device, close the
app, then record goods for client A. Only A should receive a goods alert. Send a
client message: only admins should receive it. Send a staff reply: only that
client should receive it. Verify lock-screen reception on an actual iPhone,
notification click, disable, sign-out, expired sessions and account switching.

Local verification commands:

```text
npm run build
node tests/push-db.mjs
node tests/push-worker.mjs
node --experimental-strip-types tests/push-validation.mjs
node tests/push-ui.mjs
npx deno check --no-lock --node-modules-dir=none supabase/functions/push-subscribe/index.ts supabase/functions/push-send/index.ts
npx deno run --allow-env --no-lock --node-modules-dir=none tests/push-encryption.ts
```

Browser tests require Vite at port 5175 with the mock Supabase URL used in the
other tests and Playwright installed. Encryption tests generate ephemeral keys;
they do not send a real push or read production keys.

Run `node tests/push-db.mjs` (requires the dev-only `@electric-sql/pglite`
installation) for isolation, triggers, permissions and queue leasing. Browser
mocks cannot prove Apple push delivery. Check `push_deliveries.status` and
`last_status` in Supabase and the `234cargo-push` Cron job if no alerts arrive.

References: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
and https://supabase.com/docs/guides/functions/schedule-functions

## Immediate dispatch and chat update

Apply `supabase/migrations/202610130001_immediate_push.sql` after the existing
web-push migration and `push-schedule.sql`. It wakes the sender once per database
transaction containing new alerts. Keep the minute-based Cron job enabled for
retries and recovery. Wake-up failure does not prevent saving business records.

Deploy the updated `client-portal` Edge Function before publishing the frontend.
The new `get_messages` action uses the existing secure client session and only
returns that client's messages. Active visible client chat refreshes every five
seconds; a service-worker push also prompts a refresh. Admin chat retains its
existing Supabase Realtime subscription. This is near-real-time client refresh,
not a client WebSocket connection. OS/network delivery delays remain possible.

The green-and-white chat includes search, dates, sent/read status, multiline
composition, preserved failed drafts and scroll-aware new-message navigation.
Typing indicators and file attachments are not implemented in this update.

Additional checks: `node tests/push-immediate.mjs` and `node tests/chat-ui.mjs`.

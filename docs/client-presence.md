# Client online status

Admin inbox rows and conversation headers show Online or a dated Last seen
timestamp in the administrator's local timezone. Online means a non-expired
client session reported activity within the past 60 seconds. This is estimated
presence, not proof that the person is reading the conversation.

The existing client portal refresh records activity every 15 seconds while
visible (five seconds in chat). No additional client heartbeat requests are
introduced. When a phone suspends the app or loses connectivity, the status
times out. The admin inbox refreshes status every 15 seconds while visible.
Closing the app can therefore take roughly 60–75 seconds to appear offline.

Last seen is the last confirmed activity, not the exact disconnect time.
Multiple devices are supported: any recently active, valid session counts.
Historical last seen remains after session cleanup. Failed status queries show
Status unavailable instead of falsely claiming the client is offline.

## Release

Apply `supabase/migrations/202610130002_client_presence.sql` before publishing
the frontend. No Edge Function changes or new secrets are required.

The admin-only `admin_client_presence()` RPC returns just client ID, last seen
and estimated online state. It never exposes session tokens or hashes. Direct
table access is disabled for clients and staff.

Checks: `node tests/client-presence.mjs`, `node tests/admin-chat-ui.mjs` and
`npm run build`. Browser tests use mocked data and a local Vite server.

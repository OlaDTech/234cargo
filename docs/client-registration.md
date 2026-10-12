# Client self-registration

No SMS provider or messaging subscription is required. Customers submit an
application; an administrator approves or rejects it from the dashboard.
Phone ownership is not verified. Staff cannot review applications.

## Deployment order

1. Apply `supabase/migrations/202610120001_client_registration.sql` in the
   Supabase SQL editor, after the existing schema and migrations. Do not rerun
   the original storefront migration.
2. Deploy the endpoint: `npx supabase functions deploy client-register` against
   the existing linked project. Its `verify_jwt = false` configuration permits
   public registration; privileged database operations are service-role only.
3. Build and deploy the frontend normally.

## Daily workflow

- Customers select **Create account** on the homepage or client login screen.
- They provide an international phone number (for example +234…), destination,
  and a password of at least 10 characters (maximum 72 UTF-8 bytes).
- Applications remain separate from clients. Pending/rejected applicants have
  no session, customer ID, shipping label, goods, or finance access.
- Admins review **Client registrations** on the dashboard. Compare requests with
  existing customers before approval. Refresh reloads the queue.
- Approval creates a client with a `MY-R000001`-style shipping mark. Existing
  customer marks and the 100×100 mm label download are unchanged.
- Notify the customer manually using your usual contact channel. No automatic
  SMS/email is sent. They log in using the exact international phone number and
  password submitted, then download their label from their portal.
- Do not approve a replacement account for an existing client: help them recover
  their existing account. No unauthenticated account-claim/reset is introduced.

## Security and limitations

Passwords are bcrypt-hashed before storage, never included in admin query
permissions, and removed from applications after a decision. Public submission
returns the same response for duplicates and existing customers. Source-address
hashes receive a database-backed limit of five valid submissions per hour.
Confirm Supabase's trusted proxy supplies `x-forwarded-for` before production;
distributed attacks still need upstream bot protection. Registration does not
prove phone ownership. Different people sharing an IP may hit the same limit.

Phone collision checks conservatively compare the last ten digits to catch
local/international formats without changing legacy records; this can flag
unrelated international numbers. Admin-assisted onboarding remains available.
Concurrent review is serialized; reviewer, decision and timestamp are retained.
Rejections can be resubmitted later. Existing manual registration is unchanged.

Run `node tests/registration-ui.mjs` against Vite with the test Supabase settings
used by the other browser tests. Database integration tests require a disposable
PostgreSQL environment; never run test fixture setup in production.

`node tests/registration-db.mjs` runs the migration against disposable embedded
PostgreSQL (install `@electric-sql/pglite` without saving first), with minimal
fixtures for existing tables/auth helpers. It checks approval authorization,
pending isolation, duplicate/repeat handling, rejection, field privileges, RLS
and rate limits. It does not connect to Supabase or test live Edge networking.

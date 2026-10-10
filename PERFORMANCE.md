# Workspace performance improvements

- Public login, administrator and client applications use separate lazy-loaded bundles.
- The barcode scanner (about 375 KB minified in the verified build) loads only when a scanner is opened. Closing during loading cancels camera startup.
- The storefront and its styles load when the user opens the store. Products render before order history finishes loading.
- React and Supabase have stable separate vendor chunks for browser caching between application deployments.
- Client portal polling pauses in hidden tabs and refreshes when the tab becomes visible.
- Staff authentication callbacks defer database work until Supabase releases the authentication lock. Timeout timers are cleared after completion.
- Administrator refreshes reject stale responses and keep the previous view if a request fails, with a retry message.

The previous frontend build produced one approximately 979 KB minified JavaScript file (277 KB gzip). The split build's entry module is about 26 KB, with React (~142 KB) and Supabase (~227 KB) preloaded. Screens additionally load their shared and role-specific dependencies; the entry-module size alone is not the full download cost. This is bundle-size evidence, not a measured end-user speed score.

Verification: production Vite build and Git whitespace checks. Browser sign-in, camera permissions and live customer-account workflows must also be smoke-tested in the deployed app. No database migration is required for this update.

Remaining scaling work: server pagination and aggregate reporting for large goods/receipt lists, incremental realtime refreshes instead of reloading whole datasets, and database query profiling. The current administrator loader still fetches full collections; this update does not claim to solve large-dataset performance.

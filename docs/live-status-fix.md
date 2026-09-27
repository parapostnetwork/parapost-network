# Scheduled Live status and playback views

## Production failure and correction

Production logs on September 26 confirmed POST /api/live/start returning 502.
Its Supabase authentication and row read succeeded, but the privileged PATCH
returned 401. Vercel's server key is a sensitive variable and cannot be retrieved
for offline validation. Do not claim that its validity has been confirmed.
The handler now trims surrounding whitespace and supports both legacy JWT
service-role keys and newer secret API keys (apikey only for the latter).
Sanitized failure logging reports HTTP status and an allowlisted category only.
It never logs a credential, request authorization, or upstream response body.

Display status now follows scheduled_at immediately, independent of a failed
network update: Live Soon before start; Live for six hours from scheduled start;
Replay at the exact six-hour boundary. This supersedes the earlier end-time
six-hour grace rule at the user's explicit request. Manual End Show immediately
sets Replay. Draft/cancelled/ended shows are never revived. For unscheduled live
shows, started_at is a display fallback; without either timestamp the stored
status is preserved.

The authenticated server route also synchronizes due upcoming/live records to
live/ended. It validates the caller with Supabase Auth, reads under user RLS, and
conditionally updates only public, visible shows with unchanged schedule,
updated_at, and status. An old upcoming show goes directly to Replay. Ended_at
for automatic expiration is scheduled_at plus six hours, not the request time.
No scheduler, database migration, or Google Cloud setup is needed. When nobody
is viewing, persisted synchronization occurs on a later viewer refresh.
Client failures back off 30 seconds per show; visible pages refresh every ten
seconds. Comments and the existing views RPC still require successful database
synchronization. Correct labels alone do not prove those operations are fixed.

## Views

Dashboard and Profile share one counter. YouTube's public iframe API observes
PLAYING, including touch/mobile playback; it requires no Data API key. Merely
loading, focusing, or pausing a YouTube iframe does not count. A successful view
increments once per mounted counter; pause/resume does not increment again.
Failed/zero RPC results retry during playback. This preserves view totals rather
than introducing unique-user accounting. Refreshed totals now display other
viewers' increments. Other providers retain their existing interaction behavior.
The iframe URL/id remains stable across status changes and polling.

## Verification and rollout

Run node --experimental-strip-types --test tests/live-*.test.mjs.
Twenty focused tests cover clock boundaries, owner-independent status, iframe
identity, comments eligibility, authentication, update races, both key formats,
actual playback events, retry and duplicate prevention. TypeScript and targeted
ESLint also pass. Production deployment requires user approval.

After deployment, verify /api/live/start succeeds for signed-in users and
Supabase PATCH no longer returns 401. If it still fails, use the sanitized
failure category to correct the existing production credential with explicit
approval; do not weaken RLS or expose credentials. Verify real comments and
view increments on desktop and mobile before calling the fix complete.
No iOS/Android native changes, signing changes, or Supabase settings changes.
Rollback by reverting this commit. Do not mass-reset existing show rows.

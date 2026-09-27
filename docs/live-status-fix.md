# Live comments, labels and six-hour replay badge

## Cause and behavior

The waiting-player fix removed playback's dependency on stored status, but
comments and badge rendering still required a stored live/ended status. The
only scheduled database promotion ran when the owner opened Live Manager.

This patch permits a signed-in viewer's Dashboard/Profile refresh to request a
deterministic scheduled start through POST /api/live/start. The server verifies
the Supabase session, reads the public visible show under that user's RLS, checks
the scheduled timestamp against server time, then conditionally changes only an
upcoming row to live. A concurrent hide, cancellation, reschedule, edit or End
Show prevents the update. Arbitrary status/timestamp payloads are ignored. The
existing server-only service-role credential performs this narrow update; no
credential is exposed to the client. Normal comment inserts still use user RLS.

Labels are Live Soon before activation and Live after activation. End Show saves
ended_at and preserves comments. The badge remains Live for six hours after
ended_at, then becomes Replay. A still-running show no longer becomes a replay
six hours after its start. Ended rows without a valid end time display Replay.
Dashboard/Profile retain the waiting-player iframe; Profile status realtime
updates refresh only show rows instead of resetting the whole page/player.
Visible pages with relevant shows refresh every 10 seconds and on foreground
return; clock badges update even if a refresh fails. No timer runs in a backend.

## Explicit limitation accepted by the user

No Google Cloud/YouTube API is used. Start activation follows the saved schedule,
not YouTube's actual broadcast state. The creator must use End Show to begin the
six-hour countdown. YouTube ending on its own is not detected automatically.
The owner need not return to Edit/Save for scheduled activation or commenting.
If nobody is viewing, activation is applied when a signed-in viewer next loads
Dashboard/Profile (or the owner loads Live Manager). Delayed broadcasts should
have their schedule edited. Manual End Show is never automatically reversed.

## Setup and validation

No Supabase schema/RLS/function/cron changes, signing changes or native app edits.
Uses existing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
SUPABASE_SERVICE_ROLE_KEY. Production names were confirmed read-only in Vercel;
values were not revealed. Branch previews lack the production service-role
variable, so a successful preview build does not prove authenticated activation.

Run:
node --experimental-strip-types --test tests/live-playback.test.mjs tests/live-status.test.mjs tests/live-start.test.mjs

Tests cover iframe stability, comment-status eligibility, server authentication,
eligibility, concurrency guards, manual-ended preservation and the six-hour
boundary. Real-device posting and production activation need verification after
an approved deployment. Rollback: revert this code; do not mass-reset rows.

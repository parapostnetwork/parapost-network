# Published YouTube shows: playback and automatic status

## Confirmed source cause

The earlier Live hub embedded every published show with an embed URL, including
upcoming shows (`08fc45e`, and its predecessor `962e5a2`). YouTube could therefore
transition its own waiting-room player when the broadcast started.

After playback moved to Dashboard/Profile (`19daded`), those cards rendered an
iframe only for stored live/ended status. `publishScheduledShow` writes upcoming.
The only automatic database promotion in the current repository is inside
`loadLiveManager`: it writes live for the owner's overdue upcoming rows when the
manager loads. It does not contact YouTube and it has no independent schedule.

Edit/save updates metadata plus updated_at; it does not set live. That database
write triggers realtime refreshes. Revisiting Live Manager runs the overdue-show
promotion. This combination explains the reported workaround. We have not
reproduced the user's individual historical broadcast or inspected any external
backend jobs that may exist outside Git; the precise historical 5–10 second
latency cannot be established from these files.

## Changes

- Restore waiting-room playback for published upcoming shows on Dashboard and
  Profile, using the same persistent iframe as live/replay. No forced autoplay,
  periodic iframe reload or account action. A device may still require a tap to
  play audio under its normal media policy.
- Sync public, visible, upcoming/live YouTube rows from YouTube's actual start/end
  timestamps in a backend function, independent of the creator being online.
  Existing and future eligible rows are included, with keyset pagination and
  deduplicated batches of up to 50 video IDs. No owner needs to re-save shows.
- Stop clock-based promotion for YouTube in Live Manager. Leave manual controls
  and non-YouTube behavior available. API errors and unavailable videos preserve
  state; a scheduled time alone cannot falsely announce a delayed show as live.
- Stop converting a still-live YouTube broadcast into replay just because it is
  six hours old. YouTube's actual end determines the stored replay status.
- Refresh only live rows every 10 seconds while visible, and on return from
  background/focus/page restore. Profile realtime updates no longer reload the
  whole page or interrupt the player. Existing dashboard realtime remains.
- Guard background writes against concurrent edits, cancellations, privacy
  changes, link changes and manual ends using compare-and-set filters.

## Required deployment setup — NOT applied

Do not deploy the frontend alone: configure and verify the backend first.
1. Inspect any existing production live jobs before enabling a second worker.
2. Enable YouTube Data API v3 and provide a server-only YOUTUBE_API_KEY restricted
   to that API in Supabase Edge Function secrets. Never use a NEXT_PUBLIC key.
3. Configure a random LIVE_SYNC_SECRET (at least 32 random bytes) in Edge Function
   secrets, plus matching Vault entry live_sync_secret. Set Vault live_sync_url
   to the project's /functions/v1/sync-youtube-live URL. Service-role credentials
   are provided by the Edge runtime and never sent to clients or logged.
4. Deploy sync-youtube-live (config disables gateway JWT checks only for this
   function; it requires x-live-sync-secret before any reads/writes). Send a
   secret-authenticated POST with ?dry_run=true first; it returns counts only.
5. After approval, apply supabase/operations/schedule-youtube-live.sql and verify
   HTTP responses as well as cron job runs. pg_net queues HTTP asynchronously;
   cron success alone does not prove function success.
6. Deploy the frontend patch, then verify a real upcoming → live → ended broadcast
   while the owner is logged out. Include a late start and a resumed mobile tab.

The proposed backend polls once per minute; visible clients refresh within 10
seconds of a database update (realtime can be faster). This is not a guarantee
of 5–10 second metadata synchronization. Waiting-room playback can start through
YouTube independently of that metadata delay. No new polling requests are made
to YouTube by each viewer. At 50 distinct pending/live videos, one-minute polling
uses about 1,440 videos.list calls/day; monitor actual quota and pending backlog.
Private/deleted/unavailable videos remain unchanged and require creator review.
Twitch provider-status synchronization is outside this YouTube fix.

## Regression tests

Run node --experimental-strip-types --test tests/live-sync.test.ts. These tests
use mock provider/database responses; they cannot prove production scheduler,
provider permissions or device media playback. Do not claim device end-to-end
verification until the approved deployment and real broadcast test are done.

## Rollback

Disable only cron job sync-youtube-live, then revert the frontend commit if needed.
Do not mass-reset stream rows: confirmed broadcasts may already have ended.
No native iOS/Android code, signing keys or existing unrelated website files need
to be modified. The isolated checkout preserves the user's local iOS changes.

# Restore published YouTube waiting-room playback

## Cause

The earlier Live hub rendered the YouTube iframe for published upcoming shows
(commit 08fc45e and its predecessor 962e5a2). When playback moved to Dashboard and
Profile (19daded), the new cards gated the iframe on stored live/ended status.
Publishing sets status to upcoming. Opening Live Manager promotes the owner's
overdue shows; editing/saving also triggers realtime refresh. This explains why
returning to the manager can make playback appear. The precise historical
5–10 second delay has not been reproduced.

## Fix

Dashboard and Profile now render the existing YouTube player for public, visible,
published upcoming shows as well as live/replay shows. Profile's second JSX gate
is removed too. The same iframe URL and identity are retained across status
changes. YouTube's waiting player can handle the broadcast starting without a
creator edit/save or a Parapost status update. Existing and future eligible shows
use the same rendering path; no data migration is needed.

No Google Cloud account, API key, backend function or scheduled job is required.
Native iOS/Android projects, signing keys, database writes, publishing behavior,
status labels, chat rules, and other providers' playback behavior are unchanged.
This restores playback access; it does not independently synchronize Parapost's
stored live/ended status with YouTube. Viewers may still need to tap Play under
the browser's media policy. YouTube must allow the video to be embedded.

## Validation and deployment

Run `node --experimental-strip-types --test tests/live-playback.test.mjs`.
The tests cover visibility/status eligibility and evaluate each page's actual
media JSX conditional for upcoming/live/replay, checking iframe identity and URL.
They do not simulate a real YouTube broadcast starting or device autoplay policy.
Validation passed: all three regression tests, TypeScript check, targeted ESLint,
and production webpack build with dummy Supabase environment values.

Production approval is required before merging/deploying. After deployment,
verify an existing published upcoming show on Dashboard and Profile, then verify
a real YouTube start while the creator stays out of Live Manager. Check Safari
and the Android emulator; tablet/desktop use the same responsive pages. No claim
of end-to-end playback verification until that broadcast test has been completed.
Rollback by reverting this frontend patch; no database rollback is needed.

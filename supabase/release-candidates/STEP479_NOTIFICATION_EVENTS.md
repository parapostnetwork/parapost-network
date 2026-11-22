# Step 479 — Community Notification Event Handlers

Status: REVIEW ONLY. NOT EXECUTED.

## Prepared

- Three production-named notification trigger functions.
- Eight community like/comment/reply/share trigger bindings.
- One Group-owner new-post trigger.
- One CreatorVerse follow/unfollow trigger.
- Total: 10 trigger bindings.
- Direct client execution of trigger functions revoked.
- Existing production notification and push triggers preserved.

## Behaviour

- Group and CreatorVerse likes, comments and shares.
- Replies and comment likes.
- Group-owner notification for newly published posts.
- CreatorVerse follow and unfollow notifications.
- Deletion and soft-deletion cleanup.
- Blocked-user restrictions.
- Private Group membership restrictions.
- No self-activity notifications.
- Deduplication through community notification keys.

## Production integration requirements

- Reconcile notification type constraints first.
- Ensure all community tables exist.
- Install function dependencies before triggers.
- Verify compatibility with production notification guards.
- Keep community event triggers separate from existing
  Dashboard, Profile, Reels and Parachat triggers.
- Do not install overlapping staging-named triggers.
- Ensure trigger installation is ordered after function
  and notification schema installation.
- Do not enable feature gates before approval.

## Next

Reconcile the remaining community RLS/storage access rules
and prepare the correctly ordered migration package.

No SQL executed.
No database changes.
No deployment.

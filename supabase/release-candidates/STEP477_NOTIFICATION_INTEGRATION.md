# Step 477 — Community Notification Integration

Status: REVIEW ONLY. NOT EXECUTED.

## Prepared

- Five nullable community notification columns.
- Twelve additional Groups/CreatorVerse notification types.
- Three community-specific unique indexes.
- Existing notification records are not modified by this draft.
- No existing notification triggers or policies are replaced.
- No feature gates are enabled.

## Required before production execution

1. Verify the existing production notifications_type_check
   constraint and preserve any additional allowed types.
2. Check compatibility with the existing notification insert
   guard and push notification webhook.
3. Prepare the production community visibility helper.
4. Prepare the community notification triggers and functions.
5. Add restrictive community notification INSERT/SELECT policies
   without changing unrelated notification access.
6. Reconcile permissions with the existing production schema.
7. Obtain explicit approval before database writes.

## Integration principles

- Preserve Dashboard, Profile, Reels and Parachat notifications.
- Prevent forged community notifications from clients.
- Respect blocked users and private Group membership.
- Do not notify users about their own activity.
- Deduplicate notification events.
- Keep Groups and CreatorVerse disabled initially.

No SQL executed.
No production deployment.

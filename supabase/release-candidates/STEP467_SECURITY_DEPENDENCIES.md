# Step 467 - Community Security Dependencies

Status: REVIEW ONLY. No database changes.

## Source reconciliation

- Unique trigger/policy keys: 20
- Keys covered by existing migrations: 20
- Draft-only keys: 0
- Keys appearing in both sources: 0
- Keys with differing source statements: 0
- Notification-related declarations: 1
- Storage-related policy declarations: 6
- Unresolved trigger-handler names: 0

## Draft-only triggers and policies

These must be reconciled against installed staging
before being included in a production migration.


## Differing local definitions

These may represent intentional historical updates.
Do not install multiple versions blindly.


## Unresolved trigger-handler references

- No unresolved names in the scanned source set.

## Notification routing dependencies

Preserve existing notification constraints and
prevent client-side creation of forged events.

- `trigger` `trg_enforce_reel_notification_preference` on `public.notifications` (existing_migration)

## Storage permissions

Private buckets require exact object-access policies.
Bucket creation alone does not establish safe access.

- `groups_storage_delete_guard` (existing_migration)
- `groups_storage_insert` (existing_migration)
- `groups_storage_insert_guard` (existing_migration)
- `groups_storage_read` (existing_migration)
- `groups_storage_read_guard` (existing_migration)
- `groups_storage_update_guard` (existing_migration)

## Sharing cooldown references

- No matching local source markers identified.

## Production requirements

- Do not recreate objects already covered by migrations.
- Resolve historical trigger and policy replacements.
- Preserve restrictive RLS and membership checks.
- Review SECURITY DEFINER function authorization.
- Review function EXECUTE and schema USAGE grants.
- Preserve blocking and moderation rules.
- Preserve the seven-day sharing cooldown.
- Preserve notification routing and privacy.
- Preserve photo, video and private media permissions.
- Compare actual installed staging definitions.
- Compare actual production constraints and grants.
- Keep feature gates disabled by default.
- Validate the final migration once before launch.
- Obtain explicit approval before production changes.

## Restrictions

- No function bodies copied.
- No source secrets copied.
- No SQL executed.
- No application files modified.
- No staging or production deployment.

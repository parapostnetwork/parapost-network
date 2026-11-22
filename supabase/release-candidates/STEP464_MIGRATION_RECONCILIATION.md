# Step 464 - Migration Reconciliation

STATUS: REVIEW ONLY - NO SQL EXECUTED.

## Existing migration inventory

- Release migration files: 21
- Original staging migration files: 21
- Identical-name migration files: 21
- Differing same-name migration files: 0
- Staging-only migration files: 0
- Release-only migration files: 0

## Existing database object declarations

- Release migration table names: 63
- Release migration function names: 82
- Release migration trigger names: 43

## Reconstructed release candidates

- Candidate SQL files: 7
- Candidate table names: 36
- Tables already declared in migrations: 16
- Tables without a matching migration declaration: 20
- Candidate function-name overlaps: 0

## Candidate tables already declared in migrations

Do not deploy these twice. Reconcile definitions first.

- `parapost_groups_private.cover_uploads` — 20261020023000_groups_initial_schema.sql
- `parapost_groups_private.feature_gate` — 20261020023000_groups_initial_schema.sql
- `parapost_groups_private.media_cleanup` — 20261020023000_groups_initial_schema.sql
- `parapost_groups_private.shared_post_interaction_rate_limits` — 20261024050000_group_shared_post_engagement.sql
- `parapost_groups_private.test_users` — 20261020023000_groups_initial_schema.sql
- `public.group_comment_likes` — 20261023040500_group_post_interactions.sql
- `public.group_members` — 20261020023000_groups_initial_schema.sql
- `public.group_post_comments` — 20261023040500_group_post_interactions.sql
- `public.group_post_likes` — 20261023040500_group_post_interactions.sql
- `public.group_post_media` — 20261020023000_groups_initial_schema.sql
- `public.group_post_share_comment_likes` — 20261024050000_group_shared_post_engagement.sql
- `public.group_post_share_comments` — 20261024050000_group_shared_post_engagement.sql
- `public.group_post_share_likes` — 20261024050000_group_shared_post_engagement.sql
- `public.group_post_shares` — 20261023050000_group_post_shares.sql
- `public.group_posts` — 20261020023000_groups_initial_schema.sql
- `public.groups` — 20261020023000_groups_initial_schema.sql

## Candidate tables without existing migration declarations

- `creatorverse_private.feature_gate`
- `creatorverse_private.media_cleanup`
- `creatorverse_private.media_cleanup_jobs`
- `creatorverse_private.post_share_cooldowns`
- `creatorverse_private.upload_reservations`
- `parapost_groups_private.avatar_uploads`
- `parapost_groups_private.group_share_cooldowns`
- `parapost_groups_private.promotion_settings`
- `public.creatorverse_comment_likes`
- `public.creatorverse_comments`
- `public.creatorverse_follows`
- `public.creatorverse_media`
- `public.creatorverse_pages`
- `public.creatorverse_post_likes`
- `public.creatorverse_posts`
- `public.creatorverse_shares`
- `public.group_promotion_share_comment_likes`
- `public.group_promotion_share_comments`
- `public.group_promotion_share_likes`
- `public.group_promotional_shares`

## Existing migration files differing between repositories

- None found by file hash.

## Migration files present only in staging

- None.

## Migration files present only in release

- None.

## Repeated community table declarations in migrations

- None identified.

## Staging-specific markers requiring review

- No matching markers found.

## Dependency installation order

1. Resolve existing migration/table overlaps.
2. Reconcile constraints, relationships and unique indexes.
3. Reconcile private schemas and function dependencies.
4. Prepare RPCs with production-safe disabled gates.
5. Reconcile triggers and notification routing.
6. Apply appropriate RLS, grants and EXECUTE permissions.
7. Reconcile private storage buckets and object policies.
8. Perform one final isolated migration validation.
9. Obtain explicit approval before production execution.

## Protected behaviour

- Seven-day sharing cooldown.
- Group membership and moderation.
- CreatorVerse ownership and followers.
- User blocking and privacy restrictions.
- Photos and videos.
- Likes, comments, replies and sharing.
- Existing production notifications.

## Limitations

- This is source-level reconciliation, not live schema verification.
- Function names do not establish overload/signature equality.
- CREATE TABLE detection is a static inventory, not SQL parsing.
- No production migration is approved by this report.
- All feature gates remain disabled.

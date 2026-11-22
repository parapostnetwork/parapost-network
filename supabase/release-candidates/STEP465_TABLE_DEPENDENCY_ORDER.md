# Step 465 - Consolidated Table Dependencies

STATUS: REVIEW ONLY. NOT READY FOR EXECUTION.

## Reconciliation

- Existing migration table names: 63
- Reconstructed candidate tables: 36
- Excluded overlapping tables: 16
- Additional table candidates: 20

## Creation order for the additional tables

1. `creatorverse_private.feature_gate`
   - Source: `supabase/release-candidates/20261122_community_foundation.sql`
2. `creatorverse_private.media_cleanup`
   - Source: `supabase/release-candidates/20261122_community_remaining_tables.sql`
3. `creatorverse_private.post_share_cooldowns`
   - Source: `supabase/release-candidates/20261122_community_remaining_tables.sql`
4. `parapost_groups_private.avatar_uploads`
   - Source: `supabase/release-candidates/20261122_community_remaining_tables.sql`
   - Other referenced tables: auth.users, public.groups
5. `parapost_groups_private.group_share_cooldowns`
   - Source: `supabase/release-candidates/20261122_community_remaining_tables.sql`
   - Other referenced tables: auth.users
6. `parapost_groups_private.promotion_settings`
   - Source: `supabase/release-candidates/20261122_community_remaining_tables.sql`
   - Other referenced tables: public.groups
7. `public.creatorverse_pages`
   - Source: `supabase/release-candidates/20261122_creatorverse_base_tables.sql`
   - Other referenced tables: auth.users
8. `public.group_promotional_shares`
   - Source: `supabase/release-candidates/20261122_community_remaining_tables.sql`
   - Other referenced tables: auth.users, public.group_posts, public.groups
9. `public.creatorverse_follows`
   - Source: `supabase/release-candidates/20261122_creatorverse_base_tables.sql`
   - New-table dependencies: public.creatorverse_pages
   - Other referenced tables: auth.users
10. `public.creatorverse_posts`
   - Source: `supabase/release-candidates/20261122_creatorverse_base_tables.sql`
   - New-table dependencies: public.creatorverse_pages
   - Other referenced tables: auth.users
11. `public.group_promotion_share_comments`
   - Source: `supabase/release-candidates/20261122_community_remaining_tables.sql`
   - New-table dependencies: public.group_promotional_shares
   - Other referenced tables: auth.users
12. `public.group_promotion_share_likes`
   - Source: `supabase/release-candidates/20261122_community_remaining_tables.sql`
   - New-table dependencies: public.group_promotional_shares
   - Other referenced tables: auth.users
13. `public.creatorverse_comments`
   - Source: `supabase/release-candidates/20261122_creatorverse_base_tables.sql`
   - New-table dependencies: public.creatorverse_posts
   - Other referenced tables: auth.users
14. `public.creatorverse_media`
   - Source: `supabase/release-candidates/20261122_creatorverse_base_tables.sql`
   - New-table dependencies: public.creatorverse_pages, public.creatorverse_posts
15. `public.creatorverse_post_likes`
   - Source: `supabase/release-candidates/20261122_creatorverse_base_tables.sql`
   - New-table dependencies: public.creatorverse_posts
   - Other referenced tables: auth.users
16. `public.creatorverse_shares`
   - Source: `supabase/release-candidates/20261122_creatorverse_base_tables.sql`
   - New-table dependencies: public.creatorverse_posts
   - Other referenced tables: auth.users
17. `public.group_promotion_share_comment_likes`
   - Source: `supabase/release-candidates/20261122_community_remaining_tables.sql`
   - New-table dependencies: public.group_promotion_share_comments
   - Other referenced tables: auth.users
18. `creatorverse_private.media_cleanup_jobs`
   - Source: `supabase/release-candidates/20261122_community_remaining_tables.sql`
   - New-table dependencies: public.creatorverse_media
19. `creatorverse_private.upload_reservations`
   - Source: `supabase/release-candidates/20261122_community_remaining_tables.sql`
   - New-table dependencies: public.creatorverse_media, public.creatorverse_pages
   - Other referenced tables: auth.users
20. `public.creatorverse_comment_likes`
   - Source: `supabase/release-candidates/20261122_creatorverse_base_tables.sql`
   - New-table dependencies: public.creatorverse_comments
   - Other referenced tables: auth.users

## Overlapping tables excluded

- `parapost_groups_private.cover_uploads` — existing source: `supabase/migrations/20261020023000_groups_initial_schema.sql`
- `parapost_groups_private.feature_gate` — existing source: `supabase/migrations/20261020023000_groups_initial_schema.sql`
- `parapost_groups_private.media_cleanup` — existing source: `supabase/migrations/20261020023000_groups_initial_schema.sql`
- `parapost_groups_private.shared_post_interaction_rate_limits` — existing source: `supabase/migrations/20261024050000_group_shared_post_engagement.sql`
- `parapost_groups_private.test_users` — existing source: `supabase/migrations/20261020023000_groups_initial_schema.sql`
- `public.group_comment_likes` — existing source: `supabase/migrations/20261023040500_group_post_interactions.sql`
- `public.group_members` — existing source: `supabase/migrations/20261020023000_groups_initial_schema.sql`
- `public.group_post_comments` — existing source: `supabase/migrations/20261023040500_group_post_interactions.sql`
- `public.group_post_likes` — existing source: `supabase/migrations/20261023040500_group_post_interactions.sql`
- `public.group_post_media` — existing source: `supabase/migrations/20261020023000_groups_initial_schema.sql`
- `public.group_post_share_comment_likes` — existing source: `supabase/migrations/20261024050000_group_shared_post_engagement.sql`
- `public.group_post_share_comments` — existing source: `supabase/migrations/20261024050000_group_shared_post_engagement.sql`
- `public.group_post_share_likes` — existing source: `supabase/migrations/20261024050000_group_shared_post_engagement.sql`
- `public.group_post_shares` — existing source: `supabase/migrations/20261023050000_group_post_shares.sql`
- `public.group_posts` — existing source: `supabase/migrations/20261020023000_groups_initial_schema.sql`
- `public.groups` — existing source: `supabase/migrations/20261020023000_groups_initial_schema.sql`

## Remaining release requirements

- Verify actual production schema and migration history.
- Reconcile all foreign keys and unique constraints.
- Reconcile referenced tables and required extensions.
- Reconcile remaining function and RPC definitions.
- Review SECURITY DEFINER ownership and search paths.
- Preserve the seven-day sharing cooldown.
- Reconcile public/private RLS and EXECUTE grants.
- Reconcile triggers and notification routing.
- Reconcile media storage object permissions.
- Keep all feature gates disabled until approval.
- Perform one final isolated database validation.

## Execution restrictions

- No automatic migration execution.
- No Supabase project linking.
- No supabase db push.
- No production or staging deployment.
- The SQL review file is not a launch migration.

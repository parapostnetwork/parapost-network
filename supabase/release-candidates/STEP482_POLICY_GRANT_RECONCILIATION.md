# Step 482 — Community Policy and Grant Reconciliation

Status: REVIEW ONLY. NOT DEPLOYABLE.

- Community tables: 36
- Policy definitions examined: 56
- Unique policy keys: 44
- Overlapping policy keys: 12
- Conflicting definitions: 12
- Nonconflicting selected policies: 32
- Feature tables with grant candidates: 8
- Grant statements: 12

## Conflicts requiring resolution

- `public.group_members.group_members_read`
- `public.group_post_comments.group_post_comments_read`
- `public.group_post_likes.group_post_likes_read`
- `public.group_post_media.group_post_media_read`
- `public.group_posts.group_posts_read`
- `public.groups.groups_read`
- `storage.objects.groups_storage_delete_guard`
- `storage.objects.groups_storage_insert`
- `storage.objects.groups_storage_insert_guard`
- `storage.objects.groups_storage_read`
- `storage.objects.groups_storage_read_guard`
- `storage.objects.groups_storage_update_guard`

## Policies with PUBLIC/default role scope

- None

## Tables without derived direct grants

- `creatorverse_private.feature_gate`
- `creatorverse_private.media_cleanup`
- `creatorverse_private.media_cleanup_jobs`
- `creatorverse_private.post_share_cooldowns`
- `creatorverse_private.upload_reservations`
- `parapost_groups_private.avatar_uploads`
- `parapost_groups_private.cover_uploads`
- `parapost_groups_private.feature_gate`
- `parapost_groups_private.group_share_cooldowns`
- `parapost_groups_private.media_cleanup`
- `parapost_groups_private.promotion_settings`
- `parapost_groups_private.shared_post_interaction_rate_limits`
- `parapost_groups_private.test_users`
- `public.group_comment_likes`
- `public.group_members`
- `public.group_post_comments`
- `public.group_post_likes`
- `public.group_post_media`
- `public.group_post_share_comment_likes`
- `public.group_post_share_comments`
- `public.group_post_share_likes`
- `public.group_post_shares`
- `public.group_posts`
- `public.group_promotion_share_comment_likes`
- `public.group_promotion_share_comments`
- `public.group_promotion_share_likes`
- `public.group_promotional_shares`
- `public.groups`

## Release requirements

- Resolve conflicting policies before assembly.
- Compare grant candidates to actual staging ACLs.
- Verify each policy against its function dependencies.
- Preserve private Group and CreatorVerse media rules.
- Do not grant broad direct access to private schemas.
- Do not change production notification permissions here.
- Keep feature gates disabled.

No database SQL executed.
No deployment.

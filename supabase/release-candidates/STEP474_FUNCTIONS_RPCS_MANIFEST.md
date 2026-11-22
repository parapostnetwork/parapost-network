# Step 474 — Community Functions and RPCs

Status: REVIEW ONLY — NOT DEPLOYABLE.

## Extracted SQL

- Function declarations: 57
- Distinct function names: 51
- Security-definer declarations: 44
- Step 466 draft declarations: 3
- Names with repeated definitions: 5

## Source files

- `supabase/migrations/20260730023227_remote_schema.sql`: 0 function declarations
- `supabase/migrations/20260928050000_grant_authenticated_community_reach_sync.sql`: 0 function declarations
- `supabase/migrations/20261004010000_parachat_inbox_summary.sql`: 1 function declarations
- `supabase/migrations/20261005221909_fix_comment_notification_lifecycle.sql`: 4 function declarations
- `supabase/migrations/20261006004711_fix_post_like_notification_lifecycle.sql`: 2 function declarations
- `supabase/migrations/20261006014000_add_reply_to_comment_id.sql`: 0 function declarations
- `supabase/migrations/20261006023000_allow_post_owner_comment_delete.sql`: 0 function declarations
- `supabase/migrations/20261006040500_fix_post_share_notification_lifecycle.sql`: 1 function declarations
- `supabase/migrations/20261006220000_add_shared_comment_context.sql`: 4 function declarations
- `supabase/migrations/20261006223000_add_shared_like_and_share_notification_context.sql`: 5 function declarations
- `supabase/migrations/20261006230000_fix_shared_activity_notifications.sql`: 1 function declarations
- `supabase/migrations/20261006234000_fix_reel_notification_lifecycle.sql`: 5 function declarations
- `supabase/migrations/20261006235000_fix_reel_storage_delete_policies.sql`: 0 function declarations
- `supabase/migrations/20261007000000_add_reel_notification_preference.sql`: 1 function declarations
- `supabase/migrations/20261007001000_sync_reel_share_counts.sql`: 1 function declarations
- `supabase/migrations/20261007235000_secure_parachat_message_updates.sql`: 1 function declarations
- `supabase/migrations/20261020023000_groups_initial_schema.sql`: 21 function declarations
- `supabase/migrations/20261023040500_group_post_interactions.sql`: 2 function declarations
- `supabase/migrations/20261023050000_group_post_shares.sql`: 2 function declarations
- `supabase/migrations/20261024050000_group_shared_post_engagement.sql`: 2 function declarations
- `supabase/migrations/20261121015929_creatorverse_live_page_link.sql`: 1 function declarations
- `supabase/release-candidates/STEP466_RPC_DEFINITIONS_REVIEW_ONLY.sql.review.txt`: 3 function declarations

## Remaining production requirements

- Match functions against the 99 live staging signatures.
- Resolve missing and overlapping definitions.
- Preserve existing production functions.
- Apply least-privilege EXECUTE permissions.
- Review security-definer ownership and search paths.
- Install table policies and trigger bindings separately.
- Replace staging-only notification logic safely.
- Maintain disabled feature gates.

## Staging-named function references

- No staging-named functions in selected local sources.

## Important

This is a source extraction, not a verified
reproduction of all 99 staging functions.
No SQL was executed.

# Step 466 - Community Function Reconciliation

Status: REVIEW ONLY.

## Existing migration coverage

- Existing function signatures: 82
- Proposed draft signatures: 9
- Already defined in migrations: 4
- Unambiguous draft candidates: 3
- Deferred definitions: 2
- SECURITY DEFINER candidates needing review: 3

## Proposed function definitions

- `public.creatorverse_delete_post(p_page_id uuid, p_post_id uuid)` — `docs/sql-drafts/creatorverse-post-management-STAGING.sql`
- `public.creatorverse_directory_member_counts(p_page_ids uuid[])` — `docs/sql-drafts/creatorverse-member-counts-STAGING.sql`
- `public.creatorverse_edit_post(p_page_id uuid, p_post_id uuid, p_content text)` — `docs/sql-drafts/creatorverse-post-management-STAGING.sql`

## Deferred definitions


### SECURITY DEFINER without search_path

- `parapost_groups_private.author_visible_to_viewer(p_author_id uuid)`
- `public.groups_post_share_count(p_group_id uuid, p_post_id uuid)`

## Required before installation

- Compare signatures against actual staging pg_proc.
- Reconcile overloaded function identity arguments.
- Verify function bodies against installed staging versions.
- Review SECURITY DEFINER authorization and ownership.
- Confirm safe search_path and schema qualification.
- Reconcile function execution privileges.
- Install dependencies before dependent functions.
- Preserve seven-day sharing restrictions.
- Preserve group and CreatorVerse ownership rules.
- Preserve blocked-user restrictions.
- Preserve notification routing and privacy.
- Reconcile storage and media verification.
- Keep production feature gates disabled by default.

## Security

- Explicitly flagged definitions were excluded.
- Sensitive-content scanning is heuristic, not a guarantee.
- Review candidates are NOT approved for deployment.
- No function was executed or installed.

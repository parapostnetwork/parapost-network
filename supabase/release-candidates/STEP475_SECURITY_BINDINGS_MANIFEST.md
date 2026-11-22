# Step 475 — Security Policies and Trigger Bindings

Status: REVIEW ONLY. NOT DEPLOYABLE.

## Source inventory

- Existing migrations examined: 21
- Local draft files examined: 9
- Relevant unique policies: 12
- Relevant unique triggers: 7
- Conflicting local definitions: 0
- Excluded unrelated declarations: 225

## Important production requirements

- Compare selected definitions with the live staging catalog.
- Preserve existing production notification policies.
- Review every SECURITY DEFINER function used by policies.
- Review private media bucket permissions and access rules.
- Verify trigger handlers exist before binding triggers.
- Preserve creation, deletion and share notification behavior.
- Handle staging-specific notification functions separately.
- Add grants only after explicit authorization review.
- Keep all application and database feature gates disabled.

## Local definition conflicts

- None detected in selected local sources.

## Source declarations

- `supabase/migrations/20261020023000_groups_initial_schema.sql`: 17
- `supabase/migrations/20261023040500_group_post_interactions.sql`: 2

The last encountered local declaration for each
object name was selected for review only.
It is not automatically the correct production definition.

No SQL was executed.
No deployment was performed.

# Step 461 - Remaining Database Dependencies

Status: Preparation only. Not a verified migration.

## Release candidate

- Previously drafted SQL files: 6
- Release tables identified: 36
- Additional non-unique indexes drafted: 5
- Staging indexes deferred for reconciliation: 0
- Private media buckets drafted: 2

## Original staging export package

Not uniquely located in Documents/Downloads. Staging index definitions were not reconstructed.

## Outstanding dependencies

- functions: expected review inventory 98; source not available; `04_functions_STAGING_ONLY.sql.review.txt`
- indexes: expected review inventory 85; source not available; `05_indexes.sql.review.txt`
- policies: expected review inventory 30; source not available; `06_public_policies.sql.review.txt`
- triggers: expected review inventory 25; source not available; `07_community_triggers.sql.review.txt`
- storage: expected review inventory 11; source not available; `08_storage_policies.sql.review.txt`

## Required before migration approval

- Reconcile exact function signatures and dependencies.
- Review SECURITY DEFINER ownership, search_path and auth checks.
- Replace staging-only project and feature-gate checks.
- Preserve the seven-day sharing cooldown.
- Preserve group membership and CreatorVerse ownership rules.
- Reconcile trigger execution order and notification routing.
- Reconcile UNIQUE constraints before adding unique indexes.
- Reconcile public and private RLS policies.
- Reconcile schema USAGE, table grants and RPC EXECUTE grants.
- Reconcile storage object RLS and private bucket permissions.
- Compare notification constraints with existing production data.
- Do not copy secrets from staging function bodies.
- Keep application and database feature gates disabled.
- Validate the completed migrations once in an isolated database.
- Obtain explicit approval before production changes.

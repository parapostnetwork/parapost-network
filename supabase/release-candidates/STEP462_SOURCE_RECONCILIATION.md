# Step 462 - Staging Source Reconciliation

Status: REVIEW ONLY - NOT APPROVED FOR EXECUTION.

## Release baseline

- Previous checkpoint: b298f8c
- Release branch: release/groups-creatorverse-450
- Production remains disabled by default.
- No live database migrations executed.

## Existing table candidates

- SQL candidate files: 7
- Unique CREATE TABLE names: 36
- Duplicate CREATE TABLE names: 0


## Original staging review exports

- Functions/RPCs: NOT FOUND - `04_functions_STAGING_ONLY.sql.review.txt`
- Indexes: NOT FOUND - `05_indexes.sql.review.txt`
- Public RLS: NOT FOUND - `06_public_policies.sql.review.txt`
- Triggers: NOT FOUND - `07_community_triggers.sql.review.txt`
- Storage RLS: NOT FOUND - `08_storage_policies.sql.review.txt`

## Production migration requirements

1. Confirm exact staging function definitions.
2. Resolve staging-only guards and RPC permissions.
3. Preserve the seven-day sharing cooldown.
4. Reconcile triggers and notification destinations.
5. Preserve owner, member and blocking permissions.
6. Reconcile unique indexes and constraints.
7. Reconcile restrictive and permissive RLS.
8. Confirm private media bucket settings and MIME limits.
9. Preserve production notification data and constraints.
10. Keep community gates disabled pending approval.

## Security

- No exported function bodies copied.
- No secrets copied into the release candidate.
- No production grants generated blindly.
- Exact RPC permissions still require reconciliation.

## Catalog query

`STEP462_STAGING_CATALOG_READ_ONLY.sql.review.txt`

This is a read-only staging query, not a migration.
It has not been executed.

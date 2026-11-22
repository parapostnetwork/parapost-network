# Step 481 — Community RLS and Storage

Status: REVIEW ONLY — NOT EXECUTED.

## Recovered staging policy layer

- Community table policies: 30
- Community Storage policies: 14
- Total: 44

## Covered

- Groups and Group posts
- Group memberships
- Group comments and likes
- CreatorVerse pages and posts
- CreatorVerse media and follows
- CreatorVerse comments and likes
- CreatorVerse shares
- Private Group and CreatorVerse storage buckets

## Production integration requirements

- Deduplicate overlapping Step 475 policies.
- Confirm function definitions and EXECUTE permissions.
- Apply only controlled table grants after RLS is ready.
- Preserve unrelated production Storage policies.
- Review CreatorVerse media read restrictions.
- Keep the community feature gates disabled.
- Do not deploy until explicitly approved.

## Important

The source preserves staging policy behaviour.
It does not establish that every staging rule is
suitable for production without integration review.

No SQL executed.
No staging or production changes.

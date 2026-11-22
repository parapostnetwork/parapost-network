# Step 478 — Community Notification Security

Status: REVIEW ONLY. NOT DEPLOYED.

## Prepared

- Community notification visibility function.
- Security-definer function with explicit search path.
- Authenticated-only function execution grant.
- Restrictive client INSERT guard.
- Restrictive authenticated SELECT guard.
- Blocked-user checks.
- Private Group membership checks.
- Removed and banned member restrictions.
- Verification of published posts and active pages.
- Preservation of existing non-community notification policies.

## Requirements before deployment

- Install the community function dependencies first.
- Reconcile the production notification type constraint.
- Confirm schema USAGE and function EXECUTE privileges.
- Confirm current production notification RLS compatibility.
- Install community event notification triggers separately.
- Preserve all existing notification and push handlers.
- Keep feature gates disabled until approved.

## Next phase

Step 479: Prepare the notification event functions and
their trigger bindings for Groups and CreatorVerse.

No database SQL executed.
No production or staging changes.

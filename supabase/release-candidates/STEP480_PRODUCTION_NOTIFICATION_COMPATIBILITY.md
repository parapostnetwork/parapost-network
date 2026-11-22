# Step 480 — Production Notification Compatibility

Status: REVIEW ONLY. NOT DEPLOYED.

## Confirmed against production (read-only)

- Existing notification constraint permits 16 types.
- Step 477 retains all 16 existing types.
- Step 477 adds 12 community types.
- Existing notifications_type_check constraint exists.
- Existing client notification validation must be preserved.
- Existing push trigger parapost_push_notifications must be preserved.

## Protection added

- Before replacing the notification constraint, verify its
  production definition against the verified snapshot.
- If the constraint has changed, abort the transaction.
- Do not silently remove newly introduced notification types.
- Do not replace existing notification validation or push functions.

## Remaining release work

- Complete community RLS and Storage permissions.
- Resolve missing function and trigger dependencies.
- Confirm production deployment order.
- Keep all community feature gates disabled.
- Obtain explicit approval before production execution.

No database SQL executed.
No deployment.

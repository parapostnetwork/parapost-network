# Parapost Network Staging Security Handoff
Date: October 8, 2026

## Environment
Supabase Staging: vmgelrgrtpghmvqgufzz
Production: luzesphgdqazqhmqlniy

## Completed in Staging

1. Restricted unnecessary notification table privileges.
2. Installed secure Parachat notification generation through a verified RPC.
3. Added message notification duplicate protection.
4. Restricted direct client insertion of Parachat notifications.
5. Added notification update protection.
6. Verified Parachat message update authorization.
7. Installed Reel notification lifecycle protections.
8. Installed Reel storage deletion policies.
9. Installed Reel notification preferences.
10. Installed Reel share count synchronization.

## Migration History

The five outstanding migrations were manually reconciled.
All five migration-history checks passed.

These migration records were added after manual installation.
Their original SQL statements were not stored in those records.

## Parked Security Files

supabase/20261008000000_secure_notification_authorization.sql
supabase/20261008001000_secure_parachat_notifications.sql

These files contain SQL already implemented in staging.

DO NOT execute them again as written.
DO NOT move them into the active migrations folder without review.

## Remaining Work

- Prepare reviewed production-safe migrations when ready.
- Compare staging changes against the production schema.
- Complete deferred functional testing.
- Verify deployment configuration before production release.

## Safety

The local Supabase CLI was previously linked to production.
Do not run linked migrations or migration repairs without
independently verifying the target project.

No production deployment is authorized by this document.

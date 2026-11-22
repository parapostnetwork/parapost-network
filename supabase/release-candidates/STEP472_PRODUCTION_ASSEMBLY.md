# Step 472 — Production SQL Assembly

Status: REVIEW ONLY — NOT APPROVED FOR EXECUTION.

## Sources assembled

- Existing migration files: 21
- Additional table definitions: Step 465
- Additional RPC definitions: Step 466
- Media and notification dependencies: Step 461
- Total source files: 24

## Production differences to resolve

- Production has no Groups or CreatorVerse feature tables.
- Preserve existing production notification records.
- Reconcile five community notification columns.
- Preserve production's existing migration history.
- Match the complete staging table structure and constraints.
- Review SECURITY DEFINER permissions and RLS.
- Replace staging-specific notification integration safely.
- Reconcile source dependencies and transaction boundaries.
- Leave application and database feature gates disabled.

## Sources referencing staging notification handlers

- None detected by the filename/content pattern scan.

## Assembly

- SHA-256: `cdcec095162536c8fd443b98eec08146f1cf9639d6da77dd34dbe984ab6607a4`
- Source sections: 24
- No SQL was executed.
- No staging or production deployment.

Next: resolve production-specific SQL differences
and produce an executable migration only after review.

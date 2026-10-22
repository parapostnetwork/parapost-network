# Groups local completion and staging review

Review date: 2026-10-21. Work is isolated in `/tmp/parapost-groups-stage-20261019`. No deployment, commit, push, fetch, database mutation, migration application, or Supabase relinking was performed. Production and the original repository were not modified. The CLI remains linked to production: **never use `supabase db push` for this work**.

## Outcome

Implemented discovery/search/filtering/pagination, public/private creation, settings and typed-name deletion; custom cover upload/replacement/removal; public joining and private requests; approvals, rejections, leaving, removal, bans and owner-controlled restoration; owner/admin/moderator/member permissions; text/photo/video posts, authorized editing/deletion and moderation. Forms include validation, progress/error states and media previews. Dashboard links remain disabled by default.

`app/groups/GroupCover.tsx` reuses the exact existing `/parapost-icon-white.png` used by dashboard `ParaGhostLogoIcon`. It provides the default for both visibility types, cards, headers, creation and settings previews. Custom covers replace it; removal, failed fetching or failed image decoding restore it. The original artwork and unrelated platform branding were not changed.

Local preview: http://127.0.0.1:3131/groups-local-preview . It uses the actual Groups interface with an injected in-memory transport, no real Groups credentials or database. Reload resets mock changes. It requires development mode, an explicit preview flag, and localhost host; the mock module also rejects production execution. The original standalone `app/groups-preview` mockup is preserved.

## Final audit corrections

The audit reproduced and fixed a stale selected-file bug: removing a cover restored the header but left the settings file selected, allowing a later Save to upload it again. Settings now remount when the persisted cover changes, clearing that file. Browser retesting confirmed both images remain ParaGhost after removal and another Save.

Authentication handling now invalidates pending data requests and clears Groups, posts, members and editing/upload state immediately when the account changes. A late initial identity lookup cannot overwrite a newer auth event, and lookup failures end the loading state safely. This is locally type/lint checked; real-session account-switch acceptance remains pending.

Prepared SQL tests now also check disabled-gate rejection, unlisted-account denial, anonymous-JWT denial, prohibited self-allowlisting and prohibited client broad enablement. They have not been executed.

## Validation and limitations

- Current focused suite (re-run during final audit): **14 passed, 0 failed, 0 skipped**, including cover removal, roles, membership, mock media and deletion behavior. These are not database authorization tests.
- Earlier full local suite: **441 passed, 0 failed, 0 skipped**; not repeated after the branding changes. Current focused tests cover those changes.
- TypeScript passed; targeted Groups lint passed. Full repository lint has 26 pre-existing errors and 305 warnings. Dashboard's five errors match its baseline, with only the two-line import offset; other errors are in unmodified files.
- Final audit offline webpack build passed after the cover-form and authentication fixes. Font responses were mocked and Supabase variables were inert loopback placeholders. This verifies compilation, not real integration or a release build.
- The pre-existing dependency symlink points outside this worktree. Installed Next is 16.2.2, whereas package/lock declare 16.4.1. Turbopack fails on that symlink; normal webpack also encountered unavailable font-network/environment dependencies. A clean pinned installation and genuine staging build remain required. Dependencies were not changed.
- Browser verification covered creation, text posting, private request/approval and visitor restrictions. Directory widths 375/390/768/1280 and detail width 390 were checked for overflow. Final browser check confirmed all three directory ParaGhost images loaded from the exact official asset.
- Final audit browser tests now verified actual local file selection, decoded custom cover display in header/settings, removal restoring both ParaGhost images, saving again without re-uploading the removed cover, publishing/decoding a photo post, and moderator deletion of that post. Detail overflow checks passed at widths 375/390/768/1280. Adapter tests exercise image/video blobs, roles, removal/bans and deleted-media denial. Real video selection/playback and physical iOS/Android/tablet testing remain unverified. No valid local video fixture was available; an attempt to encode one with the installed Swift/AVFoundation toolchain failed. No dependencies were installed. Viewport checks are not physical-device tests.
- Logs and baseline comparisons are in `work/groups/`. SQL has been reviewed locally but not executed or validated against the real schema/Storage service.

No known requested UI feature remains intentionally unimplemented. Acceptance is incomplete until the real authorization, upload, playback, cleanup and concurrency checks below pass. Neither mock tests nor the offline build establish production readiness.

## Security design and remaining risks

App flags default off; both server and public flags plus an exact staging/loopback URL restriction are required. Production project URL is explicitly rejected. Authenticated API requests additionally call the DB gate. The private database gate defaults disabled, and `allow_all_authenticated` defaults false. Only approved UUIDs in private `test_users` can pass; clients cannot edit either table. Anonymous users are excluded.

Tables use RLS with authenticated SELECT only. Writes use an allowlisted command RPC, authenticated caller identity, fixed SECURITY DEFINER search paths and private helpers with restricted grants. Group-row locks serialize commands. Owner identity and owner membership are protected; administrators manage ordinary membership, moderators moderate posts, only owners assign roles/restore staff. Rejected/removed/banned states persist, so leaving cannot bypass them. Restoration returns a user to pending. Both existing blocking systems are considered. Cross-group post/media IDs and reserved paths are checked.

`group-media` stays private. Restrictive Storage policies constrain legacy permissive policies, allow authenticated object download/upload only, and deny client update/delete, signed links, listing and bucket reconfiguration. Upload reservations are scoped, generated and expiring; publication checks object metadata and references. App media responses are authenticated, no-store, nosniff and sandboxed; no persistent signed links are issued. Private group covers are directory metadata; private post media requires approved access.

Fresh downloads lose access after revocation/deletion; previously downloaded bytes and in-flight responses cannot be recalled. Browser validation is bypassable; metadata MIME is not proof of codec validity. Download signature checks reject mismatches, but no antivirus/transcoding pipeline is claimed. Validate actual media behavior on staging.

Deletion queues physical Storage cleanup; access is revoked first. A staging-only operator script removes queued unreferenced bytes after 24 hours and acknowledges successful removal. Abandoned drafts/reservations are pruned. Cleanup is not scheduled or enabled automatically; operating it is a rollout prerequisite. SQL does not directly delete `storage.objects` rows.

Critical unresolved integration assumptions: Storage supports `storage.allow_only_operation` and the exact operation names; existing profile/block tables match migration references; existing triggers/policies cooperate; SQL compiles and grants/RLS resist direct SDK/RPC bypass; concurrent membership revocation/publication behaves correctly. Migration preflight rejects missing operation helper, but only real tests establish compatibility. Keep the gate off if any test fails.

## Files and scope

Modified tracked file: `app/dashboard/page.tsx` (gated desktop and mobile Groups links).

New implementation files:

- `app/groups/{layout.tsx,page.tsx,[id]/page.tsx,GroupsClient.tsx,GroupCover.tsx,groups.module.css}`
- `app/api/groups/{route.ts,media/route.ts}`
- `lib/groups/{config.ts,server.ts,client.ts,transport.ts,types.ts,validation.ts}`
- `app/groups-local-preview/{layout.tsx,page.tsx,[id]/page.tsx,PreviewShell.tsx,preview-data.ts}`
- `supabase/migrations/20261020023000_groups_initial_schema.sql`
- `scripts/groups/cleanup.mjs`
- `tests/groups.test.mjs`, `tests/groups-preview.test.mjs`
- `tests/groups/authorization.sql`, `tests/groups/storage-and-roles.mjs`
- `docs/GROUPS_REVIEW.md`

Preserved previous mockup: `app/groups-preview/page.tsx` and its stylesheet. `work/groups/original-schema.sql` preserves the original SQL draft; `work/groups/` also contains local evidence/fixtures/font mocks and should not be shipped as application code. Existing public branding asset is reused, not modified.

## Git integration

Rechecked without fetching: detached HEAD `1ff701b`, cached `origin/staging` `1ff701b`; local staging `de92a3c` is nine commits behind HEAD (0 commits unique to staging). Existing baseline commits include dependency/auth/security and other platform changes; do not overwrite them. No merge/rebase was attempted, so current remote state and integration conflicts remain unknown. Review the file manifest and untracked files before selectively staging anything; exclude local evidence and mock font configuration.

## Approval-gated staging sequence

1. Owner reviews this migration and application diff. Before any approved staging change, capture a recoverable staging database/schema backup, existing Storage bucket settings/policies, deployment revision and environment configuration; record the restoration procedure and verify backup availability. A database backup alone does not back up Storage object bytes: preserve/export any pre-existing group-media objects separately if present. Keep credentials out of logs and reports. Obtain explicit approval for remote operations, Git integration, schema changes, disposable test data, cleanup and deployment; these are separate scopes.
2. After approved fetch, reconcile the real staging ref with the baseline and preserve existing platform fixes. Commit/push only after separate approval. Use a clean isolated install of the lockfile dependencies, including declared Next 16.4.1, and run typecheck, focused tests, lint and a real build. Do not reuse the outside-worktree symlink as release evidence.
3. Independently verify the target is **vmgelrgrtpghmvqgufzz**, not **luzesphgdqazqhmqlniy**. Review existing schema/block tables, Storage operation helper, policies and bucket configuration. Apply the reviewed migration only through an explicitly approved connection to staging; do not relink the production CLI or use db push. Leave the DB gate disabled initially.
4. With explicit data-change approval, add only designated disposable tester UUIDs to `parapost_groups_private.test_users`; enable the gate for testers while keeping `allow_all_authenticated=false`. Verify ordinary accounts, anonymous identities and unapproved testers remain denied.
5. Execute prepared `tests/groups/authorization.sql` only on the independently verified approved staging connection. Its session approval flag is `app.groups_test_approved='isolated-groups-test'`; fixtures run inside a rollback transaction. Review auth-user triggers before execution. Rollback tests still count as database mutations and require approval.
6. Run `tests/groups/storage-and-roles.mjs --execute-approved-staging` only with `GROUPS_DB_TEST_APPROVED=vmgelrgrtpghmvqgufzz`, exact staging `GROUPS_TEST_URL`, its anon key and four distinct disposable OWNER/MEMBER/ADMIN/MODERATOR JWT fixtures. Never print/store credentials in source or reports. This test creates real Groups/Storage data; cleanup queues still require the operator. It covers direct access, ownership/role attacks, membership, image/video authorization, signed URLs, cross-group references, deletion and cover removal. Review output privately and investigate every failure.
7. After approval, deploy only to staging with valid staging public URL/anon key and `GROUPS_ENABLED=true`, `NEXT_PUBLIC_GROUPS_ENABLED=true`. Leave `GROUPS_LOCAL_PREVIEW` unset. Do not put a service-role credential in application/browser env. Public flags are build-time settings. Gate stays tester-only throughout validation.
8. Verify public/private workflows, block relationships in both directions in both systems, direct table/RPC bypass, expired/replayed reservations, revoked/deleted media, bucket privacy and denied signed downloads/uploads. Exercise simultaneous role/removal/publication and deletion/cleanup races, including existing policies. Test custom cover replacement/removal/failure, text/photo/video, and real playback/uploads in Safari/Chrome on phone/tablet/desktop. Verify dashboard/Parachat/Reels/auth/notifications regressions with real staging sessions.
9. Approve a staging-only cleanup operator and run `scripts/groups/cleanup.mjs --execute-approved-staging` with `GROUPS_CLEANUP_APPROVED=vmgelrgrtpghmvqgufzz`, exact `GROUPS_TEST_URL`, and privately supplied `GROUPS_STAGING_SERVICE_ROLE_KEY`. Verify delayed physical removal, queue retries and abandoned uploads after the 24-hour window. Establish an approved recurring operator before broader rollout.
10. Only after all checks and independent review pass may the owner approve broader exposure. Do not automatically set `allow_all_authenticated=true`. Production rollout is outside this assignment.

## Rollback and readiness decision

Disable the DB gate first and both app flags, then rebuild/redeploy the approved app revision as needed. Keep the private bucket and restrictive Storage policies; dropping guards is not a safe rollback. Preserve data/cleanup queue for recovery. Schema reversal or data deletion requires a separately reviewed, explicitly approved plan.

**Recommendation: CONDITIONAL** for controlled, approved tester staging only; **NO** for ordinary-user or production enablement.

**Migration:** prepared candidate for approved staging preflight and testing, not proven safe to apply blindly. **Application:** locally implemented and compilation-checked; candidate for controlled tester staging after pinned build/schema checks, not accepted for broad deployment. **Pending owner approvals:** remote Git integration/commit/push, staging schema application, test fixtures/integration runs, staging deployment, cleanup operation and any later broad enablement. No such actions were performed.

## Final audit evidence and precise boundaries

Latest local logs: `work/groups/audit-tests.log` (14/0/0 passed/failed/skipped), `audit-lint.log` (no findings), `audit-typecheck.log` (no findings), `audit-offline-build.log` (completed successfully, exit 0). Preview verification: HTTP 200 at the documented URL, real `/api/groups` HTTP 404, real `/groups` contains the not-found response. Final directory screenshot: `work/groups/final-preview.png`. The historical whole-repository lint result remains 26 errors/305 warnings and was not rerun unnecessarily. Browser upload and moderation checks changed only disposable in-memory fixtures.

The local SQL audit confirms explicit RLS enablement, grant revocations, owner guards, fixed definer search paths, and restrictive Storage policies in the migration text. It does not confirm execution on Supabase. Existing repository Storage policies include bucket-scoped reel rules; the complete deployed policy inventory is unknown without an approved live read. Restrictive guards are intended to AND with permissive client policies, but privileged service roles bypass RLS and must remain operator-only.

Both block systems are consulted for caller-versus-Group-owner access and approval relationships. This is not a claim that every pair of blocked ordinary members is hidden from one another in a shared Group. Direct Storage authorization uses JWT claims plus current user existence, gate and membership checks; revoked sessions may retain otherwise-valid JWTs until expiry. Application routes additionally validate through Auth. These boundaries need explicit security acceptance during staging.

The group creation count cap is a convenience limit, not a concurrent-request rate limiter. Group-scoped writes lock the Group row; creation, independent block changes and service uploads are outside that serialization. Include these cases in staged concurrency/rate-limit acceptance. No exploit-free or production-security certification is claimed.

Security acceptance requires: all negative authorization assertions pass; unlisted/anonymous users are denied; no signed-link or legacy-policy bypass; no cross-group or role escalation; owner/cascade protections hold; fresh media downloads fail after revocation/deletion; cleanup removes only unreferenced objects; both block systems and concurrent mutations behave as intended; non-Groups buckets and existing platform flows remain unaffected. Any failure keeps the gate off.

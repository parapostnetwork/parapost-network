# Groups Phase 2 local review — 2026-10-23

Worktree: `/tmp/parapost-groups-photo-fix-20261022`; branch: `groups-staging-20261023`.

## Completed locally

- Full-width community banner uses 1640:856 (approximately 1.91:1), with centered cover cropping and no distortion. Existing uploaded files are preserved; recommendations do not add dimension restrictions. Official ParaGhost remains the default, on the same purple/black presentation for public and private Groups.
- Wider page shell, unified banner/title/privacy/member/owner header, grouped management controls, and an 880px reading column. Shared Dashboard/Profile composer, avatars, menus, media and action icons remain in use. Existing user accent/font variables remain respected.
- Purple/black page, header, composer, post, comment and empty-state surfaces, with responsive spacing, contrast, focus states and touch targets.
- Removed the permanent upload-limit caption. Existing MIME, size and attachment-count validation and contextual errors remain intact.
- Replaced Newer/Older post buttons with IntersectionObserver loading. The API retains existing offset compatibility and adds a validated timestamp/UUID cursor; authorization and RLS remain unchanged. Batches append with ID deduplication, preserve timestamp precision, and use ID ordering for ties. Errors offer an explicit retry. New content/membership refresh restarts from the newest page, clearing stale private content as before.
- Comment panel label changed to Hide. Hiding/reopening retains local draft and saved content. Existing comment/reply Likes, unlikes and replies are preserved; their handlers are covered by local tests. Public shares still call the existing share RPC; private posts expose no share action.
- Existing post Edit/Delete menus and owner/moderation checks retained.
- Added development/flag/localhost guards to the pre-existing untracked local preview route. Added optional 45-post fixtures for testing incremental loading; no real database data is involved.

## Genuine blocker: comment/reply deletion

The locally supplied interaction SQL `supabase/migrations/20261023040500_group_post_interactions.sql` grants SELECT only on comments and its `groups_interact` command supports likes, unlikes, comments and replies, but no deletion branch. The API whitelist likewise has no deletion command. Dashboard deletion acts on a different table with different policies; copying that call would not authorize Group comment deletion.

Therefore working comment/reply deletion is **not implemented or claimed complete**. No misleading Delete control or privileged client workaround was added. No SQL or migration history was changed. The live manually installed function was not reinstalled or queried during this pass, so if it differs from the supplied SQL its reviewed definition is needed.

Proposed separately approved change:

1. Extend the existing authenticated interaction RPC with `delete_comment`, using the existing Group membership/gate checks and Group transaction lock.
2. Resolve the target by both comment ID and post ID after verifying that post belongs to the supplied Group. Allow deletion of the caller's own comment/reply. Do not infer new moderator privileges from post moderation; any broader comment moderation must be explicitly approved.
3. The existing composite parent foreign key uses ON DELETE CASCADE. Preserve that behavior: deleting a parent also removes its replies and their Likes; make this consequence explicit in confirmation text. Deleting a reply leaves the parent intact.
4. Wire the API allowlist/validated identifiers and a shared-style options menu with confirmation. Refresh comment/reply/Like counts on confirmed success; retain content and show errors on denial.
5. Test own deletion, cross-user/cross-post/cross-Group denial, revoked membership, parent cascades and concurrent replies. Apply only to separately approved staging, never through automatic migration deployment.

## Local validation

- Focused test set: 27 passed, 0 failed, 0 skipped. Includes existing Groups/media safeguards, actual interaction-handler tests against an in-memory transport, Hide/draft preservation, cursor validation/injection rejection, and append/deduplication behavior.
- TypeScript: passed. Targeted ESLint: passed with no findings after resolving a pre-existing test-harness variable rule and an obsolete disable comment in the touched component. Diff whitespace check: passed.
- Browser: actual feed grew 20 → 40 → 45 mock posts, retained the first post and reached its end state. No Newer/Older buttons remain.
- Browser: comment panel opens with Hide, and local handler tests confirm a draft survives Hide/reopen. Phone widths 375/390/430, tablet 768 and desktop 1440 showed no horizontal overflow. Mobile post/comment layout and desktop banner were visually inspected.
- Production-style Next 16.4.1 webpack build: passed (exit 0), using real font handling and inert loopback placeholders. All checks use local fixtures or inert loopback Supabase configuration; no live database security or staging acceptance is claimed.

## Files in this pass

- `app/groups/GroupCover.tsx`: banner variant.
- `app/groups/groups.module.css`: coordinated page/header/management design.
- `app/groups/groupPosting.module.css`: coordinated shared-post/comment surfaces and responsive touch targets.
- `app/groups/GroupPostComposer.tsx`: remove default limits caption.
- `app/groups/GroupPostActions.tsx`: Hide label.
- `app/groups/GroupsClient.tsx`: unified header, reading column, automatic pagination.
- `app/api/groups/route.ts`, `lib/groups/feed.ts`: validated cursor and feed append utility.
- `tests/groups-phase2.test.mjs`, existing untracked `tests/group-post-interactions.test.mjs`: focused regressions.
- Existing untracked `app/local-groups-check/page.tsx` and new `layout.tsx`: local mock pagination fixture and development-only guard.
- This report.

The pre-existing AGENTS.md change, untracked interaction/sharing SQL and other existing work were preserved. Do not automatically stage/apply the unreconciled migration files. No commits, pushes, fetches, deployments, SQL execution, database changes, project relinking or production changes were performed in this pass.

Preview: http://127.0.0.1:3133/local-groups-check (mock data, development only). Add `?pagination=1` for the 45-post loading fixture. This preview is not a replacement for staging acceptance of real accounts, uploads, profiles and installed SQL.

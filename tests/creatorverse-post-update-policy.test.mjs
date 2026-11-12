import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rls = readFileSync(
  'docs/sql-drafts/creatorverse-foundation-rls.sql',
  'utf8'
);

const post = readFileSync(
  'lib/creatorverse/post-write.ts',
  'utf8'
);

const policy = rls
  .split('CREATE POLICY creatorverse_post_edit ')[1]
  ?.split('CREATE POLICY creatorverse_follow_read')[0];

test('post update policy exists', () => {
  assert.ok(policy);
});

test('ordinary updates cannot publish posts', () => {
  assert.ok(policy);

  const [using, check] = policy.split('WITH CHECK');

  assert.match(using, /status='draft'/);
  assert.match(check, /status='draft'/);

  assert.doesNotMatch(
    policy,
    /status\s*<>\s*'published'/
  );
});

test('publishing remains hard-locked', () => {
  assert.match(
    post,
    /function postPublishingApproved\(\): boolean \{(?:\s*\/\/[^\n]*)*\s*return false;\s*\}/
  );
});

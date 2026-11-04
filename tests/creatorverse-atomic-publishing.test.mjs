import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  'docs/sql-drafts/creatorverse-atomic-publishing-DRAFT.sql',
  'utf8'
);

const post = readFileSync(
  'lib/creatorverse/post-write.ts',
  'utf8'
);

test('SQL draft cannot be accidentally executed', () => {
  assert.match(
    sql,
    /BEGIN;\s*DO \$stop\$[\s\S]*?RAISE EXCEPTION/
  );
});

test('publishing requires authenticated ownership', () => {
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /creatorverse_private\.write_enabled\(\)/);
  assert.match(sql, /creatorverse_private\.owns\(p_page_id\)/);
  assert.match(sql, /creatorverse_private\.read_page\(p_page_id\)/);
});

test('publication locks the draft and checks media', () => {
  assert.match(sql, /status = 'draft'[\s\S]*?FOR UPDATE/);
  assert.match(sql, /FROM public\.creatorverse_media[\s\S]*?FOR SHARE/);
  assert.match(sql, /verification <> 'verified'/);
  assert.match(sql, /v_media_count > 4 OR v_bad_media > 0/);
});

test('published media mutations have a database guard', () => {
  assert.match(sql, /guard_published_media/);
  assert.match(sql, /v_status = 'published'/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OR DELETE/);
});

test('the SQL draft grants no publishing access', () => {
  assert.doesNotMatch(sql, /^\s*GRANT\b/gim);
  assert.match(sql, /REVOKE ALL ON FUNCTION/);
});

test('application publishing remains disabled', () => {
  assert.match(
    post,
    /function postWritesApproved\(\): boolean \{\s*return false;/
  );
});

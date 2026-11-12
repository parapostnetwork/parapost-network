import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = path => readFileSync(path, 'utf8');

const post = read('lib/creatorverse/post-write.ts');
const page = read('lib/creatorverse/page-write.ts');
const rls = read('docs/sql-drafts/creatorverse-foundation-rls.sql');
const schema = read('docs/sql-drafts/creatorverse-foundation-schema.sql');

test('page and post writes remain hard-locked', () => {
  assert.match(page,
    /function pageWritesApproved\(\): boolean \{\s*return false;/);

  assert.match(post, /function postDraftsApproved\(\): boolean \{(?:\s*\/\/[^\n]*)*\s*return false;\s*\}/);
  assert.match(post,
    /function postPublishingApproved\(\): boolean \{(?:\s*\/\/[^\n]*)*\s*return false;\s*\}/);
});

test('client roles have no post insert or update grants', () => {
  assert.match(rls,
    /REVOKE ALL ON[\s\S]*?public\.creatorverse_posts,[\s\S]*?FROM PUBLIC, anon, authenticated;/i);

  assert.doesNotMatch(rls,
    /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)\b[^;]*public\.creatorverse_posts\b/i);
});

test('post creation requires owner identity and draft status', () => {
  assert.match(rls, /author_id=\(SELECT auth\.uid\(\)\)/);
  assert.match(rls, /status='draft'/);
  assert.match(schema, /status text NOT NULL DEFAULT 'draft'/);
});

test('publishing uses the owner permission and draft filter', () => {
  assert.match(post,
    /requireCreatorVerseOwner\(\s*request,\s*validatedPageId,\s*true/);

  assert.match(post, /creatorverse_publish_post/);
  assert.match(post, /p_page_id: validatedPageId/);
  assert.match(post, /p_post_id: validatedPostId/);
  assert.doesNotMatch(post, /\.update\(\{\s*status: 'published'/);
});

test('unverified media remains pending by default', () => {
  assert.match(schema,
    /verification text NOT NULL DEFAULT 'pending'/);

  assert.match(schema,
    /verification IN \('pending','verified','rejected'\)/);
});

test('CreatorVerse mutation routes match the staging route inventory', () => {
  const root = 'app/api/creatorverse';
  const actual = [];
  for (const relative of readdirSync(root, { recursive: true })) {
    if (!relative.endsWith('route.ts')) continue;
    const source = read(join(root, relative));
    for (const match of source.matchAll(/export\s+(?:async\s+function|const)\s+(POST|PATCH|PUT|DELETE)\b/g)) {
      actual.push(match[1] + ' ' + relative);
    }
  }
  assert.deepEqual(actual.sort(), [
    'PATCH pages/[id]/details/route.ts',
    'POST [id]/posts/[postId]/interactions/route.ts',
    'POST [id]/posts/[postId]/media/[mediaId]/cancel/route.ts',
    'POST [id]/posts/[postId]/media/[mediaId]/verify/route.ts',
    'POST [id]/posts/[postId]/media/reserve/route.ts',
    'POST [id]/posts/[postId]/publish/route.ts',
    'POST [id]/posts/draft/route.ts',
    'POST internal/media-maintenance/route.ts',
    'POST pages/[id]/activate/route.ts',
    'POST pages/draft/route.ts',
  ].sort());
});

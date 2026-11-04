import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = path => readFileSync(path, 'utf8');

const source = read('lib/creatorverse/page-write.ts');

test('CreatorVerse page writes remain locked', () => {
  assert.match(
    source,
    /function pageWritesApproved\(\): boolean\s*\{\s*return false;\s*\}/
  );

  const guards = source.match(/if \(!pageWritesApproved\(\)\)/g) ?? [];

  assert.equal(guards.length, 2);
});

test('Page creation uses authenticated user identity', () => {
  assert.match(
    source,
    /const \{ client, userId \} = await creatorVerseClient\(request\)/
  );

  assert.match(source, /if \(!userId\)/);
  assert.match(source, /owner_id: userId/);
  assert.match(source, /status: 'draft'/);
});

test('Page editing requires verified ownership', () => {
  assert.match(source, /requireCreatorVerseOwner\(/);
  assert.match(source, /\.eq\('id', validatedId\)/);
  assert.match(source, /\.eq\('owner_id', userId!\)/);
  assert.match(source, /validatePageFields\(input\)/);
});

test('CreatorVerse APIs expose no write handlers', () => {
  function routes(folder) {
    return readdirSync(folder, { withFileTypes: true }).flatMap(item => {
      const path = join(folder, item.name);
      if (item.isDirectory()) return routes(path);
      return item.name === 'route.ts' ? [path] : [];
    });
  }

  const files = routes('app/api/creatorverse');
  assert.ok(files.length >= 2);

  for (const file of files) {
    assert.doesNotMatch(
      read(file),
      /export\s+(?:async\s+function|const)\s+(?:POST|PUT|PATCH|DELETE)\b/,
      `Unexpected write handler in ${file}`
    );
  }
});

test('SQL drafts default to disabled writes and RLS', () => {
  const schema = read('docs/sql-drafts/creatorverse-foundation-schema.sql');
  const rls = read('docs/sql-drafts/creatorverse-foundation-rls.sql');

  assert.match(schema, /writes_enabled boolean NOT NULL DEFAULT false/);
  assert.match(schema, /ALTER TABLE public\.creatorverse_pages ENABLE ROW LEVEL SECURITY/);

  assert.match(rls, /owner_id=\(SELECT auth\.uid\(\)\)/);
  assert.match(rls, /creatorverse_private\.write_enabled\(\)/);
});

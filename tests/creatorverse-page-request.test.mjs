import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';

// Load the actual TypeScript modules without starting Next.js
// or connecting to any external service.
const cache = new Map();

function loadModule(path) {
  const filename = resolve(path);
  if (cache.has(filename)) return cache.get(filename);

  const source = readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule.exports);

  const localRequire = name => {
    if (name === 'server-only') return {};
    if (name.startsWith('.')) {
      return loadModule(resolve(dirname(filename), `${name}.ts`));
    }
    throw new Error(`Unexpected dependency: ${name}`);
  };

  const execute = new Function(
    'require', 'module', 'exports', 'TextDecoder',
    compiled
  );

  execute(localRequire, loadedModule, loadedModule.exports, TextDecoder);
  return loadedModule.exports;
}

const { parseCreatorVersePageRequest: parse } =
  loadModule('lib/creatorverse/page-request.ts');

const valid = {
  name: 'My CreatorVerse Studio',
  category: 'business',
  short_bio: 'Our official page',
  description: 'News and updates',
  website: 'https://example.com',
  social_links: [],
  public_email: null,
  location: 'Toronto',
};

function request(body, contentType = 'application/json', extras = {}) {
  return new Request('http://localhost/creatorverse-test', {
    method: 'POST',
    headers: {
      'content-type': contentType,
      ...extras,
    },
    body,
  });
}

async function rejects(body, expectedStatus, contentType, extras) {
  await assert.rejects(
    parse(request(body, contentType, extras)),
    error => error?.status === expectedStatus
  );
}

test('accepts and normalizes valid page details', async () => {
  const result = await parse(request(JSON.stringify(valid)));
  assert.equal(result.name, valid.name);
  assert.equal(result.website, 'https://example.com/');
  assert.equal(result.category, 'business');
});

test('rejects protected fields', async () => {
  for (const field of ['owner_id', 'status', 'logo_media_id']) {
    await rejects(
      JSON.stringify({ ...valid, [field]: 'unauthorized' }),
      400
    );
  }
});

test('rejects invalid page categories', async () => {
  await rejects(
    JSON.stringify({ ...valid, category: 'administrator' }),
    400
  );
});

test('rejects unsafe website protocols', async () => {
  await rejects(
    JSON.stringify({ ...valid, website: 'javascript:alert(1)' }),
    400
  );
});

test('rejects invalid public email', async () => {
  await rejects(
    JSON.stringify({ ...valid, public_email: 'not-an-email' }),
    400
  );
});

test('rejects malformed JSON', async () => {
  await rejects('{"name":', 400);
});

test('rejects non-JSON content types', async () => {
  await rejects(JSON.stringify(valid), 415, 'text/plain');
});

test('rejects oversized declared content length', async () => {
  await rejects(
    JSON.stringify(valid),
    413,
    'application/json',
    { 'content-length': '65537' }
  );
});

test('rejects oversized streamed request bodies', async () => {
  const oversized = {
    ...valid,
    description: 'x'.repeat(70000),
  };
  await rejects(JSON.stringify(oversized), 413);
});

test('rejects missing request bodies', async () => {
  const empty = new Request('http://localhost/creatorverse-test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });

  await assert.rejects(
    parse(empty),
    error => error?.status === 400
  );
});

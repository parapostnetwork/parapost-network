import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(
  'lib/creatorverse/post-request.ts',
  'utf8'
);

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

class TestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const loadedModule = { exports: {} };

new Function('require', 'module', 'exports', compiled)(
  name => {
    if (name === 'server-only') return {};
    if (name === './permissions') {
      return { CreatorVerseError: TestError };
    }

    throw new Error(`Unexpected dependency: ${name}`);
  },
  loadedModule,
  loadedModule.exports
);

const { parseCreatorVersePostRequest: parse } =
  loadedModule.exports;

function request(body, type = 'application/json', headers = {}) {
  return new Request('http://localhost/test', {
    method: 'POST',
    headers: {
      'content-type': type,
      ...headers,
    },
    body,
  });
}

async function rejects(body, status, type, headers) {
  await assert.rejects(
    parse(request(body, type, headers)),
    error => error?.status === status
  );
}

test('accepts valid post text', async () => {
  const result = await parse(
    request(JSON.stringify({ content: 'Hello CreatorVerse' }))
  );

  assert.equal(result.content, 'Hello CreatorVerse');
});

test('trims surrounding whitespace', async () => {
  const result = await parse(
    request(JSON.stringify({ content: '  Hello  ' }))
  );

  assert.equal(result.content, 'Hello');
});

test('rejects protected and unexpected fields', async () => {
  for (const field of [
    'author_id',
    'page_id',
    'status',
    'media_ids',
    'comments_enabled',
  ]) {
    await rejects(
      JSON.stringify({
        content: 'Valid text',
        [field]: 'unauthorized',
      }),
      400
    );
  }
});

test('rejects malformed JSON', async () => {
  await rejects('{"content":', 400);
});

test('rejects unsupported content types', async () => {
  await rejects(
    JSON.stringify({ content: 'Hello' }),
    415,
    'text/plain'
  );
});

test('rejects empty and oversized text', async () => {
  await rejects(JSON.stringify({ content: '   ' }), 400);

  await rejects(
    JSON.stringify({ content: 'x'.repeat(5001) }),
    400
  );
});

test('rejects an oversized declared body', async () => {
  await rejects(
    JSON.stringify({ content: 'Hello' }),
    413,
    'application/json',
    { 'content-length': '16385' }
  );
});

test('rejects an oversized streamed body', async () => {
  await rejects(
    JSON.stringify({ content: 'x'.repeat(17000) }),
    413
  );
});

test('rejects arrays and null values', async () => {
  await rejects('[]', 400);
  await rejects('null', 400);
});

test('rejects invalid control characters', async () => {
  await rejects(
    JSON.stringify({ content: 'Hello\u0000World' }),
    400
  );
});

test('rejects missing request bodies', async () => {
  const empty = new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });

  await assert.rejects(
    parse(empty),
    error => error?.status === 400
  );
});

test('rejects incorrect HTTP methods', async () => {
  const get = new Request('http://localhost/test');

  await assert.rejects(
    parse(get),
    error => error?.status === 405
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(
  'lib/creatorverse/post-action-handlers.ts',
  'utf8'
);

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function setup() {
  const calls = [];

  class TestError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }

  const dependencies = {
    'server-only': {},
    './permissions': { CreatorVerseError: TestError },
    './validation': {
      pageId: value => {
        if (value !== 'valid-id') {
          throw new TestError(400, 'Invalid identifier');
        }
        return value;
      },
    },
    './post-request': {
      parseCreatorVersePostRequest: async request => {
        if (request.headers.get('x-invalid')) {
          throw new TestError(400, 'Invalid post data');
        }
        return { content: 'Validated post text' };
      },
    },
    './post-write': {
      createCreatorVersePostDraft: async (_request, id, content) => {
        calls.push({ action: 'draft', id, content });
        return { id: 'draft-id' };
      },
      publishCreatorVersePost: async (_request, page, post) => {
        calls.push({ action: 'publish', page, post });
        return { id: post };
      },
    },
    './server': {
      creatorVerseHeaders: {
        'Cache-Control': 'private, no-store',
      },
      creatorVerseErrorResponse: error =>
        Response.json(
          { error: error.message },
          { status: error.status ?? 503 }
        ),
    },
  };

  const loadedModule = { exports: {} };

  new Function('require', 'module', 'exports', compiled)(
    name => {
      if (!(name in dependencies)) {
        throw new Error(`Unexpected dependency: ${name}`);
      }
      return dependencies[name];
    },
    loadedModule,
    loadedModule.exports
  );

  return { handlers: loadedModule.exports, calls };
}

function request(method = 'POST', invalid = false) {
  return new Request('http://localhost/test', {
    method,
    headers: invalid ? { 'x-invalid': '1' } : {},
  });
}

test('draft handler forwards validated text', async () => {
  const { handlers, calls } = setup();

  const response = await handlers.handleCreatorVersePostDraft(
    request(),
    'valid-id'
  );

  assert.equal(response.status, 201);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    action: 'draft',
    id: 'valid-id',
    content: 'Validated post text',
  });
});

test('draft handler rejects incorrect methods', async () => {
  const { handlers, calls } = setup();

  const response = await handlers.handleCreatorVersePostDraft(
    request('GET'),
    'valid-id'
  );

  assert.equal(response.status, 405);
  assert.equal(calls.length, 0);
});

test('draft handler rejects invalid page IDs', async () => {
  const { handlers, calls } = setup();

  const response = await handlers.handleCreatorVersePostDraft(
    request(),
    'bad-id'
  );

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('invalid input never reaches post creation', async () => {
  const { handlers, calls } = setup();

  const response = await handlers.handleCreatorVersePostDraft(
    request('POST', true),
    'valid-id'
  );

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('publish handler forwards both identifiers', async () => {
  const { handlers, calls } = setup();

  const response = await handlers.handleCreatorVersePostPublish(
    request(),
    'valid-id',
    'valid-id'
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, 'publish');
});

test('publish handler rejects incorrect methods', async () => {
  const { handlers, calls } = setup();

  const response = await handlers.handleCreatorVersePostPublish(
    request('GET'),
    'valid-id',
    'valid-id'
  );

  assert.equal(response.status, 405);
  assert.equal(calls.length, 0);
});

test('publish handler rejects invalid post IDs', async () => {
  const { handlers, calls } = setup();

  const response = await handlers.handleCreatorVersePostPublish(
    request(),
    'valid-id',
    'bad-id'
  );

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

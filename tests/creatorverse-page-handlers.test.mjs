import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(
  'lib/creatorverse/page-action-handlers.ts',
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
    './page-request': {
      parseCreatorVersePageRequest: async request => {
        if (request.headers.get('x-invalid')) {
          throw new TestError(400, 'Invalid page information');
        }
        return { name: 'Test CreatorVerse Page' };
      },
    },
    './page-write': {
      createCreatorVersePage: async (_request, fields) => {
        calls.push({ action: 'create', fields });
        return { id: 'new-page' };
      },
      updateCreatorVersePage: async (_request, id, fields) => {
        calls.push({ action: 'update', id, fields });
        return { id };
      },
    },
    './server': {
      creatorVerseHeaders: {
        'Cache-Control': 'private, no-store',
      },
      creatorVerseErrorResponse: error =>
        Response.json(
          { error: error.message },
          { status: error.status ?? 400 }
        ),
    },
    './validation': {
      pageId: id => {
        if (id !== 'valid-id') {
          throw new TestError(400, 'Invalid page identifier');
        }
        return id;
      },
    },
    './permissions': {
      CreatorVerseError: TestError,
    },
  };

  const loadedModule = { exports: {} };

  const execute = new Function(
    'require',
    'module',
    'exports',
    compiled
  );

  execute(
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

function request(method, invalid = false) {
  return new Request('http://localhost/test', {
    method,
    headers: invalid ? { 'x-invalid': '1' } : {},
  });
}

test('creation accepts POST and returns 201', async () => {
  const { handlers, calls } = setup();
  const response = await handlers.handlePageCreate(request('POST'));

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    page: { id: 'new-page' },
  });
  assert.equal(calls[0].action, 'create');
});

test('creation rejects incorrect HTTP methods', async () => {
  const { handlers, calls } = setup();
  const response = await handlers.handlePageCreate(request('GET'));

  assert.equal(response.status, 405);
  assert.equal(calls.length, 0);
});

test('editing accepts PATCH and forwards page ID', async () => {
  const { handlers, calls } = setup();
  const response = await handlers.handlePageUpdate(
    request('PATCH'),
    'valid-id'
  );

  assert.equal(response.status, 200);
  assert.equal(calls[0].action, 'update');
  assert.equal(calls[0].id, 'valid-id');
});

test('editing rejects an invalid page ID', async () => {
  const { handlers, calls } = setup();
  const response = await handlers.handlePageUpdate(
    request('PATCH'),
    'invalid-id'
  );

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('invalid input never reaches the write function', async () => {
  const { handlers, calls } = setup();
  const response = await handlers.handlePageCreate(
    request('POST', true)
  );

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('editing rejects incorrect HTTP methods', async () => {
  const { handlers, calls } = setup();
  const response = await handlers.handlePageUpdate(
    request('POST'),
    'valid-id'
  );

  assert.equal(response.status, 405);
  assert.equal(calls.length, 0);
});

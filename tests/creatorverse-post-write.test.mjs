import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(
  'lib/creatorverse/post-write.ts',
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
    './server': {
      requireCreatorVerseOwner: async () => {
        calls.push('authorization');
        throw new Error('Authorization must not be reached');
      },
    },
    './permissions': {
      CreatorVerseError: TestError,
    },
    './validation': {
      pageId: value => {
        calls.push('identifier-validation');
        return value;
      },
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

  return { actions: loadedModule.exports, calls };
}

const id = '00000000-0000-4000-8000-000000000001';
const request = () => new Request('http://localhost/test');

test('creating a post draft is hard-locked', async () => {
  const { actions, calls } = setup();

  await assert.rejects(
    actions.createCreatorVersePostDraft(
      request(),
      id,
      'Test post'
    ),
    error => error?.status === 503
  );

  assert.deepEqual(calls, []);
});

test('publishing a post is hard-locked', async () => {
  const { actions, calls } = setup();

  await assert.rejects(
    actions.publishCreatorVersePost(
      request(),
      id,
      id
    ),
    error => error?.status === 503
  );

  assert.deepEqual(calls, []);
});

test('draft ownership and server-controlled status are required', () => {
  assert.match(source, /requireCreatorVerseOwner/);
  assert.match(source, /author_id: userId/);
  assert.match(source, /status: 'draft'/);
});

test('publication requires owner publishing permission', () => {
  assert.match(
    source,
    /requireCreatorVerseOwner\(\s*request,\s*validatedPageId,\s*true/
  );

  assert.match(source, /creatorverse_publish_post/);
  assert.match(source, /p_page_id: validatedPageId/);
  assert.match(source, /p_post_id: validatedPostId/);
  assert.doesNotMatch(source, /\.update\(\{\s*status: 'published'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(
  'lib/creatorverse/page-write.ts',
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

  const forbidden = action => async () => {
    calls.push(action);
    throw new Error(`Unexpected operation: ${action}`);
  };

  const dependencies = {
    'server-only': {},
    './server': {
      creatorVerseClient: forbidden('authenticate'),
      requireCreatorVerseOwner: forbidden('authorize-owner'),
    },
    './permissions': {
      CreatorVerseError: TestError,
    },
    './validation': {
      pageId: id => {
        calls.push('validate-page-id');
        return id;
      },
      validatePageFields: input => {
        calls.push('validate-fields');
        return input;
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

test('real creation function rejects writes', async () => {
  const { actions, calls } = setup();

  await assert.rejects(
    actions.createCreatorVersePage(
      new Request('http://localhost/test'),
      { name: 'Test Page' }
    ),
    error => error?.status === 503
  );

  assert.deepEqual(calls, []);
});

test('real editing function rejects writes', async () => {
  const { actions, calls } = setup();

  await assert.rejects(
    actions.updateCreatorVersePage(
      new Request('http://localhost/test'),
      '00000000-0000-4000-8000-000000000001',
      { name: 'Test Page' }
    ),
    error => error?.status === 503
  );

  assert.deepEqual(calls, []);
});

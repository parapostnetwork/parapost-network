import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const read = path => readFileSync(path, 'utf8');

function load(path, deps = {}) {
  const exports = {};
  const js = ts.transpileModule(read(path), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;

  vm.runInNewContext(js, {
    exports,
    require(name) {
      assert.ok(Object.hasOwn(deps, name), name);
      return deps[name];
    },
    URL,
    URLSearchParams
  });
  return exports;
}

const types = load('lib/creatorverse/types.ts');
const validation = load('lib/creatorverse/validation.ts', {
  './types': types
});
const discovery = load('lib/creatorverse/discovery.ts', {
  './types': types,
  './validation': validation
});

const idA = 'a0000000-0000-4000-8000-000000000001';
const idB = 'b0000000-0000-4000-8000-000000000002';
const otherCategory = Object.keys(
  types.CREATORVERSE_CATEGORIES
).find(key => key !== 'investigation_team');

const rows = [
  {
    page: {
      id: idA,
      name: 'Night Watch',
      category: 'investigation_team',
      short_bio: '',
      description: 'Paranormal hunts'
    },
    creator: {
      name: 'Evelyn',
      profileId: idB,
      canViewProfile: false
    }
  },
  {
    page: {
      id: idA.toUpperCase(),
      name: 'Duplicate',
      category: 'investigation_team',
      description: ''
    },
    creator: null
  },
  {
    page: {
      id: idB,
      name: 'Daylight Studio',
      category: otherCategory,
      short_bio: '',
      description: 'Creative work'
    },
    creator: null
  }
];

test('Discovery removes duplicate page IDs', () => {
  const result = discovery.uniqueDiscoveryPages(rows);
  assert.equal(result.length, 2);
  assert.equal(result[0].page.name, 'Night Watch');
});

test('Search matches descriptions and creator names', () => {
  const filter = { search: 'NIGHT hunts', category: '' };
  const result = discovery.filterDiscoveryPages(rows, filter);
  assert.equal(result.length, 1);
  assert.equal(result[0].page.id, idA);

  const creatorResult = discovery.filterDiscoveryPages(
    rows, { search: 'evelyn', category: '' }
  );
  assert.equal(creatorResult.length, 1);
});

test('Category filtering excludes unrelated pages', () => {
  const result = discovery.filterDiscoveryPages(rows, {
    search: '',
    category: 'investigation_team'
  });
  assert.equal(result.length, 1);

  const missing = discovery.filterDiscoveryPages(rows, {
    search: 'Daylight',
    category: 'investigation_team'
  });
  assert.equal(missing.length, 0);
});

test('URLs validate page IDs and query parameters', () => {
  assert.equal(
    discovery.creatorVersePageHref(idA),
    `/creatorverse/${idA}`
  );
  assert.equal(
    discovery.samplePageHref(idA),
    `/groups-local-preview/creatorverse/${idA}`
  );
  assert.throws(() => discovery.creatorVersePageHref('invalid'));

  const query = discovery.discoveryQuery({
    search: ' Night ',
    category: 'investigation_team'
  }, 20);

  const params = new URLSearchParams(query);
  assert.equal(params.get('search'), 'Night');
  assert.equal(params.get('offset'), '20');

  for (const value of [
    'offset=-1',
    'offset=100000',
    'category=__proto__',
    `search=${'x'.repeat(101)}`
  ]) {
    assert.throws(() =>
      discovery.parseDiscoveryFilter(new URLSearchParams(value))
    );
  }
});

test('Creator profile links require public authorization', () => {
  assert.equal(
    discovery.creatorProfileHref(rows[0].creator),
    null
  );
  assert.equal(
    discovery.creatorProfileHref({
      ...rows[0].creator,
      canViewProfile: true
    }),
    `/profile/${idB}`
  );
});

test('Groups navigation retains its development boundary', () => {
  const groups = read('app/groups/GroupsDirectory.tsx');
  const preview = read('app/groups-local-preview/page.tsx');
  const landing = read('app/groups/CreatorVerseLandingPreview.tsx');

  assert.match(
    groups,
    /process\.env\.NODE_ENV === 'development' && creatorVersePreview/
  );
  assert.match(
    groups,
    /allowCreatorVerse \? 'creatorverse' : 'private'/
  );
  assert.match(
    preview,
    /process\.env\.NODE_ENV !== 'development'\) notFound/
  );
  assert.match(
    landing,
    /filterDiscoveryPages\(CREATORVERSE_SAMPLES, filter\)/
  );
  assert.match(landing, /href=\{LOCAL_DRAFT\}/);
});

test('Hosted directory retains the feature gate', () => {
  const hosted = read('app/creatorverse/page.tsx');
  const api = read('app/api/creatorverse/route.ts');

  assert.match(hosted, /creatorVerseEnabled\(\)/);
  assert.match(api, /export async function GET/);
  assert.doesNotMatch(
    api,
    /export (?:async )?function (?:POST|PUT|PATCH|DELETE)/
  );
});

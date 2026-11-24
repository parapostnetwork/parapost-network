import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

const owner = 'owner-a';
const id = '10000000-0000-4000-8000-000000000001';
const fields = { name: 'Recovery Page', category: 'business', short_bio: '', description: '', website: null, public_email: null, location: '', social_links: [] };
const noImages = { logo: null, cover: null };
function load(path, dependencies, globals) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; }, TextEncoder, crypto: webcrypto, ...globals });
  return exports;
}
function setup(failure) {
  const storage = new Map(); let actor = owner, page, creates = 0, failed = false, writes = 0;
  const uploads = [], calls = [];
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem(key, value) { if (failure === 'storage') throw Error('quota'); storage.set(key, value); }, removeItem: key => storage.delete(key) };
  const recovery = load('lib/creatorverse/draft-recovery.ts', { '@/lib/community/release-target': { communityStorageNamespace: () => 'staging-test' } }, { localStorage });
  const session = () => ({ data: { session: { user: { id: actor }, access_token: actor } } });
  const api = async (path, options) => {
    calls.push([path, options.method]);
    if (options.method !== 'GET') writes++;
    if (path.includes('/recovery')) return { ok: true, json: async () => ({ pages: page ? [page] : [] }) };
    if (path.endsWith('/draft')) {
      creates++;
      if (failure === 'before-create') throw Error('offline');
      page = { id, status: 'draft', fields: { ...fields }, images: { logo: false, cover: false }, pending: [] };
      if (failure === 'create' && !failed) { failed = true; throw Error('response lost'); }
    }
    if (path.endsWith('/details') && failure === 'details' && !failed) { failed = true; throw Error('offline'); }
    if (path.endsWith('/activate')) {
      page.status = 'active';
      if (failure === 'activation' && !failed) { failed = true; throw Error('response lost'); }
    }
    if (failure === 'switch' && path.endsWith('/draft')) actor = 'owner-b';
    return { ok: true, json: async () => ({ page: { id, status: page.status } }) };
  };
  const workflow = load('lib/creatorverse/create-page-draft.ts', {
    '@/lib/supabase': { supabase: { auth: { getSession: async () => session() } } },
    './draft-recovery': recovery,
    './page-image-client': { pageImageUploadsApproved: () => true, uploadCreatorVersePageImage: async (_, purpose) => {
      uploads.push(purpose);
      if (purpose === 'cover' && failure === 'cover' && !failed) { failed = true; throw Error('interrupted'); }
      page.images[purpose] = true;
    } },
  }, { localStorage, fetch: api, navigator: { locks: { request: async (_, __, callback) => callback({}) } } });
  return { ...workflow, recovery, storage, uploads, calls, counts: () => ({ creates, writes }), setActor: value => { actor = value; } };
}
for (const failure of ['create', 'details', 'activation']) {
  test(`resumes after ${failure} failure without a second creation`, async () => {
    const h = setup(failure);
    await assert.rejects(h.createCreatorVersePageDraft(fields, noImages, owner));
    assert(h.recovery.readRecovery(owner));
    assert.equal(await h.createCreatorVersePageDraft(fields, noImages, owner), id);
    assert.equal(h.counts().creates, 1);
    assert.equal(h.recovery.readRecovery(owner), null);
    assert.equal(await h.createCreatorVersePageDraft(fields, noImages, owner), id);
    assert.equal(h.counts().creates, 1);
  });
}
test('uncertain creation with no visible result never resends creation', async () => {
  const h = setup('before-create');
  await assert.rejects(h.createCreatorVersePageDraft(fields, noImages, owner));
  await assert.rejects(h.createCreatorVersePageDraft(fields, noImages, owner), /uncertain result/);
  assert.equal(h.counts().creates, 1);
});
test('keeps successful logo and requires reselection of unfinished cover', async () => {
  const h = setup('cover'), images = { logo: { name: 'logo.png' }, cover: { name: 'cover.png' } };
  await assert.rejects(h.createCreatorVersePageDraft(fields, images, owner));
  await assert.rejects(h.createCreatorVersePageDraft(fields, noImages, owner), /Reselect.*cover/);
  assert.equal(await h.createCreatorVersePageDraft(fields, { logo: null, cover: images.cover }, owner), id);
  assert.deepEqual(h.uploads, ['logo', 'cover', 'cover']);
  assert.equal(h.counts().creates, 1);
});
test('account mismatch cannot read another account recovery or start a request', async () => {
  const h = setup();
  h.recovery.saveRecovery(owner, { version: 1, owner, fields, linkLabel: 'unfinished', linkUrl: 'https:', images: {} });
  h.setActor('owner-b');
  assert.equal(h.recovery.readRecovery('owner-b'), null);
  await assert.rejects(h.createCreatorVersePageDraft(fields, noImages, owner));
  assert.equal(h.calls.length, 0);
  assert.equal(h.recovery.readRecovery(owner).linkLabel, 'unfinished');
});
test('account switch during creation retains uncertainty and stops subsequent writes', async () => {
  const h = setup('switch');
  await assert.rejects(h.createCreatorVersePageDraft(fields, noImages, owner), /account changed/);
  assert.equal(h.counts().writes, 1);
  assert(h.recovery.readRecovery(owner).creation);
});
test('unavailable browser storage prevents all backend requests', async () => {
  const h = setup('storage');
  await assert.rejects(h.createCreatorVersePageDraft(fields, noImages, owner), /quota/);
  assert.equal(h.calls.length, 0);
});

test('recovery endpoint filters verified owner and requires the existing edit permission', async () => {
  for (const allow of [false, true]) {
    const calls = [];
    class Failure extends Error { constructor(status, message) { super(message); this.status = status; } }
    const admin = { from(table) {
      const query = { select(value) { calls.push([table, 'select', value]); return query; }, eq(key, value) { calls.push([table, key, value]); return query; }, is() { return query; }, in() { return query; }, order() { return query; }, limit() { return query; }, then(resolve) { return Promise.resolve({ data: table === 'creatorverse_pages' ? [{ id, status: 'draft', ...fields }] : [], error: null }).then(resolve); } }; return query;
    } };
    const route = load('app/api/creatorverse/pages/recovery/route.ts', {
      '@/lib/community/release-target': { communityServerTargetAllowed: () => true },
      '@supabase/supabase-js': { createClient: () => admin },
      '@/lib/creatorverse/server': { creatorVerseClient: async () => ({ userId: owner, client: { rpc: async name => { assert.equal(name, 'creatorverse_details_can_edit'); return { data: allow }; } } }), creatorVerseHeaders: {}, creatorVerseErrorResponse: e => Response.json({ error: e.message }, { status: e.status ?? 500 }) },
      '@/lib/creatorverse/permissions': { CreatorVerseError: Failure },
      '@/lib/creatorverse/validation': { pageId: value => value },
    }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://vmgelrgrtpghmvqgufzz.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'mock' } }, URL, Response });
    const result = await route.GET(new Request(`http://localhost/recovery?id=${id}&owner_id=attacker`));
    assert.equal(result.status, allow ? 200 : 403);
    assert(calls.some(item => item[1] === 'owner_id' && item[2] === owner));
    if (!allow) assert(!calls.some(item => item[0] === 'creatorverse_media'));
  }
});

for (const purposes of [[], ['logo'], ['cover'], ['logo', 'cover']]) {
  test(`creates exactly one active page with ${purposes.join('+') || 'no images'}`, async () => {
    const h = setup();
    const images = { ...noImages };
    for (const purpose of purposes) images[purpose] = { name: `${purpose}.jpg` };
    assert.equal(await h.createCreatorVersePageDraft(fields, images, owner), id);
    assert.equal(h.counts().creates, 1);
    assert.deepEqual(h.uploads, purposes);
    assert.equal(h.recovery.readRecovery(owner), null);
  });
}
test('selecting a recovered page preserves unfinished image intent after a lost create response', async () => {
  const h = setup('create');
  await assert.rejects(h.createCreatorVersePageDraft(fields, { logo: null, cover: { name: 'IMG_3021.jpeg' } }, owner));
  const page = { id, status: 'draft', fields, pending: [], images: { logo: false, cover: false } };
  const recovered = h.recovery.recoveryForPage(owner, page, h.recovery.readRecovery(owner));
  h.recovery.saveRecovery(owner, recovered);
  await assert.rejects(h.createCreatorVersePageDraft(fields, noImages, owner), /Reselect.*IMG_3021/);
  assert.equal(await h.createCreatorVersePageDraft(fields, { logo: null, cover: { name: 'IMG_3021.jpeg' } }, owner), id);
  assert.equal(h.counts().creates, 1);
});
test('server pending reservations require reselection even without local information', () => {
  const h = setup();
  const page = { id, status: 'draft', fields, pending: [{ id: 'pending', purpose: 'cover' }], images: { logo: true, cover: false } };
  assert.equal(h.recovery.recoveryForPage(owner, page, null).images.cover, 'previously selected image');
});

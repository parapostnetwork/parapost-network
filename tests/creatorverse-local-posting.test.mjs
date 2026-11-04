import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, globals = {}, dependencies = {}) {
  const exports = {};
  const source = readFileSync(path, 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Blob, Request, Response, require(name) { assert.ok(name in dependencies, `Unexpected import ${name}`); return dependencies[name]; }, ...globals });
  return exports;
}
const posts = load('app/creatorverse/creatorVerseLocalPosts.ts');
const storage = () => {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
test('preview write permission defaults to denial and cannot authorize outside development', () => {
  for (const environment of ['development', 'test', 'production', undefined]) {
    for (const role of ['visitor', undefined, true, 'admin', 'owner']) {
      assert.equal(posts.localPreviewCanManage(role, environment), role === 'owner' && environment === 'development');
    }
  }
});
test('existing Huntaphobia records and their exact storage/media keys survive without migration or truncation', () => {
  const store = storage(); const key = posts.localPostKey('Huntaphobia');
  assert.equal(key, 'parapost.creatorverse.localPost.v1:Huntaphobia');
  const old = Array.from({ length: 24 }, (_, i) => ({ id: `local-${i}`, content: `Preserved ${i}` }));
  store.setItem(key, JSON.stringify({ content: 'Unfinished draft', posts: old }));
  const result = posts.readLocalPosts(store, key, 'Huntaphobia');
  assert.equal(result.posts.length, 24);
  assert.equal(result.content, 'Unfinished draft');
  posts.writeLocalPosts(store, key, result.content, result.posts);
  assert.deepEqual(JSON.parse(store.getItem(key)).posts, old);
});
test('text, media-only metadata, timestamps, edits and deletions persist after reloading the store', () => {
  const store = storage(); const key = posts.localPostKey('Test');
  const records = [{ id: 'image', content: '', attachmentCount: 2, createdAt: '2026-11-01T10:00:00Z' }, { id: 'text', content: 'Before' }];
  posts.writeLocalPosts(store, key, '', records);
  let restored = posts.readLocalPosts(store, key, 'Test').posts;
  assert.equal(restored[0].attachmentCount, 2); assert.equal(restored[0].createdAt, records[0].createdAt);
  restored[1].content = 'Edited'; posts.writeLocalPosts(store, key, '', restored);
  assert.equal(posts.readLocalPosts(store, key, 'Test').posts[1].content, 'Edited');
  posts.writeLocalPosts(store, key, '', restored.filter(post => post.id !== 'image'));
  assert.equal(posts.readLocalPosts(store, key, 'Test').posts.length, 1);
});
test('legacy preview text is retained and no timestamp is invented', () => {
  const store = storage(); store.setItem('key', JSON.stringify({ content: 'Legacy', showPreview: true }));
  const result = posts.readLocalPosts(store, 'key', 'Huntaphobia');
  assert.equal(result.posts[0].id, 'legacy-Huntaphobia'); assert.equal(result.posts[0].createdAt, undefined);
});
test('corrupt storage and quota failures surface instead of replacing saved data', () => {
  const store = storage(); store.setItem('key', '{corrupt');
  assert.throws(() => posts.readLocalPosts(store, 'key', 'Test'));
  assert.equal(store.getItem('key'), '{corrupt');
  assert.throws(() => posts.writeLocalPosts({ setItem() { throw new Error('QuotaExceededError'); } }, 'key', '', []), /QuotaExceededError/);
});
test('all existing image/video restrictions remain enforced, including empty/oversize files', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']) {
    const kind = type.startsWith('image') ? 'image' : 'video';
    assert.equal(posts.validateLocalAttachment({ type, size: 128 }), kind);
    assert.throws(() => posts.validateLocalAttachment({ type, size: 0 }));
    assert.throws(() => posts.validateLocalAttachment({ type, size: (kind === 'image' ? 8 : 32) * 1024 * 1024 + 1 }));
  }
  for (const type of ['image/svg+xml', 'text/html', 'application/pdf', '']) assert.throws(() => posts.validateLocalAttachment({ type, size: 128 }));
  assert.equal(posts.MAX_LOCAL_ATTACHMENTS, 4);
});

// Deterministic transaction model: tests failure/commit semantics. Actual Safari IndexedDB
// round trips and refresh are reviewed separately; this is not an IndexedDB conformance test.
function idbHarness() {
  const records = new Map(); let fault = null; let closed = 0;
  const database = {
    objectStoreNames: { contains: () => true }, close() { closed++; },
    transaction() {
      const tx = { error: null, abort() { fault = 'abort'; }, objectStore() { return {
        put(value, key) { schedule(() => records.set(key, structuredClone(value))); },
        delete(key) { schedule(() => records.delete(key)); },
        get(key) { const request = {}; schedule(() => { request.result = records.get(key); request.onsuccess?.(); }); return request; },
      }; } };
      function schedule(operation) { queueMicrotask(() => {
        if (fault === 'error') { fault = null; tx.error = new Error('Storage failure'); tx.onerror?.(); return; }
        if (fault === 'abort') { fault = null; tx.onabort?.(); return; }
        operation();
        if (fault === 'abort') { fault = null; tx.onabort?.(); } else tx.oncomplete?.();
      }); }
      return tx;
    },
  };
  const indexedDB = { open() { const request = {}; queueMicrotask(() => { request.result = database; request.onsuccess?.(); }); return request; } };
  return { indexedDB, records, fail(next) { fault = next; }, get closed() { return closed; } };
}
test('IndexedDB round trip keeps binary images/video and delete removes only the target key', async () => {
  const db = idbHarness(); const media = load('app/creatorverse/creatorVerseLocalMedia.ts', { indexedDB: db.indexedDB });
  const files = [{ name: 'image.png', kind: 'image', blob: new Blob(['image bytes'], { type: 'image/png' }) },
    { name: 'video.mp4', kind: 'video', blob: new Blob(['video bytes'], { type: 'video/mp4' }) }];
  await media.saveLocalMedia('old', files); await media.saveLocalMedia('new', files);
  const restored = await media.loadLocalMedia('new');
  assert.equal(restored.length, 2); assert.equal(await restored[0].blob.text(), 'image bytes');
  assert.equal(await restored[1].blob.text(), 'video bytes');
  await media.deleteLocalMedia('new'); assert.equal((await media.loadLocalMedia('new')).length, 0);
  assert.equal((await media.loadLocalMedia('old')).length, 2); assert.equal(db.closed, 6);
});
test('aborted or corrupt media reads reject rather than hanging or silently losing attachments', async () => {
  const db = idbHarness(); const media = load('app/creatorverse/creatorVerseLocalMedia.ts', { indexedDB: db.indexedDB });
  for (const fault of ['abort', 'error']) { db.fail(fault); await assert.rejects(media.loadLocalMedia('key')); }
  db.records.set('key', [{ name: 'broken.png', kind: 'image', blob: 'not a Blob' }]);
  await assert.rejects(media.loadLocalMedia('key'));
  assert.equal(db.records.has('key'), true);
});
test('failed media saves/deletes reject and preserve existing records', async () => {
  const db = idbHarness(); const media = load('app/creatorverse/creatorVerseLocalMedia.ts', { indexedDB: db.indexedDB });
  db.records.set('existing', []);
  db.fail('error'); await assert.rejects(media.saveLocalMedia('new', [])); assert.equal(db.records.has('new'), false);
  db.fail('abort'); await assert.rejects(media.deleteLocalMedia('existing')); assert.equal(db.records.has('existing'), true);
});


test('server management authorization denies visitors and forged owner flags using verified identity and database permission', async () => {
  const permissions = load('lib/creatorverse/permissions.ts');
  const pageId = '10000000-0000-4000-8000-000000000001';
  for (const canManage of [false, 'true', 1, undefined, true]) {
    const calls = [];
    const server = load('lib/creatorverse/server.ts', { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://vmgelrgrtpghmvqgufzz.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key' } } }, {
      'server-only': {}, './config': { creatorVerseEnabled: () => true }, './permissions': permissions,
      './validation': { pageId: value => value },
      '@supabase/supabase-js': { createClient: () => ({
        auth: { getUser: async token => { calls.push(['verified', token]); return { data: { user: { id: 'server-verified-user' } }, error: null }; } },
        rpc: async (name, params) => { calls.push([name, params]); return { data: { can_manage: canManage, can_publish: false }, error: null }; },
      }) },
    });
    const request = new Request('http://localhost/api/creatorverse', {
      method: 'POST', headers: { Authorization: 'Bearer test-token' }, body: JSON.stringify({ canCompose: true, owner_id: 'attacker', role: 'owner' }),
    });
    if (canManage === true) assert.equal((await server.requireCreatorVerseOwner(request, pageId)).userId, 'server-verified-user');
    else await assert.rejects(server.requireCreatorVerseOwner(request, pageId), error => error.status === 403);
    assert.equal(calls[0][0], 'verified');
    assert.equal(calls[1][0], 'creatorverse_page_access');
    assert.deepEqual(JSON.parse(JSON.stringify(calls[1][1])), { p_page_id: pageId });
    await assert.rejects(server.requireCreatorVerseOwner(new Request('http://localhost/api/creatorverse'), pageId), error => error.status === 401);
  }
});

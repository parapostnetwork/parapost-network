import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name]; } });
  return exports;
}
const permissions = load('lib/creatorverse/permissions.ts');
const types = load('lib/creatorverse/types.ts');
const validation = load('lib/creatorverse/validation.ts', { './types': types });
const contract = load('lib/creatorverse/integration-contract.ts', { './permissions': permissions, './validation': validation });
const presentation = load('lib/creatorverse/integration-presentation.ts', { './validation': validation });
const page = '40000000-0000-4000-8000-000000000004';
const post = '50000000-0000-4000-8000-000000000005';
const target = '60000000-0000-4000-8000-000000000006';
const operations = [
  { action: 'create_post', content: '' }, { action: 'edit_post', postId: post, content: 'Updated' },
  { action: 'delete_post', postId: post }, { action: 'reserve_media', postId: post, mimeType: 'image/png', byteSize: 123, order: 0 },
  { action: 'delete_media', postId: post, targetId: target }, { action: 'like', postId: post }, { action: 'unlike', postId: post },
  { action: 'comment', postId: post, content: 'Root', parentId: null }, { action: 'comment', postId: post, content: 'Reply', parentId: target },
  { action: 'delete_comment', postId: post, targetId: target }, { action: 'share', postId: post, caption: 'Caption', requestId: target },
];
for (const operation of operations) {
  test(`strict ${operation.action} contract validates input and rejects identity/privilege injection`, () => {
    const result = contract.parseCreatorVerseOperation(operation);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), operation);
    for (const key of ['owner_id', 'author_id', 'user_id', 'sharer_id', 'role', 'previewRole', 'can_manage', 'verification', 'storage_path', 'status']) {
      assert.throws(() => contract.parseCreatorVerseOperation({ ...operation, [key]: 'attacker' }), error => error.status === 400);
    }
  });
}
test('media contract accepts supported binary types and enforces byte/order limits', () => {
  for (const mimeType of ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']) {
    const max = mimeType.startsWith('image/') ? 8388608 : 33554432;
    const sample = { action: 'reserve_media', postId: post, mimeType, byteSize: max, order: 3 };
    assert.equal(contract.parseCreatorVerseOperation(sample).mimeType, mimeType);
    for (const delta of [{ byteSize: 0 }, { byteSize: max + 1 }, { byteSize: 1.5 }, { order: -1 }, { order: 4 }, { mimeType: 'image/svg+xml' }]) {
      assert.throws(() => contract.parseCreatorVerseOperation({ ...sample, ...delta }));
    }
  }
});
test('malformed content, identifiers, arrays and prototype action names fail closed', () => {
  for (const input of [null, [], { action: '__proto__' }, { action: 'toString' }, { action: 'create_post', content: 'x'.repeat(5001) },
    { action: 'comment', postId: post, parentId: null, content: ' ' }, { action: 'like', postId: '../other' },
    { action: 'create_post', content: '\u0001' }]) assert.throws(() => contract.parseCreatorVerseOperation(input));
});
function setup(userId, access, rpcError = null) {
  const calls = [];
  const loadedModule = load('lib/creatorverse/integration-server.ts', { 'server-only': {}, './permissions': permissions,
    './integration-contract': contract, './server': { creatorVerseClient: async request => {
      calls.push(['auth', request]); return { userId, client: { rpc: async (name, args) => { calls.push(['rpc', name, args]); return { data: access, error: rpcError }; } } };
    } } });
  return { ...loadedModule, calls };
}
test('authenticated preflight retains verified actor and submits only page-scoped capability arguments', async () => {
  for (const operation of operations) {
    const h = setup('verified-actor', true);
    const result = await h.prepareCreatorVerseOperation({}, page, operation);
    assert.equal(result.actorId, 'verified-actor'); assert.equal(result.executionEnabled, false);
    assert.equal(h.calls.length, 2); assert.equal(h.calls[1][1], 'creatorverse_operation_access');
    assert.equal(h.calls[1][2].p_page_id, page);
    assert.equal('owner_id' in h.calls[1][2], false); assert.equal('content' in h.calls[1][2], false);
  }
});
test('anonymous, malformed, unavailable and denied preflight cannot return an executable grant', async () => {
  const noUser = setup(null, true);
  await assert.rejects(noUser.prepareCreatorVerseOperation({}, page, operations[0]), error => error.status === 401);
  assert.equal(noUser.calls.length, 1);
  for (const response of [false, 'true', 1, {}, null, undefined]) {
    const h = setup('visitor', response);
    await assert.rejects(h.prepareCreatorVerseOperation({}, page, operations[0]), error => error.status === 403);
  }
  const unavailable = setup('owner', true, new Error('missing RPC'));
  await assert.rejects(unavailable.prepareCreatorVerseOperation({}, page, operations[0]), error => error.status === 503);
  const bad = setup('owner', true);
  await assert.rejects(bad.prepareCreatorVerseOperation({}, page, { ...operations[0], role: 'owner' }));
  assert.equal(bad.calls.length, 0);
});
test('all writes/shares stay hardlocked even after a successful preflight and forged prepared results', async () => {
  const h = setup('verified-owner', true);
  const prepared = await h.prepareCreatorVerseOperation({}, page, operations[0]);
  const before = h.calls.length;
  for (const value of [prepared, { ...prepared, executionEnabled: true }, { role: 'owner' }, undefined]) {
    await assert.rejects(h.executeCreatorVerseOperation(value), error => error.status === 503);
  }
  assert.equal(h.calls.length, before);
});
test('share presentation preserves original identity and discards injected URLs and private metadata', () => {
  const row = { share_id: target, shared_at: '2026-11-02T10:00:00Z', sharer_id: target, caption: 'Caption',
    post_id: post, page_id: page, page_name: 'Huntaphobia', content: 'Original', source_path: 'javascript:attack()', owner_id: 'private', storage_path: 'secret' };
  const result = presentation.creatorVerseShareReference(row);
  assert.equal(result.kind, 'creatorverse'); assert.equal(result.original.pageName, 'Huntaphobia');
  assert.equal(result.original.href, `/creatorverse/${page}`); assert.equal(result.original.postId, post);
  assert.doesNotMatch(JSON.stringify(result), /javascript|secret|private/);
  assert.throws(() => presentation.creatorVerseShareReference({ ...row, page_id: 'https://attacker' }));
});

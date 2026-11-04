import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function load(path, dependencies = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected import ${name}`); return dependencies[name]; },
    URL, URLSearchParams, Response, Request, ...globals,
  });
  return exports;
}
const types = load('lib/creatorverse/types.ts');
const validation = load('lib/creatorverse/validation.ts', { './types': types });
const permissions = load('lib/creatorverse/permissions.ts');
const id = '10000000-0000-4000-8000-000000000001';
const owner = '20000000-0000-4000-8000-000000000002';
const fields = { name: 'Night Watch', category: 'investigation_team' };
const page = { ...validation.validatePageFields(fields), id, created_at: '2026-10-29T10:00:00Z', owner_id: owner, private_email: 'never-return@example.invalid' };
const environment = { CREATORVERSE_ENABLED: 'true', NEXT_PUBLIC_SUPABASE_URL: 'https://vmgelrgrtpghmvqgufzz.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-only-public-placeholder' };
const config = env => load('lib/creatorverse/config.ts', {}, { process: { env } });
function server({ env = environment, user = { id: owner }, authError = null, access = { can_manage: true, can_publish: true }, rpcError = null } = {}) {
  const calls = [];
  const client = { auth: { getUser: async token => { calls.push(['getUser', token]); return { data: { user }, error: authError }; } },
    rpc: async (name, params) => { calls.push(['rpc', name, params]); return { data: access, error: rpcError }; } };
  const module = load('lib/creatorverse/server.ts', {
    'server-only': {}, '@supabase/supabase-js': { createClient: (...args) => { calls.push(['client', ...args]); return client; } },
    './config': config(env), './permissions': permissions, './validation': validation,
  }, { process: { env } });
  return { ...module, calls, client };
}
const request = token => new Request('http://localhost/api/creatorverse', token === undefined ? {} : { headers: { Authorization: token } });
const reader = load('lib/creatorverse/read.ts', { 'server-only': {}, './permissions': permissions, './validation': validation });
function queryClient(results) {
  const calls = [];
  return { calls, from(table) {
    const result = results.shift(); assert.ok(result, 'Unexpected additional query'); calls.push(['from', table]);
    const query = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
    for (const method of ['select','eq','textSearch','order','range','limit','maybeSingle']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
    return query;
  } };
}

test('CreatorVerse gate denies production, lookalikes, credentials and unexpected URL parts', () => {
  const { isCreatorVerseTarget } = config({});
  for (const url of ['https://luzesphgdqazqhmqlniy.supabase.co', 'https://vmgelrgrtpghmvqgufzz.supabase.co.evil.test', 'https://user@vmgelrgrtpghmvqgufzz.supabase.co', 'https://vmgelrgrtpghmvqgufzz.supabase.co/path', 'https://vmgelrgrtpghmvqgufzz.supabase.co?x=y', 'http://vmgelrgrtpghmvqgufzz.supabase.co', 'bad']) assert.equal(isCreatorVerseTarget(url), false, url);
  for (const url of [environment.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321']) assert.equal(isCreatorVerseTarget(url), true);
  assert.equal(config({ ...environment, CREATORVERSE_ENABLED: undefined }).creatorVerseEnabled(), false);
  assert.equal(config(environment).creatorVerseEnabled(), true);
});
test('disabled or production target creates no backend client', async () => {
  for (const env of [{ ...environment, CREATORVERSE_ENABLED: 'false' }, { ...environment, NEXT_PUBLIC_SUPABASE_URL: 'https://luzesphgdqazqhmqlniy.supabase.co' }]) {
    const h = server({ env }); await assert.rejects(h.creatorVerseClient(request()), e => e.status === 404); assert.equal(h.calls.length, 0);
  }
});
test('anonymous reads use only public key and do not require login', async () => {
  const h = server(); const result = await h.creatorVerseClient(request()); assert.equal(result.userId, null);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0][2], environment.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0][3].global.headers)), {});
});
test('bad supplied credentials never fall back to anonymous public reads', async () => {
  const malformed = server(); await assert.rejects(malformed.creatorVerseClient(request('Basic not-a-token')), e => e.status === 401); assert.equal(malformed.calls.length, 0);
  const invalid = server({ authError: Error('Invalid token') }); await assert.rejects(invalid.creatorVerseClient(request('Bearer invalid')), e => e.status === 401);
  assert.equal(invalid.calls.some(call => call[0] === 'rpc'), false);
});
test('owner authorization derives identity from verified auth and calls a page-scoped RPC', async () => {
  const h = server(); const result = await h.requireCreatorVerseOwner(request('Bearer owner-token'), id, true);
  assert.equal(result.userId, owner); const rpc = h.calls.find(call => call[0] === 'rpc');
  assert.equal(rpc[1], 'creatorverse_page_access'); assert.equal(JSON.stringify(rpc[2]), JSON.stringify({ p_page_id: id }));
  assert.equal(h.calls[0][3].global.headers.Authorization, 'Bearer owner-token');
});
test('followers, unrelated users and suspended owners cannot publish; anonymous writes require auth', async () => {
  for (const access of [{ can_manage: false, can_publish: false }, { can_manage: true, can_publish: false }, { can_manage: 'true', can_publish: 1 }, { can_manage: false, can_publish: true }, null]) {
    const h = server({ access }); await assert.rejects(h.requireCreatorVerseOwner(request('Bearer visitor'), id, true), e => e.status === 403);
  }
  const h = server(); await assert.rejects(h.requireCreatorVerseOwner(request(), id), e => e.status === 401);
  assert.equal(h.calls.some(call => call[0] === 'rpc'), false);
});
test('authorization outages and malformed IDs fail closed', async () => {
  const h = server({ rpcError: Error('private SQL details') }); await assert.rejects(h.requireCreatorVerseOwner(request('Bearer owner'), id), e => e.status === 503);
  const bad = server(); await assert.rejects(bad.requireCreatorVerseOwner(request('Bearer owner'), 'attacker-id')); assert.equal(bad.calls.length, 0);
  const response = h.creatorVerseErrorResponse(Error('secret internal SQL')); assert.equal(response.status, 400); assert.doesNotMatch(await response.text(), /secret|SQL/);
});
test('pure owner policy has no follower or Group-role privilege escalation', () => {
  for (const status of ['draft','active','suspended','deleted']) {
    assert.equal(permissions.ownerMayPublish({ id, owner_id: owner, status }, { id: owner, eligible: true }), status === 'active');
    assert.equal(permissions.ownerMayPublish({ id, owner_id: owner, status }, { id: 'follower', eligible: true, role: 'group-owner' }), false);
  }
  assert.equal(permissions.ownerMayPublish({ id, owner_id: owner, status: 'active' }, { id: owner, eligible: false }), false);
});
test('page input has eight categories, optional public fields and no automatic account email', () => {
  assert.equal(Object.keys(types.CREATORVERSE_CATEGORIES).length, 8);
  const result = validation.validatePageFields({ ...fields, email: 'account@example.invalid', owner_id: 'attacker' });
  assert.equal(result.public_email, null); assert.equal('owner_id' in result, false);
  for (const input of [{ ...fields, category: '__proto__' }, { ...fields, name: 'x' }, { ...fields, description: 'x'.repeat(5001) }, { ...fields, social_links: Array(9).fill({ label: 'Site', url: 'https://example.org' }) }]) assert.throws(() => validation.validatePageFields(input));
});
test('unsafe URLs and invalid public contacts are rejected on both input and projection', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'https://user:pass@example.org', 'https://exa\nmple.org']) {
    assert.throws(() => validation.validatePageFields({ ...fields, website: url }));
    assert.throws(() => validation.validatePageFields({ ...fields, social_links: [{ label: 'Site', url }] }));
  }
  assert.throws(() => validation.validatePageFields({ ...fields, public_email: 'a\nb@example.org' }));
  assert.equal(validation.publicUrl('https://example.org'), 'https://example.org/');
});
test('directory is bounded and public DTO strips ownership and unexpected private fields', async () => {
  const client = queryClient([{ data: Array(21).fill(page), error: null }]);
  const result = await reader.readDirectory(client, new URLSearchParams('search=night&category=investigation_team'));
  assert.equal(result.pages.length, 20); assert.equal(result.nextOffset, 20);
  assert.equal('owner_id' in result.pages[0], false); assert.equal('private_email' in result.pages[0], false);
  assert.ok(client.calls.some(c => c[0] === 'eq' && c[1] === 'status' && c[2] === 'active'));
  assert.ok(client.calls.some(c => c[0] === 'textSearch' && c[1] === 'search_document' && c[3].type === 'plain'));
  assert.ok(client.calls.some(c => c[0] === 'range' && c[1] === 0 && c[2] === 20));
});
test('invalid search/category/cursor inputs do not issue a database query', async () => {
  for (const query of ['offset=-1', 'offset=0%29.or%28owner_id', 'category=private', `search=${'x'.repeat(101)}`]) {
    const client = queryClient([]); await assert.rejects(reader.readDirectory(client, new URLSearchParams(query))); assert.equal(client.calls.length, 0);
  }
});
test('public page reads include published posts only and keep page attribution', async () => {
  const client = queryClient([{ data: page }, { data: [{ id, page_id: id, content: 'Hello', created_at: page.created_at, comments_enabled: true, author_id: owner }] }]);
  const result = await reader.readPublicPage(client, id); assert.equal(result.posts[0].page_id, id); assert.equal('author_id' in result.posts[0], false);
  assert.ok(client.calls.some(c => c[0] === 'eq' && c[1] === 'status' && c[2] === 'published'));
  const absent = queryClient([{ data: null }]); await assert.rejects(reader.readPublicPage(absent, id), e => e.status === 404); assert.equal(absent.calls.filter(c => c[0] === 'from').length, 1);
});
test('public API forwards authenticated context and does not expose mutation handlers', async () => {
  const h = server(); const client = queryClient([{ data: [page] }]);
  h.creatorVerseClient = async () => ({ client, userId: owner });
  const route = load('app/api/creatorverse/route.ts', { '@/lib/creatorverse/server': h, '@/lib/creatorverse/read': reader });
  const response = await route.GET(request()); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal((await response.json()).pages.length, 1);
  for (const method of ['POST','PATCH','PUT','DELETE']) assert.equal(route[method], undefined);
});
test('permissions API denies anonymous and returns only boolean capabilities', async () => {
  for (const token of [undefined, 'Bearer owner']) {
    const h = server();
    const route = load('app/api/creatorverse/[id]/permissions/route.ts', { '@/lib/creatorverse/server': h, '@/lib/creatorverse/permissions': permissions, '@/lib/creatorverse/validation': validation });
    const response = await route.GET(request(token), { params: Promise.resolve({ id }) });
    assert.equal(response.status, token ? 200 : 401);
    if (token) assert.deepEqual(await response.json(), { can_manage: true, can_publish: true });
  }
});

// Static tripwires only: these are NOT evidence that PostgreSQL executed the RLS policies.
const schema = read('docs/sql-drafts/creatorverse-foundation-schema.sql');
const rls = read('docs/sql-drafts/creatorverse-foundation-rls.sql');
test('every new exposed table has RLS, reset grants, and Phase 1 has no client write grants', () => {
  for (const name of [...schema.matchAll(/CREATE TABLE public\.(\w+)/g)].map(m => m[1])) {
    assert.match(rls, new RegExp(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY`));
    assert.match(rls, new RegExp(`REVOKE ALL ON[\\s\\S]*?public\\.${name}[\\s\\S]*?FROM PUBLIC, anon, authenticated`));
  }
  assert.doesNotMatch(rls, /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE)/i);
  assert.match(schema, /writes_enabled boolean NOT NULL DEFAULT false/); assert.match(schema, /enabled boolean NOT NULL DEFAULT false/);
});
test('post publishing policies are owner-scoped; follows cannot grant publishing', () => {
  for (const policy of ['creatorverse_post_create', 'creatorverse_post_edit']) {
    const statement = rls.match(new RegExp(`CREATE POLICY ${policy}[^;]+;`))[0];
    assert.match(statement, /creatorverse_private\.owns\(page_id\)/); assert.match(statement, /author_id=\(SELECT auth\.uid\(\)\)/);
    assert.doesNotMatch(statement, /follows|group_members/);
  }
  assert.match(schema, /Ownership transfers are not supported/); assert.match(schema, /Immutable post identity/);
});
test('interaction constraints and policies prevent cross-post replies and identity spoofing', () => {
  assert.match(schema, /FOREIGN KEY \(post_id,parent_id\) REFERENCES public\.creatorverse_comments\(post_id,id\)/);
  assert.match(schema, /PRIMARY KEY \(page_id, user_id\)/); assert.match(schema, /PRIMARY KEY \(post_id,user_id\)/);
  assert.match(rls, /comments_enabled/); assert.match(rls, /author_id=\(SELECT auth.uid\(\)\)/);
  assert.match(rls, /public.blocked_users/); assert.match(rls, /public.user_blocks/);
});
test('SQL affects only new CreatorVerse objects and grants no access to privileged metadata', () => {
  const combined = schema + rls;
  assert.doesNotMatch(combined, /(?:ALTER TABLE|CREATE POLICY\s+\w+\s+ON|INSERT INTO|UPDATE|DELETE FROM)\s+(?:public\.(?!creatorverse_)|storage\.)/i);
  assert.doesNotMatch(combined, /group_members|groups_command|groups_available/);
  for (const fn of combined.matchAll(/CREATE FUNCTION[\s\S]*?AS \$\$/g)) if (/SECURITY DEFINER/.test(fn[0])) assert.match(fn[0], /SET search_path=''/);
  assert.doesNotMatch(rls, /GRANT SELECT \([^;]*owner_id/);
  assert.match(schema, /verification text NOT NULL DEFAULT 'pending'/); assert.doesNotMatch(rls, /GRANT[^;]*(INSERT|UPDATE)[^;]*creatorverse_media/);
});
test('UI has no composer or mutation calls and generic presentation reuse does not import Group permissions', () => {
  for (const file of ['app/creatorverse/CreatorVersePage.tsx','app/creatorverse/CreatorVerseDirectory.tsx']) assert.doesNotMatch(read(file), /method:\s*['"]POST|GroupPostComposer|groupAction|onPublish/);
  assert.match(read('app/creatorverse/CreatorVersePage.tsx'), /@\/components\/postPresentation/);
  for (const name of readdirSync(new URL('../lib/creatorverse/', import.meta.url))) assert.doesNotMatch(read(`lib/creatorverse/${name}`), /from ['"][^'"]*\/groups\//);
});


test('standalone schema draft is transactional and fail-closed before policies are applied', () => {
  assert.match(schema, /BEGIN;/); assert.match(schema, /COMMIT;/);
  for (const name of [...schema.matchAll(/CREATE TABLE public\.(\w+)/g)].map(match => match[1])) {
    assert.match(schema, new RegExp(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY`));
    assert.match(schema, new RegExp(`REVOKE ALL ON public.${name} FROM PUBLIC, anon, authenticated`));
  }
  assert.match(schema, /FOREIGN KEY \(page_id,author_id\) REFERENCES public\.creatorverse_pages\(id,owner_id\)/);
  assert.match(schema, /FOREIGN KEY \(page_id,media_id\) REFERENCES public\.creatorverse_media\(page_id,id\)/);
  assert.match(rls, /'can_publish',creatorverse_private\.write_enabled\(\) AND creatorverse_private\.owns/);
});

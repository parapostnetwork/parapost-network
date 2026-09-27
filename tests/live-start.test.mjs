import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduledStartHandler } from '../lib/live/start-handler.ts';
const id = '12345678-1234-1234-1234-123456789abc';
const now = Date.parse('2026-09-26T20:00:00Z');
const row = { id, status: 'upcoming', scheduled_at: '2026-09-26T19:00:00Z', started_at: null, ended_at: null, updated_at: '2026-09-25T00:00:00Z' };
const config = { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon', SUPABASE_SERVICE_ROLE_KEY: 'test-service' };
const request = (body = { id }, token = 'valid-session') => new Request('https://example.test/api/live/start', { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) });
function fixture(overrides = {}) {
  let writes = 0;
  const fetcher = async (input, init = {}) => {
    const url = new URL(input);
    if (url.pathname === '/auth/v1/user') return Response.json(overrides.authFails ? {} : { id: 'viewer' }, { status: overrides.authFails ? 401 : 200 });
    assert.equal(url.searchParams.get('visibility'), 'eq.public');
    assert.equal(url.searchParams.get('is_hidden'), 'eq.false');
    assert.equal(url.searchParams.get('id'), `eq.${id}`);
    if (init.method === 'PATCH') {
      writes++;
      assert.equal(init.headers.Authorization, 'Bearer test-service');
      assert.equal(url.searchParams.get('status'), 'eq.upcoming');
      assert.equal(url.searchParams.get('scheduled_at'), `eq.${row.scheduled_at}`);
      assert.equal(url.searchParams.get('updated_at'), `eq.${row.updated_at}`);
      const patch = JSON.parse(init.body);
      assert.deepEqual(patch, { status: 'live', started_at: row.scheduled_at, ended_at: null, updated_at: new Date(now).toISOString() });
      return Response.json(overrides.conflict ? [] : [{ ...row, ...patch }]);
    }
    assert.equal(init.headers.Authorization, 'Bearer valid-session');
    return Response.json(overrides.missing ? [] : [{ ...row, ...overrides.row }]);
  };
  return { handler: createScheduledStartHandler(name => config[name], fetcher, () => now), writes: () => writes };
}
test('viewer can trigger only the eligible published scheduled start without owner resave', async () => {
  const f = fixture();
  const result = await f.handler(request({ id, status: 'ended', started_at: 'forged' }));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).stream.status, 'live');
  assert.equal(f.writes(), 1);
});
test('authentication and valid ID required before any privileged write', async () => {
  const f = fixture();
  assert.equal((await f.handler(request({ id }, null))).status, 401);
  assert.equal((await f.handler(request({ id: 'invalid' }))).status, 400);
  assert.equal((await fixture({ authFails: true }).handler(request())).status, 401);
  assert.equal(f.writes(), 0);
});
test('future, manually ended, cancelled, draft, already-live, hidden and inaccessible shows are not promoted', async () => {
  for (const overrides of [{ row: { scheduled_at: '2026-09-27T19:00:00Z' } }, { row: { scheduled_at: null } },
    ...['ended', 'cancelled', 'draft', 'live'].map(status => ({ row: { status } })), { missing: true }]) {
    const f = fixture(overrides);
    assert.equal((await f.handler(request())).status, 200);
    assert.equal(f.writes(), 0);
  }
});
test('concurrent End Show/hide/reschedule/edit cannot be overwritten', async () => {
  const f = fixture({ conflict: true });
  assert.deepEqual(await (await f.handler(request())).json(), { stream: null });
});
test('missing configuration and backend failures fail closed without exposing secrets', async () => {
  assert.equal((await createScheduledStartHandler(() => undefined)(request())).status, 503);
  const handler = createScheduledStartHandler(name => config[name], async () => { throw new Error('sensitive backend message'); });
  const result = await handler(request());
  assert.equal(result.status, 502);
  assert.deepEqual(await result.json(), { error: 'Live start unavailable' });
});

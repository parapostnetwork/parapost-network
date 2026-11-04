import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function harness() {
  const slots = [], requests = [], session = deferred(); let cursor = 0, effect, cleanup, callback, unsubscribed = false;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useEffect(fn) { effect = fn; },
  };
  const exports = {};
  const source = readFileSync(new URL('../lib/creatorverse/usePublicRead.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, AbortController,
    fetch(path, options) { const result = deferred(); requests.push({ path, options, ...result }); return result.promise; },
    require(name) {
      if (name === 'react') return react;
      if (name === '@/lib/supabase') return { supabase: { auth: {
        getSession: () => session.promise,
        onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; },
      } } };
      throw Error(`Unexpected dependency ${name}`);
    },
  });
  const render = (path = '/api/creatorverse') => { cursor = 0; return exports.usePublicRead(path); };
  render(); cleanup = effect();
  return { requests, session, render, event(token) { callback(token ? 'SIGNED_IN' : 'SIGNED_OUT', token ? { access_token: token } : null); },
    retry() { render().retry(); render(); cleanup(); cleanup = effect(); },
    dispose() { cleanup(); }, get unsubscribed() { return unsubscribed; } };
}
test('public initial read waits for known session and does not require scrolling', async () => {
  const h = harness(); assert.equal(h.requests.length, 0);
  h.session.resolve({ data: { session: null } }); await tick(); assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].options.headers.Authorization, undefined);
  h.requests[0].resolve({ ok: true, json: async () => ({ pages: [] }) }); await tick();
  assert.equal(h.render().loading, false); assert.deepEqual(h.render().data, { pages: [] }); h.dispose();
});
test('newer auth event wins over stale getSession and repeated identity events do not duplicate reads', async () => {
  const h = harness(); h.event('new-token'); h.event('new-token');
  h.session.resolve({ data: { session: { access_token: 'old-token' } } }); await tick();
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].options.headers.Authorization, 'Bearer new-token'); h.dispose();
});
test('account change aborts and rejects the old response even when the transport ignores abort', async () => {
  const h = harness(); h.event('owner'); h.event('visitor'); assert.equal(h.requests[0].options.signal.aborted, true);
  h.requests[1].resolve({ ok: true, json: async () => ({ pages: ['allowed'] }) }); await tick();
  h.requests[0].resolve({ ok: true, json: async () => ({ pages: ['stale-owner'] }) }); await tick();
  assert.deepEqual(h.render().data, { pages: ['allowed'] }); h.dispose();
});
test('failed session lookup fails closed rather than downgrading to an anonymous fetch', async () => {
  const h = harness(); h.session.reject(Error('auth offline')); await tick();
  assert.equal(h.requests.length, 0); assert.match(h.render().error, /session could not/); assert.equal(h.render().loading, false); h.dispose();
});
test('failed read clears content and explicit retry recovers', async () => {
  const h = harness(); h.event(null); h.requests[0].resolve({ ok: false }); await tick();
  assert.equal(h.render().data, null); assert.match(h.render().error, /try again/);
  h.retry(); h.event(null); h.requests[1].resolve({ ok: true, json: async () => ({ pages: ['recovered'] }) }); await tick();
  assert.deepEqual(h.render().data, { pages: ['recovered'] }); h.dispose();
});
test('logout removes old content immediately, then reads under anonymous permissions', async () => {
  const h = harness(); h.event('owner'); h.requests[0].resolve({ ok: true, json: async () => ({ pages: ['old'] }) }); await tick();
  h.event(null); assert.equal(h.render().data, null); assert.equal(h.requests[1].options.headers.Authorization, undefined); h.dispose();
});
test('navigation hides previous path data and unmount aborts pending work', () => {
  const h = harness(); h.event('viewer'); assert.equal(h.render('/api/creatorverse?page=other').data, null);
  h.dispose(); assert.equal(h.requests[0].options.signal.aborted, true); assert.equal(h.unsubscribed, true);
});

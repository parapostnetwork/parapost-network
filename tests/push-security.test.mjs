import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function load(path, imports, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, { exports, require: name => { assert.ok(name in imports, name); return imports[name]; },
    console: { warn() {}, error() {} }, Response, Date, Promise, Error, ...globals });
  return exports;
}
function storage() {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
}
function fixture(options = {}) {
  const calls = [];
  const listeners = [];
  let user = options.user ?? 'B';
  let token = `token-${user}`;
  let expires = Math.floor(Date.now() / 1000) + 3600;
  const session = () => user ? { user: { id: user }, access_token: token, expires_at: expires } : null;
  let existing;
  let sequence = 0;
  const makeSubscription = (endpoint, currentKey = true) => ({
    endpoint, options: { applicationServerKey: new Uint8Array(currentKey ? [1, 2, 3] : [9]).buffer },
    toJSON: () => ({ keys: options.missingKeys ? {} : { p256dh: 'public-test', auth: 'test-auth' } }),
    async unsubscribe() {
      calls.push(['unsubscribe', endpoint]);
      if (options.unsubscribeThrows) throw new Error('unsubscribe failed');
      if (options.unsubscribeFalse) return false;
      if (!options.remainingSubscription) existing = null;
      return true;
    },
  });
  existing = options.noExisting ? null : makeSubscription('old', !options.oldKey);
  const registration = {
    active: { state: 'activated', postMessage(_message, ports) {
      if (!options.insecureWorker) ports[0].postMessage({ protocol: 'parapost-push-security-v2', locks: options.workerLocks !== false });
    } },
    getNotifications: async () => [{ close() { calls.push(['close']); } }],
    pushManager: {
      getSubscription: async () => existing,
      subscribe: async () => {
        calls.push(['subscribe']);
        if (options.beforeSubscribe) await options.beforeSubscribe();
        existing = makeSubscription(options.sameEndpoint ? 'old' : `new-${++sequence}`);
        return existing;
      },
    },
  };
  const localStorage = storage(), sessionStorage = storage();
  if (options.disabled) localStorage.setItem('parapost-push-device-disabled:B', '1');
  if (options.dismissed) localStorage.setItem('parapost-push-intro-dismissed:B', '1');
  if (options.storageUnavailable) localStorage.getItem = () => { throw new Error('storage unavailable'); };
  let gate = null;
  const cache = {
    async put(_path, response) {
      if (options.cacheFailure) throw new Error('cache unavailable');
      gate = await response.json(); calls.push(['gate', gate.endpoint]);
    },
    async match() { return gate ? new Response(JSON.stringify(gate)) : undefined; },
  };
  const supabase = {
    auth: {
      onAuthStateChange(cb) { listeners.push(cb); cb('INITIAL_SESSION', session()); return { data: { subscription: { unsubscribe() {} } } }; },
      getSession: async () => ({ data: { session: session() }, error: null }),
      signOut: async () => { calls.push(['signOut']); if (options.signOutError) return { error: {} }; f.changeUser(''); return { error: null }; },
    },
    from(table) {
      assert.equal(table, 'user_preferences');
      const builder = {
        select() { return builder; }, eq(_key, value) { assert.equal(value, user); return builder; },
        setHeader(_key, value) { assert.equal(value, `Bearer ${token}`); return builder; },
        async maybeSingle() {
          calls.push(['preferences']);
          if (options.beforePreference) await options.beforePreference();
          return { data: options.noPreference ? null : { push_notifications_enabled: !options.accountDisabled }, error: options.preferenceError || null };
        },
      };
      return builder;
    },
    rpc(name, args) {
      return { async setHeader(_key, value) {
        calls.push([name, args.p_endpoint, value]);
        if (name === 'delete_push_subscription') return { error: options.deleteError ? {} : null };
        if (options.beforeSave) await options.beforeSave(args.p_endpoint);
        const index = calls.filter(c => c[0] === name).length;
        if (options.saveThrows) throw new Error('network failure');
        return { error: options.saveErrors?.[index - 1] ?? null };
      } };
    },
  };
  const globals = {
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 20)), clearTimeout,
    MessageChannel: class {
      constructor() {
        this.port1 = { close() {} };
        this.port2 = { close() {}, postMessage: data => this.port1.onmessage?.({ data }) };
      }
    },
    window: { localStorage, sessionStorage, atob, PushManager: class {}, Notification: {} },
    navigator: { userAgent: 'test-browser', locks: { request: async (_name, fn) => fn() },
      serviceWorker: { ready: Promise.resolve(registration), getRegistration: async () => registration } },
    Notification: { permission: options.permission ?? 'granted' },
    caches: { open: async () => cache },
    process: { env: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'AQID' } },
  };
  const api = load('components/pwa/push-device.ts', { '@/lib/supabase': { supabase } }, globals);
  const logout = load('components/pwa/PushNotificationLogout.ts', { '@/lib/supabase': { supabase }, './push-device': api }, globals);
  const f = { api, logout, calls, globals, localStorage, sessionStorage, supabase, registration,
    get existing() { return existing; }, get gate() { return gate; },
    changeUser(id) { user = id; token = `token-${id}`; listeners.forEach(cb => cb('SIGNED_IN', session())); },
    refresh() { expires += 3600; listeners.forEach(cb => cb('TOKEN_REFRESHED', session())); },
  };
  return f;
}
const conflict = { code: '42501', message: 'Endpoint belongs to another user' };
const count = (f, name) => f.calls.filter(c => c[0] === name).length;

test('successful new registration verifies preferences and ownership before opening display gate', async () => {
  const f = fixture({ noExisting: true });
  assert.equal(await f.api.syncDevicePush('B'), 'enabled');
  assert.equal(f.gate.endpoint, 'new-1'); assert.equal(f.gate.userId, 'B');
  assert.equal(count(f, 'save_push_subscription'), 1);
  assert.equal(f.calls.find(c => c[0] === 'save_push_subscription')[2], 'Bearer token-B');
});
test('existing owner sync is confirmed once and cached without navigation queries', async () => {
  const f = fixture();
  for (let i = 0; i < 4; i++) assert.equal(await f.api.syncDevicePush('B'), 'enabled');
  assert.equal(count(f, 'preferences'), 1); assert.equal(count(f, 'save_push_subscription'), 1); assert.equal(count(f, 'subscribe'), 0);
});
test('legacy session-storage endpoint never bypasses ownership verification', async () => {
  const f = fixture({ saveErrors: [conflict] });
  f.sessionStorage.setItem('parapost-push-session-sync:B', 'old');
  assert.equal(await f.api.syncDevicePush('B'), 'enabled');
  assert.equal(f.gate.endpoint, 'new-1'); assert.equal(count(f, 'unsubscribe'), 1);
});
test('ownership rejection disconnects old endpoint before a single fresh registration; no row deletion', async () => {
  const f = fixture({ saveErrors: [conflict] });
  assert.equal(await f.api.syncDevicePush('B'), 'enabled');
  assert.deepEqual(f.calls.filter(c => ['save_push_subscription','unsubscribe','subscribe'].includes(c[0])).map(c => c.slice(0,2)),
    [['save_push_subscription','old'],['unsubscribe','old'],['subscribe'],['save_push_subscription','new-1']]);
  assert.equal(count(f, 'delete_push_subscription'), 0);
});
test('repeated ownership rejection disconnects replacement and never loops or retries on navigation', async () => {
  const f = fixture({ saveErrors: [conflict, conflict] });
  await assert.rejects(f.api.syncDevicePush('B'));
  assert.equal(f.existing, null); assert.equal(f.gate.endpoint, null);
  assert.equal(await f.api.syncDevicePush('B'), 'unavailable');
  assert.equal(count(f,'save_push_subscription'),2); assert.equal(count(f,'subscribe'),1);
});
test('temporary legacy RPC failures preserve the endpoint with a closed gate', async () => {
  for (const options of [{ saveErrors: [{ code:'500', message:'internal error' }] }, { saveThrows:true }]) {
    const f=fixture(options); await assert.rejects(f.api.syncDevicePush('B'));
    assert.equal(count(f,'subscribe'),0); assert.equal(f.existing?.endpoint,'old'); assert.equal(f.gate.endpoint,null);
  }
});
test('provider returning retired endpoint is rejected before registration', async () => {
  const f=fixture({ saveErrors:[conflict], sameEndpoint:true });
  await assert.rejects(f.api.syncDevicePush('B'), /could not be replaced/);
  assert.equal(count(f,'save_push_subscription'),1); assert.equal(f.gate.endpoint,null);
});
for (const [name, options] of Object.entries({ account:{accountDisabled:true}, device:{disabled:true}, dismissed:{dismissed:true}, storage:{storageUnavailable:true}, permission:{permission:'denied'} })) {
  test(`${name} opt-out/unknown consent disconnects stale push without registering`, async () => {
    const f=fixture(options); assert.equal(await f.api.syncDevicePush('B'),'disabled');
    assert.equal(f.existing,null); assert.equal(count(f,'save_push_subscription'),0); assert.equal(count(f,'subscribe'),0);
  });
}
test('account opt-out suppresses invitation even before permission is requested', async () => {
  const f=fixture({ accountDisabled:true, permission:'default' });
  assert.equal(await f.api.syncDevicePush('B'),'disabled');
});
test('permitted account without OS permission receives a prompt and no subscription', async () => {
  const f=fixture({ noExisting:true, permission:'default' });
  assert.equal(await f.api.syncDevicePush('B'),'prompt'); assert.equal(count(f,'subscribe'),0);
});
test('manual setup can override device dismissal but never a saved account opt-out', async () => {
  const f=fixture({ disabled:true, dismissed:true });
  assert.equal(await f.api.syncDevicePush('B',{manual:true}),'enabled');
  assert.equal(f.api.devicePushDisabled('B'),false);
  const blocked=fixture({ disabled:true, accountDisabled:true });
  assert.equal(await blocked.api.syncDevicePush('B',{manual:true}),'disabled'); assert.equal(count(blocked,'save_push_subscription'),0);
});
test('preference lookup errors fail closed and do not attempt registration', async () => {
  const f=fixture({preferenceError:true}); await assert.rejects(f.api.syncDevicePush('B'));
  assert.equal(f.existing,null); assert.equal(count(f,'save_push_subscription'),0);
});
test('missing preference row preserves default opt-in behavior', async () => {
  const f=fixture({noPreference:true}); assert.equal(await f.api.syncDevicePush('B'),'enabled');
});
for (const option of ['unsubscribeFalse','unsubscribeThrows','remainingSubscription']) {
  test(`cleanup failure ${option} closes display gate and never creates replacement`, async () => {
    const f=fixture({[option]:true,saveErrors:[conflict]}); await assert.rejects(f.api.syncDevicePush('B'));
    assert.equal(f.gate.endpoint,null); assert.equal(count(f,'subscribe'),0);
  });
}
test('cache failure cannot report enabled or register a new endpoint', async () => {
  const f=fixture({cacheFailure:true}); await assert.rejects(f.api.syncDevicePush('B'));
  assert.equal(count(f,'save_push_subscription'),0); assert.equal(f.existing,null);
});
test('auth change while reading preference prevents save and disconnects stale subscription', async () => {
  const options={}; const f=fixture(options); options.beforePreference=async()=>f.changeUser('C');
  await assert.rejects(f.api.syncDevicePush('B')); assert.equal(count(f,'save_push_subscription'),0); assert.equal(f.existing,null);
});
test('auth change while subscribing cleans newly returned subscription before any save', async () => {
  const options={noExisting:true}; const f=fixture(options); options.beforeSubscribe=async()=>f.changeUser('C');
  await assert.rejects(f.api.syncDevicePush('B')); assert.equal(f.existing,null); assert.equal(count(f,'save_push_subscription'),0);
});
test('account switch during RPC pins old token, closes gate and never commits enabled state', async () => {
  const options={}; const f=fixture(options); options.beforeSave=async()=>f.changeUser('C');
  await assert.rejects(f.api.syncDevicePush('B')); assert.equal(f.gate.endpoint,null); assert.equal(f.existing,null);
  assert.equal(f.calls.find(c=>c[0]==='save_push_subscription')[2],'Bearer token-B');
});
test('A to B to A auth race invalidates the original generation', async () => {
  const options={}; const f=fixture(options); options.beforeSave=async()=>{f.changeUser('C');f.changeUser('B');};
  await assert.rejects(f.api.syncDevicePush('B')); assert.equal(f.gate.endpoint,null);
});
test('device opt-out during RPC cannot be undone by late success', async () => {
  const options={}; const f=fixture(options); options.beforeSave=async()=>f.localStorage.setItem('parapost-push-device-disabled:B','1');
  await assert.rejects(f.api.syncDevicePush('B')); assert.equal(f.gate.endpoint,null); assert.equal(f.existing,null);
});
test('unmounted component cannot accept a successful late RPC', async () => {
  let current=true; const options={beforeSave:async()=>{current=false;}};const f=fixture(options);
  await assert.rejects(f.api.syncDevicePush('B',{isCurrent:()=>current})); assert.equal(f.gate.endpoint,null);
});
test('concurrent startup/settings calls share a registration and do not duplicate queries', async () => {
  const f=fixture({noExisting:true}); const results=await Promise.all([f.api.syncDevicePush('B'),f.api.syncDevicePush('B')]);
  assert.deepEqual(results,['enabled','enabled']);assert.equal(count(f,'subscribe'),1);assert.equal(count(f,'preferences'),1);
});
test('key rotation disconnects the old key before fresh registration', async () => {
  const f=fixture({oldKey:true}); assert.equal(await f.api.syncDevicePush('B'),'enabled');
  assert.equal(count(f,'unsubscribe'),1); assert.equal(f.gate.endpoint,'new-1');
});
test('expired-session sign-in cleanup disconnects browser despite failed server deletion', async () => {
  const f=fixture({user:'',deleteError:true}); await f.logout.clearLocalAuthSessionWithPushCleanup();
  assert.equal(f.existing,null);assert.equal(count(f,'signOut'),1);assert.equal(f.gate.endpoint,null);
});
test('failed browser cleanup still clears auth and rejects sign-in continuation', async () => {
  const f=fixture({unsubscribeFalse:true});await assert.rejects(f.logout.clearLocalAuthSessionWithPushCleanup(),/Signed out/);
  assert.equal(count(f,'signOut'),1);assert.equal(f.gate.endpoint,null);
});
test('strict logout preserves server-error protection after browser disconnection', async () => {
  const f=fixture({deleteError:true});await assert.rejects(f.logout.cleanupPushBeforeLogout('B'));
  assert.equal(f.existing,null);assert.equal(count(f,'signOut'),0);
});
test('token refresh does not repeat registration or preference queries', async () => {
  const f=fixture();await f.api.syncDevicePush('B');const before=f.gate.endpoint;
  f.refresh();await f.api.withPushLock(async()=>{});
  assert.equal(f.gate.endpoint,before);assert.equal(count(f,'preferences'),1);assert.equal(count(f,'save_push_subscription'),1);
});
test('logout invalidates an in-flight registration and leaves the gate closed', async () => {
  let release; const paused=new Promise(resolve=>{release=resolve;}); let entered;
  const saved=new Promise(resolve=>{entered=resolve;});
  const f=fixture({beforeSave:async()=>{entered();await paused;}});
  const syncing=f.api.syncDevicePush('B');await saved;
  const cleanup=f.logout.cleanupPushBeforeLogout('B');release();
  await assert.rejects(syncing);await cleanup;assert.equal(f.gate.endpoint,null);assert.equal(f.existing,null);
});

test('all prepared sign-in/reset/logout callers retain guarded cleanup',()=>{
  assert.match(read('app/page.tsx'),/await clearLocalAuthSessionWithPushCleanup\(\);\s*const \{ error \} = await supabase.auth.signInWithPassword/);
  assert.match(read('app/reset-password/page.tsx'),/await clearLocalAuthSessionWithPushCleanup\(\)/);
  for(const path of ['app/dashboard/page.tsx','app/profile/[id]/page.tsx','app/settings/page.tsx','app/settings/account/page.tsx'])assert.match(read(path),/await cleanupPushBeforeLogout\(/);
});

function renderSettings(f, initialProps, startup = false) {
  let props=initialProps, cursor=0, pending=[], dirty=true, tree;
  const hooks=[];
  const react={
    useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=initial;return[hooks[i],value=>{hooks[i]=typeof value==='function'?value(hooks[i]):value;dirty=true;}];},
    useRef(initial){const i=cursor++;return hooks[i]??(hooks[i]={current:initial});},
    useEffect(fn,deps){const i=cursor++;const old=hooks[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){pending.push(()=>{old?.cleanup?.();hooks[i]={deps,cleanup:fn()};});}},
  };
  const jsx=(type,props)=>({type,props});
  const Component=load(startup ? 'components/pwa/PushNotificationStartup.tsx' : 'components/pwa/PushNotificationSettings.tsx',{
    react,'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/supabase':{supabase:f.supabase},'./push-device':f.api,
    'next/navigation':{usePathname:()=>props.pathname},
    '@/components/pwa/PushNotificationPrompt':{default:()=>null},
  },f.globals).default;
  function render(){cursor=0;dirty=false;tree=Component(props);const effects=pending;pending=[];effects.forEach(fn=>fn());}
  render();
  return {get tree(){return tree;},render,
    async flush(){for(let i=0;i<10;i++){await new Promise(resolve=>setImmediate(resolve));if(dirty)render();}},
    update(next){props=next;render();},unmount(){hooks.forEach(h=>h?.cleanup?.());},
  };
}
function findButton(tree) {
  if(!tree||typeof tree!=='object')return null;
  if(tree.type==='button')return tree;
  for(const child of [tree.props?.children].flat(Infinity)){const found=findButton(child);if(found)return found;}
  return null;
}
test('Settings keeps setup visible until database ownership is confirmed',async()=>{
  let release;const paused=new Promise(resolve=>{release=resolve;});
  const f=fixture({beforeSave:async()=>paused});const ui=renderSettings(f,{currentUserId:'B',accountPushEnabled:true});
  await ui.flush();assert.ok(findButton(ui.tree),'must not hide setup for an unverified subscription');
  release();await ui.flush();assert.equal(ui.tree,null,'confirmed enabled setup hides');ui.unmount();
});
test('Settings never reports enabled after rejected replacement and shows safe failure text',async()=>{
  const f=fixture({saveErrors:[conflict,conflict]});const ui=renderSettings(f,{currentUserId:'B',accountPushEnabled:true});
  await ui.flush();assert.ok(findButton(ui.tree));assert.match(JSON.stringify(ui.tree),/could not be registered/);ui.unmount();
});
test('Settings account opt-out invalidates in-flight success and does not reactivate after toggle back',async()=>{
  let release;const paused=new Promise(resolve=>{release=resolve;});
  const f=fixture({beforeSave:async()=>paused});const ui=renderSettings(f,{currentUserId:'B',accountPushEnabled:true});
  await ui.flush();ui.update({currentUserId:'B',accountPushEnabled:false});release();await ui.flush();
  assert.equal(f.gate.endpoint,null);assert.equal(f.existing,null);
  ui.update({currentUserId:'B',accountPushEnabled:true});await ui.flush();assert.ok(findButton(ui.tree));assert.equal(count(f,'subscribe'),0);ui.unmount();
});
test('Settings manual setup preserves explicit setup after device opt-out',async()=>{
  const f=fixture({disabled:true});const ui=renderSettings(f,{currentUserId:'B',accountPushEnabled:true});
  await ui.flush();const button=findButton(ui.tree);assert.ok(button);await button.props.onClick();await ui.flush();
  assert.equal(ui.tree,null);assert.equal(f.gate.endpoint,'new-1');ui.unmount();
});
test('Settings cannot complete setup after permission request returns to a different account',async()=>{
  const f=fixture({permission:'default'});let resolvePermission;
  f.globals.Notification.requestPermission=()=>new Promise(resolve=>{resolvePermission=resolve;});
  const ui=renderSettings(f,{currentUserId:'B',accountPushEnabled:true});await ui.flush();
  const enabling=findButton(ui.tree).props.onClick();f.changeUser('C');resolvePermission('granted');await enabling;await ui.flush();
  assert.equal(count(f,'save_push_subscription'),0);assert.ok(ui.tree);ui.unmount();
});
test('shared logout barrier prevents another tab from registering before sign-out finishes',async()=>{
  const f=fixture();f.localStorage.setItem('parapost-push-logout-pending','B');
  assert.equal(await f.api.syncDevicePush('B',{manual:true}),'unavailable');assert.equal(count(f,'save_push_subscription'),0);
});
test('missing cross-tab lock support fails closed instead of racing browser subscriptions',async()=>{
  const f=fixture();delete f.globals.navigator.locks;assert.equal(await f.api.syncDevicePush('B'),'unsupported');
  assert.equal(f.existing?.endpoint,'old');assert.equal(count(f,'save_push_subscription'),0);
});



test('Web Locks unavailable preserves verified subscriber', async () => {
  const f = fixture();

  assert.equal(await f.api.syncDevicePush('B'), 'enabled');

  f.api.invalidatePush();
  delete f.globals.navigator.locks;

  assert.equal(await f.api.syncDevicePush('B'), 'unsupported');

  assert.equal(f.existing?.endpoint, 'old');
  assert.equal(f.gate?.endpoint, null);

  assert.equal(count(f, 'unsubscribe'), 0);
  assert.equal(count(f, 'subscribe'), 0);
  assert.equal(count(f, 'save_push_subscription'), 1);
});

test('Web Locks unavailable rejects previous account ownership', async () => {
  const f = fixture();

  assert.equal(await f.api.syncDevicePush('B'), 'enabled');

  f.changeUser('C');
  delete f.globals.navigator.locks;

  assert.equal(await f.api.syncDevicePush('C'), 'unsupported');

  assert.equal(f.existing, null);
  assert.equal(f.gate?.endpoint, null);
  assert.equal(count(f, 'save_push_subscription'), 1);
});

test('Web Locks unavailable respects explicit device opt-out', async () => {
  const f = fixture();

  assert.equal(await f.api.syncDevicePush('B'), 'enabled');

  f.api.invalidatePush();

  f.localStorage.setItem(
    'parapost-push-device-disabled:B',
    '1'
  );

  delete f.globals.navigator.locks;

  assert.equal(await f.api.syncDevicePush('B'), 'disabled');

  assert.equal(f.existing, null);
  assert.equal(f.gate?.endpoint, null);
  assert.equal(count(f, 'unsubscribe'), 1);
});


test('Web Locks unavailable respects account-level opt-out', async () => {
  const options = { accountDisabled: false };
  const f = fixture(options);

  assert.equal(await f.api.syncDevicePush('B'), 'enabled');

  options.accountDisabled = true;
  f.api.invalidatePush();
  delete f.globals.navigator.locks;

  assert.equal(await f.api.syncDevicePush('B'), 'disabled');
  assert.equal(f.existing, null);
  assert.equal(f.gate?.endpoint, null);
  assert.equal(count(f, 'unsubscribe'), 1);
  assert.equal(count(f, 'save_push_subscription'), 1);
});

test('Web Locks unavailable rejects logout during verification', async () => {
  let pause = false;
  let entered;
  let release;

  const reached = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });

  const f = fixture({
    beforePreference: async () => {
      if (pause) {
        entered();
        await blocked;
      }
    }
  });

  assert.equal(await f.api.syncDevicePush('B'), 'enabled');

  f.api.invalidatePush();
  delete f.globals.navigator.locks;
  pause = true;

  const syncing = f.api.syncDevicePush('B');

  await reached;
  f.api.suspendPushForLogout('B');
  release();

  await assert.rejects(syncing);

  assert.equal(f.existing, null);
  assert.equal(f.gate?.endpoint, null);
  assert.equal(count(f, 'unsubscribe'), 1);
  assert.equal(count(f, 'save_push_subscription'), 1);
});

test('Web Locks unavailable rejects another account cache', async () => {
  const f = fixture();

  assert.equal(await f.api.syncDevicePush('B'), 'enabled');

  f.gate.userId = 'C';

  f.api.invalidatePush();
  delete f.globals.navigator.locks;

  assert.equal(await f.api.syncDevicePush('B'), 'unsupported');

  assert.equal(f.existing, null);
  assert.equal(f.gate?.endpoint, null);
  assert.equal(count(f, 'unsubscribe'), 1);
  assert.equal(count(f, 'save_push_subscription'), 1);
});

test('password recovery closes a previous account gate without registering the recovery account',async()=>{
  const f=fixture();
  await f.api.syncDevicePush('B');
  f.changeUser('C');
  f.globals.window.addEventListener=()=>{};
  f.globals.window.removeEventListener=()=>{};
  const ui=renderSettings(f,{pathname:'/reset-password'},true);
  await ui.flush();
  assert.equal(f.gate.endpoint,null);
  assert.equal(f.existing,null);
  assert.equal(count(f,'save_push_subscription'),1);
  ui.unmount();
});


test('verified cached startup activates waiting safety worker', async () => {
  const f = fixture();

  assert.equal(await f.api.syncDevicePush('B'), 'enabled');

  const messages = [];

  f.registration.waiting = {
    postMessage(message) {
      messages.push(message.type);
    }
  };

  assert.equal(await f.api.syncDevicePush('B'), 'enabled');

  assert.deepEqual(
    messages,
    ['PARAPOST_PUSH_ACTIVATE_VERIFIED']
  );

  assert.equal(count(f, 'unsubscribe'), 0);
  assert.equal(count(f, 'subscribe'), 0);
  assert.equal(count(f, 'save_push_subscription'), 1);
});

test('normal signed-in startup preserves an existing verified subscription',async()=>{
  const f=fixture();
  await f.api.syncDevicePush('B');
  f.globals.window.addEventListener=()=>{};
  f.globals.window.removeEventListener=()=>{};
  const ui=renderSettings(f,{pathname:'/dashboard'},true);
  await ui.flush();
  assert.equal(f.gate.endpoint,'old');
  assert.equal(f.existing.endpoint,'old');
  assert.equal(count(f,'unsubscribe'),0);
  ui.update({pathname:'/notifications'});
  await ui.flush();
  assert.equal(count(f,'save_push_subscription'),2);
  assert.equal(count(f,'unsubscribe'),0);
  ui.unmount();
});




test('verified subscriber survives a temporary RPC failure', async () => {
  const f = fixture({
    saveErrors: [
      null,
      { code: '500', message: 'internal error' }
    ]
  });

  // Establish verified ownership first.
  assert.equal(await f.api.syncDevicePush('B'), 'enabled');
  assert.equal(f.gate.endpoint, 'old');
  assert.equal(f.gate.userId, 'B');

  // Force re-verification without changing the account.
  f.api.invalidatePush();

  await assert.rejects(f.api.syncDevicePush('B'));

  // A temporary failure must not destroy a verified subscription.
  assert.ok(f.existing);
  assert.equal(f.existing.endpoint, 'old');
  assert.equal(f.gate.endpoint, null);
  assert.equal(count(f, 'unsubscribe'), 0);

  // A skipped automatic retry must also preserve the device.
  assert.equal(await f.api.syncDevicePush('B'), 'unavailable');
  assert.ok(f.existing);
  assert.equal(count(f, 'unsubscribe'), 0);
});

// Release regressions: actual worker code, not a duplicate of its filtering logic.
function browserLock() {
  let pending = Promise.resolve();
  return { request(_name, action) {
    const next = pending.then(action, action);
    pending = next.catch(() => {});
    return next;
  } };
}
function workerFixture({ locks = browserLock(), gate = { userId: 'B', endpoint: 'old' }, endpoint = 'old', show } = {}) {
  const handlers = {}, shown = [], replies = [];
  let saved = gate, skipped = 0;
  const cache = {
    match: async () => saved ? new Response(JSON.stringify(saved)) : undefined,
    put: async (_path, response) => { saved = await response.json(); },
  };
  const self = {
    navigator: { locks }, clients: { claim: async () => {} },
    skipWaiting: async () => { skipped++; },
    addEventListener: (name, fn) => { handlers[name] = fn; },
    registration: {
      pushManager: { getSubscription: async () => endpoint ? { endpoint } : null },
      getNotifications: async () => shown.map(() => ({ close() { shown.pop(); } })),
      showNotification: async (...args) => { if (show) await show(); shown.push(args); },
    },
  };
  vm.runInNewContext(read('tests/fixtures/parapost-secure-worker-candidate.js'), { self, caches: { open: async () => cache }, Response, Promise });
  async function dispatch(type, fields = {}) {
    let waiting = Promise.resolve();
    handlers[type]({ waitUntil: value => { waiting = value; }, ...fields });
    await waiting;
  }
  return { shown, replies, self, cache, get skipped() { return skipped; },
    push: payload => dispatch('push', { data: { json: () => payload } }),
    message: data => dispatch('message', { data, ports: [{ postMessage: value => replies.push(value) }] }),
    dispatch,
  };
}
for (const [name, opts, payload, expected] of [
  ['verified recipient', {}, { recipientUserId: 'B' }, 1],
  ['other recipient', {}, { recipientUserId: 'A' }, 0],
  ['missing recipient', {}, {}, 0],
  ['missing verification', { gate: null }, { recipientUserId: 'B' }, 0],
  ['endpoint mismatch', { endpoint: 'other' }, { recipientUserId: 'B' }, 0],
  ['removed subscription', { endpoint: null }, { recipientUserId: 'B' }, 0],
  ['no Web Locks', { locks: null }, { recipientUserId: 'B' }, 0],
]) test(`secure worker: ${name}`, async () => {
  const w = workerFixture(opts); await w.push(payload); assert.equal(w.shown.length, expected);
});
test('secure worker immediately activates without creating verification', async () => {
  const w = workerFixture({ gate: null });
  await w.dispatch('install'); assert.equal(w.skipped, 1);
  await w.push({ recipientUserId: 'B' }); assert.equal(w.shown.length, 0);
});
test('worker reports its own capabilities and protocol', async () => {
  const w = workerFixture({ locks: null });
  await w.message({ type: 'PARAPOST_PUSH_SECURITY_STATUS' });
  assert.equal(w.replies[0].locks, false);
  assert.equal(w.replies[0].protocol, 'parapost-push-security-v2');
});
test('worker holds the shared lock through display; logout drains and closes it', async () => {
  let release, enter;
  const entered = new Promise(resolve => { enter = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  const locks = browserLock();
  const w = workerFixture({ locks, show: async () => { enter(); await hold; } });
  const pushing = w.push({ recipientUserId: 'B' });
  await entered;
  let cleaned = false;
  const cleanup = locks.request('parapost-push-device', async () => {
    await w.cache.put('', new Response(JSON.stringify({ endpoint: null })));
    for (const n of await w.self.registration.getNotifications()) n.close();
    cleaned = true;
  });
  await Promise.resolve(); assert.equal(cleaned, false);
  release(); await Promise.all([pushing, cleanup]);
  assert.equal(cleaned, true); assert.equal(w.shown.length, 0);
  await w.push({ recipientUserId: 'B' }); assert.equal(w.shown.length, 0);
});
test('page without locks can ask worker to atomically pause delivery', async () => {
  const w = workerFixture();
  await w.push({ recipientUserId: 'B' }); assert.equal(w.shown.length, 1);
  await w.message({ type: 'PARAPOST_PUSH_SECURITY_STATUS', pause: true });
  assert.equal(w.shown.length, 0);
  await w.push({ recipientUserId: 'B' }); assert.equal(w.shown.length, 0);
});
test('old unrestricted worker cannot preserve a legacy endpoint during RPC outage', async () => {
  const f = fixture({ insecureWorker: true, saveThrows: true });
  await assert.rejects(f.api.syncDevicePush('B'), /security update/);
  assert.equal(f.existing, null); assert.equal(count(f, 'save_push_subscription'), 0);
});
test('worker lacking locks cannot report enabled even when the page has locks', async () => {
  const f = fixture({ workerLocks: false });
  assert.equal(await f.api.syncDevicePush('B'), 'unsupported');
  assert.equal(f.existing.endpoint, 'old'); assert.equal(f.gate.endpoint, null);
  assert.equal(count(f, 'save_push_subscription'), 0);
});
test('legacy RPC outage followed by explicit retry preserves and verifies the same endpoint', async () => {
  const f = fixture({ saveErrors: [{ code: '503' }] });
  await assert.rejects(f.api.syncDevicePush('B'));
  assert.equal(f.existing.endpoint, 'old'); assert.equal(f.gate.endpoint, null);
  assert.equal(await f.api.syncDevicePush('B', { manual: true }), 'enabled');
  assert.equal(f.gate.endpoint, 'old'); assert.equal(count(f, 'subscribe'), 0);
});
test('cross-tab logout barrier during RPC forbids legacy preservation', async () => {
  const options = { saveThrows: true }; const f = fixture(options);
  options.beforeSave = async () => f.localStorage.setItem('parapost-push-logout-pending', 'B');
  await assert.rejects(f.api.syncDevicePush('B'));
  assert.equal(f.existing, null); assert.equal(f.gate.endpoint, null);
});
test('two independent page modules sharing browser state serialize without duplicate subscriptions', async () => {
  const f = fixture({ noExisting: true }); f.globals.navigator.locks = browserLock();
  const second = load('components/pwa/push-device.ts', { '@/lib/supabase': { supabase: f.supabase } }, f.globals);
  assert.deepEqual(await Promise.all([f.api.syncDevicePush('B'), second.syncDevicePush('B')]), ['enabled', 'enabled']);
  assert.equal(count(f, 'subscribe'), 1);
});
test('permission revocation invalidates a cached enabled result', async () => {
  const f = fixture(); await f.api.syncDevicePush('B');
  f.globals.Notification.permission = 'default';
  assert.equal(await f.api.syncDevicePush('B', { manual: true }), 'prompt');
  assert.equal(f.existing, null); assert.equal(f.gate.endpoint, null);
});
test('release worker is exactly the exercised security candidate', () => {
  assert.equal(read('public/sw.js'), read('tests/fixtures/parapost-secure-worker-candidate.js'));
});
test('waiting security update activates before preserving the legacy endpoint', async () => {
  const options = { insecureWorker: true }; const f = fixture(options);
  const pending = {
    state: 'installed',
    addEventListener(_name, callback) { this.changed = callback; },
    removeEventListener() {},
    postMessage() {
      options.insecureWorker = false;
      pending.state = 'activated';
      f.registration.active = { state: 'activated', postMessage(_message, ports) {
        ports[0].postMessage({ protocol: 'parapost-push-security-v2', locks: true });
      } };
      pending.changed();
    },
  };
  f.registration.waiting = pending;
  assert.equal(await f.api.syncDevicePush('B'), 'enabled');
  assert.equal(f.existing.endpoint, 'old'); assert.equal(count(f, 'unsubscribe'), 0);
});

test('temporary preference outage retains legacy endpoint without permitting delivery', async () => {
  const f = fixture({ preferenceError: { code: '503', message: 'service unavailable' } });
  await assert.rejects(f.api.syncDevicePush('B'));
  assert.equal(f.existing.endpoint, 'old'); assert.equal(f.gate.endpoint, null);
  assert.equal(count(f, 'save_push_subscription'), 0);
});

test('activation removes notifications left by the unrestricted predecessor', async () => {
  const w = workerFixture();
  await w.push({ recipientUserId: 'B' });
  assert.equal(w.shown.length, 1);
  await w.dispatch('activate');
  assert.equal(w.shown.length, 0);
});

test('Settings explains unsupported delivery without offering ineffective setup', async () => {
  const f = fixture({ workerLocks: false });
  const ui = renderSettings(f, { currentUserId: 'B', accountPushEnabled: true });
  await ui.flush();
  assert.ok(JSON.stringify(ui.tree).includes('Web Locks'));
  assert.equal(Boolean(findButton(ui.tree)), false);
  ui.unmount();
});

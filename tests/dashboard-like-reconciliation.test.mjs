import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLikeReconciler } from '../lib/dashboard/like-reconciliation.ts';

function setup() {
  const state = { userId: 'me', postIds: ['main', 'shared', 'other'], canRun: true, fullLoad: false };
  let counts = { main: 5, shared: 3, other: 9 }, liked = { main: true, shared: false, other: true };
  const timers = new Map(), requests = [], fallbacks = [];
  let timerId = 0, errors = 0;
  const controller = createLikeReconciler({
    snapshot: () => state,
    schedule(fn, delay) { assert.equal(delay, 1500); timers.set(++timerId, fn); return timerId; },
    cancel(id) { timers.delete(id); },
    read(ids) { return new Promise((resolve, reject) => requests.push({ ids, resolve, reject })); },
    readExact(id) { return new Promise((resolve, reject) => fallbacks.push({ id, resolve, reject })); },
    apply(nextCounts, nextLiked) { counts = { ...counts, ...nextCounts }; liked = { ...liked, ...nextLiked }; },
    onError() { errors++; },
  });
  return { state, timers, requests, fallbacks, controller,
    get counts() { return counts; }, get liked() { return liked; }, get errors() { return errors; },
    tick() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); },
    async finish(index, data = [], error = null, count = data?.length ?? null) { requests[index].resolve({ data, error, count }); await new Promise(resolve => setImmediate(resolve)); },
  };
}
const insert = post_id => ({ eventType: 'INSERT', new: { post_id } });

test('INSERT: authoritative count/current user and unrelated state preserved', async () => {
  const h = setup(); h.controller.event(insert('main')); h.tick();
  assert.deepEqual(h.requests[0].ids, ['main']);
  await h.finish(0, [{ post_id: 'main', user_id: 'me' }, { post_id: 'main', user_id: 'someone' }]);
  assert.deepEqual(h.counts, { main: 2, shared: 3, other: 9 });
  assert.deepEqual(h.liked, { main: true, shared: false, other: true });
});
test('DELETE/unlike explicitly writes zero and false', async () => {
  const h = setup(); h.controller.event({ eventType: 'DELETE', old: { post_id: 'main' } }); h.tick(); await h.finish(0);
  assert.equal(h.counts.main, 0); assert.equal(h.liked.main, false); assert.equal(h.counts.other, 9);
});
test('other users likes produce count but false for current user', async () => {
  const h = setup(); h.controller.event(insert('main')); h.tick(); await h.finish(0, [{ post_id: 'main', user_id: 'someone' }]);
  assert.equal(h.counts.main, 1); assert.equal(h.liked.main, false);
});
test('storm coalesces/deduplicates main and shared originals with a bounded fixed window', async () => {
  const h = setup(); for (let i = 0; i < 1000; i++) { h.controller.event(insert('main')); h.controller.event(insert('shared')); }
  assert.equal(h.timers.size, 1); h.tick(); assert.equal(h.requests.length, 1); assert.deepEqual(h.requests[0].ids, ['main', 'shared']);
  await h.finish(0, [{ post_id: 'shared', user_id: 'me' }]); assert.equal(h.liked.shared, true);
});
test('UPDATE accounts for both old and new posts', () => {
  const h = setup(); h.controller.event({ eventType: 'UPDATE', old: { post_id: 'main' }, new: { post_id: 'shared' } });h.tick();assert.deepEqual(h.requests[0].ids, ['main', 'shared']);
});
test('incomplete DELETE/UPDATE/unknown payload reconciles loaded set, not full loader', () => {
  for (const event of [{ eventType: 'DELETE', old: { id: 'like-id' } }, { eventType: 'UPDATE', new: { post_id: 'main' } }, {}]) {
    const h = setup(); h.controller.event(event); h.tick(); assert.deepEqual(h.requests[0].ids, h.state.postIds);
  }
});
test('known unloaded post does not query', () => {const h = setup();h.controller.event(insert('absent'));h.tick();assert.equal(h.requests.length, 0);});
test('events during read become one trailing batch, never concurrent', async () => {
  const h = setup();h.controller.event(insert('main'));h.tick();
  for(let i=0;i<100;i++)h.controller.event(insert('shared'));
  h.tick();assert.equal(h.requests.length,1);await h.finish(0);assert.equal(h.timers.size,1);h.tick();
  assert.equal(h.requests.length,2);assert.deepEqual(h.requests[1].ids,['shared']);await h.finish(1);assert.equal(h.timers.size,0);
});
test('full load interrupts target, rejects old result, and permits a trailing read after completion', async () => {
  const h=setup();h.controller.event(insert('main'));h.tick();h.state.fullLoad=true;h.controller.fullStart();
  await h.finish(0,[{post_id:'main',user_id:'me'}]);assert.equal(h.counts.main,5);assert.equal(h.timers.size,0);
  h.controller.externalWrite();h.state.fullLoad=false;h.controller.resume();h.tick();assert.equal(h.requests.length,2);await h.finish(1);assert.equal(h.counts.main,0);
});
test('event during full load waits without polling', async () => {
  const h=setup();h.state.fullLoad=true;h.controller.event(insert('main'));h.tick();assert.equal(h.requests.length,0);
  h.state.fullLoad=false;h.controller.resume();h.tick();await h.finish(0);assert.equal(h.counts.main,0);
});
test('late full-load setter after targeted completion schedules authoritative repair', async () => {
  const h=setup();h.controller.event(insert('main'));h.tick();await h.finish(0);h.controller.externalWrite();h.controller.externalWrite();
  assert.equal(h.timers.size,1);h.tick();assert.deepEqual(h.requests[1].ids,['main']);await h.finish(1);
});
test('local like/unlike invalidates old target and waits for all overlapping mutations', async () => {
  const h=setup();h.controller.event(insert('main'));h.tick();h.controller.beginMutation('main');h.controller.beginMutation('shared');
  await h.finish(0);assert.equal(h.counts.main,5);h.controller.endMutation('main');h.tick();assert.equal(h.requests.length,1);
  h.controller.endMutation('shared');h.tick();assert.equal(h.requests.length,2);await h.finish(1,[{post_id:'main',user_id:'me'}]);
  assert.equal(h.counts.main,1);assert.equal(h.liked.main,true);assert.equal(h.liked.shared,false);
});
test('failed query preserves state and does not loop; next event retries', async () => {
  const h=setup();h.controller.event(insert('main'));h.tick();await h.finish(0,null,{message:'failed'});
  assert.equal(h.counts.main,5);assert.equal(h.errors,1);assert.equal(h.timers.size,0);
  h.controller.event(insert('main'));h.tick();await h.finish(1);assert.equal(h.counts.main,0);
});
test('thrown request handled without clearing state or retry storm', async () => {
  const h=setup();h.controller.event(insert('main'));h.tick();h.requests[0].reject(new Error('offline'));await new Promise(r=>setImmediate(r));assert.equal(h.errors,1);assert.equal(h.counts.main,5);assert.equal(h.timers.size,0);
});
test('user change rejects old response and mutation ownership', async () => {
  const h=setup();h.controller.event(insert('main'));h.tick();h.state.userId='new-user';await h.finish(0);
  assert.equal(h.counts.main,5);assert.equal(h.controller.isCurrent('me'),false);assert.equal(h.controller.isCurrent('new-user'),false);
});
test('unmount cancels timers and ignores pending response', async () => {
  const h=setup();h.controller.event(insert('main'));h.tick();h.controller.dispose();await h.finish(0);assert.equal(h.counts.main,5);assert.equal(h.timers.size,0);
  const queued=setup();queued.controller.event(insert('main'));queued.controller.dispose();queued.tick();assert.equal(queued.requests.length,0);
});
for (const reason of ['hidden','offline']) test(`${reason}: no requests until recovery; in-flight result is deferred`, async () => {
  const h=setup();h.state.canRun=false;h.controller.event(insert('main'));h.tick();assert.equal(h.requests.length,0);
  h.state.canRun=true;h.controller.resume();h.tick();h.state.canRun=false;await h.finish(0);assert.equal(h.counts.main,5);
  h.state.canRun=true;h.controller.resume();h.tick();await h.finish(1);assert.equal(h.counts.main,0);
});
test('removed posts are excluded at application time', async () => {
  const h=setup();h.controller.event(insert('main'));h.tick();h.state.postIds=['shared'];await h.finish(0);assert.equal(h.counts.main,5);
});
test('Dashboard wiring retains non-like routes, fallbacks, notifications and relationship sharing', () => {
  const source=readFileSync(new URL('../app/dashboard/page.tsx',import.meta.url),'utf8');
  for(const table of ['posts','shares','comments','followers','friend_requests','reel_shares','live_streams','blocked_users'])assert.ok(source.includes(`table: "${table}" }, schedulePulseRefresh)`));
  assert.ok(source.includes('table: "likes" }, (payload) => likesReconcilerRef.current?.event(payload))'));
  assert.ok(source.includes('DASHBOARD_BACKGROUND_REFRESH_MS = 120000'));
  assert.ok(source.includes('setInterval(refreshNotificationBadges, 720000)'));
  assert.ok(source.includes('() => requestDashboardRefresh(false)'));
  assert.ok(source.includes('fetchPeopleToDiscover(user.id, blockedIds, relationships)'));
  assert.ok(source.includes('fetchFollowData(user.id, relationships.following)'));
  assert.ok(source.includes('fetchFriendShowcases(user.id, blockedIds, relationships.friendships)'));
  assert.ok(source.includes('...sharedPostItems.map(share => share.post_id)'));
  assert.ok(source.includes('likesReconcilerRef.current?.fullStart()'));
  assert.ok(source.includes('reconciler?.beginMutation(postId)'));
  assert.ok(source.includes('reconciler?.endMutation(postId)'));
});

for (const total of [0, 1, 3, 999, 1000, 1001, 10000, 100000]) {
  test(`exact completeness/fallback at ${total} likes, including user outside returned rows`, async () => {
    const h=setup(); h.controller.event(insert('main')); h.tick();
    const rows=Array.from({length:Math.min(total,1000)},(_,i)=>({post_id:'main',user_id:i===total-1?'me':'other'}));
    await h.finish(0,rows,null,total);
    if(total>1000){assert.equal(h.counts.main,5);assert.equal(h.fallbacks.length,1);h.fallbacks[0].resolve({count:total,liked:true});await new Promise(r=>setImmediate(r));}
    else assert.equal(h.fallbacks.length,0);
    assert.equal(h.counts.main,total);assert.equal(h.liked.main,total>0);assert.equal(h.counts.other,9);
  });
}
test('complete multi-post response avoids fallback',async()=>{
  const h=setup();h.controller.event(insert('main'));h.controller.event(insert('shared'));h.tick();
  await h.finish(0,[{post_id:'main',user_id:'me'},{post_id:'shared',user_id:'other'}]);assert.equal(h.fallbacks.length,0);assert.equal(h.counts.shared,1);assert.equal(h.liked.shared,false);
});
for(const totals of [[1001,1],[1001,10000]])test(`truncated multi-post batch ${totals}: bounded sequential fallback, scoped merges`,async()=>{
  const h=setup();h.controller.event(insert('main'));h.controller.event(insert('shared'));h.tick();await h.finish(0,[{post_id:'main',user_id:'other'}],null,totals[0]+totals[1]);
  assert.equal(h.fallbacks.length,1);h.fallbacks[0].resolve({count:totals[0],liked:true});await new Promise(r=>setImmediate(r));assert.equal(h.fallbacks.length,2);
  h.fallbacks[1].resolve({count:totals[1],liked:false});await new Promise(r=>setImmediate(r));assert.deepEqual(h.counts,{main:totals[0],shared:totals[1],other:9});assert.equal(h.liked.main,true);assert.equal(h.liked.shared,false);
});
test('unknown count cannot prove completeness, exact fallback can prove zero/false',async()=>{
  const h=setup();h.controller.event(insert('main'));h.tick();await h.finish(0,[],null,null);assert.equal(h.counts.main,5);h.fallbacks[0].resolve({count:0,liked:false});await new Promise(r=>setImmediate(r));assert.equal(h.counts.main,0);assert.equal(h.liked.main,false);
});
for(const response of [{count:null,liked:null},{count:1001,liked:null},{count:null,liked:false}])test(`fallback failure preserves each failed value: ${JSON.stringify(response)}`,async()=>{
  const h=setup();h.controller.event(insert('main'));h.tick();await h.finish(0,[],null,1001);h.fallbacks[0].resolve(response);await new Promise(r=>setImmediate(r));
  assert.equal(h.counts.main,response.count??5);assert.equal(h.liked.main,response.liked??true);assert.equal(h.timers.size,0);assert.ok(h.errors>0);
});
test('thrown fallback preserves both values and never retries itself',async()=>{
  const h=setup();h.controller.event(insert('main'));h.tick();await h.finish(0,[],null,1001);h.fallbacks[0].reject(new Error('offline'));await new Promise(r=>setImmediate(r));assert.equal(h.counts.main,5);assert.equal(h.liked.main,true);assert.equal(h.timers.size,0);
});
for(const interruption of ['local','full','user','unmount','hidden','offline'])test(`late exact fallback ignored after ${interruption}`,async()=>{
  const h=setup();h.controller.event(insert('main'));h.tick();await h.finish(0,[],null,1001);
  if(interruption==='local')h.controller.beginMutation('main');
  if(interruption==='full'){h.state.fullLoad=true;h.controller.fullStart();}
  if(interruption==='user')h.state.userId='new';
  if(interruption==='unmount')h.controller.dispose();
  if(['hidden','offline'].includes(interruption))h.state.canRun=false;
  h.fallbacks[0].resolve({count:1001,liked:false});await new Promise(r=>setImmediate(r));assert.equal(h.counts.main,5);assert.equal(h.liked.main,true);
});
test('storm during exact fallback creates only one trailing batch',async()=>{
  const h=setup();h.controller.event(insert('main'));h.tick();await h.finish(0,[],null,1001);
  for(let i=0;i<100;i++)h.controller.event(insert('shared'));h.tick();assert.equal(h.requests.length,1);
  h.fallbacks[0].resolve({count:1001,liked:true});await new Promise(r=>setImmediate(r));assert.equal(h.timers.size,1);h.tick();assert.equal(h.requests.length,2);assert.deepEqual(h.requests[1].ids,['shared']);await h.finish(1);
});

import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { attachReelPlayback } from '../lib/reels/playback.ts';
import { mergeReelRefresh, resolveActiveReel } from '../lib/reels/refresh.ts';

class Video extends EventTarget {
  paused = true;
  muted = true;
  currentTime = 18.5;
  error = null;
  ended = false;
  seeking = false;
  playbackRate = 1;
  readyState = 4;
  plays = 0;
  pauses = 0;
  rejectNextPlay = false;
  play() {
    this.plays++;
    if (this.rejectNextPlay) {
      this.rejectNextPlay = false;
      return Promise.reject(new DOMException('Interrupted by scrolling', 'AbortError'));
    }
    this.paused = false;
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  }
  pause() {
    this.pauses++;
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
}

function setup(t, overrides = {}) {
  const document = new EventTarget();
  document.visibilityState = 'visible';
  const window = new EventTarget();
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  globalThis.document = document;
  globalThis.window = window;
  const videos = { a: new Video(), b: new Video(), c: new Video() };
  let cleanup;
  let options = { videos, activeId: 'b', pausedId: null, blocked: false, muted: true, ...overrides };
  function update(changes = {}) {
    cleanup?.();
    options = { ...options, ...changes };
    cleanup = attachReelPlayback(options);
  }
  update();
  t.after(() => {
    cleanup();
    globalThis.document = oldDocument;
    globalThis.window = oldWindow;
  });
  return { videos, document, window, update, cleanup: () => cleanup() };
}

test('live count updates preserve video order, selected Reel and playhead', (t) => {
  const { videos, update } = setup(t);
  const incoming = [{ id: 'new', likes: 0 }, { id: 'a', likes: 3 }, { id: 'b', likes: 9 }, { id: 'c', likes: 1 }];
  const merged = mergeReelRefresh([{ id: 'a' }, { id: 'b' }, { id: 'c' }], incoming);
  assert.deepEqual(merged.map(r => r.id), ['a', 'b', 'c', 'new']);
  assert.equal(merged[1].likes, 9);
  assert.equal(resolveActiveReel('b', incoming), 'b');
  update();
  assert.equal(videos.b.currentTime, 18.5);
  assert.equal(videos.b.plays, 1);
  assert.equal(videos.b.pauses, 0);
});

test('returning from the background resumes only the active Reel without seeking', (t) => {
  const { videos, document } = setup(t);
  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(videos.b.paused, true);
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(videos.b.paused, false);
  assert.equal(videos.b.currentTime, 18.5);
  assert.equal(videos.a.plays + videos.c.plays, 0);
});

test('page cache restoration resumes playback and cleanup removes listeners', (t) => {
  const { videos, window, cleanup } = setup(t);
  window.dispatchEvent(new Event('pagehide'));
  assert.equal(videos.b.paused, true);
  window.dispatchEvent(new Event('pageshow'));
  assert.equal(videos.b.paused, false);
  cleanup();
  videos.b.pause();
  window.dispatchEvent(new Event('pageshow'));
  videos.b.dispatchEvent(new Event('canplay'));
  assert.equal(videos.b.paused, true);
});

test('manual pause and open overlays survive live updates and readiness events', (t) => {
  const { videos, window, update } = setup(t);
  for (const changes of [{ pausedId: 'b' }, { pausedId: null, blocked: true }]) {
    update(changes);
    videos.b.dispatchEvent(new Event('canplay'));
    window.dispatchEvent(new Event('pageshow'));
    window.dispatchEvent(new Event('online'));
    assert.equal(videos.b.paused, true);
  }
  update({ blocked: false });
  assert.equal(videos.b.paused, false);
});

test('an interrupted play is retried when ready, without starting offscreen videos', async (t) => {
  const { videos, update } = setup(t);
  videos.c.rejectNextPlay = true;
  update({ activeId: 'c' });
  await Promise.resolve();
  assert.equal(videos.c.paused, true);
  videos.c.dispatchEvent(new Event('canplay'));
  assert.equal(videos.c.paused, false);
  assert.equal(videos.b.paused, true);
  // A delayed browser play from the previous Reel must not start it again.
  await videos.b.play();
  assert.equal(videos.b.paused, true);
});

test('successful removal clears missing Reels instead of preserving stale media', () => {
  assert.deepEqual(mergeReelRefresh([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }]), [{ id: 'b' }]);
  assert.equal(resolveActiveReel('a', [{ id: 'b' }]), 'b');
  assert.equal(resolveActiveReel('b', []), '');
  assert.equal(resolveActiveReel('', [{ id: 'a' }, { id: 'b' }], 'b'), 'b');
});

test('an unexpected foreground pause resumes the active Reel at its existing playhead', async (t) => {
  const { videos } = setup(t);
  videos.b.pause();
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(videos.b.paused, false);
  assert.equal(videos.b.plays, 2);
  assert.equal(videos.b.currentTime, 18.5);
  assert.equal(videos.a.plays + videos.c.plays, 0);
});

test('pending pause recovery respects manual pause, overlays, scrolling and cleanup', async (t) => {
  const { videos, update, cleanup } = setup(t);
  for (const changes of [{ pausedId: 'b' }, { blocked: true }, { activeId: 'c' }]) {
    update({ activeId: 'b', pausedId: null, blocked: false });
    videos.b.pause();
    update(changes);
    const plays = videos.b.plays;
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(videos.b.paused, true);
    assert.equal(videos.b.plays, plays);
  }
  update({ activeId: 'b' });
  videos.b.pause();
  cleanup();
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(videos.b.paused, true);
});

test('pause recovery does not play in the background or loop on playback rejection', async (t) => {
  const { videos, document } = setup(t);
  videos.b.pause();
  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(videos.b.paused, true);
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  videos.b.rejectNextPlay = true;
  videos.b.pause();
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(videos.b.paused, true);
  assert.equal(videos.b.plays, 3);
});


function clock(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('advancing playback never triggers recovery', async t => {
  clock(t); const h = setup(t);
  for (let i=0;i<30;i++) { h.videos.b.currentTime += 2; t.mock.timers.tick(2000); await flush(); }
  assert.equal(h.videos.b.plays,1); assert.equal(h.videos.b.pauses,0);
});
for (const event of ['waiting','stalled','suspend','silent']) test(`${event}: frozen buffered active Reel recovers without seeking, at most twice`, async t => {
  clock(t); const h=setup(t); await flush();
  if(event!=='silent')h.videos.b.dispatchEvent(new Event(event));
  for(let i=0;i<20;i++){t.mock.timers.tick(2000); await flush();}
  assert.equal(h.videos.b.plays,3); assert.equal(h.videos.b.currentTime,18.5);
  assert.equal(h.videos.a.plays+h.videos.c.plays,0);
  h.update(); await flush(); t.mock.timers.tick(20000); await flush();
  assert.equal(h.videos.b.plays,3); // Count refresh cannot replenish exhausted budget.
});
test('slow buffering waits for data; actual advancement replenishes recovery budget', async t => {
  clock(t);const h=setup(t);await flush();h.videos.b.readyState=2;
  for(let i=0;i<20;i++){t.mock.timers.tick(2000);await flush();}
  assert.equal(h.videos.b.plays,1);
  h.videos.b.readyState=4;t.mock.timers.tick(2000);await flush();assert.equal(h.videos.b.plays,2);
  h.videos.b.currentTime=22;h.videos.b.dispatchEvent(new Event('timeupdate'));
  t.mock.timers.tick(2000);assert.equal(h.videos.b.plays,2);
});
for(const mode of ['manual','overlay','hidden','ended','inactive','unmount','seeking','zero-rate'])test(`${mode} suppresses watchdog`,async t=>{
  clock(t);const h=setup(t);await flush();
  if(mode==='manual')h.update({pausedId:'b'});
  if(mode==='overlay')h.update({blocked:true});
  if(mode==='hidden'){h.document.visibilityState='hidden';h.document.dispatchEvent(new Event('visibilitychange'));}
  if(mode==='ended'){h.videos.b.ended=true;h.videos.b.pause();h.videos.b.dispatchEvent(new Event('ended'));}
  if(mode==='inactive')h.update({activeId:'c'});
  if(mode==='unmount')h.cleanup();
  if(mode==='seeking')h.videos.b.seeking=true;
  if(mode==='zero-rate')h.videos.b.playbackRate=0;
  const before=h.videos.b.plays;
  for(let i=0;i<12;i++){t.mock.timers.tick(2000);await flush();}
  assert.equal(h.videos.b.plays,before);
});
test('rapid swipes and returning preserve time and leave only the active video playing',async t=>{
  clock(t);const h=setup(t);
  for(const id of ['a','c','b','c','b']){h.update({activeId:id});await flush();}
  assert.equal(h.videos.b.paused,false);assert.equal(h.videos.a.paused,true);assert.equal(h.videos.c.paused,true);
  assert.equal(h.videos.b.currentTime,18.5);
});
for(const event of ['focus','pageshow','online'])test(`${event} recovers a missed pause without seeking`,async t=>{
  clock(t);const h=setup(t);await flush();h.videos.b.paused=true;
  h.window.dispatchEvent(new Event(event));await flush();assert.equal(h.videos.b.paused,false);
});
test('pending play promises are not duplicated by watchdog or readiness events',async t=>{
  clock(t);const h=setup(t);await flush();h.videos.b.paused=true;
  let resolve;h.videos.b.play=()=>{h.videos.b.plays++;return new Promise(r=>{resolve=r;});};
  h.window.dispatchEvent(new Event('focus'));
  for(let i=0;i<10;i++){h.videos.b.dispatchEvent(new Event('canplay'));t.mock.timers.tick(2000);await flush();}
  assert.equal(h.videos.b.plays,2);resolve();await flush();
});
test('IntersectionObserver visibility gates recovery independent of device width and disconnects',async t=>{
  clock(t);const old=globalThis.IntersectionObserver;let callback,disconnected=0;
  globalThis.IntersectionObserver=class {constructor(cb,options){callback=cb;assert.deepEqual(options.threshold,[0,0.5]);}observe(){}disconnect(){disconnected++;}};
  t.after(()=>{globalThis.IntersectionObserver=old;});
  const h=setup(t);assert.equal(h.videos.b.plays,0);
  callback([{isIntersecting:true,intersectionRatio:0.8}]);await flush();assert.equal(h.videos.b.plays,1);
  h.update();assert.equal(h.videos.b.pauses,0); // count-only effect reattachment
  callback([{isIntersecting:true,intersectionRatio:0.2}]);assert.equal(h.videos.b.paused,true);
  for(let i=0;i<8;i++){t.mock.timers.tick(2000);await flush();}assert.equal(h.videos.b.plays,1);
  callback([{isIntersecting:true,intersectionRatio:0.7}]);await flush();assert.equal(h.videos.b.plays,2);
  h.cleanup();assert.ok(disconnected>=2);
});

test('rejected watchdog play is bounded and does not cascade into pause recovery',async t=>{
  clock(t);const h=setup(t);await flush();
  h.videos.b.play=()=>{h.videos.b.plays++;return Promise.reject(new DOMException('Denied','NotAllowedError'));};
  for(let i=0;i<30;i++){t.mock.timers.tick(2000);await flush();}
  assert.equal(h.videos.b.plays,3);assert.equal(h.videos.b.paused,true);
});
test('route exit records pause intent and hook retains unmount pause',()=>{
  const page=readFileSync(new URL('../app/reels/page.tsx',import.meta.url),'utf8');
  assert.match(page,/const prepareReelsRouteExit = \(\) => \{[\s\S]*?setHoldPausedId\(activeReelId\)/);
  const hook=readFileSync(new URL('../components/reels/useReelPlayback.ts',import.meta.url),'utf8');
  assert.ok(hook.includes('video?.pause()'));
});

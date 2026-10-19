import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { attachReelPlayback, setReelPlaybackIntent } from '../lib/reels/playback.ts';
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
  loads = 0;
  isConnected = true;
  load() { this.loads++; this.error = null; this.paused = true; }
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
  const videos = overrides.videos || { a: new Video(), b: new Video(), c: new Video() };
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

test('returning from the background resumes only the active Reel without seeking', async (t) => {
  const { videos, document } = setup(t);
  await flush();
  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(videos.b.paused, true);
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(videos.b.paused, false);
  assert.equal(videos.b.currentTime, 18.5);
  assert.equal(videos.a.plays + videos.c.plays, 0);
});

test('page cache restoration resumes playback and cleanup removes listeners', async (t) => {
  const { videos, window, cleanup } = setup(t);
  await flush();
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

test('manual pause and open overlays survive live updates and readiness events', async (t) => {
  const { videos, window, update } = setup(t);
  await flush();
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
  clock(t);
  const { videos, update } = setup(t);
  videos.c.rejectNextPlay = true;
  update({ activeId: 'c' });
  await Promise.resolve();
  assert.equal(videos.c.paused, true);
  videos.c.dispatchEvent(new Event('canplay'));
  t.mock.timers.tick(300);
  await flush();
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
  await new Promise(resolve => setTimeout(resolve, 350));
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
test('low readiness receives bounded state recovery without a media reload', async t => {
  clock(t); const h = setup(t); await flush(); h.videos.b.readyState = 2;
  for (let i = 0; i < 20; i++) { t.mock.timers.tick(2000); await flush(); }
  assert.equal(h.videos.b.plays, 3);
  assert.equal(h.videos.b.loads, 0);
  h.videos.b.currentTime = 22;
  h.videos.b.dispatchEvent(new Event('timeupdate'));
  for (let i = 0; i < 4; i++) { t.mock.timers.tick(2000); await flush(); }
  assert.equal(h.videos.b.plays, 4); // genuine progress replenishes the budget
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

test('visible active Reel can start before the first delayed IntersectionObserver callback', async t => {
  const oldIntersectionObserver = globalThis.IntersectionObserver;
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  let callback;

  globalThis.IntersectionObserver = class {
    constructor(cb, options) {
      callback = cb;
      assert.deepEqual(options.threshold, [0, 0.5]);
    }
    observe() {}
    disconnect() {}
  };

  const document = new EventTarget();
  document.visibilityState = 'visible';
  document.documentElement = {
    clientWidth: 1280,
    clientHeight: 800,
  };

  const window = new EventTarget();
  window.innerWidth = 1280;
  window.innerHeight = 800;

  globalThis.document = document;
  globalThis.window = window;

  const video = new Video();
  video.getBoundingClientRect = () => ({
    top: 80,
    bottom: 720,
    left: 320,
    right: 680,
    width: 360,
    height: 640,
  });

  const cleanup = attachReelPlayback({
    videos: { b: video },
    activeId: 'b',
    pausedId: null,
    blocked: false,
    muted: true,
  });

  t.after(() => {
    cleanup();
    globalThis.IntersectionObserver = oldIntersectionObserver;
    globalThis.document = oldDocument;
    globalThis.window = oldWindow;
  });

  await Promise.resolve();

  // The Reel is already fully within the viewport. Playback must not depend
  // entirely on a later IntersectionObserver callback arriving.
  assert.equal(video.plays, 1);
  assert.equal(video.paused, false);

  // Once the observer reports that the active Reel is mostly offscreen,
  // the existing visibility safety gate must still pause it.
  callback([{ isIntersecting: true, intersectionRatio: 0.2 }]);
  assert.equal(video.paused, true);
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
  assert.equal(h.videos.b.plays,2);assert.equal(h.videos.b.paused,true);
});
test('route exit records pause intent and hook retains unmount pause',()=>{
  const page=readFileSync(new URL('../app/reels/page.tsx',import.meta.url),'utf8');
  assert.match(page,/const prepareReelsRouteExit = \(\) => \{[\s\S]*?setHoldPausedId\(activeReelId\)/);
  const hook=readFileSync(new URL('../components/reels/useReelPlayback.ts',import.meta.url),'utf8');
  assert.ok(hook.includes('video?.pause()'));
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function advance(t, milliseconds) {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 100) {
    t.mock.timers.tick(100);
    await flush();
  }
}

test('three consecutive interrupted Reels recover without canplay or a swipe back', async t => {
  clock(t); const h = setup(t); await flush();
  for (const id of ['a', 'c', 'b']) {
    h.videos[id].rejectNextPlay = true;
    h.update({ activeId: id });
    await flush();
    assert.equal(h.videos[id].paused, true);
    await advance(t, 400);
    assert.equal(h.videos[id].paused, false);
    assert.equal(h.videos[id].loads, 0);
    for (const other of Object.keys(h.videos).filter(key => key !== id)) assert.equal(h.videos[other].paused, true);
  }
});

for (const name of ['AbortError', 'NetworkError', 'UnknownError']) {
  test(`${name} retries are bounded even through readiness events and effect reattachment`, async t => {
    clock(t); const issues = []; const h = setup(t, { onIssue: (id, issue) => issues.push([id, issue]) });
    await flush();
    h.videos.c.play = () => { h.videos.c.plays++; return Promise.reject(new DOMException('Failure', name)); };
    h.update({ activeId: 'c' }); await flush();
    for (let i = 0; i < 20; i++) {
      h.videos.c.dispatchEvent(new Event('canplay'));
      await advance(t, 400);
      h.update();
    }
    assert.equal(h.videos.c.plays, 3);
    assert.equal(h.videos.c.loads, 0);
    assert.equal(issues.at(-1)[1], name === 'AbortError' ? 'interrupted' : name === 'NetworkError' ? 'network' : 'temporary');
  });
}

test('synchronous play exceptions use the same bounded recovery', async t => {
  clock(t); const h = setup(t); await flush();
  h.videos.c.play = () => { h.videos.c.plays++; throw new DOMException('Interrupted', 'AbortError'); };
  h.update({ activeId: 'c' });
  await advance(t, 3000);
  assert.equal(h.videos.c.plays, 3);
});

test('pending startup survives pause events without overlapping requests; timeout offers explicit retry', async t => {
  clock(t); const issues = []; const h = setup(t, { onIssue: (id, issue) => issues.push([id, issue]) });
  await flush();
  const first = deferred(), second = deferred();
  h.videos.c.play = () => { h.videos.c.plays++; return h.videos.c.plays === 1 ? first.promise : second.promise; };
  h.update({ activeId: 'c' });
  h.videos.c.dispatchEvent(new Event('pause'));
  await advance(t, 13000);
  assert.equal(h.videos.c.plays, 1);
  assert.equal(h.videos.c.loads, 0);
  assert.equal(issues.at(-1)[1], 'loading');
  setReelPlaybackIntent(h.videos.c, false, true);
  assert.equal(h.videos.c.loads, 1);
  assert.equal(h.videos.c.plays, 2);
  first.reject(new DOMException('Old source aborted', 'AbortError'));
  await flush();
  h.videos.c.dispatchEvent(new Event('canplay'));
  await advance(t, 500);
  assert.equal(h.videos.c.plays, 2); // old settlement cannot clear the new token
  second.resolve(); await flush();
});

test('a pending rejection is reconciled by the newest active attachment', async t => {
  clock(t); const h = setup(t); await flush(); const pending = deferred();
  h.videos.c.play = () => { h.videos.c.plays++; return pending.promise; };
  h.update({ activeId: 'c' });
  h.update({ activeId: 'a' });
  h.update({ activeId: 'c' });
  h.videos.c.play = Video.prototype.play;
  pending.reject(new DOMException('Scroll interrupted', 'AbortError'));
  await flush(); await advance(t, 400);
  assert.equal(h.videos.c.plays, 2);
  assert.equal(h.videos.c.paused, false);
  assert.equal(h.videos.a.paused, true);
});

for (const mode of ['inactive', 'manual', 'overlay', 'hidden', 'unmount']) {
  test(`late play success cannot override ${mode}`, async t => {
    clock(t); const h = setup(t); await flush(); const pending = deferred();
    h.videos.c.play = () => { h.videos.c.plays++; return pending.promise; };
    h.update({ activeId: 'c' });
    if (mode === 'inactive') h.update({ activeId: 'a' });
    if (mode === 'manual') h.update({ pausedId: 'c' });
    if (mode === 'overlay') h.update({ blocked: true });
    if (mode === 'hidden') { h.document.visibilityState = 'hidden'; h.document.dispatchEvent(new Event('visibilitychange')); }
    if (mode === 'unmount') { h.videos.c.isConnected = false; h.cleanup(); }
    h.videos.c.paused = false;
    pending.resolve(); await flush(); await advance(t, 1000);
    assert.equal(h.videos.c.paused, true);
    assert.equal(h.videos.c.plays, 1);
  });
}

for (const name of ['NotAllowedError', 'NotSupportedError']) {
  test(`${name} stops autoplay retries and exposes a specific explanation`, async t => {
    clock(t); const issues = []; const h = setup(t, { muted: false, onIssue: (id, issue) => issues.push([id, issue]) });
    await flush();
    h.videos.c.play = () => { h.videos.c.plays++; return Promise.reject(new DOMException('Denied', name)); };
    h.update({ activeId: 'c' }); await flush(); await advance(t, 30000);
    assert.equal(h.videos.c.plays, 1);
    assert.equal(issues.at(-1)[1], name === 'NotAllowedError' ? 'policy' : 'unsupported');
    h.videos.c.play = Video.prototype.play;
    setReelPlaybackIntent(h.videos.c, false, true);
    assert.equal(h.videos.c.plays, name === 'NotAllowedError' ? 2 : 1);
    assert.equal(h.videos.c.loads, 0);
    assert.equal(h.videos.c.muted, false);
  });
}

for (const [code, reason] of [[2, 'network'], [3, 'decode'], [4, 'unsupported']]) {
  test(`media error ${code} is surfaced without automatic downloads`, async t => {
    clock(t); const issues = []; const h = setup(t, { onIssue: (id, issue) => issues.push([id, issue]) }); await flush();
    h.videos.b.error = { code };
    h.videos.b.dispatchEvent(new Event('error'));
    await advance(t, 30000);
    assert.equal(issues.at(-1)[1], reason);
    assert.equal(h.videos.b.plays, 1);
    assert.equal(h.videos.b.loads, 0);
    setReelPlaybackIntent(h.videos.b, false, true);
    assert.equal(h.videos.b.loads, code === 4 ? 0 : 1);
    assert.equal(h.videos.b.plays, code === 4 ? 1 : 2);
  });
}

test('explicit pause intent blocks queued recovery before React commits; resume preserves sound and position', async t => {
  clock(t); const h = setup(t, { muted: false }); await flush();
  h.videos.b.pause();
  setReelPlaybackIntent(h.videos.b, true);
  await advance(t, 1000);
  assert.equal(h.videos.b.plays, 1);
  h.update({ pausedId: 'b' });
  setReelPlaybackIntent(h.videos.b, false);
  assert.equal(h.videos.b.paused, false);
  assert.equal(h.videos.b.muted, false);
  assert.equal(h.videos.b.currentTime, 18.5);
  assert.equal(h.videos.b.loads, 0);
});

test('user retry cannot start inactive, hidden, or overlay-blocked videos', async t => {
  clock(t); const h = setup(t); await flush();
  setReelPlaybackIntent(h.videos.a, false, true);
  h.update({ blocked: true }); setReelPlaybackIntent(h.videos.b, false, true);
  h.document.visibilityState = 'hidden'; h.update({ blocked: false });
  setReelPlaybackIntent(h.videos.b, false, true);
  assert.equal(h.videos.a.plays, 0);
  assert.equal(h.videos.b.plays, 1);
  assert.equal(h.videos.b.loads, 0);
});

class FrameVideo extends Video {
  callbacks = new Map();
  nextFrame = 0;
  requestVideoFrameCallback(callback) { const id = ++this.nextFrame; this.callbacks.set(id, callback); return id; }
  cancelVideoFrameCallback(id) { this.callbacks.delete(id); }
  present() {
    const callbacks = [...this.callbacks.values()]; this.callbacks.clear();
    callbacks.forEach(callback => callback());
  }
}

test('advancing time without presented frames exposes recovery, and unmount cancels frame observation', async t => {
  clock(t); const issues = []; const video = new FrameVideo();
  const h = setup(t, { videos: { b: video }, onIssue: (id, issue) => issues.push([id, issue]) }); await flush();
  for (let i = 0; i < 7; i++) { video.currentTime += 2; await advance(t, 2000); }
  assert.equal(issues.at(-1)[1], 'frames');
  assert.equal(video.plays, 1);
  assert.equal(video.loads, 0);
  video.present();
  assert.equal(issues.at(-1)[1], null); // browser recovery removes stale UI
  h.cleanup();
  assert.equal(video.callbacks.size, 0);
});

test('healthy presented frames and count updates do not restart or reload video', async t => {
  clock(t); const video = new FrameVideo(); const h = setup(t, { videos: { b: video } }); await flush();
  for (let i = 0; i < 30; i++) {
    video.currentTime += 2; video.present(); h.update(); await advance(t, 2000);
  }
  assert.equal(video.plays, 1);
  assert.equal(video.pauses, 0);
  assert.equal(video.loads, 0);
  assert.equal(video.callbacks.size, 1);
});

test('detached video ignores stale readiness, error, and frame events after cleanup', async t => {
  clock(t); const issues = []; const video = new FrameVideo(); const h = setup(t, { videos: { b: video }, onIssue: (id, issue) => issues.push([id, issue]) }); await flush();
  h.cleanup(); video.isConnected = false; video.pause(); const count = issues.length;
  for (const event of ['canplay', 'error', 'pause', 'waiting']) video.dispatchEvent(new Event(event));
  await advance(t, 30000);
  assert.equal(video.plays, 1);
  assert.equal(video.callbacks.size, 0);
  assert.equal(issues.length, count);
});

for (const visible of [true, false]) {
  test(`batched visibility uses latest sample (${visible})`, async t => {
    const old = globalThis.IntersectionObserver;
    let callback;
    globalThis.IntersectionObserver = class {
      constructor(cb) { callback = cb; }
      observe() {}
      disconnect() {}
    };
    t.after(() => { globalThis.IntersectionObserver = old; });
    const h = setup(t);
    callback([{ time: 1, isIntersecting: true, intersectionRatio: 0.8 }]);
    await flush();
    callback([
      { time: 2, isIntersecting: !visible, intersectionRatio: visible ? 0 : 0.8 },
      { time: 3, isIntersecting: visible, intersectionRatio: visible ? 0.8 : 0 },
    ]);
    await flush();
    assert.equal(h.videos.b.paused, !visible);
  });
}

test('backward navigation pauses the previous video BEFORE starting the next', async t => {
  const h = setup(t); await flush();
  h.videos.a.play = function () {
    assert.equal(h.videos.b.paused, true, 'previous Reel must already be paused');
    return Video.prototype.play.call(this);
  };
  h.update({ activeId: 'a' }); await flush();
  assert.equal(h.videos.a.paused, false);
});

test('switching to muted playback clears only an obsolete policy denial', async t => {
  clock(t);
  const video = new Video();
  video.play = function () {
    if (!this.muted) { this.plays++; return Promise.reject(new DOMException('Denied', 'NotAllowedError')); }
    return Video.prototype.play.call(this);
  };
  const h = setup(t, { videos: { b: video }, muted: false }); await flush();
  h.update({ muted: true }); await flush();
  assert.equal(video.paused, false);
  assert.equal(video.loads, 0);
});

test('late successful startup clears timeout and allows future foreground resume', async t => {
  clock(t); const h = setup(t); await flush(); const pending = deferred();
  h.videos.c.play = () => { h.videos.c.plays++; return pending.promise; };
  h.update({ activeId: 'c' });
  await advance(t, 13000);
  h.videos.c.play = Video.prototype.play;
  pending.resolve(); await flush(); await advance(t, 400);
  assert.equal(h.videos.c.paused, false);
  assert.equal(h.videos.c.loads, 0);
});

test('late play success after controller disposal pauses even a still-connected node', async t => {
  const h = setup(t); await flush(); const pending = deferred();
  h.videos.c.play = () => pending.promise;
  h.update({ activeId: 'c' }); h.cleanup();
  h.videos.c.paused = false;
  pending.resolve(); await flush();
  assert.equal(h.videos.c.paused, true);
});

for (const reason of ['NotAllowedError', 'NotSupportedError']) {
  test(`muted ${reason} stays bounded across count refreshes`, async t => {
    clock(t); const video = new Video();
    video.play = () => { video.plays++; return Promise.reject(new DOMException('Denied', reason)); };
    const h = setup(t, { videos: { b: video } }); await flush();
    for (let i = 0; i < 5; i++) { h.update(); await advance(t, 4000); }
    assert.equal(video.plays, 1);
    assert.equal(video.loads, 0);
  });
}

test('successful late startup while inactive removes timeout before returning', async t => {
  clock(t); const h = setup(t); await flush(); const pending = deferred();
  h.videos.c.play = () => { h.videos.c.plays++; return pending.promise; };
  h.update({ activeId: 'c' }); await advance(t, 13000);
  h.update({ activeId: 'a' });
  h.videos.c.paused = false; pending.resolve(); await flush();
  assert.equal(h.videos.c.paused, true);
  h.videos.c.play = Video.prototype.play;
  h.update({ activeId: 'c' }); await flush();
  assert.equal(h.videos.c.paused, false);
  assert.equal(h.videos.c.loads, 0);
});

test('newest visibility is selected by timestamp even for an unordered batch', async t => {
  const old = globalThis.IntersectionObserver; let callback;
  globalThis.IntersectionObserver = class {
    constructor(cb) { callback = cb; }
    observe() {}
    disconnect() {}
  };
  t.after(() => { globalThis.IntersectionObserver = old; });
  const h = setup(t);
  callback([
    { time: 30, isIntersecting: true, intersectionRatio: 0.8 },
    { time: 10, isIntersecting: false, intersectionRatio: 0 },
    { time: 20, isIntersecting: false, intersectionRatio: 0 },
  ]);
  await flush(); assert.equal(h.videos.b.paused, false);
});

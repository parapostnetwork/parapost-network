import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachReelPlayback } from '../lib/reels/playback.ts';
import { mergeReelRefresh, resolveActiveReel } from '../lib/reels/refresh.ts';

class Video extends EventTarget {
  paused = true;
  muted = true;
  currentTime = 18.5;
  error = null;
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
  pause() { this.pauses++; this.paused = true; }
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

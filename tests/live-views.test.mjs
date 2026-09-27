import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { livePlayerUrl, observeYouTubePlayback } from '../lib/live/youtube-player.ts';

test('YouTube embeds enable playback events and preserve video identity and parameters', () => {
  const original = 'https://www.youtube.com/embed/abcdefghijk?rel=0';
  const url = new URL(livePlayerUrl(original, 'https://parapost.net'));
  assert.equal(url.pathname, '/embed/abcdefghijk');
  assert.equal(url.searchParams.get('rel'), '0');
  assert.equal(url.searchParams.get('enablejsapi'), '1');
  assert.equal(url.searchParams.get('origin'), 'https://parapost.net');
  assert.equal(livePlayerUrl('https://player.twitch.tv/?channel=test'), 'https://player.twitch.tv/?channel=test');
});

test('SDK observation tracks actual playing, reuses iframe player, and cleans up subscriptions', async () => {
  let state = 2, options, constructions = 0, notifications = 0;
  const timers = new Map();
  globalThis.document = { visibilityState: 'visible' };
  globalThis.window = {
    YT: { Player: class { constructor(frame, opts) { constructions++; options = opts; } getPlayerState() { return state; } } },
    setInterval(fn) { const id = timers.size + 1; timers.set(id, fn); return id; },
    clearInterval(id) { timers.delete(id); },
  };
  const frame = { isConnected: true };
  let stop = observeYouTubePlayback(frame, () => notifications++);
  await Promise.resolve();
  options.events.onReady();
  options.events.onStateChange({ data: 2 });
  assert.equal(notifications, 0);
  state = 1; options.events.onStateChange({ data: 1 });
  assert.equal(notifications, 1);
  stop();
  options.events.onStateChange({ data: 1 });
  assert.equal(notifications, 1);
  assert.equal(timers.size, 0);
  stop = observeYouTubePlayback(frame, () => notifications++);
  await Promise.resolve();
  assert.equal(constructions, 1);
  assert.equal(notifications, 2); // Already-playing attachment must count too.
  stop();
  delete globalThis.document; delete globalThis.window;
});

test('counter waits for playback, retries a rejected count, and counts only once per mount', async () => {
  let effect, playing, writes = 0, recorded = 0;
  const refs = [];
  const source = readFileSync(new URL('../components/live/LiveStreamViewCount.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  class Frame { src = 'https://www.youtube.com/embed/abcdefghijk'; }
  const frame = new Frame();
  const context = {
    exports: {}, HTMLIFrameElement: Frame, URL,
    document: { getElementById: () => frame },
    require(name) {
      if (name === 'react') return {
        useState: () => [recorded, value => { recorded = value; }],
        useRef: value => { const ref = { current: value }; refs.push(ref); return ref; },
        useEffect: fn => { effect = fn; },
      };
      if (name === 'react/jsx-runtime') return { jsxs: (tag, props) => ({ tag, props }) };
      if (name.includes('youtube-player')) return { observeYouTubePlayback: (_, fn) => { playing = fn; return () => {}; } };
      if (name.includes('supabase')) return { supabase: { rpc: async () => ({ data: ++writes === 1 ? 0 : 8, error: null }) } };
      throw new Error(name);
    },
  };
  vm.runInNewContext(code, context);
  context.exports.default({ streamId: 'show', initialViews: 7, playerElementId: 'player' });
  effect();
  assert.equal(writes, 0);
  playing(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(recorded, 0);
  playing(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(recorded, 8);
  playing(); playing(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes, 2);
  // Refreshed server totals are displayed even after this viewer has counted.
  const rendered = context.exports.default({ streamId: 'show', initialViews: 12, playerElementId: 'player' });
  assert.equal(rendered.props.children[0], '12');
});

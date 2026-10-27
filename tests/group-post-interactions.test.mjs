import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual React component's handlers against an in-memory transport.
// No credentials, remote fetches, database records or storage writes are used.
function harness({ canInteract = true, canShare = true, failShare = false } = {}) {
  const state = [], effects = [], calls = [];
  let cursor = 0, tree;
  const stats = { comments: [], comments_limited: false, liked: false, like_count: 0, comment_count: 0 };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    useRef: () => ({ current: {} }), useCallback: fn => fn,
    useEffect: fn => effects.push(fn),
  };
  const source = ts.transpileModule(readFileSync(new URL('../app/groups/GroupPostActions.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const componentModule = { exports: {} };
  const styles = new Proxy({}, { get: (_, key) => key });
  vm.runInNewContext(source, { module: componentModule, exports: componentModule.exports, React,
    IntersectionObserver: class { constructor(callback) { this.callback = callback; } observe() { this.callback([{ isIntersecting: true }]); } disconnect() {} },
    require: name => name === 'react' ? React : name.endsWith('.css') ? { __esModule: true, default: styles }
      : name === '@/lib/supabase' ? { supabase: { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) } }
      : name === './PostIdentity' ? { PostAvatar: 'avatar', profileName: () => 'Member' }
      : name === 'next/link' ? { __esModule: true, default: 'a' } : {},
  });
  const props = { groupId: 'group', postId: 'post', canInteract, canShare,
    read: async () => ({ json: async () => structuredClone(stats) }),
    action: async (action, group, payload) => {
      calls.push({ action, group, payload });
      if (action === 'share_post') { if (failShare) throw Error('Denied'); return { id: 'share' }; }
      if (action === 'like' || action === 'unlike') { stats.liked = action === 'like'; stats.like_count = stats.liked ? 1 : 0; }
      if (action === 'comment' || action === 'reply') { stats.comments.push({ id: String(stats.comments.length + 1), author_id: 'member', parent_id: payload.parent_id ?? null, content: payload.content, created_at: '2026-10-23T12:00:00Z', liked: false, like_count: 0 }); stats.comment_count++; }
      if (action === 'like_comment' || action === 'unlike_comment') { const comment = stats.comments.find(c => c.id === payload.parent_id); comment.liked = action === 'like_comment'; comment.like_count = comment.liked ? 1 : 0; }
      return {};
    },
  };
  const render = () => { cursor = 0; effects.length = 0; tree = componentModule.exports.default(props); return tree; };
  const all = (node = tree) => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(child => all(child ?? null)) : [node, ...all(node.props?.children ?? null)];
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node?.props?.children ?? '');
  const find = (type, label) => all().find(node => node.type === type && (node.props['aria-label'] === label || text(node).trim() === label));
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  render(); effects.slice().forEach(effect => effect());
  return { calls, stats, render, flush, find, all, text: () => text(tree) };
}

test('post Likes reconcile counts on like and unlike', async () => {
  const h = harness(); await h.flush();
  h.find('button', 'Like post').props.onClick(); await h.flush();
  assert.equal(h.stats.like_count, 1); assert.equal(h.find('button', 'Unlike post').props['aria-pressed'], true);
  h.find('button', 'Unlike post').props.onClick(); await h.flush(); assert.equal(h.stats.like_count, 0);
});

test('comments, parented replies and comment/reply Likes use the existing Group commands', async () => {
  const h = harness(); await h.flush(); h.find('button', 'Show comments').props.onClick(); h.render();
  h.find('textarea', 'Write a comment').props.onChange({ target: { value: 'A comment' } }); h.render();
  await h.all().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); h.render();
  h.find('button', 'Reply').props.onClick(); h.render();
  h.find('textarea', 'Write a reply').props.onChange({ target: { value: 'A reply' } }); h.render();
  await h.all().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); h.render();
  assert.equal(h.stats.comments[1].parent_id, h.stats.comments[0].id);
  for (let index = 0; index < 2; index++) {
    h.all().filter(n => n.props?.['aria-label'] === 'Like comment')[index].props.onClick(); await h.flush();
    assert.equal(h.stats.comments[index].like_count, 1);
    h.find('button', 'Unlike comment').props.onClick(); await h.flush();
    assert.equal(h.stats.comments[index].like_count, 0);
  }
});

test('public sharing sends only share_post, preserves caption and confirms both destinations', async () => {
  const h = harness(); await h.flush();
  h.find('button', 'Share Group post to Dashboard and your Profile').props.onClick(); h.render();
  h.find('textarea', 'Share caption').props.onChange({ target: { value: 'Worth reading' } }); h.render();
  h.find('button', 'Share post'); await h.all().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await h.flush();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].action, 'share_post');
  assert.equal(h.calls[0].payload.caption, 'Worth reading'); assert.equal(h.stats.comments.length, 0);
  assert.match(h.text(), /Shared to Dashboard and your Profile/);
});

test('denied shares do not show success; private posts have no Share control', async () => {
  const h = harness({ failShare: true }); await h.flush();
  h.find('button', 'Share Group post to Dashboard and your Profile').props.onClick(); h.render();
  h.all().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await h.flush();
  assert.match(h.text(), /Unable to share/); assert.doesNotMatch(h.text(), /Shared to Dashboard/);
  const privatePost = harness({ canShare: false }); await privatePost.flush();
  assert.equal(privatePost.find('button', 'Share Group post to Dashboard and your Profile'), undefined);
  const visitor = harness({ canInteract: false, canShare: false }); await visitor.flush();
  assert.equal(visitor.find('button', 'Like post').props.disabled, true);
});

test('Hide collapses comments and reopening preserves a draft and saved replies', async () => {
  const h = harness(); await h.flush(); h.find('button', 'Show comments').props.onClick(); h.render();
  h.find('textarea', 'Write a comment').props.onChange({ target: { value: 'Keep this draft' } }); h.render();
  h.find('button', 'Hide').props.onClick(); h.render();
  assert.equal(h.find('textarea', 'Write a comment'), undefined);
  h.find('button', 'Show comments').props.onClick(); h.render();
  assert.equal(h.find('textarea', 'Write a comment').props.value, 'Keep this draft');
  assert.equal(h.calls.length, 0);
});

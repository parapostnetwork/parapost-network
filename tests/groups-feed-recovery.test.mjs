import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Actual hooks/components, isolated transports and browser events. Never contacts a service.
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function load(path, modules = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require: name => { assert.ok(name in modules, `Missing mock: ${name}`); return modules[name]; }, AbortController, Event, CustomEvent, queueMicrotask, console, ...globals });
  return exports;
}
function hooks() {
  let cursor = 0, effectQueue = [], renderFn;
  const slots = [], cleanups = [];
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (changed(slots[i], deps)) { slots[i] = deps; effectQueue.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } },
  };
  const window = Object.assign(new EventTarget(), { setInterval: () => 1, clearInterval() {}, confirm: () => true });
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible', body: {} });
  const jsx = (type, props) => ({ type, props });
  return {
    react, window, document, jsx,
    render(fn = renderFn) { renderFn = fn; cursor = 0; const result = fn(); const effects = effectQueue; effectQueue = []; effects.forEach(fn => fn()); return result; },
    async flush() { let result; for (let i = 0; i < 4; i++) { await tick(); result = this.render(); } return result; },
    dispose() { cleanups.forEach(fn => fn?.()); },
  };
}
const queueModule = load('lib/groups/readQueue.ts');
const promotion = { share_id: 'promotion-1', sharer_id: 'owner', group_id: 'group', shared_at: '2026-10-29T12:00:00Z', promotion: { group_id: 'group', name: 'Public Group', visibility: 'public', approved: true, can_share: true } };
const post = { share_id: 'post-1', sharer_id: 'owner', original_author_id: 'author', post_id: 'post', shared_at: '2026-10-29T11:00:00Z' };
function feed({ owner = null, read = async () => ({ data: [promotion, post], error: null }), ready = true } = {}) {
  const h = hooks(), calls = [], session = { ready, userId: ready ? 'viewer' : '', revision: 0 };
  const { useSharedGroupFeed } = load('lib/groups/useSharedGroupFeed.ts', {
    react: h.react, './readQueue': queueModule, './useGroupSession': { useGroupSession: () => session },
    './sharedFeed': { fetchGroupShares: (...args) => { calls.push(args); return read(...args); } },
  }, { window: h.window, document: h.document });
  h.render(() => useSharedGroupFeed(owner, 60));
  return { ...h, calls, session };
}
for (const owner of [null, 'owner']) test(`${owner ? 'Profile' : 'Dashboard'} loads both share kinds as soon as auth is ready, without scroll or timers`, async () => {
  const h = feed({ owner, ready: false }); await h.flush(); assert.equal(h.calls.length, 0);
  Object.assign(h.session, { ready: true, userId: 'viewer', revision: 1 });
  const result = await h.flush(); assert.equal(h.calls.length, 1); assert.equal(h.calls[0][0], owner);
  assert.equal(result.shares.length, 2); assert.equal(result.loading, false); h.dispose();
});

test('focus during an initial read cannot discard its replacement; repeated same-turn events coalesce', async () => {
  const first = deferred(), second = deferred(); let reads = 0;
  const h = feed({ read: () => ++reads === 1 ? first.promise : second.promise }); await tick();
  h.window.dispatchEvent(new Event('focus')); h.window.dispatchEvent(new Event('pageshow')); await tick();
  assert.equal(reads, 1); first.resolve({ data: [post], error: null }); await tick();
  assert.equal(reads, 2); second.resolve({ data: [promotion, post], error: null });
  assert.equal((await h.flush()).shares.length, 2); h.dispose();
});

test('feed refresh retains eligible cards while pending, then applies new authorization results', async () => {
  let next; const h = feed({ read: () => next?.promise ?? Promise.resolve({ data: [promotion], error: null }) });
  await h.flush(); next = deferred(); h.window.dispatchEvent(new Event('parapost-group-shared')); await tick();
  let result = h.render(); assert.equal(result.shares.length, 1); assert.equal(result.loading, true);
  next.resolve({ data: [], error: null }); result = await h.flush(); assert.equal(result.shares.length, 0); h.dispose();
});

test('failed feed reads fail closed with retry; retry recovers without navigation or refresh', async () => {
  let fail = false; const h = feed({ read: async () => fail ? { error: { message: 'Denied' } } : { data: [promotion] } });
  await h.flush(); fail = true; h.render().refresh(); let result = await h.flush();
  assert.equal(result.shares.length, 0); assert.match(result.error, /try again/);
  fail = false; result.refresh(); result = await h.flush(); assert.equal(result.shares.length, 1); assert.equal(result.error, ''); h.dispose();
});

test('navigation unmount aborts pending reads; remount fetches without relying on a prior share event', async () => {
  const pending = deferred(); const old = feed({ read: () => pending.promise }); await tick(); old.dispose();
  assert.equal(old.calls[0][2].aborted, true); pending.resolve({ data: [promotion] }); await tick();
  const fresh = feed(); assert.equal((await fresh.flush()).shares.length, 2); fresh.dispose();
});

test('account switch and hidden-page recovery cannot expose an old private projection', async () => {
  const pending = deferred(); let reads = 0;
  const h = feed({ read: () => ++reads === 1 ? Promise.resolve({ data: [promotion] }) : pending.promise });
  await h.flush(); h.session.userId = 'another-viewer'; h.session.revision++;
  assert.equal(h.render().shares.length, 0); await tick();
  h.document.visibilityState = 'hidden'; h.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.calls.at(-1)[2].aborted, true);
  pending.resolve({ data: [] }); await h.flush(); assert.equal(h.render().shares.length, 0); h.dispose();
});

test('Profile hook rejects rows belonging to another sharing user', async () => {
  const h = feed({ owner: 'different-owner' }); assert.equal((await h.flush()).shares.length, 0); h.dispose();
});

test('auth events win over stale getSession, callback performs no nested session read, logout clears identity', async () => {
  const h = hooks(), initial = deferred(); let callback, reads = 0;
  const { useGroupSession } = load('lib/groups/useGroupSession.ts', { react: h.react, '@/lib/supabase': { supabase: { auth: {
    onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() {} } } }; },
    getSession() { reads++; return initial.promise; },
  } } } });
  h.render(useGroupSession); callback('SIGNED_IN', { user: { id: 'new-user' } }); assert.equal(reads, 1);
  initial.resolve({ data: { session: { user: { id: 'old-user' } } } }); assert.equal((await h.flush()).userId, 'new-user');
  callback('SIGNED_OUT', null); assert.equal(h.render().userId, ''); h.dispose();
});

const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const content = node => node == null ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(content).join('') : content(node.props?.children);
const find = (tree, predicate) => { const node = nodes(tree).find(predicate); assert.ok(node, 'Expected UI control'); return node; };
const button = (tree, label) => find(tree, n => n.type === 'button' && content(n) === label);
const submit = { preventDefault() {} };
const emptyStats = () => ({ liked: false, like_count: 0, comment_count: 0, comments_limited: false, comments: [] });
function engagement(kind = 'promotion') {
  const h = hooks(), backend = emptyStats(), calls = [];
  const session = { ready: true, userId: 'viewer', revision: 0 };
  const controls = { failRead: false, failWrite: false, writeWait: null };
  const client = { groupsFetch: async (url, options) => {
    if (options?.method !== 'POST') { if (controls.failRead) throw Error('offline'); return { json: async () => structuredClone(backend) }; }
    const body = JSON.parse(options.body); calls.push(body);
    if (controls.writeWait) await controls.writeWait.promise;
    if (controls.failWrite) throw Error('denied');
    const { action, content, parentId } = body;
    if (action === 'like' || action === 'unlike') { backend.liked = action === 'like'; backend.like_count = backend.liked ? 1 : 0; }
    if (action === 'comment' || action === 'reply') backend.comments.push({ id: `c${backend.comments.length}`, author_id: 'viewer', content, parent_id: parentId, liked: false, like_count: 0 });
    const comment = backend.comments.find(c => c.id === parentId);
    if (action === 'like_comment' || action === 'unlike_comment') { comment.liked = action === 'like_comment'; comment.like_count = comment.liked ? 1 : 0; }
    if (action === 'edit_comment') comment.content = content;
    if (action === 'delete_comment') backend.comments = backend.comments.filter(c => c.id !== parentId && c.parent_id !== parentId);
    backend.comment_count = backend.comments.length;
    return { json: async () => ({}) };
  }, groupAction: async () => ({ id: 'new-share' }) };
  const Component = load('app/groups/SharedGroupPostEngagement.tsx', {
    react: h.react, 'react/jsx-runtime': { jsx: h.jsx, jsxs: h.jsx }, 'react-dom': { createPortal: x => x },
    '@/lib/groups/useGroupSession': { useGroupSession: () => session }, '@/lib/groups/client': client,
    '@/lib/groups/shareErrors': load('lib/groups/shareErrors.ts'), '@/lib/supabase': { supabase: { from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }) } },
    './SharedGroupPostActions': { default: 'Actions' }, './GroupShareButton': { ShareDialog: 'ShareDialog' }, './PostIdentity': { PostAvatar: 'Avatar' },
    '@/components/postPresentation': {}, './groupPosting.module.css': { default: {} },
  }, { window: h.window, document: h.document }).default;
  const props = { shareId: 'share', groupId: 'group', postId: kind === 'post' ? 'post' : undefined, kind };
  h.render(() => Component(props));
  return { ...h, controls, calls, backend, session, props };
}
const actions = tree => find(tree, n => n.type === 'Actions').props;
function writeDraft(h, tree, text, reply = false) {
  find(tree, n => n.props?.['aria-label'] === (reply ? 'Write a reply' : 'Write a comment')).props.onChange({ target: { value: text } });
  return h.render();
}
const commentForm = tree => find(tree, n => n.type === 'form' && nodes(n).some(n => n.props?.['aria-label']?.startsWith('Write a')));
for (const kind of ['promotion', 'post']) test(`${kind} engagement routes all actions, reconciles counts, and reloads from its own transport`, async () => {
  const h = engagement(kind); let tree = await h.flush();
  actions(tree).onLike(); tree = await h.flush(); assert.equal(actions(tree).liked, true); assert.match(content(tree), /1 Like/);
  actions(tree).onLike(); tree = await h.flush(); assert.equal(actions(tree).liked, false);
  actions(tree).onComment(); tree = h.render(); tree = writeDraft(h, tree, 'Comment');
  await commentForm(tree).props.onSubmit(submit); tree = await h.flush(); assert.match(content(tree), /1 Comment/);
  button(tree, 'Reply').props.onClick(); tree = h.render(); tree = writeDraft(h, tree, 'Reply', true);
  await commentForm(tree).props.onSubmit(submit); tree = await h.flush(); assert.equal(h.backend.comments[1].parent_id, 'c0');
  button(tree, 'Like').props.onClick(); tree = await h.flush(); button(tree, 'Unlike (1)').props.onClick(); tree = await h.flush();
  button(tree, 'Edit').props.onClick(); tree = h.render();
  find(tree, n => n.type === 'textarea' && !n.props['aria-label']).props.onChange({ target: { value: 'Edited' } }); tree = h.render();
  await find(tree, n => n.type === 'form' && nodes(n).some(n => n.type === 'button' && content(n) === 'Save')).props.onSubmit(submit);
  tree = await h.flush(); assert.match(content(tree), /Edited/);
  h.window.dispatchEvent(new Event('focus')); tree = await h.flush(); assert.match(content(tree), /Edited/);
  button(tree, 'Delete').props.onClick(); tree = await h.flush(); assert.equal(h.backend.comment_count, 0);
  assert.deepEqual(h.calls.map(c => c.action), ['like', 'unlike', 'comment', 'reply', 'like_comment', 'unlike_comment', 'edit_comment', 'delete_comment']);
  assert.ok(h.calls.every(c => c.kind === kind && c.shareId === 'share')); h.dispose();
});

test('initial stats failure shows disabled controls and retry recovers without losing the card', async () => {
  const h = engagement(); h.controls.failRead = true; h.window.dispatchEvent(new Event('focus'));
  let tree = await h.flush(); assert.equal(actions(tree).busy, true); assert.match(content(tree), /temporarily unavailable/);
  h.controls.failRead = false; button(tree, 'Retry reactions').props.onClick(); tree = await h.flush(); assert.equal(actions(tree).busy, false); h.dispose();
});

test('successful comment followed by failed stats read clears submitted draft and never resends the write', async () => {
  const h = engagement(); let tree = await h.flush(); actions(tree).onComment(); tree = writeDraft(h, h.render(), 'Once');
  h.controls.failRead = true; await commentForm(tree).props.onSubmit(submit); tree = await h.flush();
  assert.equal(h.calls.length, 1); assert.equal(h.backend.comments.length, 1);
  h.controls.failRead = false; button(tree, 'Retry reactions').props.onClick(); tree = await h.flush();
  assert.equal(find(tree, n => n.props?.['aria-label'] === 'Write a comment').props.value, ''); assert.equal(h.calls.length, 1); h.dispose();
});

test('failed writes preserve draft, and synchronous double-submit produces only one pending request', async () => {
  const h = engagement(); let tree = await h.flush(); actions(tree).onComment(); tree = writeDraft(h, h.render(), 'Keep me');
  h.controls.failWrite = true; h.controls.writeWait = deferred(); const form = commentForm(tree);
  const first = form.props.onSubmit(submit), second = form.props.onSubmit(submit); assert.equal(h.calls.length, 1);
  h.controls.writeWait.resolve(); await Promise.all([first, second]); tree = await h.flush();
  assert.equal(find(tree, n => n.props?.['aria-label'] === 'Write a comment').props.value, 'Keep me'); assert.match(content(tree), /Unable to complete/); h.dispose();
});

test('old interaction cannot overwrite a newly selected share or its draft', async () => {
  const h = engagement(); let tree = await h.flush(); actions(tree).onComment(); tree = writeDraft(h, h.render(), 'Old');
  h.controls.writeWait = deferred(); const action = commentForm(tree).props.onSubmit(submit);
  h.props.shareId = 'different-share'; tree = await h.flush(); tree = writeDraft(h, tree, 'New');
  h.controls.writeWait.resolve(); await action; tree = await h.flush();
  assert.equal(find(tree, n => n.props?.['aria-label'] === 'Write a comment').props.value, 'New'); h.dispose();
});

test('promotion renders the authorized projection immediately without another preview request', () => {
  const h = hooks();
  const Card = load('app/groups/SharedGroupPromotionCard.tsx', {
    react: h.react, 'react/jsx-runtime': { jsx: h.jsx, jsxs: h.jsx }, 'next/link': { default: 'Link' },
    '@/lib/supabase': { supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) } },
    '@/lib/groups/sharing': { promotionHref: () => '/groups/group' }, '@/components/postPresentation': {},
    './PostIdentity': { PostAvatar: 'Avatar', profileName: () => 'Member' }, './GroupPromotionPreview': { default: 'Preview' },
    './SharedGroupPostEngagement': { default: 'Engagement' }, './SharedGroupDeleteMenu': { default: 'Delete' },
    './groupPosting.module.css': { default: {} }, './groupSharing.module.css': { default: {} },
  }).default;
  const privatePreview = { ...promotion.promotion, visibility: 'private', approved: false, can_share: false, description: null, cover_url: null };
  const tree = h.render(() => Card({ share: { ...promotion, promotion: privatePreview } }));
  assert.equal(tree.type, 'article'); assert.equal(find(tree, n => n.type === 'Preview').props.preview, privatePreview);
  assert.equal(find(tree, n => n.type === 'Engagement').props.canShare, false); assert.match(content(tree), /Request to Join/); h.dispose();
});

test('Dashboard/Profile keep the existing feed merge and ordinary posts/Reels; Group loads have no scroll prerequisite', () => {
  const dashboard = source('app/dashboard/page.tsx'), profile = source('app/profile/[id]/page.tsx'), hook = source('lib/groups/useSharedGroupFeed.ts');
  assert.match(dashboard, /useSharedGroupFeed\(null, DASHBOARD_FEED_ITEM_LIMIT\)/); assert.match(profile, /useSharedGroupFeed\(profileId, 60\)/);
  assert.doesNotMatch(dashboard, /groupSharedRequestRef|fetchSharedGroupPosts|setGroupSharedPostItems/);
  assert.match(dashboard, /fetchSharedPosts\(blockedIds\)/); assert.match(dashboard, /fetchSharedReels\(blockedIds\)/);
  assert.doesNotMatch(hook, /IntersectionObserver|addEventListener\(['"]scroll|setTimeout|location\.reload/);
});

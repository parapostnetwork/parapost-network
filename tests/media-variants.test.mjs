import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports, globals = {}) {
  const source = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  vm.runInNewContext(code, { exports, require: name => { assert.ok(name in imports, name); return imports[name]; }, URL, setTimeout, clearTimeout, ...globals });
  return exports;
}
const options = { cacheControl: '3600', contentType: 'image/webp', upsert: false };
const master = new File([new Uint8Array(1000)], 'master.webp', { type: 'image/webp' });
const thumb = { file: new File(['small'], 'thumb.webp', { type: 'image/webp' }), width: 1024, height: 768, sourceWidth: 2048, sourceHeight: 1536 };
function helper(optimizer = async () => thumb, globals) {
  return load('lib/images/media-variants.ts', { '@/lib/images/optimize-upload': { optimizeImageUpload: optimizer } }, globals);
}
const { variantPaths, mediaVariantSources } = helper();
const paths = variantPaths('user/unique.webp', 'post', { width: 2048, height: 1536 }, { width: 1024, height: 768, type: 'image/webp' });
const base = 'https://example.supabase.co/storage/v1/object/public/post-images/';
const marked = base + paths.master;

test('deterministic variant paths preserve unique user prefix and encode master mapping', () => {
  assert.equal(paths.master, 'user/unique--ppv1-post-m2048x1536-t1024x768-webp.webp');
  assert.equal(paths.thumbnail, 'user/unique--ppv1-post-thumb.webp');
  for (const [type, ext] of [['image/png', 'png'], ['image/jpeg', 'jpg']]) {
    assert.ok(variantPaths('u/a.png', 'avatar', { width: 512, height: 512 }, { width: 192, height: 192, type }).thumbnail.endsWith('.' + ext));
  }
  assert.throws(() => variantPaths('no-extension', 'post', thumb, thumb));
});
test('marked URL yields both dimensions and deterministic thumbnail without probing storage', () => {
  const result = mediaVariantSources(marked, 'post');
  assert.equal(result.thumbnail, base + paths.thumbnail);
  assert.deepEqual([result.width, result.height, result.thumbWidth, result.thumbHeight], [2048, 1536, 1024, 768]);
});
for (const src of [base + 'old.webp', marked + '?token=x', marked + '#hash', marked.replace('/public/', '/sign/'), marked.replace('/post-images/', '/private-chat/'), 'blob:old', 'invalid', marked.replace('t1024x768', 't2048x768'), marked.replace('m2048', 'm99999'), marked.replace('t1024', 't0')]) {
  test('existing/signed/invalid media uses original master: ' + src, () => assert.equal(mediaVariantSources(src, 'post'), null));
}
test('wrong purpose cannot select a variant', () => assert.equal(mediaVariantSources(marked, 'avatar'), null));

test('thumbnail succeeds before marked master; original optimized bytes and options preserved', async () => {
  const calls = [];
  const { uploadImageWithVariant } = helper(async (file, purpose, thumbnail) => { assert.equal(file, master); assert.equal(purpose, 'post'); assert.equal(thumbnail, true); return thumb; });
  const result = await uploadImageWithVariant({ upload: async (...args) => { calls.push(args); return { error: null }; } }, 'user/unique.webp', master, 'post', options);
  assert.equal(result.error, null); assert.equal(result.path, paths.master);
  assert.equal(calls.length, 2); assert.equal(calls[0][0], paths.thumbnail); assert.equal(calls[1][0], paths.master);
  assert.equal(calls[1][1], master); assert.equal(calls[0][2].upsert, false); assert.equal(calls[1][2].upsert, false);
  assert.equal(calls[0][2].contentType, thumb.file.type); assert.equal(calls[1][2].cacheControl, '3600');
});
for (const failure of ['encode', 'returned', 'thrown', 'not-smaller', 'not-resized', 'equal-width']) test('optional failure/nonbeneficial variant falls back safely: ' + failure, async () => {
  const calls = [];
  const { uploadImageWithVariant } = helper(async () => {
    if (failure === 'encode') throw Error('decode failed');
    if (failure === 'not-smaller') return { ...thumb, file: master };
    if (failure === 'not-resized') return { ...thumb, width: 2048, height: 1536 };
    if (failure === 'equal-width') return { ...thumb, width: 1, sourceWidth: 1 };
    return thumb;
  });
  const result = await uploadImageWithVariant({ upload: async (...args) => {
    calls.push(args);
    if (args[0].includes('-thumb.')) { if (failure === 'thrown') throw Error('network'); return { error: { message: 'denied' } }; }
    return { error: null };
  } }, 'u/master.webp', master, 'post', options);
  assert.equal(result.path, 'u/master.webp'); assert.equal(result.error, null);
  assert.equal(calls.at(-1)[1], master); assert.equal(calls.at(-1)[0], 'u/master.webp');
});
test('optional upload timeout is bounded; late success cannot change published path', async () => {
  let timer, cleared = 0, finish;
  const calls = [];
  const { uploadImageWithVariant } = helper(undefined, { setTimeout: (fn, ms) => { assert.equal(ms, 15000); timer = fn; return 123; }, clearTimeout: id => { assert.equal(id, 123); cleared++; } });
  const resultPromise = uploadImageWithVariant({ upload: (path) => { calls.push(path); return path.includes('-thumb.') ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ error: null }); } }, 'u/master.webp', master, 'post', options);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  timer(); const result = await resultPromise; assert.equal(result.path, 'u/master.webp'); assert.equal(cleared, 1);
  finish({ error: null }); await Promise.resolve(); assert.equal(result.path, 'u/master.webp'); assert.equal(calls.length, 2);
});
test('optional success clears timeout and master failure propagates without deletion', async () => {
  let cleared = 0;
  const { uploadImageWithVariant } = helper(undefined, { setTimeout: () => 42, clearTimeout: id => { assert.equal(id, 42); cleared++; } });
  const calls = [];
  const result = await uploadImageWithVariant({ upload: async path => { calls.push(path); return { error: path.includes('-thumb.') ? null : { message: 'master failed' } }; } }, 'u/master.webp', master, 'post', options);
  assert.equal(cleared, 1); assert.equal(result.error.message, 'master failed'); assert.equal(calls.length, 2);
});
test('thrown master failure becomes handled upload error', async () => {
  const { uploadImageWithVariant } = helper(async () => { throw Error('optional'); });
  const result = await uploadImageWithVariant({ upload: async () => { throw Error('master'); } }, 'u/master.webp', master, 'post', options);
  assert.match(result.error.message, /could not be uploaded/);
});

function component() {
  let state = null;
  const React = { createElement: (tag, props) => ({ tag, props }), useState: () => [state, value => { state = value; }] };
  return load('components/ResponsiveMediaImage.tsx', { react: React, '@/lib/images/media-variants': { mediaVariantSources } }, { React }).default;
}
test('responsive img uses one srcset, master fallback, and preserves viewer handler', () => {
  const Image = component(), onClick = () => marked;
  const image = Image({ src: marked, purpose: 'post', sizes: '(max-width: 760px) 100vw, 1000px', onClick });
  assert.equal(image.tag, 'img'); assert.equal(image.props.src, marked);
  assert.equal(image.props.srcSet, `${base + paths.thumbnail} 1024w, ${marked} 2048w`);
  assert.equal(image.props.onClick(), marked); assert.match(image.props.sizes, /760px/);
});
test('failed candidate removes srcset before master fallback, does not loop, new URL gets fresh candidates', () => {
  const Image = component(), changes = [];
  const target = { removeAttribute: key => changes.push(key), set src(value) { changes.push(value); } };
  Image({ src: marked, purpose: 'post' }).props.onError({ currentTarget: target });
  assert.deepEqual(changes, ['srcset', 'sizes', marked]);
  const fallback = Image({ src: marked, purpose: 'post' });
  assert.equal(fallback.props.srcSet, undefined); assert.equal(fallback.props.onError, undefined); assert.equal(fallback.props.src, marked);
  assert.ok(Image({ src: marked.replace('unique', 'other'), purpose: 'post' }).props.srcSet);
});
test('legacy image produces no candidate/probe and non-square avatars account for cover density', () => {
  const Image = component(); assert.equal(Image({ src: base + 'legacy.jpg', purpose: 'post' }).props.srcSet, undefined);
  const avatar = base + variantPaths('u/avatar.webp', 'avatar', { width: 512, height: 256 }, { width: 192, height: 96, type: 'image/webp' }).master;
  assert.equal(Image({ src: avatar, purpose: 'avatar', avatarSize: 48 }).props.sizes, '96px');
});
test('gallery fullscreen and open-original continue using master; grids retain responsive breakpoints', () => {
  const source = readFileSync(new URL('../components/profile/ProfilePhotosSection.tsx', import.meta.url), 'utf8');
  assert.match(source, /src=\{selectedPhoto.url\}/); assert.match(source, /href=\{selectedPhoto.url\}/);
  assert.match(source, /sizes="auto, \(min-width: 1280px\) 25vw, \(min-width: 640px\) 33vw, 50vw"/);
  for (const path of ['app/dashboard/page.tsx', 'app/profile/[id]/page.tsx']) {
    const page = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
    assert.match(page, /ResponsiveMediaImage/); assert.match(page, /\(max-width: 760px\)/);
  }
});

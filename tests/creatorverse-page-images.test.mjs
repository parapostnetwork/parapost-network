import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import sharp from 'sharp';
const nodeRequire = createRequire(import.meta.url);
const staging = 'https://vmgelrgrtpghmvqgufzz.supabase.co';
const production = 'https://luzesphgdqazqhmqlniy.supabase.co';
const id = '10000000-0000-4000-8000-000000000001';
const owner = '10000000-0000-4000-8000-000000000002';
function loader(env, mocks = {}, globals = {}) {
  const cache = new Map();
  function load(path) {
    path = resolve(path);
    if (cache.has(path)) return cache.get(path);
    const exports = {}; cache.set(path, exports);
    const require = name => {
      if (name in mocks) return mocks[name];
      if (name === 'server-only') return {};
      if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
      if (name.startsWith('.')) return load(resolve(dirname(path), `${name}.ts`));
      return nodeRequire(name);
    };
    vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
      { exports, require, process: { env }, Buffer, Blob, File, Request, Response, URL, Uint8Array, DataView, setTimeout, clearTimeout, ...globals }, { filename: path });
    return exports;
  }
  return load;
}
function env(url = staging, vercel = 'preview', branch = 'staging') {
  return { NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: url, VERCEL_ENV: vercel, VERCEL_GIT_COMMIT_REF: branch, SUPABASE_SERVICE_ROLE_KEY: 'test-only', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-only' };
}
const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#abc' } }).jpeg().toBuffer();
const file = () => new File([jpeg], 'IMG_3021.jpeg', { type: 'image/jpeg' });

function harness(environment, authorized = true) {
  const media = [], objects = new Map(), calls = [];
  const page = { id, owner_id: owner, status: 'active', logo_media_id: null, cover_media_id: null };
  const query = table => {
    let rows = table === 'creatorverse_pages' ? [page] : media.slice();
    const q = {
      select() { return q; },
      eq(k, v) { rows = rows.filter(row => row[k] === v); return q; },
      is(k, v) { return q.eq(k, v); },
      in(k, v) { rows = rows.filter(row => v.includes(row[k])); return q; },
      order() { rows.reverse(); return q; }, limit(n) { rows = rows.slice(0, n); return q; },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    }; return q;
  };
  const client = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'test', user: { id: owner } } } }),
      getUser: async () => ({ data: { user: authorized ? { id: owner } : null } }) },
    from: query,
    storage: { from(bucket) { assert.equal(bucket, 'creatorverse-media'); return {
      upload: async (path, blob, options) => { assert.equal(options.upsert, false); objects.set(path, blob); calls.push('upload'); return {}; },
      download: async path => ({ data: objects.get(path) }),
    }; } },
    rpc: async (name, args) => {
      calls.push(name);
      if (name === 'creatorverse_page_access') return { data: { can_manage: authorized, can_publish: authorized } };
      if (name === 'creatorverse_reserve_page_media') {
        const mediaId = `20000000-0000-4000-8000-${String(media.length + 1).padStart(12, '0')}`;
        const row = { id: mediaId, page_id: id, post_id: null, media_type: 'image', purpose: args.p_purpose,
          mime_type: args.p_mime_type, storage_path: `${id}/${args.p_purpose}/${mediaId}.jpg`, verification: 'pending' };
        media.push(row);
        return { data: { media_id: mediaId, storage_path: row.storage_path, verification: 'pending' } };
      }
      if (name === 'creatorverse_finalize_page_media') {
        const row = media.find(row => row.id === args.p_media_id);
        row.verification = 'verified'; page[`${row.purpose}_media_id`] = row.id; return { data: true };
      }
      if (name === 'creatorverse_cancel_page_media') {
        const row = media.find(row => row.id === args.p_media_id);
        if (row.verification !== 'pending') return { data: false };
        row.verification = 'rejected'; return { data: true };
      }
      throw Error(name);
    },
  };
  let load;
  const fetch = async (path, options) => {
    const parts = path.split('/'); const action = parts.at(-1);
    const route = action === 'reserve' ? 'reserve/route.ts' : `[mediaId]/${action}/route.ts`;
    return load(`app/api/creatorverse/pages/[id]/images/${route}`).POST(new Request(`https://app.test${path}`, options),
      { params: Promise.resolve({ id, mediaId: parts.at(-2) }) });
  };
  load = loader(environment, { '@/lib/supabase': { supabase: client }, '@supabase/supabase-js': { createClient: url => { assert.equal(url, environment.NEXT_PUBLIC_SUPABASE_URL); return client; } } }, { fetch });
  return { load, media, objects, page, calls };
}

test('2199d93 production client blocks without the image flag despite accepting the project', () => {
  const source = execFileSync('git', ['show', '2199d93:lib/creatorverse/page-image-client.ts'], { encoding: 'utf8' });
  const load = loader(env(production, 'production'));
  const target = load('lib/community/release-target.ts');
  assert.equal(target.communityClientTargetAllowed(), true);
  for (const flag of [undefined, 'false', 'true']) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
      { exports, process: { env: { NEXT_PUBLIC_CREATORVERSE_PAGE_IMAGES_ENABLED: flag } }, require: name =>
        name.includes('release-target') ? target : name.includes('page-image-validation') ? load('lib/creatorverse/page-image-validation.ts') : {} });
    assert.equal(exports.pageImageUploadsApproved(), flag === 'true');
  }
});
for (const environment of [env(), env(production, 'production')]) {
  test(`reserve/upload/real JPEG decode/attach/serve/replace with no image flags: ${environment.VERCEL_ENV}`, async () => {
    const h = harness(environment);
    const upload = h.load('lib/creatorverse/page-image-client.ts');
    assert.equal(upload.pageImageUploadsApproved(), true);
    for (const purpose of ['logo', 'cover', 'logo']) {
      const previous = h.page[`${purpose}_media_id`];
      const result = await upload.uploadCreatorVersePageImage(id, purpose, file(), owner);
      assert.equal(h.page[`${purpose}_media_id`], result.mediaId);
      if (previous) assert.notEqual(result.mediaId, previous);
      const serve = h.load('app/api/creatorverse/pages/[id]/images/[mediaId]/route.ts');
      for (const method of ['HEAD', 'GET']) {
        const response = await serve[method](new Request('https://app.test/image', { method }), { params: Promise.resolve({ id, mediaId: purpose }) });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-type'), 'image/jpeg');
        if (method === 'GET') assert.deepEqual(Buffer.from(await response.arrayBuffer()), jpeg);
      }
    }
    assert.equal(h.objects.size, 3, 'replacement leaves previously uploaded objects intact');
    assert.equal(h.media.filter(row => row.verification === 'verified').length, 3);
  });
}
for (const environment of [env(production), env(staging, 'production'), env(staging, 'preview', 'main'), env('https://other.supabase.co')]) {
  test(`rejects mismatched environment ${environment.NEXT_PUBLIC_SUPABASE_URL}/${environment.VERCEL_ENV}/${environment.VERCEL_GIT_COMMIT_REF}`, async () => {
    const h = harness(environment);
    const request = new Request('https://app.test/image', { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose: 'logo', mimeType: 'image/jpeg', byteSize: jpeg.length }) });
    for (const suffix of ['reserve/route.ts', '[mediaId]/verify/route.ts', '[mediaId]/cancel/route.ts']) {
      const response = await h.load(`app/api/creatorverse/pages/[id]/images/${suffix}`).POST(request.clone(), { params: Promise.resolve({ id, mediaId: id }) });
      assert(response.status >= 400);
    }
    assert.equal(h.media.length, 0);
    assert.equal(h.objects.size, 0);
  });
}
test('unauthorized uploader and account changes cannot reserve media', async () => {
  for (const authorized of [false, true]) {
    const h = harness(env(), authorized);
    await assert.rejects(h.load('lib/creatorverse/page-image-client.ts').uploadCreatorVersePageImage(id, 'logo', file(), authorized ? 'different-owner' : owner));
    assert.equal(h.media.length, 0);
  }
});
test('server rejects forged, truncated, wrong-MIME and oversized-pixel images', async () => {
  const inspect = loader(env())('lib/creatorverse/image-verification.ts').inspectCreatorVerseImage;
  await inspect(file(), 'image/jpeg');
  await assert.rejects(inspect(new Blob([jpeg.subarray(0, 30)]), 'image/jpeg'));
  await assert.rejects(inspect(new Blob([jpeg]), 'image/png'));
  await assert.rejects(inspect(new Blob(['not an image at all']), 'image/jpeg'));
  const big = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: '#fff' } }).jpeg().toBuffer();
  await assert.rejects(inspect(new Blob([big]), 'image/jpeg'));
});
test('verification failure cancels only pending media and preserves previous successful image', async () => {
  const h = harness(env()); const upload = h.load('lib/creatorverse/page-image-client.ts').uploadCreatorVersePageImage;
  const first = await upload(id, 'logo', file(), owner);
  await assert.rejects(upload(id, 'logo', new File([jpeg.subarray(0, 30)], 'bad.jpg', { type: 'image/jpeg' }), owner));
  assert.equal(h.page.logo_media_id, first.mediaId);
  assert.deepEqual(h.media.map(row => row.verification), ['verified', 'rejected']);
});

// Native decoding is stubbed below: these exercise conversion control flow, not a real iPhone codec.
function browser(failDecode = false, badEncode = false) {
  let revoked = false;
  class Image {
    naturalWidth = 8064; naturalHeight = 6048;
    set src(value) { queueMicrotask(() => failDecode ? this.onerror() : this.onload()); }
    removeAttribute() {}
  }
  const canvas = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }),
    toBlob(callback) { callback(new Blob([jpeg], { type: badEncode ? 'image/png' : 'image/jpeg' })); } };
  return { globals: { Image, document: { createElement: () => canvas }, URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => { revoked = true; } } }, canvas, revoked: () => revoked };
}
const heifHeader = Buffer.from('000000186674797068656963000000006d69663168656963', 'hex');
for (const type of ['image/heic', 'image/heif', '']) {
  test(`HEIC/HEIF preparation produces server-valid JPEG (${type || 'missing MIME'})`, async () => {
    const b = browser(); const load = loader(env(), {}, b.globals);
    const result = await load('lib/creatorverse/page-image-preparation.ts').preparePageImage(new File([heifHeader], 'IMG_3021.heic', { type }), 'cover');
    assert.equal(result.type, 'image/jpeg'); assert.equal(result.name, 'IMG_3021.jpg');
    await load('lib/creatorverse/image-verification.ts').inspectCreatorVerseImage(result, result.type);
    assert.equal(b.revoked(), true); assert.equal(b.canvas.width, 0);
  });
}
test('HEIF decoder/encoder failures fail closed and clean browser resources', async () => {
  for (const mode of ['decode', 'encode']) {
    const b = browser(mode === 'decode', mode === 'encode');
    const prepare = loader(env(), {}, b.globals)('lib/creatorverse/page-image-preparation.ts').preparePageImage;
    await assert.rejects(prepare(new File([heifHeader], 'photo.heif', { type: 'image/heif' }), 'logo'), /HEIC\/HEIF/);
    assert(b.revoked());
  }
});
test('JPEG without MIME is normalized from bytes and large sources are rejected', async () => {
  let called = false;
  const load = loader(env(), { '@/lib/images/optimize-upload': { IMAGE_SOURCE_MAX_BYTES: 25 * 1024 * 1024,
    optimizeImageUpload: async (file, purpose) => { assert.equal(file.type, 'image/jpeg'); assert.equal(purpose, 'avatar'); called = true; return { file }; } } });
  const prep = load('lib/creatorverse/page-image-preparation.ts');
  await prep.preparePageImage(new File([jpeg], 'IMG_3021.jpeg'), 'logo'); assert(called);
  assert.throws(() => prep.validatePageImageSource({ name: 'large.heic', type: 'image/heic', size: 26 * 1024 * 1024 }), /25 MB/);
  await assert.rejects(prep.preparePageImage(new File(['invalid bytes'], 'fake.heic', { type: 'image/heic' }), 'logo'));
});

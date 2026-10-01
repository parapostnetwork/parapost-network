import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { hash, referenceTables, inspectObject, runBatch, transform, publishPrepared } from '../tools/media/maintenance.mjs';

const projectUrl = 'https://offline.example';
const object = { bucket: 'post-images', path: 'u/old.png', sourceFile: 'old.png' };
const url = `${projectUrl}/storage/v1/object/public/post-images/u/old.png`;
function snapshot(objects = [object]) {
  const tables = Object.fromEntries(referenceTables.map(t => [t, []]));
  tables.posts = [{ id: 'post', image_url: url }];
  tables.post_images = [{ id: 'image', image_url: url, storage_path: object.path }];
  return { projectUrl, objects, tables };
}
let seed = 11;
const pixels = Buffer.alloc(2400 * 1600 * 3);
for (let i = 0; i < pixels.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; pixels[i] = seed >>> 24; }
const source = await sharp(pixels, { raw: { width: 2400, height: 1600, channels: 3 } }).png().toBuffer();
const generated = await transform(source, 'post');
const artifacts = new Map();
const io = {
  readSource: async () => source,
  transform: async () => generated,
  writeArtifact: async (artifact, bytes) => {
    if (artifacts.has(artifact.path)) assert.equal(hash(artifacts.get(artifact.path)), hash(bytes));
    artifacts.set(artifact.path, bytes);
  },
};
async function prepare(s = snapshot(), overrides = {}) { return runBatch(s, { ...io, ...overrides }, { mode: 'prepare' }); }
const prepared = await prepare();
const plan = prepared.results[0].plan;

test('dry-run default does not read source, transform or write', async () => {
  const report = await runBatch(snapshot(), new Proxy({}, { get() { throw Error('Unexpected IO'); } }));
  assert.equal(report.mode, 'dry-run'); assert.equal(report.results[0].status, 'candidate');
});
test('bounded stable batches and continuation cursor', async () => {
  const s = snapshot(Array.from({ length: 15 }, (_, i) => ({ ...object, path: `u/${i}.png` })));
  const first = await runBatch(s, {}, { limit: 4 });
  const next = await runBatch(s, {}, { limit: 4, offset: first.nextOffset });
  assert.equal(first.results.length, 4); assert.equal(next.results.length, 4);
  assert.equal(new Set([...first.results,...next.results].map(r => r.key)).size, 8);
  await assert.rejects(runBatch(s, {}, { limit: 101 }));
});
test('real optimization is decoded, bounded and measured; original retained', () => {
  const result = prepared.results[0];
  assert.equal(result.status, 'prepared'); assert.equal(generated.master.width, 2048);
  assert.equal(generated.thumbnail.width, 1024); assert.ok(result.masterDeliveryReduction > 0);
  assert.equal(result.originalBytes, source.length); assert.equal(result.additionalStorageBytes, result.masterBytes + result.thumbnailBytes);
  assert.notEqual(plan.artifacts.at(-1).path, object.path);
  console.log('LOCAL SYNTHETIC MEASUREMENT', JSON.stringify({ original: source.length, master: result.masterBytes, thumbnail: result.thumbnailBytes, reduction: result.masterDeliveryReduction }));
});
test('deterministic reruns reuse paths and bytes; rollback includes paired post URL/storage path', async () => {
  const again = await prepare(); assert.deepEqual(again.results[0].plan, plan);
  assert.equal(artifacts.size, 2);
  assert.equal(plan.patches.length, 3); assert.equal(plan.rollback.length, 3);
  for (let i = 0; i < 3; i++) { assert.equal(plan.rollback[i].replacement, plan.patches[i].expected); assert.equal(plan.rollback[i].expected, plan.patches[i].replacement); }
});
for (const path of ['u/a--ppv1-post-m2048x1024-t1024x512-webp.webp', 'u/a--ppe1-123.webp']) test('already optimized skips ' + path, async () => {
  const s = snapshot([{ ...object, path }]); s.tables.posts[0].image_url = projectUrl + '/storage/v1/object/public/post-images/' + path;
  const r = await prepare(s, { readSource: () => { throw Error('Must not read'); } });
  assert.equal(r.results[0].status, 'already-optimized');
});
for (const stage of ['missing source','transform failure','artifact write failure','partial thumbnail creation']) test(stage + ' never emits switch plan', async () => {
  let writes = 0;
  const overrides = stage === 'missing source' ? { readSource: async () => { throw Error('missing'); } } : stage === 'transform failure' ? { transform: async () => { throw Error('transform'); } } : { writeArtifact: async () => { writes++; if (stage === 'artifact write failure' || writes === 2) throw Error('disk'); } };
  const result = (await prepare(snapshot(), overrides)).results[0];
  assert.equal(result.status, 'failed'); assert.equal(result.plan, undefined);
});
test('master-only fallback generates a valid non-variant reference', async () => {
  const r = await prepare(snapshot(), { transform: async () => ({ ...generated, thumbnail: null }) });
  assert.equal(r.results[0].plan.artifacts.length, 1); assert.doesNotMatch(r.results[0].plan.patches[0].replacement, /ppv1/);
});
test('bad source checksum and invalid generated dimensions fail verification', async () => {
  const s = snapshot([{ ...object, sha256: 'wrong' }]); assert.equal((await prepare(s)).results[0].status, 'failed');
  const result = await prepare(snapshot(), { transform: async () => ({ master: { ...generated.master, width: 1 }, thumbnail: null }) });
  assert.equal(result.results[0].status, 'failed');
});
test('malformed rows block preparation; individual malformed objects do not stop batch', async () => {
  const s = snapshot(); s.tables.posts.push(null); assert.equal((await prepare(s)).results[0].status, 'skipped');
  const r = await prepare(snapshot([null, object])); assert.equal(r.results.length, 2); assert.equal(r.summary.failed, 1); assert.equal(r.summary.prepared, 1);
});
test('duplicate inventory identities remain separately reported and never processed', async () => {
  const r = await prepare(snapshot([object, object])); assert.equal(r.results.length, 2); assert.equal(r.summary.failed, 2);
});
test('active, possible orphan, and unknown are distinct; none are safe to delete', () => {
  assert.equal(inspectObject(object,snapshot().tables).classification, 'ACTIVE/REFERENCED');
  const tables = Object.fromEntries(referenceTables.map(t => [t, []]));
  assert.equal(inspectObject(object,tables).classification, 'POSSIBLY ORPHANED — DO NOT DELETE');
  assert.equal(inspectObject(object,{}).classification, 'UNKNOWN — DO NOT DELETE');
});
test('derived Phase D thumbnail is referenced through master, never orphaned', () => {
  const s = snapshot(); s.tables.posts[0].image_url = `${projectUrl}/storage/v1/object/public/post-images/u/a--ppv1-post-m2048x1024-t1024x512-webp.webp`;
  const o = { bucket: 'post-images', path: 'u/a--ppv1-post-thumb.webp' };
  assert.equal(inspectObject(o,s.tables).classification, 'ACTIVE/REFERENCED');
});
test('nested JSON, prose, and signed references are recognized but never rewritten', async () => {
  for (const value of [{ nested: url }, 'Look here ' + url, url.replace('/public/', '/sign/') + '?token=not-real']) {
    const s = snapshot(); s.tables.profile_showcases.push({ id:'show', media_url:value });
    assert.equal(inspectObject(object,s.tables).classification, 'ACTIVE/REFERENCED');
    assert.equal((await prepare(s)).results[0].status, 'failed');
  }
});
test('private images and videos are report-only regardless of references', async () => {
  for (const bucket of ['parachat-images','reels','reels-videos','achievement-icons']) {
    const s = snapshot([{ bucket, path:'u/file' }]); s.tables.direct_messages = [{ id:'m', image_path:'u/file' }];
    assert.equal((await prepare(s)).results[0].status, 'skipped');
  }
});
for (const flag of ['delete','apply','cleanup']) test('destructive flag rejected: ' + flag, async () => {
  await assert.rejects(runBatch(snapshot(), io, { [flag]:true }), /not implemented/);
});
for (const [purpose,width,height,expected] of [['avatar',800,400,[512,256]],['avatar',400,800,[256,512]],['poster',800,1600,[640,1280]],['cover',2400,800,[1920,640]],['post',80,40,[80,40]]]) test('real transform '+purpose+' '+width+'x'+height, async () => {
  const bytes = await sharp({ create: { width,height,channels:4,background:{r:100,g:50,b:150,alpha:0.5} } }).png().toBuffer();
  const r = await transform(bytes,purpose); assert.deepEqual([r.master.width,r.master.height],expected);
  assert.ok(r.master.width <= width && r.master.height <= height);
  assert.equal((await sharp(r.master.bytes).metadata()).hasAlpha,true);
});
function transport() {
  const records = { posts: { post: { image_url:url } }, post_images: { image:{ image_url:url,storage_path:object.path } } };
  const objects = new Map([[`${object.bucket}/${object.path}`, source]]), events = [];
  return { records,objects,events,
    readObject: async a => objects.get(`${a.bucket}/${a.path}`),
    readArtifact: async a => artifacts.get(a.path),
    putIfAbsent: async (a,bytes) => { events.push('upload'); const key=`${a.bucket}/${a.path}`; if(!objects.has(key)) objects.set(key,bytes); },
    readRow: async (table,id) => ({ ...records[table]?.[id] }),
    compareAndSet: async (table,id,patches) => { events.push('cas'); if(patches.every(p=>records[table][id][p.field]===p.expected)) for(const p of patches) records[table][id][p.field]=p.replacement; },
    journal: async record => { events.push(record.stage); },
  };
}
const approval = { mode:'publish-approved',approval:'COPY_VERIFY_CAS_KEEP_ORIGINAL' };
test('publisher defaults dry-run and explicit approval is mandatory', async () => {
  assert.equal((await publishPrepared(plan,{})).status,'dry-run');
  await assert.rejects(publishPrepared(plan,{}, { mode:'publish-approved' }),/approval/);
});
test('publish verifies copies before CAS, rereads references, retains original; rerun idempotent', async () => {
  const a=transport(); await publishPrepared(plan,a,approval); assert.ok(a.events.indexOf('copies-verified') < a.events.indexOf('cas'));
  assert.equal(a.objects.get(`${object.bucket}/${object.path}`),source);
  const cas=a.events.filter(e=>e==='cas').length; await publishPrepared(plan,a,approval); assert.equal(a.events.filter(e=>e==='cas').length,cas);
});
for (const stage of ['source','upload','verify','conflict','uncertain-cas','post-read']) test('publisher stops safely on '+stage,async()=>{
  const a=transport();
  if(stage==='source')a.objects.set(`${object.bucket}/${object.path}`,Buffer.from('changed'));
  if(stage==='upload')a.putIfAbsent=async()=>{throw Error('failed');};
  if(stage==='verify')a.putIfAbsent=async()=>{};
  if(stage==='conflict')a.records.posts.post.image_url='new-user-upload';
  if(stage==='uncertain-cas')a.compareAndSet=async()=>{throw Error('timeout');};
  if(stage==='post-read')a.compareAndSet=async()=>{};
  await assert.rejects(publishPrepared(plan,a,approval)); assert.ok(a.events.includes('uncertain-or-failed'));
  assert.ok(a.objects.has(`${object.bucket}/${object.path}`));
  if(['source','upload','verify','conflict'].includes(stage)) assert.ok(!a.events.includes('cas'));
});
test('CLI dry-run creates no output; prepare is local and idempotent; destructive flag rejected', async t => {
  const dir=await mkdtemp(join(tmpdir(),'media-ef-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const sources=join(dir,'sources'),out=join(dir,'output');await mkdir(sources);await writeFile(join(sources,'old.png'),source);
  const input=join(dir,'snapshot.json');await writeFile(input,JSON.stringify(snapshot()));
  const exec=args=>spawnSync(process.execPath,['tools/media/cli.mjs','--snapshot',input,...args],{encoding:'utf8'});
  assert.equal(exec([]).status,0);assert.deepEqual((await readdir(dir)).sort(),['snapshot.json','sources']);
  const args=['--mode','prepare','--sources',sources,'--output',out];
  const first=exec(args);assert.equal(first.status,0,first.stderr);const files=await readdir(out);
  assert.equal(exec(args).status,0);assert.deepEqual(await readdir(out),files);
  assert.equal(hash(await readFile(join(sources,'old.png'))),hash(source));assert.equal(exec(['--delete','true']).status,1);
});

test('tampered plans are rejected before any publishing IO', async () => {
  for (const tamper of [
    p => { p.artifacts[0].path = p.source.path; },
    p => { p.patches[0].table = 'auth.users'; },
    p => { p.patches[0].replacement = 'https://unrelated.example/file'; },
    p => { p.source.bucket = 'reels'; },
    p => { p.artifacts.push(p.artifacts[0]); },
  ]) {
    const altered = structuredClone(plan); tamper(altered);
    const a = transport(); await assert.rejects(publishPrepared(altered, a, approval)); assert.deepEqual(a.events, []);
  }
});
test('unused duplicate variant remains a possible orphan, not safe to delete', () => {
  const s = snapshot();
  assert.equal(inspectObject({ bucket:'post-images',path:'u/duplicate--ppv1-post-thumb.webp' },s.tables).classification,'POSSIBLY ORPHANED — DO NOT DELETE');
});
test('a byte-identical master with no useful thumbnail is not copied again', async () => {
  const bytes = await sharp({ create:{width:40,height:40,channels:3,background:'blue'} }).webp().toBuffer();
  const r = await prepare(snapshot(), { readSource:async()=>bytes, transform:async()=>({ master:{bytes,width:40,height:40,ext:'webp'},thumbnail:null }), writeArtifact:async()=>{throw Error('Must not copy');} });
  assert.equal(r.results[0].status,'already-optimized'); assert.equal(r.results[0].plan,undefined);
});

test('report totals reflect prepared bytes and never claim safe deletion', () => {
  assert.equal(prepared.metrics.originalBytes,source.length);
  assert.equal(prepared.metrics.masterBytes,generated.master.bytes.length);
  assert.equal(prepared.metrics.thumbnailBytes,generated.thumbnail.bytes.length);
  assert.equal(prepared.metrics.safeToDelete,0);
});
test('second upload failure preserves the original and never switches any reference', async () => {
  const a=transport(),put=a.putIfAbsent;let calls=0;
  a.putIfAbsent=async(...args)=>{if(++calls===2)throw Error('master upload failed');await put(...args);};
  await assert.rejects(publishPrepared(plan,a,approval));
  assert.equal(a.records.posts.post.image_url,url);assert.ok(!a.events.includes('cas'));
  assert.equal(a.objects.get(`${object.bucket}/${object.path}`),source);
});
test('unsupported image input cannot produce replacement media', async () => {
  await assert.rejects(transform(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>'),'post'),/Unsupported/);
  await assert.rejects(transform(Buffer.alloc(0),'post'),/empty/);
});

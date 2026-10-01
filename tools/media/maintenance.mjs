/** Offline E/F tooling. No credentials, network client, or deletion capability. */
import { createHash } from 'node:crypto';
import sharp from 'sharp';

export const POLICY = 'ppe1';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fields = { posts: ['image_url'], post_images: ['image_url', 'storage_path'], profiles: ['avatar_url', 'cover_url'], reels: ['poster_url'] };
export const referenceTables = ['posts', 'post_images', 'profiles', 'reels', 'direct_messages', 'profile_showcases', 'live_streams', 'achievements', 'notifications', 'comments'];
const purposes = { 'post-images': 'post', avatars: 'avatar', 'profile-covers': 'cover', 'reel-posters': 'poster' };
export function objectKey(object) {
  if (!object || typeof object.bucket !== 'string' || !/^[a-z0-9-]+$/.test(object.bucket) || typeof object.path !== 'string' || !object.path || object.path.startsWith('/') || object.path.includes('\\') || object.path.split('/').some(p => !p || p === '.' || p === '..')) throw Error('Malformed object identity');
  return `${object.bucket}/${object.path}`;
}
function strings(value, path = []) {
  if (typeof value === 'string') return [{ value, path }];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => strings(child, [...path, key]));
}
function mentions(value, object) {
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* Preserve conservative raw matching. */ }
  return decoded.includes(objectKey(object)) || decoded === object.path;
}
function variantSibling(value, object) {
  // Phase D references only the master in the DB. Its thumbnail is nevertheless live.
  const match = value.match(/^(.*)--ppv1-(post|avatar)-m\d+x\d+-t\d+x\d+-(webp|png|jpg)\.(webp|png|jpg)(?:\?.*)?$/);
  return match ? mentions(`${match[1]}--ppv1-${match[2]}-thumb.${match[3]}`, object) : false;
}
export function inspectObject(object, tables) {
  objectKey(object);
  const references = [];
  let malformed = false;
  for (const [table, rows] of Object.entries(tables || {})) {
    if (!Array.isArray(rows)) { malformed = true; continue; }
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || !row.id) { malformed = true; continue; }
      for (const item of strings(row)) {
        if (mentions(item.value, object) || variantSibling(item.value, object)) {
          references.push({ table, id: row.id, field: item.path.join('.'), old: item.value, direct: item.path.length === 1 && Boolean(fields[table]?.includes(item.path[0])) && mentions(item.value, object) });
        }
      }
    }
  }
  const complete = referenceTables.every(table => Array.isArray(tables?.[table])) && !malformed;
  return { references, classification: references.length ? 'ACTIVE/REFERENCED' : complete ? 'POSSIBLY ORPHANED — DO NOT DELETE' : 'UNKNOWN — DO NOT DELETE', complete };
}
export function assertNoDestructiveMode(options) {
  if (options.delete || options.apply || options.cleanup) throw Error('Production/destructive modes are not implemented. No deletion or production mutation is permitted by this tool.');
}
function publicUrl(projectUrl, bucket, path) {
  const url = new URL(projectUrl);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('Expected a project origin without credentials');
  return `${url.origin}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
function replacements(refs, object, path, projectUrl) {
  const original = publicUrl(projectUrl, object.bucket, object.path);
  const replacement = publicUrl(projectUrl, object.bucket, path);
  return refs.map(ref => {
    const isPath = ref.table === 'post_images' && ref.field === 'storage_path' && ref.old === object.path;
    // Do not rewrite prose, signed URLs, transformed URLs, foreign origins or nested JSON.
    let canonical;
    try { canonical = new URL(ref.old).href; } catch { canonical = ''; }
    if (!ref.direct || (!isPath && canonical !== original)) throw Error('Unsupported/ambiguous reference: manual review required');
    return { table: ref.table, id: ref.id, field: ref.field, expected: ref.old, replacement: isPath ? path : replacement };
  });
}
export async function transform(bytes, purpose) {
  if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw Error('Source byte limit exceeded or empty source');
  const options = { limitInputPixels: 50_000_000, failOn: 'warning' };
  const metadata = await sharp(bytes, options).metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1 || metadata.width > 16384 || metadata.height > 16384) throw Error('Unsupported, animated or oversized source');
  const cap = { post: 2048, avatar: 512, cover: 1920, poster: 1280 }[purpose];
  if (!cap) throw Error('Unsupported media purpose');
  const { data, info } = await sharp(bytes, options).rotate().resize({ width: cap, height: purpose === 'cover' ? undefined : cap, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  if (info.height > 8192) throw Error('Cover exceeds height policy');
  const master = { bytes: data, width: info.width, height: info.height, ext: 'webp' };
  // Never inflate delivery bytes. If a smaller original is retained, use its decoded
  // orientation and original format, and require it already satisfies the policy.
  if (data.length >= bytes.length) {
    const oriented = metadata.autoOrient || metadata;
    if (oriented.width > cap || (purpose !== 'cover' && oriented.height > cap) || oriented.height > 8192) throw Error('No byte-saving replacement within policy');
    Object.assign(master, { bytes, width: oriented.width, height: oriented.height, ext: metadata.format === 'jpeg' ? 'jpg' : metadata.format });
  }
  const finalLimit = { post: 9_000_000, avatar: 2_000_000, cover: 9_000_000, poster: 9_000_000 }[purpose];
  if (master.bytes.length > finalLimit) throw Error('Prepared master exceeds safe final byte limit');
  let thumbnail = null;
  if (purpose === 'post' || purpose === 'avatar') {
    const limit = purpose === 'post' ? 1024 : 192;
    const result = await sharp(master.bytes, options).rotate().resize({ width: limit, height: limit, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    if (result.info.width < master.width && result.data.length < master.bytes.length) thumbnail = { bytes: result.data, width: result.info.width, height: result.info.height, ext: 'webp' };
  }
  return { master, thumbnail };
}
async function verify(image) {
  const decoded = await sharp(image.bytes, { limitInputPixels: 50_000_000 }).rotate().raw().toBuffer({ resolveWithObject: true });
  if (decoded.info.width !== image.width || decoded.info.height !== image.height) throw Error('Output dimension verification failed');
}
export async function runBatch(snapshot, io, options = {}) {
  assertNoDestructiveMode(options);
  const { mode = 'dry-run', offset = 0, limit = 10 } = options;
  if (!['dry-run', 'prepare'].includes(mode) || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) throw Error('Invalid mode/batch bounds');
  if (!Array.isArray(snapshot.objects) || !snapshot.tables || typeof snapshot.tables !== 'object') throw Error('Invalid snapshot');
  const keys = snapshot.objects.map((object, index) => { try { return objectKey(object); } catch { return `invalid:${index}`; } });
  const counts = new Map();
  for (const key of keys) counts.set(key, (counts.get(key) || 0) + 1);
  const duplicate = new Set([...counts].filter(([,count]) => count > 1).map(([key]) => key));
  const selected = snapshot.objects.map((object, index) => ({ object, key: keys[index] })).sort((a,b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0).slice(offset, offset + limit);
  const results = [];
  for (const { object, key } of selected) {
    const resultIndex = results.length;
    try {
      if (duplicate.has(key)) throw Error('Duplicate inventory identity');
      const inventory = inspectObject(object, snapshot.tables);
      const result = { key, classification: inventory.classification, status: 'skipped', reason: '', references: inventory.references.length };
      results.push(result);
      if (!inventory.complete) { result.reason = 'Incomplete/malformed reference snapshot'; continue; }
      if (!purposes[object.bucket] || !inventory.references.length) { result.reason = 'Unsupported bucket or no verified active reference'; continue; }
      if (/--ppv1-|--ppe1-/.test(object.path)) { result.status = 'already-optimized'; continue; }
      // Validate all reference locations before reading or transforming any bytes.
      replacements(inventory.references, object, object.path, snapshot.projectUrl);
      let purpose = purposes[object.bucket];
      if (object.bucket === 'post-images' && inventory.references.some(r => r.table === 'profiles' && r.field === 'avatar_url')) {
        if (inventory.references.some(r => r.table !== 'profiles' || r.field !== 'avatar_url')) throw Error('Mixed avatar/post use requires manual review');
        purpose = 'avatar';
      }
      result.purpose = purpose;
      if (mode === 'dry-run') { result.status = 'candidate'; continue; }
      const bytes = await io.readSource(object);
      const sourceHash = hash(bytes);
      if (object.sha256 && object.sha256 !== sourceHash) throw Error('Source checksum mismatch');
      const generated = await (io.transform || transform)(bytes, purpose);
      await verify(generated.master);
      if (generated.thumbnail) await verify(generated.thumbnail);
      const prefix = object.path.replace(/\.[^/.]+$/, '');
      const identity = hash(`${POLICY}\0${key}\0${sourceHash}`).slice(0, 24);
      const base = `${prefix}--${POLICY}-${identity}`;
      const m = generated.master, t = generated.thumbnail;
      if (t && (t.width >= m.width || t.height > m.height || t.bytes.length >= m.bytes.length)) throw Error('Invalid/nonbeneficial thumbnail');
      if (m.bytes.length > bytes.length) throw Error('Master byte increase rejected');
      if (!t && m.bytes.length === bytes.length) { result.status = 'already-optimized'; result.reason = 'No smaller master or useful thumbnail'; continue; }
      const masterPath = t ? `${base}--ppv1-${purpose}-m${m.width}x${m.height}-t${t.width}x${t.height}-${t.ext}.${m.ext}` : `${base}.${m.ext}`;
      const artifacts = [];
      for (const [path, image] of [...(t ? [[`${base}--ppv1-${purpose}-thumb.${t.ext}`, t]] : []), [masterPath, m]]) {
        const artifact = { bucket: object.bucket, path, sha256: hash(image.bytes), bytes: image.bytes.length, width: image.width, height: image.height };
        await io.writeArtifact(artifact, image.bytes); // Must create-if-absent or verify identical bytes.
        artifacts.push(artifact);
      }
      result.status = 'prepared';
      result.originalBytes = bytes.length;
      result.masterBytes = m.bytes.length;
      result.thumbnailBytes = t?.bytes.length || 0;
      result.masterDeliveryReduction = bytes.length - m.bytes.length;
      result.additionalStorageBytes = artifacts.reduce((sum,a) => sum + a.bytes, 0);
      result.plan = { policy: POLICY, source: { bucket: object.bucket, path: object.path, sha256: sourceHash }, artifacts, patches: replacements(inventory.references, object, masterPath, snapshot.projectUrl) };
      result.plan.rollback = result.plan.patches.map(p => ({ ...p, expected: p.replacement, replacement: p.expected }));
    } catch (error) {
      const previous = results.at(-1);
      const failure = { key, status: 'failed', reason: error.message, classification: 'UNKNOWN — DO NOT DELETE' };
      if (results.length > resultIndex) Object.assign(previous, failure); else results.push(failure);
    }
  }
  const metrics = {
    originalBytes: 0, masterBytes: 0, thumbnailBytes: 0, masterDeliveryReduction: 0, additionalStorageBytes: 0,
    potentiallyOrphaned: results.filter(r => r.classification === 'POSSIBLY ORPHANED — DO NOT DELETE').length,
    safeToDelete: 0,
  };
  for (const result of results.filter(r => r.status === 'prepared')) {
    for (const field of ['originalBytes','masterBytes','thumbnailBytes','masterDeliveryReduction','additionalStorageBytes']) metrics[field] += result[field];
  }
  return { policy: POLICY, mode, metrics, offset, nextOffset: offset + selected.length, totalObjects: snapshot.objects.length, results, summary: results.reduce((s,r) => { s[r.status] = (s[r.status] || 0) + 1; return s; }, {}) };
}

/** Future transport-independent publishing protocol. No production adapter supplied.
 * Adapter must implement durable journal writes, create-only uploads, verified reads,
 * and atomic per-row CAS. Originals are NEVER deleted. Failures are journalled and
 * thrown; the caller must stop this object, not retry blindly after an uncertain CAS.
 */
export async function publishPrepared(plan, adapter, options = {}) {
  assertNoDestructiveMode({ delete: options.delete, cleanup: options.cleanup });
  if (options.mode !== 'publish-approved') return { status: 'dry-run', plan };
  if (options.approval !== 'COPY_VERIFY_CAS_KEEP_ORIGINAL') throw Error('Separate explicit publishing approval required');
  validatePlan(plan);
  await adapter.journal({ stage: 'intent', plan });
  try {
    if (hash(await adapter.readObject(plan.source)) !== plan.source.sha256) throw Error('Source changed');
    for (const artifact of plan.artifacts) {
      const bytes = await adapter.readArtifact(artifact);
      if (hash(bytes) !== artifact.sha256) throw Error('Artifact checksum mismatch');
      await adapter.putIfAbsent(artifact, bytes);
      if (hash(await adapter.readObject(artifact)) !== artifact.sha256) throw Error('Uploaded object verification failed');
    }
    await adapter.journal({ stage: 'copies-verified', plan });
    const groups = Map.groupBy(plan.patches, p => JSON.stringify([p.table,p.id]));
    for (const patches of groups.values()) {
      const { table, id } = patches[0];
      const row = await adapter.readRow(table, id);
      if (!row) throw Error('Missing reference row');
      if (!patches.every(p => row[p.field] === p.replacement)) {
        if (!patches.every(p => row[p.field] === p.expected)) throw Error('Reference conflict');
        await adapter.compareAndSet(table, id, patches);
      }
      const verified = await adapter.readRow(table, id);
      if (!verified || !patches.every(p => verified[p.field] === p.replacement)) throw Error('Reference verification failed');
      await adapter.journal({ stage: 'reference-verified', table, id, patches });
    }
    await adapter.journal({ stage: 'complete', plan });
    return { status: 'complete' };
  } catch (error) {
    await adapter.journal({ stage: 'uncertain-or-failed', message: error.message, plan });
    throw error;
  }
}

function validatePlan(plan) {
  if (plan?.policy !== POLICY || !purposes[plan.source?.bucket] || !/^[a-f0-9]{64}$/.test(plan.source?.sha256)) throw Error('Invalid plan/source');
  objectKey(plan.source);
  if (!Array.isArray(plan.artifacts) || plan.artifacts.length < 1 || plan.artifacts.length > 2 || !Array.isArray(plan.patches) || !plan.patches.length || plan.patches.length > 100) throw Error('Invalid plan bounds');
  const seen = new Set();
  for (const artifact of plan.artifacts) {
    const key = objectKey(artifact);
    if (artifact.bucket !== plan.source.bucket || artifact.path === plan.source.path || !artifact.path.includes('--ppe1-') || !/^[a-f0-9]{64}$/.test(artifact.sha256) || seen.has(key)) throw Error('Invalid replacement identity');
    seen.add(key);
  }
  const master = plan.artifacts.at(-1);
  for (const patch of plan.patches) {
    if (!fields[patch.table]?.includes(patch.field) || typeof patch.id !== 'string' || !patch.id || typeof patch.expected !== 'string' || typeof patch.replacement !== 'string') throw Error('Invalid reference patch');
    if (patch.table === 'post_images' && patch.field === 'storage_path') {
      if (patch.expected !== plan.source.path || patch.replacement !== master.path) throw Error('Invalid path patch');
    } else {
      const origin = new URL(patch.expected).origin;
      if (patch.expected !== publicUrl(origin,plan.source.bucket,plan.source.path) || patch.replacement !== publicUrl(origin,master.bucket,master.path)) throw Error('Invalid URL patch');
    }
  }
}

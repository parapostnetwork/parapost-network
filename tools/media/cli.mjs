#!/usr/bin/env node
/** Local snapshots only. Intentionally has no Supabase client or network transport. */
import { readFile, realpath, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { runBatch, hash } from './maintenance.mjs';

const allowed = new Set(['snapshot', 'sources', 'output', 'mode', 'limit', 'offset']);
try {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const name = process.argv[i].replace(/^--/, '');
    if (!allowed.has(name) || args[name] !== undefined || !process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw Error('Unsupported/missing argument. No apply/delete/production mode exists.');
    args[name] = process.argv[i + 1];
  }
  if (!args.snapshot) throw Error('Required: --snapshot local-snapshot.json');
  if ((await stat(args.snapshot)).size > 20 * 1024 * 1024) throw Error('Snapshot exceeds 20 MiB; export a smaller inventory with complete reference coverage.');
  const snapshot = JSON.parse(await readFile(args.snapshot, 'utf8'));
  const mode = args.mode || 'dry-run';
  let sourceRoot, outputRoot;
  if (mode === 'prepare') {
    if (!args.sources || !args.output) throw Error('Prepare requires --sources and --output local directories');
    sourceRoot = await realpath(args.sources);
    outputRoot = resolve(args.output);
    if (outputRoot === sourceRoot || outputRoot.startsWith(sourceRoot + sep)) throw Error('Output must be separate from source directory');
    await mkdir(outputRoot, { recursive: true });
    outputRoot = await realpath(outputRoot);
    if (outputRoot === sourceRoot || outputRoot.startsWith(sourceRoot + sep)) throw Error('Output resolves into source directory');
  }
  async function createVerified(path, bytes) {
    try { await writeFile(path, bytes, { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (hash(await readFile(path)) !== hash(bytes)) throw Error('Existing output mismatch; nothing overwritten');
  }
  const report = await runBatch(snapshot, {
    readSource: async object => {
      if (typeof object.sourceFile !== 'string') throw Error('Missing local source file');
      const file = await realpath(resolve(sourceRoot, object.sourceFile));
      if (!file.startsWith(sourceRoot + sep)) throw Error('Source escapes approved local directory');
      if ((await stat(file)).size > 25 * 1024 * 1024) throw Error('Source exceeds 25 MiB');
      return readFile(file);
    },
    writeArtifact: async (artifact, bytes) => {
      await createVerified(resolve(outputRoot, artifact.sha256 + '.bin'), bytes);
    },
  }, { mode, offset: Number(args.offset || 0), limit: Number(args.limit || 10) });
  const json = JSON.stringify(report, null, 2) + '\n';
  if (mode === 'prepare') await createVerified(resolve(outputRoot, 'report-' + hash(json) + '.json'), json);
  // Reports contain only object/reference identities, not arbitrary source records.
  console.log(json);
} catch (error) {
  console.error('Media tooling stopped:', error.message);
  process.exitCode = 1;
}

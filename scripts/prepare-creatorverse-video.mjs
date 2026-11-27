import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync,
  copyFileSync, chmodSync, rmSync, statSync, realpathSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const vercel = process.env.VERCEL === '1';
const staging = process.env.VERCEL_ENV === 'preview' &&
  process.env.VERCEL_GIT_COMMIT_REF === 'staging';
const production = process.env.VERCEL_ENV === 'production';

if (vercel && (staging || production)) {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('Unsupported video verification platform');
  }

  const url = 'https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/download/autobuild-2026-10-31-12-59/ffmpeg-n9.0.2-39-g7adfbe40dc-linux64-lgpl-shared-9.0.tar.xz';
  const checksum = '5a58e2dffad4835ee3418939f2676d6898489f8e047299f5f62ee0da3f8dd5dc';

  const temporary = mkdtempSync(join(tmpdir(), 'cv-video-'));
  const destination = join(process.cwd(), 'vendor', 'creatorverse-video');

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(180000)
    });

    if (!response.ok) throw new Error('Video tools download failed');

    const bytes = Buffer.from(await response.arrayBuffer());

    if (createHash('sha256').update(bytes).digest('hex') !== checksum) {
      throw new Error('Video tools checksum mismatch');
    }

    const archive = join(temporary, 'ffmpeg.tar.xz');
    writeFileSync(archive, bytes);

    const entries = execFileSync('tar', ['-tJf', archive], {
      encoding: 'utf8'
    }).split('\n');

    const entry = entries.find(e => e.endsWith('/bin/ffmpeg'));
    if (!entry) throw new Error('Missing FFmpeg executable');

    execFileSync('tar', ['-xJf', archive, '-C', temporary]);

    const root = dirname(dirname(join(temporary, entry)));
    const libraryRoot = realpathSync(join(root, 'lib'));
    const libraries = join(destination, 'lib');

    mkdirSync(libraries, { recursive: true });

    const dependencies = new Map();

    for (const name of ['ffmpeg', 'ffprobe']) {
      const source = join(root, 'bin', name);
      const target = join(destination, name);

      const linked = execFileSync('ldd', [source], {
        encoding: 'utf8',
        env: {
          PATH: '/usr/bin:/bin',
          LD_LIBRARY_PATH: libraryRoot,
          LANG: 'C'
        }
      });

      if (linked.includes('not found')) {
        throw new Error('Missing video library: ' + linked);
      }

      for (const line of linked.split('\n')) {
        const match = line.match(/^\s*(\S+)\s+=>\s+(\/\S+)\s+\(/);
        if (!match) continue;

        const resolved = realpathSync(match[2]);

        if (resolved.startsWith(libraryRoot + '/')) {
          dependencies.set(match[1], resolved);
        }
      }

      copyFileSync(source, target);
      chmodSync(target, 0o755);
    }

    let totalBytes = 0;

    for (const [name, source] of dependencies) {
      const target = join(libraries, name);
      copyFileSync(source, target);
      totalBytes += statSync(target).size;
    }

    for (const name of ['ffmpeg', 'ffprobe']) {
      const target = join(destination, name);
      totalBytes += statSync(target).size;

      console.log(execFileSync(target, ['-version'], {
        encoding: 'utf8',
        env: {
          PATH: '/usr/bin:/bin',
          LD_LIBRARY_PATH: libraries,
          LANG: 'C'
        }
      }).split('\n')[0]);
    }

    console.log('Shared video tools installed:', totalBytes, 'bytes');

    if (totalBytes >= 220 * 1024 * 1024) {
      throw new Error('Shared video tools exceed reserved size budget');
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

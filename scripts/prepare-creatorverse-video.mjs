import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync,
  copyFileSync, chmodSync, rmSync, statSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const vercel = process.env.VERCEL === '1';
const staging = process.env.VERCEL_ENV === 'preview' &&
  process.env.VERCEL_GIT_COMMIT_REF === 'staging';
const production = process.env.VERCEL_ENV === 'production';

if (vercel && (staging || production)) {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('Unsupported video verification platform');
  }

  const url = 'https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/download/autobuild-2026-11-27-12-42/ffmpeg-n9.0.2-982-g836df4e858-linux64-lgpl-9.0.tar.xz';
  const checksum = '5214026246bf4a186b96d2d3e4ba45549d52651c4fa9dee947742d130796c40d';

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

    mkdirSync(destination, { recursive: true });

    let totalBytes = 0;

    for (const name of ['ffmpeg', 'ffprobe']) {
      const matches = entries.filter(entry =>
        entry.endsWith('/bin/' + name)
      );

      if (matches.length !== 1) {
        throw new Error('Unexpected archive layout');
      }

      execFileSync('tar', [
        '-xJf', archive, '-C', temporary, matches[0]
      ]);

      const target = join(destination, name);
      copyFileSync(join(temporary, matches[0]), target);
      chmodSync(target, 0o755);

      totalBytes += statSync(target).size;

      console.log(execFileSync(target, ['-version'], {
        encoding: 'utf8'
      }).split('\n')[0]);
    }

    if (totalBytes >= 250 * 1024 * 1024) {
      throw new Error('Video binaries exceed function size budget');
    }

    console.log('Video tools installed:', totalBytes, 'bytes');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

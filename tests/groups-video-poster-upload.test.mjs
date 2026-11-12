import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual groupUpload function with isolated transports.
// No Supabase connection, credentials, or remote writes.
function harness({ posterFails = false, videoFails = false, badPosterPath = false } = {}) {
  const calls = [];
  const videoPath = 'group/posts/post/uploader/video';
  const posterPath = `${videoPath}.poster.jpg`;

  const source = readFileSync(
    new URL('../lib/groups/client.ts', import.meta.url), 'utf8'
  );

  const dynamicImport = "await import('@/lib/reels/upload-lifecycle')";
  assert.ok(source.includes(dynamicImport), 'Poster generator import changed');

  const compiled = ts.transpileModule(
    source.replace(dynamicImport, 'await posterFactory()'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      }
    }
  ).outputText;

  const exports = {};
  const storage = {
    from(bucket) {
      assert.equal(bucket, 'group-media');
      return {
        async upload(path, blob, options) {
          calls.push({ kind: 'upload', path, type: options.contentType });
          if (path === videoPath && videoFails) {
            return { error: new Error('Video upload failed') };
          }
          if (path === posterPath && posterFails) {
            return { error: new Error('Poster upload failed') };
          }
          return { error: null };
        }
      };
    }
  };

  const validation = {
    validateUpload() {},
    matchesSignature() { return true; }
  };

  const requireMock = name => {
    if (name === '@/lib/supabase') return {
      supabase: {
        storage,
        auth: {
          getSession: async () => ({
            data: {
              session: { access_token: 'local-test-token' }
            },
            error: null
          })
        }
      }
    };
    if (name.includes('validation')) return validation;
    if (name.includes('shareErrors')) {
      return { shareErrorFromResponse: () => null };
    }
    throw Error(`Unexpected import: ${name}`);
  };

  vm.runInNewContext(compiled, {
    exports,
    require: requireMock,
    Blob,
    AbortController,
    Uint8Array,
    console,
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ kind: 'action', action: body.action });
      return {
        ok: true,
        json: async () => ({
          path: videoPath,
          poster_path: badPosterPath ? 'wrong/poster.jpg' : posterPath
        })
      };
    },
    posterFactory: async () => ({
      generatePosterFromFile: async () => {
        calls.push({ kind: 'generate' });
        return new Blob([new Uint8Array([255, 216, 255])], {
          type: 'image/jpeg'
        });
      }
    })
  });

  const file = new Blob(
    [new TextEncoder().encode('0000ftypisom')],
    { type: 'video/mp4' }
  );

  return { upload: () => exports.groupUpload('group', file, 'post'), calls, videoPath, posterPath };
}

test('video uploads before its JPEG poster', async () => {
  const h = harness();
  await h.upload();

  assert.deepEqual(
    h.calls.map(call => call.kind === 'action' ? call.action : call.kind),
    ['reserve_media', 'upload', 'generate', 'upload']
  );
  assert.equal(h.calls[1].path, h.videoPath);
  assert.equal(h.calls[3].path, h.posterPath);
  assert.equal(h.calls[3].type, 'image/jpeg');
});

test('failed poster upload does not fail the video upload', async () => {
  const h = harness({ posterFails: true });
  await assert.doesNotReject(h.upload());
  assert.equal(h.calls.filter(c => c.kind === 'upload').length, 2);
});

test('failed original video upload stops poster generation', async () => {
  const h = harness({ videoFails: true });
  await assert.rejects(h.upload(), /Upload failed/);
  assert.equal(h.calls.some(c => c.kind === 'generate'), false);
});

test('unexpected poster destination is never uploaded', async () => {
  const h = harness({ badPosterPath: true });
  await h.upload();
  assert.equal(h.calls.some(c => c.kind === 'generate'), false);
  assert.equal(h.calls.filter(c => c.kind === 'upload').length, 1);
});

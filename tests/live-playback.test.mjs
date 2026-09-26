import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { canPlayPublishedStream } from '../lib/live/playback.ts';

const published = { id: 'show', title: 'Scheduled show', provider: 'youtube', status: 'upcoming', visibility: 'public', is_hidden: false, embed_url: 'https://www.youtube.com/embed/abcdefghijk' };

test('published YouTube waiting player does not depend on owner saving or changing status', () => {
  assert.equal(canPlayPublishedStream(published), true);
  for (const status of ['live', 'ended']) assert.equal(canPlayPublishedStream({ ...published, status }), true);
  for (const status of ['draft', 'cancelled', null]) assert.equal(canPlayPublishedStream({ ...published, status }), false);
  for (const visibility of ['private', 'friends', null]) assert.equal(canPlayPublishedStream({ ...published, visibility }), false);
  assert.equal(canPlayPublishedStream({ ...published, is_hidden: true }), false);
  assert.equal(canPlayPublishedStream({ ...published, embed_url: null }), false);
  assert.equal(canPlayPublishedStream({ ...published, provider: 'twitch' }), false);
  assert.equal(canPlayPublishedStream({ ...published, provider: 'twitch', status: 'live' }), true);
});

// Evaluate the actual media conditional from each page, so a second JSX status
// gate cannot silently override the shared playback predicate.
for (const [file, prefix] of [['app/dashboard/page.tsx', 'dashboard'], ['app/profile/[id]/page.tsx', 'profile']]) {
  test(`${prefix} renders the same iframe for upcoming, live and replay`, () => {
    const source = ts.createSourceFile(file, readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let media;
    function visit(node) {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'iframe' && node.getText(source).includes(`${prefix}-live-player-`)) {
        let parent = node.parent;
        while (parent && !ts.isConditionalExpression(parent)) parent = parent.parent;
        media = parent;
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(media, 'live media conditional found');
    const js = ts.transpileModule(`(${media.getText(source)})`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
    const renders = ['upcoming', 'live', 'ended'].map(status => {
      const stream = { ...published, status };
      return vm.runInNewContext(js, {
        React: { createElement: (tag, props) => ({ tag, props }) },
        stream, item: stream, isLive: status === 'live', isReplay: status === 'ended',
        isPlayable: canPlayPublishedStream(stream), liveEmbedUrl: canPlayPublishedStream(stream) ? stream.embed_url : '',
      });
    });
    for (const rendered of renders) {
      assert.equal(rendered.tag, 'iframe');
      assert.equal(rendered.props.src, published.embed_url);
      assert.equal(rendered.props.id, `${prefix}-live-player-show`);
    }
  });
}

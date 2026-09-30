import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const surfaces = [
  ['main share', 'app/reels/page.tsx', 'activeReel.poster'],
  ['profile share', 'app/profile/[id]/reels/view/page.tsx', 'activeReel.poster'],
  ['profile gallery', 'app/profile/[id]/reels/page.tsx', 'reel.poster_url'],
  ['embedded gallery', 'app/profile/[id]/page.tsx', 'reel.poster_url'],
];
function parse(path) {
  return ts.createSourceFile(path, readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function find(root, predicate) {
  const matches = [];
  function visit(node) { if (predicate(node)) matches.push(node); ts.forEachChild(node, visit); }
  visit(root);
  return matches;
}
function evaluate(expression, bindings) {
  const js = ts.transpileModule(`(${expression})`, {compilerOptions: {jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020}}).outputText;
  return vm.runInNewContext(js, {React, ...bindings});
}
for (const [name, path, condition] of surfaces) {
  const root = parse(path);
  const branches = find(root, n => ts.isConditionalExpression(n) && n.condition.getText(root) === condition);
  assert.equal(branches.length, 1, `${name}: identify the actual preview branch`);
  for (const poster of ['https://media.example/poster.jpg', null]) {
    test(`${name}: ${poster ? 'poster renders' : 'static fallback'} without video requests`, () => {
      const reel = {poster, poster_url: poster, video: 'https://media.example/movie.mp4', video_url: 'https://media.example/movie.mp4', title: 'Test Reel'};
      const markup = renderToStaticMarkup(evaluate(branches[0].getText(root), {reel, activeReel: reel, reelTitle: 'Test Reel', miniReelVideoStyle: {}}));
      assert.doesNotMatch(markup, /<video|<source|movie\.mp4/);
      if (poster) {
        assert.match(markup, /<img/);
        assert.match(markup, /src="https:\/\/media.example\/poster.jpg"/);
        assert.match(markup, /alt="[^"]+"/);
      } else {
        assert.doesNotMatch(markup, /src=|<img/);
        assert.match(markup, /aria-label="Reel preview unavailable"/);
      }
    });
  }
  if (name.includes('gallery')) test(`${name}: thumbnail remains inside the actual Reel viewer link`, () => {
    let link = branches[0].parent;
    while (link && !(ts.isJsxElement(link) && link.openingElement.tagName.getText(root) === 'Link')) link = link.parent;
    assert.ok(link);
    const href = link.openingElement.attributes.properties.find(p => p.name?.getText(root) === 'href');
    assert.ok(href && ts.isJsxExpression(href.initializer));
    assert.equal(evaluate(href.initializer.expression.getText(root), {profileId: 'creator', reel: {id: 'reel-123'}}), '/profile/creator/reels/view?reelId=reel-123');
  });
}

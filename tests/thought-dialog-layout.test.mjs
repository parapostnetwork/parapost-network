import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import vm from 'node:vm';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
const require = createRequire(import.meta.url);
const bubble = readFileSync(new URL('../components/ProfileThoughtBubble.tsx', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../app/profile/[id]/page.tsx', import.meta.url), 'utf8');
const hookSource = readFileSync(new URL('../lib/thoughts/use-thought-viewport.ts', import.meta.url), 'utf8');
function find(source, predicate) {
  const file = ts.createSourceFile('fixture.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result;
  function walk(node) { if (!result && predicate(node)) result = node.getText(file); if (!result) ts.forEachChild(node, walk); }
  walk(file);
  assert.ok(result, 'actual Thought JSX must be found');
  return result;
}
function fixture(kind, long = false, height, top = 0) {
  const state = {closed: false, shared: false};
  let jsx;
  if (kind === 'component') {
    const declaration = find(bubble, n => ts.isVariableDeclaration(n) && n.name.getText() === 'composerNode');
    jsx = declaration.slice(declaration.indexOf('=') + 1);
  } else {
    const id = kind === 'viewer' ? 'profile-thought-viewer-title' : 'desktop-thought-composer-title';
    const call = find(profile, n => ts.isCallExpression(n) && n.expression.getText() === 'createPortal' && n.arguments[0]?.getText().includes(id));
    jsx = call; // createPortal is stubbed to preserve its actual first argument.
  }
  const thought = long ? 'A long thought with spaces and wrapping to fill sixty letters!'.slice(0,60) : 'Hi';
  const viewport = {'--thought-height': height ? `${height}px` : '100dvh', top, bottom:'auto', height:'var(--thought-height)', boxSizing:'border-box'};
  const close = () => { state.closed = true; };
  const ctx = {exports:{},require, document:{body:{}}, createPortal: x => x, composerOpen:true, thoughtViewport:viewport,
    draft:thought, audience:'friends', sharing:false, shareError:long ? 'A lengthy validation message. '.repeat(15) : '', avatarUrl:null,
    setComposerOpen:close, setDraft(){}, setAudience(){}, submitThought(){state.shared=true;},
    profileThought:{text:long ? thought.repeat(8) : thought,audience:'friends'}, profile:null, profileDisplayInitial:'P', profileDisplayName:'Profile',
    setProfileThoughtViewerOpen:close, setDesktopThoughtComposerOpen:close, desktopThoughtDraft:thought, desktopThoughtSharing:false,
    desktopThoughtAudience:'friends', desktopThoughtError:long ? 'A lengthy validation message. '.repeat(15) : '', viewerAvatarUrl:null,
    setDesktopThoughtDraft(){}, setDesktopThoughtAudience(){}, submitDesktopProfileThought(){state.shared=true;}};
  const js = ts.transpileModule(`globalThis.tree = (${jsx});`, {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(js, ctx);
  return {tree:ctx.tree,state};
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  const children = tree.props?.children;
  return [...(predicate(tree) ? [tree] : []), ...(Array.isArray(children) ? children : [children]).flatMap(x=>nodes(x,predicate))];
}
const css = bubble.match(/<style jsx global>\{`([\s\S]*?)`\}<\/style>/)[1];
function html(kind, long, height, top) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial;background:#15121d}${css}</style></head><body>${renderToStaticMarkup(fixture(kind,long,height,top).tree)}</body></html>`;
}
// Local, SELECT-free browser fixture: renders the actual JSX/CSS above, no backend.
// node tests/thought-dialog-layout.test.mjs --serve
if (process.argv.includes('--serve')) {
  const sizes = [[667,320],[740,360],[844,390],[915,412],[768,1024],[1024,768],[800,1280],[1280,800],[500,400],[1440,900],[1200,320],[600,450],[390,699],[699,360],[700,360],[720,360],[721,360],[1100,500],[1101,500],[844,200],[844,180]];
  createServer((req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    res.setHeader('Content-Type','text/html; charset=utf-8');
    if(url.pathname==='/matrix') {
      const frames = sizes.flatMap(([w,h])=>['component','desktop','viewer'].flatMap(kind=>[false,true].map(long=>`<iframe title="${kind}-${w}x${h}-${long?'long':'short'}" width="${w}" height="${h}" style="border:0;display:block" src="/?kind=${kind}&long=${long}"></iframe>`)));
      frames.push('<iframe title="component-keyboard" width="390" height="844" style="border:0" src="/?kind=component&long=true&height=260&top=40"></iframe>');
      res.end('<!doctype html><body>'+frames.join('')+'</body>');
    } else res.end(html(url.searchParams.get('kind')||'component',url.searchParams.get('long')==='true',Number(url.searchParams.get('height'))||undefined,Number(url.searchParams.get('top'))||0));
  }).listen(4317,'127.0.0.1',()=>console.log('Thought fixtures: http://127.0.0.1:4317/matrix'));
} else {
  for(const kind of ['component','desktop','viewer']) for(const long of [false,true]) {
    test(`${kind} ${long?'long':'short'} content preserves close, header and action structure`,()=>{
      const {tree,state}=fixture(kind,long);
      assert.equal(nodes(tree,n=>n.props?.role==='dialog').length,1);
      const header=nodes(tree,n=>n.type==='header')[0];
      const close=nodes(header,n=>n.type==='button' && n.props['aria-label']?.startsWith('Close'))[0];
      close.props.onClick(); assert.equal(state.closed,true); assert.equal(state.shared,false);
      if(kind!=='viewer') assert.equal(nodes(tree,n=>n.type==='footer').length,1);
      const markup=html(kind,long);
      assert.match(markup,/--thought-height/);
      assert.ok(!/min-height:(640|430)px/.test(markup));
    });
  }
  test('viewport follows keyboard resize/pan and removes all listeners',()=>{
    const visual=new EventTarget(); Object.assign(visual,{height:300,offsetTop:40});
    const win=new EventTarget(); Object.assign(win,{visualViewport:visual,innerHeight:800});
    let state=null,effect,writes=0;
    const exports={};
    const code=ts.transpileModule(hookSource,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
    vm.runInNewContext(code,{exports,window:win,require:()=>({useState:()=>[state,v=>{state=v;writes++;}],useEffect:fn=>{effect=fn;}})});
    const render=()=>exports.useThoughtViewport(true);
    assert.equal(render().height,'var(--thought-height)');const cleanup=effect();
    assert.equal(render()['--thought-height'],'300px');assert.equal(render().top,40);
    visual.height=240; visual.offsetTop=55;visual.dispatchEvent(new Event('resize'));visual.dispatchEvent(new Event('scroll'));
    assert.equal(render()['--thought-height'],'240px');assert.equal(render().top,55);
    cleanup();const before=writes;visual.dispatchEvent(new Event('resize'));visual.dispatchEvent(new Event('scroll'));win.dispatchEvent(new Event('resize'));assert.equal(writes,before);
  });
  test('composer keeps Thought-specific safe-area insets and internal textarea scrolling',()=>{
    assert.match(css,/env\(safe-area-inset-top\)/);assert.match(css,/env\(safe-area-inset-bottom\)/);
    assert.match(css,/\.thought-input-wrap textarea\s*\{[^}]*overflow-y: auto/);
    assert.match(css,/\.thought-composer-body\s*\{[^}]*min-height: 0;[^}]*overflow-y: auto/);
  });
}

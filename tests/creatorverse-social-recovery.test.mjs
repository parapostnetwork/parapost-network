import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tick = () => new Promise(resolve => setImmediate(resolve));
const defer = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
function load(path, deps, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText, {exports, ...globals, require(name) { assert.ok(name in deps, name); return deps[name]; }});
  return exports;
}
const auth = { data: {session: {access_token: 'token', user: {id: id(1)}}}};
function clientHarness() {
  let session = auth, response = {ok: true, json: async () => ({id:id(9)})}; const calls=[];
  const client = load('lib/creatorverse/social-client.ts', {'@/lib/supabase': {supabase:{auth:{getSession:async()=>session}}}}, {
    fetch: async (...args) => {calls.push(args); if(response instanceof Error) throw response; return response;},
  });
  return {client,calls,setSession:v=>session=v,setResponse:v=>response=v};
}
const input = {pageId:id(2),postId:id(3),action:'comment',requestId:id(4),content:'Hello',targetId:null};
test('interaction client binds the request to the displayed account and never sends after switching', async()=>{
  const h=clientHarness(); await h.client.submitCreatorVerseInteraction(input,id(1));
  assert.equal(h.calls.length,1); assert.equal(h.calls[0][1].headers.Authorization,'Bearer token');
  h.setSession({data:{session:{access_token:'other',user:{id:id(8)}}}});
  await assert.rejects(h.client.submitCreatorVerseInteraction(input,id(1)),/account changed/); assert.equal(h.calls.length,1);
});
test('permission rejection is definitive; server failure and invalid success remain uncertain',async()=>{
  const h=clientHarness();
  for(const [status,uncertain] of [[403,false],[429,false],[503,true]]) {
    h.setResponse({ok:false,status,json:async()=>({error:'Denied'})});
    await assert.rejects(h.client.submitCreatorVerseInteraction(input,id(1)),e=>e.uncertain===uncertain);
  }
  h.setResponse({ok:true,json:async()=>({})});
  await assert.rejects(h.client.submitCreatorVerseInteraction(input,id(1)),e=>e.uncertain===true);
});
function componentHarness() {
  const slots=[]; let cursor=0, cleanup, n=20, result, readError='', retries=0, writes=0;
  const calls=[], events=[];
  const original={like_count:1,comment_count:2,share_count:0,liked_by_me:false,comments:[
    {id:id(5),author_id:id(8),post_id:id(3),parent_id:null,content:'Root',created_at:'2026-11-17T00:00:00Z'},
    {id:id(6),author_id:id(1),post_id:id(3),parent_id:id(5),content:'Reply',created_at:'2026-11-17T00:00:00Z'},
  ]};
  let data=original;
  const client=clientHarness().client;
  const jsx=(type,props,key)=>({type,props:props??{},key});
  const component=load('app/creatorverse/CreatorVersePostActions.tsx',{
    react:{useState(initial){const i=cursor++;if(!(i in slots)) slots[i]=initial;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},
      useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},useEffect(fn){if(!cleanup)cleanup=fn();}},
    'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{default:'a'},
    '@/lib/groups/useGroupSession':{useGroupSession:()=>({ready:true,userId:id(1)})},
    '@/lib/creatorverse/usePublicRead':{usePublicRead:()=>({data,error:readError,loading:false,retry(){retries++;data=null;readError='offline';}})},
    '@/lib/creatorverse/engagement':load('lib/creatorverse/engagement.ts',{}),
    '@/lib/creatorverse/social-client':{...client,submitCreatorVerseInteraction:async(...args)=>{calls.push(args);writes++;if(result instanceof Error || result instanceof client.CreatorVerseInteractionError)throw result; if(result)await result;}},
    '@/components/PostActionIcons':{HeartIcon:'heart',CommentIcon:'comment',ShareIcon:'share'},
    './CreatorVersePostActions.module.css':{default:{}},
  },{crypto:{randomUUID:()=>id(n++)},process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://vmgelrgrtpghmvqgufzz.supabase.co',NEXT_PUBLIC_CREATORVERSE_SOCIAL_UI_ENABLED:'true'}},
    window:{dispatchEvent:e=>events.push(e)},Event,Date});
  const outer=component.default({pageId:id(2),postId:id(3),commentsEnabled:true});
  const render=()=>{cursor=0;return outer.type(outer.props);};
  function walk(node) {if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(walk);return[node,...walk(node.props?.children)];}
  const nodes=()=>walk(render());
  const button=label=>{const b=nodes().find(x=>x.type==='button'&&(x.props['aria-label']===label||x.props.children===label));assert.ok(b,label);return b;};
  const click=label=>{const b=button(label);assert.ok(!b.props.disabled,`${label} disabled`);b.props.onClick();};
  render();
  return {render,nodes,button,click,calls,events,client,outer,setResult:v=>result=v,
    setData:v=>data=v,dispose:()=>cleanup(),get retries(){return retries;},get writes(){return writes;},
    write(text){nodes().find(x=>x.type==='textarea').props.onChange({target:{value:text}});}};
}
test('uncertain comment retries keep one request ID and freeze further submissions',async()=>{
  const h=componentHarness();h.click('Comments');h.write('Hello');h.setResult(new Error('offline'));h.click('Post comment');await tick();
  assert.equal(h.button('Post comment').props.disabled,true);h.setResult(null);h.click('Retry action');await tick();
  assert.equal(h.calls.length,2);assert.equal(h.calls[0][0].requestId,h.calls[1][0].requestId);assert.equal(h.calls[1][1],id(1));
  assert.equal(h.nodes().find(x=>x.type==='textarea').props.value,'');
});
test('successful comment with failed refresh exposes read retry, never a write retry',async()=>{
  const h=componentHarness();h.click('Comments');h.write('Sent');h.click('Post comment');await tick();
  assert.equal(h.writes,1);assert.equal(h.retries,1);h.click('Retry loading');assert.equal(h.writes,1);
  assert.equal(h.nodes().some(x=>x.props.children==='Retry action'),false);
});
test('double clicks during an in-flight request send only once',async()=>{
  const h=componentHarness(),d=defer();h.setResult(d.promise);const b=h.button('Like post');b.props.onClick();b.props.onClick();
  assert.equal(h.writes,1);d.resolve();await tick();
});
test('reply to a reply targets its root and own-comment deletion keeps the selected ID',async()=>{
  const h=componentHarness();h.click('Comments');
  const replies=h.nodes().filter(x=>x.type==='button'&&x.props.children==='Reply');replies[1].props.onClick();h.write('Nested reply');h.click('Post comment');await tick();
  assert.equal(h.calls[0][0].targetId,id(5));
  const d=componentHarness();d.click('Comments');d.click('Delete');await tick();assert.equal(d.calls[0][0].targetId,id(6));
});
test('rejected permission leaves text editable and does not offer an uncertain retry',async()=>{
  const h=componentHarness();h.setResult(new h.client.CreatorVerseInteractionError('Not permitted'));
  h.click('Comments');h.write('Keep this');h.click('Post comment');await tick();
  assert.equal(h.button('Post comment').props.disabled,false);assert.equal(h.nodes().find(x=>x.type==='textarea').props.value,'Keep this');
});
test('late mutation results after account/source unmount do not refresh or broadcast',async()=>{
  const h=componentHarness(),d=defer();h.setResult(d.promise);h.click('Share post');
  const submit=h.nodes().filter(x=>x.type==='button'&&x.props.children==='Share post')[0];submit.props.onClick();h.dispose();d.resolve();await tick();
  assert.equal(h.retries,0);assert.equal(h.events.length,0);
  assert.ok(h.outer.key.includes(id(1))&&h.outer.key.includes(id(3)));
});

test('malformed engagement displays a read retry and disables mutations instead of inventing counts',()=>{
 const h=componentHarness();h.setData({comments:'bad',like_count:NaN});
 assert.equal(h.button('Like post').props.disabled,true);
 h.click('Retry loading');assert.equal(h.writes,0);
});
test('shared comments use the same authenticated engagement snapshot and fail closed when disabled',()=>{
 const parse=load('lib/creatorverse/engagement.ts',{}).parseCreatorVerseEngagement;
 const row={like_count:0,comment_count:0,share_count:0,liked_by_me:false,comments_enabled:true,comments:[]};
 assert.equal(parse(row,id(3)).comments_enabled,true);
 assert.equal(parse({...row,comments:[{id:id(6),author_id:id(1),post_id:id(9),parent_id:null,content:'Wrong post',created_at:'2026-11-18'}]},id(3)),null);
 assert.equal(parse({...row,share_count:-1},id(3)),null);
});

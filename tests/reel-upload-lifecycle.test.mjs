import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createUploadAttempt, getVideoDuration, generatePosterFromFile } from '../lib/reels/upload-lifecycle.ts';

const flush = async () => { for(let i=0;i<12;i++) await Promise.resolve(); };
function media(t) {
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const videos=[],revoked=[];let blobCallback;
  const previous={document:globalThis.document,window:globalThis.window};
  globalThis.window={setTimeout,clearTimeout};
  globalThis.document={createElement(kind){if(kind==='canvas')return {getContext:()=>({drawImage(){}}),toBlob(cb){blobCallback=cb;}};
    const video={duration:6,currentTime:0,readyState:4,seeking:false,videoWidth:720,videoHeight:1280,load(){},removeAttribute(){this.removed=true;}};videos.push(video);return video;}};
  t.mock.method(URL,'createObjectURL',()=>`blob:${videos.length}`);
  t.mock.method(URL,'revokeObjectURL',url=>revoked.push(url));
  t.after(()=>Object.assign(globalThis,previous));
  return {videos,revoked,blob:()=>blobCallback};
}
test('metadata preserves mobile duration settling and cleans listeners',async t=>{
  const h=media(t),c=new AbortController();const p=getVideoDuration(new Blob(),c.signal);h.videos[0].onloadedmetadata();t.mock.timers.tick(1500);assert.equal(await p,6);assert.equal(h.revoked.length,1);assert.equal(h.videos[0].onseeked,null);
});
test('metadata missing event times out; repeated cancel is harmless',async t=>{
  const h=media(t),c=new AbortController();const p=getVideoDuration(new Blob(),c.signal);const rejected=assert.rejects(p,/Could not read/);t.mock.timers.tick(8000);await rejected;c.abort();c.abort();assert.equal(h.revoked.length,1);assert.equal(h.videos[0].onloadedmetadata,null);
});
for(const stage of ['metadata','seek','blob'])test(`poster ${stage} stall times out and releases resources`,async t=>{
  const h=media(t),c=new AbortController();const p=generatePosterFromFile(new Blob(),c.signal);const rejected=assert.rejects(p,/too long/);
  if(stage!=='metadata')h.videos[0].onloadedmetadata();if(stage==='blob')h.videos[0].onseeked();
  t.mock.timers.tick(30000);await rejected;h.blob()?.(new Blob());assert.equal(h.revoked.length,1);assert.equal(h.videos[0].onseeked,null);
});
test('poster success and late canvas callback after cancellation',async t=>{
  const h=media(t),c=new AbortController();const p=generatePosterFromFile(new Blob(),c.signal);h.videos[0].onloadedmetadata();h.videos[0].onseeked();const blob=new Blob();h.blob()(blob);assert.equal(await p,blob);
  const c2=new AbortController(),p2=generatePosterFromFile(blob,c2.signal);const rejected=assert.rejects(p2,/cancelled/);h.videos[1].onloadedmetadata();h.videos[1].onseeked();c2.abort();await rejected;h.blob()(blob);assert.equal(h.revoked.length,2);
});
test('cancellation consumes late network rejection and bounded wait aborts attempt',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let reject;const a=createUploadAttempt();const p=a.wait(new Promise((_,r)=>{reject=r;}));const check=assert.rejects(p,/cancelled/);a.cancel();a.cancel();await check;reject(new Error('late'));await flush();
  const b=createUploadAttempt(),q=b.wait(new Promise(()=>{}),100);const timeout=assert.rejects(q,/too long/);t.mock.timers.tick(100);await timeout;assert.equal(b.signal.aborted,true);
});

// Execute the real component handlers with deterministic hooks and transport.
// JSX is replaced only at the render boundary; upload/cancel code is unchanged.
function modal(t,{stage='success',failure=null,onSuccess,onRefresh}={}) {
  t.mock.timers.enable({apis:['setTimeout','Date']});
  let source=readFileSync(new URL('../app/reels/ReelUploadModal.tsx',import.meta.url),'utf8');
  source=source.replace('  if (!isOpen) return null;', '  return { processVideoFile, handleUpload, handleClose, handleRemoveVideo, isUploading, isPreparing, errorMessage };\n  if (!isOpen) return null;');
  const slots=[],effects=[],cleanups=[],calls={uploads:[],removes:[],inserts:0,success:0,close:0,scroll:0,refresh:0,writes:0};let cursor=0,initial=true,resolvePending;
  const deferred=()=>new Promise(resolve=>{resolvePending=resolve;});
  const hooks={useRef(value){const i=cursor++;return slots[i]??=( {current:value} );},useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],v=>{calls.writes++;slots[i]=typeof v==='function'?v(slots[i]):v;}];},useMemo(fn){return fn();},useEffect(fn){if(initial)effects.push(fn);}};
  const win=new EventTarget();Object.assign(win,{innerWidth:400,setTimeout,clearTimeout,scrollTo(){calls.scroll++;}});win.addEventListener('reels-refresh',()=>{calls.refresh++;onRefresh?.();});
  const storage={from(bucket){return {upload(path){calls.uploads.push({bucket,path});if(stage===bucket)return deferred();return Promise.resolve({error:failure===bucket?{message:'storage failed'}:null});},remove(paths){calls.removes.push({bucket,paths});return Promise.resolve({error:null});},getPublicUrl(path){return {data:{publicUrl:'https://example.invalid/'+path}};}};}};
  const client={storage,from(){const q={select(){return q;},eq(){return q;},maybeSingle(){return Promise.resolve({data:null});},insert(){calls.inserts++;return q;},abortSignal(){return q;},single(){return stage==='database'?deferred():Promise.resolve({data:{id:'saved'},error:failure==='database'?{message:'save failed'}:null});}};return q;}};
  let durationCalls=0;
  const helper={createUploadAttempt,getVideoDuration:async()=>{durationCalls++;return stage==='metadata'||(stage==='confirm'&&durationCalls>1)?deferred():6;},generatePosterFromFile:async()=>stage==='poster'?deferred():new Blob()};
  const exports={};const context={exports,require(name){if(name==='react')return hooks;if(name==='@/lib/supabase')return {supabase:client};if(name==='@/lib/reels/upload-lifecycle')return helper;if(name==='react/jsx-runtime')return {};throw new Error(name);},window:win,document:{body:{style:{overflow:''}}},URL:{createObjectURL:()=>'',revokeObjectURL(){}},console,Event,Date,Blob,AbortController};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,context);
  const props={isOpen:true,userId:'me',onClose(){calls.close++;},onUploadSuccess(){calls.success++;onSuccess?.();}};
  const render=()=>{cursor=0;const handlers=exports.default(props);if(initial){initial=false;effects.splice(0).forEach(fn=>{const cleanup=fn();if(cleanup)cleanups.push(cleanup);});}return handlers;};
  let handlers=render();
  const select=async()=>{await handlers.processVideoFile({type:'video/mp4',name:'test.mp4'});handlers=render();};
  const unmount=()=>{cleanups.forEach(fn=>fn());};t.after(unmount);
  return {calls,render,select,unmount,window:win,get handlers(){return handlers;},setStage(value){stage=value;},get pendingResolution(){return resolvePending;},resolve(value){resolvePending(value);}};
}
test('normal selection, validation, uploads and single insert retain success behavior',async t=>{
  const h=modal(t);await h.select();await h.handlers.handleUpload();assert.equal(h.calls.uploads.length,2);assert.equal(h.calls.inserts,1);assert.equal(h.calls.success,1);assert.equal(h.calls.close,1);assert.equal(h.calls.refresh,1);assert.equal(h.calls.scroll,1);assert.equal(h.calls.removes.length,0);
});
test('close before upload is idempotent',async t=>{const h=modal(t);h.handlers.handleClose();h.handlers.handleClose();await h.handlers.handleUpload();assert.equal(h.calls.close,1);assert.equal(h.calls.uploads.length,0);});
for(const stage of ['confirm','poster','reels','reel-posters','database'])for(const exit of ['close','escape','unmount'])test(`${exit} during ${stage} ignores late completion`,async t=>{
  const h=modal(t,{stage});await h.select();const work=h.handlers.handleUpload();await flush();
  // Duplicate publish events must never start another attempt.
  await h.handlers.handleUpload();
  if(exit==='close')h.handlers.handleClose();if(exit==='escape'){const e=new Event('keydown');e.key='Escape';h.window.dispatchEvent(e);}if(exit==='unmount')h.unmount();
  await flush();const writes=h.calls.writes;
  h.resolve(stage==='confirm'?6:stage==='poster'?new Blob():{data:{id:'saved'},error:null});await work;await flush();
  assert.equal(h.calls.writes,writes);assert.equal(h.calls.success,0);assert.equal(h.calls.scroll,0);assert.equal(h.calls.refresh,0);assert.equal(h.calls.inserts,stage==='database'?1:0);
  if(stage==='database')assert.equal(h.calls.removes.length,0);
  if(['reels','reel-posters'].includes(stage))assert.ok(h.calls.removes.length>0);
});
for(const failure of ['reels','reel-posters','database'])test(`${failure} failure restores controls and permits dismissal`,async t=>{
 const h=modal(t,{failure});await h.select();await h.handlers.handleUpload();const state=h.render();assert.equal(state.isUploading,false);assert.equal(state.isPreparing,false);assert.ok(state.errorMessage);state.handleClose();assert.equal(h.calls.close,1);assert.equal(h.calls.success,0);
});
test('storage timeout releases UI without waiting for cleanup and late success cannot insert',async t=>{
 const h=modal(t,{stage:'reels'});await h.select();const p=h.handlers.handleUpload();await flush();t.mock.timers.tick(300000);await p;assert.equal(h.render().isUploading,false);h.resolve({error:null});await flush();assert.equal(h.calls.inserts,0);assert.equal(h.calls.success,0);
});

test('database timeout is uncertain, retains media, and never automatically retries insert',async t=>{
 const h=modal(t,{stage:'database'});await h.select();const p=h.handlers.handleUpload();await flush();await flush();assert.equal(h.calls.inserts,1);t.mock.timers.tick(60000);await p;
 assert.match(h.render().errorMessage,/may already have published/);assert.equal(h.calls.removes.length,0);assert.equal(h.calls.inserts,1);h.handlers.handleClose();h.resolve({data:{id:'saved'},error:null});await flush();assert.equal(h.calls.success,0);
});
test('late abandoned upload cleanup happens once per object despite repeated close',async t=>{
 const h=modal(t,{stage:'reels'});await h.select();const p=h.handlers.handleUpload();await flush();h.handlers.handleClose();h.handlers.handleClose();await p;assert.equal(h.calls.removes.length,0);
 h.resolve({error:null});await flush();assert.equal(h.calls.removes.length,1);assert.equal(h.calls.close,1);
});
test('cancel file selection ignores its late metadata result',async t=>{
 const h=modal(t,{stage:'metadata'});const p=h.handlers.processVideoFile({type:'video/mp4',name:'test.mp4'});h.handlers.handleClose();const writes=h.calls.writes;h.resolve(6);await p;assert.equal(h.calls.writes,writes);assert.equal(h.calls.uploads.length,0);
});

for (const boundary of ['success', 'refresh']) for (const exit of ['close', 'unmount']) {
  test(`${boundary} callback ${exit} stops remaining success effects`, async t => {
    let writesAtExit;
    const dismiss = () => {
      if (exit === 'close') h.handlers.handleClose(); else h.unmount();
      writesAtExit = h.calls.writes;
    };
    const h = modal(t, boundary === 'success' ? {onSuccess: dismiss} : {onRefresh: dismiss});
    await h.select();
    await h.handlers.handleUpload();
    assert.equal(h.calls.success, 1);
    assert.equal(h.calls.inserts, 1);
    assert.equal(h.calls.refresh, boundary === 'success' ? 0 : 1);
    assert.equal(h.calls.scroll, 0);
    assert.equal(h.calls.writes, writesAtExit);
    assert.equal(h.calls.close, exit === 'close' ? 1 : 0);
    assert.equal(h.calls.removes.length, 0);
  });
}
test('late timed-out upload cannot affect a newer successful attempt or its media', async t => {
  const h = modal(t, {stage: 'reels'});
  await h.select();
  const oldWork = h.handlers.handleUpload();
  await flush();
  const settleOld = h.pendingResolution;
  const oldPath = h.calls.uploads[0].path;
  t.mock.timers.tick(300000);
  await oldWork;
  h.setStage('success');
  await h.render().handleUpload();
  const writes = h.calls.writes;
  settleOld({error: null});
  await flush();
  assert.equal(h.calls.inserts, 1);
  assert.equal(h.calls.success, 1);
  assert.equal(h.calls.writes, writes);
  assert.equal(h.calls.removes.length, 1);
  assert.equal(h.calls.removes[0].paths[0], oldPath);
  assert.notEqual(h.calls.uploads[1].path, oldPath);
});
test('resolved waits clear their timers and aborting an old controller leaves a new one intact', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const old = createUploadAttempt(), next = createUploadAttempt();
  assert.equal(await old.wait(Promise.resolve('done'), 10), 'done');
  t.mock.timers.tick(100);
  assert.equal(old.signal.aborted, false);
  old.cancel();
  assert.equal(next.signal.aborted, false);
  assert.equal(await next.wait(Promise.resolve('new'), 10), 'new');
  t.mock.timers.tick(100);
  assert.equal(next.signal.aborted, false);
});

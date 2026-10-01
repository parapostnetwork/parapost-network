import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getReelPosterDimensions, generatePosterFromFile, getVideoDuration } from '../lib/reels/upload-lifecycle.ts';

for (const [name, width, height, expected] of [
  ['4K landscape',3840,2160,{width:1280,height:720}],
  ['4K portrait',2160,3840,{width:720,height:1280}],
  ['small landscape',640,360,{width:640,height:360}],
  ['small portrait',360,640,{width:360,height:640}],
  ['boundary',1280,720,{width:1280,height:720}],
  ['odd aspect ratio',4032,3024,{width:1280,height:960}],
]) test(`${name}: bounded dimensions without upscaling`,()=>{
  const result=getReelPosterDimensions(width,height);
  assert.deepEqual(result,expected);
  assert.ok(result.width<=width && result.height<=height);
  assert.ok(Math.abs(result.width/result.height-width/height)<0.002);
});
for(const value of [0,-1,NaN,Infinity,-Infinity,0.5]) test(`invalid dimension ${value} rejected`,()=>{
  assert.throws(()=>getReelPosterDimensions(value,720),/dimensions/);
  assert.throws(()=>getReelPosterDimensions(720,value),/dimensions/);
});

function harness(t,{width=3840,height=2160,contextMissing=false,drawFailure=false}={}) {
  t.mock.timers.enable({apis:['setTimeout']});
  const previous=globalThis.document;
  const drawCalls=[],encodes=[],revoked=[];let callback;
  const video={videoWidth:width,videoHeight:height,duration:10,currentTime:0,seeking:false,readyState:4,load(){},removeAttribute(){this.sourceRemoved=true;}};
  const canvas={width:0,height:0,getContext(){return contextMissing?null:{drawImage(...args){if(drawFailure)throw Error('decode failure');drawCalls.push(args);}};},toBlob(cb,type,quality){callback=cb;encodes.push({type,quality,width:this.width,height:this.height});}};
  globalThis.document={createElement:kind=>kind==='video'?video:canvas};
  t.mock.method(URL,'createObjectURL',()=> 'blob:poster');
  t.mock.method(URL,'revokeObjectURL',url=>revoked.push(url));
  t.after(()=>{globalThis.document=previous;});
  const controller=new AbortController();
  const promise=generatePosterFromFile(new Blob(['original video']),controller.signal);
  const capture=()=>{video.onloadedmetadata();assert.equal(video.currentTime,0.6);video.onseeked();};
  const cleaned=()=>{assert.equal(video.sourceRemoved,true);assert.equal(video.onseeked,null);assert.equal(video.onloadedmetadata,null);assert.deepEqual(revoked,['blob:poster']);assert.equal(canvas.width,0);assert.equal(canvas.height,0);};
  return {video,canvas,controller,promise,capture,cleaned,encodes,drawCalls,callback:()=>callback};
}
for(const [width,height,outW,outH] of [[3840,2160,1280,720],[2160,3840,720,1280],[640,360,640,360]])test(`actual poster draw ${width}x${height} preserves frame and JPEG policy`,async t=>{
  const h=harness(t,{width,height});h.capture();
  assert.deepEqual(h.encodes,[{type:'image/jpeg',quality:0.82,width:outW,height:outH}]);
  assert.deepEqual(h.drawCalls[0],[h.video,0,0,outW,outH]);
  const blob=new Blob(['poster'],{type:'image/jpeg'});h.callback()(blob);assert.equal(await h.promise,blob);h.cleaned();
  h.controller.abort();t.mock.timers.tick(30000);h.callback()(new Blob(['late']));h.cleaned();
});
for(const state of ['metadata','encoding'])test(`cancel during ${state} releases resources and ignores late callbacks`,async t=>{
  const h=harness(t);const rejected=assert.rejects(h.promise,/cancelled/);
  if(state==='encoding')h.capture();
  const late=h.callback();h.controller.abort();await rejected;h.cleaned();late?.(new Blob(['late']));h.cleaned();
});
test('poster timeout releases canvas and ignores a late encoding success',async t=>{
  const h=harness(t);const rejected=assert.rejects(h.promise,/too long/);h.capture();const late=h.callback();t.mock.timers.tick(30000);await rejected;h.cleaned();late(new Blob(['late']));h.cleaned();
});
for(const options of [{width:0},{height:Infinity},{contextMissing:true},{drawFailure:true}])test(`poster failure cleans up: ${JSON.stringify(options)}`,async t=>{
  const h=harness(t,options);const rejected=assert.rejects(h.promise,/Could not generate/);h.capture();await rejected;h.cleaned();assert.equal(h.encodes.length,0);
});
test('null encoder result rejects rather than uploading an invalid poster',async t=>{
  const h=harness(t);const rejected=assert.rejects(h.promise,/Could not generate/);h.capture();h.callback()(null);await rejected;h.cleaned();
});
test('uploader still sends the original selected video and retains publication protections',()=>{
  const source=readFileSync(new URL('../app/reels/ReelUploadModal.tsx',import.meta.url),'utf8');
  assert.match(source,/\.upload\(videoPath, selectedVideo,\s*\{/);
  assert.match(source,/contentType: selectedVideo\.type \|\| "video\/mp4"/);
  assert.match(source,/\.abortSignal\(attempt\.signal\)/);
  assert.match(source,/if \(!path \|\| insertStarted/);
});

for(const duration of [59.9,60,60.35,60.36])test(`duration ${duration} preserves mobile settling and over-limit boundary`,async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const previous={document:globalThis.document,window:globalThis.window};
  const video={duration,currentTime:0,load(){},removeAttribute(){}};
  globalThis.document={createElement:()=>video};globalThis.window={setTimeout,clearTimeout};
  t.mock.method(URL,'createObjectURL',()=> 'blob:duration');t.mock.method(URL,'revokeObjectURL',()=>{});
  t.after(()=>Object.assign(globalThis,previous));
  let settled=false;const promise=getVideoDuration(new Blob(),new AbortController().signal).then(value=>{settled=true;return value;});
  video.onloadedmetadata();await Promise.resolve();await Promise.resolve();
  if(duration<=60.35){assert.equal(settled,false);t.mock.timers.tick(1500);}
  else assert.equal(settled,true);
  assert.equal(await promise,duration);assert.equal(video.onloadedmetadata,null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { optimizeImageUpload, optimizedDimensions, validateImageSource, validateFinalImage, readImageDimensions, IMAGE_SOURCE_MAX_BYTES } from '../lib/images/optimize-upload.ts';

function png(width, height) {
  const bytes = new Uint8Array(32); bytes.set([137,80,78,71],0); bytes.set([73,72,68,82],12);
  const v=new DataView(bytes.buffer);v.setUint32(16,width);v.setUint32(20,height);return bytes;
}
function jpeg(width,height) {
  const bytes=new Uint8Array([255,216,255,192,0,8,8,0,0,0,0,0]);const v=new DataView(bytes.buffer);v.setUint16(7,height);v.setUint16(9,width);return bytes;
}
function webp(width,height) {
  const b=new Uint8Array(30);b.set(Buffer.from('RIFF'),0);b.set(Buffer.from('WEBPVP8X'),8);
  for(let i=0;i<3;i++){b[24+i]=((width-1) >>> (8*i)) & 255;b[27+i]=((height-1) >>> (8*i)) & 255;}return b;
}
for(const [name,w,h,purpose,expected] of [
  ['landscape',4032,3024,'post',[2048,1536]],['portrait',3024,4032,'post',[1536,2048]],
  ['large avatar',3000,3000,'avatar',[512,512]],['small avatar',400,400,'avatar',[400,400]],
  ['cover',4000,2250,'cover',[1920,1080]],['small cover',400,800,'cover',[400,800]],
]) test(name+' dimensions and aspect ratio',()=>{const d=optimizedDimensions(w,h,purpose);assert.deepEqual([d.width,d.height],expected);assert.ok(Math.abs(d.width/d.height-w/h)<0.002);});
for(const [type,header] of [['image/jpeg',jpeg],['image/png',png],['image/webp',webp]]) test(type+' header and source validation',()=>{validateImageSource({type,size:11*1024*1024});assert.deepEqual(readImageDimensions(header(4032,3024),type),{width:4032,height:3024});});
test('unsupported, empty, oversized, corrupt and pathological sources rejected',()=>{
  assert.throws(()=>validateImageSource({type:'image/gif',size:100}));
  for(const size of [0,IMAGE_SOURCE_MAX_BYTES+1])assert.throws(()=>validateImageSource({type:'image/png',size}));
  assert.throws(()=>readImageDimensions(new Uint8Array(40),'image/png'));
  assert.throws(()=>readImageDimensions(png(16000,16000),'image/png'));
});
test('final limits are enforced separately from source limits',()=>{validateFinalImage(1_000_000,'avatar');assert.throws(()=>validateFinalImage(2_000_001,'avatar'));assert.throws(()=>validateFinalImage(9_000_001,'post'));assert.throws(()=>validateFinalImage(9_000_001,'cover'));});

function browser(t,{width=4032,height=3024,decodeError=false,encodeError=false,outputType='image/webp',size=200,timeout=false}={}) {
  const prior={Image:globalThis.Image,document:globalThis.document};let revoked=0,removed=0,draws=0;const encodings=[];
  const canvas={width:0,height:0,getContext:()=>({drawImage(){draws++;}}),toBlob(cb,type,quality){encodings.push({type,quality});if(timeout)return;cb(encodeError?null:new Blob([new Uint8Array(size)],{type:outputType}));}};
  globalThis.Image=class {naturalWidth=width;naturalHeight=height;set src(value){queueMicrotask(()=>decodeError?this.onerror?.():this.onload?.());}removeAttribute(){removed++;}};
  globalThis.document={createElement:()=>canvas};
  t.mock.method(URL,'createObjectURL',()=> 'blob:test');t.mock.method(URL,'revokeObjectURL',()=>revoked++);
  t.after(()=>Object.assign(globalThis,prior));return {canvas,encodings,get revoked(){return revoked;},get removed(){return removed;},get draws(){return draws;}};
}
for(const [type,header] of [['image/jpeg',jpeg],['image/png',png],['image/webp',webp]])test(type+' decoded once, resized and encoded as alpha-safe WebP',async t=>{
  const b=browser(t);const result=await optimizeImageUpload(new File([header(4032,3024)],'phone.'+type.split('/')[1],{type}),'post');
  assert.equal(result.file.type,'image/webp');assert.match(result.file.name,/\.webp$/);assert.equal(result.width,2048);assert.equal(result.height,1536);assert.equal(b.draws,1);assert.deepEqual(b.encodings,[{type:'image/webp',quality:0.82}]);assert.equal(b.revoked,1);assert.equal(b.removed,1);assert.equal(b.canvas.width,0);
});
test('PNG fallback preserves alpha-capable format and correct filename',async t=>{browser(t,{outputType:'image/png'});const r=await optimizeImageUpload(new File([png(4032,3024)],'alpha.png',{type:'image/png'}),'post');assert.equal(r.file.type,'image/png');assert.match(r.file.name,/\.png$/);});
test('browser-oriented dimensions are used without a second EXIF rotation',async t=>{browser(t,{width:3024,height:4032});const r=await optimizeImageUpload(new File([jpeg(4032,3024)],'rotated.jpg',{type:'image/jpeg'}),'post');assert.deepEqual([r.width,r.height],[1536,2048]);});
test('small valid original retained only when smaller and within dimensions',async t=>{browser(t,{width:400,height:400});const file=new File([png(400,400)],'small.png',{type:'image/png'});const r=await optimizeImageUpload(file,'avatar');assert.equal(r.file.size,file.size);assert.equal(r.file.type,'image/png');});
for(const options of [{decodeError:true},{encodeError:true},{size:9_000_001}])test('failure does not return original; resources released '+JSON.stringify(options),async t=>{const b=browser(t,options);await assert.rejects(optimizeImageUpload(new File([png(4032,3024)],'image.png',{type:'image/png'}),'post'));assert.equal(b.revoked,1);assert.equal(b.removed,1);assert.equal(b.canvas.width,0);});

const paths=[
 ['app/dashboard/page.tsx','post','let optimizedFile: File;','const { data: publicUrlData }'],
 ['app/profile/[id]/page.tsx','post','let optimizedFile: File;','const { data: publicUrlData }'],
 ['app/profile/[id]/edit/page.tsx','avatar','let optimizedFile: File;','const { data: publicUrlData }'],
 ['app/profile/[id]/edit/page.tsx','cover','let optimizedFile: File;','const { data: publicUrlData }',1],
 ['app/settings/profile/page.tsx','avatar','const optimizedFile =','const { data: publicUrlData }'],
];
for(const [path,purpose,start,end,occurrence=0] of paths){
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');let pos=-1;for(let i=0;i<=occurrence;i++)pos=source.indexOf(start,pos+1);assert.ok(pos>=0);const body=source.slice(pos,source.indexOf(end,pos));
 for(const failure of [null,'optimization','upload'])test(`${path} ${purpose}: ${failure||'optimized upload'}`,async()=>{
  const original=new File(['original'],'phone.png',{type:'image/png'}),optimized=new File(['small'],'phone.webp',{type:'image/webp'});const uploads=[],loading=[];let calls=0;
  const bindings={File,Math,Date,index:0,user:{id:'u'},viewerId:'u',currentUserId:'u',userId:'u',file:original,imageFile:original,AVATAR_BUCKET:'post-images',COVER_BUCKET_NAME:'profile-covers',console:{error(){}},alert(){},setLoading:v=>loading.push(v),setProfilePostLoading:v=>loading.push(v),setUploadingAvatar:v=>loading.push(v),setUploadingCover:v=>loading.push(v),setStatusKind(){},setStatusMessage(){},getDashboardUploadErrorMessage:()=> 'Upload failed',getDashboardUploadContentType:f=>f.type,getSafeAvatarExtension:f=>f.name.split('.').pop(),optimizeImageUpload:async(f,p)=>{calls++;assert.equal(f,original);assert.equal(p,purpose);if(failure==='optimization')throw Error('Could not prepare image');return {file:optimized};},supabase:{storage:{from:()=>({upload:async(...args)=>{uploads.push(args);return {error:failure==='upload'?{message:'Upload failed'}:null};}})}}};
  const js=ts.transpileModule(`(async()=>{${body}})()`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
  try{await vm.runInNewContext(js,bindings);}catch(e){assert.ok(path.includes('settings')&&failure);assert.match(e.message,/Could not prepare image|Upload failed/);}
  assert.equal(calls,1);assert.equal(uploads.length,failure==='optimization'?0:1);
  if(uploads.length){assert.equal(uploads[0][1],optimized);assert.match(uploads[0][0],/\.webp$/);assert.equal(uploads[0][2].contentType,'image/webp');assert.equal(uploads[0][2].upsert,false);}
  if(failure&&!path.includes('settings'))assert.ok(loading.includes(false));
 });
}

test('11 MB source is accepted but only its resized result is returned',async t=>{
  browser(t);const file=new File([png(4032,3024),new Uint8Array(11*1024*1024)],'large.png',{type:'image/png'});
  const r=await optimizeImageUpload(file,'post');assert.equal(r.width,2048);assert.equal(r.file.size,200);
});
test('encoder timeout rejects and releases temporary resources',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const b=browser(t,{timeout:true});
  const promise=optimizeImageUpload(new File([png(4032,3024)],'photo.png',{type:'image/png'}),'post');
  const rejected=assert.rejects(promise,/too long/);
  for(let i=0;i<20;i++)await Promise.resolve();
  t.mock.timers.tick(20000);await rejected;assert.equal(b.revoked,1);assert.equal(b.canvas.width,0);
});

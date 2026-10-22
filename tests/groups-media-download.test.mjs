import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {validateDownloadedMedia, validateUpload, IMAGE_LIMIT, VIDEO_LIMIT} from '../lib/groups/validation.ts';
const jpeg = new Uint8Array(108244);jpeg.set([255,216,255,224]);
const signatures = {
 'image/jpeg':jpeg,
 'image/png':new Uint8Array([137,80,78,71,13,10,26,10]),
 'image/webp':new TextEncoder().encode('RIFF0000WEBP'),
 'video/mp4':new TextEncoder().encode('0000ftypisom'),
 'video/webm':new Uint8Array([26,69,223,163]),
};
test('authorized JPEG bytes survive generic, absent and parameterized transport MIME',async()=>{
 for(const type of ['image/jpeg','application/octet-stream','','image/jpeg; charset=utf-8'])assert.equal(await validateDownloadedMedia(new Blob([jpeg],{type})),'image/jpeg');
 assert.throws(()=>validateUpload('application/octet-stream',jpeg.length),'upload validation stays strict');
});
test('all existing media types retain signatures and normalized response MIME',async()=>{
 for(const [mime,bytes] of Object.entries(signatures))for(const type of [mime,'application/octet-stream'])assert.equal(await validateDownloadedMedia(new Blob([bytes],{type})),mime);
});
test('generic HTML, empty/truncated data and declared MIME mismatches remain rejected',async()=>{
 for(const [bytes,type] of [[new TextEncoder().encode('<html>'), 'application/octet-stream'],[new Uint8Array(), ''],[new Uint8Array([255,216]),'application/octet-stream'],[jpeg,'image/png'],[jpeg,'text/html']])await assert.rejects(()=>validateDownloadedMedia(new Blob([bytes],{type})));
});
test('inferred types enforce original image/video size limits and image-only covers',async()=>{
 const image=new Uint8Array(IMAGE_LIMIT+1);image.set(signatures['image/jpeg'].slice(0,4));
 await assert.rejects(()=>validateDownloadedMedia(new Blob([image],{type:'application/octet-stream'})));
 await assert.rejects(()=>validateDownloadedMedia(new Blob([new Uint8Array(VIDEO_LIMIT+1)])));
 for(const mime of ['video/mp4','video/webm'])await assert.rejects(()=>validateDownloadedMedia(new Blob([signatures[mime]],{type:'application/octet-stream'}),true));
 assert.equal(await validateDownloadedMedia(new Blob([jpeg]),true),'image/jpeg');
});
// Execute the actual route, server authorization and installed Supabase SDK against
// an intercepted HTTP transport. No staging network calls or credentials are used.
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const serverSource=readFileSync(new URL('../lib/groups/server.ts',import.meta.url),'utf8')
 .replace("'@supabase/supabase-js'",JSON.stringify(import.meta.resolve('@supabase/supabase-js')))
 .replace("'./config'",JSON.stringify(new URL('../lib/groups/config.ts',import.meta.url).href));
const routeSource=readFileSync(new URL('../app/api/groups/media/route.ts',import.meta.url),'utf8')
 .replace("'@/lib/groups/server'",JSON.stringify(moduleUrl(serverSource)))
 .replace("'@/lib/groups/validation'",JSON.stringify(new URL('../lib/groups/validation.ts',import.meta.url).href));
const {GET}=await import(moduleUrl(routeSource));
const gid='10000000-0000-4000-8000-000000000001';
async function request({path=`${gid}/posts/post/uploader/image`,mime='application/octet-stream',bytes=jpeg,deny='',flags=true}={}){
 const savedFetch=globalThis.fetch;
 const envNames=['GROUPS_ENABLED','NEXT_PUBLIC_GROUPS_ENABLED','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY'];
 const saved=Object.fromEntries(envNames.map(key=>[key,process.env[key]]));
 Object.assign(process.env,{GROUPS_ENABLED:String(flags),NEXT_PUBLIC_GROUPS_ENABLED:'true',NEXT_PUBLIC_SUPABASE_URL:'https://vmgelrgrtpghmvqgufzz.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-test-placeholder'});
 const calls=[];
 globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input.url??String(input));
  assert.equal(url.origin,'https://vmgelrgrtpghmvqgufzz.supabase.co');
  assert.equal(new Headers(init?.headers).get('authorization'),'Bearer local-user-token');
  calls.push(url.pathname);
  if(url.pathname==='/auth/v1/user')return deny==='auth'?Response.json({message:'Denied'},{status:401}):Response.json({id:gid,aud:'authenticated',role:'authenticated'});
  if(url.pathname==='/rest/v1/rpc/groups_available')return Response.json(deny!=='gate');
  if(url.pathname.startsWith('/storage/v1/object/group-media/'))return deny==='storage'?Response.json({message:'Denied',statusCode:'403'},{status:403}):new Response(bytes,{headers:{'Content-Type':mime}});
  throw new Error('Unexpected network request');
 };
 try{return {response:await GET(new Request(`http://localhost/api/groups/media?path=${encodeURIComponent(path)}`,{headers:{Authorization:'Bearer local-user-token'}})),calls};}
 finally{globalThis.fetch=savedFetch;for(const key of envNames){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
}
test('real route and SDK return normalized JPEG bytes with private security headers',async()=>{
 const {response,calls}=await request();assert.equal(response.status,200);
 assert.equal(response.headers.get('content-type'),'image/jpeg');
 assert.match(response.headers.get('cache-control'),/no-store/);
 assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 assert.match(response.headers.get('content-security-policy'),/sandbox/);
 assert.equal(response.headers.get('vary'),'Authorization');
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()),jpeg);
 assert.equal(calls.length,3);assert.match(calls[2],/^\/storage\/v1\/object\/group-media\//);
});
test('cover route receives the same correction and rejects video covers',async()=>{
 const path=`${gid}/covers/image`;
 assert.equal((await request({path})).response.status,200);
 assert.equal((await request({path,bytes:signatures['video/mp4']})).response.status,400);
});
test('authentication, disabled flags, tester gate and Storage denial remain fail closed',async()=>{
 for(const [deny,status,count] of [['auth',401,1],['gate',404,2],['storage',400,3]]){
  const result=await request({deny});assert.equal(result.response.status,status);assert.equal(result.calls.length,count);
 }
 const disabled=await request({flags:false});assert.equal(disabled.response.status,404);assert.equal(disabled.calls.length,0);
});
test('route rejects malformed media and invalid paths instead of relabeling unsafe content',async()=>{
 assert.equal((await request({bytes:new TextEncoder().encode('<script>bad</script>')})).response.status,400);
 const invalid=await request({path:'invalid/path'});assert.equal(invalid.response.status,400);assert.equal(invalid.calls.length,2);
 assert.equal((await request({mime:'image/png'})).response.status,400);
});

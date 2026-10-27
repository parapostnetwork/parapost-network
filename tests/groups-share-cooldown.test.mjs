import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
function moduleAt(path,modules,globals={}){
 const exports={};const js=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{exports,require:name=>{if(!(name in modules))throw Error(name);return modules[name];},Response,Request,URL,Buffer,TextDecoder,...globals});return exports;
}
const errors=moduleAt('../lib/groups/shareErrors.ts',{});
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
const {shareErrorResponse}=moduleAt('../lib/groups/shareErrorResponse.ts',{'./server':{privateHeaders:headers},'./shareErrors':errors});
const cooldown=(kind,seconds)=>({code:'P0001',message:'GROUP_SHARE_COOLDOWN',details:JSON.stringify({kind,retry_after_seconds:seconds,sql:'secret not forwarded'})});
test('exact Group and post messages use only the server-supplied remaining duration',()=>{
 for(const [kind,seconds,text] of [['group',187200,'2 days, 4 hours'],['post',561600,'6 days, 12 hours'],['post',43200,'12 hours'],['group',60,'1 minute'],['post',1,'less than a minute'],['group',3601,'1 hour, 1 minute']]){
  const error=errors.shareErrorFromResponse({code:'share_cooldown',kind,retry_after_seconds:seconds});
  assert.equal(errors.shareErrorMessage(error),`Already shared. You can share this ${kind==='group'?'Group':'post'} again in ${text}.`);
 }
});
test('RPC adapter forwards only validated duration/kind; raw SQL is never reflected',async()=>{
 const response=shareErrorResponse(cooldown('post',561600));assert.equal(response.status,409);assert.equal(response.headers.get('Retry-After'),'561600');assert.match(response.headers.get('Cache-Control'),/no-store/);
 assert.deepEqual(await response.json(),{code:'share_cooldown',kind:'post',retry_after_seconds:561600});
 for(const value of [-1,0,'100',null,Infinity,604801])assert.equal(shareErrorResponse(cooldown('post',value)),null);
 assert.equal(shareErrorResponse(cooldown('group',259201)),null);
 assert.equal(shareErrorResponse({code:'42501',message:'GROUP_SHARE_COOLDOWN',details:'secret'}).status,403);
 for(const value of [{code:'P0001',message:'SQL secret'},{code:'P0001',message:'GROUP_SHARE_COOLDOWN',details:'invalid'},{code:'23505',message:'duplicate key'}])assert.equal(shareErrorResponse(value),null);
 assert.match(errors.shareErrorMessage(new errors.ShareRequestError('forbidden')),/membership.*privacy/);
 assert.equal(errors.shareErrorMessage(new Error('SQL secret')),'Sharing could not be completed. Please try again.');
});
test('authenticated client preserves normalized cooldown without exposing arbitrary server messages',async()=>{
 const client=moduleAt('../lib/groups/client.ts',{'@/lib/supabase':{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}}},'./shareErrors':errors,'./validation':{}},{fetch:async()=>shareErrorResponse(cooldown('group',187200))});
 await assert.rejects(client.groupsFetch('/api/groups/sharing'),error=>error instanceof errors.ShareRequestError&&error.kind==='group'&&error.remainingSeconds===187200);
});
test('sharing route translates the cooldown only after the authorized share RPC',async()=>{
 const {sharingInput}=moduleAt('../lib/groups/sharing.ts',{'./validation':{UUID:/^[0-9a-f-]{36}$/i}});
 const calls=[];const server={privateHeaders:headers,groupError:()=>Response.json({error:'Unavailable'},{status:400}),groupClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});return {error:cooldown('group',187200)};}})};
 const route=moduleAt('../app/api/groups/sharing/route.ts',{'@/lib/groups/server':server,'@/lib/groups/shareErrorResponse':{shareErrorResponse},'@/lib/groups/sharing':{sharingInput},'@/lib/groups/validation':{UUID:/^[0-9a-f-]{36}$/i}});
 const response=await route.POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({action:'share',groupId:'10000000-0000-4000-8000-000000000001'})}));
 assert.equal(response.status,409);assert.equal(calls.length,1);assert.equal(calls[0].name,'groups_promote');assert.equal((await response.json()).retry_after_seconds,187200);
});
test('SQL helper derives time from server clock without changing sharing enforcement or deletion',()=>{
 const sql=read('../docs/sql-drafts/groups-sharing-cooldown-response-staging.sql');assert.match(sql,/retry_at - clock_timestamp\(\)/);assert.match(sql,/FROM PUBLIC, anon, authenticated/);assert.match(sql,/INTEGRATION REQUIRED/);
 assert.doesNotMatch(sql,/(?:INSERT INTO|UPDATE|DELETE FROM|DROP TABLE|ALTER TABLE) /);
 assert.equal((sql.match(/CREATE FUNCTION /g)||[]).length,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {UUID} from '../lib/groups/validation.ts';
const group='10000000-0000-4000-8000-000000000001';
const post='20000000-0000-4000-8000-000000000001';
const share='30000000-0000-4000-8000-000000000001';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
function moduleAt(path,modules){
 const source=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(source,{exports,require:name=>{if(!(name in modules))throw Error(`Unexpected dependency ${name}`);return modules[name];},Request,Response,URL,Buffer,TextDecoder,console});return exports;
}
const {sharingInput,promotionHref}=moduleAt('../lib/groups/sharing.ts',{'./validation':{UUID}});
function route({denied=false,result={id:share},failure=null}={}){
 const calls=[];const headers={'Cache-Control':'private, no-store, max-age=0',Vary:'Authorization'};
 const server={privateHeaders:headers,groupError:()=>Response.json({error:'Unavailable'},{status:400,headers}),groupClient:async()=>{if(denied)throw Error('Not authorized');return {rpc:async(name,args)=>{calls.push({name,args});return {data:result,error:failure};}};}};
 return {...moduleAt('../app/api/groups/sharing/route.ts',{'@/lib/groups/shareErrorResponse':{shareErrorResponse:()=>null},'@/lib/groups/server':server,'@/lib/groups/validation':{UUID:/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i},'@/lib/groups/sharing':{sharingInput}}),calls};
}
const req=body=>new Request('http://localhost/api/groups/sharing',{method:'POST',body:JSON.stringify(body)});
test('share inputs reject malformed targets, oversized captions and nonboolean owner controls',()=>{
 for(const input of [null,[],{action:'share',groupId:'bad'},{action:'share',groupId:group,postId:'x'},{action:'share',groupId:group,shareId:'x'},{action:'share',groupId:group,caption:'a'.repeat(1001)},{action:'settings',groupId:group,settings:{enabled:'true'}},{action:'settings',groupId:group,settings:{enabled:true,show_name:true,show_cover:true,show_description:true,owner_id:post}}])assert.throws(()=>sharingInput(input));
});
test('public Group sharing delegates one write to the authoritative RPC and never creates ordinary posts',async()=>{
 const h=route();const response=await h.POST(req({action:'share',groupId:group,caption:'Hello',user_id:'attacker'}));
 assert.equal(response.status,200);assert.equal(h.calls.length,1);assert.equal(h.calls[0].name,'groups_promote');assert.equal(h.calls[0].args.p_post_id,null);assert.equal(h.calls[0].args.p_caption,'Hello');assert.equal('user_id' in h.calls[0].args,false);assert.match(response.headers.get('Cache-Control'),/no-store/);
});
test('private post invitations and reshares submit identifiers only, never original post text or media',async()=>{
 const h=route();await h.POST(req({action:'share',groupId:group,postId:post,shareId:share,content:'PRIVATE',media:['PRIVATE']}));
 assert.equal(h.calls[0].args.p_share_id,share);assert.equal(h.calls[0].args.p_post_id,post);assert.equal(JSON.stringify(h.calls).includes('PRIVATE'),false);
});
test('membership/owner denial and changed visibility fail closed, without success responses',async()=>{
 for(const reason of ['membership revoked','private sharing disabled','blocked','visibility changed']){
  const h=route({failure:{message:reason}});const response=await h.POST(req({action:'share',groupId:group}));assert.equal(response.status,400);assert.equal('id' in await response.json(),false);
 }
 const h=route({denied:true});assert.equal((await h.POST(req({action:'share',groupId:group}))).status,400);assert.equal(h.calls.length,0);
});
test('private preview returns the redacted database projection and honors revocation',async()=>{
 const preview={group_id:group,name:'Private Group',description:null,cover_key:null,member_count:null,can_share:false,post_id:null,visibility:'private',approved:false,kind:'invitation'};
 const h=route({result:preview});const response=await h.GET(new Request(`http://localhost/api/groups/sharing?group=${group}&share=${share}`));assert.deepEqual(await response.json(),preview);assert.equal(h.calls[0].name,'groups_promotion_preview');
 assert.equal(promotionHref(preview),`/groups/${group}`);
 assert.equal(promotionHref({...preview,approved:true,post_id:post}),`/groups/${group}#group-post-${post}`);
 const revoked=route({result:null});assert.equal(await(await revoked.GET(new Request(`http://localhost/api/groups/sharing?group=${group}&share=${share}`))).json(),null);
});
test('settings updates send exactly owner-controlled booleans to the owner-checked RPC',async()=>{
 const settings={enabled:true,show_name:true,show_cover:false,show_description:false};const h=route({result:settings});await h.POST(req({action:'settings',groupId:group,settings}));assert.equal(h.calls[0].name,'groups_promotion_settings');assert.equal(JSON.stringify(h.calls[0].args.p_settings),JSON.stringify(settings));
});
test('streamed oversized bodies are rejected before a share RPC',async()=>{const h=route();const response=await h.POST(req({action:'share',groupId:group,caption:'a'.repeat(13000)}));assert.equal(response.status,400);assert.equal(h.calls.length,0);});
test('Dashboard and Profile merge the same share IDs, deduplicate and preserve pre-migration public-post sharing',async()=>{
 const legacy={share_id:'old',shared_at:'2026-10-24T12:00:00Z'},promotion={share_id:'new',shared_at:'2026-10-25T12:00:00Z'};const calls=[];
 const {fetchGroupShares}=moduleAt('../lib/groups/sharedFeed.ts',{'@/lib/supabase':{supabase:{rpc:async(name,args)=>{calls.push({name,args});return {data:name==='groups_shared_feed'?[legacy]:[promotion,promotion],error:null};}}}});
 const dashboard=await fetchGroupShares(null),profile=await fetchGroupShares(group);
 assert.equal(JSON.stringify(dashboard.data.map(x=>x.share_id)),JSON.stringify(['new','old']));assert.equal(JSON.stringify(profile.data),JSON.stringify(dashboard.data));assert.equal(calls[2].args.p_sharer_id,group);
 const missing=moduleAt('../lib/groups/sharedFeed.ts',{'@/lib/supabase':{supabase:{rpc:async name=>name==='groups_shared_feed'?{data:[legacy],error:null}:{data:null,error:{code:'PGRST202'}}}}});assert.equal((await missing.fetchGroupShares(null)).data.length,1);
});
test('cover route checks current sharing permission before storage access and never accepts arbitrary paths',async()=>{
 let downloads=0;const calls=[];const h=moduleAt('../app/api/groups/sharing/cover/route.ts',{'@/lib/groups/server':{privateHeaders:{'Cache-Control':'private, no-store'},groupError:()=>new Response(null,{status:400}),groupClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:null,error:Error('revoked')};},storage:{from:()=>({download:async()=>{downloads++;}})}})},'@/lib/groups/validation':{UUID:/^[0-9a-f-]{36}$/,validateDownloadedMedia:async()=>{throw Error('Must not reach decoder');}}});
 const res=await h.GET(new Request(`http://localhost/api/groups/sharing/cover?group=${group}&key=${'a'.repeat(32)}&path=private/post/image`));assert.equal(res.status,400);assert.equal(downloads,0);assert.equal(calls[0].name,'groups_promotion_cover');assert.equal('path' in calls[0].args,false);
});
// These are draft contract checks, NOT claims that SQL has been executed or RLS tested.
test('local SQL draft contains live authorization, revocation, safe projections and serialized duplicate protection',()=>{
 const sql=read('../docs/sql-drafts/groups-promotional-sharing.sql');
 for(const expected of ['ENABLE ROW LEVEL SECURITY','FROM PUBLIC, anon, authenticated',"m.status NOT IN ('rejected','removed','banned')","g.visibility='private' AND NOT coalesce(s.enabled,false)","parapost_groups_private.blocked(auth.uid(),source.user_id)","parapost_groups_private.promotion_actor(gid,source.user_id)","NOT is_deleted","FOR UPDATE","ON CONFLICT DO NOTHING","WHERE post_id IS NULL","WHERE post_id IS NOT NULL","ALTER POLICY groups_read",'Search only data that this viewer may see',"s.enabled AND s.show_cover",'public.group_post_shares legacy'])assert.ok(sql.includes(expected),expected);
 const projection=sql.slice(sql.indexOf('RETURN jsonb_build_object('),sql.indexOf('END;\n$$;',sql.indexOf('RETURN jsonb_build_object(')));
 for(const forbidden of ["'original_content'","'media'","'owner_id'","'author_id'","'cover_storage_path'"])assert.ok(!projection.includes(forbidden),forbidden);
 assert.match(sql,/'original_author_id',NULL,'original_content',NULL/);
});


test('Delete Share preserves the committed RPC and sends no client-supplied owner identity',async()=>{
 const h=route({result:{deleted:true}});
 for(const kind of ['post','promotion']){
  const response=await h.DELETE(new Request('http://localhost/api/groups/sharing',{method:'DELETE',body:JSON.stringify({shareId:share,kind,user_id:'attacker'})}));
  assert.equal(response.status,200);
 }
 assert.deepEqual(h.calls.map(call=>call.name),['groups_remove_share','groups_remove_share']);
 assert.equal(JSON.stringify(h.calls).includes('attacker'),false);
 const denied=route({failure:{code:'42501'}});
 assert.equal((await denied.DELETE(new Request('http://localhost/api/groups/sharing',{method:'DELETE',body:JSON.stringify({shareId:share,kind:'promotion'})}))).status,400);
 const invalid=route();
 assert.equal((await invalid.DELETE(new Request('http://localhost/api/groups/sharing',{method:'DELETE',body:JSON.stringify({shareId:share,kind:'group'})}))).status,400);
 assert.equal(invalid.calls.length,0);
});

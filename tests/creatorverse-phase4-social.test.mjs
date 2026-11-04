import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
function load(path,deps={}) { const exports={}; vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require(name){assert.ok(name in deps,name);return deps[name];}});return exports; }
const types=load('lib/creatorverse/types.ts');
const validation=load('lib/creatorverse/validation.ts',{'./types':types});
const permissions=load('lib/creatorverse/permissions.ts');
const contract=load('lib/creatorverse/integration-contract.ts',{'./validation':validation,'./permissions':permissions});
const local=load('app/creatorverse/creatorVerseLocalInteractions.ts',{'@/lib/creatorverse/integration-contract':contract});
const visitor=local.previewActor(false),owner=local.previewActor(true),post='local-existing';
const empty=()=>local.readInteractions(null,post);
const comment=(id,parentId=null)=>({action:'comment',id,parentId,text:`Comment ${id}`,createdAt:'2026-11-02T12:00:00Z'});
const apply=(data,input,actor=visitor,isOwner=false)=>local.reduceLocalInteraction(data,post,actor,isOwner,input);
test('legacy interaction keys, comments and shares migrate losslessly without invented times or truncation',()=>{
 const old={liked:true,comments:Array.from({length:60},(_,i)=>({id:`c${i}`,parentId:null,text:`Preserved ${i}`})),caption:'Original',shared:true};
 const restored=local.readInteractions(JSON.stringify(old),post);assert.equal(restored.comments.length,60);assert.equal(restored.comments[0].createdAt,null);assert.equal(restored.shares[0].caption,'Original');assert.equal(restored.likes[0],visitor.id);
 assert.equal(local.interactionKey('Huntaphobia',post),`parapost.creatorverse.actions:Huntaphobia:${post}`);
});
test('likes and retries are idempotent and scoped per local actor',()=>{
 let d=apply(empty(),{action:'like'});d=apply(d,{action:'like'});assert.equal(d.likes.length,1);
 d=apply(d,{action:'like'},owner,true);assert.equal(d.likes.length,2);d=apply(d,{action:'unlike'});assert.deepEqual(Array.from(d.likes),[owner.id]);
});
test('comment/reply retries preserve one record, author identity, timestamps and parent IDs',()=>{
 let d=apply(empty(),comment('root'));d=apply(d,comment('root'));d=apply(d,comment('reply','root'));d=apply(d,comment('reply','root'));
 assert.equal(d.comments.length,2);assert.equal(d.comments[1].parentId,'root');assert.equal(d.comments[0].username,visitor.username);assert.equal(d.comments[0].createdAt,'2026-11-02T12:00:00Z');
 assert.equal(local.readInteractions(JSON.stringify(d),post).comments.length,2);
});
test('only local author or supported page-owner moderation can delete; root removes replies',()=>{
 let d=apply(empty(),comment('root'),owner,true);d=apply(d,comment('reply','root'));
 assert.throws(()=>apply(d,{action:'delete_comment',id:'root'}));
 d=apply(d,{action:'delete_comment',id:'reply'});assert.equal(d.comments.length,1);
 d=apply(d,comment('reply2','root'));d=apply(d,{action:'delete_comment',id:'root'},owner,true);assert.equal(d.comments.length,0);
});
test('removed parents, nested replies and invalid text are rejected without mutation',()=>{
 let d=apply(empty(),comment('root'));d=apply(d,comment('reply','root'));
 assert.throws(()=>apply(d,comment('deep','reply')));assert.throws(()=>apply(d,comment('orphan','gone')));
 for(const text of ['', ' '.repeat(3), 'x'.repeat(1201),'\u0001']) assert.throws(()=>apply(d,{...comment('bad'),text}));
 assert.equal(d.comments.length,2);
});
test('canonical local shares retain one source reference per actor, never duplicate content/media',()=>{
 const input={action:'share',id:'share1',caption:'Caption',createdAt:'2026-11-02T12:00:00Z'};
 let d=apply(empty(),input);d=apply(d,{...input,id:'share2'});assert.equal(d.shares.length,1);assert.equal(d.shares[0].postId,post);
 assert.equal('content' in d.shares[0],false);assert.equal('media' in d.shares[0],false);
});
test('fresh storage reads avoid lost updates; quota/corrupt errors preserve saved data',()=>{
 const values=new Map();const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 local.commitLocalInteraction(storage,'key',post,visitor,false,{action:'like'});
 local.commitLocalInteraction(storage,'key',post,owner,true,comment('owner'));
 const persisted=values.get('key');const d=local.readInteractions(persisted,post);assert.equal(d.likes.length,1);assert.equal(d.comments.length,1);
 assert.throws(()=>local.commitLocalInteraction({...storage,setItem(){throw new Error('Quota');}},'key',post,visitor,false,{action:'unlike'}));assert.equal(values.get('key'),persisted);
 values.set('key','{invalid');assert.throws(()=>local.commitLocalInteraction(storage,'key',post,visitor,false,{action:'like'}));assert.equal(values.get('key'),'{invalid');
});
const presentation=load('lib/creatorverse/integration-presentation.ts',{'./validation':validation});
const id='10000000-0000-4000-8000-000000000001';
test('canonical backend share projection preserves ordered media IDs without leaking storage or URLs',()=>{
 const row={share_id:id,shared_at:'2026-11-02T12:00:00Z',sharer_id:id,caption:'',post_id:id,page_id:id,page_name:'Huntaphobia',content:'Media',media:[{media_id:id,media_type:'video',mime_type:'video/mp4',display_order:0,storage_path:'secret',url:'https://attacker'}]};
 const result=presentation.creatorVerseShareReference(row);assert.equal(result.original.media[0].id,id);assert.equal(result.original.media[0].kind,'video');assert.doesNotMatch(JSON.stringify(result),/secret|attacker/);
 assert.throws(()=>presentation.creatorVerseShareReference({...row,media:[...row.media,...row.media]}));
});
const notifications=load('lib/creatorverse/notification-contract.ts',{'server-only':{},'./validation':validation});
const actor='20000000-0000-4000-8000-000000000002',parent='30000000-0000-4000-8000-000000000003';
const event={eventId:id,kind:'like',pageId:id,postId:id,actorId:actor,pageOwnerId:id,recipientCanRead:{[id]:true}};
test('notification plans are disabled and deduplicate the existing like/unlike lifecycle',()=>{
 const like=notifications.planCreatorVerseNotifications(event)[0],unlike=notifications.planCreatorVerseNotifications({...event,kind:'unlike'})[0];
 assert.equal(like.deduplicationKey,unlike.deduplicationKey);assert.equal(like.operation,'upsert');assert.equal(unlike.operation,'remove');assert.equal(like.dispatchEnabled,false);
});
test('notifications suppress self/blocked recipients and deduplicate reply recipients',()=>{
 assert.equal(notifications.planCreatorVerseNotifications({...event,actorId:id}).length,0);
 assert.equal(notifications.planCreatorVerseNotifications({...event,recipientCanRead:{[id]:false}}).length,0);
 const reply={...event,kind:'reply',parentAuthorId:parent,recipientCanRead:{[id]:true,[parent]:true}};
 assert.equal(notifications.planCreatorVerseNotifications(reply).length,2);
 assert.equal(notifications.planCreatorVerseNotifications({...reply,parentAuthorId:id}).length,1);
});
const social=load('lib/creatorverse/social-request.ts',{'./integration-contract':contract,'./validation':validation,'./permissions':permissions});
test('social requests reuse strict Phase 3 operations and reject owner claims and publication',()=>{
 const request={requestId:id,operation:{action:'comment',postId:id,parentId:null,content:'Hi'}};
 assert.equal(social.parseCreatorVerseSocialRequest(request).requestId,id);
 assert.throws(()=>social.parseCreatorVerseSocialRequest({...request,actorId:actor}));
 assert.throws(()=>social.parseCreatorVerseSocialRequest({...request,operation:{action:'create_post',content:'No'}}));
 assert.throws(()=>social.parseCreatorVerseSocialRequest({...request,operation:{action:'share',postId:id,caption:'',requestId:actor}}));
});
test('social server uses authenticated Phase 3 preflight and retains its locked executor',async()=>{
 const calls=[];const locked=async()=>{throw new permissions.CreatorVerseError(503,'locked');};
 const server=load('lib/creatorverse/social-server.ts',{'server-only':{},'./social-request':social,'./integration-server':{prepareCreatorVerseOperation:async(req,page,op)=>{calls.push([req,page,op]);return{actorId:'verified',executionEnabled:false};},executeCreatorVerseOperation:locked}});
 const result=await server.prepareCreatorVerseSocialRequest({},id,{requestId:id,operation:{action:'like',postId:id}});
 assert.equal(result.actorId,'verified');assert.equal(result.executionEnabled,false);assert.equal(calls.length,1);
 await assert.rejects(server.executeCreatorVerseSocialRequest(),e=>e.status===503);
});

test('comment/reply/share notification plans use source identity and stable retry keys without dispatch',()=>{
 for(const kind of ['comment','reply','share']) {
  const input={...event,kind};const a=notifications.planCreatorVerseNotifications(input)[0];const b=notifications.planCreatorVerseNotifications(input)[0];
  assert.equal(a.type,`creatorverse_${kind}`);assert.equal(a.user_id,id);assert.equal(a.actor_id,actor);assert.equal(a.target.postId,id);assert.equal(a.deduplicationKey,b.deduplicationKey);assert.equal(a.dispatchEnabled,false);
 }
});
test('unlike cleanup is retained after a visibility change without sending a notification',()=>{
 const plan=notifications.planCreatorVerseNotifications({...event,kind:'unlike',recipientCanRead:{}});
 assert.equal(plan.length,1);assert.equal(plan[0].operation,'remove');assert.equal(plan[0].dispatchEnabled,false);
});

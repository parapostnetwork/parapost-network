/** PREPARED ONLY. Mutating integration test; never part of the ordinary local test suite.
 * Requires four distinct, disposable, explicitly approved STAGING accounts and their JWTs.
 * No schema is applied. Does not use the Supabase CLI or a service-role key.
 */
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
if(process.argv[2]!=='--execute-approved-staging'||process.env.GROUPS_DB_TEST_APPROVED!=='vmgelrgrtpghmvqgufzz')throw new Error('Explicit staging database and Storage mutation approval required.');
const url=process.env.GROUPS_TEST_URL;
if(url!=='https://vmgelrgrtpghmvqgufzz.supabase.co')throw new Error('Refusing non-staging target.');
const key=process.env.GROUPS_TEST_ANON_KEY;if(!key)throw new Error('Missing staging publishable/anon key.');
const users={};
for(const role of ['OWNER','MEMBER','ADMIN','MODERATOR']){
 const token=process.env[`GROUPS_TEST_${role}_JWT`];if(!token)throw new Error(`Missing ${role} fixture token.`);
 const client=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.auth.getUser(token);assert.ok(!error&&data.user,`Authenticated ${role} fixture`);
 users[role]={client,id:data.user.id};
}
assert.equal(new Set(Object.values(users).map(u=>u.id)).size,4,'Four distinct fixture accounts required');
const {OWNER:o,MEMBER:m,ADMIN:a,MODERATOR:mod}=users;
const ok=async(p,label)=>{const r=await p;assert.equal(r.error,null,label);return r.data;};
const denied=async(p,label)=>{const r=await p;assert.ok(r.error,label);};
const rpc=(u,action,gid,payload={})=>u.client.rpc('groups_command',{p_action:action,p_group_id:gid,p_payload:payload});
const name=`Groups security fixture ${Date.now()}`;const created=[];
try{
 const g=await ok(rpc(o,'create',null,{name,description:'Disposable authorization fixture',visibility:'private'}),'create private');created.push({id:g.id,name});
 const otherName=`${name} public`;const other=await ok(rpc(o,'create',null,{name:otherName,description:'Cross Group fixture',visibility:'public'}),'create public');created.push({id:other.id,name:otherName});
 await ok(rpc(m,'join',other.id),'public join');
 let own=await ok(m.client.from('group_members').select('status').eq('group_id',other.id).eq('user_id',m.id),'public membership');assert.equal(own[0].status,'approved');
 await ok(rpc(m,'join',g.id),'private request');
 own=await ok(m.client.from('group_members').select('status').eq('group_id',g.id).eq('user_id',m.id),'private membership');assert.equal(own[0].status,'pending');
 await denied(rpc(m,'approve',g.id,{user_id:m.id}),'self approval denied');
 await denied(rpc(m,'edit',g.id,{name:'Unauthorized',description:'',visibility:'private'}),'editing denied');
 await denied(m.client.from('groups').insert({owner_id:o.id,name:'Spoof'}),'owner spoof denied');
 await denied(o.client.from('groups').update({owner_id:m.id}).eq('id',g.id),'owner reassignment denied');
 const draft=await ok(rpc(o,'draft',g.id,{content:'Confidential fixture'}),'draft');
 const media=[];
 // Minimal deterministic binary fixtures test access control, not video decoding/playback.
 const fixtures=[['image/png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlSAAAAAASUVORK5CYII=','base64')],['video/webm',Buffer.from([26,69,223,163,0,0,0,0])]];
 const cover=await ok(rpc(o,'reserve_cover',g.id,{mime_type:'image/png'}),'reserve cover');
 await ok(o.client.storage.from('group-media').upload(cover.path,fixtures[0][1],{contentType:'image/png',upsert:false}),'upload cover');
 await ok(rpc(o,'set_cover',g.id,{path:cover.path}),'set cover');
 await denied(rpc(m,'remove_cover',g.id),'pending member cannot remove cover');
 await ok(rpc(o,'remove_cover',g.id),'owner removes cover');
 const withoutCover=await ok(o.client.from('groups').select('cover_storage_path').eq('id',g.id).single(),'read removed cover');
 assert.equal(withoutCover.cover_storage_path,null,'default mascot restored');
 await denied(o.client.storage.from('group-media').download(cover.path),'removed cover inaccessible');
 for(const [mime,bytes] of fixtures){
   const reserved=await ok(rpc(o,'reserve_media',g.id,{post_id:draft.id,mime_type:mime}),'reserve media');media.push(reserved.path);
   await ok(o.client.storage.from('group-media').upload(reserved.path,bytes,{contentType:mime,upsert:false}),'owner upload');
 }
 await ok(rpc(o,'publish',g.id,{post_id:draft.id}),'publish');
 const readPosts=async(u)=>ok(u.client.from('group_posts').select('id').eq('id',draft.id),'read posts');
 assert.equal((await readPosts(m)).length,0,'pending post denial');
 for(const path of media){
   await denied(m.client.storage.from('group-media').download(path),'pending media denied');
   await denied(a.client.storage.from('group-media').download(path),'unrelated media denied');
   await denied(o.client.storage.from('group-media').createSignedUrl(path,86400),'even owner cannot mint signed download URLs');
   await denied(o.client.storage.from('group-media').createSignedUploadUrl(path),'signed uploads denied');
   await denied(m.client.storage.from('group-media').upload(path,fixtures[0][1],{contentType:'image/png',upsert:true}),'overwrite denied');
 }
 await ok(rpc(o,'approve',g.id,{user_id:m.id}),'approve member');assert.equal((await readPosts(m)).length,1,'approved reads');
 for(const path of media)await ok(m.client.storage.from('group-media').download(path),'approved media read');
 await denied(rpc(m,'role',g.id,{user_id:m.id,role:'admin'}),'self escalation denied');
 await denied(rpc(m,'delete_post',other.id,{post_id:draft.id}),'cross Group deletion denied');
 await denied(rpc(m,'reserve_media',other.id,{post_id:draft.id,mime_type:'image/png'}),'cross Group media denied');
 for(const [u,role] of [[a,'admin'],[mod,'moderator']]){
   await ok(rpc(u,'join',g.id),'staff requests');await ok(rpc(o,'approve',g.id,{user_id:u.id}),'staff approval');await ok(rpc(o,'role',g.id,{user_id:u.id,role}),'owner assigns role');
 }
 await denied(rpc(a,'role',g.id,{user_id:m.id,role:'admin'}),'admin cannot assign roles');
 await denied(rpc(a,'remove',g.id,{user_id:mod.id}),'admin cannot remove moderator');
 await denied(rpc(mod,'ban',g.id,{user_id:m.id}),'moderator cannot ban');
 await denied(rpc(o,'role',g.id,{user_id:m.id,role:'owner'}),'second owner denied');
 await denied(rpc(o,'leave',g.id),'owner cannot leave');
 await ok(rpc(a,'remove',g.id,{user_id:m.id}),'admin removes ordinary member');assert.equal((await readPosts(m)).length,0,'removed loses posts');
 for(const path of media)await denied(m.client.storage.from('group-media').download(path),'removed loses media');
 await ok(rpc(m,'leave',g.id),'leave on removed membership is harmless');await denied(rpc(m,'join',g.id),'removed cannot restore via leave/join');
 await ok(rpc(o,'restore',g.id,{user_id:m.id}),'owner restores to pending');await ok(rpc(a,'reject',g.id,{user_id:m.id}),'admin rejects');await denied(rpc(m,'join',g.id),'rejected cannot restore');
 await ok(rpc(a,'ban',g.id,{user_id:m.id}),'admin bans');await denied(rpc(m,'join',g.id),'banned cannot restore');
 for(const path of media)await denied(m.client.storage.from('group-media').download(path),'banned loses media');
 await ok(rpc(mod,'delete_post',g.id,{post_id:draft.id}),'moderator deletes post');
 for(const path of media)await denied(o.client.storage.from('group-media').download(path),'deleted post media denied even to owner');
 console.log('Role, membership and real Storage API assertions passed. Physical cleanup remains queued.');
}finally{
 for(const g of created.reverse())await ok(rpc(o,'delete',g.id,{confirmation:g.name}),'fixture Group cleanup');
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isGroupsTestTarget, groupsServerEnabled, groupsNavigationEnabled } from '../lib/groups/config.ts';
import { validateUpload, validateGroupFields, matchesSignature, IMAGE_LIMIT, VIDEO_LIMIT } from '../lib/groups/validation.ts';
const schema = readFileSync(new URL('../supabase/migrations/20261020023000_groups_initial_schema.sql',import.meta.url),'utf8');
test('production and lookalike origins are never eligible for Groups',()=>{
 for(const url of ['https://luzesphgdqazqhmqlniy.supabase.co','https://vmgelrgrtpghmvqgufzz.supabase.co.evil.example','https://example.com','invalid','http://vmgelrgrtpghmvqgufzz.supabase.co','https://vmgelrgrtpghmvqgufzz.supabase.co:123']) assert.equal(isGroupsTestTarget(url),false,url);
 for(const url of ['https://vmgelrgrtpghmvqgufzz.supabase.co','http://127.0.0.1:54321','http://localhost:54321'])assert.equal(isGroupsTestTarget(url),true,url);
});
test('both application flags are required; unset gates remain closed',()=>{
 const names=['GROUPS_ENABLED','NEXT_PUBLIC_GROUPS_ENABLED','NEXT_PUBLIC_SUPABASE_URL'];const saved=Object.fromEntries(names.map(n=>[n,process.env[n]]));
 try{for(const n of names)delete process.env[n];assert.equal(groupsServerEnabled(),false);
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://vmgelrgrtpghmvqgufzz.supabase.co';process.env.NEXT_PUBLIC_GROUPS_ENABLED='true';assert.equal(groupsNavigationEnabled(),true);assert.equal(groupsServerEnabled(),false);
 process.env.GROUPS_ENABLED='true';assert.equal(groupsServerEnabled(),true);process.env.NEXT_PUBLIC_SUPABASE_URL='https://luzesphgdqazqhmqlniy.supabase.co';assert.equal(groupsServerEnabled(),false);assert.equal(groupsNavigationEnabled(),false);
 }finally{for(const n of names){if(saved[n]===undefined)delete process.env[n];else process.env[n]=saved[n];}}
});
test('group fields reject missing, short, oversized and invalid visibility input',()=>{
 validateGroupFields('Ghost hunters','A community','private');
 for(const input of [[null,'','public'],['xx','','public'],['x'.repeat(101),'','public'],['Valid','x'.repeat(5001),'public'],['Valid','','secret']])assert.throws(()=>validateGroupFields(...input));
});
test('media size and MIME boundaries; covers cannot be videos',()=>{
 validateUpload('image/png',IMAGE_LIMIT);validateUpload('video/mp4',VIDEO_LIMIT);
 for(const args of [['image/svg+xml',10],['text/html',10],['image/png',0],['image/png',IMAGE_LIMIT+1],['video/webm',VIDEO_LIMIT+1],['image/png',NaN],['video/mp4',1,true]])assert.throws(()=>validateUpload(...args));
});
test('signature checks reject renamed HTML and truncated files',()=>{
 const html=new TextEncoder().encode('<html><script>');for(const mime of ['image/jpeg','image/png','image/webp','video/mp4','video/webm']){assert.equal(matchesSignature(mime,html),false);assert.equal(matchesSignature(mime,new Uint8Array()),false);}
 assert.equal(matchesSignature('image/png',new Uint8Array([137,80,78,71,13,10,26,10])),true);
 assert.equal(matchesSignature('image/jpeg',new Uint8Array([255,216,255])),true);
 assert.equal(matchesSignature('image/webp',new TextEncoder().encode('RIFF0000WEBP')),true);
 assert.equal(matchesSignature('video/mp4',new TextEncoder().encode('0000ftypisom')),true);
 assert.equal(matchesSignature('video/webm',new Uint8Array([26,69,223,163])),true);
});
// These are regression tripwires, NOT execution of RLS, triggers or authorization functions.
test('schema defaults off and retires old membership endpoints',()=>{
 assert.match(schema,/enabled boolean NOT NULL DEFAULT false/);
 assert.match(schema,/REVOKE EXECUTE ON FUNCTION public.request_group_membership\(uuid\) FROM authenticated/);
 assert.match(schema,/REVOKE EXECUTE ON FUNCTION public.review_group_membership\(uuid,uuid,text\) FROM authenticated/);
});
test('group data remains separate and direct table writes remain revoked',()=>{
 for(const table of ['groups','group_members','group_posts','group_post_media']){assert.match(schema,new RegExp(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`));assert.match(schema,new RegExp(`REVOKE ALL ON public.${table}`));}
 assert.doesNotMatch(schema,/(?:INSERT INTO|UPDATE|DELETE FROM) public\.(?:posts|reels|messages)\b/i);
 assert.doesNotMatch(schema,/GRANT (?:ALL|INSERT|UPDATE|DELETE).*ON public\.(?:groups|group_members|group_posts|group_post_media)/i);
});
test('storage guards constrain legacy policies, signing, bucket privacy and object mutation',()=>{
 for(const operation of ['read','insert','update','delete'])assert.match(schema,new RegExp(`groups_storage_${operation}_guard ON storage.objects AS RESTRICTIVE`));
 assert.match(schema,/storage.allow_only_operation\('object.get_authenticated'\)/);
 assert.match(schema,/storage.allow_only_operation\('object.upload'\)/);
 for(const operation of ['insert','update','delete'])assert.match(schema,new RegExp(`groups_bucket_${operation}_guard ON storage.buckets AS RESTRICTIVE`));
 assert.doesNotMatch(schema,/DELETE FROM storage.objects/i);
});
test('security definer functions pin an empty search path',()=>{
 for(const statement of schema.matchAll(/CREATE (?:OR REPLACE )?FUNCTION[\s\S]*?AS (?:\$\$|\$function\$)/gi)) {
   if(/SECURITY DEFINER/i.test(statement[0]))assert.match(statement[0],/SET search_path\s*=\s*''/i);
 }
});
test('staging availability defaults to approved testers rather than all members',()=>{
 assert.match(schema,/allow_all_authenticated boolean NOT NULL DEFAULT false/);
 assert.match(schema,/CREATE TABLE parapost_groups_private.test_users/);
 assert.match(schema,/allow_all_authenticated OR EXISTS\(SELECT 1 FROM parapost_groups_private.test_users WHERE user_id=auth.uid\(\)\)/);
 assert.match(schema,/REVOKE ALL ON parapost_groups_private.test_users FROM PUBLIC,anon,authenticated/);
});
test('Group covers reuse official platform artwork and remove covers through authorization',()=>{
 const cover=readFileSync(new URL('../app/groups/GroupCover.tsx',import.meta.url),'utf8');
 const dashboard=readFileSync(new URL('../app/dashboard/page.tsx',import.meta.url),'utf8');
 assert.match(cover,/OFFICIAL_PARAGHOST='\/parapost-icon-white.png'/);assert.match(dashboard,/src="\/parapost-icon-white.png"/);
 assert.match(cover,/onError=/);assert.match(schema,/action='remove_cover'[\s\S]*?allowed\(gid,'admin'\)[\s\S]*?cover_storage_path=NULL/);
});

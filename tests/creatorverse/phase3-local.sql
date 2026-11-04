-- Run ONLY through the isolated runner. Test-only identity/grants do not represent real Auth.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('10000000-0000-4000-8000-000000000001','owner@example.invalid'),
 ('20000000-0000-4000-8000-000000000002','visitor@example.invalid'),
 ('30000000-0000-4000-8000-000000000003','other@example.invalid');
INSERT INTO public.creatorverse_pages(id,owner_id,name,category,status) VALUES
 ('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Huntaphobia','creator','active'),
 ('40000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','Draft identity','creator','draft');
INSERT INTO public.creatorverse_posts(id,page_id,author_id,content,status) VALUES
 ('50000000-0000-4000-8000-000000000005','40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Published text','published');
SELECT cv_test.ok(NOT has_function_privilege('authenticated','creatorverse_private.mutate_post(uuid,uuid,text,text)','EXECUTE'),'mutation contracts not granted');
SELECT cv_test.ok(NOT has_function_privilege('anon','creatorverse_private.interact(uuid,uuid,text,uuid,text,uuid)','EXECUTE'),'interactions not granted');
SET LOCAL ROLE anon;
SELECT cv_test.ok((SELECT count(id)=0 FROM public.creatorverse_pages),'read gate closed');
RESET ROLE;
UPDATE creatorverse_private.feature_gate SET enabled=true;
SET LOCAL ROLE anon;
SELECT cv_test.ok((SELECT count(id)=1 FROM public.creatorverse_pages),'public reads active pages only');
SELECT cv_test.denied('SELECT owner_id FROM public.creatorverse_pages','42501','owner identity private');
SELECT cv_test.denied($$INSERT INTO public.creatorverse_posts(page_id,author_id,content) VALUES('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','attack')$$,'42501','anonymous direct writes denied');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT cv_test.ok(NOT public.creatorverse_operation_access('40000000-0000-4000-8000-000000000004',NULL,'create_post'),'owner also denied by write gate');
RESET ROLE;

-- These grants exist ONLY in the rollback test transaction, to exercise prepared
-- private commands as authenticated callers. Existing publish RPC is never enabled.
GRANT EXECUTE ON FUNCTION creatorverse_private.mutate_post(uuid,uuid,text,text),creatorverse_private.reserve_media(uuid,uuid,text,bigint,integer),
 creatorverse_private.detach_media(uuid,uuid,uuid),creatorverse_private.interact(uuid,uuid,text,uuid,text,uuid),
 creatorverse_private.post_counts(uuid),creatorverse_private.shared_feed(uuid,integer,integer) TO authenticated;
UPDATE creatorverse_private.feature_gate SET writes_enabled=true;
SET LOCAL ROLE authenticated;
SELECT creatorverse_private.mutate_post('40000000-0000-4000-8000-000000000004',NULL,'create_post','') AS draft \gset
SELECT cv_test.ok((SELECT count(id)=1 FROM public.creatorverse_posts WHERE id=:'draft' AND status='draft'),'owner creates empty media draft');
SELECT creatorverse_private.mutate_post('40000000-0000-4000-8000-000000000004',:'draft','edit_post','Owner edit');
SELECT cv_test.ok((SELECT content='Owner edit' FROM public.creatorverse_posts WHERE id=:'draft'),'owner edit persisted');
SELECT cv_test.denied($$SELECT creatorverse_private.mutate_post('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','edit_post','')$$,'23514','empty published text denied');
SELECT creatorverse_private.reserve_media('40000000-0000-4000-8000-000000000004',:'draft','image/png',100,0) AS reservation \gset
SELECT (:'reservation'::jsonb->>'path') AS image_path, (:'reservation'::jsonb->>'media_id') AS image_id \gset
INSERT INTO storage.objects(bucket_id,name) VALUES('creatorverse-private',:'image_path');
SELECT cv_test.ok((SELECT count(*)=1 FROM storage.objects WHERE name=:'image_path'),'owner reserved upload allowed');
SELECT cv_test.denied($$INSERT INTO storage.objects(bucket_id,name) VALUES('creatorverse-private','forged/path')$$,'42501','unreserved upload denied despite legacy permissive policy');
WITH updated AS (UPDATE storage.objects SET name='replaced' WHERE name=:'image_path' RETURNING id) SELECT cv_test.ok(count(*)=0,'storage overwrite blocked') FROM updated;
WITH deleted AS (DELETE FROM storage.objects WHERE name=:'image_path' RETURNING id) SELECT cv_test.ok(count(*)=0,'direct storage delete blocked') FROM deleted;
SELECT cv_test.denied($$SELECT creatorverse_private.reserve_media('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','image/png',100,0)$$,'42501','published attachment changes denied');
RESET ROLE;
SELECT cv_test.ok((SELECT verification='pending' FROM public.creatorverse_media WHERE id=:'image_id'),'upload never self-verifies');
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT cv_test.ok((SELECT count(*)=0 FROM storage.objects WHERE name=:'image_path'),'visitor cannot read draft media');
SELECT cv_test.denied($$SELECT creatorverse_private.mutate_post('40000000-0000-4000-8000-000000000004',NULL,'create_post','visitor')$$,'42501','visitor cannot create');
SELECT cv_test.denied(format('SELECT creatorverse_private.mutate_post(%L,%L,%L,%L)','40000000-0000-4000-8000-000000000004',:'draft','edit_post','visitor'),'42501','visitor cannot edit');
SELECT cv_test.denied(format('SELECT creatorverse_private.mutate_post(%L,%L,%L,%L)','40000000-0000-4000-8000-000000000004',:'draft','delete_post',''),'42501','visitor cannot delete');
SELECT cv_test.denied(format('SELECT creatorverse_private.detach_media(%L,%L,%L)','40000000-0000-4000-8000-000000000004',:'draft',:'image_id'),'42501','visitor cannot manage media');
SELECT cv_test.denied(format('INSERT INTO storage.objects(bucket_id,name) VALUES(%L,%L)','creatorverse-private',:'image_path'||'-other'),'42501','visitor cannot upload under owner reservation');
SELECT creatorverse_private.interact('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','like');
SELECT creatorverse_private.interact('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','like');
SELECT cv_test.ok(creatorverse_private.post_counts('50000000-0000-4000-8000-000000000005')->>'likes'='1','like idempotent and counted once');
SELECT creatorverse_private.interact('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','unlike');
SELECT cv_test.ok(creatorverse_private.post_counts('50000000-0000-4000-8000-000000000005')->>'likes'='0','unlike updates count');
SELECT creatorverse_private.interact('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','comment',NULL,'Root') AS comment \gset
SELECT creatorverse_private.interact('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','comment',:'comment','Reply') AS reply \gset
SELECT cv_test.ok(creatorverse_private.post_counts('50000000-0000-4000-8000-000000000005')->>'comments'='2','comments include replies');
SELECT cv_test.denied(format('SELECT creatorverse_private.interact(%L,%L,%L,%L,%L)','40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','comment',:'reply','Too deep'),'42501','nested reply depth bounded');
SELECT creatorverse_private.interact('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','delete_comment',:'reply');
SELECT cv_test.ok(creatorverse_private.post_counts('50000000-0000-4000-8000-000000000005')->>'comments'='1','reply author can remove own reply');
SELECT cv_test.denied(format('SELECT creatorverse_private.interact(%L,%L,%L,%L,%L)','40000000-0000-4000-8000-000000000004',:'draft','comment',:'comment','Wrong post'),'42501','cross-post reply rejected');
RESET ROLE;
UPDATE public.creatorverse_posts SET comments_enabled=false WHERE id='50000000-0000-4000-8000-000000000005';
SET LOCAL ROLE authenticated;
SELECT cv_test.denied(format('SELECT creatorverse_private.interact(%L,%L,%L,%L,%L)','40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','comment',:'comment','Disabled'),'42501','comments disabled blocks replies');
RESET ROLE;
UPDATE public.creatorverse_posts SET comments_enabled=true WHERE id='50000000-0000-4000-8000-000000000005';
SET LOCAL ROLE authenticated;
SELECT creatorverse_private.interact('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','share',NULL,'Caption','60000000-0000-4000-8000-000000000006') AS share \gset
SELECT cv_test.ok(creatorverse_private.interact('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','share',NULL,'Caption','60000000-0000-4000-8000-000000000006')=:'share','share retry idempotent');
SELECT cv_test.denied($$SELECT creatorverse_private.interact('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','share',NULL,'Changed','60000000-0000-4000-8000-000000000006')$$,'23505','idempotency payload mismatch rejected');
SELECT cv_test.denied($$SELECT creatorverse_private.interact('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','share',NULL,'Duplicate','60000000-0000-4000-8000-000000000007')$$,'23505','duplicate canonical share rejected');
SELECT cv_test.ok((SELECT count(*)=1 FROM creatorverse_private.shared_feed(NULL,20,0) WHERE page_name='Huntaphobia' AND source_path='/creatorverse/40000000-0000-4000-8000-000000000004'),'Dashboard projection retains identity and source link');
SELECT cv_test.ok((SELECT count(*)=1 FROM creatorverse_private.shared_feed(auth.uid(),20,0)),'Profile projection scoped to sharer');
SELECT cv_test.ok((SELECT count(*)=0 FROM creatorverse_private.shared_feed('30000000-0000-4000-8000-000000000003',20,0)),'other profile excludes share');
RESET ROLE;
SELECT cv_test.ok((SELECT count(*)=2 FROM public.creatorverse_posts),'sharing never duplicates CreatorVerse post');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
SELECT cv_test.denied(format('SELECT creatorverse_private.interact(%L,%L,%L,%L)','40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','delete_comment',:'comment'),'42501','unrelated user cannot delete comment');
RESET ROLE;
INSERT INTO public.user_blocks VALUES('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
SELECT cv_test.denied(format('SELECT creatorverse_private.interact(%L,%L,%L,%L,%L)','40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','comment',:'comment','Blocked parent'),'42501','blocked comment author cannot receive reply');
RESET ROLE;
DELETE FROM public.user_blocks;
SET LOCAL ROLE authenticated;

RESET ROLE;
INSERT INTO public.blocked_users VALUES('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002');
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT cv_test.ok((SELECT count(id)=0 FROM public.creatorverse_posts),'blocked user cannot read posts');
SELECT cv_test.ok((SELECT count(*)=0 FROM creatorverse_private.shared_feed()),'block hides shared projection');
SELECT cv_test.ok(creatorverse_private.post_counts('50000000-0000-4000-8000-000000000005') IS NULL,'block hides counters');
SELECT cv_test.denied($$SELECT creatorverse_private.interact('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','like')$$,'42501','blocked like rejected');
SELECT cv_test.denied($$SELECT creatorverse_private.interact('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','share',NULL,'Blocked','60000000-0000-4000-8000-000000000008')$$,'42501','blocked share rejected');
RESET ROLE;
DELETE FROM public.blocked_users;
INSERT INTO public.user_blocks VALUES('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT cv_test.ok((SELECT count(id)=0 FROM public.creatorverse_pages),'reverse block in alternate table enforced');
RESET ROLE;
DELETE FROM public.user_blocks;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT creatorverse_private.interact('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','delete_comment',:'comment');
SELECT cv_test.ok(creatorverse_private.post_counts('50000000-0000-4000-8000-000000000005')->>'comments'='0','owner removal hides root and replies and updates count');
SELECT creatorverse_private.detach_media('40000000-0000-4000-8000-000000000004',:'draft',:'image_id');
SELECT cv_test.ok((SELECT count(*)=0 FROM storage.objects WHERE name=:'image_path'),'detached media immediately unreadable');
RESET ROLE;
SELECT cv_test.ok((SELECT count(*)=1 FROM creatorverse_private.media_cleanup WHERE storage_path=:'image_path'),'detach queues exact object cleanup');
SELECT cv_test.ok((SELECT count(*)=0 FROM creatorverse_private.upload_reservations WHERE media_id=:'image_id'),'detach revokes reservation');
UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=auth.uid();
SET LOCAL ROLE authenticated;
SELECT cv_test.ok(NOT public.creatorverse_operation_access('40000000-0000-4000-8000-000000000004',NULL,'create_post'),'banned owner denied');
RESET ROLE;
UPDATE auth.users SET banned_until=NULL,is_anonymous=true WHERE id=auth.uid();
SET LOCAL ROLE authenticated;
SELECT cv_test.ok(NOT public.creatorverse_operation_access('40000000-0000-4000-8000-000000000004',NULL,'create_post'),'anonymous Auth user denied');
RESET ROLE;
UPDATE auth.users SET is_anonymous=false WHERE id=auth.uid();
SET LOCAL ROLE authenticated;
SELECT creatorverse_private.mutate_post('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','delete_post');
SELECT cv_test.ok((SELECT count(*)=0 FROM creatorverse_private.shared_feed()),'deleted source disappears from Dashboard/Profile projection');
RESET ROLE;
SELECT cv_test.ok((SELECT status='deleted' FROM public.creatorverse_posts WHERE id='50000000-0000-4000-8000-000000000005'),'owner deletion is persisted tombstone');
-- Additional direct RLS tests with rollback-only grants, independent of RPC ownership checks.
GRANT INSERT(page_id,author_id,content),UPDATE(content,status) ON public.creatorverse_posts TO authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT cv_test.denied($$INSERT INTO public.creatorverse_posts(page_id,author_id,content) VALUES('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','spoof')$$,'42501','RLS prevents spoofed owner even with INSERT grant');
WITH changed AS (UPDATE public.creatorverse_posts SET content='attack' WHERE id=:'draft' RETURNING id)
SELECT cv_test.ok(count(*)=0,'RLS visitor edit sees no writable rows') FROM changed;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT cv_test.denied(format('UPDATE public.creatorverse_posts SET status=%L WHERE id=%L','published',:'draft'),'42501','direct RLS cannot publish draft');
SELECT cv_test.denied(format('SELECT creatorverse_private.reserve_media(%L,%L,%L,100,0)','40000000-0000-4000-8000-000000000004',:'draft','image/svg+xml'),'22023','unsafe media MIME rejected');
SELECT cv_test.denied(format('SELECT creatorverse_private.reserve_media(%L,%L,%L,8388609,0)','40000000-0000-4000-8000-000000000004',:'draft','image/png'),'22023','oversize image rejected');
SELECT creatorverse_private.reserve_media('40000000-0000-4000-8000-000000000004',:'draft','video/mp4',100,0) AS video \gset
SELECT (:'video'::jsonb->>'path') AS video_path,( :'video'::jsonb->>'media_id') AS video_id \gset
SELECT creatorverse_private.reserve_media('40000000-0000-4000-8000-000000000004',:'draft','image/jpeg',100,1);
SELECT creatorverse_private.reserve_media('40000000-0000-4000-8000-000000000004',:'draft','image/webp',100,2);
SELECT creatorverse_private.reserve_media('40000000-0000-4000-8000-000000000004',:'draft','image/png',100,3);
SELECT cv_test.denied(format('SELECT creatorverse_private.reserve_media(%L,%L,%L,100,0)','40000000-0000-4000-8000-000000000004',:'draft','image/png'),'23514','four attachment cap enforced');
RESET ROLE;
UPDATE creatorverse_private.upload_reservations SET expires_at=now()-interval '1 minute' WHERE media_id=:'video_id';
SET LOCAL ROLE authenticated;
SELECT cv_test.denied(format('INSERT INTO storage.objects(bucket_id,name) VALUES(%L,%L)','creatorverse-private',:'video_path'),'42501','expired reservation denied');
RESET ROLE;
-- Seed verified published media as a trusted fixture; no real verification/publish RPC is invoked.
INSERT INTO storage.objects(bucket_id,name) VALUES('creatorverse-private',:'video_path');
UPDATE public.creatorverse_media SET verification='verified',duration_seconds=2 WHERE id=:'video_id';
UPDATE public.creatorverse_posts SET status='published' WHERE id=:'draft';
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE anon;
SELECT cv_test.ok((SELECT count(*)=1 FROM storage.objects WHERE name=:'video_path'),'public visitor reads verified published media');
SELECT cv_test.ok((SELECT count(*)=0 FROM storage.objects WHERE name=:'image_path'),'unreferenced media never leaks to visitor');
RESET ROLE;
SELECT cv_test.ok(NOT creatorverse_private.cleanup_ready(:'image_path'),'cleanup waits for upload grace window');
UPDATE creatorverse_private.media_cleanup SET next_attempt_at=now()-interval '1 second' WHERE storage_path=:'image_path';
SELECT cv_test.ok(creatorverse_private.cleanup_ready(:'image_path'),'detached expired object eligible for cleanup');
INSERT INTO creatorverse_private.media_cleanup(storage_path) VALUES(:'video_path');
SELECT cv_test.ok(NOT creatorverse_private.cleanup_ready(:'video_path'),'cleanup refuses a still-published media reference');
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT creatorverse_private.mutate_post('40000000-0000-4000-8000-000000000004',:'draft','delete_post');
SELECT cv_test.ok((SELECT count(*)=0 FROM storage.objects WHERE name=:'video_path'),'deleted post media inaccessible even to owner');
RESET ROLE;
SELECT cv_test.ok((SELECT count(*)=4 FROM creatorverse_private.media_cleanup WHERE storage_path IN (SELECT storage_path FROM public.creatorverse_media WHERE post_id=:'draft')),'post deletion queues all attachments');
SELECT cv_test.ok((SELECT count(*)=0 FROM creatorverse_private.upload_reservations WHERE media_id IN (SELECT id FROM public.creatorverse_media WHERE post_id=:'draft')),'post deletion revokes every upload reservation');
INSERT INTO storage.buckets(id,name,public) VALUES('unrelated-test','unrelated-test',false);
SET LOCAL ROLE authenticated;
INSERT INTO storage.objects(bucket_id,name) VALUES('unrelated-test','preserved');
SELECT cv_test.ok((SELECT count(*)=1 FROM storage.objects WHERE bucket_id='unrelated-test'),'other bucket access unaffected');
RESET ROLE;

UPDATE creatorverse_private.feature_gate SET writes_enabled=false;
SET LOCAL ROLE authenticated;
SELECT cv_test.denied($$SELECT creatorverse_private.mutate_post('40000000-0000-4000-8000-000000000004',NULL,'create_post','Locked')$$,'42501','database gate denies mutation even with test execution grant');
SELECT cv_test.ok(NOT public.creatorverse_operation_access('40000000-0000-4000-8000-000000000004',NULL,'publish'),'unknown and publish actions never authorize');
RESET ROLE;
SELECT count(*) AS passed_database_checks FROM cv_test.results;
ROLLBACK;

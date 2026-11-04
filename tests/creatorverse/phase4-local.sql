-- Isolated local fixtures only; identity is simulated, RLS executes in PostgreSQL.
BEGIN;
INSERT INTO auth.users(id,email) VALUES('10000000-0000-4000-8000-000000000001','owner4@example.invalid'),('20000000-0000-4000-8000-000000000002','visitor4@example.invalid');
INSERT INTO public.creatorverse_pages(id,owner_id,name,category,status) VALUES('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Huntaphobia','creator','active');
INSERT INTO public.creatorverse_posts(id,page_id,author_id,content,status) VALUES('50000000-0000-4000-8000-000000000005','40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Original media post','published');
INSERT INTO public.creatorverse_media(id,page_id,post_id,purpose,media_type,storage_path,mime_type,verification,byte_size,duration_seconds,display_order) VALUES
 ('70000000-0000-4000-8000-000000000007','40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','post','image','40000000-0000-4000-8000-000000000004/image','image/png','verified',100,NULL,0),
 ('70000000-0000-4000-8000-000000000008','40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','post','video','40000000-0000-4000-8000-000000000004/video','video/mp4','verified',100,2,1),
 ('70000000-0000-4000-8000-000000000009','40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','post','image','40000000-0000-4000-8000-000000000004/pending','image/png','pending',100,NULL,2);
SELECT cv_test.ok(NOT has_function_privilege('authenticated','creatorverse_private.interact_once(uuid,uuid,text,uuid,text,uuid)','EXECUTE'),'Phase 4 social executor remains revoked');
SELECT cv_test.ok(NOT has_function_privilege('authenticated','creatorverse_private.shared_feed_v2(uuid,integer,integer)','EXECUTE'),'Phase 4 feed remains unexposed');
GRANT EXECUTE ON FUNCTION creatorverse_private.interact_once(uuid,uuid,text,uuid,text,uuid),creatorverse_private.shared_feed_v2(uuid,integer,integer) TO authenticated;
UPDATE creatorverse_private.feature_gate SET enabled=true,writes_enabled=true;
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT creatorverse_private.interact_once('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','comment',NULL,'Retry comment','60000000-0000-4000-8000-000000000001') AS root \gset
SELECT cv_test.ok(creatorverse_private.interact_once('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','comment',NULL,'Retry comment','60000000-0000-4000-8000-000000000001')=:'root','comment retry returns same ID');
SELECT cv_test.denied($$SELECT creatorverse_private.interact_once('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','comment',NULL,'Changed payload','60000000-0000-4000-8000-000000000001')$$,'23505','comment retry cannot mutate original intent');
SELECT creatorverse_private.interact_once('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','comment',:'root','Reply','60000000-0000-4000-8000-000000000002') AS reply \gset
SELECT cv_test.ok(creatorverse_private.interact_once('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','comment',:'root','Reply','60000000-0000-4000-8000-000000000002')=:'reply','reply retry preserves one child');
SELECT creatorverse_private.interact_once('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','delete_comment',:'reply','','60000000-0000-4000-8000-000000000003');
SELECT cv_test.ok(creatorverse_private.interact_once('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','delete_comment',:'reply','','60000000-0000-4000-8000-000000000003')=:'reply','author deletion retry safely returns same ID');
SELECT creatorverse_private.interact_once('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','share',NULL,'Canonical media share','60000000-0000-4000-8000-000000000004');
SELECT cv_test.ok((SELECT jsonb_array_length(media)=2 FROM creatorverse_private.shared_feed_v2()),'share projects verified image and video only');
SELECT cv_test.ok((SELECT media->0->>'media_id'='70000000-0000-4000-8000-000000000007' AND media->1->>'media_type'='video' FROM creatorverse_private.shared_feed_v2()),'share preserves ordered original media references');
SELECT cv_test.ok((SELECT NOT (media::text LIKE '%storage_path%') FROM creatorverse_private.shared_feed_v2()),'share never leaks storage paths');
SELECT cv_test.ok((SELECT page_name='Huntaphobia' AND content='Original media post' FROM creatorverse_private.shared_feed_v2(auth.uid())),'Profile projection retains attribution and content');
SELECT cv_test.denied('SELECT * FROM creatorverse_private.social_requests','42501','retry ledger cannot be read by app roles');
RESET ROLE;
SELECT cv_test.ok((SELECT count(*)=1 FROM public.creatorverse_posts),'social operations never duplicate original post');
INSERT INTO public.user_blocks VALUES('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT cv_test.ok((SELECT count(*)=0 FROM creatorverse_private.shared_feed_v2()),'blocked share and media references disappear');
SELECT cv_test.denied($$SELECT creatorverse_private.interact_once('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','comment',NULL,'Retry comment','60000000-0000-4000-8000-000000000001')$$,'42501','previously successful retry denied after block');
RESET ROLE;
DELETE FROM public.user_blocks;
UPDATE public.creatorverse_pages SET status='draft';
SET LOCAL ROLE authenticated;
SELECT cv_test.ok((SELECT count(*)=0 FROM creatorverse_private.shared_feed_v2()),'unpublished page hides share and media');
SELECT cv_test.denied($$SELECT creatorverse_private.interact_once('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','like',NULL,'','60000000-0000-4000-8000-000000000005')$$,'42501','private draft page rejects interactions');
RESET ROLE;
UPDATE public.creatorverse_pages SET status='suspended';
SET LOCAL ROLE authenticated;
SELECT cv_test.ok((SELECT count(*)=0 FROM creatorverse_private.shared_feed_v2()),'suspended page hides shared references');
RESET ROLE;
SELECT count(*) AS passed_phase4_database_checks FROM cv_test.results;
ROLLBACK;

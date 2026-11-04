-- UNEXECUTED database test draft. Requires BOTH reviewed foundation drafts installed
-- in a disposable local Supabase database, with pgTAP already available in extensions.
-- Do not run against staging/production without separate approval. Everything rolls back.
BEGIN;
SET LOCAL search_path=public,extensions;
SELECT plan(16);
INSERT INTO auth.users(id,email,is_anonymous) VALUES
 ('10000000-0000-4000-8000-000000000001','cv-owner@example.invalid',false),
 ('20000000-0000-4000-8000-000000000002','cv-follower@example.invalid',false);
INSERT INTO public.creatorverse_pages(id,owner_id,name,category,status) VALUES
 ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Public page','creator','active'),
 ('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Draft page','creator','draft');
INSERT INTO public.creatorverse_posts(id,page_id,author_id,content,status) VALUES
 ('50000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Published','published'),
 ('60000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Secret draft','draft');
INSERT INTO public.creatorverse_follows(page_id,user_id) VALUES
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002');

SET LOCAL ROLE anon;
SELECT is((SELECT count(id) FROM public.creatorverse_pages),0::bigint,'closed gate hides pages');
RESET ROLE;
UPDATE creatorverse_private.feature_gate SET enabled=true;
SET LOCAL ROLE anon;
SELECT is((SELECT count(id) FROM public.creatorverse_pages),1::bigint,'anonymous reads only active pages');
SELECT is((SELECT count(id) FROM public.creatorverse_posts),1::bigint,'anonymous reads only published posts');
SELECT throws_ok($$SELECT owner_id FROM public.creatorverse_pages$$,'42501',NULL,'public projection protects ownership metadata');
SELECT throws_ok($$INSERT INTO public.creatorverse_posts(page_id,author_id,content) VALUES ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','attack')$$,'42501',NULL,'anonymous cannot publish');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is((public.creatorverse_page_access('30000000-0000-4000-8000-000000000003')->>'can_publish')::boolean,false,'write gate also constrains owner capability');
SELECT throws_ok($$INSERT INTO public.creatorverse_posts(page_id,author_id,content) VALUES ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','owner')$$,'42501',NULL,'Phase 1 has no direct write grants even for owner');
RESET ROLE;

-- Temporary test-only grants exercise RLS itself independently of Phase 1's revoked DML.
UPDATE creatorverse_private.feature_gate SET writes_enabled=true;
GRANT INSERT(page_id,author_id,content), UPDATE(content,status) ON public.creatorverse_posts TO authenticated;
SET LOCAL ROLE authenticated;
SELECT is((public.creatorverse_page_access('30000000-0000-4000-8000-000000000003')->>'can_publish')::boolean,true,'eligible owner has structural publishing capability');
SELECT lives_ok($$INSERT INTO public.creatorverse_posts(page_id,author_id,content) VALUES ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','owner draft')$$,'owner may create a draft under RLS');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is((public.creatorverse_page_access('30000000-0000-4000-8000-000000000003')->>'can_publish')::boolean,false,'following confers no publishing rights');
SELECT throws_ok($$INSERT INTO public.creatorverse_posts(page_id,author_id,content) VALUES ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','follower attack')$$,'42501',NULL,'follower cannot create top-level posts');
SELECT throws_ok($$INSERT INTO public.creatorverse_posts(page_id,author_id,content) VALUES ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','spoofed owner')$$,'42501',NULL,'follower cannot spoof owner');
SELECT is((WITH changed AS (UPDATE public.creatorverse_posts SET content='attack' WHERE id='50000000-0000-4000-8000-000000000005' RETURNING id) SELECT count(*) FROM changed),0::bigint,'non-owner cannot edit owner post');
RESET ROLE;
INSERT INTO public.blocked_users(blocker_id,blocked_id) VALUES ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(id) FROM public.creatorverse_pages),0::bigint,'two-way block hides page for authenticated visitor');
SELECT is((SELECT count(id) FROM public.creatorverse_posts),0::bigint,'two-way block hides posts');
RESET ROLE;
UPDATE public.creatorverse_pages SET status='suspended' WHERE id='30000000-0000-4000-8000-000000000003';
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE anon;
SELECT is((SELECT count(id) FROM public.creatorverse_pages),0::bigint,'suspended page is absent for signed-out visitors');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;

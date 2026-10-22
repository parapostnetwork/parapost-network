-- PREPARED, NOT EXECUTED. Requires explicit approval to mutate a disposable test DB.
-- Run only after the reviewed Groups schema exists, as a test administrator.
-- Begin by SET app.groups_test_approved = 'isolated-groups-test'; in the SAME session.
-- Independently verify the connection is approved staging/local, never the linked CLI.
-- Every fixture and feature-gate change is rolled back. Storage bytes are NOT tested here.
BEGIN;
DO $$ BEGIN
 IF current_setting('app.groups_test_approved',true) IS DISTINCT FROM 'isolated-groups-test' THEN
   RAISE EXCEPTION 'Explicit isolated database test authorization is required';
 END IF;
END $$;
CREATE TEMP TABLE group_test_ids(key text PRIMARY KEY,id uuid);
INSERT INTO group_test_ids VALUES ('owner',gen_random_uuid()),('member',gen_random_uuid()),('outsider',gen_random_uuid()),('admin',gen_random_uuid()),('moderator',gen_random_uuid());
INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data)
 SELECT id,'authenticated','authenticated','groups-test-'||id::text||'@example.invalid',jsonb_build_object('username','gtest_'||replace(id::text,'-','')) FROM group_test_ids;
INSERT INTO parapost_groups_private.test_users(user_id) SELECT id FROM group_test_ids;
UPDATE parapost_groups_private.feature_gate SET enabled=true;
GRANT ALL ON group_test_ids TO authenticated;
CREATE FUNCTION pg_temp.check_that(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.denied(statement text,label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAILED: expected rejection: %',label; END IF;
END $$;
CREATE FUNCTION pg_temp.login(who text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',(SELECT id::text FROM group_test_ids WHERE key=who),true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',(SELECT id FROM group_test_ids WHERE key=who),'role','authenticated')::text,true);
END $$;
-- Fail-closed gate checks before exercising normal fixture workflows.
UPDATE parapost_groups_private.feature_gate SET enabled=false,allow_all_authenticated=false;
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('owner');
SELECT pg_temp.check_that(NOT public.groups_available(),'disabled gate denies approved tester');
SELECT pg_temp.denied('SELECT public.groups_command(''create'',null,''{"name":"Denied gate"}'')','disabled gate rejects direct RPC');
RESET ROLE;
UPDATE parapost_groups_private.feature_gate SET enabled=true;
DELETE FROM parapost_groups_private.test_users WHERE user_id=(SELECT id FROM group_test_ids WHERE key='outsider');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('outsider');
SELECT pg_temp.check_that(NOT public.groups_available(),'unlisted authenticated account denied');
SELECT pg_temp.denied('INSERT INTO parapost_groups_private.test_users(user_id) VALUES(auth.uid())','self allowlisting denied');
SELECT pg_temp.denied('UPDATE parapost_groups_private.feature_gate SET allow_all_authenticated=true','client broad enablement denied');
SELECT pg_temp.login('owner');
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'role','authenticated','is_anonymous',true)::text,true);
SELECT pg_temp.check_that(NOT public.groups_available(),'anonymous JWT denied even when allowlisted');
SELECT pg_temp.login('owner');
SELECT pg_temp.check_that(public.groups_available(),'listed nonanonymous tester allowed');
RESET ROLE;
INSERT INTO parapost_groups_private.test_users(user_id) SELECT id FROM group_test_ids WHERE key='outsider';
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('owner');
INSERT INTO group_test_ids SELECT 'private',(public.groups_command('create',null,'{"name":"Private test","description":"fixture","visibility":"private"}')->>'id')::uuid;
INSERT INTO group_test_ids SELECT 'public',(public.groups_command('create',null,'{"name":"Public test","description":"fixture","visibility":"public"}')->>'id')::uuid;
SELECT pg_temp.check_that((SELECT count(*)=1 FROM public.group_members WHERE group_id=(SELECT id FROM group_test_ids WHERE key='private') AND role='owner' AND status='approved'),'exactly one initialized owner');
SELECT pg_temp.denied(format('UPDATE public.groups SET owner_id=%L WHERE id=%L',(SELECT id FROM group_test_ids WHERE key='outsider'),(SELECT id FROM group_test_ids WHERE key='private')),'owner reassignment');
SELECT pg_temp.denied(format('DELETE FROM public.group_members WHERE group_id=%L AND role=''owner''',(SELECT id FROM group_test_ids WHERE key='private')),'direct owner deletion');
SELECT pg_temp.denied(format('SELECT public.groups_command(''leave'',%L)',(SELECT id FROM group_test_ids WHERE key='private')),'owner cannot leave');
INSERT INTO group_test_ids SELECT 'post',(public.groups_command('draft',(SELECT id FROM group_test_ids WHERE key='private'),'{"content":"private evidence"}')->>'id')::uuid;
SELECT public.groups_command('publish',(SELECT id FROM group_test_ids WHERE key='private'),jsonb_build_object('post_id',(SELECT id FROM group_test_ids WHERE key='post')));
SELECT pg_temp.login('member');
SELECT public.groups_command('join',(SELECT id FROM group_test_ids WHERE key='public'));
SELECT pg_temp.check_that((SELECT status='approved' FROM public.group_members WHERE group_id=(SELECT id FROM group_test_ids WHERE key='public') AND user_id=auth.uid()),'public immediate approval');
SELECT public.groups_command('join',(SELECT id FROM group_test_ids WHERE key='private'));
SELECT pg_temp.check_that((SELECT status='pending' FROM public.group_members WHERE group_id=(SELECT id FROM group_test_ids WHERE key='private') AND user_id=auth.uid()),'private request pending');
SELECT pg_temp.check_that((SELECT count(*)=0 FROM public.group_posts WHERE id=(SELECT id FROM group_test_ids WHERE key='post')),'pending user cannot read private post');
SELECT pg_temp.denied(format('SELECT public.groups_command(''approve'',%L,%L::jsonb)',(SELECT id FROM group_test_ids WHERE key='private'),jsonb_build_object('user_id',auth.uid())),'self approval');
SELECT pg_temp.denied(format('SELECT public.groups_command(''edit'',%L,''{"name":"Stolen","description":"","visibility":"public"}'')',(SELECT id FROM group_test_ids WHERE key='private')),'unauthorized editing');
SELECT pg_temp.denied(format('INSERT INTO public.groups(owner_id,name) VALUES(%L,''Spoofed owner'')',(SELECT id FROM group_test_ids WHERE key='owner')),'create owned by another user');
SELECT pg_temp.login('owner');
SELECT public.groups_command('approve',(SELECT id FROM group_test_ids WHERE key='private'),jsonb_build_object('user_id',(SELECT id FROM group_test_ids WHERE key='member')));
-- Exercise both existing block tables independently; checks use authenticated roles.
INSERT INTO public.blocked_users(blocker_id,blocked_id) VALUES(auth.uid(),(SELECT id FROM group_test_ids WHERE key='member'));
SELECT pg_temp.login('member');
SELECT pg_temp.check_that((SELECT count(*)=0 FROM public.group_posts WHERE id=(SELECT id FROM group_test_ids WHERE key='post')),'blocked_users denies approved member');
SELECT pg_temp.login('owner');
DELETE FROM public.blocked_users WHERE blocker_id=auth.uid() AND blocked_id=(SELECT id FROM group_test_ids WHERE key='member');
INSERT INTO public.user_blocks(blocker_id,blocked_id) VALUES(auth.uid(),(SELECT id FROM group_test_ids WHERE key='member'));
SELECT pg_temp.login('member');
SELECT pg_temp.check_that((SELECT count(*)=0 FROM public.group_posts WHERE id=(SELECT id FROM group_test_ids WHERE key='post')),'user_blocks denies approved member');
SELECT pg_temp.login('owner');
DELETE FROM public.user_blocks WHERE blocker_id=auth.uid() AND blocked_id=(SELECT id FROM group_test_ids WHERE key='member');
SELECT pg_temp.login('member');
SELECT pg_temp.check_that((SELECT count(*)=1 FROM public.group_posts WHERE id=(SELECT id FROM group_test_ids WHERE key='post')),'approved member reads private post');
SELECT pg_temp.denied(format('SELECT public.groups_command(''role'',%L,%L::jsonb)',(SELECT id FROM group_test_ids WHERE key='private'),jsonb_build_object('user_id',auth.uid(),'role','owner')),'role escalation');
SELECT pg_temp.denied(format('SELECT public.groups_command(''delete_post'',%L,%L::jsonb)',(SELECT id FROM group_test_ids WHERE key='public'),jsonb_build_object('post_id',(SELECT id FROM group_test_ids WHERE key='post'))),'cross Group post mutation');
SELECT pg_temp.login('owner');
SELECT public.groups_command('remove',(SELECT id FROM group_test_ids WHERE key='private'),jsonb_build_object('user_id',(SELECT id FROM group_test_ids WHERE key='member')));
SELECT pg_temp.login('member');
SELECT pg_temp.check_that((SELECT count(*)=0 FROM public.group_posts WHERE id=(SELECT id FROM group_test_ids WHERE key='post')),'removed member loses reads');
SELECT pg_temp.denied(format('SELECT public.groups_command(''join'',%L)',(SELECT id FROM group_test_ids WHERE key='private')),'removed user cannot self restore');
SELECT public.groups_command('leave',(SELECT id FROM group_test_ids WHERE key='private'));
SELECT pg_temp.denied(format('SELECT public.groups_command(''join'',%L)',(SELECT id FROM group_test_ids WHERE key='private')),'leave cannot erase removal');
SELECT pg_temp.login('owner');
SELECT public.groups_command('restore',(SELECT id FROM group_test_ids WHERE key='private'),jsonb_build_object('user_id',(SELECT id FROM group_test_ids WHERE key='member')));
SELECT public.groups_command('reject',(SELECT id FROM group_test_ids WHERE key='private'),jsonb_build_object('user_id',(SELECT id FROM group_test_ids WHERE key='member')));
SELECT pg_temp.login('member');
SELECT pg_temp.denied(format('SELECT public.groups_command(''join'',%L)',(SELECT id FROM group_test_ids WHERE key='private')),'rejected user cannot self restore');
SELECT pg_temp.login('owner');
SELECT public.groups_command('ban',(SELECT id FROM group_test_ids WHERE key='private'),jsonb_build_object('user_id',(SELECT id FROM group_test_ids WHERE key='member')));
SELECT pg_temp.login('member');
SELECT pg_temp.denied(format('SELECT public.groups_command(''join'',%L)',(SELECT id FROM group_test_ids WHERE key='private')),'banned user cannot self restore');
SELECT pg_temp.check_that((SELECT count(*)=0 FROM public.group_posts WHERE id=(SELECT id FROM group_test_ids WHERE key='post')),'banned user cannot read');
SELECT pg_temp.login('outsider');
SELECT pg_temp.check_that((SELECT count(*)=0 FROM public.group_posts WHERE id=(SELECT id FROM group_test_ids WHERE key='post')),'unrelated user cannot read');
SELECT pg_temp.denied(format('SELECT public.groups_command(''delete'',%L,''{"confirmation":"Private test"}'')',(SELECT id FROM group_test_ids WHERE key='private')),'unrelated deletion');
SELECT pg_temp.login('owner');
SELECT public.groups_command('delete',(SELECT id FROM group_test_ids WHERE key='private'),'{"confirmation":"Private test"}');
RESET ROLE;
SELECT pg_temp.check_that(NOT EXISTS(SELECT 1 FROM public.groups WHERE id=(SELECT id FROM group_test_ids WHERE key='private')),'Group deleted');
SELECT pg_temp.check_that(NOT EXISTS(SELECT 1 FROM public.group_members WHERE group_id=(SELECT id FROM group_test_ids WHERE key='private')),'membership cascade');
SELECT pg_temp.check_that(NOT EXISTS(SELECT 1 FROM public.group_posts WHERE group_id=(SELECT id FROM group_test_ids WHERE key='private')),'post cascade');
SELECT pg_temp.check_that(NOT EXISTS(SELECT 1 FROM public.group_post_media WHERE group_id=(SELECT id FROM group_test_ids WHERE key='private')),'media cascade');
ROLLBACK;

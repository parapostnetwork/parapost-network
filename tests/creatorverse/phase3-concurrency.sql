-- Fixtures only for a disposable local cluster; runner destroys the entire cluster.
INSERT INTO auth.users(id,email) VALUES('10000000-0000-4000-8000-000000000001','owner@example.invalid');
INSERT INTO public.creatorverse_pages(id,owner_id,name,category,status)
VALUES('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Concurrency page','creator','active');
INSERT INTO public.creatorverse_posts(id,page_id,author_id,content,status)
VALUES('50000000-0000-4000-8000-000000000005','40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Concurrent fixture','published');
UPDATE creatorverse_private.feature_gate SET enabled=true,writes_enabled=true;
GRANT EXECUTE ON FUNCTION creatorverse_private.interact(uuid,uuid,text,uuid,text,uuid) TO authenticated;

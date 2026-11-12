-- LOCAL DRAFT ONLY. DO NOT EXECUTE.
-- Requires poster schema before installation.
-- Retains existing reservation and publication rules.
-- JPEG posters are associated with video rows, not extra media rows.

CREATE OR REPLACE FUNCTION parapost_groups_private.command(action text, gid uuid, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 uid uuid := auth.uid(); g public.groups; m public.group_members; p public.group_posts;
 target uuid; pid uuid; mid uuid; path text; mime text; role_name text; result jsonb; item record;
BEGIN
 IF NOT parapost_groups_private.enabled() THEN RAISE EXCEPTION 'Groups unavailable' USING ERRCODE='42501'; END IF;
 IF action='create' THEN
   IF (SELECT count(*) FROM public.groups WHERE owner_id=uid)>=100 THEN RAISE EXCEPTION 'Group creation limit reached'; END IF;
   INSERT INTO public.groups(owner_id,name,description,visibility)
   VALUES(uid,btrim(payload->>'name'),coalesce(payload->>'description',''),coalesce(payload->>'visibility','public')) RETURNING * INTO g;
   RETURN jsonb_build_object('id',g.id);
 END IF;
 -- Group lock serializes ALL writes, including membership removal vs publish/role changes.
 SELECT * INTO g FROM public.groups WHERE id=gid FOR UPDATE;
 IF NOT FOUND OR NOT parapost_groups_private.allowed(gid,'directory') THEN RAISE EXCEPTION 'Group unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM public.group_members WHERE group_id=gid AND user_id=uid;
 IF action='join' THEN
   IF m.status IS NOT NULL THEN
     IF m.status NOT IN ('pending','approved') THEN RAISE EXCEPTION 'Membership unavailable'; END IF;
   ELSE
     INSERT INTO public.group_members(group_id,user_id,role,status,approved_at)
     VALUES(gid,uid,'member',CASE WHEN g.visibility='public' THEN 'approved' ELSE 'pending' END,CASE WHEN g.visibility='public' THEN now() END);
   END IF;
 ELSIF action='leave' THEN
   IF m.role='owner' THEN RAISE EXCEPTION 'Owner must delete the Group; transfer is not supported'; END IF;
   -- Only voluntary departures remove the row. Removed/banned/rejected rows persist.
   DELETE FROM public.group_members WHERE group_id=gid AND user_id=uid AND status IN ('pending','approved');
 ELSIF action IN ('approve','reject','remove','ban','role','restore') THEN
   target := (payload->>'user_id')::uuid;
   IF NOT parapost_groups_private.allowed(gid,'admin') OR target=uid OR target=g.owner_id THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
   SELECT * INTO m FROM public.group_members WHERE group_id=gid AND user_id=target;
   IF NOT FOUND THEN RAISE EXCEPTION 'Membership unavailable'; END IF;
   IF NOT parapost_groups_private.allowed(gid,'owner') AND (m.role <> 'member' OR action IN ('role','restore')) THEN RAISE EXCEPTION 'Owner permission required'; END IF;
   IF action IN ('approve','restore') AND parapost_groups_private.blocked(uid,target) THEN RAISE EXCEPTION 'Membership unavailable'; END IF;
   IF action IN ('approve','restore') AND parapost_groups_private.blocked(g.owner_id,target) THEN RAISE EXCEPTION 'Membership unavailable'; END IF;
   IF action IN ('approve','reject') THEN
     IF m.status <> 'pending' THEN RAISE EXCEPTION 'Request is no longer pending'; END IF;
     UPDATE public.group_members SET status=CASE WHEN action='approve' THEN 'approved' ELSE 'rejected' END,
       approved_at=CASE WHEN action='approve' THEN now() END WHERE group_id=gid AND user_id=target;
   ELSIF action='role' THEN
     role_name := payload->>'role';
     IF m.status <> 'approved' OR role_name IS NULL OR role_name NOT IN ('admin','moderator','member') THEN RAISE EXCEPTION 'Invalid role change'; END IF;
     UPDATE public.group_members SET role=role_name WHERE group_id=gid AND user_id=target;
   ELSIF action='restore' THEN
     IF m.status NOT IN ('removed','rejected','banned') THEN RAISE EXCEPTION 'Invalid restoration'; END IF;
     -- Restoration requires owner action AND a fresh approval, never immediate access.
     UPDATE public.group_members SET role='member',status='pending',approved_at=NULL WHERE group_id=gid AND user_id=target;
   ELSE
     UPDATE public.group_members SET role='member',status=CASE WHEN action='ban' THEN 'banned' ELSE 'removed' END,approved_at=NULL WHERE group_id=gid AND user_id=target;
   END IF;
 ELSIF action='edit' THEN
   IF NOT parapost_groups_private.allowed(gid,'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
   -- Privacy changes are owner-only. Existing approvals survive; pending requests stay pending.
   IF payload->>'visibility' IS DISTINCT FROM g.visibility AND NOT parapost_groups_private.allowed(gid,'owner') THEN RAISE EXCEPTION 'Owner permission required'; END IF;
   UPDATE public.groups SET name=btrim(payload->>'name'),description=coalesce(payload->>'description',''),visibility=payload->>'visibility',updated_at=now() WHERE id=gid;
 ELSIF action='delete' THEN
   IF NOT parapost_groups_private.allowed(gid,'owner') OR payload->>'confirmation' IS DISTINCT FROM g.name THEN RAISE EXCEPTION 'Owner and Group name confirmation required'; END IF;
   DELETE FROM public.groups WHERE id=gid;
 ELSIF action='draft' THEN
   IF NOT parapost_groups_private.allowed(gid,'member') THEN RAISE EXCEPTION 'Approved membership required'; END IF;
   IF (SELECT count(*) FROM public.group_posts WHERE group_id=gid AND author_id=uid AND NOT published)>=10 THEN RAISE EXCEPTION 'Too many unfinished uploads'; END IF;
   INSERT INTO public.group_posts(group_id,author_id,content) VALUES(gid,uid,coalesce(payload->>'content','')) RETURNING id INTO pid;
   RETURN jsonb_build_object('id',pid);
 ELSIF action IN ('reserve_media','publish','edit_post','delete_post') THEN
   pid := (payload->>'post_id')::uuid;
   SELECT * INTO p FROM public.group_posts WHERE id=pid AND group_id=gid;
   IF NOT FOUND OR p.is_deleted THEN RAISE EXCEPTION 'Post unavailable'; END IF;
   IF NOT parapost_groups_private.allowed(gid,'member') OR (p.author_id<>uid AND NOT (action='delete_post' AND parapost_groups_private.allowed(gid,'moderate'))) THEN RAISE EXCEPTION 'Not authorized'; END IF;
   IF action='delete_post' THEN
     DELETE FROM public.group_posts WHERE id=pid;
   ELSIF action='edit_post' THEN
     IF char_length(btrim(coalesce(payload->>'content','')))=0 AND NOT EXISTS(SELECT 1 FROM public.group_post_media WHERE post_id=pid) THEN RAISE EXCEPTION 'Post cannot be empty'; END IF;
     UPDATE public.group_posts SET content=coalesce(payload->>'content',''),updated_at=now() WHERE id=pid;
   ELSIF action='reserve_media' THEN
     IF p.published OR (SELECT count(*) FROM public.group_post_media WHERE post_id=pid)>=4 THEN RAISE EXCEPTION 'Media limit or published post'; END IF;
     mime := payload->>'mime_type';
     IF mime IS NULL OR mime NOT IN ('image/jpeg','image/png','image/webp','video/mp4','video/webm') THEN RAISE EXCEPTION 'Unsupported media'; END IF;
     mid := gen_random_uuid();
     path := gid::text || '/posts/' || pid::text || '/' || uid::text || '/' || mid::text;
     INSERT INTO public.group_post_media(id,group_id,post_id,uploader_id,media_type,storage_path,mime_type,display_order,poster_path)
     VALUES(mid,gid,pid,uid,
       CASE WHEN mime LIKE 'image/%' THEN 'image' ELSE 'video' END,
       path,mime,
       (SELECT count(*) FROM public.group_post_media WHERE post_id=pid),
       CASE WHEN mime LIKE 'video/%' THEN path || '.poster.jpg' ELSE NULL END);
     RETURN jsonb_build_object(
       'path',path,
       'poster_path',
       CASE WHEN mime LIKE 'video/%' THEN path || '.poster.jpg' ELSE NULL END
     );
   ELSE
     IF p.published THEN RETURN jsonb_build_object('id',pid); END IF;
     IF char_length(btrim(p.content))=0 AND NOT EXISTS(SELECT 1 FROM public.group_post_media WHERE post_id=pid) THEN RAISE EXCEPTION 'Post cannot be empty'; END IF;
     FOR item IN SELECT * FROM public.group_post_media WHERE post_id=pid LOOP
       IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='group-media' AND o.name=item.storage_path
         AND o.metadata->>'mimetype'=item.mime_type AND (o.metadata->>'size')::bigint BETWEEN 1 AND CASE WHEN item.media_type='image' THEN 8388608 ELSE 33554432 END) THEN RAISE EXCEPTION 'Media upload incomplete or invalid'; END IF;
     END LOOP;
     UPDATE public.group_posts SET published=true,updated_at=now() WHERE id=pid;
   END IF;
 ELSIF action='remove_cover' THEN
   IF NOT parapost_groups_private.allowed(gid,'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
   UPDATE public.groups SET cover_storage_path=NULL,updated_at=now() WHERE id=gid;
 ELSIF action='reserve_cover' THEN
   IF NOT parapost_groups_private.allowed(gid,'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
   IF (SELECT count(*) FROM parapost_groups_private.cover_uploads WHERE group_id=gid AND uploader_id=uid)>=10 THEN RAISE EXCEPTION 'Too many unfinished covers'; END IF;
   -- Covers are intentionally directory metadata, including those for private Groups.
   path := gid::text || '/covers/' || gen_random_uuid()::text;
   INSERT INTO parapost_groups_private.cover_uploads(storage_path,group_id,uploader_id) VALUES(path,gid,uid);
   RETURN jsonb_build_object('path',path);
 ELSIF action='set_cover' THEN
   path := payload->>'path';
   IF NOT parapost_groups_private.allowed(gid,'admin') OR NOT EXISTS(SELECT 1 FROM parapost_groups_private.cover_uploads c JOIN storage.objects o ON o.name=c.storage_path AND o.bucket_id='group-media'
     WHERE c.storage_path=path AND c.group_id=gid AND c.uploader_id=uid AND o.metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp') AND (o.metadata->>'size')::bigint BETWEEN 1 AND 8388608) THEN RAISE EXCEPTION 'Invalid cover'; END IF;
   UPDATE public.groups SET cover_storage_path=path,updated_at=now() WHERE id=gid;
   DELETE FROM parapost_groups_private.cover_uploads WHERE storage_path=path;
 ELSE RAISE EXCEPTION 'Unknown Group action';
 END IF;
 RETURN jsonb_build_object('id',gid);
END; $$;

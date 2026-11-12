-- DRAFT ONLY. DO NOT EXECUTE.
-- Requires group-video-poster-schema.sql first.
-- Preserves existing authorization checks.
-- Poster paths must be registered by a trusted workflow.

CREATE OR REPLACE FUNCTION parapost_groups_private.storage_allowed(path text, operation text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT parapost_groups_private.enabled() AND (
   CASE WHEN operation='read' THEN
     EXISTS(SELECT 1 FROM public.groups g WHERE g.cover_storage_path=path AND parapost_groups_private.allowed(g.id,'directory'))
     OR EXISTS(
       SELECT 1 FROM public.groups g
       WHERE g.avatar_storage_path=path
       AND parapost_groups_private.allowed(g.id,'directory')
     )
     OR EXISTS(SELECT 1 FROM public.group_post_media m JOIN public.group_posts p ON p.id=m.post_id AND p.group_id=m.group_id
       WHERE (m.storage_path=path OR (m.poster_path=path AND m.media_type='video' AND m.poster_path=m.storage_path || '.poster.jpg')) AND NOT p.is_deleted AND parapost_groups_private.allowed(p.group_id,'read')
       AND (p.published OR (p.author_id=auth.uid() AND parapost_groups_private.allowed(p.group_id,'member'))))
   WHEN operation='insert' THEN
     EXISTS(SELECT 1 FROM parapost_groups_private.cover_uploads c WHERE c.storage_path=path AND c.uploader_id=auth.uid() AND c.created_at>now()-interval '1 hour' AND parapost_groups_private.allowed(c.group_id,'admin'))
     OR EXISTS(
       SELECT 1
       FROM parapost_groups_private.avatar_uploads a
       JOIN public.groups g ON g.id=a.group_id
       WHERE a.storage_path=path
       AND a.uploader_id=auth.uid()
       AND g.owner_id=auth.uid()
       AND a.created_at>now()-interval '1 hour'
     )
     OR EXISTS(SELECT 1 FROM public.group_post_media m JOIN public.group_posts p ON p.id=m.post_id AND p.group_id=m.group_id
       WHERE (m.storage_path=path OR (m.poster_path=path AND m.media_type='video' AND m.poster_path=m.storage_path || '.poster.jpg')) AND m.uploader_id=auth.uid() AND p.author_id=auth.uid() AND NOT p.published AND NOT p.is_deleted AND p.created_at>now()-interval '1 hour' AND parapost_groups_private.allowed(p.group_id,'member'))
   ELSE false END
 );
$$;

-- LOCAL DRAFT ONLY. DO NOT EXECUTE.
-- Requires group-video-poster-schema.sql.
-- Queue deleted video posters with their videos.
-- Preserve existing cleanup permissions and delays.

CREATE OR REPLACE FUNCTION parapost_groups_private.queue_media_cleanup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF TG_TABLE_NAME='group_post_media' THEN
   INSERT INTO parapost_groups_private.media_cleanup(storage_path) VALUES (OLD.storage_path) ON CONFLICT DO NOTHING;
   IF OLD.poster_path IS NOT NULL THEN
     INSERT INTO parapost_groups_private.media_cleanup
       (storage_path)
     VALUES (OLD.poster_path)
     ON CONFLICT DO NOTHING;
   END IF;
 ELSE
   IF OLD.cover_storage_path IS NOT NULL AND (TG_OP='DELETE' OR OLD.cover_storage_path IS DISTINCT FROM NEW.cover_storage_path) THEN
     INSERT INTO parapost_groups_private.media_cleanup(storage_path) VALUES (OLD.cover_storage_path) ON CONFLICT DO NOTHING;
   END IF;
 END IF;
 RETURN OLD;
END; $$;

CREATE OR REPLACE FUNCTION public.groups_cleanup_batch() RETURNS SETOF text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target record;
BEGIN
 FOR target IN SELECT g.id FROM public.groups g
 WHERE EXISTS(SELECT 1 FROM public.group_posts p WHERE p.group_id=g.id AND NOT p.published AND p.created_at<now()-interval '24 hours')
    OR EXISTS(SELECT 1 FROM parapost_groups_private.cover_uploads c WHERE c.group_id=g.id AND c.created_at<now()-interval '24 hours')
 ORDER BY g.id LIMIT 100 FOR UPDATE LOOP
   DELETE FROM public.group_posts WHERE group_id=target.id AND NOT published AND created_at<now()-interval '24 hours';
   DELETE FROM parapost_groups_private.cover_uploads WHERE group_id=target.id AND created_at<now()-interval '24 hours';
 END LOOP;
 RETURN QUERY SELECT q.storage_path FROM parapost_groups_private.media_cleanup q
 WHERE q.queued_at<now()-interval '24 hours'
   AND NOT EXISTS(SELECT 1 FROM public.groups g WHERE g.cover_storage_path=q.storage_path)
   AND NOT EXISTS(SELECT 1 FROM public.group_post_media m WHERE m.storage_path=q.storage_path OR m.poster_path=q.storage_path)
   AND NOT EXISTS(SELECT 1 FROM parapost_groups_private.cover_uploads c WHERE c.storage_path=q.storage_path)
 ORDER BY q.queued_at LIMIT 100;
END; $$;

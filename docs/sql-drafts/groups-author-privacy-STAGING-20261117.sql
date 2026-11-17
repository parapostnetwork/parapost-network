-- Groups blocked-user privacy corrections
-- Applied to staging Supabase on 2026-11-17
-- Project: vmgelrgrtpghmvqgufzz
--
-- Documentation of staging changes.
-- NOT an automatically applied migration.
-- Do not apply to production without release approval.

BEGIN;

-- Viewer-specific author visibility.
-- Never accept the viewer's identity from client input.

CREATE OR REPLACE FUNCTION
parapost_groups_private.author_visible_to_viewer(
  p_author_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND p_author_id IS NOT NULL
    AND NOT parapost_groups_private.blocked(
      auth.uid(), p_author_id
    );
$function$;

REVOKE ALL ON FUNCTION
  parapost_groups_private.author_visible_to_viewer(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  parapost_groups_private.author_visible_to_viewer(uuid)
TO authenticated;

-- Group post author privacy.

ALTER POLICY group_posts_read
ON public.group_posts
USING (
  NOT is_deleted
  AND parapost_groups_private.allowed(group_id, 'read')
  AND parapost_groups_private.author_visible_to_viewer(
    author_id
  )
  AND (
    published
    OR (
      author_id = auth.uid()
      AND parapost_groups_private.allowed(
        group_id, 'member'
      )
    )
  )
);

-- Group comment author privacy.

ALTER POLICY group_post_comments_read
ON public.group_post_comments
USING (
  parapost_groups_private.author_visible_to_viewer(
    author_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.group_posts p
    WHERE p.id = group_post_comments.post_id
      AND p.published
      AND NOT p.is_deleted
      AND parapost_groups_private.allowed(
        p.group_id, 'read'
      )
  )
);

-- Group like privacy.

ALTER POLICY group_post_likes_read
ON public.group_post_likes
USING (
  parapost_groups_private.author_visible_to_viewer(
    user_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.group_posts p
    WHERE p.id = group_post_likes.post_id
      AND p.published
      AND NOT p.is_deleted
      AND parapost_groups_private.allowed(
        p.group_id, 'read'
      )
  )
);

-- Preserve existing Storage permissions while preventing
-- downloads of blocked authors' post media.

CREATE OR REPLACE FUNCTION
parapost_groups_private.storage_allowed(
  path text,
  operation text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
SELECT parapost_groups_private.enabled() AND (
  CASE
    WHEN operation = 'read' THEN
      EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.cover_storage_path = path
          AND parapost_groups_private.allowed(
            g.id, 'directory'
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.avatar_storage_path = path
          AND parapost_groups_private.allowed(
            g.id, 'directory'
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.group_post_media m
        JOIN public.group_posts p
          ON p.id = m.post_id
         AND p.group_id = m.group_id
        WHERE (
          m.storage_path = path
          OR (
            m.poster_path = path
            AND m.media_type = 'video'
            AND m.poster_path =
              m.storage_path || '.poster.jpg'
          )
        )
          AND NOT p.is_deleted
          AND parapost_groups_private.allowed(
            p.group_id, 'read'
          )
          AND parapost_groups_private.author_visible_to_viewer(
            p.author_id
          )
          AND (
            p.published
            OR (
              p.author_id = auth.uid()
              AND parapost_groups_private.allowed(
                p.group_id, 'member'
              )
            )
          )
      )

    WHEN operation = 'insert' THEN
      EXISTS (
        SELECT 1
        FROM parapost_groups_private.cover_uploads c
        WHERE c.storage_path = path
          AND c.uploader_id = auth.uid()
          AND c.created_at > now() - interval '1 hour'
          AND parapost_groups_private.allowed(
            c.group_id, 'admin'
          )
      )
      OR EXISTS (
        SELECT 1
        FROM parapost_groups_private.avatar_uploads a
        JOIN public.groups g ON g.id = a.group_id
        WHERE a.storage_path = path
          AND a.uploader_id = auth.uid()
          AND g.owner_id = auth.uid()
          AND a.created_at > now() - interval '1 hour'
      )
      OR EXISTS (
        SELECT 1
        FROM public.group_post_media m
        JOIN public.group_posts p
          ON p.id = m.post_id
         AND p.group_id = m.group_id
        WHERE (
          m.storage_path = path
          OR (
            m.poster_path = path
            AND m.media_type = 'video'
            AND m.poster_path =
              m.storage_path || '.poster.jpg'
          )
        )
          AND m.uploader_id = auth.uid()
          AND p.author_id = auth.uid()
          AND NOT p.published
          AND NOT p.is_deleted
          AND p.created_at > now() - interval '1 hour'
          AND parapost_groups_private.allowed(
            p.group_id, 'member'
          )
      )
    ELSE false
  END
);
$function$;

-- Preserve share-count functionality while denying
-- access to posts from blocked authors.

CREATE OR REPLACE FUNCTION
public.groups_post_share_count(
  p_group_id uuid,
  p_post_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_share_count bigint;
BEGIN
  IF auth.uid() IS NULL
     OR NOT parapost_groups_private.allowed(
       p_group_id, 'read'
     )
  THEN
    RAISE EXCEPTION 'Group access denied'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.group_posts p
    WHERE p.id = p_post_id
      AND p.group_id = p_group_id
      AND p.published = true
      AND p.is_deleted = false
      AND parapost_groups_private.author_visible_to_viewer(
        p.author_id
      )
  ) THEN
    RAISE EXCEPTION 'Post unavailable'
      USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)
  INTO v_share_count
  FROM public.group_post_shares s
  WHERE s.group_id = p_group_id
    AND s.post_id = p_post_id;

  RETURN v_share_count;
END;
$function$;

COMMIT;

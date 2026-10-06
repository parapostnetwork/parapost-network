-- ============================================================
-- Parapost Network
-- Shared post like context + exact share notification context
--
-- This migration runs after:
--   20261006220000_add_shared_comment_context.sql
--
-- Goals:
-- 1. Original-post likes remain separate from shared-copy likes.
-- 2. A shared-copy like belongs to one exact shares.id.
-- 3. Shared-copy likes notify the owner of that exact share.
-- 4. Original-post likes continue notifying the original post owner.
-- 5. Deleting / deactivating a share removes its share-specific likes.
-- 6. post_share notifications store the exact shares.id.
-- ============================================================


-- ============================================================
-- 1. ADD SHARE CONTEXT TO POST LIKES
--
-- Original post:
--   share_id IS NULL
--
-- Shared copy:
--   share_id = exact shares.id
-- ============================================================

ALTER TABLE public.likes
ADD COLUMN IF NOT EXISTS share_id uuid;

ALTER TABLE public.likes
DROP CONSTRAINT IF EXISTS likes_share_id_fkey;

ALTER TABLE public.likes
ADD CONSTRAINT likes_share_id_fkey
FOREIGN KEY (share_id)
REFERENCES public.shares(id)
ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS likes_share_id_idx
ON public.likes (share_id);


-- ============================================================
-- 2. SEPARATE ORIGINAL / SHARED LIKE UNIQUENESS
--
-- The historical index allowed only one like per user + post.
-- That would make a like on the original post collide with a
-- like by the same user on one of its shared copies.
-- ============================================================

DROP INDEX IF EXISTS public.unique_user_post_like;

CREATE UNIQUE INDEX IF NOT EXISTS likes_unique_user_original_post
ON public.likes (
  user_id,
  post_id
)
WHERE share_id IS NULL
  AND user_id IS NOT NULL
  AND post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS likes_unique_user_shared_post
ON public.likes (
  user_id,
  share_id
)
WHERE share_id IS NOT NULL
  AND user_id IS NOT NULL;


-- ============================================================
-- 3. ENFORCE EXACT SHARED-LIKE CONTEXT
--
-- A shared like must reference an active feed share whose
-- original post exactly matches likes.post_id.
--
-- Once created, a like cannot be moved into another context.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_post_like_share_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN

  IF TG_OP = 'UPDATE' THEN

    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.post_id IS DISTINCT FROM OLD.post_id
       OR NEW.share_id IS DISTINCT FROM OLD.share_id
    THEN
      RAISE EXCEPTION 'Post like context cannot be changed.';
    END IF;

  END IF;


  IF NEW.share_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.shares AS shares
       WHERE shares.id = NEW.share_id
         AND shares.post_id = NEW.post_id
         AND shares.deleted_at IS NULL
         AND COALESCE(shares.share_destination, 'feed') = 'feed'
     )
  THEN
    RAISE EXCEPTION 'Shared post like context is not active.';
  END IF;


  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.enforce_post_like_share_context()
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.enforce_post_like_share_context()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.enforce_post_like_share_context()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.enforce_post_like_share_context()
TO service_role;

DROP TRIGGER IF EXISTS trg_enforce_post_like_share_context
ON public.likes;

CREATE TRIGGER trg_enforce_post_like_share_context
BEFORE INSERT OR UPDATE OF
  user_id,
  post_id,
  share_id
ON public.likes
FOR EACH ROW
EXECUTE FUNCTION public.enforce_post_like_share_context();


-- ============================================================
-- 4. SHARE-AWARE POST LIKE RLS
-- ============================================================

DROP POLICY IF EXISTS likes_insert_visible_post
ON public.likes;

CREATE POLICY likes_insert_visible_post
ON public.likes
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()

  AND EXISTS (
    SELECT 1
    FROM public.posts AS posts
    WHERE posts.id = likes.post_id
  )

  AND (
    likes.share_id IS NULL

    OR EXISTS (
      SELECT 1
      FROM public.shares AS shares
      WHERE shares.id = likes.share_id
        AND shares.post_id = likes.post_id
        AND shares.deleted_at IS NULL
        AND COALESCE(shares.share_destination, 'feed') = 'feed'
    )
  )
);

DROP POLICY IF EXISTS likes_select_visible_post
ON public.likes;

CREATE POLICY likes_select_visible_post
ON public.likes
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()

  OR public.can_access_moderation_dashboard()

  OR (
    EXISTS (
      SELECT 1
      FROM public.posts AS posts
      WHERE posts.id = likes.post_id
    )

    AND (
      likes.share_id IS NULL

      OR EXISTS (
        SELECT 1
        FROM public.shares AS shares
        WHERE shares.id = likes.share_id
          AND shares.post_id = likes.post_id
          AND shares.deleted_at IS NULL
          AND COALESCE(shares.share_destination, 'feed') = 'feed'
      )
    )
  )
);


-- ============================================================
-- 5. SHARE-AWARE POST-LIKE NOTIFICATION UNIQUENESS
--
-- Original-post notifications are unique by:
--   recipient + actor + post
--
-- Shared-copy notifications are unique by:
--   recipient + actor + exact share
-- ============================================================

DROP INDEX IF EXISTS public.notifications_unique_post_like;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_unique_post_like
ON public.notifications (
  user_id,
  actor_id,
  type,
  post_id
)
WHERE type = 'post_like'
  AND share_id IS NULL
  AND post_id IS NOT NULL
  AND user_id IS NOT NULL
  AND actor_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_unique_shared_post_like
ON public.notifications (
  user_id,
  actor_id,
  type,
  share_id
)
WHERE type = 'post_like'
  AND share_id IS NOT NULL
  AND user_id IS NOT NULL
  AND actor_id IS NOT NULL;


-- ============================================================
-- 6. SHARE-AWARE POST LIKE NOTIFICATION CREATION
--
-- Original post:
--   notify original post owner
--   "liked your post"
--
-- Shared copy:
--   notify exact share owner
--   "liked a post you shared."
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_post_like_notification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  context_owner_id uuid;
  context_message text;
BEGIN

  IF NEW.share_id IS NOT NULL THEN

    SELECT shares.user_id
    INTO context_owner_id
    FROM public.shares AS shares
    WHERE shares.id = NEW.share_id
      AND shares.post_id = NEW.post_id
      AND shares.deleted_at IS NULL
      AND COALESCE(shares.share_destination, 'feed') = 'feed';

    context_message := 'liked a post you shared.';

  ELSE

    SELECT posts.user_id
    INTO context_owner_id
    FROM public.posts AS posts
    WHERE posts.id = NEW.post_id;

    context_message := 'liked your post';

  END IF;


  IF context_owner_id IS NOT NULL
     AND context_owner_id <> NEW.user_id
  THEN

    INSERT INTO public.notifications (
      user_id,
      actor_id,
      type,
      post_id,
      share_id,
      message
    )
    VALUES (
      context_owner_id,
      NEW.user_id,
      'post_like',
      NEW.post_id,
      NEW.share_id,
      context_message
    )
    ON CONFLICT DO NOTHING;

  END IF;


  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.create_post_like_notification()
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.create_post_like_notification()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.create_post_like_notification()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.create_post_like_notification()
TO service_role;


-- ============================================================
-- 7. SHARE-AWARE UNLIKE NOTIFICATION CLEANUP
--
-- IS NOT DISTINCT FROM makes NULL = NULL for original-post
-- context while still requiring the exact share for shared likes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_post_like_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN

  DELETE FROM public.notifications
  WHERE type = 'post_like'
    AND post_id = OLD.post_id
    AND actor_id = OLD.user_id
    AND share_id IS NOT DISTINCT FROM OLD.share_id;


  RETURN OLD;
END;
$function$;

ALTER FUNCTION public.cleanup_post_like_notification()
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.cleanup_post_like_notification()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.cleanup_post_like_notification()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.cleanup_post_like_notification()
TO service_role;


-- ============================================================
-- 8. SOFT-DELETED / REPURPOSED SHARE LIKE CLEANUP
--
-- Hard deletes are handled by likes_share_id_fkey ON DELETE
-- CASCADE.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_inactive_share_like_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  old_active boolean;
  new_active boolean;
BEGIN

  old_active :=
    OLD.deleted_at IS NULL
    AND COALESCE(OLD.share_destination, 'feed') = 'feed';

  new_active :=
    NEW.deleted_at IS NULL
    AND COALESCE(NEW.share_destination, 'feed') = 'feed';


  IF old_active
     AND (
       NOT new_active
       OR OLD.post_id IS DISTINCT FROM NEW.post_id
       OR OLD.user_id IS DISTINCT FROM NEW.user_id
     )
  THEN

    DELETE FROM public.likes
    WHERE share_id = OLD.id;

    DELETE FROM public.notifications
    WHERE type = 'post_like'
      AND share_id = OLD.id;

  END IF;


  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.cleanup_inactive_share_like_context()
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.cleanup_inactive_share_like_context()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.cleanup_inactive_share_like_context()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.cleanup_inactive_share_like_context()
TO service_role;

DROP TRIGGER IF EXISTS trg_cleanup_inactive_share_like_context
ON public.shares;

CREATE TRIGGER trg_cleanup_inactive_share_like_context
AFTER UPDATE OF
  deleted_at,
  share_destination,
  post_id,
  user_id
ON public.shares
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_inactive_share_like_context();


-- ============================================================
-- 9. BACKFILL EXACT SHARE_ID ON ACTIVE POST_SHARE NOTIFICATIONS
--
-- The earlier share lifecycle migration guarantees only one
-- active feed share per exact actor + original post.
-- ============================================================

UPDATE public.notifications AS notifications
SET share_id = shares.id
FROM public.shares AS shares
WHERE notifications.type = 'post_share'
  AND notifications.share_id IS NULL
  AND notifications.actor_id = shares.user_id
  AND notifications.post_id = shares.post_id
  AND shares.deleted_at IS NULL
  AND COALESCE(shares.share_destination, 'feed') = 'feed';


-- ============================================================
-- 10. EXACT POST_SHARE NOTIFICATION LIFECYCLE
--
-- Every new post_share notification now stores NEW.id as the
-- exact shares.id that created it.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_post_share_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  old_active boolean := false;
  new_active boolean := false;
  should_create boolean := false;
  post_owner_id uuid;
BEGIN

  IF TG_OP <> 'INSERT' THEN

    old_active :=
      OLD.deleted_at IS NULL
      AND COALESCE(OLD.share_destination, 'feed') = 'feed'
      AND OLD.user_id IS NOT NULL
      AND OLD.post_id IS NOT NULL;

  END IF;


  IF TG_OP <> 'DELETE' THEN

    new_active :=
      NEW.deleted_at IS NULL
      AND COALESCE(NEW.share_destination, 'feed') = 'feed'
      AND NEW.user_id IS NOT NULL
      AND NEW.post_id IS NOT NULL;

  END IF;


  -- ----------------------------------------------------------
  -- HARD DELETE
  -- ----------------------------------------------------------

  IF TG_OP = 'DELETE' THEN

    IF old_active THEN

      DELETE FROM public.notifications
      WHERE type IN ('post_share', 'share')
        AND (
          share_id = OLD.id

          OR (
            share_id IS NULL
            AND actor_id = OLD.user_id
            AND post_id = OLD.post_id
          )
        );

    END IF;


    RETURN OLD;
  END IF;


  -- ----------------------------------------------------------
  -- UPDATE
  -- ----------------------------------------------------------

  IF TG_OP = 'UPDATE' THEN

    IF old_active
       AND (
         NOT new_active
         OR OLD.user_id IS DISTINCT FROM NEW.user_id
         OR OLD.post_id IS DISTINCT FROM NEW.post_id
       )
    THEN

      DELETE FROM public.notifications
      WHERE type IN ('post_share', 'share')
        AND (
          share_id = OLD.id

          OR (
            share_id IS NULL
            AND actor_id = OLD.user_id
            AND post_id = OLD.post_id
          )
        );

    END IF;


    IF new_active
       AND (
         NOT old_active
         OR OLD.user_id IS DISTINCT FROM NEW.user_id
         OR OLD.post_id IS DISTINCT FROM NEW.post_id
       )
    THEN
      should_create := true;
    END IF;

  END IF;


  -- ----------------------------------------------------------
  -- INSERT
  -- ----------------------------------------------------------

  IF TG_OP = 'INSERT'
     AND new_active
  THEN
    should_create := true;
  END IF;


  -- ----------------------------------------------------------
  -- CREATE EXACT SHARE NOTIFICATION
  -- ----------------------------------------------------------

  IF should_create THEN

    SELECT posts.user_id
    INTO post_owner_id
    FROM public.posts AS posts
    WHERE posts.id = NEW.post_id;


    IF post_owner_id IS NOT NULL
       AND post_owner_id <> NEW.user_id
    THEN

      INSERT INTO public.notifications (
        user_id,
        actor_id,
        type,
        post_id,
        share_id,
        message,
        is_read
      )
      VALUES (
        post_owner_id,
        NEW.user_id,
        'post_share',
        NEW.post_id,
        NEW.id,
        'shared your post.',
        false
      )
      ON CONFLICT DO NOTHING;

    END IF;

  END IF;


  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.sync_post_share_notification()
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.sync_post_share_notification()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.sync_post_share_notification()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.sync_post_share_notification()
TO service_role;

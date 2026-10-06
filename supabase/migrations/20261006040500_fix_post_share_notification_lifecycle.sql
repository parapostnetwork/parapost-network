-- ============================================================
-- Parapost Network
-- Post share notification lifecycle
--
-- Goals:
-- 1. One active feed share per user + post.
-- 2. One post_share notification per recipient + actor + post.
-- 3. New active shares create their notification in the database.
-- 4. Hard delete and soft delete both remove the notification.
-- 5. Re-sharing after removal can create a fresh notification.
-- 6. Legacy share notifications are normalized to post_share.
-- ============================================================


-- ============================================================
-- 1. REMOVE HISTORICAL DUPLICATE ACTIVE FEED SHARES
--
-- Keep the newest active share for each exact user + post.
-- Soft-deleted shares are preserved.
-- ============================================================

WITH ranked_active_shares AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, post_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS duplicate_number
  FROM public.shares
  WHERE deleted_at IS NULL
    AND share_destination = 'feed'
    AND user_id IS NOT NULL
    AND post_id IS NOT NULL
)
DELETE FROM public.shares AS shares
USING ranked_active_shares AS ranked
WHERE shares.id = ranked.id
  AND ranked.duplicate_number > 1;


-- ============================================================
-- 2. REMOVE INVALID / STALE SHARE NOTIFICATIONS
--
-- A share notification must:
-- - have recipient, actor and post
-- - not be a self-notification
-- - belong to the owner of the target post
-- - have a matching active feed share
-- ============================================================

DELETE FROM public.notifications AS notifications
WHERE notifications.type IN ('post_share', 'share')
  AND (
    notifications.user_id IS NULL
    OR notifications.actor_id IS NULL
    OR notifications.post_id IS NULL
    OR notifications.user_id = notifications.actor_id
    OR NOT EXISTS (
      SELECT 1
      FROM public.posts AS posts
      WHERE posts.id = notifications.post_id
        AND posts.user_id = notifications.user_id
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.shares AS shares
      WHERE shares.user_id = notifications.actor_id
        AND shares.post_id = notifications.post_id
        AND shares.deleted_at IS NULL
        AND shares.share_destination = 'feed'
    )
  );


-- ============================================================
-- 3. NORMALIZE LEGACY SHARE NOTIFICATIONS
-- ============================================================

UPDATE public.notifications
SET
  type = 'post_share',
  message = CASE
    WHEN message IS NULL OR btrim(message) = ''
      THEN 'shared your post.'
    ELSE message
  END
WHERE type = 'share';


-- ============================================================
-- 4. REMOVE DUPLICATE POST SHARE NOTIFICATIONS
--
-- Keep the newest notification for each exact:
-- recipient + actor + post
-- ============================================================

WITH ranked_post_share_notifications AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, actor_id, post_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS duplicate_number
  FROM public.notifications
  WHERE type = 'post_share'
    AND user_id IS NOT NULL
    AND actor_id IS NOT NULL
    AND post_id IS NOT NULL
)
DELETE FROM public.notifications AS notifications
USING ranked_post_share_notifications AS ranked
WHERE notifications.id = ranked.id
  AND ranked.duplicate_number > 1;


-- ============================================================
-- 5. PREVENT DUPLICATE ACTIVE FEED SHARES
--
-- A user may share a post once while that share is active.
-- After it is removed / soft-deleted, the user may share again.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS shares_unique_active_feed_post
ON public.shares (
  user_id,
  post_id
)
WHERE deleted_at IS NULL
  AND share_destination = 'feed'
  AND user_id IS NOT NULL
  AND post_id IS NOT NULL;


-- ============================================================
-- 6. PREVENT DUPLICATE POST SHARE NOTIFICATIONS
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS notifications_unique_post_share
ON public.notifications (
  user_id,
  actor_id,
  type,
  post_id
)
WHERE type = 'post_share'
  AND user_id IS NOT NULL
  AND actor_id IS NOT NULL
  AND post_id IS NOT NULL;


-- ============================================================
-- 7. DATABASE SHARE NOTIFICATION LIFECYCLE
--
-- Handles:
-- - INSERT of a new active feed share
-- - hard DELETE
-- - soft DELETE through deleted_at
-- - reactivation
-- - user/post/destination changes
--
-- SECURITY DEFINER is required because the sharer is creating
-- or removing a notification belonging to the post owner.
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

  -- ----------------------------------------------------------
  -- Determine previous active state when OLD exists.
  -- ----------------------------------------------------------

  IF TG_OP <> 'INSERT' THEN
    old_active :=
      OLD.deleted_at IS NULL
      AND COALESCE(OLD.share_destination, 'feed') = 'feed'
      AND OLD.user_id IS NOT NULL
      AND OLD.post_id IS NOT NULL;
  END IF;


  -- ----------------------------------------------------------
  -- Determine new active state when NEW exists.
  -- ----------------------------------------------------------

  IF TG_OP <> 'DELETE' THEN
    new_active :=
      NEW.deleted_at IS NULL
      AND COALESCE(NEW.share_destination, 'feed') = 'feed'
      AND NEW.user_id IS NOT NULL
      AND NEW.post_id IS NOT NULL;
  END IF;


  -- ----------------------------------------------------------
  -- HARD DELETE
  --
  -- If the removed row was the final active share for this
  -- actor + post, remove its notification.
  -- ----------------------------------------------------------

  IF TG_OP = 'DELETE' THEN

    IF old_active
       AND NOT EXISTS (
         SELECT 1
         FROM public.shares AS shares
         WHERE shares.user_id = OLD.user_id
           AND shares.post_id = OLD.post_id
           AND shares.deleted_at IS NULL
           AND COALESCE(shares.share_destination, 'feed') = 'feed'
       )
    THEN

      DELETE FROM public.notifications
      WHERE type IN ('post_share', 'share')
        AND actor_id = OLD.user_id
        AND post_id = OLD.post_id;

    END IF;

    RETURN OLD;
  END IF;


  -- ----------------------------------------------------------
  -- UPDATE
  --
  -- Clean the old notification when an active share becomes
  -- inactive or changes actor/post.
  -- ----------------------------------------------------------

  IF TG_OP = 'UPDATE' THEN

    IF old_active
       AND (
         NOT new_active
         OR OLD.user_id IS DISTINCT FROM NEW.user_id
         OR OLD.post_id IS DISTINCT FROM NEW.post_id
       )
       AND NOT EXISTS (
         SELECT 1
         FROM public.shares AS shares
         WHERE shares.user_id = OLD.user_id
           AND shares.post_id = OLD.post_id
           AND shares.deleted_at IS NULL
           AND COALESCE(shares.share_destination, 'feed') = 'feed'
       )
    THEN

      DELETE FROM public.notifications
      WHERE type IN ('post_share', 'share')
        AND actor_id = OLD.user_id
        AND post_id = OLD.post_id;

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

  IF TG_OP = 'INSERT' AND new_active THEN
    should_create := true;
  END IF;


  -- ----------------------------------------------------------
  -- CREATE NOTIFICATION
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
        message,
        is_read
      )
      VALUES (
        post_owner_id,
        NEW.user_id,
        'post_share',
        NEW.post_id,
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


-- ============================================================
-- 8. SHARE LIFECYCLE TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS trg_post_share_notification_lifecycle
ON public.shares;

CREATE TRIGGER trg_post_share_notification_lifecycle
AFTER INSERT OR UPDATE OR DELETE
ON public.shares
FOR EACH ROW
EXECUTE FUNCTION public.sync_post_share_notification();

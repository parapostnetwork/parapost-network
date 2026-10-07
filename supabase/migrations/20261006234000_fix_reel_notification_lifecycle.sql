-- ============================================================
-- Parapost Network
-- Reel notification lifecycle
--
-- Goals:
-- 1. Allow reel_comment_like notification type.
-- 2. Allow Reel owners to delete comments on their own Reels.
-- 3. Remove reel_like notifications when a like is removed.
-- 4. Remove reel_comment_like notifications when a comment like is removed.
-- 5. Remove comment-linked Reel notifications when the comment/reply is deleted.
-- 6. Remove all Reel notifications when the Reel is deleted.
-- 7. Prevent duplicate Reel like/comment activity notifications.
-- ============================================================


-- ============================================================
-- 1. NOTIFICATION TYPE CONSTRAINT
-- ============================================================

ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check
CHECK (
  type IN (
    'friend_request',
    'friend_accept',
    'post_like',
    'post_comment',
    'post_share',
    'comment_like',
    'comment_reply',
    'parachat_message',
    'parachat_photo',
    'badge_award',
    'reel_like',
    'reel_comment',
    'reel_reply',
    'reel_share',
    'reel_comment_like'
  )
);


-- ============================================================
-- 2. CLEAN HISTORICAL STALE REEL NOTIFICATIONS
-- ============================================================

DELETE FROM public.notifications AS notifications
WHERE notifications.type LIKE 'reel_%'
  AND notifications.reel_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.reels AS reels
    WHERE reels.id = notifications.reel_id
  );

DELETE FROM public.notifications AS notifications
WHERE notifications.type = 'reel_like'
  AND notifications.reel_id IS NOT NULL
  AND notifications.actor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.reel_likes AS reel_likes
    WHERE reel_likes.reel_id = notifications.reel_id
      AND reel_likes.user_id = notifications.actor_id
  );

DELETE FROM public.notifications AS notifications
WHERE notifications.type IN (
    'reel_comment',
    'reel_reply',
    'reel_comment_like'
  )
  AND notifications.comment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.reel_comments AS reel_comments
    WHERE reel_comments.id = notifications.comment_id
  );

DELETE FROM public.notifications AS notifications
WHERE notifications.type = 'reel_comment_like'
  AND notifications.comment_id IS NOT NULL
  AND notifications.actor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.reel_comment_likes AS reel_comment_likes
    WHERE reel_comment_likes.comment_id = notifications.comment_id
      AND reel_comment_likes.user_id = notifications.actor_id
  );

DELETE FROM public.notifications AS notifications
WHERE notifications.type = 'reel_share'
  AND notifications.reel_id IS NOT NULL
  AND notifications.actor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.reel_shares AS reel_shares
    WHERE reel_shares.reel_id = notifications.reel_id
      AND reel_shares.user_id = notifications.actor_id
  );


-- ============================================================
-- 3. CLEAN DUPLICATE REEL ACTIVITY NOTIFICATIONS
-- ============================================================

WITH ranked_reel_like_notifications AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, actor_id, type, reel_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS duplicate_number
  FROM public.notifications
  WHERE type = 'reel_like'
    AND reel_id IS NOT NULL
    AND user_id IS NOT NULL
    AND actor_id IS NOT NULL
)
DELETE FROM public.notifications AS notifications
USING ranked_reel_like_notifications AS ranked
WHERE notifications.id = ranked.id
  AND ranked.duplicate_number > 1;

WITH ranked_reel_comment_notifications AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, actor_id, type, comment_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS duplicate_number
  FROM public.notifications
  WHERE type IN (
      'reel_comment',
      'reel_reply',
      'reel_comment_like'
    )
    AND comment_id IS NOT NULL
    AND user_id IS NOT NULL
    AND actor_id IS NOT NULL
)
DELETE FROM public.notifications AS notifications
USING ranked_reel_comment_notifications AS ranked
WHERE notifications.id = ranked.id
  AND ranked.duplicate_number > 1;

WITH ranked_reel_share_notifications AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, actor_id, type, reel_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS duplicate_number
  FROM public.notifications
  WHERE type = 'reel_share'
    AND reel_id IS NOT NULL
    AND user_id IS NOT NULL
    AND actor_id IS NOT NULL
)
DELETE FROM public.notifications AS notifications
USING ranked_reel_share_notifications AS ranked
WHERE notifications.id = ranked.id
  AND ranked.duplicate_number > 1;


-- ============================================================
-- 4. PREVENT FUTURE DUPLICATES
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS notifications_unique_reel_like
ON public.notifications (
  user_id,
  actor_id,
  type,
  reel_id
)
WHERE type = 'reel_like'
  AND reel_id IS NOT NULL
  AND user_id IS NOT NULL
  AND actor_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_unique_reel_comment_activity
ON public.notifications (
  user_id,
  actor_id,
  type,
  comment_id
)
WHERE type IN (
    'reel_comment',
    'reel_reply',
    'reel_comment_like'
  )
  AND comment_id IS NOT NULL
  AND user_id IS NOT NULL
  AND actor_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_unique_reel_share
ON public.notifications (
  user_id,
  actor_id,
  type,
  reel_id
)
WHERE type = 'reel_share'
  AND reel_id IS NOT NULL
  AND user_id IS NOT NULL
  AND actor_id IS NOT NULL;


-- ============================================================
-- 5. REEL OWNER COMMENT DELETE PERMISSION
-- ============================================================

DROP POLICY IF EXISTS reel_comments_delete_own_or_moderator
ON public.reel_comments;

CREATE POLICY reel_comments_delete_own_or_moderator
ON public.reel_comments
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_access_moderation_dashboard()
  OR EXISTS (
    SELECT 1
    FROM public.reels AS reels
    WHERE reels.id = reel_comments.reel_id
      AND (
        reels.user_id = auth.uid()
        OR reels.creator_profile_id = auth.uid()
      )
  )
);


-- ============================================================
-- 6. REEL LIKE NOTIFICATION CLEANUP
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_reel_like_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE type = 'reel_like'
    AND reel_id = OLD.reel_id
    AND actor_id = OLD.user_id;

  RETURN OLD;
END;
$$;

ALTER FUNCTION public.cleanup_reel_like_notification()
OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_reel_like_notification_cleanup
ON public.reel_likes;

CREATE TRIGGER trg_reel_like_notification_cleanup
AFTER DELETE ON public.reel_likes
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_reel_like_notification();


-- ============================================================
-- 7. REEL COMMENT LIKE NOTIFICATION CLEANUP
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_reel_comment_like_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE type = 'reel_comment_like'
    AND comment_id = OLD.comment_id
    AND actor_id = OLD.user_id;

  RETURN OLD;
END;
$$;

ALTER FUNCTION public.cleanup_reel_comment_like_notification()
OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_reel_comment_like_notification_cleanup
ON public.reel_comment_likes;

CREATE TRIGGER trg_reel_comment_like_notification_cleanup
AFTER DELETE ON public.reel_comment_likes
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_reel_comment_like_notification();


-- ============================================================
-- 8. DELETED REEL COMMENT / REPLY CLEANUP
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_deleted_reel_comment_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE reel_id = OLD.reel_id
    AND comment_id = OLD.id
    AND type IN (
      'reel_comment',
      'reel_reply',
      'reel_comment_like'
    );

  RETURN OLD;
END;
$$;

ALTER FUNCTION public.cleanup_deleted_reel_comment_notifications()
OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_cleanup_deleted_reel_comment_notifications
ON public.reel_comments;

CREATE TRIGGER trg_cleanup_deleted_reel_comment_notifications
AFTER DELETE ON public.reel_comments
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_deleted_reel_comment_notifications();


-- ============================================================
-- 9. REEL SHARE NOTIFICATION CLEANUP
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_reel_share_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only remove the notification after the actor has no remaining
  -- shares of this Reel. This safely handles any duplicate rows.
  IF NOT EXISTS (
    SELECT 1
    FROM public.reel_shares
    WHERE reel_id = OLD.reel_id
      AND user_id = OLD.user_id
  ) THEN
    DELETE FROM public.notifications
    WHERE type = 'reel_share'
      AND reel_id = OLD.reel_id
      AND actor_id = OLD.user_id;
  END IF;

  RETURN OLD;
END;
$$;

ALTER FUNCTION public.cleanup_reel_share_notification()
OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_reel_share_notification_cleanup
ON public.reel_shares;

CREATE TRIGGER trg_reel_share_notification_cleanup
AFTER DELETE ON public.reel_shares
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_reel_share_notification();


-- ============================================================
-- 10. DELETED REEL CLEANUP
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_deleted_reel_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE reel_id = OLD.id;

  RETURN OLD;
END;
$$;

ALTER FUNCTION public.cleanup_deleted_reel_notifications()
OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_cleanup_deleted_reel_notifications
ON public.reels;

CREATE TRIGGER trg_cleanup_deleted_reel_notifications
AFTER DELETE ON public.reels
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_deleted_reel_notifications();


-- ============================================================
-- 11. FUNCTION PERMISSIONS
-- ============================================================

REVOKE ALL
ON FUNCTION public.cleanup_reel_like_notification()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.cleanup_reel_comment_like_notification()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.cleanup_deleted_reel_comment_notifications()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.cleanup_reel_share_notification()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.cleanup_deleted_reel_notifications()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.cleanup_reel_like_notification()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.cleanup_reel_comment_like_notification()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.cleanup_deleted_reel_comment_notifications()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.cleanup_reel_share_notification()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.cleanup_deleted_reel_notifications()
TO authenticated, service_role;

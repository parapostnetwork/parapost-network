-- ============================================================
-- Parapost Network
-- Comment notification lifecycle
--
-- Goals:
-- 1. Comment like creates one notification.
-- 2. Unlike removes its comment_like notification.
-- 3. Deleting a comment/reply removes notifications tied to it.
-- 4. Replies notify the exact reply_to_user_id.
-- 5. Post owner also receives reply notification when appropriate.
-- 6. Self-notifications are avoided.
-- 7. Duplicate comment_like/comment_reply notifications are prevented.
-- 8. Notification DELETE events can update filtered Realtime listeners.
-- ============================================================


-- ============================================================
-- 1. REALTIME DELETE SUPPORT
-- ============================================================

ALTER TABLE public.notifications
REPLICA IDENTITY FULL;


-- ============================================================
-- 2. CLEAN HISTORICAL STALE COMMENT NOTIFICATIONS
--
-- Remove comment-like notifications where that user no longer
-- likes the comment.
--
-- Also remove comment-linked notifications whose underlying
-- comment/reply no longer exists.
-- ============================================================

DELETE FROM public.notifications AS notifications
WHERE
  (
    notifications.type = 'comment_like'
    AND notifications.comment_id IS NOT NULL
    AND notifications.actor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.comment_likes AS comment_likes
      WHERE comment_likes.comment_id = notifications.comment_id
        AND comment_likes.user_id = notifications.actor_id
    )
  )
  OR
  (
    notifications.type IN ('post_comment', 'comment_like', 'comment_reply')
    AND notifications.comment_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.comments AS comments
      WHERE comments.id = notifications.comment_id
    )
  );


-- ============================================================
-- 3. CLEAN EXISTING DUPLICATE COMMENT ACTIVITY NOTIFICATIONS
--
-- Keep one row for each exact:
-- recipient + actor + type + comment
-- ============================================================

WITH ranked_comment_notifications AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, actor_id, type, comment_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS duplicate_number
  FROM public.notifications
  WHERE type IN ('comment_like', 'comment_reply')
    AND comment_id IS NOT NULL
    AND user_id IS NOT NULL
    AND actor_id IS NOT NULL
)
DELETE FROM public.notifications AS notifications
USING ranked_comment_notifications AS ranked
WHERE notifications.id = ranked.id
  AND ranked.duplicate_number > 1;


-- ============================================================
-- 4. PREVENT FUTURE DUPLICATE COMMENT ACTIVITY NOTIFICATIONS
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS notifications_unique_comment_activity
ON public.notifications (
  user_id,
  actor_id,
  type,
  comment_id
)
WHERE type IN ('comment_like', 'comment_reply')
  AND comment_id IS NOT NULL
  AND user_id IS NOT NULL
  AND actor_id IS NOT NULL;


-- ============================================================
-- 5. COMMENT LIKE NOTIFICATION CREATION
--
-- The database remains the single source of truth.
-- ON CONFLICT prevents duplicate creation.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_comment_like_notification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  comment_owner_id uuid;
  comment_post_id uuid;
begin
  select
    comments.user_id,
    comments.post_id
  into
    comment_owner_id,
    comment_post_id
  from public.comments
  where comments.id = new.comment_id;

  if comment_owner_id is not null
     and comment_owner_id <> new.user_id then

    insert into public.notifications (
      user_id,
      actor_id,
      type,
      post_id,
      comment_id,
      message
    )
    values (
      comment_owner_id,
      new.user_id,
      'comment_like',
      comment_post_id,
      new.comment_id,
      'liked your comment'
    )
    on conflict do nothing;

  end if;

  return new;
end;
$function$;

ALTER FUNCTION public.create_comment_like_notification()
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.create_comment_like_notification()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.create_comment_like_notification()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.create_comment_like_notification()
TO service_role;


-- ============================================================
-- 6. COMMENT UNLIKE NOTIFICATION CLEANUP
--
-- SECURITY DEFINER is required because the liker is deleting a
-- notification belonging to the comment owner.
--
-- This function can only act from the comment_likes DELETE trigger.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_comment_like_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  delete from public.notifications
  where type = 'comment_like'
    and comment_id = old.comment_id
    and actor_id = old.user_id;

  return old;
end;
$function$;

ALTER FUNCTION public.cleanup_comment_like_notification()
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.cleanup_comment_like_notification()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.cleanup_comment_like_notification()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.cleanup_comment_like_notification()
TO service_role;

DROP TRIGGER IF EXISTS trg_comment_like_notification_cleanup
ON public.comment_likes;

CREATE TRIGGER trg_comment_like_notification_cleanup
AFTER DELETE ON public.comment_likes
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_comment_like_notification();


-- ============================================================
-- 7. COMMENT / REPLY NOTIFICATION CLEANUP
--
-- When a comment or reply disappears, every notification tied
-- directly to that comment/reply disappears too.
--
-- Child replies already cascade through:
-- comments_parent_comment_id_fkey ON DELETE CASCADE
--
-- Their own DELETE triggers therefore clean their notifications.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_deleted_comment_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  delete from public.notifications
  where comment_id = old.id;

  return old;
end;
$function$;

ALTER FUNCTION public.cleanup_deleted_comment_notifications()
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.cleanup_deleted_comment_notifications()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.cleanup_deleted_comment_notifications()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.cleanup_deleted_comment_notifications()
TO service_role;

DROP TRIGGER IF EXISTS trg_cleanup_deleted_comment_notifications
ON public.comments;

CREATE TRIGGER trg_cleanup_deleted_comment_notifications
AFTER DELETE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_deleted_comment_notifications();


-- ============================================================
-- 8. COMMENT REPLY NOTIFICATION CREATION
--
-- reply_to_user_id identifies the exact comment/reply being answered.
--
-- If reply_to_user_id is missing on an older/client path, fall back
-- to the root/parent comment owner.
--
-- Also notify the post owner when:
-- - they are not the person replying
-- - they are not already the exact reply target
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_comment_reply_notification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  reply_target_id uuid;
  post_owner_id uuid;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  reply_target_id := new.reply_to_user_id;

  if reply_target_id is null then
    select comments.user_id
    into reply_target_id
    from public.comments
    where comments.id = new.parent_comment_id;
  end if;

  select posts.user_id
  into post_owner_id
  from public.posts
  where posts.id = new.post_id;

  if reply_target_id is not null
     and reply_target_id <> new.user_id then

    insert into public.notifications (
      user_id,
      actor_id,
      type,
      post_id,
      comment_id,
      message
    )
    values (
      reply_target_id,
      new.user_id,
      'comment_reply',
      new.post_id,
      new.id,
      'replied to your comment'
    )
    on conflict do nothing;

  end if;

  if post_owner_id is not null
     and post_owner_id <> new.user_id
     and post_owner_id is distinct from reply_target_id then

    insert into public.notifications (
      user_id,
      actor_id,
      type,
      post_id,
      comment_id,
      message
    )
    values (
      post_owner_id,
      new.user_id,
      'comment_reply',
      new.post_id,
      new.id,
      'replied to a comment on your post'
    )
    on conflict do nothing;

  end if;

  return new;
end;
$function$;

ALTER FUNCTION public.create_comment_reply_notification()
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.create_comment_reply_notification()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.create_comment_reply_notification()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.create_comment_reply_notification()
TO service_role;

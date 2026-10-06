-- ============================================================
-- Parapost Network
-- Post like notification lifecycle
--
-- Goals:
-- 1. Post like creates exactly one notification.
-- 2. Unlike removes its matching post_like notification.
-- 3. Historical stale post_like notifications are removed.
-- 4. Duplicate post_like notifications are prevented.
-- 5. Database remains the single source of truth.
-- ============================================================


-- ============================================================
-- 1. CLEAN HISTORICAL STALE POST LIKE NOTIFICATIONS
--
-- Remove notifications whose underlying like no longer exists.
-- ============================================================

DELETE FROM public.notifications AS notifications
WHERE notifications.type = 'post_like'
  AND notifications.post_id IS NOT NULL
  AND notifications.actor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.likes AS likes
    WHERE likes.post_id = notifications.post_id
      AND likes.user_id = notifications.actor_id
  );


-- ============================================================
-- 2. CLEAN HISTORICAL DUPLICATE POST LIKE NOTIFICATIONS
--
-- Keep one row for each exact:
-- recipient + actor + post
-- ============================================================

WITH ranked_post_like_notifications AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, actor_id, post_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS duplicate_number
  FROM public.notifications
  WHERE type = 'post_like'
    AND post_id IS NOT NULL
    AND user_id IS NOT NULL
    AND actor_id IS NOT NULL
)
DELETE FROM public.notifications AS notifications
USING ranked_post_like_notifications AS ranked
WHERE notifications.id = ranked.id
  AND ranked.duplicate_number > 1;


-- ============================================================
-- 3. PREVENT FUTURE DUPLICATE POST LIKE NOTIFICATIONS
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS notifications_unique_post_like
ON public.notifications (
  user_id,
  actor_id,
  type,
  post_id
)
WHERE type = 'post_like'
  AND post_id IS NOT NULL
  AND user_id IS NOT NULL
  AND actor_id IS NOT NULL;


-- ============================================================
-- 4. POST LIKE NOTIFICATION CREATION
--
-- The database remains the single source of truth.
-- ON CONFLICT prevents duplicate notification creation.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_post_like_notification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  post_owner_id uuid;
begin
  select posts.user_id
  into post_owner_id
  from public.posts
  where posts.id = new.post_id;

  if post_owner_id is not null
     and post_owner_id <> new.user_id then

    insert into public.notifications (
      user_id,
      actor_id,
      type,
      post_id,
      message
    )
    values (
      post_owner_id,
      new.user_id,
      'post_like',
      new.post_id,
      'liked your post'
    )
    on conflict do nothing;

  end if;

  return new;
end;
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
-- 5. POST UNLIKE NOTIFICATION CLEANUP
--
-- SECURITY DEFINER is required because the liker is deleting a
-- notification belonging to the post owner.
--
-- This function can only act from the likes DELETE trigger.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_post_like_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  delete from public.notifications
  where type = 'post_like'
    and post_id = old.post_id
    and actor_id = old.user_id;

  return old;
end;
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

DROP TRIGGER IF EXISTS trg_post_like_notification_cleanup
ON public.likes;

CREATE TRIGGER trg_post_like_notification_cleanup
AFTER DELETE ON public.likes
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_post_like_notification();

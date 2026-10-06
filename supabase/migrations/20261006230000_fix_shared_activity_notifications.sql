-- ============================================================
-- Parapost Network
-- Fix shared-post activity notifications
--
-- 1. Top-level comments notify the owner of the exact discussion
--    context: original post owner or exact share owner.
-- 2. Replies retain exact reply-target + context-owner behavior.
-- 3. Recreate comment and post-like notification triggers so
--    environments cannot retain missing/stale trigger wiring.
-- ============================================================


-- ============================================================
-- COMMENT / REPLY NOTIFICATION CREATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_comment_reply_notification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  reply_target_id uuid;
  context_owner_id uuid;
  context_owner_message text;
BEGIN

  -- ----------------------------------------------------------
  -- Determine the owner of the exact discussion context.
  -- ----------------------------------------------------------

  IF NEW.share_id IS NOT NULL THEN

    SELECT shares.user_id
    INTO context_owner_id
    FROM public.shares AS shares
    WHERE shares.id = NEW.share_id
      AND shares.post_id = NEW.post_id
      AND shares.deleted_at IS NULL
      AND COALESCE(shares.share_destination, 'feed') = 'feed';

  ELSE

    SELECT posts.user_id
    INTO context_owner_id
    FROM public.posts AS posts
    WHERE posts.id = NEW.post_id;

  END IF;


  -- ----------------------------------------------------------
  -- TOP-LEVEL COMMENT
  --
  -- Original post:
  --   notify original post owner.
  --
  -- Shared copy:
  --   notify owner of exact shares.id.
  -- ----------------------------------------------------------

  IF NEW.parent_comment_id IS NULL THEN

    IF context_owner_id IS NOT NULL
       AND context_owner_id <> NEW.user_id
    THEN

      INSERT INTO public.notifications (
        user_id,
        actor_id,
        type,
        post_id,
        comment_id,
        share_id,
        message
      )
      VALUES (
        context_owner_id,
        NEW.user_id,
        'post_comment',
        NEW.post_id,
        NEW.id,
        NEW.share_id,
        CASE
          WHEN NEW.share_id IS NOT NULL
            THEN 'commented on a post you shared.'
          ELSE 'commented on your post'
        END
      )
      ON CONFLICT DO NOTHING;

    END IF;

    RETURN NEW;

  END IF;


  -- ----------------------------------------------------------
  -- REPLY
  -- ----------------------------------------------------------

  reply_target_id := NEW.reply_to_user_id;

  IF reply_target_id IS NULL THEN

    SELECT comments.user_id
    INTO reply_target_id
    FROM public.comments AS comments
    WHERE comments.id = NEW.parent_comment_id;

  END IF;


  IF NEW.share_id IS NOT NULL THEN

    context_owner_message :=
      'replied to a comment on a post you shared.';

  ELSE

    context_owner_message :=
      'replied to a comment on your post';

  END IF;


  -- Notify exact comment/reply owner.

  IF reply_target_id IS NOT NULL
     AND reply_target_id <> NEW.user_id
  THEN

    INSERT INTO public.notifications (
      user_id,
      actor_id,
      type,
      post_id,
      comment_id,
      share_id,
      message
    )
    VALUES (
      reply_target_id,
      NEW.user_id,
      'comment_reply',
      NEW.post_id,
      NEW.id,
      NEW.share_id,
      'replied to your comment'
    )
    ON CONFLICT DO NOTHING;

  END IF;


  -- Also notify the owner of the exact discussion context,
  -- unless they already received the reply-target notification.

  IF context_owner_id IS NOT NULL
     AND context_owner_id <> NEW.user_id
     AND context_owner_id IS DISTINCT FROM reply_target_id
  THEN

    INSERT INTO public.notifications (
      user_id,
      actor_id,
      type,
      post_id,
      comment_id,
      share_id,
      message
    )
    VALUES (
      context_owner_id,
      NEW.user_id,
      'comment_reply',
      NEW.post_id,
      NEW.id,
      NEW.share_id,
      context_owner_message
    )
    ON CONFLICT DO NOTHING;

  END IF;


  RETURN NEW;

END;
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


-- ============================================================
-- ENSURE COMMENT NOTIFICATION TRIGGER IS INSTALLED
-- ============================================================

DROP TRIGGER IF EXISTS trg_comment_reply_notification
ON public.comments;

CREATE TRIGGER trg_comment_reply_notification
AFTER INSERT ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.create_comment_reply_notification();


-- ============================================================
-- ENSURE POST-LIKE NOTIFICATION TRIGGER IS INSTALLED
--
-- create_post_like_notification() was made share-aware by
-- 20261006223000_add_shared_like_and_share_notification_context.sql.
-- Recreate its trigger explicitly so all environments execute
-- that current function.
-- ============================================================

DROP TRIGGER IF EXISTS trg_post_like_notification
ON public.likes;

CREATE TRIGGER trg_post_like_notification
AFTER INSERT ON public.likes
FOR EACH ROW
EXECUTE FUNCTION public.create_post_like_notification();

-- ============================================================
-- Parapost Network
-- Shared post comment context
--
-- Goals:
-- 1. Original-post comments and shared-copy comments are separate.
-- 2. A shared-copy comment belongs to one exact shares.id.
-- 3. Replies remain inside the same original/share discussion.
-- 4. Shared-comment notifications can target the exact share.
-- 5. Hard-deleting a share removes its discussion automatically.
-- 6. Soft-deleting a share removes its discussion and notifications.
-- 7. Original post owners do not control another user's share thread.
-- ============================================================


-- ============================================================
-- 1. ADD SHARE CONTEXT
-- ============================================================

ALTER TABLE public.comments
ADD COLUMN IF NOT EXISTS share_id uuid;

ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS share_id uuid;


ALTER TABLE public.comments
DROP CONSTRAINT IF EXISTS comments_share_id_fkey;

ALTER TABLE public.comments
ADD CONSTRAINT comments_share_id_fkey
FOREIGN KEY (share_id)
REFERENCES public.shares(id)
ON DELETE CASCADE;


ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_share_id_fkey;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_share_id_fkey
FOREIGN KEY (share_id)
REFERENCES public.shares(id)
ON DELETE CASCADE;


CREATE INDEX IF NOT EXISTS comments_share_id_idx
ON public.comments (share_id);

CREATE INDEX IF NOT EXISTS notifications_share_id_idx
ON public.notifications (share_id);


-- ============================================================
-- 2. ENFORCE COMMENT DISCUSSION CONTEXT
--
-- Normal/original post:
--   share_id IS NULL
--
-- Shared copy:
--   share_id = exact shares.id
--
-- Replies automatically inherit the root discussion context.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_comment_share_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  parent_post_id uuid;
  parent_share_id uuid;
  reply_post_id uuid;
  reply_share_id uuid;
BEGIN

  -- ----------------------------------------------------------
  -- Existing comments may not be moved to another post/thread.
  -- ----------------------------------------------------------

  IF TG_OP = 'UPDATE' THEN
    IF NEW.post_id IS DISTINCT FROM OLD.post_id
       OR NEW.share_id IS DISTINCT FROM OLD.share_id
       OR NEW.parent_comment_id IS DISTINCT FROM OLD.parent_comment_id
    THEN
      RAISE EXCEPTION 'Comment discussion context cannot be changed.';
    END IF;
  END IF;


  -- ----------------------------------------------------------
  -- Replies inherit the exact parent discussion context.
  -- ----------------------------------------------------------

  IF NEW.parent_comment_id IS NOT NULL THEN

    SELECT
      comments.post_id,
      comments.share_id
    INTO
      parent_post_id,
      parent_share_id
    FROM public.comments AS comments
    WHERE comments.id = NEW.parent_comment_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent comment does not exist.';
    END IF;

    IF NEW.post_id IS DISTINCT FROM parent_post_id THEN
      RAISE EXCEPTION 'Reply post does not match parent comment.';
    END IF;

    NEW.share_id := parent_share_id;

  END IF;


  -- ----------------------------------------------------------
  -- Exact reply targets must belong to the same discussion.
  -- ----------------------------------------------------------

  IF NEW.reply_to_comment_id IS NOT NULL THEN

    SELECT
      comments.post_id,
      comments.share_id
    INTO
      reply_post_id,
      reply_share_id
    FROM public.comments AS comments
    WHERE comments.id = NEW.reply_to_comment_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Reply target comment does not exist.';
    END IF;

    IF NEW.post_id IS DISTINCT FROM reply_post_id
       OR NEW.share_id IS DISTINCT FROM reply_share_id
    THEN
      RAISE EXCEPTION 'Reply target belongs to another discussion.';
    END IF;

  END IF;


  -- ----------------------------------------------------------
  -- A share-specific comment must reference an active feed share
  -- for the exact same original post.
  -- ----------------------------------------------------------

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
    RAISE EXCEPTION 'Shared post discussion is not active.';
  END IF;


  RETURN NEW;
END;
$function$;


ALTER FUNCTION public.enforce_comment_share_context()
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.enforce_comment_share_context()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.enforce_comment_share_context()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.enforce_comment_share_context()
TO service_role;


DROP TRIGGER IF EXISTS trg_enforce_comment_share_context
ON public.comments;

CREATE TRIGGER trg_enforce_comment_share_context
BEFORE INSERT OR UPDATE OF
  post_id,
  share_id,
  parent_comment_id,
  reply_to_comment_id
ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_comment_share_context();


-- ============================================================
-- 3. COMMENT INSERT / SELECT RLS
--
-- Shared comments must point to an active share belonging to the
-- same original post.
-- ============================================================

DROP POLICY IF EXISTS comments_insert_visible_post
ON public.comments;

CREATE POLICY comments_insert_visible_post
ON public.comments
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.posts AS posts
    WHERE posts.id = comments.post_id
  )
  AND (
    comments.share_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.shares AS shares
      WHERE shares.id = comments.share_id
        AND shares.post_id = comments.post_id
        AND shares.deleted_at IS NULL
        AND COALESCE(shares.share_destination, 'feed') = 'feed'
    )
  )
);


DROP POLICY IF EXISTS comments_select_visible_post
ON public.comments;

CREATE POLICY comments_select_visible_post
ON public.comments
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_access_moderation_dashboard()
  OR (
    is_hidden IS NOT TRUE
    AND EXISTS (
      SELECT 1
      FROM public.posts AS posts
      WHERE posts.id = comments.post_id
    )
    AND (
      comments.share_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.shares AS shares
        WHERE shares.id = comments.share_id
          AND shares.post_id = comments.post_id
          AND shares.deleted_at IS NULL
          AND COALESCE(shares.share_destination, 'feed') = 'feed'
      )
    )
  )
);


-- ============================================================
-- 4. COMMENT DELETE OWNERSHIP
--
-- Original thread:
--   post owner may delete comments.
--
-- Shared-copy thread:
--   share owner may delete comments.
--
-- Comment author and moderators retain their existing rights.
-- ============================================================

DROP POLICY IF EXISTS comments_delete_own_or_moderator
ON public.comments;

DROP POLICY IF EXISTS comments_delete_own_post_owner_or_moderator
ON public.comments;

DROP POLICY IF EXISTS comments_delete_own_context_owner_or_moderator
ON public.comments;


CREATE POLICY comments_delete_own_context_owner_or_moderator
ON public.comments
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()

  OR (
    comments.share_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.posts AS posts
      WHERE posts.id = comments.post_id
        AND posts.user_id = auth.uid()
    )
  )

  OR (
    comments.share_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.shares AS shares
      WHERE shares.id = comments.share_id
        AND shares.user_id = auth.uid()
    )
  )

  OR public.can_access_moderation_dashboard()
);


-- ============================================================
-- 5. COMMENT LIKE NOTIFICATIONS
--
-- Carry share_id so clicking a like notification can return to
-- the exact shared-copy discussion.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_comment_like_notification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  comment_owner_id uuid;
  comment_post_id uuid;
  comment_share_id uuid;
BEGIN

  SELECT
    comments.user_id,
    comments.post_id,
    comments.share_id
  INTO
    comment_owner_id,
    comment_post_id,
    comment_share_id
  FROM public.comments AS comments
  WHERE comments.id = NEW.comment_id;


  IF comment_owner_id IS NOT NULL
     AND comment_owner_id <> NEW.user_id
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
      comment_owner_id,
      NEW.user_id,
      'comment_like',
      comment_post_id,
      NEW.comment_id,
      comment_share_id,
      'liked your comment'
    )
    ON CONFLICT DO NOTHING;

  END IF;


  RETURN NEW;
END;
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
-- 6. COMMENT REPLY NOTIFICATIONS
--
-- Original discussion:
--   exact reply target + original post owner.
--
-- Shared discussion:
--   exact reply target + share owner.
--
-- The original post owner is not automatically notified about
-- discussion taking place on somebody else's shared copy.
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

  IF NEW.parent_comment_id IS NULL THEN
    RETURN NEW;
  END IF;


  reply_target_id := NEW.reply_to_user_id;


  IF reply_target_id IS NULL THEN

    SELECT comments.user_id
    INTO reply_target_id
    FROM public.comments AS comments
    WHERE comments.id = NEW.parent_comment_id;

  END IF;


  -- ----------------------------------------------------------
  -- Determine who owns this discussion.
  -- ----------------------------------------------------------

  IF NEW.share_id IS NOT NULL THEN

    SELECT shares.user_id
    INTO context_owner_id
    FROM public.shares AS shares
    WHERE shares.id = NEW.share_id;

    context_owner_message :=
      'replied to a comment on a post you shared.';

  ELSE

    SELECT posts.user_id
    INTO context_owner_id
    FROM public.posts AS posts
    WHERE posts.id = NEW.post_id;

    context_owner_message :=
      'replied to a comment on your post';

  END IF;


  -- ----------------------------------------------------------
  -- Notify the exact comment/reply being answered.
  -- ----------------------------------------------------------

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


  -- ----------------------------------------------------------
  -- Also notify the owner of this exact discussion context when
  -- they are not already the exact reply target and not replying
  -- to themselves.
  -- ----------------------------------------------------------

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
-- 7. SOFT-DELETED SHARE CLEANUP
--
-- Hard deletes are handled automatically by the new share_id
-- foreign keys with ON DELETE CASCADE.
--
-- A soft-deleted or repurposed share must also lose its private
-- discussion context.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_inactive_share_comment_context()
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

    DELETE FROM public.comments
    WHERE share_id = OLD.id;

    DELETE FROM public.notifications
    WHERE share_id = OLD.id;

  END IF;


  RETURN NEW;
END;
$function$;


ALTER FUNCTION public.cleanup_inactive_share_comment_context()
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.cleanup_inactive_share_comment_context()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.cleanup_inactive_share_comment_context()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.cleanup_inactive_share_comment_context()
TO service_role;


DROP TRIGGER IF EXISTS trg_cleanup_inactive_share_comment_context
ON public.shares;

CREATE TRIGGER trg_cleanup_inactive_share_comment_context
AFTER UPDATE OF
  deleted_at,
  share_destination,
  post_id,
  user_id
ON public.shares
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_inactive_share_comment_context();

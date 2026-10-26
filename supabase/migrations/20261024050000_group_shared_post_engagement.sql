BEGIN;

CREATE TABLE public.group_post_share_likes (
  share_id uuid NOT NULL
    REFERENCES public.group_post_shares(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (share_id, user_id)
);

CREATE TABLE public.group_post_share_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid NOT NULL
    REFERENCES public.group_post_shares(id) ON DELETE CASCADE,
  author_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT group_share_comment_content_check
    CHECK (
      char_length(btrim(content)) BETWEEN 1 AND 1200
    ),

  CONSTRAINT group_share_comment_identity
    UNIQUE (id, share_id),

  CONSTRAINT group_share_comment_parent_fk
    FOREIGN KEY (parent_id, share_id)
    REFERENCES public.group_post_share_comments(id, share_id)
    ON DELETE CASCADE
);

CREATE TABLE public.group_post_share_comment_likes (
  comment_id uuid NOT NULL,
  share_id uuid NOT NULL,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (comment_id, user_id),

  CONSTRAINT group_share_comment_like_parent_fk
    FOREIGN KEY (comment_id, share_id)
    REFERENCES public.group_post_share_comments(id, share_id)
    ON DELETE CASCADE
);

CREATE INDEX group_share_comments_order_idx
  ON public.group_post_share_comments
  (share_id, created_at, id);

CREATE INDEX group_share_comment_likes_lookup_idx
  ON public.group_post_share_comment_likes
  (share_id, comment_id);

ALTER TABLE public.group_post_share_likes
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_post_share_comments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_post_share_comment_likes
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON
  public.group_post_share_likes,
  public.group_post_share_comments,
  public.group_post_share_comment_likes
FROM PUBLIC, anon, authenticated;


-- Per-user shared-post interaction limits.
-- Two reusable rows per user; no growing request log.
CREATE TABLE parapost_groups_private.shared_post_interaction_rate_limits (
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  action_kind text NOT NULL
    CHECK (action_kind IN ('comment', 'reaction')),
  window_started_at timestamptz NOT NULL,
  action_count integer NOT NULL
    CHECK (action_count BETWEEN 1 AND 60),
  PRIMARY KEY (user_id, action_kind)
);

ALTER TABLE parapost_groups_private.shared_post_interaction_rate_limits
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE parapost_groups_private.shared_post_interaction_rate_limits
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.groups_shared_post_stats(
  p_share_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_group_id uuid;
  v_sharer_id uuid;
  v_author_id uuid;
  v_comments jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.group_id, s.user_id, p.author_id
  INTO v_group_id, v_sharer_id, v_author_id
  FROM public.group_post_shares s
  JOIN public.groups g ON g.id = s.group_id
  JOIN public.group_posts p
    ON p.id = s.post_id AND p.group_id = s.group_id
  WHERE s.id = p_share_id
    AND g.visibility = 'public'
    AND NOT p.is_deleted;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Share unavailable'
      USING ERRCODE = '42501';
  END IF;

  IF NOT parapost_groups_private.allowed(v_group_id, 'read')
     OR parapost_groups_private.blocked(v_uid, v_sharer_id)
     OR parapost_groups_private.blocked(v_uid, v_author_id)
  THEN
    RAISE EXCEPTION 'Share unavailable'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'author_id', c.author_id,
        'parent_id', c.parent_id,
        'content', c.content,
        'created_at', c.created_at,
        'updated_at', c.updated_at,
        'like_count', c.like_count,
        'liked', c.liked
      )
      ORDER BY c.created_at, c.id
    ),
    '[]'::jsonb
  )
  INTO v_comments
  FROM (
    SELECT
      cm.*,
      (
        SELECT count(*)::integer
        FROM public.group_post_share_comment_likes cl
        WHERE cl.comment_id = cm.id
          AND NOT parapost_groups_private.blocked(v_uid, cl.user_id)
      ) AS like_count,
      EXISTS (
        SELECT 1
        FROM public.group_post_share_comment_likes cl
        WHERE cl.comment_id = cm.id
          AND cl.user_id = v_uid
      ) AS liked
    FROM public.group_post_share_comments cm
    WHERE cm.share_id = p_share_id
      AND NOT parapost_groups_private.blocked(v_uid, cm.author_id)
      AND (
        cm.parent_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.group_post_share_comments parent
          WHERE parent.id = cm.parent_id
            AND parent.share_id = cm.share_id
            AND parent.parent_id IS NULL
            AND NOT parapost_groups_private.blocked(
              v_uid, parent.author_id
            )
        )
      )
    ORDER BY cm.created_at, cm.id
    LIMIT 150
  ) c;

  RETURN jsonb_build_object(
    'liked', EXISTS (
      SELECT 1
      FROM public.group_post_share_likes l
      WHERE l.share_id = p_share_id
        AND l.user_id = v_uid
    ),
    'like_count', (
      SELECT count(*)::integer
      FROM public.group_post_share_likes l
      WHERE l.share_id = p_share_id
        AND NOT parapost_groups_private.blocked(v_uid, l.user_id)
    ),
    'comment_count', (
      SELECT count(*)::integer
      FROM public.group_post_share_comments c
      WHERE c.share_id = p_share_id
        AND NOT parapost_groups_private.blocked(v_uid, c.author_id)
        AND (
          c.parent_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.group_post_share_comments parent
            WHERE parent.id = c.parent_id
              AND parent.share_id = c.share_id
              AND parent.parent_id IS NULL
              AND NOT parapost_groups_private.blocked(
                v_uid, parent.author_id
              )
          )
        )
    ),
    'comments_limited', (
      SELECT count(*) > 150
      FROM public.group_post_share_comments c
      WHERE c.share_id = p_share_id
        AND NOT parapost_groups_private.blocked(v_uid, c.author_id)
        AND (
          c.parent_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.group_post_share_comments parent
            WHERE parent.id = c.parent_id
              AND parent.share_id = c.share_id
              AND parent.parent_id IS NULL
              AND NOT parapost_groups_private.blocked(
                v_uid, parent.author_id
              )
          )
        )
    ),
    'comments', v_comments
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.groups_shared_post_stats(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.groups_shared_post_stats(uuid)
TO authenticated;

-- Shared Group post interaction function

CREATE OR REPLACE FUNCTION public.groups_shared_post_interact(
  p_share_id uuid,
  p_action text,
  p_content text DEFAULT NULL,
  p_parent_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_share public.group_post_shares%ROWTYPE;
  v_group public.groups%ROWTYPE;
  v_post public.group_posts%ROWTYPE;
  v_parent public.group_post_share_comments%ROWTYPE;
  v_id uuid;
  v_limit_kind text;
  v_limit_max integer;
  v_limit_now timestamptz;
  v_limit_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_share
  FROM public.group_post_shares
  WHERE id = p_share_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Share unavailable'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_group
  FROM public.groups
  WHERE id = v_share.group_id
  FOR SHARE;

  IF NOT FOUND
     OR v_group.visibility <> 'public'
     OR NOT parapost_groups_private.allowed(
       v_share.group_id, 'read'
     ) THEN
    RAISE EXCEPTION 'Group unavailable'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_post
  FROM public.group_posts
  WHERE id = v_share.post_id
    AND group_id = v_share.group_id
    AND NOT is_deleted;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post unavailable'
      USING ERRCODE = '42501';
  END IF;

  IF parapost_groups_private.blocked(v_uid, v_share.user_id)
     OR parapost_groups_private.blocked(
       v_uid, v_post.author_id
     ) THEN
    RAISE EXCEPTION 'Interaction unavailable'
      USING ERRCODE = '42501';
  END IF;

  -- Atomic per-user limits across all shared Group posts.
  IF p_action IN ('comment', 'reply') THEN
    v_limit_kind := 'comment';
    v_limit_max := 10;
  ELSIF p_action IN (
    'like', 'unlike', 'like_comment', 'unlike_comment'
  ) THEN
    v_limit_kind := 'reaction';
    v_limit_max := 60;
  END IF;

  IF v_limit_kind IS NOT NULL THEN
    v_limit_now := clock_timestamp();

    INSERT INTO parapost_groups_private.shared_post_interaction_rate_limits AS rl
      (user_id, action_kind, window_started_at, action_count)
    VALUES (v_uid, v_limit_kind, v_limit_now, 1)
    ON CONFLICT (user_id, action_kind)
    DO UPDATE SET
      window_started_at = CASE
        WHEN rl.window_started_at <=
             v_limit_now - interval '60 seconds'
        THEN v_limit_now
        ELSE rl.window_started_at
      END,
      action_count = CASE
        WHEN rl.window_started_at <=
             v_limit_now - interval '60 seconds'
        THEN 1
        ELSE rl.action_count + 1
      END
    WHERE rl.window_started_at <=
          v_limit_now - interval '60 seconds'
       OR rl.action_count < v_limit_max
    RETURNING action_count INTO v_limit_count;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Rate limit exceeded. Try again shortly.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_action = 'like' THEN
    INSERT INTO public.group_post_share_likes
      (share_id, user_id)
    VALUES (p_share_id, v_uid)
    ON CONFLICT (share_id, user_id) DO NOTHING;

    RETURN jsonb_build_object('liked', true);

  ELSIF p_action = 'unlike' THEN
    DELETE FROM public.group_post_share_likes
    WHERE share_id = p_share_id
      AND user_id = v_uid;

    RETURN jsonb_build_object('liked', false);

  ELSIF p_action = 'comment' THEN
    IF p_parent_id IS NOT NULL
       OR p_content IS NULL
       OR char_length(btrim(p_content)) NOT BETWEEN 1 AND 1200 THEN
      RAISE EXCEPTION 'Invalid comment';
    END IF;

    INSERT INTO public.group_post_share_comments
      (share_id, author_id, content)
    VALUES (p_share_id, v_uid, btrim(p_content))
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('id', v_id);

  ELSIF p_action IN (
    'reply', 'like_comment', 'unlike_comment',
    'edit_comment', 'delete_comment'
  ) THEN
    IF p_parent_id IS NULL THEN
      RAISE EXCEPTION 'Comment required';
    END IF;

    SELECT * INTO v_parent
    FROM public.group_post_share_comments
    WHERE id = p_parent_id
      AND share_id = p_share_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Comment unavailable'
        USING ERRCODE = '42501';
    END IF;

    IF p_action = 'reply' THEN
      IF v_parent.parent_id IS NOT NULL
         OR parapost_groups_private.blocked(
           v_uid, v_parent.author_id
         )
         OR p_content IS NULL
         OR char_length(btrim(p_content)) NOT BETWEEN 1 AND 1200 THEN
        RAISE EXCEPTION 'Reply unavailable'
          USING ERRCODE = '42501';
      END IF;

      INSERT INTO public.group_post_share_comments
        (share_id, author_id, parent_id, content)
      VALUES (
        p_share_id, v_uid, p_parent_id, btrim(p_content)
      )
      RETURNING id INTO v_id;

      RETURN jsonb_build_object('id', v_id);

    ELSIF p_action = 'like_comment' THEN
      IF parapost_groups_private.blocked(
        v_uid, v_parent.author_id
      )
      OR (
        v_parent.parent_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.group_post_share_comments parent
          WHERE parent.id = v_parent.parent_id
            AND parent.share_id = p_share_id
            AND parent.parent_id IS NULL
            AND NOT parapost_groups_private.blocked(
              v_uid, parent.author_id
            )
        )
      ) THEN
        RAISE EXCEPTION 'Comment Like unavailable'
          USING ERRCODE = '42501';
      END IF;

      INSERT INTO public.group_post_share_comment_likes
        (comment_id, share_id, user_id)
      VALUES (p_parent_id, p_share_id, v_uid)
      ON CONFLICT (comment_id, user_id) DO NOTHING;

      RETURN jsonb_build_object('liked', true);

    ELSIF p_action = 'unlike_comment' THEN
      DELETE FROM public.group_post_share_comment_likes
      WHERE comment_id = p_parent_id
        AND share_id = p_share_id
        AND user_id = v_uid;

      RETURN jsonb_build_object('liked', false);

    ELSIF p_action = 'edit_comment' THEN
      IF v_parent.author_id <> v_uid
         OR p_content IS NULL
         OR char_length(btrim(p_content)) NOT BETWEEN 1 AND 1200 THEN
        RAISE EXCEPTION 'Edit unavailable'
          USING ERRCODE = '42501';
      END IF;

      UPDATE public.group_post_share_comments
      SET content = btrim(p_content),
          updated_at = now()
      WHERE id = p_parent_id
        AND share_id = p_share_id
        AND author_id = v_uid;

      RETURN jsonb_build_object('updated', true);

    ELSIF p_action = 'delete_comment' THEN
      IF v_parent.author_id <> v_uid THEN
        RAISE EXCEPTION 'Delete unavailable'
          USING ERRCODE = '42501';
      END IF;

      DELETE FROM public.group_post_share_comments
      WHERE id = p_parent_id
        AND share_id = p_share_id
        AND author_id = v_uid;

      RETURN jsonb_build_object('deleted', true);
    END IF;
  END IF;

  RAISE EXCEPTION 'Unknown interaction action';
END;
$function$;

REVOKE ALL ON FUNCTION
  public.groups_shared_post_interact(uuid,text,text,uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.groups_shared_post_interact(uuid,text,text,uuid)
TO authenticated;

COMMIT;

-- Group post interactions. No direct client writes.
CREATE TABLE public.group_post_likes (
  post_id uuid NOT NULL REFERENCES public.group_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id,user_id)
);

CREATE TABLE public.group_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.group_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid,
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 1200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,post_id),
  FOREIGN KEY (parent_id,post_id)
    REFERENCES public.group_post_comments(id,post_id) ON DELETE CASCADE,
  CHECK (parent_id IS DISTINCT FROM id)
);

CREATE INDEX group_post_comments_feed_idx
  ON public.group_post_comments(post_id,created_at,id);

CREATE INDEX group_post_comments_author_idx
  ON public.group_post_comments(author_id);

ALTER TABLE public.group_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_post_comments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.group_post_likes,public.group_post_comments
  FROM PUBLIC,anon,authenticated;

GRANT SELECT ON public.group_post_likes,public.group_post_comments
  TO authenticated;

CREATE POLICY group_post_likes_read ON public.group_post_likes
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.group_posts p
    WHERE p.id=post_id AND p.published AND NOT p.is_deleted
      AND parapost_groups_private.allowed(p.group_id,'read')
  )
);

CREATE POLICY group_post_comments_read ON public.group_post_comments
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.group_posts p
    WHERE p.id=post_id AND p.published AND NOT p.is_deleted
      AND parapost_groups_private.allowed(p.group_id,'read')
  )
);

-- Likes for Group comments and replies.
-- The post_id is bound to the actual comment by a composite FK.
CREATE TABLE public.group_comment_likes (
  comment_id uuid NOT NULL,
  post_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id,user_id),
  FOREIGN KEY (comment_id,post_id)
    REFERENCES public.group_post_comments(id,post_id)
    ON DELETE CASCADE
);

CREATE INDEX group_comment_likes_post_idx
  ON public.group_comment_likes(post_id,comment_id);

ALTER TABLE public.group_comment_likes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.group_comment_likes
  FROM PUBLIC,anon,authenticated;

-- All interaction writes go through this authorized function.
CREATE FUNCTION public.groups_interact(
  p_group_id uuid, p_post_id uuid, p_action text,
  p_content text DEFAULT NULL, p_parent_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_group public.groups;
  v_post public.group_posts;
  v_parent public.group_post_comments;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501';
  END IF;

  -- Serialize interactions with Group membership/privacy changes.
  SELECT * INTO v_group FROM public.groups
    WHERE id=p_group_id FOR SHARE;

  IF NOT FOUND OR NOT parapost_groups_private.allowed(p_group_id,'member') THEN
    RAISE EXCEPTION 'Approved membership required' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_post FROM public.group_posts
    WHERE id=p_post_id AND group_id=p_group_id
      AND published AND NOT is_deleted;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post unavailable' USING ERRCODE='42501';
  END IF;

  -- Block interactions with posts from blocked accounts.
  IF p_action IN ('like','comment','reply','like_comment')
     AND parapost_groups_private.blocked(v_uid,v_post.author_id) THEN
    RAISE EXCEPTION 'Interaction unavailable'
      USING ERRCODE='42501';
  END IF;

  IF p_action='like' THEN
    INSERT INTO public.group_post_likes(post_id,user_id)
      VALUES(p_post_id,v_uid)
      ON CONFLICT (post_id,user_id) DO NOTHING;
    RETURN jsonb_build_object('liked',true);
  ELSIF p_action='unlike' THEN
    DELETE FROM public.group_post_likes
      WHERE post_id=p_post_id AND user_id=v_uid;
    RETURN jsonb_build_object('liked',false);
  ELSIF p_action IN ('like_comment','unlike_comment') THEN
    IF p_parent_id IS NULL THEN
      RAISE EXCEPTION 'Comment required';
    END IF;

    SELECT * INTO v_parent
      FROM public.group_post_comments
      WHERE id=p_parent_id AND post_id=p_post_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Comment unavailable'
        USING ERRCODE='42501';
    END IF;

    IF p_action='like_comment' THEN
      IF parapost_groups_private.blocked(
        v_uid,v_parent.author_id
      ) THEN
        RAISE EXCEPTION 'Comment Like unavailable'
          USING ERRCODE='42501';
      END IF;

      INSERT INTO public.group_comment_likes
        (comment_id,post_id,user_id)
      VALUES (p_parent_id,p_post_id,v_uid)
      ON CONFLICT (comment_id,user_id) DO NOTHING;

      RETURN jsonb_build_object('liked',true);
    ELSE
      DELETE FROM public.group_comment_likes
      WHERE comment_id=p_parent_id AND user_id=v_uid;

      RETURN jsonb_build_object('liked',false);
    END IF;
  ELSIF p_action IN ('comment','reply') THEN
    IF p_content IS NULL OR
       char_length(btrim(p_content)) NOT BETWEEN 1 AND 1200 THEN
      RAISE EXCEPTION 'Invalid comment';
    END IF;

    IF p_action='comment' AND p_parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'Invalid comment parent';
    END IF;

    IF p_action='reply' THEN
      IF p_parent_id IS NULL THEN
        RAISE EXCEPTION 'Reply parent required';
      END IF;
      SELECT * INTO v_parent FROM public.group_post_comments
        WHERE id=p_parent_id AND post_id=p_post_id;
      IF NOT FOUND OR v_parent.parent_id IS NOT NULL THEN
        RAISE EXCEPTION 'Invalid reply parent';
      END IF;
      -- Do not allow replies to blocked comment authors.
      IF parapost_groups_private.blocked(v_uid,v_parent.author_id) THEN
        RAISE EXCEPTION 'Reply unavailable'
          USING ERRCODE='42501';
      END IF;
    END IF;

    INSERT INTO public.group_post_comments
      (post_id,author_id,parent_id,content)
    VALUES (p_post_id,v_uid,p_parent_id,btrim(p_content))
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('id',v_id);
  ELSE
    RAISE EXCEPTION 'Unknown interaction action';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.groups_interact(uuid,uuid,text,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.groups_interact(uuid,uuid,text,text,uuid)
  TO authenticated;

-- Return authorized comment and reply Like statistics.
-- No list of members who liked comments is exposed.
CREATE FUNCTION public.groups_comment_like_stats(
  p_group_id uuid,
  p_post_id uuid
)
RETURNS TABLE (
  comment_id uuid,
  like_count bigint,
  liked boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH visible_comments AS (
    SELECT c.id, c.created_at
    FROM public.group_post_comments c
    JOIN public.group_posts p ON p.id = c.post_id
    WHERE c.post_id = p_post_id
      AND p.group_id = p_group_id
      AND p.published
      AND NOT p.is_deleted
      AND auth.uid() IS NOT NULL
      AND parapost_groups_private.allowed(
        p_group_id, 'read'
      )
    ORDER BY c.created_at, c.id
    LIMIT 100
  )
  SELECT
    c.id,
    (
      SELECT count(*)
      FROM public.group_comment_likes l
      WHERE l.comment_id = c.id
    ),
    EXISTS (
      SELECT 1
      FROM public.group_comment_likes l
      WHERE l.comment_id = c.id
        AND l.user_id = auth.uid()
    )
  FROM visible_comments c
  ORDER BY c.created_at, c.id;
$$;

REVOKE ALL ON FUNCTION
  public.groups_comment_like_stats(uuid,uuid)
  FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION
  public.groups_comment_like_stats(uuid,uuid)
  TO authenticated;

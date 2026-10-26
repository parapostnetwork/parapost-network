-- Parapost Network: Group post sharing.
-- LOCAL DRAFT ONLY. Staging review required before execution.
-- No direct client access. Read/write functions added separately.

BEGIN;

CREATE TABLE public.group_post_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  group_id uuid NOT NULL,
  post_id uuid NOT NULL,

  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,

  caption text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT group_post_shares_post_fk
    FOREIGN KEY (post_id, group_id)
    REFERENCES public.group_posts(id, group_id)
    ON DELETE CASCADE,

  CONSTRAINT group_post_shares_unique
    UNIQUE (post_id, user_id),

  CONSTRAINT group_post_shares_caption_check
    CHECK (
      caption IS NULL OR char_length(caption) <= 1000
    )
);

CREATE INDEX group_post_shares_created_idx
  ON public.group_post_shares(created_at DESC);

CREATE INDEX group_post_shares_user_created_idx
  ON public.group_post_shares(user_id, created_at DESC);

-- Fail closed. No table-level client access.
-- All future reads must check the CURRENT Group visibility,
-- original post status, and viewer permissions.

ALTER TABLE public.group_post_shares
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.group_post_shares
  FROM PUBLIC, anon, authenticated;


-- Only approved members of currently public Groups may share.
-- The Group row lock prevents a concurrent privacy change.

CREATE FUNCTION public.groups_share_post(
  p_group_id uuid,
  p_post_id uuid,
  p_caption text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_group public.groups%ROWTYPE;
  v_post public.group_posts%ROWTYPE;
  v_share_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_group
  FROM public.groups
  WHERE id = p_group_id
  FOR SHARE;

  IF NOT FOUND
     OR v_group.visibility <> 'public'
     OR NOT parapost_groups_private.allowed(
       p_group_id, 'member'
     )
  THEN
    RAISE EXCEPTION 'Public Group membership required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_post
  FROM public.group_posts
  WHERE id = p_post_id
    AND group_id = p_group_id
    AND published
    AND NOT is_deleted;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group post unavailable'
      USING ERRCODE = '42501';
  END IF;

  IF parapost_groups_private.blocked(
    v_uid, v_post.author_id
  ) THEN
    RAISE EXCEPTION 'Sharing unavailable'
      USING ERRCODE = '42501';
  END IF;

  IF p_caption IS NOT NULL
     AND char_length(p_caption) > 1000 THEN
    RAISE EXCEPTION 'Share caption too long';
  END IF;

  INSERT INTO public.group_post_shares(
    group_id, post_id, user_id, caption
  )
  VALUES (
    p_group_id,
    p_post_id,
    v_uid,
    NULLIF(btrim(p_caption), '')
  )
  ON CONFLICT (post_id, user_id) DO NOTHING
  RETURNING id INTO v_share_id;

  IF v_share_id IS NULL THEN
    SELECT id INTO v_share_id
    FROM public.group_post_shares
    WHERE post_id = p_post_id
      AND user_id = v_uid;
  END IF;

  RETURN jsonb_build_object('id', v_share_id);
END;
$$;

REVOKE ALL ON FUNCTION
  public.groups_share_post(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.groups_share_post(uuid, uuid, text)
  TO authenticated;


-- Returns currently eligible public Group shares.
-- NULL sharer ID: Dashboard feed.
-- Specific sharer ID: that member's Profile.
-- Never copy protected Group content into ordinary posts.

CREATE FUNCTION public.groups_shared_feed(
  p_sharer_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 60,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  share_id uuid,
  group_id uuid,
  post_id uuid,
  sharer_id uuid,
  caption text,
  shared_at timestamptz,
  group_name text,
  original_author_id uuid,
  original_content text,
  original_created_at timestamptz,
  media jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    s.id,
    s.group_id,
    s.post_id,
    s.user_id,
    s.caption,
    s.created_at,
    g.name,
    p.author_id,
    p.content,
    p.created_at,
    COALESCE(media_items.items, '[]'::jsonb)
  FROM public.group_post_shares s
  JOIN public.groups g
    ON g.id = s.group_id
  JOIN public.group_posts p
    ON p.id = s.post_id
   AND p.group_id = s.group_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'media_type', m.media_type,
        'storage_path', m.storage_path,
        'display_order', m.display_order
      )
      ORDER BY m.display_order, m.id
    ) AS items
    FROM public.group_post_media m
    WHERE m.post_id = p.id
      AND m.group_id = g.id
  ) media_items ON true
  WHERE auth.uid() IS NOT NULL
    AND g.visibility = 'public'
    AND p.published
    AND NOT p.is_deleted
    AND parapost_groups_private.allowed(
      g.id, 'read'
    )
    AND NOT parapost_groups_private.blocked(
      auth.uid(), s.user_id
    )
    AND NOT parapost_groups_private.blocked(
      auth.uid(), p.author_id
    )
    AND (
      p_sharer_id IS NULL
      OR s.user_id = p_sharer_id
    )
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit,60),1),100)
  OFFSET LEAST(GREATEST(COALESCE(p_offset,0),0),10000);
$$;

REVOKE ALL ON FUNCTION
  public.groups_shared_feed(uuid,integer,integer)
  FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION
  public.groups_shared_feed(uuid,integer,integer)
  TO authenticated;


COMMIT;

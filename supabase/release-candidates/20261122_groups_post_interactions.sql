-- PARAPOST GROUPS PRODUCTION RELEASE CANDIDATE
-- REVIEW ONLY: DO NOT EXECUTE
-- Requires the Groups base tables from Step 457.
-- Reconstructed from the staging schema inventory.

BEGIN;

CREATE TABLE public.group_post_likes (
  post_id uuid NOT NULL
    REFERENCES public.group_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE public.group_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL
    REFERENCES public.group_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid,
  content text NOT NULL
    CHECK (char_length(btrim(content)) BETWEEN 1 AND 1200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (id, post_id),

  FOREIGN KEY (parent_id, post_id)
    REFERENCES public.group_post_comments(id, post_id)
    ON DELETE CASCADE,

  CHECK (parent_id IS DISTINCT FROM id)
);

CREATE TABLE public.group_comment_likes (
  comment_id uuid NOT NULL,
  post_id uuid NOT NULL,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (comment_id, user_id),

  FOREIGN KEY (comment_id, post_id)
    REFERENCES public.group_post_comments(id, post_id)
    ON DELETE CASCADE
);

CREATE TABLE public.group_post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  post_id uuid NOT NULL,
  uploader_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,

  media_type text NOT NULL
    CHECK (media_type IN ('image', 'video')),

  storage_path text NOT NULL UNIQUE,
  mime_type text,

  display_order integer NOT NULL DEFAULT 0
    CHECK (display_order BETWEEN 0 AND 19),

  created_at timestamptz NOT NULL DEFAULT now(),
  poster_path text,

  FOREIGN KEY (post_id, group_id)
    REFERENCES public.group_posts(id, group_id)
    ON DELETE CASCADE,

  CHECK (
    storage_path LIKE (
      group_id::text || '/posts/' ||
      post_id::text || '/' ||
      uploader_id::text || '/%'
    )
  ),

  CHECK (
    poster_path IS NULL
    OR (
      media_type = 'video'
      AND poster_path = storage_path || '.poster.jpg'
    )
  )
);

-- Keep all four tables inaccessible until the
-- reviewed security functions, policies and grants
-- are installed in later release migrations.

ALTER TABLE public.group_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_post_media ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON
  public.group_post_likes,
  public.group_post_comments,
  public.group_comment_likes,
  public.group_post_media
FROM PUBLIC, anon, authenticated;

COMMIT;

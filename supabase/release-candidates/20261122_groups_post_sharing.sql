-- PARAPOST GROUP SHARING
-- REVIEW ONLY: DO NOT EXECUTE
-- Requires Groups base and interaction tables.
-- Sharing cooldown is enforced separately by database logic.

BEGIN;

CREATE TABLE public.group_post_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  post_id uuid NOT NULL,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  caption text CHECK (char_length(caption) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (post_id, group_id)
    REFERENCES public.group_posts(id, group_id)
    ON DELETE CASCADE
);

CREATE TABLE public.group_post_share_likes (
  share_id uuid NOT NULL
    REFERENCES public.group_post_shares(id)
    ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users(id)
    ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (share_id, user_id)
);

CREATE TABLE public.group_post_share_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid NOT NULL
    REFERENCES public.group_post_shares(id)
    ON DELETE CASCADE,
  author_id uuid NOT NULL
    REFERENCES auth.users(id)
    ON DELETE CASCADE,
  parent_id uuid,
  content text NOT NULL
    CHECK (char_length(btrim(content)) BETWEEN 1 AND 1200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (id, share_id),

  FOREIGN KEY (parent_id, share_id)
    REFERENCES public.group_post_share_comments(id, share_id)
    ON DELETE CASCADE,

  CHECK (parent_id IS DISTINCT FROM id)
);

CREATE TABLE public.group_post_share_comment_likes (
  comment_id uuid NOT NULL,
  share_id uuid NOT NULL,
  user_id uuid NOT NULL
    REFERENCES auth.users(id)
    ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (comment_id, user_id),

  FOREIGN KEY (comment_id, share_id)
    REFERENCES public.group_post_share_comments(id, share_id)
    ON DELETE CASCADE
);

-- Lookup indexes matching the staging structure.

CREATE INDEX group_post_shares_created_idx
  ON public.group_post_shares (created_at DESC);

CREATE INDEX group_post_shares_user_created_idx
  ON public.group_post_shares (user_id, created_at DESC);

CREATE INDEX group_share_comments_order_idx
  ON public.group_post_share_comments
    (share_id, created_at, id);

CREATE INDEX group_share_comment_likes_lookup_idx
  ON public.group_post_share_comment_likes
    (share_id, comment_id);

-- Default-deny until reviewed grants,
-- policies and cooldown functions are installed.

ALTER TABLE public.group_post_shares
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_post_share_likes
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_post_share_comments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_post_share_comment_likes
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON
  public.group_post_shares,
  public.group_post_share_likes,
  public.group_post_share_comments,
  public.group_post_share_comment_likes
FROM PUBLIC, anon, authenticated;

COMMIT;

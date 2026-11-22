-- PARAPOST GROUPS + CREATORVERSE
-- REVIEW-ONLY PRODUCTION RELEASE CANDIDATE
-- DO NOT EXECUTE AGAINST ANY DATABASE YET.
-- Requires Steps 455 through 459.
-- Reconstructed from the staging database inventory.

BEGIN;

-- ==================================================
-- GROUP PROMOTIONAL SHARING
-- ==================================================

CREATE TABLE public.group_promotional_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL
    REFERENCES public.groups(id) ON DELETE CASCADE,
  post_id uuid,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  caption text CHECK (char_length(caption) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (post_id, group_id)
    REFERENCES public.group_posts(id, group_id)
    ON DELETE CASCADE
);

CREATE TABLE public.group_promotion_share_likes (
  share_id uuid NOT NULL
    REFERENCES public.group_promotional_shares(id)
    ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (share_id, user_id)
);

CREATE TABLE public.group_promotion_share_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid NOT NULL
    REFERENCES public.group_promotional_shares(id)
    ON DELETE CASCADE,
  author_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid,
  content text NOT NULL
    CHECK (char_length(btrim(content)) BETWEEN 1 AND 1200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (id, share_id),

  FOREIGN KEY (parent_id, share_id)
    REFERENCES public.group_promotion_share_comments(id, share_id)
    ON DELETE CASCADE
);

CREATE TABLE public.group_promotion_share_comment_likes (
  comment_id uuid NOT NULL,
  share_id uuid NOT NULL,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (comment_id, user_id),

  FOREIGN KEY (comment_id, share_id)
    REFERENCES public.group_promotion_share_comments(id, share_id)
    ON DELETE CASCADE
);

-- ==================================================
-- CREATORVERSE PRIVATE TABLES
-- Feature gate already created in Step 455.
-- ==================================================

CREATE TABLE creatorverse_private.media_cleanup (
  storage_path text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0
    CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  queued_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE creatorverse_private.media_cleanup_jobs (
  job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL UNIQUE
    REFERENCES public.creatorverse_media(id),
  page_id uuid NOT NULL,
  post_id uuid NOT NULL,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'claimed', 'completed')),
  attempts integer NOT NULL DEFAULT 0,
  successful_removals integer NOT NULL DEFAULT 0
    CHECK (successful_removals BETWEEN 0 AND 2),
  eligible_after timestamptz NOT NULL,
  claim_token uuid,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE creatorverse_private.post_share_cooldowns (
  sharer_id uuid NOT NULL,
  post_id uuid NOT NULL,
  last_shared_at timestamptz NOT NULL,

  PRIMARY KEY (sharer_id, post_id)
);

CREATE TABLE creatorverse_private.upload_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL,
  owner_id uuid NOT NULL
    REFERENCES auth.users(id),
  media_id uuid NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,

  FOREIGN KEY (page_id)
    REFERENCES public.creatorverse_pages(id),

  FOREIGN KEY (page_id, owner_id)
    REFERENCES public.creatorverse_pages(id, owner_id),

  FOREIGN KEY (page_id, media_id)
    REFERENCES public.creatorverse_media(page_id, id)
);

-- ==================================================
-- GROUPS PRIVATE TABLES
-- Feature gate already created in Step 455.
-- ==================================================

CREATE TABLE parapost_groups_private.avatar_uploads (
  storage_path text PRIMARY KEY,
  group_id uuid NOT NULL
    REFERENCES public.groups(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE parapost_groups_private.cover_uploads (
  storage_path text PRIMARY KEY,
  group_id uuid NOT NULL
    REFERENCES public.groups(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE parapost_groups_private.group_share_cooldowns (
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL
    CHECK (target_type IN ('group', 'post')),
  target_id uuid NOT NULL,
  last_shared_at timestamptz NOT NULL,

  PRIMARY KEY (user_id, target_type, target_id)
);

CREATE TABLE parapost_groups_private.media_cleanup (
  storage_path text PRIMARY KEY,
  queued_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE parapost_groups_private.promotion_settings (
  group_id uuid PRIMARY KEY
    REFERENCES public.groups(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  show_cover boolean NOT NULL DEFAULT false,
  show_description boolean NOT NULL DEFAULT false,
  show_name boolean NOT NULL DEFAULT false
);

CREATE TABLE parapost_groups_private.shared_post_interaction_rate_limits (
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  action_kind text NOT NULL
    CHECK (action_kind IN ('comment', 'reaction')),
  action_count integer NOT NULL
    CHECK (action_count BETWEEN 1 AND 60),
  window_started_at timestamptz NOT NULL,

  PRIMARY KEY (user_id, action_kind)
);

CREATE TABLE parapost_groups_private.test_users (
  user_id uuid PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ==================================================
-- DEFAULT-DENY SECURITY
-- ==================================================

ALTER TABLE public.group_promotional_shares
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_promotion_share_likes
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_promotion_share_comments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_promotion_share_comment_likes
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE creatorverse_private.media_cleanup
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE creatorverse_private.media_cleanup_jobs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE creatorverse_private.post_share_cooldowns
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE creatorverse_private.upload_reservations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE parapost_groups_private.avatar_uploads
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE parapost_groups_private.cover_uploads
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE parapost_groups_private.group_share_cooldowns
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE parapost_groups_private.media_cleanup
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE parapost_groups_private.promotion_settings
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE parapost_groups_private.shared_post_interaction_rate_limits
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE parapost_groups_private.test_users
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON
  public.group_promotional_shares,
  public.group_promotion_share_likes,
  public.group_promotion_share_comments,
  public.group_promotion_share_comment_likes
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON ALL TABLES
  IN SCHEMA creatorverse_private
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON ALL TABLES
  IN SCHEMA parapost_groups_private
FROM PUBLIC, anon, authenticated;

-- No feature gates are enabled.
-- No data is inserted.
-- Application RPCs and storage grants are
-- installed only after dependency review.

COMMIT;

-- PARAPOST CREATORVERSE RELEASE CANDIDATE
-- Review-only foundation. DO NOT EXECUTE.
-- Requires prior community foundation migration.
-- All tables remain inaccessible to client roles.

BEGIN;

CREATE TABLE public.creatorverse_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 3 AND 100),
  category text NOT NULL CHECK (
    category IN (
      'business','creator','investigation_team','podcast',
      'entertainment','organization','community_project','other'
    )
  ),
  short_bio text NOT NULL DEFAULT ''
    CHECK (char_length(short_bio) <= 240),
  description text NOT NULL DEFAULT ''
    CHECK (char_length(description) <= 5000),
  website text CHECK (
    website IS NULL OR (
      char_length(website) <= 2048 AND
      website ~ '^https?://[^[:space:]@/]+([/?#][^[:space:]]*)?$'
    )
  ),
  social_links jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (
      jsonb_typeof(social_links) = 'array'
      AND jsonb_array_length(social_links) <= 8
    ),
  public_email text CHECK (
    public_email IS NULL OR (
      char_length(public_email) <= 254 AND
      public_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  location text NOT NULL DEFAULT ''
    CHECK (char_length(location) <= 160),
  logo_media_id uuid,
  cover_media_id uuid,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','suspended','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_document tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'simple'::regconfig,
      name || ' ' || short_bio || ' ' || description
    )
  ) STORED,
  UNIQUE (id, owner_id)
);

CREATE TABLE public.creatorverse_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.creatorverse_pages(id),
  author_id uuid NOT NULL REFERENCES auth.users(id),
  content text NOT NULL DEFAULT ''
    CHECK (char_length(content) <= 10000),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','deleted')),
  comments_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, id),
  FOREIGN KEY (page_id, author_id)
    REFERENCES public.creatorverse_pages(id, owner_id)
);

CREATE TABLE public.creatorverse_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.creatorverse_pages(id),
  post_id uuid,
  purpose text NOT NULL
    CHECK (purpose IN ('logo','cover','post')),
  media_type text NOT NULL
    CHECK (media_type IN ('image','video')),
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (
    mime_type IN (
      'image/jpeg','image/png','image/webp',
      'video/mp4','video/webm'
    )
  ),
  verification text NOT NULL DEFAULT 'pending'
    CHECK (verification IN ('pending','verified','rejected')),
  byte_size bigint CHECK (byte_size > 0),
  duration_seconds numeric CHECK (
    duration_seconds > 0 AND duration_seconds <= 120
  ),
  display_order smallint NOT NULL DEFAULT 0
    CHECK (display_order BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, id),
  FOREIGN KEY (page_id, post_id)
    REFERENCES public.creatorverse_posts(page_id, id),
  CHECK (storage_path LIKE page_id::text || '/%'),
  CHECK (
    char_length(storage_path) <= 240
    AND storage_path NOT LIKE '%..%'
    AND storage_path NOT LIKE '%//%'
  ),
  CHECK (
    (purpose = 'post' AND post_id IS NOT NULL)
    OR (
      purpose IN ('logo','cover')
      AND post_id IS NULL
      AND media_type = 'image'
    )
  ),
  CHECK (
    (media_type = 'image'
      AND mime_type IN ('image/jpeg','image/png','image/webp')
      AND duration_seconds IS NULL
      AND (byte_size IS NULL OR byte_size <= 8388608))
    OR
    (media_type = 'video'
      AND mime_type IN ('video/mp4','video/webm')
      AND (byte_size IS NULL OR byte_size <= 33554432))
  ),
  CHECK (
    verification <> 'verified'
    OR (
      byte_size IS NOT NULL
      AND (media_type = 'image' OR duration_seconds IS NOT NULL)
    )
  )
);

ALTER TABLE public.creatorverse_pages
  ADD FOREIGN KEY (id, logo_media_id)
    REFERENCES public.creatorverse_media(page_id, id),
  ADD FOREIGN KEY (id, cover_media_id)
    REFERENCES public.creatorverse_media(page_id, id);

CREATE TABLE public.creatorverse_follows (
  page_id uuid NOT NULL
    REFERENCES public.creatorverse_pages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, user_id)
);

CREATE TABLE public.creatorverse_post_likes (
  post_id uuid NOT NULL
    REFERENCES public.creatorverse_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE public.creatorverse_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.creatorverse_posts(id),
  author_id uuid NOT NULL REFERENCES auth.users(id),
  parent_id uuid,
  content text NOT NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid,
  UNIQUE (post_id, id),
  FOREIGN KEY (post_id, parent_id)
    REFERENCES public.creatorverse_comments(post_id, id),
  CHECK (parent_id IS DISTINCT FROM id),
  CHECK (
    is_deleted OR
    char_length(btrim(content)) BETWEEN 1 AND 1200
  )
);

CREATE TABLE public.creatorverse_comment_likes (
  comment_id uuid NOT NULL
    REFERENCES public.creatorverse_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE public.creatorverse_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.creatorverse_posts(id),
  sharer_id uuid NOT NULL REFERENCES auth.users(id),
  caption text NOT NULL DEFAULT ''
    CHECK (char_length(caption) <= 1000),
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sharer_id, request_id)
);

-- Fail closed until the reviewed RLS policies and
-- functions are installed in later release migrations.

ALTER TABLE public.creatorverse_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creatorverse_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creatorverse_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creatorverse_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creatorverse_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creatorverse_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creatorverse_comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creatorverse_shares ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON
  public.creatorverse_pages,
  public.creatorverse_posts,
  public.creatorverse_media,
  public.creatorverse_follows,
  public.creatorverse_post_likes,
  public.creatorverse_comments,
  public.creatorverse_comment_likes,
  public.creatorverse_shares
FROM PUBLIC, anon, authenticated;

COMMIT;

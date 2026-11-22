-- PARAPOST GROUPS PRODUCTION RELEASE CANDIDATE
-- REVIEW ONLY: DO NOT EXECUTE
-- Requires the community foundation.
-- Feature access remains disabled.

BEGIN;

CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  owner_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE RESTRICT,

  name text NOT NULL
    CHECK (char_length(btrim(name)) BETWEEN 3 AND 100),

  description text NOT NULL DEFAULT ''
    CHECK (char_length(description) <= 5000),

  visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private')),

  cover_storage_path text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  avatar_storage_path text,

  CHECK (
    cover_storage_path IS NULL
    OR cover_storage_path LIKE id::text || '/covers/%'
  ),

  CHECK (
    avatar_storage_path IS NULL
    OR avatar_storage_path LIKE id::text || '/avatars/%'
  )
);

CREATE TABLE public.group_members (
  group_id uuid NOT NULL
    REFERENCES public.groups(id) ON DELETE CASCADE,

  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,

  role text NOT NULL DEFAULT 'member'
    CHECK (
      role IN ('owner', 'admin', 'moderator', 'member')
    ),

  status text NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'approved',
        'rejected',
        'removed',
        'banned'
      )
    ),

  created_at timestamptz NOT NULL DEFAULT now(),

  approved_at timestamptz,

  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE public.group_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  group_id uuid NOT NULL
    REFERENCES public.groups(id) ON DELETE CASCADE,

  author_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,

  content text NOT NULL DEFAULT ''
    CHECK (char_length(content) <= 10000),

  is_deleted boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),

  updated_at timestamptz NOT NULL DEFAULT now(),

  published boolean NOT NULL DEFAULT false,

  UNIQUE (id, group_id)
);

-- Fail closed until all reviewed security
-- policies, functions and triggers are installed.

ALTER TABLE public.groups
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_members
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_posts
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON
  public.groups,
  public.group_members,
  public.group_posts
FROM PUBLIC, anon, authenticated;

COMMIT;

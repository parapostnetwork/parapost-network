-- PARAPOST COMMUNITY RELEASE
-- PRODUCTION CANDIDATE: NOT YET APPROVED OR APPLIED
-- Foundation only. Feature gates default to disabled.
-- Do not execute before full release validation.

BEGIN;

CREATE SCHEMA IF NOT EXISTS creatorverse_private;
CREATE SCHEMA IF NOT EXISTS parapost_groups_private;

REVOKE ALL ON SCHEMA creatorverse_private
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON SCHEMA parapost_groups_private
  FROM PUBLIC, anon, authenticated;

CREATE TABLE creatorverse_private.feature_gate (
  singleton boolean PRIMARY KEY DEFAULT true
    CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  writes_enabled boolean NOT NULL DEFAULT false,
  page_details_edit_enabled boolean NOT NULL DEFAULT false
);

CREATE TABLE parapost_groups_private.feature_gate (
  singleton boolean PRIMARY KEY DEFAULT true
    CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  allow_all_authenticated boolean NOT NULL DEFAULT false
);

ALTER TABLE creatorverse_private.feature_gate
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE parapost_groups_private.feature_gate
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON creatorverse_private.feature_gate
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON parapost_groups_private.feature_gate
  FROM PUBLIC, anon, authenticated;

-- Additive notification extensions.
-- Preserve existing records, policies and triggers.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS creatorverse_page_id uuid,
  ADD COLUMN IF NOT EXISTS group_id uuid,
  ADD COLUMN IF NOT EXISTS community_post_id uuid,
  ADD COLUMN IF NOT EXISTS community_comment_id uuid,
  ADD COLUMN IF NOT EXISTS community_event_key text;

-- Community notification types, routing and indexes
-- will be installed in a separate dependency-aware migration.

-- No feature activation or user data migration.

COMMIT;

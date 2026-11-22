-- PARAPOST NETWORK - STEP 461
-- LOCAL RELEASE CANDIDATE ONLY
-- NOT VERIFIED OR APPROVED FOR EXECUTION
--
-- No feature activation.
-- No existing bucket replacement.
-- No broad permissions.
-- No modification of existing production data.
-- Reconcile against actual staging and production first.

BEGIN;

-- Private community media buckets
-- 32 MiB maximum file size.
-- Existing bucket rows are never updated.

INSERT INTO storage.buckets
  (id, name, public, file_size_limit)
VALUES
  ('group-media', 'group-media', false, 33554432)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets
  (id, name, public, file_size_limit)
VALUES
  ('creatorverse-media', 'creatorverse-media', false, 33554432)
ON CONFLICT (id) DO NOTHING;

-- Non-unique index candidates
-- Unique indexes and constraints are deferred.

CREATE INDEX IF NOT EXISTS idx_community_notifications_creatorverse_page_id
ON public.notifications (creatorverse_page_id);

CREATE INDEX IF NOT EXISTS idx_community_notifications_group_id
ON public.notifications (group_id);

CREATE INDEX IF NOT EXISTS idx_community_notifications_community_post_id
ON public.notifications (community_post_id);

CREATE INDEX IF NOT EXISTS idx_community_notifications_community_comment_id
ON public.notifications (community_comment_id);

CREATE INDEX IF NOT EXISTS idx_community_notifications_community_event_key
ON public.notifications (community_event_key);

COMMIT;

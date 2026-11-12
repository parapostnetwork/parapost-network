-- DRAFT ONLY. DO NOT EXECUTE.
-- Group video JPEG poster metadata.
-- Posters do not count as Group post attachments.

ALTER TABLE public.group_post_media
ADD COLUMN IF NOT EXISTS poster_path text;

-- A poster is permitted only for video media.
-- Its path is deterministically associated with
-- the original video and cannot reference
-- an arbitrary storage object.
DO $poster_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'group_video_poster_path_valid'
      AND conrelid = 'public.group_post_media'::regclass
  ) THEN
    ALTER TABLE public.group_post_media
      ADD CONSTRAINT group_video_poster_path_valid
      CHECK (
        poster_path IS NULL
        OR (
          media_type = 'video'
          AND poster_path = storage_path || '.poster.jpg'
        )
      );
  END IF;
END;
$poster_constraint$;

-- Still required before staging deployment:
-- 1. Authorized poster reservation and upload.
-- 2. Storage policies for JPEG poster objects.
-- 3. Authorized poster download.
-- 4. Group component integration.
-- 5. Reliable poster generation and regression tests.
-- 6. Strategy for previously uploaded videos.

-- ============================================================
-- Parapost Network
-- Exact comment reply targeting
--
-- Adds the exact comment/reply being answered while preserving
-- parent_comment_id as the root thread relationship.
-- ============================================================

ALTER TABLE public.comments
ADD COLUMN reply_to_comment_id uuid;

ALTER TABLE public.comments
ADD CONSTRAINT comments_reply_to_comment_id_fkey
FOREIGN KEY (reply_to_comment_id)
REFERENCES public.comments(id)
ON DELETE SET NULL;

CREATE INDEX comments_reply_to_comment_id_idx
ON public.comments (reply_to_comment_id);

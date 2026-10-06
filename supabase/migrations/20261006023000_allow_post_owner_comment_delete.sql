-- ============================================================
-- Parapost Network
-- Allow post owners to delete comments on their own posts
--
-- A comment may be deleted by:
-- 1. The comment author.
-- 2. The owner of the post containing the comment.
-- 3. A user with moderation dashboard access.
-- ============================================================

DROP POLICY IF EXISTS comments_delete_own_or_moderator
ON public.comments;

CREATE POLICY comments_delete_own_post_owner_or_moderator
ON public.comments
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.posts AS posts
    WHERE posts.id = comments.post_id
      AND posts.user_id = auth.uid()
  )
  OR public.can_access_moderation_dashboard()
);

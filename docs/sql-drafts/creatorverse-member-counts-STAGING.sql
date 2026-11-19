-- CreatorVerse directory member counts: STAGING ONLY
-- Read-only. Returns counts, never follower identities.
BEGIN;

CREATE OR REPLACE FUNCTION public.creatorverse_directory_member_counts(
  p_page_ids uuid[]
)
RETURNS TABLE (
  page_id uuid,
  member_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $counts$
  SELECT
    p.id,
    COUNT(f.user_id)::bigint
  FROM public.creatorverse_pages AS p
  LEFT JOIN public.creatorverse_follows AS f
    ON f.page_id = p.id
  WHERE cardinality(p_page_ids) BETWEEN 1 AND 25
    AND p.id = ANY(p_page_ids)
    AND p.status = 'active'
    AND creatorverse_private.read_page(p.id)
  GROUP BY p.id;
$counts$;

REVOKE ALL ON FUNCTION
  public.creatorverse_directory_member_counts(uuid[])
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.creatorverse_directory_member_counts(uuid[])
TO anon, authenticated;

COMMIT;

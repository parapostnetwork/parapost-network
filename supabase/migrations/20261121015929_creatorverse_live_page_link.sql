-- CreatorVerse Live: staging-first additive migration.
-- One existing live_streams row represents one broadcast.
-- NULL means an ordinary personal livestream.
-- Do not apply to production without explicit approval.

ALTER TABLE public.live_streams
ADD COLUMN creatorverse_page_id uuid
REFERENCES public.creatorverse_pages(id)
ON DELETE SET NULL;

CREATE INDEX live_streams_creatorverse_page_idx
ON public.live_streams
  (creatorverse_page_id, updated_at DESC)
WHERE creatorverse_page_id IS NOT NULL;

-- Keep the ownership validator outside exposed API schemas.
CREATE SCHEMA IF NOT EXISTS creatorverse_private;

REVOKE ALL ON SCHEMA creatorverse_private FROM PUBLIC;

CREATE FUNCTION creatorverse_private.validate_live_page_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Existing personal broadcasts require no new permission.
  IF NEW.creatorverse_page_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only the authenticated broadcaster can associate a page.
  IF auth.uid() IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION
      'Unauthorized CreatorVerse livestream association'
      USING ERRCODE = '42501';
  END IF;

  -- The page must be active and belong to the broadcaster.
  IF NOT EXISTS (
    SELECT 1
    FROM public.creatorverse_pages AS p
    WHERE p.id = NEW.creatorverse_page_id
      AND p.owner_id = NEW.user_id
      AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION
      'CreatorVerse page is not owned or active'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL
ON FUNCTION creatorverse_private.validate_live_page_owner()
FROM PUBLIC;

CREATE TRIGGER validate_creatorverse_live_page_owner
BEFORE INSERT OR UPDATE OF creatorverse_page_id, user_id
ON public.live_streams
FOR EACH ROW
EXECUTE FUNCTION creatorverse_private.validate_live_page_owner();

COMMENT ON COLUMN public.live_streams.creatorverse_page_id IS
  'Optional active CreatorVerse page associated with this broadcast';

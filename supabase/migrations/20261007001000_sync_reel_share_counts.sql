-- Keep reels.shares synchronized with the authoritative reel_shares rows.

-- Repair any historical drift first.
UPDATE public.reels AS reel
SET shares = (
  SELECT count(*)::integer
  FROM public.reel_shares AS reel_share
  WHERE reel_share.reel_id = reel.id
)
WHERE coalesce(reel.shares, 0) <> (
  SELECT count(*)::integer
  FROM public.reel_shares AS reel_share
  WHERE reel_share.reel_id = reel.id
);


CREATE OR REPLACE FUNCTION public.sync_reel_share_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reels
    SET shares = coalesce(shares, 0) + 1
    WHERE id = NEW.reel_id;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE public.reels
    SET shares = greatest(coalesce(shares, 0) - 1, 0)
    WHERE id = OLD.reel_id;

    RETURN OLD;
  END IF;

  -- Only a Reel move changes the number of shares belonging
  -- to either Reel. Other UPDATE operations leave counts alone.
  IF OLD.reel_id IS DISTINCT FROM NEW.reel_id THEN
    UPDATE public.reels
    SET shares = greatest(coalesce(shares, 0) - 1, 0)
    WHERE id = OLD.reel_id;

    UPDATE public.reels
    SET shares = coalesce(shares, 0) + 1
    WHERE id = NEW.reel_id;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.sync_reel_share_count()
OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_sync_reel_share_count
ON public.reel_shares;

CREATE TRIGGER trg_sync_reel_share_count
AFTER INSERT OR UPDATE OR DELETE
ON public.reel_shares
FOR EACH ROW
EXECUTE FUNCTION public.sync_reel_share_count();

REVOKE ALL
ON FUNCTION public.sync_reel_share_count()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.sync_reel_share_count()
TO authenticated, service_role;

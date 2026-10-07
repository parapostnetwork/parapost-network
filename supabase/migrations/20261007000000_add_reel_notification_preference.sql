-- Persist Reel notification preferences across devices and enforce
-- the recipient's preference inside the database.

ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS notify_reels boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.user_preferences.notify_reels IS
  'Whether the user wants to receive Reel activity notifications.';

CREATE OR REPLACE FUNCTION public.enforce_reel_notification_preference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  reel_notifications_enabled boolean;
BEGIN
  -- Leave all non-Reel notifications unchanged.
  IF left(NEW.type, 5) <> 'reel_' THEN
    RETURN NEW;
  END IF;

  SELECT preferences.notify_reels
  INTO reel_notifications_enabled
  FROM public.user_preferences AS preferences
  WHERE preferences.user_id = NEW.user_id;

  -- No preference row means the existing default behavior: enabled.
  IF coalesce(reel_notifications_enabled, true) = false THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_reel_notification_preference
ON public.notifications;

CREATE TRIGGER trg_enforce_reel_notification_preference
BEFORE INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.enforce_reel_notification_preference();

REVOKE ALL ON FUNCTION public.enforce_reel_notification_preference()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.enforce_reel_notification_preference()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.enforce_reel_notification_preference()
TO service_role;

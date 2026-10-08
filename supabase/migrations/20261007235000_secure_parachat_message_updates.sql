-- Restrict authenticated Parachat message updates.
-- Preserve sender edits and recipient read receipts.
-- Do not change existing INSERT friendship guards.

CREATE OR REPLACE FUNCTION public.parapost_guard_message_updates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Allow trusted service-role operations.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Reject anonymous or unauthenticated updates.
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- The original sender may edit the message body only.
  IF OLD.sender_id = v_user_id THEN
    IF (to_jsonb(NEW) - 'body') IS DISTINCT FROM
       (to_jsonb(OLD) - 'body') THEN
      RAISE EXCEPTION 'Message sender may update body only';
    END IF;

    RETURN NEW;
  END IF;

  -- A recipient may mark an incoming message as read only.
  IF public.is_direct_conversation_participant(
       OLD.conversation_id,
       v_user_id
     )
     AND OLD.sender_id <> v_user_id
     AND OLD.is_read IS DISTINCT FROM TRUE
     AND NEW.is_read IS TRUE
     AND (to_jsonb(NEW) - 'is_read') IS NOT DISTINCT FROM
         (to_jsonb(OLD) - 'is_read') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Message update not permitted';
END;
$$;

CREATE TRIGGER parapost_message_update_guard
BEFORE UPDATE ON public.direct_messages
FOR EACH ROW
EXECUTE FUNCTION public.parapost_guard_message_updates();

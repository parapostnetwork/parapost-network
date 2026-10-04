-- Phase 8D3C3B
-- Return only the information Parachat needs to build the Inbox.
-- The function runs as the authenticated caller, so existing RLS remains active.

CREATE INDEX IF NOT EXISTS idx_direct_messages_unread_conversation_sender
ON public.direct_messages (conversation_id, sender_id)
WHERE is_read = false;

CREATE OR REPLACE FUNCTION public.get_parachat_inbox_summaries()
RETURNS TABLE (
  conversation_id uuid,
  last_message_id uuid,
  last_sender_id uuid,
  last_body text,
  last_created_at timestamptz,
  last_is_read boolean,
  last_message_type text,
  last_image_path text,
  last_image_mime_type text,
  last_image_size_bytes integer,
  last_image_width integer,
  last_image_height integer,
  unread_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH my_conversations AS (
    SELECT dc.id
    FROM public.direct_conversations dc
    WHERE auth.uid() IS NOT NULL
      AND (
        dc.user_one_id = auth.uid()
        OR dc.user_two_id = auth.uid()
      )
  )
  SELECT
    mc.id AS conversation_id,
    latest.id AS last_message_id,
    latest.sender_id AS last_sender_id,
    latest.body AS last_body,
    latest.created_at AS last_created_at,
    latest.is_read AS last_is_read,
    latest.message_type AS last_message_type,
    latest.image_path AS last_image_path,
    latest.image_mime_type AS last_image_mime_type,
    latest.image_size_bytes AS last_image_size_bytes,
    latest.image_width AS last_image_width,
    latest.image_height AS last_image_height,
    COALESCE(unread.unread_count, 0)::bigint AS unread_count
  FROM my_conversations mc

  LEFT JOIN LATERAL (
    SELECT
      dm.id,
      dm.sender_id,
      dm.body,
      dm.created_at,
      dm.is_read,
      dm.message_type,
      dm.image_path,
      dm.image_mime_type,
      dm.image_size_bytes,
      dm.image_width,
      dm.image_height
    FROM public.direct_messages dm
    WHERE dm.conversation_id = mc.id
    ORDER BY dm.created_at DESC, dm.id DESC
    LIMIT 1
  ) latest ON true

  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS unread_count
    FROM public.direct_messages dm
    WHERE dm.conversation_id = mc.id
      AND dm.sender_id <> auth.uid()
      AND dm.is_read = false
  ) unread ON true;
$$;

REVOKE ALL
ON FUNCTION public.get_parachat_inbox_summaries()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.get_parachat_inbox_summaries()
TO authenticated;

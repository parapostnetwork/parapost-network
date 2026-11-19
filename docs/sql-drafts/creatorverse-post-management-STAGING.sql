-- CreatorVerse post management
-- STAGING ONLY. Review before executing.
-- Do not execute in production.
-- Requires the existing CreatorVerse security functions.

BEGIN;

CREATE FUNCTION public.creatorverse_edit_post(
  p_page_id uuid,
  p_post_id uuid,
  p_content text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $body$
DECLARE
  v_user uuid := auth.uid();
  v_post uuid;
  v_content text := btrim(p_content);
BEGIN
  IF v_user IS NULL
     OR NOT creatorverse_private.write_enabled()
     OR NOT creatorverse_private.owns(p_page_id)
     OR NOT creatorverse_private.read_page(p_page_id)
  THEN
    RAISE EXCEPTION 'Post management unavailable'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.creatorverse_pages
  WHERE id = p_page_id FOR UPDATE;

  SELECT id INTO v_post
  FROM public.creatorverse_posts
  WHERE id = p_post_id
    AND page_id = p_page_id
    AND author_id = v_user
    AND status = 'published'
  FOR UPDATE;

  IF v_post IS NULL THEN
    RAISE EXCEPTION 'Post unavailable'
      USING ERRCODE = '42501';
  END IF;

  IF v_content IS NULL
     OR char_length(v_content) > 5000
     OR translate(v_content, E'\n\r\t', '') ~ '[[:cntrl:]]'
  THEN
    RAISE EXCEPTION 'Invalid post content'
      USING ERRCODE = '23514';
  END IF;

  IF v_content = '' AND NOT EXISTS (
    SELECT 1
    FROM public.creatorverse_media
    WHERE page_id = p_page_id
      AND post_id = p_post_id
      AND purpose = 'post'
      AND verification = 'verified'
  ) THEN
    RAISE EXCEPTION 'Post cannot be empty'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.creatorverse_posts
  SET content = v_content,
      updated_at = now()
  WHERE id = v_post
  RETURNING id INTO v_post;

  RETURN v_post;
END;
$body$;

REVOKE ALL ON FUNCTION
  public.creatorverse_edit_post(uuid,uuid,text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.creatorverse_edit_post(uuid,uuid,text)
TO authenticated;

CREATE FUNCTION public.creatorverse_delete_post(
  p_page_id uuid,
  p_post_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $body$
DECLARE
  v_user uuid := auth.uid();
  v_post uuid;
BEGIN
  IF v_user IS NULL
     OR NOT creatorverse_private.write_enabled()
     OR NOT creatorverse_private.owns(p_page_id)
     OR NOT creatorverse_private.read_page(p_page_id)
  THEN
    RAISE EXCEPTION 'Post management unavailable'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.creatorverse_pages
  WHERE id = p_page_id FOR UPDATE;

  SELECT id INTO v_post
  FROM public.creatorverse_posts
  WHERE id = p_post_id
    AND page_id = p_page_id
    AND author_id = v_user
    AND status = 'published'
  FOR UPDATE;

  IF v_post IS NULL THEN
    RAISE EXCEPTION 'Post unavailable'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.creatorverse_posts
  SET status = 'deleted',
      updated_at = now()
  WHERE id = v_post
  RETURNING id INTO v_post;

  RETURN v_post;
END;
$body$;

REVOKE ALL ON FUNCTION
  public.creatorverse_delete_post(uuid,uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.creatorverse_delete_post(uuid,uuid)
TO authenticated;

COMMIT;

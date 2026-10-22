-- Parapost Network Groups
-- Initial fail-closed database schema.
-- Hardened candidate; independent review and explicit database-test approval required.
-- STAGING FIRST. Never apply to production without approval.

BEGIN;

-- Fail closed on older Storage versions; do not replace this with broad SELECT.
DO $$ BEGIN
 IF to_regprocedure('storage.allow_only_operation(text)') IS NULL THEN
   RAISE EXCEPTION 'Groups requires Storage operation-aware RLS; verify staging Storage version first';
 END IF;
END $$;

CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'public',
  cover_storage_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT groups_name_check
    CHECK (char_length(btrim(name)) BETWEEN 3 AND 100),

  CONSTRAINT groups_description_check
    CHECK (char_length(description) <= 5000),

  CONSTRAINT groups_visibility_check
    CHECK (visibility IN ('public', 'private')),

  CONSTRAINT groups_cover_path_check
    CHECK (
      cover_storage_path IS NULL OR
      cover_storage_path LIKE id::text || '/covers/%'
    )
);

CREATE TABLE public.group_members (
  group_id uuid NOT NULL
    REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,

  PRIMARY KEY (group_id, user_id),

  CONSTRAINT group_members_role_check
    CHECK (
      role IN ('owner', 'admin', 'moderator', 'member')
    ),

  CONSTRAINT group_members_status_check
    CHECK (
      status IN (
        'pending',
        'approved',
        'rejected',
        'removed',
        'banned'
      )
    )
);

CREATE TABLE public.group_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL
    REFERENCES public.groups(id) ON DELETE CASCADE,
  author_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT group_posts_content_check
    CHECK (char_length(content) <= 10000),

  CONSTRAINT group_posts_id_group_unique
    UNIQUE (id, group_id)
);

CREATE TABLE public.group_post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  post_id uuid NOT NULL,
  uploader_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  media_type text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT group_post_media_post_fk
    FOREIGN KEY (post_id, group_id)
    REFERENCES public.group_posts(id, group_id)
    ON DELETE CASCADE,

  CONSTRAINT group_post_media_type_check
    CHECK (media_type IN ('image', 'video')),

  CONSTRAINT group_post_media_order_check
    CHECK (display_order BETWEEN 0 AND 19),

  CONSTRAINT group_post_media_path_check
    CHECK (
      storage_path LIKE (
        group_id::text || '/posts/' ||
        post_id::text || '/' ||
        uploader_id::text || '/%'
      )
    )
);


-- Internal owner initialization.
-- Group creation authorization will be added separately.
-- The private schema must not be exposed through the Data API.

CREATE SCHEMA parapost_groups_private;

REVOKE ALL ON SCHEMA parapost_groups_private
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION parapost_groups_private.initialize_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.group_members (
    group_id,
    user_id,
    role,
    status,
    approved_at
  )
  VALUES (
    NEW.id,
    NEW.owner_id,
    'owner',
    'approved',
    now()
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION
  parapost_groups_private.initialize_owner()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER groups_initialize_owner
AFTER INSERT ON public.groups
FOR EACH ROW
EXECUTE FUNCTION
  parapost_groups_private.initialize_owner();


-- Restricted self-service membership request.
-- Only the authenticated caller may request membership.
-- Rejected, removed, and banned users cannot self-restore.

CREATE FUNCTION parapost_groups_private.request_membership(
  p_group_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_visibility text;
  v_owner_id uuid;
  v_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT g.visibility, g.owner_id
    INTO v_visibility, v_owner_id
  FROM public.groups g
  WHERE g.id = p_group_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group unavailable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.blocked_users b
    WHERE
      (b.blocker_id = v_user_id
       AND b.blocked_id = v_owner_id)
      OR
      (b.blocked_id = v_user_id
       AND b.blocker_id = v_owner_id)
  ) THEN
    RAISE EXCEPTION 'Membership unavailable';
  END IF;

  INSERT INTO public.group_members (
    group_id,
    user_id,
    role,
    status,
    approved_at
  )
  VALUES (
    p_group_id,
    v_user_id,
    'member',
    CASE
      WHEN v_visibility = 'public'
      THEN 'approved'
      ELSE 'pending'
    END,
    CASE
      WHEN v_visibility = 'public'
      THEN now()
      ELSE NULL
    END
  )
  ON CONFLICT (group_id, user_id)
  DO NOTHING;

  SELECT gm.status
    INTO v_status
  FROM public.group_members gm
  WHERE gm.group_id = p_group_id
    AND gm.user_id = v_user_id;

  IF v_status NOT IN ('approved', 'pending')
     OR v_status IS NULL THEN
    RAISE EXCEPTION 'Membership unavailable';
  END IF;

  RETURN v_status;
END;
$function$;

REVOKE ALL ON FUNCTION
  parapost_groups_private.request_membership(uuid)
  FROM PUBLIC, anon, authenticated;

-- Legacy privileged API wrapper (revoked by hardening below).
-- The privileged implementation stays in a private schema.

CREATE FUNCTION public.request_group_membership(
  p_group_id uuid
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT parapost_groups_private.request_membership(p_group_id);
$function$;

REVOKE ALL ON FUNCTION
  public.request_group_membership(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.request_group_membership(uuid)
  TO authenticated;


-- Group membership approval and rejection.
-- Only approved owners/admins can review pending requests.

CREATE FUNCTION parapost_groups_private.review_membership(
  p_group_id uuid,
  p_target_user_id uuid,
  p_decision text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reviewer uuid := auth.uid();
  v_owner_id uuid;
  v_reviewer_role text;
  v_final_status text;
BEGIN
  IF v_reviewer IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_group_id IS NULL
     OR p_target_user_id IS NULL
     OR p_decision IS NULL
     OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid membership review';
  END IF;

  SELECT g.owner_id
    INTO v_owner_id
  FROM public.groups g
  WHERE g.id = p_group_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group unavailable';
  END IF;

  SELECT gm.role
    INTO v_reviewer_role
  FROM public.group_members gm
  WHERE gm.group_id = p_group_id
    AND gm.user_id = v_reviewer
    AND gm.status = 'approved'
    AND gm.role IN ('owner', 'admin')
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to review membership';
  END IF;

  IF p_decision = 'approved' AND EXISTS (
    SELECT 1
    FROM public.blocked_users b
    WHERE
      (
        b.blocker_id = p_target_user_id
        AND b.blocked_id IN (v_owner_id, v_reviewer)
      )
      OR
      (
        b.blocked_id = p_target_user_id
        AND b.blocker_id IN (v_owner_id, v_reviewer)
      )
  ) THEN
    RAISE EXCEPTION 'Membership unavailable';
  END IF;

  UPDATE public.group_members gm
  SET
    status = p_decision,
    approved_at = CASE
      WHEN p_decision = 'approved'
      THEN now()
      ELSE NULL
    END
  WHERE gm.group_id = p_group_id
    AND gm.user_id = p_target_user_id
    AND gm.role = 'member'
    AND gm.status = 'pending'
  RETURNING gm.status INTO v_final_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending membership unavailable';
  END IF;

  RETURN v_final_status;
END;
$function$;

REVOKE ALL ON FUNCTION
  parapost_groups_private.review_membership(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.review_group_membership(
  p_group_id uuid,
  p_target_user_id uuid,
  p_decision text
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT parapost_groups_private.review_membership(
    p_group_id,
    p_target_user_id,
    p_decision
  );
$function$;

REVOKE ALL ON FUNCTION
  public.review_group_membership(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.review_group_membership(uuid, uuid, text)
  TO authenticated;


-- Protect ownership until a separate, audited
-- ownership-transfer operation is implemented.

CREATE FUNCTION parapost_groups_private.lock_group_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION
      'Group ownership cannot be reassigned';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION
  parapost_groups_private.lock_group_owner()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER groups_prevent_owner_change
BEFORE UPDATE ON public.groups
FOR EACH ROW
EXECUTE FUNCTION
  parapost_groups_private.lock_group_owner();

-- Ensure an owner membership belongs to the
-- actual Group owner and is approved.
-- Prevent changing an existing owner's membership.

CREATE FUNCTION parapost_groups_private.guard_owner_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'owner' THEN
      IF NEW.status <> 'approved'
         OR NOT EXISTS (
           SELECT 1
           FROM public.groups g
           WHERE g.id = NEW.group_id
             AND g.owner_id = NEW.user_id
         ) THEN
        RAISE EXCEPTION
          'Invalid Group owner membership';
      END IF;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'owner'
       AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION
        'Owner membership cannot be modified';
    END IF;

    IF OLD.role <> 'owner'
       AND NEW.role = 'owner' THEN
      RAISE EXCEPTION
        'Owner promotion requires a separate transfer';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION
  parapost_groups_private.guard_owner_member()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER group_members_guard_owner
BEFORE INSERT OR UPDATE ON public.group_members
FOR EACH ROW
EXECUTE FUNCTION
  parapost_groups_private.guard_owner_member();

CREATE UNIQUE INDEX group_members_one_owner_idx
ON public.group_members(group_id)
WHERE role = 'owner';

CREATE INDEX groups_owner_idx
  ON public.groups(owner_id);

CREATE INDEX groups_visibility_created_idx
  ON public.groups(visibility, created_at DESC);

CREATE INDEX group_members_user_status_idx
  ON public.group_members(user_id, status);

CREATE INDEX group_members_group_status_idx
  ON public.group_members(group_id, status);

CREATE INDEX group_posts_group_created_idx
  ON public.group_posts(group_id, created_at DESC);

CREATE INDEX group_post_media_post_idx
  ON public.group_post_media(post_id, display_order);

-- Fail closed: no client policies are installed yet.

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_post_media ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.groups
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.group_members
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.group_posts
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.group_post_media
  FROM PUBLIC, anon, authenticated;

-- Dedicated private media bucket.
-- Storage object policies will be added separately.

INSERT INTO storage.buckets (id, name, public)
VALUES ('group-media', 'group-media', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'group-media' AND public = true
  ) THEN
    RAISE EXCEPTION
      'Groups media bucket must remain private';
  END IF;
END
$$;

-- Completion of the original draft. All mutations use one serialized command API.
-- This switch is deliberately OFF after migration; enable only in an approved test DB.
CREATE TABLE parapost_groups_private.feature_gate (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), enabled boolean NOT NULL DEFAULT false,
  allow_all_authenticated boolean NOT NULL DEFAULT false
);
INSERT INTO parapost_groups_private.feature_gate DEFAULT VALUES;
ALTER TABLE parapost_groups_private.feature_gate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON parapost_groups_private.feature_gate FROM PUBLIC, anon, authenticated;

CREATE TABLE parapost_groups_private.test_users (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE parapost_groups_private.test_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON parapost_groups_private.test_users FROM PUBLIC,anon,authenticated;

ALTER TABLE public.group_posts ADD COLUMN published boolean NOT NULL DEFAULT false;
CREATE TABLE parapost_groups_private.media_cleanup (
  storage_path text PRIMARY KEY, queued_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE parapost_groups_private.media_cleanup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON parapost_groups_private.media_cleanup FROM PUBLIC, anon, authenticated;

CREATE FUNCTION parapost_groups_private.enabled() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid())
    AND coalesce(auth.jwt()->>'is_anonymous','false')<>'true'
    AND EXISTS (SELECT 1 FROM parapost_groups_private.feature_gate WHERE enabled
      AND (allow_all_authenticated OR EXISTS(SELECT 1 FROM parapost_groups_private.test_users WHERE user_id=auth.uid())));
$$;
CREATE FUNCTION parapost_groups_private.blocked(a uuid, b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.blocked_users WHERE (blocker_id=a AND blocked_id=b) OR (blocker_id=b AND blocked_id=a))
      OR EXISTS (SELECT 1 FROM public.user_blocks WHERE (blocker_id=a AND blocked_id=b) OR (blocker_id=b AND blocked_id=a));
$$;
-- Levels: directory, read, member, admin, moderate, owner. Denials override public visibility.
CREATE FUNCTION parapost_groups_private.allowed(gid uuid, level text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT parapost_groups_private.enabled() AND EXISTS (
   SELECT 1 FROM public.groups g LEFT JOIN public.group_members m
     ON m.group_id=g.id AND m.user_id=auth.uid()
   WHERE g.id=gid AND NOT parapost_groups_private.blocked(auth.uid(),g.owner_id)
   AND CASE level
     WHEN 'directory' THEN true
     WHEN 'read' THEN coalesce(m.status NOT IN ('rejected','removed','banned'),true)
       AND (g.visibility='public' OR m.status='approved')
     WHEN 'member' THEN m.status='approved'
     WHEN 'admin' THEN m.status='approved' AND m.role IN ('owner','admin')
     WHEN 'moderate' THEN m.status='approved' AND m.role IN ('owner','admin','moderator')
     WHEN 'owner' THEN m.status='approved' AND m.role='owner' AND g.owner_id=auth.uid()
     ELSE false END
 );
$$;

-- Queue physical object removal transactionally. Never DELETE storage.objects via SQL.
CREATE FUNCTION parapost_groups_private.queue_media_cleanup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF TG_TABLE_NAME='group_post_media' THEN
   INSERT INTO parapost_groups_private.media_cleanup(storage_path) VALUES (OLD.storage_path) ON CONFLICT DO NOTHING;
 ELSE
   IF OLD.cover_storage_path IS NOT NULL AND (TG_OP='DELETE' OR OLD.cover_storage_path IS DISTINCT FROM NEW.cover_storage_path) THEN
     INSERT INTO parapost_groups_private.media_cleanup(storage_path) VALUES (OLD.cover_storage_path) ON CONFLICT DO NOTHING;
   END IF;
 END IF;
 RETURN OLD;
END; $$;
CREATE TRIGGER groups_queue_cover AFTER UPDATE OR DELETE ON public.groups FOR EACH ROW EXECUTE FUNCTION parapost_groups_private.queue_media_cleanup();
CREATE TRIGGER groups_queue_media AFTER DELETE ON public.group_post_media FOR EACH ROW EXECUTE FUNCTION parapost_groups_private.queue_media_cleanup();

CREATE FUNCTION parapost_groups_private.guard_owner_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 -- Parent is already absent during a legitimate ON DELETE CASCADE.
 IF OLD.role='owner' AND EXISTS(SELECT 1 FROM public.groups WHERE id=OLD.group_id) THEN
   RAISE EXCEPTION 'Delete the Group instead of its owner membership';
 END IF;
 RETURN OLD;
END; $$;
CREATE TRIGGER group_members_protect_owner_delete BEFORE DELETE ON public.group_members FOR EACH ROW EXECUTE FUNCTION parapost_groups_private.guard_owner_delete();

-- Retire old entry points; keep their implementations as preserved draft history.
REVOKE EXECUTE ON FUNCTION public.request_group_membership(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.review_group_membership(uuid,uuid,text) FROM authenticated;

CREATE FUNCTION parapost_groups_private.command(action text, gid uuid, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 uid uuid := auth.uid(); g public.groups; m public.group_members; p public.group_posts;
 target uuid; pid uuid; mid uuid; path text; mime text; role_name text; result jsonb; item record;
BEGIN
 IF NOT parapost_groups_private.enabled() THEN RAISE EXCEPTION 'Groups unavailable' USING ERRCODE='42501'; END IF;
 IF action='create' THEN
   IF (SELECT count(*) FROM public.groups WHERE owner_id=uid)>=100 THEN RAISE EXCEPTION 'Group creation limit reached'; END IF;
   INSERT INTO public.groups(owner_id,name,description,visibility)
   VALUES(uid,btrim(payload->>'name'),coalesce(payload->>'description',''),coalesce(payload->>'visibility','public')) RETURNING * INTO g;
   RETURN jsonb_build_object('id',g.id);
 END IF;
 -- Group lock serializes ALL writes, including membership removal vs publish/role changes.
 SELECT * INTO g FROM public.groups WHERE id=gid FOR UPDATE;
 IF NOT FOUND OR NOT parapost_groups_private.allowed(gid,'directory') THEN RAISE EXCEPTION 'Group unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM public.group_members WHERE group_id=gid AND user_id=uid;
 IF action='join' THEN
   IF m.status IS NOT NULL THEN
     IF m.status NOT IN ('pending','approved') THEN RAISE EXCEPTION 'Membership unavailable'; END IF;
   ELSE
     INSERT INTO public.group_members(group_id,user_id,role,status,approved_at)
     VALUES(gid,uid,'member',CASE WHEN g.visibility='public' THEN 'approved' ELSE 'pending' END,CASE WHEN g.visibility='public' THEN now() END);
   END IF;
 ELSIF action='leave' THEN
   IF m.role='owner' THEN RAISE EXCEPTION 'Owner must delete the Group; transfer is not supported'; END IF;
   -- Only voluntary departures remove the row. Removed/banned/rejected rows persist.
   DELETE FROM public.group_members WHERE group_id=gid AND user_id=uid AND status IN ('pending','approved');
 ELSIF action IN ('approve','reject','remove','ban','role','restore') THEN
   target := (payload->>'user_id')::uuid;
   IF NOT parapost_groups_private.allowed(gid,'admin') OR target=uid OR target=g.owner_id THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
   SELECT * INTO m FROM public.group_members WHERE group_id=gid AND user_id=target;
   IF NOT FOUND THEN RAISE EXCEPTION 'Membership unavailable'; END IF;
   IF NOT parapost_groups_private.allowed(gid,'owner') AND (m.role <> 'member' OR action IN ('role','restore')) THEN RAISE EXCEPTION 'Owner permission required'; END IF;
   IF action IN ('approve','restore') AND parapost_groups_private.blocked(uid,target) THEN RAISE EXCEPTION 'Membership unavailable'; END IF;
   IF action IN ('approve','restore') AND parapost_groups_private.blocked(g.owner_id,target) THEN RAISE EXCEPTION 'Membership unavailable'; END IF;
   IF action IN ('approve','reject') THEN
     IF m.status <> 'pending' THEN RAISE EXCEPTION 'Request is no longer pending'; END IF;
     UPDATE public.group_members SET status=CASE WHEN action='approve' THEN 'approved' ELSE 'rejected' END,
       approved_at=CASE WHEN action='approve' THEN now() END WHERE group_id=gid AND user_id=target;
   ELSIF action='role' THEN
     role_name := payload->>'role';
     IF m.status <> 'approved' OR role_name IS NULL OR role_name NOT IN ('admin','moderator','member') THEN RAISE EXCEPTION 'Invalid role change'; END IF;
     UPDATE public.group_members SET role=role_name WHERE group_id=gid AND user_id=target;
   ELSIF action='restore' THEN
     IF m.status NOT IN ('removed','rejected','banned') THEN RAISE EXCEPTION 'Invalid restoration'; END IF;
     -- Restoration requires owner action AND a fresh approval, never immediate access.
     UPDATE public.group_members SET role='member',status='pending',approved_at=NULL WHERE group_id=gid AND user_id=target;
   ELSE
     UPDATE public.group_members SET role='member',status=CASE WHEN action='ban' THEN 'banned' ELSE 'removed' END,approved_at=NULL WHERE group_id=gid AND user_id=target;
   END IF;
 ELSIF action='edit' THEN
   IF NOT parapost_groups_private.allowed(gid,'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
   -- Privacy changes are owner-only. Existing approvals survive; pending requests stay pending.
   IF payload->>'visibility' IS DISTINCT FROM g.visibility AND NOT parapost_groups_private.allowed(gid,'owner') THEN RAISE EXCEPTION 'Owner permission required'; END IF;
   UPDATE public.groups SET name=btrim(payload->>'name'),description=coalesce(payload->>'description',''),visibility=payload->>'visibility',updated_at=now() WHERE id=gid;
 ELSIF action='delete' THEN
   IF NOT parapost_groups_private.allowed(gid,'owner') OR payload->>'confirmation' IS DISTINCT FROM g.name THEN RAISE EXCEPTION 'Owner and Group name confirmation required'; END IF;
   DELETE FROM public.groups WHERE id=gid;
 ELSIF action='draft' THEN
   IF NOT parapost_groups_private.allowed(gid,'member') THEN RAISE EXCEPTION 'Approved membership required'; END IF;
   IF (SELECT count(*) FROM public.group_posts WHERE group_id=gid AND author_id=uid AND NOT published)>=10 THEN RAISE EXCEPTION 'Too many unfinished uploads'; END IF;
   INSERT INTO public.group_posts(group_id,author_id,content) VALUES(gid,uid,coalesce(payload->>'content','')) RETURNING id INTO pid;
   RETURN jsonb_build_object('id',pid);
 ELSIF action IN ('reserve_media','publish','edit_post','delete_post') THEN
   pid := (payload->>'post_id')::uuid;
   SELECT * INTO p FROM public.group_posts WHERE id=pid AND group_id=gid;
   IF NOT FOUND OR p.is_deleted THEN RAISE EXCEPTION 'Post unavailable'; END IF;
   IF NOT parapost_groups_private.allowed(gid,'member') OR (p.author_id<>uid AND NOT (action='delete_post' AND parapost_groups_private.allowed(gid,'moderate'))) THEN RAISE EXCEPTION 'Not authorized'; END IF;
   IF action='delete_post' THEN
     DELETE FROM public.group_posts WHERE id=pid;
   ELSIF action='edit_post' THEN
     IF char_length(btrim(coalesce(payload->>'content','')))=0 AND NOT EXISTS(SELECT 1 FROM public.group_post_media WHERE post_id=pid) THEN RAISE EXCEPTION 'Post cannot be empty'; END IF;
     UPDATE public.group_posts SET content=coalesce(payload->>'content',''),updated_at=now() WHERE id=pid;
   ELSIF action='reserve_media' THEN
     IF p.published OR (SELECT count(*) FROM public.group_post_media WHERE post_id=pid)>=4 THEN RAISE EXCEPTION 'Media limit or published post'; END IF;
     mime := payload->>'mime_type';
     IF mime IS NULL OR mime NOT IN ('image/jpeg','image/png','image/webp','video/mp4','video/webm') THEN RAISE EXCEPTION 'Unsupported media'; END IF;
     mid := gen_random_uuid();
     path := gid::text || '/posts/' || pid::text || '/' || uid::text || '/' || mid::text;
     INSERT INTO public.group_post_media(id,group_id,post_id,uploader_id,media_type,storage_path,mime_type,display_order)
     VALUES(mid,gid,pid,uid,CASE WHEN mime LIKE 'image/%' THEN 'image' ELSE 'video' END,path,mime,(SELECT count(*) FROM public.group_post_media WHERE post_id=pid));
     RETURN jsonb_build_object('path',path);
   ELSE
     IF p.published THEN RETURN jsonb_build_object('id',pid); END IF;
     IF char_length(btrim(p.content))=0 AND NOT EXISTS(SELECT 1 FROM public.group_post_media WHERE post_id=pid) THEN RAISE EXCEPTION 'Post cannot be empty'; END IF;
     FOR item IN SELECT * FROM public.group_post_media WHERE post_id=pid LOOP
       IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='group-media' AND o.name=item.storage_path
         AND o.metadata->>'mimetype'=item.mime_type AND (o.metadata->>'size')::bigint BETWEEN 1 AND CASE WHEN item.media_type='image' THEN 8388608 ELSE 33554432 END) THEN RAISE EXCEPTION 'Media upload incomplete or invalid'; END IF;
     END LOOP;
     UPDATE public.group_posts SET published=true,updated_at=now() WHERE id=pid;
   END IF;
 ELSIF action='remove_cover' THEN
   IF NOT parapost_groups_private.allowed(gid,'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
   UPDATE public.groups SET cover_storage_path=NULL,updated_at=now() WHERE id=gid;
 ELSIF action='reserve_cover' THEN
   IF NOT parapost_groups_private.allowed(gid,'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
   IF (SELECT count(*) FROM parapost_groups_private.cover_uploads WHERE group_id=gid AND uploader_id=uid)>=10 THEN RAISE EXCEPTION 'Too many unfinished covers'; END IF;
   -- Covers are intentionally directory metadata, including those for private Groups.
   path := gid::text || '/covers/' || gen_random_uuid()::text;
   INSERT INTO parapost_groups_private.cover_uploads(storage_path,group_id,uploader_id) VALUES(path,gid,uid);
   RETURN jsonb_build_object('path',path);
 ELSIF action='set_cover' THEN
   path := payload->>'path';
   IF NOT parapost_groups_private.allowed(gid,'admin') OR NOT EXISTS(SELECT 1 FROM parapost_groups_private.cover_uploads c JOIN storage.objects o ON o.name=c.storage_path AND o.bucket_id='group-media'
     WHERE c.storage_path=path AND c.group_id=gid AND c.uploader_id=uid AND o.metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp') AND (o.metadata->>'size')::bigint BETWEEN 1 AND 8388608) THEN RAISE EXCEPTION 'Invalid cover'; END IF;
   UPDATE public.groups SET cover_storage_path=path,updated_at=now() WHERE id=gid;
   DELETE FROM parapost_groups_private.cover_uploads WHERE storage_path=path;
 ELSE RAISE EXCEPTION 'Unknown Group action';
 END IF;
 RETURN jsonb_build_object('id',gid);
END; $$;

CREATE TABLE parapost_groups_private.cover_uploads (
 storage_path text PRIMARY KEY, group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
 uploader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE parapost_groups_private.cover_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON parapost_groups_private.cover_uploads FROM PUBLIC, anon, authenticated;
-- Cover reservations are queued too, but never clean an actively attached cover.
CREATE FUNCTION parapost_groups_private.queue_cover_reservation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.groups WHERE cover_storage_path=OLD.storage_path) THEN
   INSERT INTO parapost_groups_private.media_cleanup(storage_path) VALUES(OLD.storage_path) ON CONFLICT DO NOTHING;
 END IF;
 RETURN OLD;
END; $$;
CREATE TRIGGER groups_queue_cover_reservation AFTER DELETE ON parapost_groups_private.cover_uploads FOR EACH ROW EXECUTE FUNCTION parapost_groups_private.queue_cover_reservation();

CREATE FUNCTION public.groups_available() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT parapost_groups_private.enabled();
$$;
REVOKE ALL ON FUNCTION public.groups_available() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.groups_available() TO authenticated;

CREATE FUNCTION public.groups_command(p_action text,p_group_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT parapost_groups_private.command(p_action,p_group_id,p_payload);
$$;

CREATE FUNCTION public.groups_directory(p_search text DEFAULT '',p_filter text DEFAULT 'all',p_group_id uuid DEFAULT NULL,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) FROM (
   SELECT g.*,coalesce(pr.display_name,pr.username,'Member') AS owner_name,
     m.status AS membership_status,m.role AS membership_role,
     (SELECT count(*) FROM public.group_members c WHERE c.group_id=g.id AND c.status='approved' AND NOT parapost_groups_private.blocked(c.user_id,g.owner_id)) AS member_count
   FROM public.groups g LEFT JOIN public.group_members m ON m.group_id=g.id AND m.user_id=auth.uid()
   LEFT JOIN public.profiles pr ON pr.id=g.owner_id
   WHERE parapost_groups_private.allowed(g.id,'directory') AND (p_group_id IS NULL OR g.id=p_group_id)
     AND (p_filter='all' OR p_filter=g.visibility OR (p_filter='mine' AND m.status='approved'))
     AND (g.name || ' ' || g.description) ILIKE '%' || left(coalesce(p_search,''),100) || '%'
   ORDER BY g.created_at DESC,g.id LIMIT 24 OFFSET greatest(0,least(coalesce(p_offset,0),100000))
 ) x;
$$;
CREATE FUNCTION public.groups_members(p_group_id uuid,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) FROM (
   SELECT m.*,coalesce(p.display_name,p.username,'Member') AS display_name
   FROM public.group_members m LEFT JOIN public.profiles p ON p.id=m.user_id
   WHERE m.group_id=p_group_id AND parapost_groups_private.allowed(p_group_id,'admin')
   ORDER BY (m.status='pending') DESC,m.created_at,m.user_id LIMIT 50 OFFSET greatest(0,least(coalesce(p_offset,0),100000))
 ) x;
$$;

-- SELECT-only data API. No direct table writes, even when a caller guesses IDs.
GRANT SELECT ON public.groups,public.group_members,public.group_posts,public.group_post_media TO authenticated;
CREATE POLICY groups_read ON public.groups FOR SELECT TO authenticated USING(parapost_groups_private.allowed(id,'directory'));
CREATE POLICY group_members_read ON public.group_members FOR SELECT TO authenticated USING(parapost_groups_private.allowed(group_id,'directory') AND (user_id=auth.uid() OR parapost_groups_private.allowed(group_id,'admin')));
CREATE POLICY group_posts_read ON public.group_posts FOR SELECT TO authenticated USING(NOT is_deleted AND parapost_groups_private.allowed(group_id,'read') AND (published OR (author_id=auth.uid() AND parapost_groups_private.allowed(group_id,'member'))));
CREATE POLICY group_post_media_read ON public.group_post_media FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.group_posts p WHERE p.id=post_id AND p.group_id=group_post_media.group_id));

CREATE FUNCTION parapost_groups_private.storage_allowed(path text, operation text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT parapost_groups_private.enabled() AND (
   CASE WHEN operation='read' THEN
     EXISTS(SELECT 1 FROM public.groups g WHERE g.cover_storage_path=path AND parapost_groups_private.allowed(g.id,'directory'))
     OR EXISTS(SELECT 1 FROM public.group_post_media m JOIN public.group_posts p ON p.id=m.post_id AND p.group_id=m.group_id
       WHERE m.storage_path=path AND NOT p.is_deleted AND parapost_groups_private.allowed(p.group_id,'read')
       AND (p.published OR (p.author_id=auth.uid() AND parapost_groups_private.allowed(p.group_id,'member'))))
   WHEN operation='insert' THEN
     EXISTS(SELECT 1 FROM parapost_groups_private.cover_uploads c WHERE c.storage_path=path AND c.uploader_id=auth.uid() AND c.created_at>now()-interval '1 hour' AND parapost_groups_private.allowed(c.group_id,'admin'))
     OR EXISTS(SELECT 1 FROM public.group_post_media m JOIN public.group_posts p ON p.id=m.post_id AND p.group_id=m.group_id
       WHERE m.storage_path=path AND m.uploader_id=auth.uid() AND p.author_id=auth.uid() AND NOT p.published AND NOT p.is_deleted AND p.created_at>now()-interval '1 hour' AND parapost_groups_private.allowed(p.group_id,'member'))
   ELSE false END
 );
$$;
UPDATE storage.buckets SET file_size_limit=33554432,allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm'] WHERE id='group-media' AND NOT public;
-- Prevent client changes to bucket privacy/configuration even under legacy policies.
CREATE POLICY groups_bucket_insert_guard ON storage.buckets AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK(id<>'group-media');
CREATE POLICY groups_bucket_update_guard ON storage.buckets AS RESTRICTIVE FOR UPDATE TO PUBLIC USING(id<>'group-media') WITH CHECK(id<>'group-media');
CREATE POLICY groups_bucket_delete_guard ON storage.buckets AS RESTRICTIVE FOR DELETE TO PUBLIC USING(id<>'group-media');
-- Restrictive policies AND against every legacy permissive policy. Other buckets unchanged.
CREATE POLICY groups_storage_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO PUBLIC USING(bucket_id<>'group-media' OR (storage.allow_only_operation('object.get_authenticated') AND parapost_groups_private.storage_allowed(name,'read')));
CREATE POLICY groups_storage_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK(bucket_id<>'group-media' OR (storage.allow_only_operation('object.upload') AND parapost_groups_private.storage_allowed(name,'insert')));
CREATE POLICY groups_storage_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC USING(bucket_id<>'group-media') WITH CHECK(bucket_id<>'group-media');
CREATE POLICY groups_storage_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC USING(bucket_id<>'group-media');
CREATE POLICY groups_storage_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='group-media' AND parapost_groups_private.storage_allowed(name,'read'));
CREATE POLICY groups_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='group-media' AND parapost_groups_private.storage_allowed(name,'insert'));

-- Harden all private functions, including draft functions and trigger entry points.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA parapost_groups_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA parapost_groups_private TO anon,authenticated;
GRANT EXECUTE ON FUNCTION parapost_groups_private.allowed(uuid,text),parapost_groups_private.storage_allowed(text,text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.groups_command(text,uuid,jsonb),public.groups_directory(text,text,uuid,integer),public.groups_members(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.groups_command(text,uuid,jsonb),public.groups_directory(text,text,uuid,integer),public.groups_members(uuid,integer) TO authenticated;

-- Operational cleanup API: executable only by service_role, never a browser role.
-- The accompanying script refuses production. Do not run without explicit approval.
CREATE FUNCTION public.groups_cleanup_batch() RETURNS SETOF text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target record;
BEGIN
 FOR target IN SELECT g.id FROM public.groups g
 WHERE EXISTS(SELECT 1 FROM public.group_posts p WHERE p.group_id=g.id AND NOT p.published AND p.created_at<now()-interval '24 hours')
    OR EXISTS(SELECT 1 FROM parapost_groups_private.cover_uploads c WHERE c.group_id=g.id AND c.created_at<now()-interval '24 hours')
 ORDER BY g.id LIMIT 100 FOR UPDATE LOOP
   DELETE FROM public.group_posts WHERE group_id=target.id AND NOT published AND created_at<now()-interval '24 hours';
   DELETE FROM parapost_groups_private.cover_uploads WHERE group_id=target.id AND created_at<now()-interval '24 hours';
 END LOOP;
 RETURN QUERY SELECT q.storage_path FROM parapost_groups_private.media_cleanup q
 WHERE q.queued_at<now()-interval '24 hours'
   AND NOT EXISTS(SELECT 1 FROM public.groups g WHERE g.cover_storage_path=q.storage_path)
   AND NOT EXISTS(SELECT 1 FROM public.group_post_media m WHERE m.storage_path=q.storage_path)
   AND NOT EXISTS(SELECT 1 FROM parapost_groups_private.cover_uploads c WHERE c.storage_path=q.storage_path)
 ORDER BY q.queued_at LIMIT 100;
END; $$;
CREATE FUNCTION public.groups_cleanup_ack(p_paths text[]) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 DELETE FROM parapost_groups_private.media_cleanup WHERE storage_path=ANY(p_paths);
$$;
REVOKE ALL ON FUNCTION public.groups_cleanup_batch(),public.groups_cleanup_ack(text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.groups_cleanup_batch(),public.groups_cleanup_ack(text[]) TO service_role;

COMMIT;

-- DISPOSABLE LOCAL POSTGRES ONLY. Minimal Supabase-shaped fixtures, not hosted services.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA cv_test;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,is_anonymous boolean DEFAULT false,banned_until timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;
CREATE TABLE public.blocked_users(blocker_id uuid,blocked_id uuid);
CREATE TABLE public.user_blocks(blocker_id uuid,blocked_id uuid);
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,bucket_id text REFERENCES storage.buckets(id),name text,UNIQUE(bucket_id,name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated;
-- Deliberately permissive legacy policies: new bucket boundaries must override them.
CREATE POLICY legacy_storage ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);
CREATE TABLE cv_test.results(label text PRIMARY KEY);
CREATE FUNCTION cv_test.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
 INSERT INTO cv_test.results VALUES(label); END; $$;
CREATE FUNCTION cv_test.denied(statement text,expected text,label text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE code text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE; END;
 PERFORM cv_test.ok(code=expected,label);
END; $$;
GRANT USAGE ON SCHEMA cv_test TO anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA cv_test TO anon,authenticated;




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."are_parapost_friends"("user_a" "uuid", "user_b" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.friend_requests fr
    where fr.status = 'accepted'
      and (
        (fr.sender_id = user_a and fr.receiver_id = user_b)
        or
        (fr.sender_id = user_b and fr.receiver_id = user_a)
      )
  );
$$;


ALTER FUNCTION "public"."are_parapost_friends"("user_a" "uuid", "user_b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_official_parapost_member_badge_for_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_badge_id uuid;
begin
  select b.id
  into v_badge_id
  from public.badges b
  where b.slug = 'official-parapost-network-member'
    and b.is_active = true
  limit 1;

  -- Never interrupt profile creation if the badge catalog
  -- becomes unavailable unexpectedly.
  if v_badge_id is null then
    raise warning
      'The Official Parapost Network Member badge could not be found.';

    return new;
  end if;

  insert into public.user_badges (
    user_id,
    badge_id
  )
  values (
    new.id,
    v_badge_id
  )
  on conflict (user_id, badge_id) do nothing;

  return new;

exception
  when others then
    -- Preserve account creation even if a badge issue occurs.
    raise warning
      'Could not award the Official Parapost Network Member badge: %',
      sqlerrm;

    return new;
end;
$$;


ALTER FUNCTION "public"."award_official_parapost_member_badge_for_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_moderation_dashboard"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
    and au.role in ('owner', 'admin', 'support', 'moderator')
  );
$$;


ALTER FUNCTION "public"."can_access_moderation_dashboard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_support_inbox"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
    and au.role in ('owner', 'admin', 'support')
  );
$$;


ALTER FUNCTION "public"."can_access_support_inbox"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_hide_direct_conversation"("conversation_id_input" "uuid", "user_id_input" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    user_id_input = auth.uid()
    and exists (
      select 1
      from public.direct_conversations dc
      where dc.id = conversation_id_input
        and (
          dc.user_one_id = user_id_input
          or dc.user_two_id = user_id_input
        )
    );
$$;


ALTER FUNCTION "public"."can_hide_direct_conversation"("conversation_id_input" "uuid", "user_id_input" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_admin_users"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
    and au.role in ('owner', 'admin')
  );
$$;


ALTER FUNCTION "public"."can_manage_admin_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_read_live_stream_chat"("p_live_stream_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.live_streams ls
    where ls.id = p_live_stream_id
      and (
        ls.user_id = auth.uid()
        or (
          ls.visibility = 'public'
          and coalesce(ls.is_hidden, false) = false
        )
      )
  );
$$;


ALTER FUNCTION "public"."can_read_live_stream_chat"("p_live_stream_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_send_direct_message"("p_conversation_id" "uuid", "p_sender_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    exists (
      select 1
      from public.direct_conversation_participants dcp
      where dcp.conversation_id = p_conversation_id
      and dcp.user_id = p_sender_id
    )
    and not exists (
      select 1
      from public.direct_conversation_participants other_participant
      join public.blocked_users b
        on (
          (b.blocker_id = p_sender_id and b.blocked_id = other_participant.user_id)
          or
          (b.blocker_id = other_participant.user_id and b.blocked_id = p_sender_id)
        )
      where other_participant.conversation_id = p_conversation_id
      and other_participant.user_id <> p_sender_id
    );
$$;


ALTER FUNCTION "public"."can_send_direct_message"("p_conversation_id" "uuid", "p_sender_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_comment_like_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  comment_owner_id uuid;
  comment_post_id uuid;
begin
  select user_id, post_id
  into comment_owner_id, comment_post_id
  from comments
  where id = new.comment_id;

  if comment_owner_id is not null and comment_owner_id <> new.user_id then
    insert into notifications (
      user_id,
      actor_id,
      type,
      post_id,
      comment_id,
      message
    )
    values (
      comment_owner_id,
      new.user_id,
      'comment_like',
      comment_post_id,
      new.comment_id,
      'liked your comment'
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."create_comment_like_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_comment_reply_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  parent_owner_id uuid;
begin
  if new.parent_comment_id is not null then
    select user_id
    into parent_owner_id
    from comments
    where id = new.parent_comment_id;

    if parent_owner_id is not null and parent_owner_id <> new.user_id then
      insert into notifications (
        user_id,
        actor_id,
        type,
        post_id,
        comment_id,
        message
      )
      values (
        parent_owner_id,
        new.user_id,
        'comment_reply',
        new.post_id,
        new.id,
        'replied to your comment'
      );
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."create_comment_reply_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_friend_accept_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  insert into notifications (
    user_id,
    actor_id,
    type,
    message
  )
  values (
    new.friend_id,
    new.user_id,
    'friend_accept',
    'accepted your friend request'
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."create_friend_accept_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_friend_request_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  insert into notifications (
    user_id,
    actor_id,
    type,
    friend_request_id,
    message
  )
  values (
    new.receiver_id,
    new.sender_id,
    'friend_request',
    new.id,
    'sent you a friend request'
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."create_friend_request_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_post_like_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  post_owner_id uuid;
begin
  select user_id
  into post_owner_id
  from posts
  where id = new.post_id;

  if post_owner_id is not null and post_owner_id <> new.user_id then
    insert into notifications (
      user_id,
      actor_id,
      type,
      post_id,
      message
    )
    values (
      post_owner_id,
      new.user_id,
      'post_like',
      new.post_id,
      'liked your post'
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."create_post_like_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_direct_conversation"("other_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  current_user_id uuid;
  existing_conversation_id uuid;
  new_conversation_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if other_user_id is null then
    raise exception 'missing_other_user';
  end if;

  if other_user_id = current_user_id then
    raise exception 'cannot_message_yourself';
  end if;

  if not public.are_parapost_friends(current_user_id, other_user_id) then
    raise exception 'friends_only_parachat';
  end if;

  select dc.id
    into existing_conversation_id
  from public.direct_conversations dc
  where (
    (
      dc.user_one_id = current_user_id
      and dc.user_two_id = other_user_id
    )
    or
    (
      dc.user_one_id = other_user_id
      and dc.user_two_id = current_user_id
    )
  )
  limit 1;

  if existing_conversation_id is not null then
    return existing_conversation_id;
  end if;

  if public.is_blocked_between(current_user_id, other_user_id) then
    raise exception 'blocked_parachat';
  end if;

  insert into public.direct_conversations (
    user_one_id,
    user_two_id,
    created_at,
    updated_at
  )
  values (
    current_user_id,
    other_user_id,
    pg_catalog.now(),
    pg_catalog.now()
  )
  returning id into new_conversation_id;

  return new_conversation_id;
end;
$$;


ALTER FUNCTION "public"."get_or_create_direct_conversation"("other_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_community_reach"("target_user_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select count(*)::integer
  from (
    select f.follower_id as person_id
    from public.followers f
    where f.following_id = target_user_id
      and f.follower_id is not null
      and f.follower_id <> target_user_id

    union

    select fr.receiver_id as person_id
    from public.friend_requests fr
    where fr.status = 'accepted'
      and fr.sender_id = target_user_id
      and fr.receiver_id is not null
      and fr.receiver_id <> target_user_id

    union

    select fr.sender_id as person_id
    from public.friend_requests fr
    where fr.status = 'accepted'
      and fr.receiver_id = target_user_id
      and fr.sender_id is not null
      and fr.sender_id <> target_user_id
  ) unique_people;
$$;


ALTER FUNCTION "public"."get_user_community_reach"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_live_stream_views"("target_stream_id" "uuid") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  next_views bigint;
begin
  update public.live_streams
  set views = coalesce(views, 0) + 1
  where id = target_stream_id
    and coalesce(is_hidden, false) = false
    and status in ('live', 'ended')
  returning views into next_views;

  return coalesce(next_views, 0);
end;
$$;


ALTER FUNCTION "public"."increment_live_stream_views"("target_stream_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_blocked_between"("user_a" "uuid", "user_b" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.blocked_users
    where
      (blocker_id = user_a and blocked_id = user_b)
      or
      (blocker_id = user_b and blocked_id = user_a)
  );
$$;


ALTER FUNCTION "public"."is_blocked_between"("user_a" "uuid", "user_b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_direct_conversation_participant"("p_conversation_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.direct_conversation_participants dcp
    where dcp.conversation_id = p_conversation_id
    and dcp.user_id = p_user_id
  );
$$;


ALTER FUNCTION "public"."is_direct_conversation_participant"("p_conversation_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_live_chat_blocked"("p_live_stream_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.live_chat_blocks b
    where b.live_stream_id = p_live_stream_id
      and b.blocked_user_id = p_user_id
  );
$$;


ALTER FUNCTION "public"."is_live_chat_blocked"("p_live_stream_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_live_chat_muted"("p_live_stream_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.live_chat_mutes m
    where m.live_stream_id = p_live_stream_id
      and m.muted_user_id = p_user_id
      and (m.expires_at is null or m.expires_at > now())
  );
$$;


ALTER FUNCTION "public"."is_live_chat_muted"("p_live_stream_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_live_stream_owner"("p_live_stream_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.live_streams ls
    where ls.id = p_live_stream_id
      and ls.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_live_stream_owner"("p_live_stream_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."live_stream_allows_comments"("p_live_stream_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.live_streams ls
    where ls.id = p_live_stream_id
      and ls.visibility = 'public'
      and coalesce(ls.is_hidden, false) = false
      and ls.status in ('live', 'ended')
  );
$$;


ALTER FUNCTION "public"."live_stream_allows_comments"("p_live_stream_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."parapost_are_accepted_friends"("user_a" "uuid", "user_b" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.friend_requests fr
    where fr.status = 'accepted'
      and (
        (fr.sender_id = user_a and fr.receiver_id = user_b)
        or
        (fr.sender_id = user_b and fr.receiver_id = user_a)
      )
  );
$$;


ALTER FUNCTION "public"."parapost_are_accepted_friends"("user_a" "uuid", "user_b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."parapost_create_conversation_for_friendship"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.status <> 'accepted' then
    return new;
  end if;

  if new.sender_id is null or new.receiver_id is null or new.sender_id = new.receiver_id then
    return new;
  end if;

  insert into public.direct_conversations (user_one_id, user_two_id, created_at, updated_at)
  select new.sender_id, new.receiver_id, now(), now()
  where not exists (
    select 1
    from public.direct_conversations dc
    where
      (dc.user_one_id = new.sender_id and dc.user_two_id = new.receiver_id)
      or
      (dc.user_one_id = new.receiver_id and dc.user_two_id = new.sender_id)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."parapost_create_conversation_for_friendship"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."parapost_enforce_friend_conversation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  jwt_role text;
begin
  jwt_role := current_setting('request.jwt.claim.role', true);

  if jwt_role = 'service_role' then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'friends_only_parachat: login required';
  end if;

  if new.user_one_id is null or new.user_two_id is null or new.user_one_id = new.user_two_id then
    raise exception 'friends_only_parachat: invalid conversation participants';
  end if;

  if auth.uid() <> new.user_one_id and auth.uid() <> new.user_two_id then
    raise exception 'friends_only_parachat: you must be a participant';
  end if;

  if not public.parapost_are_accepted_friends(new.user_one_id, new.user_two_id) then
    raise exception 'friends_only_parachat: Parachat is only available between accepted friends';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."parapost_enforce_friend_conversation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."parapost_enforce_friend_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_conversation public.direct_conversations%rowtype;
  jwt_role text;
begin
  jwt_role := current_setting('request.jwt.claim.role', true);

  if jwt_role = 'service_role' then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'friends_only_parachat: login required';
  end if;

  if new.sender_id <> auth.uid() then
    raise exception 'friends_only_parachat: sender must match logged-in user';
  end if;

  select *
  into target_conversation
  from public.direct_conversations
  where id = new.conversation_id;

  if target_conversation.id is null then
    raise exception 'friends_only_parachat: conversation not found';
  end if;

  if auth.uid() <> target_conversation.user_one_id and auth.uid() <> target_conversation.user_two_id then
    raise exception 'friends_only_parachat: you are not a participant';
  end if;

  if not public.parapost_are_accepted_friends(target_conversation.user_one_id, target_conversation.user_two_id) then
    raise exception 'friends_only_parachat: Parachat is only available between accepted friends';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."parapost_enforce_friend_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."parapost_live_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."parapost_live_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_live_chat_message_edit_timestamps"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.message is distinct from old.message then
    new.updated_at = now();
    new.edited_at = now();
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_live_chat_message_edit_timestamps"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_shares_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_shares_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_support_messages_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_support_messages_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_preferences_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_user_preferences_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_user_community_reach_achievements"("target_user_id" "uuid") RETURNS TABLE("achievement_id" "uuid", "achievement_slug" "text", "achievement_name" "text", "threshold" integer, "progress_count" integer, "unlocked_now" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if target_user_id is distinct from auth.uid() then
    raise exception 'cannot_sync_another_user';
  end if;

  return query
  select
    result.achievement_id,
    result.achievement_slug,
    result.achievement_name,
    result.threshold,
    result.progress_count,
    result.unlocked_now
  from public.sync_user_community_reach_achievements_internal(
    target_user_id
  ) as result;
end;
$$;


ALTER FUNCTION "public"."sync_user_community_reach_achievements"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_user_community_reach_achievements_internal"("target_user_id" "uuid") RETURNS TABLE("achievement_id" "uuid", "achievement_slug" "text", "achievement_name" "text", "threshold" integer, "progress_count" integer, "unlocked_now" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  reach_count integer;
  achievement_record record;
  inserted_user_achievement_id uuid;
  did_insert boolean;
begin
  if target_user_id is null then
    raise exception 'missing_target_user_id';
  end if;

  reach_count := public.get_user_community_reach(target_user_id);

  for achievement_record in
    select *
    from public.achievements a
    where a.is_active = true
      and a.category = 'community_reach'
      and a.metric_key = 'followers_friends_total'
      and a.threshold <= reach_count
    order by a.threshold asc
  loop
    inserted_user_achievement_id := null;
    did_insert := false;

    insert into public.user_achievements (
      user_id,
      achievement_id,
      progress_count,
      unlocked_at
    )
    values (
      target_user_id,
      achievement_record.id,
      reach_count,
      now()
    )
    on conflict (user_id, achievement_id) do nothing
    returning id into inserted_user_achievement_id;

    did_insert := inserted_user_achievement_id is not null;

    if did_insert then
      insert into public.achievement_activity (
        user_id,
        achievement_id,
        user_achievement_id,
        activity_type,
        message,
        created_at
      )
      values (
        target_user_id,
        achievement_record.id,
        inserted_user_achievement_id,
        'achievement_unlocked',
        'Unlocked ' || achievement_record.name || ' on Parapost Network.',
        now()
      )
      on conflict (user_id, achievement_id, activity_type) do nothing;
    else
      update public.user_achievements ua
      set progress_count = greatest(ua.progress_count, reach_count)
      where ua.user_id = target_user_id
        and ua.achievement_id = achievement_record.id;
    end if;

    achievement_id := achievement_record.id;
    achievement_slug := achievement_record.slug;
    achievement_name := achievement_record.name;
    threshold := achievement_record.threshold;
    progress_count := reach_count;
    unlocked_now := did_insert;

    return next;
  end loop;
end;
$$;


ALTER FUNCTION "public"."sync_user_community_reach_achievements_internal"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_conversation_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  update public.direct_conversations
  set updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$$;


ALTER FUNCTION "public"."update_conversation_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."friend_requests" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "sender_id" "uuid",
    "receiver_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "friend_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."friend_requests" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."accepted_friends" WITH ("security_invoker"='true') AS
 SELECT "id",
    "sender_id" AS "user_a",
    "receiver_id" AS "user_b",
    "created_at"
   FROM "public"."friend_requests"
  WHERE ("status" = 'accepted'::"text");


ALTER VIEW "public"."accepted_friends" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."achievement_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "achievement_id" "uuid" NOT NULL,
    "user_achievement_id" "uuid",
    "activity_type" "text" DEFAULT 'achievement_unlocked'::"text" NOT NULL,
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."achievement_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."achievements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text" DEFAULT 'community_reach'::"text" NOT NULL,
    "metric_key" "text" DEFAULT 'followers_friends_total'::"text" NOT NULL,
    "threshold" integer NOT NULL,
    "icon_path" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."achievements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "text" DEFAULT 'admin'::"text" NOT NULL,
    CONSTRAINT "admin_users_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'support'::"text", 'moderator'::"text"])))
);


ALTER TABLE "public"."admin_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."badge_awards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "badge_id" "uuid" NOT NULL,
    "show_on_profile" boolean DEFAULT true NOT NULL,
    "show_on_home" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."badge_awards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."badges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "color_name" "text" NOT NULL,
    "difficulty" "text" DEFAULT 'easy'::"text" NOT NULL,
    "requirement_summary" "text" NOT NULL,
    "icon_url" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "posts_to_home_feed" boolean DEFAULT false NOT NULL,
    "posts_to_profile_feed" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "icon_key" "text",
    "criteria_label" "text",
    "display_on_profile" boolean DEFAULT true,
    "display_on_homepage" boolean DEFAULT true,
    "featured_priority" boolean DEFAULT false,
    "sort_order" integer,
    CONSTRAINT "badges_difficulty_check" CHECK ((("difficulty" IS NULL) OR ("difficulty" = ANY (ARRAY['Easy'::"text", 'Medium'::"text", 'Hard'::"text", 'Elite'::"text"]))))
);


ALTER TABLE "public"."badges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blocked_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "blocked_users_no_self_block" CHECK (("blocker_id" <> "blocked_id"))
);


ALTER TABLE "public"."blocked_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comment_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "comment_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."comment_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comment_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "comment_id" "uuid" NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "comment_owner_id" "uuid" NOT NULL,
    "reason" "text" DEFAULT 'spam_or_abuse'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."comment_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "post_id" "uuid",
    "content" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "parent_comment_id" "uuid",
    "is_hidden" boolean DEFAULT false NOT NULL,
    "reply_to_user_id" "uuid"
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."direct_conversation_hides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "hidden_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."direct_conversation_hides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."direct_conversation_participants" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."direct_conversation_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."direct_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_one_id" "uuid",
    "user_two_id" "uuid"
);


ALTER TABLE "public"."direct_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."direct_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "body" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone,
    "is_read" boolean DEFAULT false,
    "message_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "image_path" "text",
    "image_mime_type" "text",
    "image_size_bytes" integer,
    "image_width" integer,
    "image_height" integer,
    CONSTRAINT "direct_messages_message_type_check" CHECK (("message_type" = ANY (ARRAY['text'::"text", 'image'::"text"])))
);


ALTER TABLE "public"."direct_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."followers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "follower_id" "uuid" NOT NULL,
    "following_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "followers_no_self_follow_check" CHECK (("follower_id" <> "following_id")),
    CONSTRAINT "no_self_follow" CHECK (("follower_id" <> "following_id"))
);


ALTER TABLE "public"."followers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."follows" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "follower_id" "uuid",
    "following_id" "uuid",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friends" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "friend_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."friends" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_one" "uuid" NOT NULL,
    "user_two" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "friendships_no_self" CHECK (("user_one" <> "user_two")),
    CONSTRAINT "friendships_sorted_pair" CHECK (("user_one" < "user_two"))
);


ALTER TABLE "public"."friendships" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."friendships_expanded" WITH ("security_invoker"='true') AS
 SELECT "friendships"."id",
    "friendships"."user_one",
    "friendships"."user_two",
    "friendships"."created_at",
    "friendships"."user_one" AS "user_id",
    "friendships"."user_two" AS "friend_id"
   FROM "public"."friendships"
UNION ALL
 SELECT "friendships"."id",
    "friendships"."user_one",
    "friendships"."user_two",
    "friendships"."created_at",
    "friendships"."user_two" AS "user_id",
    "friendships"."user_one" AS "friend_id"
   FROM "public"."friendships";


ALTER VIEW "public"."friendships_expanded" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "post_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_chat_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "live_stream_id" "uuid" NOT NULL,
    "blocked_user_id" "uuid" NOT NULL,
    "blocked_by" "uuid" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."live_chat_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_chat_message_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "live_stream_id" "uuid" NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."live_chat_message_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "live_stream_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "edited_at" timestamp with time zone,
    CONSTRAINT "live_chat_messages_message_check" CHECK ((("char_length"("btrim"("message")) >= 1) AND ("char_length"("btrim"("message")) <= 500)))
);


ALTER TABLE "public"."live_chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_chat_mutes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "live_stream_id" "uuid" NOT NULL,
    "muted_user_id" "uuid" NOT NULL,
    "muted_by" "uuid" NOT NULL,
    "reason" "text",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."live_chat_mutes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_streams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "provider" "text",
    "external_url" "text",
    "embed_url" "text",
    "thumbnail_url" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "visibility" "text" DEFAULT 'private'::"text" NOT NULL,
    "is_hidden" boolean DEFAULT true NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL,
    "scheduled_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "views" bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "live_streams_provider_check" CHECK ((("provider" IS NULL) OR ("provider" = ANY (ARRAY['youtube'::"text", 'twitch'::"text", 'facebook'::"text", 'streamyard'::"text", 'other'::"text"])))),
    CONSTRAINT "live_streams_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'upcoming'::"text", 'live'::"text", 'ended'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "live_streams_visibility_check" CHECK (("visibility" = ANY (ARRAY['private'::"text", 'friends'::"text", 'public'::"text"])))
);


ALTER TABLE "public"."live_streams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "post_id" "uuid",
    "comment_id" "uuid",
    "friend_request_id" "uuid",
    "message" "text",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reel_id" "uuid",
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['friend_request'::"text", 'friend_accept'::"text", 'post_like'::"text", 'comment_like'::"text", 'comment_reply'::"text", 'parachat_message'::"text", 'parachat_photo'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "image_url" "text" NOT NULL,
    "storage_path" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "post_images_display_order_check" CHECK ((("display_order" >= 0) AND ("display_order" <= 9)))
);


ALTER TABLE "public"."post_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "user_id" "uuid" DEFAULT "gen_random_uuid"(),
    "image_url" "text"
);


ALTER TABLE "public"."posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "reported_profile_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "details" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profile_reports_no_self_report" CHECK (("reporter_id" <> "reported_profile_id")),
    CONSTRAINT "profile_reports_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'reviewed'::"text", 'dismissed'::"text", 'action_taken'::"text"])))
);


ALTER TABLE "public"."profile_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_showcases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text",
    "cover_text" "text",
    "media_url" "text",
    "media_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "media_filename" "text",
    "font_key" "text" DEFAULT 'inter'::"text" NOT NULL,
    "text_position_x" numeric DEFAULT 50 NOT NULL,
    "text_position_y" numeric DEFAULT 50 NOT NULL,
    "overlay_font_size" integer DEFAULT 28 NOT NULL,
    "duration" "text" DEFAULT 'permanent'::"text" NOT NULL,
    "visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profile_showcases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text",
    "full_name" "text",
    "bio" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_online" boolean DEFAULT false,
    "is_private" boolean DEFAULT false,
    "display_name" "text",
    "location" "text",
    "website" "text",
    "occupation" "text",
    "paranormal_focus" "text",
    "experience_years" "text",
    "equipment" "text",
    "favorite_locations" "text",
    "availability" "text",
    "social_links" "jsonb" DEFAULT '[]'::"jsonb",
    "about_intro" "text",
    "category" "text",
    "hometown" "text",
    "relationship_status" "text",
    "company" "text",
    "education" "text",
    "email" "text",
    "phone" "text",
    "interests" "jsonb" DEFAULT '[]'::"jsonb",
    "profile_links" "jsonb" DEFAULT '[]'::"jsonb",
    "cover_url" "text",
    "cover_position_x" numeric DEFAULT 50,
    "cover_position_y" numeric DEFAULT 50,
    "last_seen_at" timestamp with time zone
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recently_viewed_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "viewer_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "viewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "recently_viewed_profiles_no_self_view" CHECK (("viewer_id" <> "profile_id"))
);


ALTER TABLE "public"."recently_viewed_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reel_comment_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "comment_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reel_comment_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reel_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reel_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_comment_id" "uuid",
    "reply_to_author" "text"
);


ALTER TABLE "public"."reel_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reel_favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reel_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reel_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reel_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reel_id" "uuid",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."reel_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reel_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reel_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "caption" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reel_shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "video_url" "text" NOT NULL,
    "caption" "text",
    "likes_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "creator_profile_id" "uuid",
    "duration_seconds" integer,
    "poster_url" "text",
    "title" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "shares" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."reels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reported_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "comment_id" "uuid" NOT NULL,
    "reported_by" "uuid" NOT NULL,
    "comment_owner_id" "uuid" NOT NULL,
    "reason" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reported_comments_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'dismissed'::"text", 'deleted'::"text"])))
);


ALTER TABLE "public"."reported_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "reported_user_id" "uuid",
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "details" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "moderator_note" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reports_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'reviewing'::"text", 'resolved'::"text", 'dismissed'::"text"]))),
    CONSTRAINT "reports_target_type_check" CHECK (("target_type" = ANY (ARRAY['profile'::"text", 'post'::"text", 'comment'::"text", 'reel'::"text", 'message'::"text"])))
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reposts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "post_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."reposts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "photo_owner_id" "uuid",
    "photo_url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."saved_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "post_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "caption" "text",
    "share_destination" "text" DEFAULT 'feed'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "user_email" "text",
    "user_name" "text",
    "topic" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "source" "text" DEFAULT 'settings'::"text" NOT NULL,
    "page_url" "text",
    "attachment_url" "text",
    "admin_notes" "text",
    "handled_by" "uuid",
    "resolved_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "support_messages_message_length_check" CHECK ((("char_length"("message") >= 5) AND ("char_length"("message") <= 5000))),
    CONSTRAINT "support_messages_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "support_messages_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_review'::"text", 'waiting'::"text", 'resolved'::"text", 'closed'::"text"]))),
    CONSTRAINT "support_messages_topic_check" CHECK (("topic" = ANY (ARRAY['account'::"text", 'privacy_safety'::"text", 'report_problem'::"text", 'data_delete_account'::"text", 'payments'::"text", 'bug_report'::"text", 'legal_policy'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."support_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_achievements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "achievement_id" "uuid" NOT NULL,
    "progress_count" integer DEFAULT 0 NOT NULL,
    "unlocked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_achievements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_badges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "badge_id" "uuid" NOT NULL,
    "awarded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "award_source" "text" DEFAULT 'system'::"text" NOT NULL,
    "award_note" "text",
    CONSTRAINT "user_badges_award_source_check" CHECK (("award_source" = ANY (ARRAY['system'::"text", 'admin'::"text", 'backfill'::"text"])))
);


ALTER TABLE "public"."user_badges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_preferences" (
    "user_id" "uuid" NOT NULL,
    "accent_color" "text" DEFAULT 'parapost-purple'::"text" NOT NULL,
    "font_style" "text" DEFAULT 'parapost-default'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_preferences" OWNER TO "postgres";


ALTER TABLE ONLY "public"."achievement_activity"
    ADD CONSTRAINT "achievement_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."achievement_activity"
    ADD CONSTRAINT "achievement_activity_unique_user_achievement" UNIQUE ("user_id", "achievement_id", "activity_type");



ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."badge_awards"
    ADD CONSTRAINT "badge_awards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."badge_awards"
    ADD CONSTRAINT "badge_awards_unique_user_badge" UNIQUE ("user_id", "badge_id");



ALTER TABLE ONLY "public"."badges"
    ADD CONSTRAINT "badges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."badges"
    ADD CONSTRAINT "badges_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."blocked_users"
    ADD CONSTRAINT "blocked_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blocked_users"
    ADD CONSTRAINT "blocked_users_unique_pair" UNIQUE ("blocker_id", "blocked_id");



ALTER TABLE ONLY "public"."comment_likes"
    ADD CONSTRAINT "comment_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comment_reports"
    ADD CONSTRAINT "comment_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."direct_conversation_hides"
    ADD CONSTRAINT "direct_conversation_hides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."direct_conversation_hides"
    ADD CONSTRAINT "direct_conversation_hides_unique_user_conversation" UNIQUE ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."direct_conversation_participants"
    ADD CONSTRAINT "direct_conversation_participants_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."direct_conversations"
    ADD CONSTRAINT "direct_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."followers"
    ADD CONSTRAINT "followers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_following_id_key" UNIQUE ("follower_id", "following_id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friends"
    ADD CONSTRAINT "friends_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_chat_blocks"
    ADD CONSTRAINT "live_chat_blocks_live_stream_id_blocked_user_id_key" UNIQUE ("live_stream_id", "blocked_user_id");



ALTER TABLE ONLY "public"."live_chat_blocks"
    ADD CONSTRAINT "live_chat_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_chat_message_likes"
    ADD CONSTRAINT "live_chat_message_likes_message_id_user_id_key" UNIQUE ("message_id", "user_id");



ALTER TABLE ONLY "public"."live_chat_message_likes"
    ADD CONSTRAINT "live_chat_message_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_chat_messages"
    ADD CONSTRAINT "live_chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_chat_mutes"
    ADD CONSTRAINT "live_chat_mutes_live_stream_id_muted_user_id_key" UNIQUE ("live_stream_id", "muted_user_id");



ALTER TABLE ONLY "public"."live_chat_mutes"
    ADD CONSTRAINT "live_chat_mutes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_streams"
    ADD CONSTRAINT "live_streams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_images"
    ADD CONSTRAINT "post_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_images"
    ADD CONSTRAINT "post_images_unique_post_order" UNIQUE ("post_id", "display_order");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_reports"
    ADD CONSTRAINT "profile_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_showcases"
    ADD CONSTRAINT "profile_showcases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."recently_viewed_profiles"
    ADD CONSTRAINT "recently_viewed_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recently_viewed_profiles"
    ADD CONSTRAINT "recently_viewed_profiles_unique" UNIQUE ("viewer_id", "profile_id");



ALTER TABLE ONLY "public"."reel_comment_likes"
    ADD CONSTRAINT "reel_comment_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reel_comments"
    ADD CONSTRAINT "reel_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reel_favorites"
    ADD CONSTRAINT "reel_favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reel_favorites"
    ADD CONSTRAINT "reel_favorites_reel_id_user_id_key" UNIQUE ("reel_id", "user_id");



ALTER TABLE ONLY "public"."reel_likes"
    ADD CONSTRAINT "reel_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reel_likes"
    ADD CONSTRAINT "reel_likes_reel_id_user_id_key" UNIQUE ("reel_id", "user_id");



ALTER TABLE ONLY "public"."reel_shares"
    ADD CONSTRAINT "reel_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reels"
    ADD CONSTRAINT "reels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reported_comments"
    ADD CONSTRAINT "reported_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reposts"
    ADD CONSTRAINT "reposts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_photos"
    ADD CONSTRAINT "saved_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_photos"
    ADD CONSTRAINT "saved_photos_user_id_post_id_key" UNIQUE ("user_id", "post_id");



ALTER TABLE ONLY "public"."shares"
    ADD CONSTRAINT "shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."followers"
    ADD CONSTRAINT "unique_follow" UNIQUE ("follower_id", "following_id");



ALTER TABLE ONLY "public"."reel_likes"
    ADD CONSTRAINT "unique_reel_like" UNIQUE ("reel_id", "user_id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_unique_user_achievement" UNIQUE ("user_id", "achievement_id");



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_unique_user_badge" UNIQUE ("user_id", "badge_id");



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "achievement_activity_user_id_idx" ON "public"."achievement_activity" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "achievements_category_idx" ON "public"."achievements" USING "btree" ("category", "display_order");



CREATE INDEX "achievements_threshold_idx" ON "public"."achievements" USING "btree" ("threshold");



CREATE UNIQUE INDEX "admin_users_user_id_unique_idx" ON "public"."admin_users" USING "btree" ("user_id");



CREATE INDEX "badge_awards_badge_id_idx" ON "public"."badge_awards" USING "btree" ("badge_id");



CREATE INDEX "badge_awards_home_idx" ON "public"."badge_awards" USING "btree" ("show_on_home", "created_at" DESC);



CREATE INDEX "badge_awards_user_id_idx" ON "public"."badge_awards" USING "btree" ("user_id");



CREATE INDEX "badges_active_order_idx" ON "public"."badges" USING "btree" ("is_active", "display_order");



CREATE INDEX "badges_slug_idx" ON "public"."badges" USING "btree" ("slug");



CREATE INDEX "blocked_users_blocked_id_idx" ON "public"."blocked_users" USING "btree" ("blocked_id");



CREATE INDEX "blocked_users_blocker_id_idx" ON "public"."blocked_users" USING "btree" ("blocker_id");



CREATE UNIQUE INDEX "comment_likes_comment_id_user_id_idx" ON "public"."comment_likes" USING "btree" ("comment_id", "user_id");



CREATE INDEX "comment_reports_comment_id_idx" ON "public"."comment_reports" USING "btree" ("comment_id");



CREATE INDEX "comment_reports_reporter_id_idx" ON "public"."comment_reports" USING "btree" ("reporter_id");



CREATE INDEX "comments_parent_comment_id_idx" ON "public"."comments" USING "btree" ("parent_comment_id");



CREATE INDEX "comments_post_id_idx" ON "public"."comments" USING "btree" ("post_id");



CREATE INDEX "comments_reply_to_user_id_idx" ON "public"."comments" USING "btree" ("reply_to_user_id");



CREATE INDEX "direct_conversation_hides_conversation_id_idx" ON "public"."direct_conversation_hides" USING "btree" ("conversation_id");



CREATE INDEX "direct_conversation_hides_user_id_idx" ON "public"."direct_conversation_hides" USING "btree" ("user_id", "hidden_at" DESC);



CREATE UNIQUE INDEX "followers_unique_pair_idx" ON "public"."followers" USING "btree" ("follower_id", "following_id");



CREATE INDEX "follows_follower_id_idx" ON "public"."follows" USING "btree" ("follower_id");



CREATE INDEX "follows_following_id_idx" ON "public"."follows" USING "btree" ("following_id");



CREATE INDEX "friend_requests_receiver_id_idx" ON "public"."friend_requests" USING "btree" ("receiver_id");



CREATE INDEX "friend_requests_receiver_idx" ON "public"."friend_requests" USING "btree" ("receiver_id");



CREATE INDEX "friend_requests_sender_id_idx" ON "public"."friend_requests" USING "btree" ("sender_id");



CREATE INDEX "friend_requests_sender_idx" ON "public"."friend_requests" USING "btree" ("sender_id");



CREATE INDEX "friend_requests_status_idx" ON "public"."friend_requests" USING "btree" ("status");



CREATE UNIQUE INDEX "friend_requests_unique_pair" ON "public"."friend_requests" USING "btree" ("sender_id", "receiver_id");



CREATE UNIQUE INDEX "friend_requests_unique_pair_pending" ON "public"."friend_requests" USING "btree" ("sender_id", "receiver_id") WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "friend_requests_unique_pending_pair" ON "public"."friend_requests" USING "btree" ("sender_id", "receiver_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "friends_friend_id_idx" ON "public"."friends" USING "btree" ("friend_id");



CREATE UNIQUE INDEX "friends_unique_pair" ON "public"."friends" USING "btree" ("user_id", "friend_id");



CREATE UNIQUE INDEX "friends_user_friend_unique_idx" ON "public"."friends" USING "btree" ("user_id", "friend_id");



CREATE INDEX "friends_user_id_idx" ON "public"."friends" USING "btree" ("user_id");



CREATE UNIQUE INDEX "friendships_unique_pair" ON "public"."friendships" USING "btree" ("user_one", "user_two");



CREATE INDEX "friendships_user_one_idx" ON "public"."friendships" USING "btree" ("user_one");



CREATE INDEX "friendships_user_two_idx" ON "public"."friendships" USING "btree" ("user_two");



CREATE INDEX "idx_blocked_users_blocked_blocker" ON "public"."blocked_users" USING "btree" ("blocked_id", "blocker_id");



CREATE INDEX "idx_blocked_users_blocker_blocked" ON "public"."blocked_users" USING "btree" ("blocker_id", "blocked_id");



CREATE INDEX "idx_followers_follower" ON "public"."followers" USING "btree" ("follower_id");



CREATE INDEX "idx_followers_follower_following" ON "public"."followers" USING "btree" ("follower_id", "following_id");



CREATE INDEX "idx_followers_following" ON "public"."followers" USING "btree" ("following_id");



CREATE INDEX "idx_friend_requests_receiver_status_sender" ON "public"."friend_requests" USING "btree" ("receiver_id", "status", "sender_id");



CREATE INDEX "idx_friend_requests_sender_status_receiver" ON "public"."friend_requests" USING "btree" ("sender_id", "status", "receiver_id");



CREATE INDEX "idx_friend_requests_status_receiver_sender" ON "public"."friend_requests" USING "btree" ("status", "receiver_id", "sender_id");



CREATE INDEX "idx_friend_requests_status_sender_receiver" ON "public"."friend_requests" USING "btree" ("status", "sender_id", "receiver_id");



CREATE INDEX "idx_live_chat_blocks_blocked_user" ON "public"."live_chat_blocks" USING "btree" ("blocked_user_id");



CREATE INDEX "idx_live_chat_blocks_stream" ON "public"."live_chat_blocks" USING "btree" ("live_stream_id");



CREATE INDEX "idx_live_chat_message_likes_message" ON "public"."live_chat_message_likes" USING "btree" ("message_id");



CREATE INDEX "idx_live_chat_message_likes_stream" ON "public"."live_chat_message_likes" USING "btree" ("live_stream_id");



CREATE INDEX "idx_live_chat_message_likes_user" ON "public"."live_chat_message_likes" USING "btree" ("user_id");



CREATE INDEX "idx_live_chat_mutes_muted_user" ON "public"."live_chat_mutes" USING "btree" ("muted_user_id");



CREATE INDEX "idx_live_chat_mutes_stream" ON "public"."live_chat_mutes" USING "btree" ("live_stream_id");



CREATE INDEX "idx_messages_conversation" ON "public"."direct_messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "idx_notifications_user_read_created" ON "public"."notifications" USING "btree" ("user_id", "is_read", "created_at" DESC);



CREATE INDEX "idx_notifications_user_read_type" ON "public"."notifications" USING "btree" ("user_id", "is_read", "type");



CREATE INDEX "idx_participants_user" ON "public"."direct_conversation_participants" USING "btree" ("user_id");



CREATE INDEX "idx_profile_showcases_public_created_desc" ON "public"."profile_showcases" USING "btree" ("created_at" DESC) WHERE ("visibility" = 'public'::"text");



CREATE INDEX "idx_profile_showcases_user_created_desc" ON "public"."profile_showcases" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_profile_showcases_user_expires_created_desc" ON "public"."profile_showcases" USING "btree" ("user_id", "expires_at", "created_at" DESC);



CREATE INDEX "idx_profile_showcases_user_visibility_created_desc" ON "public"."profile_showcases" USING "btree" ("user_id", "visibility", "created_at" DESC);



CREATE INDEX "idx_profile_showcases_user_visibility_expires_created_desc" ON "public"."profile_showcases" USING "btree" ("user_id", "visibility", "expires_at", "created_at" DESC);



CREATE INDEX "idx_profile_showcases_visibility_expires_created_desc" ON "public"."profile_showcases" USING "btree" ("visibility", "expires_at", "created_at" DESC);



CREATE INDEX "live_chat_messages_stream_created_idx" ON "public"."live_chat_messages" USING "btree" ("live_stream_id", "created_at");



CREATE INDEX "live_chat_messages_user_idx" ON "public"."live_chat_messages" USING "btree" ("user_id");



CREATE INDEX "live_streams_created_at_idx" ON "public"."live_streams" USING "btree" ("created_at" DESC);



CREATE INDEX "live_streams_is_hidden_idx" ON "public"."live_streams" USING "btree" ("is_hidden");



CREATE INDEX "live_streams_scheduled_at_idx" ON "public"."live_streams" USING "btree" ("scheduled_at" DESC);



CREATE INDEX "live_streams_status_idx" ON "public"."live_streams" USING "btree" ("status");



CREATE INDEX "live_streams_user_id_idx" ON "public"."live_streams" USING "btree" ("user_id");



CREATE INDEX "live_streams_visibility_idx" ON "public"."live_streams" USING "btree" ("visibility");



CREATE INDEX "notifications_actor_id_idx" ON "public"."notifications" USING "btree" ("actor_id");



CREATE INDEX "notifications_created_at_idx" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "notifications_is_read_idx" ON "public"."notifications" USING "btree" ("is_read");



CREATE UNIQUE INDEX "notifications_unique_friend_request" ON "public"."notifications" USING "btree" ("user_id", "actor_id", "type", "friend_request_id") WHERE (("type" = 'friend_request'::"text") AND ("friend_request_id" IS NOT NULL));



CREATE INDEX "notifications_user_id_idx" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "notifications_user_reel_type_created_idx" ON "public"."notifications" USING "btree" ("user_id", "reel_id", "type", "created_at" DESC) WHERE ("reel_id" IS NOT NULL);



CREATE INDEX "post_images_post_id_display_order_idx" ON "public"."post_images" USING "btree" ("post_id", "display_order");



CREATE INDEX "post_images_user_id_created_at_idx" ON "public"."post_images" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "profile_reports_reported_profile_id_idx" ON "public"."profile_reports" USING "btree" ("reported_profile_id");



CREATE INDEX "profile_reports_reporter_id_idx" ON "public"."profile_reports" USING "btree" ("reporter_id");



CREATE INDEX "profile_reports_status_idx" ON "public"."profile_reports" USING "btree" ("status");



CREATE INDEX "profile_showcases_created_at_idx" ON "public"."profile_showcases" USING "btree" ("created_at" DESC);



CREATE INDEX "profile_showcases_expires_at_idx" ON "public"."profile_showcases" USING "btree" ("expires_at");



CREATE INDEX "profile_showcases_user_id_created_at_idx" ON "public"."profile_showcases" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "profile_showcases_user_id_idx" ON "public"."profile_showcases" USING "btree" ("user_id");



CREATE INDEX "profile_showcases_visibility_idx" ON "public"."profile_showcases" USING "btree" ("visibility");



CREATE INDEX "profiles_last_seen_at_idx" ON "public"."profiles" USING "btree" ("last_seen_at" DESC);



CREATE INDEX "recently_viewed_profiles_profile_idx" ON "public"."recently_viewed_profiles" USING "btree" ("profile_id");



CREATE INDEX "recently_viewed_profiles_viewer_idx" ON "public"."recently_viewed_profiles" USING "btree" ("viewer_id", "viewed_at" DESC);



CREATE INDEX "reel_comment_likes_comment_id_idx" ON "public"."reel_comment_likes" USING "btree" ("comment_id");



CREATE UNIQUE INDEX "reel_comment_likes_comment_user_unique" ON "public"."reel_comment_likes" USING "btree" ("comment_id", "user_id");



CREATE INDEX "reel_comment_likes_user_id_idx" ON "public"."reel_comment_likes" USING "btree" ("user_id");



CREATE INDEX "reel_comments_parent_comment_id_idx" ON "public"."reel_comments" USING "btree" ("parent_comment_id");



CREATE INDEX "reel_comments_reel_id_created_at_idx" ON "public"."reel_comments" USING "btree" ("reel_id", "created_at" DESC);



CREATE INDEX "reel_comments_reel_id_idx" ON "public"."reel_comments" USING "btree" ("reel_id", "created_at" DESC);



CREATE INDEX "reel_comments_user_id_idx" ON "public"."reel_comments" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "reel_favorites_reel_id_created_idx" ON "public"."reel_favorites" USING "btree" ("reel_id", "created_at" DESC);



CREATE INDEX "reel_favorites_user_id_created_idx" ON "public"."reel_favorites" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "reel_likes_reel_id_idx" ON "public"."reel_likes" USING "btree" ("reel_id", "created_at" DESC);



CREATE UNIQUE INDEX "reel_likes_reel_user_unique" ON "public"."reel_likes" USING "btree" ("reel_id", "user_id");



CREATE INDEX "reel_likes_user_id_idx" ON "public"."reel_likes" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "reel_shares_created_at_idx" ON "public"."reel_shares" USING "btree" ("created_at" DESC);



CREATE INDEX "reel_shares_reel_id_idx" ON "public"."reel_shares" USING "btree" ("reel_id");



CREATE INDEX "reel_shares_user_id_idx" ON "public"."reel_shares" USING "btree" ("user_id");



CREATE INDEX "reels_created_at_idx" ON "public"."reels" USING "btree" ("created_at" DESC);



CREATE INDEX "reels_user_id_idx" ON "public"."reels" USING "btree" ("user_id");



CREATE INDEX "reported_comments_comment_id_idx" ON "public"."reported_comments" USING "btree" ("comment_id");



CREATE INDEX "reported_comments_status_idx" ON "public"."reported_comments" USING "btree" ("status");



CREATE UNIQUE INDEX "reported_comments_unique_reporter_comment" ON "public"."reported_comments" USING "btree" ("comment_id", "reported_by");



CREATE INDEX "reports_reported_user_id_idx" ON "public"."reports" USING "btree" ("reported_user_id");



CREATE INDEX "reports_reporter_id_idx" ON "public"."reports" USING "btree" ("reporter_id");



CREATE INDEX "reports_status_created_at_idx" ON "public"."reports" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "reports_target_idx" ON "public"."reports" USING "btree" ("target_type", "target_id");



CREATE INDEX "saved_photos_post_id_idx" ON "public"."saved_photos" USING "btree" ("post_id");



CREATE INDEX "saved_photos_user_id_created_at_idx" ON "public"."saved_photos" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "shares_post_id_created_at_idx" ON "public"."shares" USING "btree" ("post_id", "created_at" DESC);



CREATE INDEX "shares_user_id_created_at_idx" ON "public"."shares" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "support_messages_created_at_idx" ON "public"."support_messages" USING "btree" ("created_at" DESC);



CREATE INDEX "support_messages_priority_idx" ON "public"."support_messages" USING "btree" ("priority");



CREATE INDEX "support_messages_status_idx" ON "public"."support_messages" USING "btree" ("status");



CREATE INDEX "support_messages_topic_idx" ON "public"."support_messages" USING "btree" ("topic");



CREATE INDEX "support_messages_user_id_idx" ON "public"."support_messages" USING "btree" ("user_id");



CREATE UNIQUE INDEX "unique_user_post_like" ON "public"."likes" USING "btree" ("user_id", "post_id");



CREATE UNIQUE INDEX "unique_user_post_repost" ON "public"."reposts" USING "btree" ("user_id", "post_id");



CREATE INDEX "user_achievements_achievement_id_idx" ON "public"."user_achievements" USING "btree" ("achievement_id");



CREATE INDEX "user_achievements_user_id_idx" ON "public"."user_achievements" USING "btree" ("user_id", "unlocked_at" DESC);



CREATE INDEX "user_badges_badge_id_idx" ON "public"."user_badges" USING "btree" ("badge_id");



CREATE INDEX "user_badges_user_id_idx" ON "public"."user_badges" USING "btree" ("user_id");



CREATE INDEX "user_blocks_blocked_id_idx" ON "public"."user_blocks" USING "btree" ("blocked_id");



CREATE INDEX "user_blocks_blocked_idx" ON "public"."user_blocks" USING "btree" ("blocked_id");



CREATE UNIQUE INDEX "user_blocks_blocker_blocked_unique" ON "public"."user_blocks" USING "btree" ("blocker_id", "blocked_id");



CREATE INDEX "user_blocks_blocker_created_idx" ON "public"."user_blocks" USING "btree" ("blocker_id", "created_at" DESC);



CREATE INDEX "user_blocks_blocker_id_idx" ON "public"."user_blocks" USING "btree" ("blocker_id");



CREATE OR REPLACE TRIGGER "achievements_set_updated_at" BEFORE UPDATE ON "public"."achievements" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "award_official_parapost_member_badge_after_profile_insert" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."award_official_parapost_member_badge_for_profile"();



CREATE OR REPLACE TRIGGER "friend_requests_set_updated_at" BEFORE UPDATE ON "public"."friend_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "live_streams_set_updated_at" BEFORE UPDATE ON "public"."live_streams" FOR EACH ROW EXECUTE FUNCTION "public"."parapost_live_set_updated_at"();



CREATE OR REPLACE TRIGGER "parapost_auto_conversation_after_friendship" AFTER INSERT OR UPDATE OF "status" ON "public"."friend_requests" FOR EACH ROW EXECUTE FUNCTION "public"."parapost_create_conversation_for_friendship"();



CREATE OR REPLACE TRIGGER "parapost_friend_conversation_guard" BEFORE INSERT OR UPDATE OF "user_one_id", "user_two_id" ON "public"."direct_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."parapost_enforce_friend_conversation"();



CREATE OR REPLACE TRIGGER "parapost_friend_message_guard" BEFORE INSERT ON "public"."direct_messages" FOR EACH ROW EXECUTE FUNCTION "public"."parapost_enforce_friend_message"();



CREATE OR REPLACE TRIGGER "set_shares_updated_at" BEFORE UPDATE ON "public"."shares" FOR EACH ROW EXECUTE FUNCTION "public"."set_shares_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."friend_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_user_preferences_updated_at" BEFORE UPDATE ON "public"."user_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_preferences_updated_at"();



CREATE OR REPLACE TRIGGER "support_messages_set_updated_at" BEFORE UPDATE ON "public"."support_messages" FOR EACH ROW EXECUTE FUNCTION "public"."set_support_messages_updated_at"();



CREATE OR REPLACE TRIGGER "tr_live_chat_message_edit_timestamps" BEFORE UPDATE ON "public"."live_chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."set_live_chat_message_edit_timestamps"();



CREATE OR REPLACE TRIGGER "trg_comment_like_notification" AFTER INSERT ON "public"."comment_likes" FOR EACH ROW EXECUTE FUNCTION "public"."create_comment_like_notification"();



CREATE OR REPLACE TRIGGER "trg_comment_reply_notification" AFTER INSERT ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."create_comment_reply_notification"();



CREATE OR REPLACE TRIGGER "trg_friend_accept_notification" AFTER INSERT ON "public"."friends" FOR EACH ROW EXECUTE FUNCTION "public"."create_friend_accept_notification"();



CREATE OR REPLACE TRIGGER "trg_friend_request_notification" AFTER INSERT ON "public"."friend_requests" FOR EACH ROW EXECUTE FUNCTION "public"."create_friend_request_notification"();



CREATE OR REPLACE TRIGGER "trg_friend_requests_updated_at" BEFORE UPDATE ON "public"."friend_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_timestamp"();



CREATE OR REPLACE TRIGGER "trg_post_like_notification" AFTER INSERT ON "public"."likes" FOR EACH ROW EXECUTE FUNCTION "public"."create_post_like_notification"();



CREATE OR REPLACE TRIGGER "update_conversation_timestamp_trigger" AFTER INSERT ON "public"."direct_messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_conversation_timestamp"();



ALTER TABLE ONLY "public"."achievement_activity"
    ADD CONSTRAINT "achievement_activity_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."achievement_activity"
    ADD CONSTRAINT "achievement_activity_user_achievement_id_fkey" FOREIGN KEY ("user_achievement_id") REFERENCES "public"."user_achievements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."achievement_activity"
    ADD CONSTRAINT "achievement_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."badge_awards"
    ADD CONSTRAINT "badge_awards_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."badge_awards"
    ADD CONSTRAINT "badge_awards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blocked_users"
    ADD CONSTRAINT "blocked_users_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blocked_users"
    ADD CONSTRAINT "blocked_users_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_likes"
    ADD CONSTRAINT "comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_likes"
    ADD CONSTRAINT "comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_reports"
    ADD CONSTRAINT "comment_reports_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_reports"
    ADD CONSTRAINT "comment_reports_comment_owner_id_fkey" FOREIGN KEY ("comment_owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_reports"
    ADD CONSTRAINT "comment_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_reply_to_user_id_fkey" FOREIGN KEY ("reply_to_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_conversation_hides"
    ADD CONSTRAINT "direct_conversation_hides_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."direct_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_conversation_hides"
    ADD CONSTRAINT "direct_conversation_hides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_conversation_participants"
    ADD CONSTRAINT "direct_conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."direct_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_conversation_participants"
    ADD CONSTRAINT "direct_conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."direct_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."followers"
    ADD CONSTRAINT "followers_follower_id_profiles_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."followers"
    ADD CONSTRAINT "followers_following_id_profiles_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_one_fkey" FOREIGN KEY ("user_one") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_two_fkey" FOREIGN KEY ("user_two") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_chat_blocks"
    ADD CONSTRAINT "live_chat_blocks_blocked_by_fkey" FOREIGN KEY ("blocked_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_chat_blocks"
    ADD CONSTRAINT "live_chat_blocks_blocked_user_id_fkey" FOREIGN KEY ("blocked_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_chat_blocks"
    ADD CONSTRAINT "live_chat_blocks_live_stream_id_fkey" FOREIGN KEY ("live_stream_id") REFERENCES "public"."live_streams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_chat_message_likes"
    ADD CONSTRAINT "live_chat_message_likes_live_stream_id_fkey" FOREIGN KEY ("live_stream_id") REFERENCES "public"."live_streams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_chat_message_likes"
    ADD CONSTRAINT "live_chat_message_likes_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."live_chat_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_chat_message_likes"
    ADD CONSTRAINT "live_chat_message_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_chat_messages"
    ADD CONSTRAINT "live_chat_messages_live_stream_id_fkey" FOREIGN KEY ("live_stream_id") REFERENCES "public"."live_streams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_chat_messages"
    ADD CONSTRAINT "live_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_chat_mutes"
    ADD CONSTRAINT "live_chat_mutes_live_stream_id_fkey" FOREIGN KEY ("live_stream_id") REFERENCES "public"."live_streams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_chat_mutes"
    ADD CONSTRAINT "live_chat_mutes_muted_by_fkey" FOREIGN KEY ("muted_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_chat_mutes"
    ADD CONSTRAINT "live_chat_mutes_muted_user_id_fkey" FOREIGN KEY ("muted_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_streams"
    ADD CONSTRAINT "live_streams_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_images"
    ADD CONSTRAINT "post_images_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_images"
    ADD CONSTRAINT "post_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_reports"
    ADD CONSTRAINT "profile_reports_reported_profile_id_fkey" FOREIGN KEY ("reported_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_reports"
    ADD CONSTRAINT "profile_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_showcases"
    ADD CONSTRAINT "profile_showcases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recently_viewed_profiles"
    ADD CONSTRAINT "recently_viewed_profiles_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recently_viewed_profiles"
    ADD CONSTRAINT "recently_viewed_profiles_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reel_comment_likes"
    ADD CONSTRAINT "reel_comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."reel_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reel_comment_likes"
    ADD CONSTRAINT "reel_comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reel_comments"
    ADD CONSTRAINT "reel_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."reel_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reel_comments"
    ADD CONSTRAINT "reel_comments_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "public"."reels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reel_comments"
    ADD CONSTRAINT "reel_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reel_favorites"
    ADD CONSTRAINT "reel_favorites_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "public"."reels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reel_favorites"
    ADD CONSTRAINT "reel_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reel_likes"
    ADD CONSTRAINT "reel_likes_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "public"."reels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reel_likes"
    ADD CONSTRAINT "reel_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reel_shares"
    ADD CONSTRAINT "reel_shares_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "public"."reels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reel_shares"
    ADD CONSTRAINT "reel_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reels"
    ADD CONSTRAINT "reels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reported_comments"
    ADD CONSTRAINT "reported_comments_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reported_comments"
    ADD CONSTRAINT "reported_comments_comment_owner_id_fkey" FOREIGN KEY ("comment_owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reported_comments"
    ADD CONSTRAINT "reported_comments_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reposts"
    ADD CONSTRAINT "reposts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reposts"
    ADD CONSTRAINT "reposts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_photos"
    ADD CONSTRAINT "saved_photos_photo_owner_id_fkey" FOREIGN KEY ("photo_owner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."saved_photos"
    ADD CONSTRAINT "saved_photos_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_photos"
    ADD CONSTRAINT "saved_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shares"
    ADD CONSTRAINT "shares_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shares"
    ADD CONSTRAINT "shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone authenticated can view follows" ON "public"."follows" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone can view achievement activity" ON "public"."achievement_activity" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can view active achievements" ON "public"."achievements" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



CREATE POLICY "Anyone can view active badges" ON "public"."badges" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can view badge awards" ON "public"."badge_awards" FOR SELECT USING (true);



CREATE POLICY "Anyone can view user achievements" ON "public"."user_achievements" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can view user badges" ON "public"."user_badges" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can view allowed profile showcases" ON "public"."profile_showcases" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("visibility" = 'public'::"text") OR (("visibility" = 'friends'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."friend_requests" "fr"
  WHERE (("fr"."status" = 'accepted'::"text") AND ((("fr"."sender_id" = "auth"."uid"()) AND ("fr"."receiver_id" = "profile_showcases"."user_id")) OR (("fr"."receiver_id" = "auth"."uid"()) AND ("fr"."sender_id" = "profile_showcases"."user_id")))))))));



CREATE POLICY "Creators can remove messages from their live streams" ON "public"."live_chat_messages" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."live_streams"
  WHERE (("live_streams"."id" = "live_chat_messages"."live_stream_id") AND ("live_streams"."user_id" = "auth"."uid"())))));



CREATE POLICY "Live streams are private to owner while hidden" ON "public"."live_streams" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can block users" ON "public"."user_blocks" FOR INSERT TO "authenticated" WITH CHECK ((("blocker_id" = "auth"."uid"()) AND ("blocked_id" <> "auth"."uid"())));



CREATE POLICY "Users can create their own blocks" ON "public"."user_blocks" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "blocker_id"));



CREATE POLICY "Users can create their own follows" ON "public"."follows" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "follower_id"));



CREATE POLICY "Users can create their own friendships" ON "public"."friendships" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_one") OR ("auth"."uid"() = "user_two")));



CREATE POLICY "Users can create their own live streams" ON "public"."live_streams" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND ("status" = 'draft'::"text") AND ("visibility" = 'private'::"text") AND ("is_hidden" = true)));



CREATE POLICY "Users can delete friendships" ON "public"."friends" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "friend_id")));



CREATE POLICY "Users can delete their own follows" ON "public"."follows" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "follower_id"));



CREATE POLICY "Users can delete their own friendships" ON "public"."friendships" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "user_one") OR ("auth"."uid"() = "user_two")));



CREATE POLICY "Users can delete their own live chat messages" ON "public"."live_chat_messages" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own live streams" ON "public"."live_streams" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own preferences" ON "public"."user_preferences" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert friendships" ON "public"."friends" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own preferences" ON "public"."user_preferences" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can remove their own blocks" ON "public"."user_blocks" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "blocker_id"));



CREATE POLICY "Users can send chat while stream is live" ON "public"."live_chat_messages" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."live_streams"
  WHERE (("live_streams"."id" = "live_chat_messages"."live_stream_id") AND ("live_streams"."visibility" = 'public'::"text") AND ("live_streams"."is_hidden" = false) AND ("live_streams"."status" = 'live'::"text"))))));



CREATE POLICY "Users can unblock users" ON "public"."user_blocks" FOR DELETE TO "authenticated" USING (("blocker_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own live streams" ON "public"."live_streams" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own preferences" ON "public"."user_preferences" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own profile showcases" ON "public"."profile_showcases" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view chat for public live streams" ON "public"."live_chat_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."live_streams"
  WHERE (("live_streams"."id" = "live_chat_messages"."live_stream_id") AND ("live_streams"."visibility" = 'public'::"text") AND ("live_streams"."is_hidden" = false) AND ("live_streams"."status" = ANY (ARRAY['upcoming'::"text", 'live'::"text", 'ended'::"text"]))))));



CREATE POLICY "Users can view public visible live streams" ON "public"."live_streams" FOR SELECT TO "authenticated" USING ((("visibility" = 'public'::"text") AND ("is_hidden" = false) AND ("status" = ANY (ARRAY['upcoming'::"text", 'live'::"text", 'ended'::"text"]))));



CREATE POLICY "Users can view their blocked users" ON "public"."user_blocks" FOR SELECT TO "authenticated" USING (("blocker_id" = "auth"."uid"()));



CREATE POLICY "Users can view their friends" ON "public"."friends" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "friend_id")));



CREATE POLICY "Users can view their own blocks" ON "public"."user_blocks" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "blocker_id"));



CREATE POLICY "Users can view their own friendships" ON "public"."friendships" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_one") OR ("auth"."uid"() = "user_two")));



CREATE POLICY "Users can view their own preferences" ON "public"."user_preferences" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."achievement_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_users_delete_manager" ON "public"."admin_users" FOR DELETE TO "authenticated" USING ("public"."can_manage_admin_users"());



CREATE POLICY "admin_users_insert_manager" ON "public"."admin_users" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_manage_admin_users"() AND ("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'support'::"text", 'moderator'::"text"]))));



CREATE POLICY "admin_users_select_self_or_manager" ON "public"."admin_users" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_manage_admin_users"()));



CREATE POLICY "admin_users_update_manager" ON "public"."admin_users" FOR UPDATE TO "authenticated" USING ("public"."can_manage_admin_users"()) WITH CHECK (("public"."can_manage_admin_users"() AND ("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'support'::"text", 'moderator'::"text"]))));



ALTER TABLE "public"."badge_awards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."badges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."blocked_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blocked_users_delete_own" ON "public"."blocked_users" FOR DELETE TO "authenticated" USING (("blocker_id" = "auth"."uid"()));



CREATE POLICY "blocked_users_insert_own" ON "public"."blocked_users" FOR INSERT TO "authenticated" WITH CHECK ((("blocker_id" = "auth"."uid"()) AND ("blocker_id" <> "blocked_id")));



CREATE POLICY "blocked_users_select_involved" ON "public"."blocked_users" FOR SELECT TO "authenticated" USING ((("blocker_id" = "auth"."uid"()) OR ("blocked_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



ALTER TABLE "public"."comment_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comment_likes_delete_own" ON "public"."comment_likes" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "comment_likes_insert_own" ON "public"."comment_likes" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "comment_likes_select_all" ON "public"."comment_likes" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."comment_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comment_reports_delete_moderator" ON "public"."comment_reports" FOR DELETE TO "authenticated" USING ("public"."can_access_moderation_dashboard"());



CREATE POLICY "comment_reports_insert_reporter" ON "public"."comment_reports" FOR INSERT TO "authenticated" WITH CHECK (("reporter_id" = "auth"."uid"()));



CREATE POLICY "comment_reports_select_reporter_owner_or_moderator" ON "public"."comment_reports" FOR SELECT TO "authenticated" USING ((("reporter_id" = "auth"."uid"()) OR ("comment_owner_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



CREATE POLICY "comment_reports_update_moderator" ON "public"."comment_reports" FOR UPDATE TO "authenticated" USING ("public"."can_access_moderation_dashboard"()) WITH CHECK ("public"."can_access_moderation_dashboard"());



ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comments_delete_own_or_moderator" ON "public"."comments" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



CREATE POLICY "comments_insert_visible_post" ON "public"."comments" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE ("p"."id" = "comments"."post_id")))));



CREATE POLICY "comments_select_visible_post" ON "public"."comments" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"() OR (("is_hidden" IS NOT TRUE) AND (EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE ("p"."id" = "comments"."post_id"))))));



CREATE POLICY "comments_update_own_or_moderator" ON "public"."comments" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



ALTER TABLE "public"."direct_conversation_hides" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "direct_conversation_hides_delete_own" ON "public"."direct_conversation_hides" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "direct_conversation_hides_insert_own" ON "public"."direct_conversation_hides" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."is_direct_conversation_participant"("conversation_id", "auth"."uid"())));



CREATE POLICY "direct_conversation_hides_select_own" ON "public"."direct_conversation_hides" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "direct_conversation_hides_update_own" ON "public"."direct_conversation_hides" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."direct_conversation_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "direct_conversation_participants_delete_self_or_moderator" ON "public"."direct_conversation_participants" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



CREATE POLICY "direct_conversation_participants_insert_self" ON "public"."direct_conversation_participants" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "direct_conversation_participants_select_own_conversation" ON "public"."direct_conversation_participants" FOR SELECT TO "authenticated" USING (("public"."is_direct_conversation_participant"("conversation_id", "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



ALTER TABLE "public"."direct_conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "direct_conversations_delete_moderator_only" ON "public"."direct_conversations" FOR DELETE TO "authenticated" USING ("public"."can_access_moderation_dashboard"());



CREATE POLICY "direct_conversations_insert_authenticated" ON "public"."direct_conversations" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "direct_conversations_select_participant" ON "public"."direct_conversations" FOR SELECT TO "authenticated" USING (("public"."is_direct_conversation_participant"("id", "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



CREATE POLICY "direct_conversations_update_participant" ON "public"."direct_conversations" FOR UPDATE TO "authenticated" USING (("public"."is_direct_conversation_participant"("id", "auth"."uid"()) OR "public"."can_access_moderation_dashboard"())) WITH CHECK (("public"."is_direct_conversation_participant"("id", "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



ALTER TABLE "public"."direct_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "direct_messages_delete_sender_or_moderator" ON "public"."direct_messages" FOR DELETE TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



CREATE POLICY "direct_messages_insert_sender_participant" ON "public"."direct_messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND "public"."can_send_direct_message"("conversation_id", "auth"."uid"())));



CREATE POLICY "direct_messages_select_participant" ON "public"."direct_messages" FOR SELECT TO "authenticated" USING (("public"."is_direct_conversation_participant"("conversation_id", "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



CREATE POLICY "direct_messages_update_participant_or_sender" ON "public"."direct_messages" FOR UPDATE TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR "public"."is_direct_conversation_participant"("conversation_id", "auth"."uid"()) OR "public"."can_access_moderation_dashboard"())) WITH CHECK ((("sender_id" = "auth"."uid"()) OR "public"."is_direct_conversation_participant"("conversation_id", "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



ALTER TABLE "public"."followers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "followers_delete_own_or_target" ON "public"."followers" FOR DELETE TO "authenticated" USING ((("follower_id" = "auth"."uid"()) OR ("following_id" = "auth"."uid"())));



CREATE POLICY "followers_insert_own" ON "public"."followers" FOR INSERT TO "authenticated" WITH CHECK (("follower_id" = "auth"."uid"()));



CREATE POLICY "followers_select_authenticated" ON "public"."followers" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."follows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."friend_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "friend_requests_delete_involved" ON "public"."friend_requests" FOR DELETE TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



CREATE POLICY "friend_requests_insert_sender" ON "public"."friend_requests" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND ("sender_id" <> "receiver_id")));



CREATE POLICY "friend_requests_select_involved" ON "public"."friend_requests" FOR SELECT TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



CREATE POLICY "friend_requests_update_involved" ON "public"."friend_requests" FOR UPDATE TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"())) WITH CHECK ((("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



ALTER TABLE "public"."friends" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "likes_delete_own" ON "public"."likes" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "likes_insert_visible_post" ON "public"."likes" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE ("p"."id" = "likes"."post_id")))));



CREATE POLICY "likes_select_visible_post" ON "public"."likes" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE ("p"."id" = "likes"."post_id")))));



ALTER TABLE "public"."live_chat_blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "live_chat_blocks_delete_creator" ON "public"."live_chat_blocks" FOR DELETE TO "authenticated" USING ("public"."is_live_stream_owner"("live_stream_id"));



CREATE POLICY "live_chat_blocks_insert_creator" ON "public"."live_chat_blocks" FOR INSERT TO "authenticated" WITH CHECK ((("blocked_by" = "auth"."uid"()) AND ("blocked_user_id" <> "auth"."uid"()) AND "public"."is_live_stream_owner"("live_stream_id")));



CREATE POLICY "live_chat_blocks_select_owner_or_blocked" ON "public"."live_chat_blocks" FOR SELECT TO "authenticated" USING ((("blocked_user_id" = "auth"."uid"()) OR "public"."is_live_stream_owner"("live_stream_id")));



CREATE POLICY "live_chat_blocks_update_creator" ON "public"."live_chat_blocks" FOR UPDATE TO "authenticated" USING ("public"."is_live_stream_owner"("live_stream_id")) WITH CHECK ((("blocked_by" = "auth"."uid"()) AND ("blocked_user_id" <> "auth"."uid"()) AND "public"."is_live_stream_owner"("live_stream_id")));



CREATE POLICY "live_chat_likes_delete_own" ON "public"."live_chat_message_likes" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "live_chat_likes_insert_own" ON "public"."live_chat_message_likes" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."can_read_live_stream_chat"("live_stream_id") AND "public"."live_stream_allows_comments"("live_stream_id") AND (NOT "public"."is_live_chat_muted"("live_stream_id", "auth"."uid"())) AND (NOT "public"."is_live_chat_blocked"("live_stream_id", "auth"."uid"())) AND (EXISTS ( SELECT 1
   FROM "public"."live_chat_messages" "msg"
  WHERE (("msg"."id" = "live_chat_message_likes"."message_id") AND ("msg"."live_stream_id" = "msg"."live_stream_id"))))));



CREATE POLICY "live_chat_likes_select_readable" ON "public"."live_chat_message_likes" FOR SELECT TO "authenticated" USING ("public"."can_read_live_stream_chat"("live_stream_id"));



ALTER TABLE "public"."live_chat_message_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."live_chat_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "live_chat_messages_delete_own_or_creator" ON "public"."live_chat_messages" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_live_stream_owner"("live_stream_id")));



CREATE POLICY "live_chat_messages_insert_allowed" ON "public"."live_chat_messages" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."can_read_live_stream_chat"("live_stream_id") AND "public"."live_stream_allows_comments"("live_stream_id") AND (NOT "public"."is_live_chat_muted"("live_stream_id", "auth"."uid"())) AND (NOT "public"."is_live_chat_blocked"("live_stream_id", "auth"."uid"()))));



CREATE POLICY "live_chat_messages_select_readable" ON "public"."live_chat_messages" FOR SELECT TO "authenticated" USING ("public"."can_read_live_stream_chat"("live_stream_id"));



CREATE POLICY "live_chat_messages_update_own" ON "public"."live_chat_messages" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND "public"."can_read_live_stream_chat"("live_stream_id") AND (NOT "public"."is_live_chat_muted"("live_stream_id", "auth"."uid"())) AND (NOT "public"."is_live_chat_blocked"("live_stream_id", "auth"."uid"())))) WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."can_read_live_stream_chat"("live_stream_id") AND (NOT "public"."is_live_chat_muted"("live_stream_id", "auth"."uid"())) AND (NOT "public"."is_live_chat_blocked"("live_stream_id", "auth"."uid"()))));



ALTER TABLE "public"."live_chat_mutes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "live_chat_mutes_delete_creator" ON "public"."live_chat_mutes" FOR DELETE TO "authenticated" USING ("public"."is_live_stream_owner"("live_stream_id"));



CREATE POLICY "live_chat_mutes_insert_creator" ON "public"."live_chat_mutes" FOR INSERT TO "authenticated" WITH CHECK ((("muted_by" = "auth"."uid"()) AND ("muted_user_id" <> "auth"."uid"()) AND "public"."is_live_stream_owner"("live_stream_id")));



CREATE POLICY "live_chat_mutes_select_owner_or_muted" ON "public"."live_chat_mutes" FOR SELECT TO "authenticated" USING ((("muted_user_id" = "auth"."uid"()) OR "public"."is_live_stream_owner"("live_stream_id")));



CREATE POLICY "live_chat_mutes_update_creator" ON "public"."live_chat_mutes" FOR UPDATE TO "authenticated" USING ("public"."is_live_stream_owner"("live_stream_id")) WITH CHECK ((("muted_by" = "auth"."uid"()) AND ("muted_user_id" <> "auth"."uid"()) AND "public"."is_live_stream_owner"("live_stream_id")));



ALTER TABLE "public"."live_streams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_delete_own" ON "public"."notifications" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



CREATE POLICY "notifications_insert_actor" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK ((("actor_id" = "auth"."uid"()) OR ("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



CREATE POLICY "parachat_conversations_insert_own" ON "public"."direct_conversations" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_one_id") OR ("auth"."uid"() = "user_two_id")));



CREATE POLICY "parachat_conversations_select_own" ON "public"."direct_conversations" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_one_id") OR ("auth"."uid"() = "user_two_id")));



CREATE POLICY "parachat_conversations_update_own" ON "public"."direct_conversations" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_one_id") OR ("auth"."uid"() = "user_two_id"))) WITH CHECK ((("auth"."uid"() = "user_one_id") OR ("auth"."uid"() = "user_two_id")));



CREATE POLICY "parachat_hides_delete_own" ON "public"."direct_conversation_hides" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "parachat_hides_insert_own" ON "public"."direct_conversation_hides" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "parachat_hides_select_own" ON "public"."direct_conversation_hides" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "parachat_hides_update_own" ON "public"."direct_conversation_hides" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "parachat_messages_delete_own" ON "public"."direct_messages" FOR DELETE TO "authenticated" USING (("sender_id" = "auth"."uid"()));



CREATE POLICY "parachat_messages_insert_own_conversation" ON "public"."direct_messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."direct_conversations" "dc"
  WHERE (("dc"."id" = "direct_messages"."conversation_id") AND (("dc"."user_one_id" = "auth"."uid"()) OR ("dc"."user_two_id" = "auth"."uid"())))))));



CREATE POLICY "parachat_messages_select_own_conversation" ON "public"."direct_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."direct_conversations" "dc"
  WHERE (("dc"."id" = "direct_messages"."conversation_id") AND (("dc"."user_one_id" = "auth"."uid"()) OR ("dc"."user_two_id" = "auth"."uid"()))))));



CREATE POLICY "parachat_messages_update_own_or_read" ON "public"."direct_messages" FOR UPDATE TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."direct_conversations" "dc"
  WHERE (("dc"."id" = "direct_messages"."conversation_id") AND (("dc"."user_one_id" = "auth"."uid"()) OR ("dc"."user_two_id" = "auth"."uid"()))))))) WITH CHECK ((("sender_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."direct_conversations" "dc"
  WHERE (("dc"."id" = "direct_messages"."conversation_id") AND (("dc"."user_one_id" = "auth"."uid"()) OR ("dc"."user_two_id" = "auth"."uid"())))))));



ALTER TABLE "public"."post_images" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "post_images_delete_own_or_moderator" ON "public"."post_images" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



CREATE POLICY "post_images_insert_own_post" ON "public"."post_images" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE (("p"."id" = "post_images"."post_id") AND ("p"."user_id" = "auth"."uid"()))))));



CREATE POLICY "post_images_select_visible_post" ON "public"."post_images" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"() OR (EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE ("p"."id" = "post_images"."post_id")))));



CREATE POLICY "post_images_update_own_or_moderator" ON "public"."post_images" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "posts_delete_own_or_moderator" ON "public"."posts" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



CREATE POLICY "posts_insert_own" ON "public"."posts" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "posts_select_authenticated_block_safe" ON "public"."posts" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"() OR (NOT (EXISTS ( SELECT 1
   FROM "public"."blocked_users" "b"
  WHERE ((("b"."blocker_id" = "auth"."uid"()) AND ("b"."blocked_id" = "posts"."user_id")) OR (("b"."blocker_id" = "posts"."user_id") AND ("b"."blocked_id" = "auth"."uid"()))))))));



CREATE POLICY "posts_update_own_or_moderator" ON "public"."posts" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



ALTER TABLE "public"."profile_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profile_reports_delete_moderator" ON "public"."profile_reports" FOR DELETE TO "authenticated" USING ("public"."can_access_moderation_dashboard"());



CREATE POLICY "profile_reports_insert_authenticated" ON "public"."profile_reports" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "profile_reports_select_moderator" ON "public"."profile_reports" FOR SELECT TO "authenticated" USING ("public"."can_access_moderation_dashboard"());



CREATE POLICY "profile_reports_update_moderator" ON "public"."profile_reports" FOR UPDATE TO "authenticated" USING ("public"."can_access_moderation_dashboard"()) WITH CHECK ("public"."can_access_moderation_dashboard"());



ALTER TABLE "public"."profile_showcases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profile_showcases_delete_own" ON "public"."profile_showcases" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "profile_showcases_insert_own" ON "public"."profile_showcases" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("visibility" = ANY (ARRAY['public'::"text", 'friends'::"text", 'private'::"text"])) AND ("duration" = ANY (ARRAY['24h'::"text", '30d'::"text", 'permanent'::"text"]))));



CREATE POLICY "profile_showcases_select_visible" ON "public"."profile_showcases" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ((("expires_at" IS NULL) OR ("expires_at" > "now"())) AND (NOT (EXISTS ( SELECT 1
   FROM "public"."blocked_users" "b"
  WHERE ((("b"."blocker_id" = "auth"."uid"()) AND ("b"."blocked_id" = "profile_showcases"."user_id")) OR (("b"."blocker_id" = "profile_showcases"."user_id") AND ("b"."blocked_id" = "auth"."uid"())))))) AND (("visibility" = 'public'::"text") OR (("visibility" = 'friends'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."friend_requests" "fr"
  WHERE (("fr"."status" = 'accepted'::"text") AND ((("fr"."sender_id" = "auth"."uid"()) AND ("fr"."receiver_id" = "profile_showcases"."user_id")) OR (("fr"."receiver_id" = "auth"."uid"()) AND ("fr"."sender_id" = "profile_showcases"."user_id")))))))))));



CREATE POLICY "profile_showcases_update_own" ON "public"."profile_showcases" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("visibility" = ANY (ARRAY['public'::"text", 'friends'::"text", 'private'::"text"])) AND ("duration" = ANY (ARRAY['24h'::"text", '30d'::"text", 'permanent'::"text"]))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_select_authenticated_block_safe" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"() OR (NOT (EXISTS ( SELECT 1
   FROM "public"."blocked_users" "b"
  WHERE ((("b"."blocker_id" = "auth"."uid"()) AND ("b"."blocked_id" = "profiles"."id")) OR (("b"."blocker_id" = "profiles"."id") AND ("b"."blocked_id" = "auth"."uid"()))))))));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."recently_viewed_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recently_viewed_profiles_delete_own" ON "public"."recently_viewed_profiles" FOR DELETE TO "authenticated" USING (("viewer_id" = "auth"."uid"()));



CREATE POLICY "recently_viewed_profiles_insert_own" ON "public"."recently_viewed_profiles" FOR INSERT TO "authenticated" WITH CHECK (("viewer_id" = "auth"."uid"()));



CREATE POLICY "recently_viewed_profiles_select_own" ON "public"."recently_viewed_profiles" FOR SELECT TO "authenticated" USING (("viewer_id" = "auth"."uid"()));



CREATE POLICY "recently_viewed_profiles_update_own" ON "public"."recently_viewed_profiles" FOR UPDATE TO "authenticated" USING (("viewer_id" = "auth"."uid"())) WITH CHECK (("viewer_id" = "auth"."uid"()));



ALTER TABLE "public"."reel_comment_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reel_comment_likes_delete_own" ON "public"."reel_comment_likes" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "reel_comment_likes_insert_visible_comment" ON "public"."reel_comment_likes" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."reel_comments" "rc"
     JOIN "public"."reels" "r" ON (("r"."id" = "rc"."reel_id")))
  WHERE ("rc"."id" = "reel_comment_likes"."comment_id")))));



CREATE POLICY "reel_comment_likes_select_visible_comment" ON "public"."reel_comment_likes" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."reel_comments" "rc"
     JOIN "public"."reels" "r" ON (("r"."id" = "rc"."reel_id")))
  WHERE ("rc"."id" = "reel_comment_likes"."comment_id")))));



ALTER TABLE "public"."reel_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reel_comments_delete_own_or_moderator" ON "public"."reel_comments" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



CREATE POLICY "reel_comments_insert_visible_reel" ON "public"."reel_comments" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."reels" "r"
  WHERE ("r"."id" = "reel_comments"."reel_id")))));



CREATE POLICY "reel_comments_select_visible_reel" ON "public"."reel_comments" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"() OR (EXISTS ( SELECT 1
   FROM "public"."reels" "r"
  WHERE ("r"."id" = "reel_comments"."reel_id")))));



CREATE POLICY "reel_comments_update_own_or_moderator" ON "public"."reel_comments" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



ALTER TABLE "public"."reel_favorites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reel_favorites_delete_own" ON "public"."reel_favorites" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "reel_favorites_insert_own" ON "public"."reel_favorites" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "reel_favorites_select_authenticated" ON "public"."reel_favorites" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."reel_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reel_likes_delete_own" ON "public"."reel_likes" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "reel_likes_insert_visible_reel" ON "public"."reel_likes" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."reels" "r"
  WHERE ("r"."id" = "reel_likes"."reel_id")))));



CREATE POLICY "reel_likes_select_visible_reel" ON "public"."reel_likes" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."reels" "r"
  WHERE ("r"."id" = "reel_likes"."reel_id")))));



ALTER TABLE "public"."reel_shares" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reel_shares_delete_own_or_moderator" ON "public"."reel_shares" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



CREATE POLICY "reel_shares_insert_visible_reel" ON "public"."reel_shares" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."reels" "r"
  WHERE ("r"."id" = "reel_shares"."reel_id")))));



CREATE POLICY "reel_shares_select_visible_reel" ON "public"."reel_shares" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."reels" "r"
  WHERE ("r"."id" = "reel_shares"."reel_id")))));



CREATE POLICY "reel_shares_update_own_or_moderator" ON "public"."reel_shares" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



ALTER TABLE "public"."reels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reels_delete_own_or_moderator" ON "public"."reels" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("creator_profile_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



CREATE POLICY "reels_insert_own" ON "public"."reels" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (("creator_profile_id" IS NULL) OR ("creator_profile_id" = "auth"."uid"()))));



CREATE POLICY "reels_select_authenticated_block_safe" ON "public"."reels" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("creator_profile_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"() OR (NOT (EXISTS ( SELECT 1
   FROM "public"."blocked_users" "b"
  WHERE ((("b"."blocker_id" = "auth"."uid"()) AND ("b"."blocked_id" = COALESCE("reels"."creator_profile_id", "reels"."user_id"))) OR (("b"."blocker_id" = COALESCE("reels"."creator_profile_id", "reels"."user_id")) AND ("b"."blocked_id" = "auth"."uid"()))))))));



CREATE POLICY "reels_update_own_or_moderator" ON "public"."reels" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("creator_profile_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR ("creator_profile_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



ALTER TABLE "public"."reported_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reports_delete_moderator" ON "public"."reports" FOR DELETE TO "authenticated" USING ("public"."can_access_moderation_dashboard"());



CREATE POLICY "reports_insert_reporter" ON "public"."reports" FOR INSERT TO "authenticated" WITH CHECK (("reporter_id" = "auth"."uid"()));



CREATE POLICY "reports_select_reporter_or_moderator" ON "public"."reports" FOR SELECT TO "authenticated" USING ((("reporter_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



CREATE POLICY "reports_update_moderator" ON "public"."reports" FOR UPDATE TO "authenticated" USING ("public"."can_access_moderation_dashboard"()) WITH CHECK ("public"."can_access_moderation_dashboard"());



ALTER TABLE "public"."reposts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reposts_delete_own" ON "public"."reposts" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "reposts_insert_own" ON "public"."reposts" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "reposts_select_authenticated" ON "public"."reposts" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."saved_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "saved_photos_delete_own" ON "public"."saved_photos" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "saved_photos_insert_own" ON "public"."saved_photos" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "saved_photos_select_own" ON "public"."saved_photos" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "service role full access reported_comments" ON "public"."reported_comments" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."shares" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shares_delete_own_or_moderator" ON "public"."shares" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



CREATE POLICY "shares_insert_visible_post" ON "public"."shares" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE ("p"."id" = "shares"."post_id")))));



CREATE POLICY "shares_select_visible_post" ON "public"."shares" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"() OR (("deleted_at" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE ("p"."id" = "shares"."post_id"))))));



CREATE POLICY "shares_update_own_or_moderator" ON "public"."shares" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."can_access_moderation_dashboard"()));



ALTER TABLE "public"."support_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_messages_delete_support" ON "public"."support_messages" FOR DELETE TO "authenticated" USING ("public"."can_access_support_inbox"());



CREATE POLICY "support_messages_insert_owner" ON "public"."support_messages" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "support_messages_select_owner_or_support" ON "public"."support_messages" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_access_support_inbox"()));



CREATE POLICY "support_messages_update_support" ON "public"."support_messages" FOR UPDATE TO "authenticated" USING ("public"."can_access_support_inbox"()) WITH CHECK ("public"."can_access_support_inbox"());



ALTER TABLE "public"."user_achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_badges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_blocks_delete_own" ON "public"."user_blocks" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "blocker_id"));



CREATE POLICY "user_blocks_insert_own" ON "public"."user_blocks" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "blocker_id") AND ("blocker_id" <> "blocked_id")));



CREATE POLICY "user_blocks_select_own_blocks" ON "public"."user_blocks" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "blocker_id") OR ("auth"."uid"() = "blocked_id")));



ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users can insert own reports" ON "public"."reported_comments" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "reported_by"));



CREATE POLICY "users can view own reports" ON "public"."reported_comments" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "reported_by"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."direct_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."friend_requests";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."live_chat_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."are_parapost_friends"("user_a" "uuid", "user_b" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."are_parapost_friends"("user_a" "uuid", "user_b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."are_parapost_friends"("user_a" "uuid", "user_b" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."award_official_parapost_member_badge_for_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."award_official_parapost_member_badge_for_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_access_moderation_dashboard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_moderation_dashboard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_moderation_dashboard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_access_support_inbox"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_support_inbox"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_support_inbox"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_hide_direct_conversation"("conversation_id_input" "uuid", "user_id_input" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_hide_direct_conversation"("conversation_id_input" "uuid", "user_id_input" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_hide_direct_conversation"("conversation_id_input" "uuid", "user_id_input" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_manage_admin_users"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_admin_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_admin_users"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_read_live_stream_chat"("p_live_stream_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_read_live_stream_chat"("p_live_stream_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_live_stream_chat"("p_live_stream_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_send_direct_message"("p_conversation_id" "uuid", "p_sender_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_send_direct_message"("p_conversation_id" "uuid", "p_sender_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_send_direct_message"("p_conversation_id" "uuid", "p_sender_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_comment_like_notification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_comment_like_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_comment_like_notification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_comment_reply_notification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_comment_reply_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_comment_reply_notification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_friend_accept_notification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_friend_accept_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_friend_accept_notification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_friend_request_notification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_friend_request_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_friend_request_notification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_post_like_notification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_post_like_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_post_like_notification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_or_create_direct_conversation"("other_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_or_create_direct_conversation"("other_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_direct_conversation"("other_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_community_reach"("target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_community_reach"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_community_reach"("target_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_live_stream_views"("target_stream_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_live_stream_views"("target_stream_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_live_stream_views"("target_stream_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."increment_live_stream_views"("target_stream_id" "uuid") TO "anon";



REVOKE ALL ON FUNCTION "public"."is_blocked_between"("user_a" "uuid", "user_b" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_blocked_between"("user_a" "uuid", "user_b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_blocked_between"("user_a" "uuid", "user_b" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_direct_conversation_participant"("p_conversation_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_direct_conversation_participant"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_direct_conversation_participant"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_live_chat_blocked"("p_live_stream_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_live_chat_blocked"("p_live_stream_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_live_chat_blocked"("p_live_stream_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_live_chat_muted"("p_live_stream_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_live_chat_muted"("p_live_stream_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_live_chat_muted"("p_live_stream_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_live_stream_owner"("p_live_stream_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_live_stream_owner"("p_live_stream_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_live_stream_owner"("p_live_stream_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."live_stream_allows_comments"("p_live_stream_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."live_stream_allows_comments"("p_live_stream_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."live_stream_allows_comments"("p_live_stream_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."parapost_are_accepted_friends"("user_a" "uuid", "user_b" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."parapost_are_accepted_friends"("user_a" "uuid", "user_b" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."parapost_create_conversation_for_friendship"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."parapost_create_conversation_for_friendship"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."parapost_enforce_friend_conversation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."parapost_enforce_friend_conversation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."parapost_enforce_friend_message"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."parapost_enforce_friend_message"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."parapost_live_set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."parapost_live_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."parapost_live_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_live_chat_message_edit_timestamps"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_live_chat_message_edit_timestamps"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_live_chat_message_edit_timestamps"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_shares_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_shares_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_shares_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_support_messages_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_support_messages_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_support_messages_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_updated_at_timestamp"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_updated_at_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at_timestamp"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_user_preferences_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_user_preferences_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_preferences_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_user_community_reach_achievements"("target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_user_community_reach_achievements"("target_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_user_community_reach_achievements_internal"("target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_user_community_reach_achievements_internal"("target_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_conversation_timestamp"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_conversation_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_conversation_timestamp"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_updated_at_column"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."friend_requests" TO "anon";
GRANT ALL ON TABLE "public"."friend_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."friend_requests" TO "service_role";



GRANT ALL ON TABLE "public"."accepted_friends" TO "anon";
GRANT ALL ON TABLE "public"."accepted_friends" TO "authenticated";
GRANT ALL ON TABLE "public"."accepted_friends" TO "service_role";



GRANT ALL ON TABLE "public"."achievement_activity" TO "anon";
GRANT ALL ON TABLE "public"."achievement_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."achievement_activity" TO "service_role";



GRANT ALL ON TABLE "public"."achievements" TO "anon";
GRANT ALL ON TABLE "public"."achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."achievements" TO "service_role";



GRANT ALL ON TABLE "public"."admin_users" TO "anon";
GRANT ALL ON TABLE "public"."admin_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_users" TO "service_role";



GRANT ALL ON TABLE "public"."badge_awards" TO "anon";
GRANT ALL ON TABLE "public"."badge_awards" TO "authenticated";
GRANT ALL ON TABLE "public"."badge_awards" TO "service_role";



GRANT ALL ON TABLE "public"."badges" TO "anon";
GRANT ALL ON TABLE "public"."badges" TO "authenticated";
GRANT ALL ON TABLE "public"."badges" TO "service_role";



GRANT ALL ON TABLE "public"."blocked_users" TO "anon";
GRANT ALL ON TABLE "public"."blocked_users" TO "authenticated";
GRANT ALL ON TABLE "public"."blocked_users" TO "service_role";



GRANT ALL ON TABLE "public"."comment_likes" TO "anon";
GRANT ALL ON TABLE "public"."comment_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."comment_likes" TO "service_role";



GRANT ALL ON TABLE "public"."comment_reports" TO "anon";
GRANT ALL ON TABLE "public"."comment_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."comment_reports" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON TABLE "public"."direct_conversation_hides" TO "anon";
GRANT ALL ON TABLE "public"."direct_conversation_hides" TO "authenticated";
GRANT ALL ON TABLE "public"."direct_conversation_hides" TO "service_role";



GRANT ALL ON TABLE "public"."direct_conversation_participants" TO "anon";
GRANT ALL ON TABLE "public"."direct_conversation_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."direct_conversation_participants" TO "service_role";



GRANT ALL ON TABLE "public"."direct_conversations" TO "anon";
GRANT ALL ON TABLE "public"."direct_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."direct_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."direct_messages" TO "anon";
GRANT ALL ON TABLE "public"."direct_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."direct_messages" TO "service_role";



GRANT ALL ON TABLE "public"."followers" TO "anon";
GRANT ALL ON TABLE "public"."followers" TO "authenticated";
GRANT ALL ON TABLE "public"."followers" TO "service_role";



GRANT ALL ON TABLE "public"."follows" TO "anon";
GRANT ALL ON TABLE "public"."follows" TO "authenticated";
GRANT ALL ON TABLE "public"."follows" TO "service_role";



GRANT ALL ON TABLE "public"."friends" TO "anon";
GRANT ALL ON TABLE "public"."friends" TO "authenticated";
GRANT ALL ON TABLE "public"."friends" TO "service_role";



GRANT ALL ON TABLE "public"."friendships" TO "anon";
GRANT ALL ON TABLE "public"."friendships" TO "authenticated";
GRANT ALL ON TABLE "public"."friendships" TO "service_role";



GRANT ALL ON TABLE "public"."friendships_expanded" TO "anon";
GRANT ALL ON TABLE "public"."friendships_expanded" TO "authenticated";
GRANT ALL ON TABLE "public"."friendships_expanded" TO "service_role";



GRANT ALL ON TABLE "public"."likes" TO "anon";
GRANT ALL ON TABLE "public"."likes" TO "authenticated";
GRANT ALL ON TABLE "public"."likes" TO "service_role";



GRANT ALL ON TABLE "public"."live_chat_blocks" TO "anon";
GRANT ALL ON TABLE "public"."live_chat_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."live_chat_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."live_chat_message_likes" TO "anon";
GRANT ALL ON TABLE "public"."live_chat_message_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."live_chat_message_likes" TO "service_role";



GRANT ALL ON TABLE "public"."live_chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."live_chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."live_chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."live_chat_mutes" TO "anon";
GRANT ALL ON TABLE "public"."live_chat_mutes" TO "authenticated";
GRANT ALL ON TABLE "public"."live_chat_mutes" TO "service_role";



GRANT ALL ON TABLE "public"."live_streams" TO "anon";
GRANT ALL ON TABLE "public"."live_streams" TO "authenticated";
GRANT ALL ON TABLE "public"."live_streams" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."post_images" TO "anon";
GRANT ALL ON TABLE "public"."post_images" TO "authenticated";
GRANT ALL ON TABLE "public"."post_images" TO "service_role";



GRANT ALL ON TABLE "public"."posts" TO "anon";
GRANT ALL ON TABLE "public"."posts" TO "authenticated";
GRANT ALL ON TABLE "public"."posts" TO "service_role";



GRANT ALL ON TABLE "public"."profile_reports" TO "anon";
GRANT ALL ON TABLE "public"."profile_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_reports" TO "service_role";



GRANT ALL ON TABLE "public"."profile_showcases" TO "anon";
GRANT ALL ON TABLE "public"."profile_showcases" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_showcases" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."recently_viewed_profiles" TO "anon";
GRANT ALL ON TABLE "public"."recently_viewed_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."recently_viewed_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."reel_comment_likes" TO "anon";
GRANT ALL ON TABLE "public"."reel_comment_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."reel_comment_likes" TO "service_role";



GRANT ALL ON TABLE "public"."reel_comments" TO "anon";
GRANT ALL ON TABLE "public"."reel_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."reel_comments" TO "service_role";



GRANT ALL ON TABLE "public"."reel_favorites" TO "anon";
GRANT ALL ON TABLE "public"."reel_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."reel_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."reel_likes" TO "anon";
GRANT ALL ON TABLE "public"."reel_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."reel_likes" TO "service_role";



GRANT ALL ON TABLE "public"."reel_shares" TO "anon";
GRANT ALL ON TABLE "public"."reel_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."reel_shares" TO "service_role";



GRANT ALL ON TABLE "public"."reels" TO "anon";
GRANT ALL ON TABLE "public"."reels" TO "authenticated";
GRANT ALL ON TABLE "public"."reels" TO "service_role";



GRANT ALL ON TABLE "public"."reported_comments" TO "anon";
GRANT ALL ON TABLE "public"."reported_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."reported_comments" TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT ALL ON TABLE "public"."reposts" TO "anon";
GRANT ALL ON TABLE "public"."reposts" TO "authenticated";
GRANT ALL ON TABLE "public"."reposts" TO "service_role";



GRANT ALL ON TABLE "public"."saved_photos" TO "anon";
GRANT ALL ON TABLE "public"."saved_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_photos" TO "service_role";



GRANT ALL ON TABLE "public"."shares" TO "anon";
GRANT ALL ON TABLE "public"."shares" TO "authenticated";
GRANT ALL ON TABLE "public"."shares" TO "service_role";



GRANT ALL ON TABLE "public"."support_messages" TO "anon";
GRANT ALL ON TABLE "public"."support_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."support_messages" TO "service_role";



GRANT ALL ON TABLE "public"."user_achievements" TO "anon";
GRANT ALL ON TABLE "public"."user_achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."user_achievements" TO "service_role";



GRANT ALL ON TABLE "public"."user_badges" TO "anon";
GRANT ALL ON TABLE "public"."user_badges" TO "authenticated";
GRANT ALL ON TABLE "public"."user_badges" TO "service_role";



GRANT ALL ON TABLE "public"."user_blocks" TO "anon";
GRANT ALL ON TABLE "public"."user_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."user_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."user_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_preferences" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

drop policy "Anyone can view achievement activity" on "public"."achievement_activity";

drop policy "Anyone can view active achievements" on "public"."achievements";

drop policy "Anyone can view user achievements" on "public"."user_achievements";


  create policy "Anyone can view achievement activity"
  on "public"."achievement_activity"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Anyone can view active achievements"
  on "public"."achievements"
  as permissive
  for select
  to anon, authenticated
using ((is_active = true));



  create policy "Anyone can view user achievements"
  on "public"."user_achievements"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Allow authenticated uploads to post-images"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'post-images'::text) AND (owner_id = ( SELECT (auth.uid())::text AS uid))));



  create policy "Allow reel deletes"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'reels-videos'::text) AND (owner_id = ( SELECT (auth.uid())::text AS uid))));



  create policy "Allow reel uploads"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'reels-videos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Authenticated users can delete avatars"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'avatars'::text) AND (owner_id = ( SELECT (auth.uid())::text AS uid))));



  create policy "Authenticated users can update avatars"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'avatars'::text) AND (owner_id = ( SELECT (auth.uid())::text AS uid))))
with check (((bucket_id = 'avatars'::text) AND (owner_id = ( SELECT (auth.uid())::text AS uid))));



  create policy "Authenticated users can upload avatars"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'avatars'::text) AND (owner_id = ( SELECT (auth.uid())::text AS uid))));



  create policy "Authenticated users can upload reel posters"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'reel-posters'::text) AND (owner_id = ( SELECT (auth.uid())::text AS uid))));



  create policy "Authenticated users can upload reels"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'reels'::text) AND (owner_id = ( SELECT (auth.uid())::text AS uid))));



  create policy "Parachat images can be read by conversation members"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'parachat-images'::text) AND (EXISTS ( SELECT 1
   FROM public.direct_conversations dc
  WHERE (((dc.id)::text = (storage.foldername(objects.name))[2]) AND ((dc.user_one_id = auth.uid()) OR (dc.user_two_id = auth.uid())))))));



  create policy "Users can delete their own Parachat images"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'parachat-images'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]) AND (EXISTS ( SELECT 1
   FROM public.direct_conversations dc
  WHERE (((dc.id)::text = (storage.foldername(objects.name))[2]) AND ((dc.user_one_id = auth.uid()) OR (dc.user_two_id = auth.uid())))))));



  create policy "Users can update their own Parachat images"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'parachat-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM public.direct_conversations dc
  WHERE (((dc.id)::text = (storage.foldername(objects.name))[2]) AND ((dc.user_one_id = auth.uid()) OR (dc.user_two_id = auth.uid())) AND (EXISTS ( SELECT 1
           FROM public.friend_requests fr
          WHERE ((fr.status = 'accepted'::text) AND (((fr.sender_id = dc.user_one_id) AND (fr.receiver_id = dc.user_two_id)) OR ((fr.sender_id = dc.user_two_id) AND (fr.receiver_id = dc.user_one_id)))))) AND (NOT public.is_blocked_between(dc.user_one_id, dc.user_two_id)))))))
with check (((bucket_id = 'parachat-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM public.direct_conversations dc
  WHERE (((dc.id)::text = (storage.foldername(objects.name))[2]) AND ((dc.user_one_id = auth.uid()) OR (dc.user_two_id = auth.uid())) AND (EXISTS ( SELECT 1
           FROM public.friend_requests fr
          WHERE ((fr.status = 'accepted'::text) AND (((fr.sender_id = dc.user_one_id) AND (fr.receiver_id = dc.user_two_id)) OR ((fr.sender_id = dc.user_two_id) AND (fr.receiver_id = dc.user_one_id)))))) AND (NOT public.is_blocked_between(dc.user_one_id, dc.user_two_id)))))));



  create policy "Users can update their own profile covers"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'profile-covers'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)))
with check (((bucket_id = 'profile-covers'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can upload their own Parachat images"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'parachat-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM public.direct_conversations dc
  WHERE (((dc.id)::text = (storage.foldername(objects.name))[2]) AND ((dc.user_one_id = auth.uid()) OR (dc.user_two_id = auth.uid())) AND (EXISTS ( SELECT 1
           FROM public.friend_requests fr
          WHERE ((fr.status = 'accepted'::text) AND (((fr.sender_id = dc.user_one_id) AND (fr.receiver_id = dc.user_two_id)) OR ((fr.sender_id = dc.user_two_id) AND (fr.receiver_id = dc.user_one_id)))))) AND (NOT public.is_blocked_between(dc.user_one_id, dc.user_two_id)))))));



  create policy "Users can upload their own profile covers"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'profile-covers'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));




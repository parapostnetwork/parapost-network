import type { SupabaseClient } from "@supabase/supabase-js";

type FollowResult = { error: { message: string } | null };
const preparationError = "Your profile could not be prepared. Please refresh and try again.";

// Use the member's own session and RLS. Never overwrite an existing profile or
// create the target member's profile to make a foreign-key failure disappear.
export async function followMember(supabase: SupabaseClient, followerId: string, followingId: string): Promise<FollowResult> {
  const fail = (message: string): FollowResult => ({ error: { message } });
  if (!followerId || !followingId || followerId === followingId) return fail("Please choose another member to follow.");
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || user.id !== followerId) return fail("Your session has changed. Please sign in again before following this member.");

    const readOwnProfile = () => supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
    const own = await readOwnProfile();
    if (own.error) return fail(preparationError);
    if (!own.data) {
      const metadata = user.user_metadata || {};
      const name = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
      const { error } = await supabase.from("profiles").insert({
        id: user.id,
        username: `member_${user.id.replace(/-/g, "").slice(0, 20)}`,
        full_name: name || "Parapost Member",
      });
      if (error && error.code !== "23505") return fail(preparationError);
      // A duplicate may be a username conflict, not a successfully created ID.
      const confirmed = await readOwnProfile();
      if (confirmed.error || !confirmed.data) return fail(preparationError);
    }

    const { error } = await supabase.from("followers").insert({ follower_id: user.id, following_id: followingId });
    if (!error) return { error: null };
    if (error.code === "23505") {
      const existing = await supabase.from("followers").select("follower_id").eq("follower_id", user.id).eq("following_id", followingId).maybeSingle();
      if (!existing.error && existing.data) return { error: null };
    }
    if (error.code === "23503") return fail("This account or member profile is no longer available. Please refresh and try again.");
    return fail("Unable to follow this member right now. Please try again.");
  } catch {
    return fail("Unable to follow this member right now. Please check your connection and try again.");
  }
}

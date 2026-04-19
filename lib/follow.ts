import { supabase } from "@/lib/supabase";

export const followUser = async (userId: string, targetId: string) => {
  if (!userId || !targetId) {
    throw new Error("Missing userId or targetId");
  }

  if (userId === targetId) {
    throw new Error("You cannot follow yourself");
  }

  return await supabase.from("follows").insert({
    follower_id: userId,
    following_id: targetId,
  });
};

export const unfollowUser = async (userId: string, targetId: string) => {
  if (!userId || !targetId) {
    throw new Error("Missing userId or targetId");
  }

  return await supabase
    .from("follows")
    .delete()
    .eq("follower_id", userId)
    .eq("following_id", targetId);
};

export const checkIfFollowing = async (
  userId: string,
  targetId: string
): Promise<boolean> => {
  if (!userId || !targetId) return false;

  const { data, error } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", userId)
    .eq("following_id", targetId)
    .maybeSingle();

  if (error) {
    console.error("Check following error:", error.message);
    return false;
  }

  return !!data;
};

export const getFollowersCount = async (profileId: string): Promise<number> => {
  if (!profileId) return 0;

  const { count, error } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", profileId);

  if (error) {
    console.error("Followers count error:", error.message);
    return 0;
  }

  return count || 0;
};

export const getFollowingCount = async (profileId: string): Promise<number> => {
  if (!profileId) return 0;

  const { count, error } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", profileId);

  if (error) {
    console.error("Following count error:", error.message);
    return 0;
  }

  return count || 0;
};

export const getFollowersList = async (profileId: string) => {
  if (!profileId) return [];

  const { data, error } = await supabase
    .from("follows")
    .select(
      `
      follower_id,
      profiles:follower_id (
        id,
        username,
        full_name,
        avatar_url,
        is_online
      )
    `
    )
    .eq("following_id", profileId);

  if (error) {
    console.error("Followers list error:", error.message);
    return [];
  }

  return data?.map((item: any) => item.profiles).filter(Boolean) || [];
};

export const getFollowingList = async (profileId: string) => {
  if (!profileId) return [];

  const { data, error } = await supabase
    .from("follows")
    .select(
      `
      following_id,
      profiles:following_id (
        id,
        username,
        full_name,
        avatar_url,
        is_online
      )
    `
    )
    .eq("follower_id", profileId);

  if (error) {
    console.error("Following list error:", error.message);
    return [];
  }

  return data?.map((item: any) => item.profiles).filter(Boolean) || [];
};
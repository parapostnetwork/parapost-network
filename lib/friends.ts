import type { SupabaseClient } from "@supabase/supabase-js";

export type FriendshipStatus =
  | "none"
  | "friends"
  | "incoming"
  | "outgoing"
  | "blocked"
  | "self";

type FriendRow = {
  user_id: string;
  friend_id: string;
};

type FriendRequestRow = {
  sender_id: string;
  receiver_id: string;
};

export async function getFriendshipStatus(
  supabase: SupabaseClient,
  userId: string,
  targetId: string
): Promise<FriendshipStatus> {
  if (!userId || !targetId) return "none";
  if (userId === targetId) return "self";

  const { data: friendship, error: friendshipError } = await supabase
    .from("friends")
    .select("user_id, friend_id")
    .or(
      `and(user_id.eq.${userId},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${userId})`
    )
    .maybeSingle<FriendRow>();

  if (friendshipError) {
    console.error("Error checking friendship:", friendshipError);
  }

  if (friendship) {
    return "friends";
  }

  const { data: request, error: requestError } = await supabase
    .from("friend_requests")
    .select("sender_id, receiver_id")
    .or(
      `and(sender_id.eq.${userId},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${userId})`
    )
    .maybeSingle<FriendRequestRow>();

  if (requestError) {
    console.error("Error checking friend request:", requestError);
  }

  if (!request) {
    return "none";
  }

  if (request.sender_id === userId && request.receiver_id === targetId) {
    return "outgoing";
  }

  if (request.sender_id === targetId && request.receiver_id === userId) {
    return "incoming";
  }

  return "none";
}

export async function sendFriendRequest(
  supabase: SupabaseClient,
  userId: string,
  targetId: string
) {
  if (!userId || !targetId || userId === targetId) {
    throw new Error("Invalid friend request.");
  }

  const existingStatus = await getFriendshipStatus(supabase, userId, targetId);

  if (existingStatus === "friends" || existingStatus === "outgoing") {
    return { success: true };
  }

  if (existingStatus === "incoming") {
    return acceptFriendRequest(supabase, userId, targetId);
  }

  const { error } = await supabase.from("friend_requests").insert({
    sender_id: userId,
    receiver_id: targetId,
  });

  if (error) {
    throw error;
  }

  return { success: true };
}

export async function cancelFriendRequest(
  supabase: SupabaseClient,
  userId: string,
  targetId: string
) {
  const { error } = await supabase
    .from("friend_requests")
    .delete()
    .eq("sender_id", userId)
    .eq("receiver_id", targetId);

  if (error) {
    throw error;
  }

  return { success: true };
}

export async function acceptFriendRequest(
  supabase: SupabaseClient,
  userId: string,
  targetId: string
) {
  const { error: deleteError } = await supabase
    .from("friend_requests")
    .delete()
    .eq("sender_id", targetId)
    .eq("receiver_id", userId);

  if (deleteError) {
    throw deleteError;
  }

  const { error: insertError } = await supabase.from("friends").insert([
    {
      user_id: userId,
      friend_id: targetId,
    },
  ]);

  if (insertError) {
    throw insertError;
  }

  return { success: true };
}

export async function removeFriend(
  supabase: SupabaseClient,
  userId: string,
  targetId: string
) {
  const { error } = await supabase
    .from("friends")
    .delete()
    .or(
      `and(user_id.eq.${userId},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${userId})`
    );

  if (error) {
    throw error;
  }

  return { success: true };
}

export async function getFriendsList(
  supabase: SupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from("friends")
    .select("user_id, friend_id")
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

  if (error) {
    throw error;
  }

  return data ?? [];
}
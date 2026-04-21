import { SupabaseClient } from "@supabase/supabase-js";

export async function sendFriendRequest(
  supabase: SupabaseClient,
  currentUserId: string,
  targetUserId: string
) {
  if (!currentUserId || !targetUserId) {
    throw new Error("Missing user IDs.");
  }

  if (currentUserId === targetUserId) {
    throw new Error("You cannot send a friend request to yourself.");
  }

  const { error } = await supabase.from("friend_requests").insert([
    {
      sender_id: currentUserId,
      receiver_id: targetUserId,
      status: "pending",
    },
  ]);

  if (error) {
    throw new Error(error.message);
  }

  return true;
}

export async function cancelFriendRequest(
  supabase: SupabaseClient,
  currentUserId: string,
  targetUserId: string
) {
  const { error } = await supabase
    .from("friend_requests")
    .update({ status: "cancelled" })
    .eq("sender_id", currentUserId)
    .eq("receiver_id", targetUserId)
    .eq("status", "pending");

  if (error) {
    throw new Error(error.message);
  }

  return true;
}

export async function acceptFriendRequest(
  supabase: SupabaseClient,
  currentUserId: string,
  senderUserId: string
) {
  const { data: request, error } = await supabase
    .from("friend_requests")
    .select("*")
    .eq("sender_id", senderUserId)
    .eq("receiver_id", currentUserId)
    .eq("status", "pending")
    .single();

  if (error || !request) {
    throw new Error("No request found.");
  }

  const user_one =
    currentUserId < senderUserId ? currentUserId : senderUserId;
  const user_two =
    currentUserId < senderUserId ? senderUserId : currentUserId;

  const { error: insertError } = await supabase.from("friendships").insert([
    {
      user_one,
      user_two,
    },
  ]);

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { error: updateError } = await supabase
    .from("friend_requests")
    .update({ status: "accepted" })
    .eq("id", request.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return true;
}

export async function declineFriendRequest(
  supabase: SupabaseClient,
  currentUserId: string,
  senderUserId: string
) {
  const { error } = await supabase
    .from("friend_requests")
    .update({ status: "declined" })
    .eq("sender_id", senderUserId)
    .eq("receiver_id", currentUserId)
    .eq("status", "pending");

  if (error) {
    throw new Error(error.message);
  }

  return true;
}

export async function removeFriend(
  supabase: SupabaseClient,
  currentUserId: string,
  targetUserId: string
) {
  const user_one =
    currentUserId < targetUserId ? currentUserId : targetUserId;
  const user_two =
    currentUserId < targetUserId ? targetUserId : currentUserId;

  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("user_one", user_one)
    .eq("user_two", user_two);

  if (error) {
    throw new Error(error.message);
  }

  return true;
}
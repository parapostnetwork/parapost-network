import { SupabaseClient } from "@supabase/supabase-js";

type FriendRequestStatus = "pending" | "accepted" | "declined" | "cancelled" | string;

type FriendRequestRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: FriendRequestStatus;
};

type SendFriendRequestResult = {
  status: "outgoing_request" | "incoming_request" | "friends";
  message: string;
  requestId?: string | null;
};

function getFriendPairFilter(currentUserId: string, targetUserId: string) {
  return `and(sender_id.eq.${currentUserId},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${currentUserId})`;
}

function isDuplicatePairError(error: { code?: string | null; message?: string | null }) {
  const message = String(error.message || "").toLowerCase();

  return (
    error.code === "23505" ||
    message.includes("duplicate key") ||
    message.includes("friend_requests_unique_pair")
  );
}

async function createFriendRequestNotification(
  supabase: SupabaseClient,
  receiverId: string,
  senderId: string,
  requestId: string | null
) {
  if (!receiverId || !senderId || receiverId === senderId) return;

  const { error } = await supabase.from("notifications").insert([
    {
      user_id: receiverId,
      actor_id: senderId,
      type: "friend_request",
      post_id: null,
      comment_id: null,
      friend_request_id: requestId,
      message: "sent you a friend request.",
      is_read: false,
    },
  ]);

  if (error) {
    console.warn("Friend request notification warning:", error.message);
  }
}

export async function sendFriendRequest(
  supabase: SupabaseClient,
  currentUserId: string,
  targetUserId: string
): Promise<SendFriendRequestResult> {
  if (!currentUserId || !targetUserId) {
    throw new Error("Missing user IDs.");
  }

  if (currentUserId === targetUserId) {
    throw new Error("You cannot send a friend request to yourself.");
  }

  const pairFilter = getFriendPairFilter(currentUserId, targetUserId);

  const { data: existingRows, error: existingError } = await supabase
    .from("friend_requests")
    .select("id, sender_id, receiver_id, status")
    .or(pairFilter)
    .order("created_at", { ascending: false })
    .limit(1);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingRequest = (existingRows?.[0] || null) as FriendRequestRow | null;

  if (existingRequest) {
    if (existingRequest.status === "accepted") {
      return {
        status: "friends",
        message: "You are already friends.",
        requestId: existingRequest.id,
      };
    }

    if (existingRequest.status === "pending") {
      if (existingRequest.sender_id === currentUserId) {
        return {
          status: "outgoing_request",
          message: "Friend request already sent.",
          requestId: existingRequest.id,
        };
      }

      return {
        status: "incoming_request",
        message: "This member already sent you a request.",
        requestId: existingRequest.id,
      };
    }

    if (existingRequest.status === "declined" || existingRequest.status === "cancelled") {
      const { data: updatedRows, error: updateError } = await supabase
        .from("friend_requests")
        .update({
          sender_id: currentUserId,
          receiver_id: targetUserId,
          status: "pending",
        })
        .eq("id", existingRequest.id)
        .select("id");

      if (updateError) {
        throw new Error(updateError.message);
      }

      const updatedRequestId = (updatedRows?.[0]?.id as string | undefined) || existingRequest.id;

      await createFriendRequestNotification(
        supabase,
        targetUserId,
        currentUserId,
        updatedRequestId
      );

      return {
        status: "outgoing_request",
        message: "Friend request sent.",
        requestId: updatedRequestId,
      };
    }
  }

  const { data: insertedRows, error: insertError } = await supabase
    .from("friend_requests")
    .insert([
      {
        sender_id: currentUserId,
        receiver_id: targetUserId,
        status: "pending",
      },
    ])
    .select("id");

  if (insertError) {
    if (isDuplicatePairError(insertError)) {
      const { data: duplicateRows, error: duplicateFetchError } = await supabase
        .from("friend_requests")
        .select("id, sender_id, receiver_id, status")
        .or(pairFilter)
        .order("created_at", { ascending: false })
        .limit(1);

      if (duplicateFetchError) {
        throw new Error(duplicateFetchError.message);
      }

      const duplicateRequest = (duplicateRows?.[0] || null) as FriendRequestRow | null;

      if (duplicateRequest?.status === "accepted") {
        return {
          status: "friends",
          message: "You are already friends.",
          requestId: duplicateRequest.id,
        };
      }

      if (duplicateRequest?.sender_id === currentUserId) {
        return {
          status: "outgoing_request",
          message: "Friend request already sent.",
          requestId: duplicateRequest.id,
        };
      }

      return {
        status: "incoming_request",
        message: "This member already sent you a request.",
        requestId: duplicateRequest?.id || null,
      };
    }

    throw new Error(insertError.message);
  }

  return {
    status: "outgoing_request",
    message: "Friend request sent.",
    requestId: (insertedRows?.[0]?.id as string | undefined) || null,
  };
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

  if (insertError && insertError.code !== "23505") {
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

  const { error: friendshipError } = await supabase
    .from("friendships")
    .delete()
    .eq("user_one", user_one)
    .eq("user_two", user_two);

  if (friendshipError) {
    throw new Error(friendshipError.message);
  }

  const { error: requestError } = await supabase
    .from("friend_requests")
    .delete()
    .eq("status", "accepted")
    .or(getFriendPairFilter(currentUserId, targetUserId));

  if (requestError) {
    throw new Error(requestError.message);
  }

  return true;
}

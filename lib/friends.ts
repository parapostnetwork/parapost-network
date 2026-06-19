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

function getFriendshipPair(currentUserId: string, targetUserId: string) {
  return {
    user_one: currentUserId < targetUserId ? currentUserId : targetUserId,
    user_two: currentUserId < targetUserId ? targetUserId : currentUserId,
  };
}

function isDuplicateError(error: { code?: string | null; message?: string | null }) {
  const message = String(error.message || "").toLowerCase();
  return (
    error.code === "23505" ||
    message.includes("duplicate key") ||
    message.includes("unique constraint") ||
    message.includes("friend_requests_unique_pair")
  );
}

function getProfileUsernameFallback(userId: string, email?: string | null, userMetadata?: Record<string, unknown> | null) {
  const metadataUsername = String(userMetadata?.username || "").trim();
  if (metadataUsername) return metadataUsername;

  const emailPrefix = String(email || "")
    .split("@")[0]
    ?.toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${emailPrefix || "member"}_${userId.slice(0, 6)}`;
}

function getProfileNameFallback(username: string, userMetadata?: Record<string, unknown> | null) {
  const fullName = String(userMetadata?.full_name || userMetadata?.name || "").trim();
  return fullName || username;
}

async function ensureOwnProfileRow(supabase: SupabaseClient, currentUserId: string) {
  const { data: existingProfile, error: existingError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", currentUserId)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existingProfile?.id) return true;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || user.id !== currentUserId) {
    throw new Error("Unable to verify your account before sending a friend request.");
  }

  const userMetadata = (user.user_metadata || {}) as Record<string, unknown>;
  const username = getProfileUsernameFallback(currentUserId, user.email, userMetadata);
  const fullName = getProfileNameFallback(username, userMetadata);
  const avatarUrl = String(userMetadata.avatar_url || userMetadata.picture || "").trim() || null;

  const { error: insertError } = await supabase.from("profiles").insert([
    {
      id: currentUserId,
      username,
      full_name: fullName,
      avatar_url: avatarUrl,
      bio: null,
      updated_at: new Date().toISOString(),
    },
  ]);

  if (insertError && !isDuplicateError(insertError)) {
    throw new Error(`Your profile is still being prepared. Please refresh and try again. ${insertError.message}`);
  }

  return true;
}

async function ensureTargetProfileExists(supabase: SupabaseClient, targetUserId: string) {
  const { data: targetProfile, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", targetUserId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!targetProfile?.id) {
    throw new Error("This member profile is still being prepared. Please try again in a moment.");
  }

  return true;
}

async function createNotification(
  supabase: SupabaseClient,
  payload: {
    user_id: string;
    actor_id: string;
    type: string;
    friend_request_id?: string | null;
    message: string;
  }
) {
  if (!payload.user_id || !payload.actor_id || payload.user_id === payload.actor_id) return;

  const { error } = await supabase.from("notifications").insert([
    {
      user_id: payload.user_id,
      actor_id: payload.actor_id,
      type: payload.type,
      post_id: null,
      comment_id: null,
      friend_request_id: payload.friend_request_id || null,
      message: payload.message,
      is_read: false,
    },
  ]);

  if (error) console.warn("Friend notification warning:", error.message);
}

async function markFriendRequestNotificationsRead(supabase: SupabaseClient, requestId: string, userId: string) {
  if (!requestId || !userId) return;

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("friend_request_id", requestId)
    .eq("type", "friend_request");

  if (error) console.warn("Friend request notification read warning:", error.message);
}

async function findExistingFriendRequest(supabase: SupabaseClient, currentUserId: string, targetUserId: string) {
  const { data, error } = await supabase
    .from("friend_requests")
    .select("id, sender_id, receiver_id, status")
    .or(getFriendPairFilter(currentUserId, targetUserId))
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  return (data?.[0] || null) as FriendRequestRow | null;
}

async function friendshipAlreadyExists(supabase: SupabaseClient, currentUserId: string, targetUserId: string) {
  const { user_one, user_two } = getFriendshipPair(currentUserId, targetUserId);

  const { data, error } = await supabase
    .from("friendships")
    .select("user_one, user_two")
    .eq("user_one", user_one)
    .eq("user_two", user_two)
    .limit(1);

  if (error) return false;
  return Boolean(data && data.length > 0);
}

export async function sendFriendRequest(
  supabase: SupabaseClient,
  currentUserId: string,
  targetUserId: string
): Promise<SendFriendRequestResult> {
  if (!currentUserId || !targetUserId) throw new Error("Missing user IDs.");
  if (currentUserId === targetUserId) throw new Error("You cannot send a friend request to yourself.");

  await ensureOwnProfileRow(supabase, currentUserId);
  await ensureTargetProfileExists(supabase, targetUserId);

  if (await friendshipAlreadyExists(supabase, currentUserId, targetUserId)) {
    return { status: "friends", message: "You are already friends.", requestId: null };
  }

  const existingRequest = await findExistingFriendRequest(supabase, currentUserId, targetUserId);

  if (existingRequest) {
    if (existingRequest.status === "accepted") {
      return { status: "friends", message: "You are already friends.", requestId: existingRequest.id };
    }

    if (existingRequest.status === "pending") {
      if (existingRequest.sender_id === currentUserId) {
        return { status: "outgoing_request", message: "Friend request already sent.", requestId: existingRequest.id };
      }

      return { status: "incoming_request", message: "This member already sent you a request.", requestId: existingRequest.id };
    }

    if (existingRequest.status === "declined" || existingRequest.status === "cancelled") {
      let updatedRequestId = existingRequest.id;

      const { data: updatedRows, error: updateError } = await supabase
        .from("friend_requests")
        .update({
          sender_id: currentUserId,
          receiver_id: targetUserId,
          status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingRequest.id)
        .select("id");

      if (updateError) {
        const { data: fallbackRows, error: fallbackError } = await supabase
          .from("friend_requests")
          .update({
            sender_id: currentUserId,
            receiver_id: targetUserId,
            status: "pending",
          })
          .eq("id", existingRequest.id)
          .select("id");

        if (fallbackError) throw new Error(fallbackError.message);
        updatedRequestId = (fallbackRows?.[0]?.id as string | undefined) || existingRequest.id;
      } else {
        updatedRequestId = (updatedRows?.[0]?.id as string | undefined) || existingRequest.id;
      }

      await createNotification(supabase, {
        user_id: targetUserId,
        actor_id: currentUserId,
        type: "friend_request",
        friend_request_id: updatedRequestId,
        message: "sent you a friend request.",
      });

      return { status: "outgoing_request", message: "Friend request sent.", requestId: updatedRequestId };
    }
  }

  const { data: insertedRows, error: insertError } = await supabase
    .from("friend_requests")
    .insert([{ sender_id: currentUserId, receiver_id: targetUserId, status: "pending" }])
    .select("id");

  if (insertError) {
    if (isDuplicateError(insertError)) {
      const duplicateRequest = await findExistingFriendRequest(supabase, currentUserId, targetUserId);

      if (duplicateRequest?.status === "accepted") {
        return { status: "friends", message: "You are already friends.", requestId: duplicateRequest.id };
      }

      if (duplicateRequest?.sender_id === currentUserId) {
        return { status: "outgoing_request", message: "Friend request already sent.", requestId: duplicateRequest.id };
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
  const existingRequest = await findExistingFriendRequest(supabase, currentUserId, targetUserId);

  const { error } = await supabase
    .from("friend_requests")
    .update({ status: "cancelled" })
    .eq("sender_id", currentUserId)
    .eq("receiver_id", targetUserId)
    .eq("status", "pending");

  if (error) throw new Error(error.message);

  if (existingRequest?.id) {
    await markFriendRequestNotificationsRead(supabase, existingRequest.id, targetUserId);
  }

  return true;
}

export async function acceptFriendRequest(
  supabase: SupabaseClient,
  currentUserId: string,
  senderUserId: string
) {
  await ensureOwnProfileRow(supabase, currentUserId);
  await ensureTargetProfileExists(supabase, senderUserId);

  const { data: request, error } = await supabase
    .from("friend_requests")
    .select("*")
    .eq("sender_id", senderUserId)
    .eq("receiver_id", currentUserId)
    .eq("status", "pending")
    .single();

  if (error || !request) throw new Error("No request found.");

  const { user_one, user_two } = getFriendshipPair(currentUserId, senderUserId);

  const { error: insertError } = await supabase.from("friendships").insert([{ user_one, user_two }]);

  if (insertError && !isDuplicateError(insertError)) {
    throw new Error(insertError.message);
  }

  const { error: updateError } = await supabase
    .from("friend_requests")
    .update({ status: "accepted" })
    .eq("id", request.id);

  if (updateError) throw new Error(updateError.message);

  await markFriendRequestNotificationsRead(supabase, request.id, currentUserId);

  await createNotification(supabase, {
    user_id: senderUserId,
    actor_id: currentUserId,
    type: "friend_accept",
    friend_request_id: request.id,
    message: "accepted your friend request.",
  });

  return true;
}

export async function declineFriendRequest(
  supabase: SupabaseClient,
  currentUserId: string,
  senderUserId: string
) {
  const existingRequest = await findExistingFriendRequest(supabase, currentUserId, senderUserId);

  const { error } = await supabase
    .from("friend_requests")
    .update({ status: "declined" })
    .eq("sender_id", senderUserId)
    .eq("receiver_id", currentUserId)
    .eq("status", "pending");

  if (error) throw new Error(error.message);

  if (existingRequest?.id) {
    await markFriendRequestNotificationsRead(supabase, existingRequest.id, currentUserId);
  }

  return true;
}

export async function removeFriend(
  supabase: SupabaseClient,
  currentUserId: string,
  targetUserId: string
) {
  const { user_one, user_two } = getFriendshipPair(currentUserId, targetUserId);

  const { error: friendshipError } = await supabase
    .from("friendships")
    .delete()
    .eq("user_one", user_one)
    .eq("user_two", user_two);

  if (friendshipError) throw new Error(friendshipError.message);

  const { error: requestError } = await supabase
    .from("friend_requests")
    .delete()
    .eq("status", "accepted")
    .or(getFriendPairFilter(currentUserId, targetUserId));

  if (requestError) throw new Error(requestError.message);

  return true;
}

import { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

type DashboardRealtimeOptions = {
  supabase: SupabaseClient;
  currentUserId?: string | null;
  onPostsChange?: () => void | Promise<void>;
  onLikesChange?: () => void | Promise<void>;
  onCommentsChange?: () => void | Promise<void>;
  onFriendRequestsChange?: () => void | Promise<void>;
  onNotificationsChange?: () => void | Promise<void>;
};

export function createDashboardRealtime({
  supabase,
  currentUserId,
  onPostsChange,
  onLikesChange,
  onCommentsChange,
  onFriendRequestsChange,
  onNotificationsChange,
}: DashboardRealtimeOptions): RealtimeChannel {
  const channel = supabase.channel(
    `dashboard-realtime-${currentUserId || "guest"}-${Date.now()}`
  );

  if (onPostsChange) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "posts",
      },
      async () => {
        await onPostsChange();
      }
    );
  }

  if (onLikesChange) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "likes",
      },
      async () => {
        await onLikesChange();
      }
    );
  }

  if (onCommentsChange) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "comments",
      },
      async () => {
        await onCommentsChange();
      }
    );
  }

  if (onFriendRequestsChange && currentUserId) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "friend_requests",
        filter: `receiver_id=eq.${currentUserId}`,
      },
      async () => {
        await onFriendRequestsChange();
      }
    );

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "friend_requests",
        filter: `sender_id=eq.${currentUserId}`,
      },
      async () => {
        await onFriendRequestsChange();
      }
    );
  }

  if (onNotificationsChange && currentUserId) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${currentUserId}`,
      },
      async () => {
        await onNotificationsChange();
      }
    );
  }

  channel.subscribe();

  return channel;
}

export async function removeDashboardRealtime(
  supabase: SupabaseClient,
  channel: RealtimeChannel | null | undefined
) {
  if (!channel) return;
  await supabase.removeChannel(channel);
}

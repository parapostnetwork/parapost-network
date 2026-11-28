import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import {
  isCommunityStagingTarget,
  communityServerTargetAllowed,
} from "@/lib/community/release-target";

export const runtime = "nodejs";

// PARAPOST STAGING WEB PUSH NOTIFICATION ROUTE - ADVANCED v2
// Keeps internal Parachat grouping values out of Android push notification bodies.

type NotificationRecord = {
  id?: string | null;
  user_id?: string | null;
  actor_id?: string | null;
  type?: string | null;
  post_id?: string | null;
  comment_id?: string | null;
  friend_request_id?: string | null;
  parachat_group_conversation_id?: string | null;
  parachat_group_message_id?: string | null;
  message?: string | null;
};

type DatabaseWebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: NotificationRecord | null;
};

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

function getNotificationBody(record: NotificationRecord) {
  const type = (record.type || "").toLowerCase();

  // Handle Parachat before reading record.message because Parachat can store
  // internal grouping values such as "parachat_group_count:1" in that field.
  if (type === "parachat_group_invitation") {
    return "You have been invited to join a Parachat group.";
  }

  if (type === "parachat_group_message") {
    return "New Parachat group message";
  }

  if (type === "parachat_message") {
    return "New Parachat message";
  }

  if (type === "parachat_photo") {
    return "New Parachat photo";
  }

  const message = record.message?.trim();
  if (
    message &&
    /^parachat_group_count:\d+$/i.test(message)
  ) {
    return "New Parachat message";
  }

  if (message) return message;

  if (type.includes("friend_request")) {
    return "You have a new friend request.";
  }

  if (type.includes("friend_accept")) {
    return "A friend request was accepted.";
  }

  if (type.includes("badge")) {
    return "You have a new Parapost badge update.";
  }

  if (type.includes("reel")) {
    return "You have new Parapost Reels activity.";
  }

  if (type.includes("comment") || type.includes("reply")) {
    return "Someone interacted with one of your posts.";
  }

  if (type.includes("like")) {
    return "Someone liked your Parapost activity.";
  }

  return "You have a new Parapost notification.";
}

function getNotificationTitle(record: NotificationRecord) {
  const type = (record.type || "").toLowerCase();

  if (
    type === "parachat_message" ||
    type === "parachat_photo"
  ) return "Parapost Network";
  if (type.includes("friend_request")) return "New friend request";
  if (type.includes("friend_accept")) return "Friend request accepted";
  if (type.includes("badge")) return "Parapost badge update";
  if (type.includes("reel")) return "Parapost Reels";

  return "Parapost Network";
}

export async function POST(req: Request) {
  try {
    const webhookSecret = process.env.PUSH_WEBHOOK_SECRET?.trim();
    const authorization = req.headers.get("authorization");

    if (!webhookSecret || authorization !== `Bearer ${webhookSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY?.trim();

    if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
      console.error("Push sender environment configuration is incomplete.");
      return NextResponse.json(
        { error: "Push sender is not configured." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as DatabaseWebhookPayload;
    const record = body.record;

    if (
      body.type !== "INSERT" ||
      body.schema !== "public" ||
      body.table !== "notifications" ||
      !record?.user_id
    ) {
      return NextResponse.json({ ignored: true });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    let destination = "/notifications";
    let groupMention = false;

    const groupInvitation =
      record.type === "parachat_group_invitation";

    const groupNotification =
      groupInvitation ||
      record.type === "parachat_group_message";

    if (groupNotification) {
      if (
        !isCommunityStagingTarget(supabaseUrl) ||
        !communityServerTargetAllowed(supabaseUrl)
      ) {
        return NextResponse.json({ ignored: true });
      }

      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (!record.id || !uuid.test(record.id)) {
        return NextResponse.json({ ignored: true });
      }

      const { data: notification, error: notificationError } =
        await supabase
          .from("notifications")
          .select("id,parachat_group_conversation_id,is_read,message")
          .eq("id", record.id)
          .eq("user_id", record.user_id)
          .eq(
            "type",
            groupInvitation
              ? "parachat_group_invitation"
              : "parachat_group_message"
          )
          .maybeSingle();

      if (notificationError) {
        return NextResponse.json(
          { error: "Could not verify group notification." },
          { status: 500 }
        );
      }

      const conversationId =
        notification?.parachat_group_conversation_id;

      if (
        !notification ||
        notification.is_read ||
        !conversationId ||
        !uuid.test(conversationId)
      ) {
        return NextResponse.json({ ignored: true });
      }

      groupMention = !groupInvitation &&
        notification.message ===
        "You were mentioned in a Parachat group.";

      destination = `/messages/groups/${conversationId}`;
    }

    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth_key")
      .eq("user_id", record.user_id);

    if (error) {
      console.error("Push subscription lookup failed:", error.message);
      return NextResponse.json(
        { error: "Could not load push subscriptions." },
        { status: 500 }
      );
    }

    const subscriptions = (data || []) as PushSubscriptionRow[];

    if (subscriptions.length === 0) {
      return NextResponse.json({ sent: 0, removed: 0, failed: 0 });
    }

    // Respect the account-wide Parapost push preference.
    // Check only when this recipient has a registered subscription.
    const { data: pushPreference, error: pushPreferenceError } =
      await supabase
        .from("user_preferences")
        .select("push_notifications_enabled")
        .eq("user_id", record.user_id)
        .maybeSingle();

    if (pushPreferenceError) {
      console.error(
        "Push preference lookup failed:",
        pushPreferenceError.message
      );

      return NextResponse.json(
        { error: "Could not verify push notification preferences." },
        { status: 500 }
      );
    }

    // No preference record means the default is ON.
    if (pushPreference?.push_notifications_enabled === false) {
      return NextResponse.json({
        sent: 0,
        removed: 0,
        failed: 0,
        disabled: true,
      });
    }

    webpush.setVapidDetails(
      "https://parapost.net",
      vapidPublicKey,
      vapidPrivateKey
    );

    if (groupNotification) {
      const { data: allowedDestination, error: eligibilityError } =
        await supabase.rpc(
          groupInvitation
            ? "parachat_group_invitation_push_destination"
            : "parachat_group_push_destination",
          {
            p_notification_id: record.id,
            p_recipient_id: record.user_id,
          }
        );

      if (eligibilityError) {
        return NextResponse.json(
          { error: "Could not verify group notification eligibility." },
          { status: 500 }
        );
      }

      if (
        typeof allowedDestination !== "string" ||
        destination !== `/messages/groups/${allowedDestination}`
      ) {
        return NextResponse.json({
          ignored: true,
        });
      }
    }

    const payload = JSON.stringify({
      recipientUserId: record.user_id,
      title: getNotificationTitle(record),
      body: groupMention
      ? "You were mentioned in a Parachat group."
      : getNotificationBody(record),
      icon: "/icons/parapost-192.png",
      badge: "/icons/parapost-notification-badge.png",
      url: destination,
    });

    let sent = 0;
    let removed = 0;
    let failed = 0;

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth_key,
              },
            },
            payload,
            {
              TTL: groupNotification
                ? 60
                : 60 * 60,
            }
          );

          sent += 1;
        } catch (error) {
          const pushError = error as {
            statusCode?: number;
            message?: string;
          };

          if (pushError.statusCode === 404 || pushError.statusCode === 410) {
            const { error: deleteError } = await supabase
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", subscription.endpoint);

            if (deleteError) {
              console.warn(
                "Expired push subscription cleanup failed:",
                deleteError.message
              );
            } else {
              removed += 1;
            }

            return;
          }

          failed += 1;
          console.warn(
            "Push delivery failed:",
            pushError.message || "Unknown web push error"
          );
        }
      })
    );

    return NextResponse.json({ sent, removed, failed });
  } catch (error) {
    console.error("Push notification webhook error:", error);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export const runtime = "nodejs";

type NotificationRecord = {
  id?: string | null;
  user_id?: string | null;
  actor_id?: string | null;
  type?: string | null;
  post_id?: string | null;
  comment_id?: string | null;
  friend_request_id?: string | null;
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
  const message = record.message?.trim();
  if (message) return message;

  const type = (record.type || "").toLowerCase();

  if (type === "parachat_message") {
    return "You have a new Parachat message.";
  }

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

  if (type === "parachat_message") return "New Parachat message";
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

    webpush.setVapidDetails(
      "https://parapost.net",
      vapidPublicKey,
      vapidPrivateKey
    );

    const payload = JSON.stringify({
      title: getNotificationTitle(record),
      body: getNotificationBody(record),
      icon: "/icons/parapost-192.png",
      badge: "/icons/parapost-192.png",
      url: "/notifications",
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
              TTL: 60 * 60,
            }
          );

          sent += 1;
        } catch (error) {
          const pushError = error as { statusCode?: number; message?: string };

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

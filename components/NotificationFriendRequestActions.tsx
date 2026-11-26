"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  acceptFriendRequest,
  declineFriendRequest,
} from "@/lib/friends";

type RequestNotice = {
  type: string | null;
  friend_request_id?: string | null;
  is_read: boolean | null;
};

export function usePendingNotificationRequests(
  userId: string | null | undefined,
  notices: RequestNotice[]
) {
  const [pending, setPending] = useState<Set<string>>(new Set());

  const requestKey = notices
    .filter(n => n.type === "friend_request" && n.friend_request_id)
    .map(n => `${n.friend_request_id}:${n.is_read ? 1 : 0}`)
    .sort()
    .join(",");

  useEffect(() => {
    let active = true;
    setPending(new Set());

    if (!userId || !requestKey) return;

    const ids = Array.from(new Set(
      requestKey.split(",").map(value => value.split(":")[0])
    ));

    void (async () => {
      const { data, error } = await supabase
        .from("friend_requests")
        .select("id")
        .eq("receiver_id", userId)
        .eq("status", "pending")
        .in("id", ids);

      if (active && !error) {
        setPending(new Set((data || []).map(row => row.id)));
      }
    })();

    return () => { active = false; };
  }, [userId, requestKey]);

  return pending;
}

export default function NotificationFriendRequestActions({
  userId,
  senderId,
  requestId,
  onResolved,
}: {
  userId: string;
  senderId: string;
  requestId: string;
  onResolved: () => void;
}) {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState(false);

  async function respond(action: "accept" | "decline") {
    if (busyRef.current || resolved) return;

    busyRef.current = true;
    setBusy(true);

    try {
      const { data, error } = await supabase
        .from("friend_requests")
        .select("id")
        .eq("id", requestId)
        .eq("sender_id", senderId)
        .eq("receiver_id", userId)
        .eq("status", "pending")
        .maybeSingle();

      if (error) throw new Error(error.message);

      if (!data) {
        setResolved(true);
        onResolved();
        return;
      }

      if (action === "accept") {
        await acceptFriendRequest(supabase, userId, senderId);
      } else {
        await declineFriendRequest(supabase, userId, senderId);
      }

      setResolved(true);
      onResolved();
    } catch (error) {
      window.alert(error instanceof Error
        ? error.message
        : "Unable to respond to friend request.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (resolved) return null;

  return (
    <div style={{
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 5,
    }}>
      {(["accept", "decline"] as const).map(action => (
        <button
          key={action}
          type="button"
          disabled={busy}
          onClick={event => {
            event.stopPropagation();
            void respond(action);
          }}
          style={{
            padding: "8px 18px",
            minHeight: 36,
            border: "1px solid rgba(180,150,230,.2)",
            borderRadius: 9,
            background: action === "accept"
              ? "#65478e"
              : "rgba(255,255,255,.08)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 650,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {action === "accept" ? "Accept" : "Decline"}
        </button>
      ))}
    </div>
  );
}

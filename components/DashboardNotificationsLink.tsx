"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type NotificationRow = {
  id: string;
  user_id: string;
  actor_id: string;
  type: "friend_request" | "friend_accept" | "post_like" | "comment_like" | "comment_reply";
  post_id: string | null;
  comment_id: string | null;
  friend_request_id: string | null;
  message: string | null;
  is_read: boolean;
  created_at: string;
};

type DashboardNotificationsLinkProps = {
  navItemStyle: React.CSSProperties;
  icon?: React.ReactNode;
};

export default function DashboardNotificationsLink({
  navItemStyle,
  icon,
}: DashboardNotificationsLinkProps) {
  const [currentUserId, setCurrentUserId] = useState("");
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  const unreadNotificationCount = useMemo(() => {
    return notifications.filter((item) => !item.is_read).length;
  }, [notifications]);

  const fetchNotifications = useCallback(async (userId?: string) => {
    if (!userId) {
      setNotifications([]);
      return;
    }

    const { data, error } = await supabase
      .from("notifications")
      .select("id, user_id, actor_id, type, post_id, comment_id, friend_request_id, message, is_read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) {
      console.error("Error fetching notifications:", error.message);
      setNotifications([]);
      return;
    }

    setNotifications((data || []) as NotificationRow[]);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        setCurrentUserId("");
        setNotifications([]);
        return;
      }

      setCurrentUserId(user.id);
      await fetchNotifications(user.id);
    };

    initialize();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`dashboard-notifications-link-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        async () => {
          await fetchNotifications(currentUserId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, fetchNotifications]);

  return (
    <Link
      href="/notifications"
      style={{
        ...navItemStyle,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        textDecoration: "none",
        color: "white",
        gap: "10px",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {icon}
        Notifications
      </span>

      {unreadNotificationCount > 0 && (
        <span
          style={{
            minWidth: "22px",
            height: "22px",
            borderRadius: "999px",
            background: "white",
            color: "black",
            fontSize: "12px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 6px",
          }}
        >
          {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
        </span>
      )}
    </Link>
  );
}

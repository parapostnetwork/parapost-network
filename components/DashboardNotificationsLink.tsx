"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type DashboardNotificationsLinkProps = {
  navItemStyle: React.CSSProperties;
  icon?: React.ReactNode;
};

export default function DashboardNotificationsLink({
  navItemStyle,
  icon,
}: DashboardNotificationsLinkProps) {
  const [currentUserId, setCurrentUserId] = useState("");
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  const fetchUnreadNotificationCount = useCallback(async (userId?: string) => {
    if (!userId) {
      setUnreadNotificationCount(0);
      return;
    }

    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) {
      console.error("Error fetching notification count:", error.message);
      setUnreadNotificationCount(0);
      return;
    }

    setUnreadNotificationCount(count ?? 0);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        setCurrentUserId("");
        setUnreadNotificationCount(0);
        return;
      }

      setCurrentUserId(user.id);
      await fetchUnreadNotificationCount(user.id);
    };

    initialize();
  }, [fetchUnreadNotificationCount]);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`dashboard-notifications-link-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        async () => {
          await fetchUnreadNotificationCount(currentUserId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, fetchUnreadNotificationCount]);

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

"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

type ProfilePreview = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_online?: boolean | null;
};

export default function NotificationsPage() {
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState("");
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, ProfilePreview>>({});
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications]
  );

  const showStatus = useCallback((message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => {
      setStatusMessage("");
    }, 2500);
  }, []);

  const fetchProfilesMap = useCallback(async (userIds: string[]) => {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];

    if (uniqueIds.length === 0) {
      setProfilesMap({});
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, is_online")
      .in("id", uniqueIds);

    if (error) {
      console.error("Error fetching notification profiles:", error.message);
      return;
    }

    const nextMap: Record<string, ProfilePreview> = {};
    for (const profile of data || []) {
      nextMap[profile.id] = profile as ProfilePreview;
    }

    setProfilesMap(nextMap);
  }, []);

  const fetchNotifications = useCallback(async (userId: string) => {
    setLoading(true);

    const { data, error } = await supabase
      .from("notifications")
      .select("id, user_id, actor_id, type, post_id, comment_id, friend_request_id, message, is_read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching notifications:", error.message);
      setNotifications([]);
      setLoading(false);
      return;
    }

    const rows = (data || []) as NotificationRow[];
    setNotifications(rows);

    const actorIds = rows.map((item) => item.actor_id).filter(Boolean);
    await fetchProfilesMap(actorIds);

    setLoading(false);
  }, [fetchProfilesMap]);

  useEffect(() => {
    const initialize = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        setCurrentUserId("");
        setNotifications([]);
        setLoading(false);
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
      .channel(`notifications-page-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        async () => {
          await fetchNotifications(currentUserId);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        async () => {
          await fetchNotifications(currentUserId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, fetchNotifications]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setOpenMenuId(null);
      }
    };

    const handleScroll = () => setOpenMenuId(null);

    window.addEventListener("click", handleClickOutside);
    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("click", handleClickOutside);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const markAsRead = async (notificationId: string) => {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId);

    if (error) {
      console.error("Mark read error:", error.message);
      return false;
    }

    setNotifications((prev) =>
      prev.map((item) =>
        item.id === notificationId ? { ...item, is_read: true } : item
      )
    );

    return true;
  };

  const getNotificationDestination = (notification: NotificationRow) => {
    if (notification.type === "friend_request") return "/friends/requests";
    if (notification.type === "friend_accept") return "/friends";
    if (notification.post_id) return `/dashboard#post-${notification.post_id}`;
    if (notification.actor_id) return `/profile/${notification.actor_id}`;
    return "/notifications";
  };

  const handleOpenNotification = async (notification: NotificationRow) => {
    setProcessingId(notification.id);
    setOpenMenuId(null);

    if (!notification.is_read) {
      await markAsRead(notification.id);
    }

    const destination = getNotificationDestination(notification);
    router.push(destination);
    setProcessingId(null);
  };

  const handleDeleteNotification = async (notificationId: string) => {
    setProcessingId(notificationId);
    setOpenMenuId(null);

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", notificationId);

    if (error) {
      alert(`Delete notification error: ${error.message}`);
      setProcessingId(null);
      return;
    }

    setNotifications((prev) => prev.filter((item) => item.id !== notificationId));
    setProcessingId(null);
    showStatus("Notification deleted.");
  };

  const handleMarkAllRead = async () => {
    if (!currentUserId) return;

    const unreadIds = notifications.filter((item) => !item.is_read).map((item) => item.id);
    if (unreadIds.length === 0) {
      showStatus("No unread notifications.");
      return;
    }

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", currentUserId)
      .eq("is_read", false);

    if (error) {
      alert(`Mark all read error: ${error.message}`);
      return;
    }

    setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
    showStatus("All notifications marked as read.");
  };

  const getInitial = (name?: string | null, username?: string | null) => {
    const value = name || username || "U";
    return value.charAt(0).toUpperCase();
  };

  const formatRelativeTime = (value?: string | null) => {
    if (!value) return "Just now";

    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return "Just now";

    const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;

    const years = Math.floor(days / 365);
    return `${years}y ago`;
  };

  const getNotificationTargetLabel = (notification: NotificationRow) => {
    if (notification.type === "friend_request") return "Opens Friend Requests";
    if (notification.type === "friend_accept") return "Opens Friends List";
    if (notification.post_id) return "Opens related post";
    if (notification.actor_id) return "Opens profile";
    return "Open";
  };

  const getNotificationMessage = (notification: NotificationRow) => {
    const actor = profilesMap[notification.actor_id];
    const actorName = actor?.full_name || actor?.username || "Someone";

    if (notification.type === "friend_request") {
      return `${actorName} sent you a friend request.`;
    }

    if (notification.type === "friend_accept") {
      return `${actorName} accepted your friend request.`;
    }

    if (notification.message) {
      return `${actorName} ${notification.message}`;
    }

    return `${actorName} sent you a notification.`;
  };

  return (
    <div className="min-h-screen bg-[#07090d] text-white">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
        <div
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 100%)",
            borderRadius: "28px",
            padding: "20px",
            border: "1px solid rgba(255,255,255,0.10)",
            backdropFilter: "blur(10px)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "18px",
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 800 }}>Notifications</h1>
              <p style={{ margin: "6px 0 0", color: "#9ca3af", fontSize: "14px" }}>
                Friend requests open Friend Requests. Friend accepts open your Friends list.
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <Link href="/dashboard" style={secondaryLinkStyle}>
                Back to Dashboard
              </Link>
              <span style={countPillStyle}>{notifications.length} total</span>
              <span style={unreadPillStyle}>{unreadCount} unread</span>
              <button type="button" onClick={handleMarkAllRead} style={secondaryButtonStyle}>
                Mark all read
              </button>
            </div>
          </div>

          {statusMessage && (
            <div
              style={{
                marginBottom: "16px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "#f9fafb",
                borderRadius: "18px",
                padding: "12px 14px",
              }}
            >
              {statusMessage}
            </div>
          )}

          {loading ? (
            <p style={{ color: "#9ca3af", margin: 0 }}>Loading notifications...</p>
          ) : notifications.length === 0 ? (
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: "24px",
                padding: "24px",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: "8px", fontSize: "20px" }}>No notifications yet</h2>
              <p style={{ margin: 0, color: "#9ca3af", lineHeight: 1.6 }}>
                When someone sends a friend request, accepts one, or interacts with your content, it will show up here.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {notifications.map((notification) => {
                const actor = profilesMap[notification.actor_id];
                const actorName = actor?.full_name || actor?.username || "Unnamed User";
                const isBusy = processingId === notification.id;

                return (
                  <div
                    key={notification.id}
                    style={{
                      ...notificationCardStyle,
                      background: notification.is_read
                        ? "linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.03) 100%)"
                        : "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.05) 100%)",
                      opacity: isBusy ? 0.8 : 1,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "14px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        <div
                          style={{
                            position: "relative",
                            width: "54px",
                            height: "54px",
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {actor?.avatar_url ? (
                            <img
                              src={actor.avatar_url}
                              alt={actorName}
                              style={{
                                width: "54px",
                                height: "54px",
                                borderRadius: "50%",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "54px",
                                height: "54px",
                                borderRadius: "50%",
                                background: "#374151",
                                color: "#f9fafb",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: "18px",
                              }}
                            >
                              {getInitial(actor?.full_name, actor?.username)}
                            </div>
                          )}

                          {actor?.is_online && (
                            <span
                              style={{
                                position: "absolute",
                                bottom: "2px",
                                right: "2px",
                                width: "12px",
                                height: "12px",
                                borderRadius: "50%",
                                background: "#22c55e",
                                border: "2px solid #07090d",
                                boxShadow: "0 0 6px rgba(34,197,94,0.6)",
                              }}
                            />
                          )}
                        </div>

                        <div style={{ minWidth: 0, textAlign: "left", flex: 1 }}>
                          <div
                            style={{
                              color: "#f9fafb",
                              fontWeight: 700,
                              fontSize: "16px",
                              marginBottom: "6px",
                            }}
                          >
                            {getNotificationMessage(notification)}
                          </div>

                          <div style={{ color: "#9ca3af", fontSize: "13px", marginBottom: "6px" }}>
                            @{actor?.username || "no-username"} · {formatRelativeTime(notification.created_at)}
                          </div>

                          <div style={{ color: "#d1d5db", fontSize: "13px" }}>
                            {getNotificationTargetLabel(notification)}
                          </div>
                        </div>
                      </div>

                      <div
                        ref={openMenuId === notification.id ? menuRef : null}
                        style={{ display: "flex", alignItems: "center", gap: "10px", position: "relative" }}
                      >
                        {!notification.is_read && <span style={unreadDotStyle} />}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId((prev) => (prev === notification.id ? null : notification.id));
                          }}
                          style={dotsButtonStyle}
                        >
                          <DotsIcon />
                        </button>

                        {openMenuId === notification.id && (
                          <div style={menuStyle}>
                            <button
                              type="button"
                              onClick={() => handleOpenNotification(notification)}
                              style={menuItemStyle}
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteNotification(notification.id)}
                              style={{ ...menuItemStyle, color: "#fca5a5" }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DotsIcon() {
  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: "3px",
        width: "16px",
        height: "16px",
      }}
      aria-hidden="true"
    >
      <span style={dotStyle} />
      <span style={dotStyle} />
      <span style={dotStyle} />
    </span>
  );
}

const dotStyle: CSSProperties = {
  width: "4px",
  height: "4px",
  borderRadius: "50%",
  background: "#f9fafb",
};

const secondaryLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "42px",
  padding: "0 16px",
  borderRadius: "999px",
  textDecoration: "none",
  color: "#f9fafb",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.10)",
  fontWeight: 600,
};

const secondaryButtonStyle: CSSProperties = {
  minHeight: "42px",
  padding: "0 16px",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#f9fafb",
  fontWeight: 600,
  cursor: "pointer",
};

const countPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "42px",
  padding: "0 14px",
  borderRadius: "999px",
  color: "#f9fafb",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  fontWeight: 700,
  fontSize: "14px",
};

const unreadPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "42px",
  padding: "0 14px",
  borderRadius: "999px",
  color: "#86efac",
  background: "rgba(34,197,94,0.10)",
  border: "1px solid rgba(34,197,94,0.24)",
  fontWeight: 700,
  fontSize: "14px",
};

const notificationCardStyle: CSSProperties = {
  width: "100%",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "24px",
  padding: "16px",
  boxShadow: "0 10px 26px rgba(0,0,0,0.24)",
};

const unreadDotStyle: CSSProperties = {
  width: "10px",
  height: "10px",
  borderRadius: "50%",
  background: "#22c55e",
  boxShadow: "0 0 8px rgba(34,197,94,0.7)",
};

const dotsButtonStyle: CSSProperties = {
  width: "38px",
  height: "38px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.05)",
  color: "#f9fafb",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
};

const menuStyle: CSSProperties = {
  position: "absolute",
  top: "44px",
  right: 0,
  minWidth: "140px",
  borderRadius: "16px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "#111827",
  boxShadow: "0 14px 30px rgba(0,0,0,0.35)",
  overflow: "hidden",
  zIndex: 50,
};

const menuItemStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  background: "transparent",
  border: "none",
  color: "#f9fafb",
  padding: "12px 14px",
  cursor: "pointer",
  fontSize: "14px",
};

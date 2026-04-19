"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type NotificationType =
  | "friend_request"
  | "friend_accept"
  | "post_like"
  | "comment_like"
  | "comment_reply";

type NotificationRow = {
  id: string;
  user_id: string;
  actor_id: string;
  type: NotificationType;
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

const pageShellStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#07090d",
  color: "white",
};

const containerStyle: CSSProperties = {
  maxWidth: "1180px",
  margin: "0 auto",
  padding: "24px 16px 48px",
};

const cardStyle: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 100%)",
  borderRadius: "28px",
  padding: "18px",
  border: "1px solid rgba(255,255,255,0.10)",
  backdropFilter: "blur(10px)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
};

const primaryButtonStyle: CSSProperties = {
  background: "white",
  color: "#07090d",
  border: "none",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 600,
  fontSize: "14px",
  cursor: "pointer",
};

const pillStyle: CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  color: "#d1d5db",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "999px",
  padding: "8px 12px",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};

const activePillStyle: CSSProperties = {
  ...pillStyle,
  background: "white",
  color: "#07090d",
  border: "1px solid white",
};

const metaPillStyle: CSSProperties = {
  fontSize: "12px",
  color: "#d1d5db",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "999px",
  padding: "6px 10px",
  whiteSpace: "nowrap",
};

function getInitial(name?: string | null, username?: string | null) {
  const value = name || username || "U";
  return value.charAt(0).toUpperCase();
}

function formatNotificationType(type: NotificationType) {
  switch (type) {
    case "friend_request":
      return "Friend Request";
    case "friend_accept":
      return "Friend Accepted";
    case "post_like":
      return "Post Like";
    case "comment_like":
      return "Comment Like";
    case "comment_reply":
      return "Comment Reply";
    default:
      return "Notification";
  }
}

function fallbackMessage(item: NotificationRow, actorName: string) {
  switch (item.type) {
    case "friend_request":
      return `${actorName} sent you a friend request.`;
    case "friend_accept":
      return `${actorName} accepted your friend request.`;
    case "post_like":
      return `${actorName} liked your post.`;
    case "comment_like":
      return `${actorName} liked your comment.`;
    case "comment_reply":
      return `${actorName} replied to your comment.`;
    default:
      return `${actorName} interacted with your account.`;
  }
}

export default function NotificationsPage() {
  const [currentUserId, setCurrentUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, ProfilePreview>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "unread">("all");
  const [markingAllRead, setMarkingAllRead] = useState(false);

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
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching notifications:", error.message);
      setNotifications([]);
      setLoading(false);
      return;
    }

    const rows = (data || []) as NotificationRow[];
    setNotifications(rows);
    await fetchProfilesMap(rows.map((item) => item.actor_id));
    setLoading(false);
  }, [fetchProfilesMap]);

  useEffect(() => {
    const initializePage = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        setCurrentUserId("");
        setUserEmail("");
        setNotifications([]);
        setLoading(false);
        return;
      }

      setCurrentUserId(user.id);
      setUserEmail(user.email || "");
      await fetchNotifications(user.id);
    };

    initializePage();
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, fetchNotifications]);

  const unreadCount = useMemo(() => {
    return notifications.filter((item) => !item.is_read).length;
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    if (activeTab === "unread") {
      return notifications.filter((item) => !item.is_read);
    }
    return notifications;
  }, [activeTab, notifications]);

  const handleMarkOneRead = async (notificationId: string) => {
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", notificationId);

    if (error) {
      console.error("Error marking notification read:", error.message);
      return;
    }

    setNotifications((prev) =>
      prev.map((item) => (item.id === notificationId ? { ...item, is_read: true } : item))
    );
  };

  const handleMarkAllRead = async () => {
    if (!currentUserId || unreadCount === 0) return;

    setMarkingAllRead(true);

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", currentUserId)
      .eq("is_read", false);

    if (error) {
      console.error("Error marking all notifications read:", error.message);
      setMarkingAllRead(false);
      return;
    }

    setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
    setMarkingAllRead(false);
  };

  const getNotificationHref = (item: NotificationRow) => {
    if (item.post_id) return `/dashboard#post-${item.post_id}`;
    if (item.actor_id) return `/profile/${item.actor_id}`;
    return "/dashboard";
  };

  return (
    <div style={pageShellStyle}>
      <div style={containerStyle}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            gap: "20px",
          }}
        >
          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "14px",
                flexWrap: "wrap",
                marginBottom: "14px",
              }}
            >
              <div>
                <p
                  style={{
                    margin: "0 0 8px",
                    color: "#9ca3af",
                    fontSize: "13px",
                    letterSpacing: "0.02em",
                    textTransform: "uppercase",
                  }}
                >
                  Parapost Network
                </p>
                <h1 style={{ margin: "0 0 8px", fontSize: "30px", lineHeight: 1.1 }}>Notifications</h1>
                <p style={{ margin: 0, color: "#9ca3af", fontSize: "14px" }}>
                  Stay on top of likes, replies, follows, and community activity in one place.
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <Link href="/dashboard" style={{ ...secondaryButtonStyle, textDecoration: "none" }}>
                  Back to Dashboard
                </Link>
                <Link href={currentUserId ? `/profile/${currentUserId}` : "/dashboard"} style={{ ...secondaryButtonStyle, textDecoration: "none" }}>
                  View Profile
                </Link>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button onClick={() => setActiveTab("all")} style={activeTab === "all" ? activePillStyle : pillStyle}>
                  All
                </button>
                <button onClick={() => setActiveTab("unread")} style={activeTab === "unread" ? activePillStyle : pillStyle}>
                  Unread
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span style={metaPillStyle}>{unreadCount} unread</span>
                {userEmail ? <span style={metaPillStyle}>{userEmail}</span> : null}
                <button onClick={handleMarkAllRead} disabled={markingAllRead || unreadCount === 0} style={primaryButtonStyle}>
                  {markingAllRead ? "Updating..." : "Mark all as read"}
                </button>
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            {loading ? (
              <p style={{ margin: 0, color: "#9ca3af" }}>Loading notifications...</p>
            ) : !currentUserId ? (
              <p style={{ margin: 0, color: "#9ca3af" }}>You need to be logged in to view notifications.</p>
            ) : filteredNotifications.length === 0 ? (
              <div
                style={{
                  border: "1px dashed rgba(255,255,255,0.12)",
                  borderRadius: "24px",
                  padding: "20px",
                  color: "#9ca3af",
                }}
              >
                {activeTab === "unread"
                  ? "You’re all caught up. No unread notifications right now."
                  : "No notifications yet. Activity from your network will appear here."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {filteredNotifications.map((item) => {
                  const actor = profilesMap[item.actor_id];
                  const actorName = actor?.full_name || actor?.username || "Someone";
                  const href = getNotificationHref(item);

                  return (
                    <div
                      key={item.id}
                      style={{
                        background: item.is_read
                          ? "rgba(255,255,255,0.03)"
                          : "linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.05) 100%)",
                        border: item.is_read
                          ? "1px solid rgba(255,255,255,0.08)"
                          : "1px solid rgba(255,255,255,0.14)",
                        borderRadius: "24px",
                        padding: "16px",
                        boxShadow: item.is_read ? "none" : "0 8px 24px rgba(0,0,0,0.18)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: "14px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: "12px",
                            alignItems: "flex-start",
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          <div
                            style={{
                              position: "relative",
                              width: "48px",
                              height: "48px",
                              minWidth: "48px",
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {actor?.avatar_url ? (
                              <img
                                src={actor.avatar_url}
                                alt={actorName}
                                style={{
                                  width: "44px",
                                  height: "44px",
                                  borderRadius: "50%",
                                  objectFit: "cover",
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: "44px",
                                  height: "44px",
                                  borderRadius: "50%",
                                  background: "#374151",
                                  color: "#f9fafb",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: 700,
                                  fontSize: "16px",
                                }}
                              >
                                {getInitial(actor?.full_name, actor?.username)}
                              </div>
                            )}

                            {actor?.is_online ? (
                              <span
                                style={{
                                  position: "absolute",
                                  bottom: "1px",
                                  right: "1px",
                                  width: "12px",
                                  height: "12px",
                                  borderRadius: "50%",
                                  background: "#22c55e",
                                  border: "2px solid #07090d",
                                  boxShadow: "0 0 6px rgba(34,197,94,0.6)",
                                }}
                              />
                            ) : null}
                          </div>

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                flexWrap: "wrap",
                                marginBottom: "6px",
                              }}
                            >
                              <span style={{ fontWeight: 700, color: "#f9fafb" }}>{actorName}</span>
                              <span style={metaPillStyle}>{formatNotificationType(item.type)}</span>
                              {!item.is_read ? (
                                <span
                                  style={{
                                    ...metaPillStyle,
                                    color: "#86efac",
                                    border: "1px solid rgba(34,197,94,0.24)",
                                    background: "rgba(34,197,94,0.10)",
                                  }}
                                >
                                  New
                                </span>
                              ) : null}
                            </div>

                            <p
                              style={{
                                margin: "0 0 8px",
                                color: "#e5e7eb",
                                lineHeight: 1.6,
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              {item.message?.trim() || fallbackMessage(item, actorName)}
                            </p>

                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                flexWrap: "wrap",
                              }}
                            >
                              <span style={{ fontSize: "13px", color: "#9ca3af" }}>
                                {new Date(item.created_at).toLocaleString()}
                              </span>

                              <Link
                                href={href}
                                style={{
                                  color: "white",
                                  textDecoration: "none",
                                  fontWeight: 600,
                                  fontSize: "13px",
                                }}
                              >
                                Open
                              </Link>

                              {item.actor_id ? (
                                <Link
                                  href={`/profile/${item.actor_id}`}
                                  style={{
                                    color: "#d1d5db",
                                    textDecoration: "none",
                                    fontWeight: 600,
                                    fontSize: "13px",
                                  }}
                                >
                                  View profile
                                </Link>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {!item.is_read ? (
                          <button onClick={() => handleMarkOneRead(item.id)} style={secondaryButtonStyle}>
                            Mark as read
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div
            style={{
              ...cardStyle,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "14px",
            }}
          >
            <div
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "22px",
                padding: "16px",
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: "8px" }}>Notification Tips</h3>
              <p style={{ margin: 0, color: "#9ca3af", lineHeight: 1.7 }}>
                Use the unread tab to focus on fresh activity first, then switch back to all when you want the full history.
              </p>
            </div>

            <div
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "22px",
                padding: "16px",
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: "8px" }}>Launch Prep</h3>
              <p style={{ margin: 0, color: "#9ca3af", lineHeight: 1.7 }}>
                This page now visually matches the dashboard system so your launch testing feels consistent across core user flows.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

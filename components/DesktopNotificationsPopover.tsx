"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import NotificationFriendRequestActions, {
  usePendingNotificationRequests,
} from "@/components/NotificationFriendRequestActions";

import ResponsiveMediaImage from "@/components/ResponsiveMediaImage";

type Profile = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type Notice = {
  friend_request_id?: string | null;
  id: string;
  user_id: string;
  actor_id: string | null;
  type: string | null;
  message: string | null;
  is_read: boolean | null;
  created_at: string | null;
  post_id: string | null;
  reel_id: string | null;
  group_id?: string | null;
  creatorverse_page_id?: string | null;
  community_post_id?: string | null;
  community_comment_id?: string | null;
  actor?: Profile | null;
};

function destination(n: Notice) {
  const type = n.type || "";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (type === "group_shared_comment_mention" || type === "group_promotion_comment_mention") return `/notifications?mention=${encodeURIComponent(n.id)}`;

  if (type.startsWith("group_") || type.startsWith("creatorverse_")) {
    const creator = type.startsWith("creatorverse_");
    const id = creator ? n.creatorverse_page_id : n.group_id;
    if (!id || !uuid.test(id)) return "/notifications";

    const params = new URLSearchParams();
    if (n.community_post_id && uuid.test(n.community_post_id)) {
      params.set("post", n.community_post_id);
    }
    if (n.community_comment_id && uuid.test(n.community_comment_id)) {
      params.set("comment", n.community_comment_id);
    }
    const base = creator ? `/creatorverse/${id}` : `/groups/${id}`;
    return params.size ? `${base}?${params}` : base;
  }

  if (type === "friend_request") return "/friends/requests";
  if (type === "friend_accept") return "/friends";
  if (type.startsWith("parachat_")) {
    return n.actor_id ? `/messages?user=${n.actor_id}` : "/messages";
  }
  if (type.startsWith("reel_")) {
    return n.reel_id ? `/reels?reel=${n.reel_id}` : "/reels";
  }
  if (type.includes("live")) return "/live";
  if (type === "badge_award" || type === "achievement_award") {
    return `/profile/${n.user_id}`;
  }
  if (type === "post_mention" || type === "comment_mention") return `/notifications?mention=${encodeURIComponent(n.id)}`;
  if (n.post_id) {
    return `/dashboard?post=${n.post_id}#post-${n.post_id}`;
  }
  return n.actor_id ? `/profile/${n.actor_id}` : "/notifications";
}

function description(n: Notice, name: string) {
  if (n.message?.trim()) {
    const message = n.message.trim();
    return n.actor && name !== "Someone"
      ? message.replace(/^Someone\b/i, () => name)
      : message;
  }
  const t = n.type || "";
  if (t.includes("mention")) return `${name} mentioned you.`;
  if (t === "friend_request") return `${name} sent you a friend request.`;
  if (t === "friend_accept") return `${name} accepted your friend request.`;
  if (t.includes("follow")) return `${name} started following your page.`;
  if (t.includes("reply")) return `${name} replied to your comment.`;
  if (t.includes("comment")) return `${name} commented on your post.`;
  if (t.includes("like")) return `${name} liked your post.`;
  if (t.includes("share")) return `${name} shared your post.`;
  return `${name} interacted with your content.`;
}

function timeAgo(value: string | null) {
  if (!value) return "";
  const delta = Math.max(0, Date.now() - new Date(value).getTime());
  if (!Number.isFinite(delta)) return "";
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d`;
  return new Date(value).toLocaleDateString();
}

export default function DesktopNotificationsPopover({
  userId,
  count,
  icon,
  buttonStyle,
  onOpenPost,
  onOpenAll,
}: {
  userId: string;
  count: number;
  icon: ReactNode;
  buttonStyle: CSSProperties;
  onOpenPost?: (postId: string, shareId: string | null) => void;
  onOpenAll?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "all" | "friends" | "mentions" | "unread" | "activity"
  >("all");
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const [rowMenuPosition, setRowMenuPosition] = useState({ top: 0, right: 0 });

  useEffect(() => {
    const closeMenu = () => setRowMenuId(null);
    window.addEventListener("resize", closeMenu);
    return () => window.removeEventListener("resize", closeMenu);
  }, []);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRowMenuId(null);

    let active = true;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    async function load() {
      setLoading(true);
      setError("");

      const { data, error: loadError } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(15);

      if (!active) return;
      if (loadError) {
        setError("Unable to load notifications.");
        setLoading(false);
        return;
      }

      const rows = (data || []) as unknown as Notice[];
      const ids = [...new Set(rows.map(n => n.actor_id).filter((id): id is string => !!id))];
      let profiles: Profile[] = [];

      if (ids.length) {
        const { data: result } = await supabase
          .from("profiles")
          .select("id, full_name, username, avatar_url")
          .in("id", ids);
        profiles = (result || []) as Profile[];
      }

      if (!active) return;
      const byId = new Map(profiles.map(p => [p.id, p]));
      setItems(rows.map(n => ({
        ...n,
        actor: n.actor_id ? byId.get(n.actor_id) || null : null,
      })));
      setLoading(false);
    }

    if (userId) void load();
    else {
      setLoading(false);
      setItems([]);
    }

    return () => {
      active = false;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, userId]);

  async function openNotice(n: Notice) {
    if (!n.is_read) {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", n.id)
        .eq("user_id", userId);
    }
    setOpen(false);

    const type = n.type || "";
    const isDashboardPost =
      Boolean(n.post_id) &&
      (type.startsWith("post_") ||
        type.startsWith("comment_") ||
        type === "share");

    if (isDashboardPost && (!type.includes("mention") || type === "post_mention") && n.post_id && onOpenPost) {
      const shareId =
        (n as Notice & { share_id?: string | null }).share_id ?? null;

      onOpenPost(n.post_id, shareId);
      return;
    }

    const href = destination(n);
    if (href.startsWith("/notifications?mention=")) {
      const target = new URL(href, window.location.origin);
      target.searchParams.set("returnTo", window.location.pathname + window.location.search + window.location.hash);
      window.location.assign(target.href);
      return;
    }
    window.location.assign(href);
  }

  async function markAllRead() {
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (updateError) {
      setError("Could not mark notifications as read.");
      return;
    }

    setItems(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  async function deleteNotifications(id?: string) {
    if (!userId || deleting || loading) return;

    const confirmed = window.confirm(
      id
        ? "Delete this notification?"
        : "Delete all notifications? This cannot be undone."
    );
    if (!confirmed) return;

    setDeleting(true);
    setRowMenuId(null);

    try {
      let query = supabase
        .from("notifications")
        .delete()
        .eq("user_id", userId);

      if (id) query = query.eq("id", id);

      const { error: deleteError } = await query;
      if (deleteError) throw deleteError;

      setItems(prev => id ? prev.filter(n => n.id !== id) : []);
    } catch {
      window.alert("Could not delete notifications. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  const pendingRequests = usePendingNotificationRequests(
    open ? userId : null, items
  );
  const visible = items.filter(n => {
    const type = (n.type || "").toLowerCase();
    if (activeFilter === "unread") return !n.is_read;
    if (activeFilter === "friends") return type.includes("friend");
    if (activeFilter === "mentions") return type.includes("mention");
    if (activeFilter === "activity") return !type.includes("friend");
    return true;
  });

  return (
    <>
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(value => !value)}
        style={{ ...buttonStyle, cursor: "pointer" }}
      >
        {icon}
        {count > 0 ? (
          <span style={{
            position: "absolute", top: -5, right: -5,
            minWidth: 19, height: 19, padding: "0 4px",
            borderRadius: 20, background: "#e24864",
            color: "#fff", fontSize: 10, fontWeight: 800,
            display: "grid", placeItems: "center",
          }}>
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open && typeof document !== "undefined" ? createPortal(
        <>
          <button
            type="button"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
            onWheel={(event) => {
              if (!window.matchMedia("(min-width: 1181px)").matches) return;

              const selector = ".dashboard-desktop-left, .dashboard-main-column, .dashboard-right-rail";
              const column = document.elementsFromPoint(event.clientX, event.clientY)
                .map(element => element.closest(selector))
                .find(element => element instanceof HTMLElement) as HTMLElement | undefined;

              if (!column) return;

              const multiplier = event.deltaMode === 1
                ? 16
                : event.deltaMode === 2 ? column.clientHeight : 1;

              column.scrollBy({
                top: event.deltaY * multiplier,
                behavior: "auto",
              });
            }}
            style={{
              position: "fixed", inset: 0, zIndex: 9998,
              border: 0, background: "transparent", cursor: "default",
            }}
          />

          <section
            role="dialog"
            aria-label="Notifications"
            style={{
              position: "fixed", right: "max(18px, calc((100vw - 1740px) / 2 + 16px))", top: 92,
              zIndex: 9999, width: 410,
              maxWidth: "calc(100vw - 36px)",
              maxHeight: "min(660px, calc(100dvh - 110px))",
              display: "flex", flexDirection: "column",
              background: "#211c2b", color: "#f7f5fb",
              border: "1px solid rgba(180,155,225,.19)",
              borderRadius: 16,
              boxShadow: "0 20px 65px rgba(0,0,0,.55)",
              overflow: "hidden",
            }}
          >
            <div style={{
              padding: "18px 18px 12px",
              display: "flex", alignItems: "center",
              justifyContent: "space-between", gap: 12,
            }}>
              <strong style={{ fontSize: 21 }}>Notifications</strong>
              <details style={{ position: "relative" }}>
                <summary
                  aria-label="Notification management"
                  style={{ cursor: "pointer", fontSize: 24, listStyle: "none", padding: "0 8px" }}
                >⋯</summary>
                <div style={{
                  position: "absolute", right: 0, top: 35, zIndex: 5,
                  width: 200, padding: 6, borderRadius: 10,
                  background: "#302a3a",
                  boxShadow: "0 12px 30px rgba(0,0,0,.45)",
                }}>
                  <button onClick={() => void markAllRead()} style={menuStyle}>
                    Mark all as read
                  </button>
                  <button
                    type="button"
                    disabled={deleting || loading || items.length === 0}
                    onClick={(event) => {
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      void deleteNotifications();
                    }}
                    style={{
                      ...menuStyle,
                      color: "#f19ba7",
                      opacity: deleting || loading || items.length === 0 ? 0.5 : 1,
                    }}
                  >
                    Delete all
                  </button>
                  <a href="/settings/notifications" style={menuStyle}>Notification settings</a>
                  <a href="/notifications" onClick={(event) => { if (onOpenAll) { event.preventDefault(); setOpen(false); onOpenAll(); } }} style={menuStyle}>Open all notifications</a>
                </div>
              </details>
            </div>

            <div style={{ display: "flex", gap: 8, padding: "0 18px 12px" }}>
              {(["all", "unread"] as const).map(filter => (
                <button
                  key={filter}
                  type="button"
                  aria-pressed={activeFilter === filter}
                  onClick={() => setActiveFilter(filter)}
                  style={filterStyle(activeFilter === filter)}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>

            <div onScroll={() => setRowMenuId(null)} style={{ overflowY: "auto", padding: "0 8px 8px" }}>
              {loading ? (
                <p style={emptyStyle}>Loading notifications...</p>
              ) : error ? (
                <p style={emptyStyle}>{error}</p>
              ) : visible.length === 0 ? (
                <p style={emptyStyle}>
                  {activeFilter === "all"
                    ? "You're all caught up."
                    : "No recent notifications in this category."}
                </p>
              ) : visible.map(n => {
                const name = n.actor?.full_name || n.actor?.username || "Someone";
                const title = description(n, name);
                const startsWithName = title.toLowerCase().startsWith(name.toLowerCase());
                const initial = name.charAt(0).toUpperCase();

                return (
                  <div key={n.id} style={{
                    background: n.is_read ? "transparent" : "rgba(139,92,246,.10)",
                    borderBottom: "1px solid rgba(255,255,255,.05)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button type="button"
                    onClick={() => void openNotice(n)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      flex: 1, minWidth: 0, padding: "11px 10px",
                      background: "transparent",
                      border: 0, borderRadius: 8,
                      color: "inherit", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <span style={{
                      position: "relative", flexShrink: 0,
                      width: 54, height: 54, borderRadius: "50%",
                      background: "#414958",
                      display: "grid", placeItems: "center",
                      fontSize: 19, fontWeight: 700,
                    }}>
                      {n.actor?.avatar_url ? (
                        <ResponsiveMediaImage
                          src={n.actor.avatar_url}
                          purpose="avatar"
                          avatarSize={54}
                          alt=""
                          style={{
                            width: 54, height: 54,
                            objectFit: "cover", borderRadius: "50%",
                          }}
                        />
                      ) : initial}
                      <span style={{
                        position: "absolute", bottom: -2, right: -3,
                        width: 22, height: 22, borderRadius: "50%",
                        border: "2px solid #211c2b",
                        background: "#1877f2", color: "white",
                        display: "grid", placeItems: "center", fontSize: 12,
                      }}>
                        {(n.type || "").includes("like") ? "♥" :
                         (n.type || "").includes("comment") ? "✎" :
                         (n.type || "").includes("friend") ? "♙" : "•"}
                      </span>
                    </span>

                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, lineHeight: 1.4 }}>
                        {startsWithName ? (
                          <><strong>{name}</strong>{title.slice(name.length)}</>
                        ) : title}
                      </span>
                      <span style={{
                        display: "block", marginTop: 4,
                        color: n.is_read ? "#aeb0b9" : "#a78bfa",
                        fontSize: 12,
                      }}>
                        {timeAgo(n.created_at)}
                      </span>
                    </span>
                    {!n.is_read ? (
                      <span style={{
                        width: 8, height: 8, flexShrink: 0,
                        borderRadius: "50%", background: "#1877f2",
                      }} />
                    ) : null}
                  </button>

                    <button
                      type="button"
                      aria-label="Notification options"
                      aria-expanded={rowMenuId === n.id}
                      disabled={deleting}
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        setRowMenuPosition({
                          top: rect.bottom + 60 < window.innerHeight
                            ? rect.bottom + 4
                            : rect.top - 56,
                          right: Math.max(8, window.innerWidth - rect.right),
                        });
                        setRowMenuId(prev => prev === n.id ? null : n.id);
                      }}
                      style={{
                        width: 34,
                        height: 34,
                        flexShrink: 0,
                        alignSelf: "flex-start",
                        marginTop: 10,
                        display: "grid",
                        placeItems: "center",
                        padding: 0,
                        lineHeight: 1,
                        borderRadius: "50%",
                        border: 0,
                        background: "transparent",
                        color: "#e4d5f7",
                        fontSize: 22,
                        cursor: "pointer",
                      }}
                    >
                      ⋯
                    </button>
                    </div>

                    {n.type === "friend_request" &&
                      n.friend_request_id &&
                      n.actor_id &&
                      pendingRequests.has(n.friend_request_id) && (
                        <div style={{ padding: "0 10px 10px 76px" }}>
                          <NotificationFriendRequestActions
                            userId={userId}
                            senderId={n.actor_id}
                            requestId={n.friend_request_id}
                            onResolved={() => setItems(prev => prev.map(item =>
                              item.friend_request_id === n.friend_request_id &&
                              item.type === "friend_request"
                                ? { ...item, is_read: true }
                                : item
                            ))}
                          />
                        </div>
                    )}

                    {rowMenuId === n.id && createPortal(
                      <div style={{
                        position: "fixed",
                        top: rowMenuPosition.top,
                        right: rowMenuPosition.right,
                        zIndex: 10001,
                        width: 170,
                        padding: 6,
                        borderRadius: 12,
                        background: "#211830",
                        border: "1px solid rgba(180,150,230,.25)",
                        boxShadow: "0 12px 30px rgba(0,0,0,.35)",
                      }}>
                        <button
                          type="button"
                          disabled={deleting}
                          onClick={() => void deleteNotifications(n.id)}
                          style={{
                            ...menuStyle,
                            width: "100%",
                            background: "transparent",
                            borderRadius: 8,
                            color: "#f19ba7",
                          }}
                        >
                          Delete notification
                        </button>
                      </div>,
                      document.body
                    )}
                  </div>
                );
              })}
            </div>

            <a href="/notifications" onClick={(event) => { if (onOpenAll) { event.preventDefault(); setOpen(false); onOpenAll(); } }} style={{
              display: "block", padding: 15,
              borderTop: "1px solid rgba(180,155,225,.14)",
              color: "#d9c4ff", textAlign: "center",
              textDecoration: "none", fontSize: 14, fontWeight: 650,
            }}>
              Open all notifications
            </a>
          </section>
        </>,
        document.body
      ) : null}
    </>
  );
}

const menuStyle: CSSProperties = {
  display: "block", width: "100%",
  padding: "10px 12px", border: 0,
  background: "transparent", color: "#f7f5fb",
  textAlign: "left", textDecoration: "none",
  fontSize: 13, cursor: "pointer",
};

const emptyStyle: CSSProperties = {
  padding: "35px 14px", textAlign: "center",
  color: "#b8adca", fontSize: 14,
};

function filterStyle(active: boolean): CSSProperties {
  return {
    padding: "7px 16px", border: 0,
    borderRadius: 20, cursor: "pointer",
    background: active ? "#65478e" : "rgba(255,255,255,.06)",
    color: active ? "#fff" : "#bcb6c7",
    fontWeight: 650, fontSize: 13,
  };
}

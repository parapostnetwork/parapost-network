"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type NotificationRow = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: string | null;
  post_id: string | null;
  comment_id: string | null;
  friend_request_id: string | null;
  reel_id?: string | null;
  message: string | null;
  is_read: boolean | null;
  created_at: string | null;
};

type ProfilePreview = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_online?: boolean | null;
  last_seen_at?: string | null;
};

type NotificationCard = NotificationRow & {
  actor: ProfilePreview | null;
  groupedNotificationIds?: string[];
  parachatMessageCount?: number;
  reelActivityCount?: number;
};

type FilterKey = "all" | "unread" | "friends" | "activity";

type ReelActivityPerson = {
  id: string;
  notificationId: string;
  actor: ProfilePreview | null;
  created_at: string | null;
};

function getDisplayName(profile: ProfilePreview | null) {
  return profile?.full_name || profile?.username || "Parapost Member";
}

function getInitial(profile: ProfilePreview | null) {
  return getDisplayName(profile).charAt(0).toUpperCase();
}

function formatRelativeTime(value?: string | null) {
  if (!value) return "just now";

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "just now";

  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";

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
}

const NOTIFICATIONS_ONLINE_TIMEOUT_MS = 3 * 60 * 1000;

function isRecentNotificationOnlineTimestamp(value?: string | null) {
  if (!value) return false;

  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;

  return Date.now() - time <= NOTIFICATIONS_ONLINE_TIMEOUT_MS;
}

function isNotificationProfileActuallyOnline(profile?: ProfilePreview | null) {
  return Boolean(profile?.is_online && isRecentNotificationOnlineTimestamp(profile.last_seen_at));
}

function isParachatNotificationType(type?: string | null) {
  return type === "parachat_message" || type === "parachat_photo";
}

function getStoredParachatNotificationCount(message?: string | null) {
  const match = (message || "").match(/parachat_group_count:(\d+)/i);
  if (!match) return 0;

  const count = Number(match[1]);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

function getParachatMessageCount(notification: NotificationCard) {
  if (!isParachatNotificationType(notification.type)) return 0;

  if (typeof notification.parachatMessageCount === "number" && notification.parachatMessageCount > 0) {
    return notification.parachatMessageCount;
  }

  const storedCount = getStoredParachatNotificationCount(notification.message);
  return storedCount > 0 ? storedCount : 1;
}

function groupParachatNotifications(rows: NotificationCard[]) {
  const grouped = new Map<string, NotificationCard[]>();
  const passthrough: NotificationCard[] = [];

  rows.forEach((notification) => {
    if (!isParachatNotificationType(notification.type) || !notification.actor_id) {
      passthrough.push(notification);
      return;
    }

    const key = `parachat:${notification.actor_id}:${notification.is_read ? "read" : "unread"}`;
    const currentGroup = grouped.get(key) || [];
    currentGroup.push(notification);
    grouped.set(key, currentGroup);
  });

  const groupedCards = Array.from(grouped.values()).map((group) => {
    const sortedGroup = [...group].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    const primary = sortedGroup[0];
    const messageCount = sortedGroup.reduce((total, notification) => {
      return total + Math.max(1, getStoredParachatNotificationCount(notification.message));
    }, 0);

    return {
      ...primary,
      is_read: sortedGroup.every((notification) => notification.is_read),
      groupedNotificationIds: sortedGroup.map((notification) => notification.id),
      parachatMessageCount: Math.max(1, messageCount),
    };
  });

  return [...passthrough, ...groupedCards].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
}

function isReelActivityNotificationType(type?: string | null) {
  return type === "reel_like" || type === "reel_share" || type === "reel_favorite";
}

function getReelActivityVerb(type?: string | null) {
  if (type === "reel_share") return "shared";
  if (type === "reel_favorite") return "favorited";
  return "liked";
}

function getReelActivityModalTitle(type?: string | null) {
  if (type === "reel_share") return "People who shared your Reel";
  if (type === "reel_favorite") return "People who favorited your Reel";
  return "People who liked your Reel";
}

function getReelActivityEmptyText(type?: string | null) {
  if (type === "reel_share") return "No share activity found for this Reel yet.";
  if (type === "reel_favorite") return "No favorite activity found for this Reel yet.";
  return "No like activity found for this Reel yet.";
}

function getReelActivityActionLabel(type?: string | null) {
  if (type === "reel_share") return "Shared";
  if (type === "reel_favorite") return "Favorited";
  return "Liked";
}

function getReelActivityCount(notification: NotificationCard) {
  if (!isReelActivityNotificationType(notification.type)) return 0;
  return typeof notification.reelActivityCount === "number" && notification.reelActivityCount > 0
    ? notification.reelActivityCount
    : 1;
}

function groupReelActivityNotifications(rows: NotificationCard[]) {
  const grouped = new Map<string, NotificationCard[]>();
  const passthrough: NotificationCard[] = [];

  rows.forEach((notification) => {
    if (!isReelActivityNotificationType(notification.type) || !notification.reel_id) {
      passthrough.push(notification);
      return;
    }

    const key = `reel:${notification.type}:${notification.reel_id}:${notification.is_read ? "read" : "unread"}`;
    const currentGroup = grouped.get(key) || [];
    currentGroup.push(notification);
    grouped.set(key, currentGroup);
  });

  const groupedCards = Array.from(grouped.values()).map((group) => {
    const sortedGroup = [...group].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    const primary = sortedGroup[0];

    return {
      ...primary,
      is_read: sortedGroup.every((notification) => notification.is_read),
      groupedNotificationIds: sortedGroup.map((notification) => notification.id),
      reelActivityCount: sortedGroup.length,
    };
  });

  return [...passthrough, ...groupedCards].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
}

function getNotificationTitle(notification: NotificationCard) {
  const actorName = getDisplayName(notification.actor);
  const type = notification.type || "";

  if (isParachatNotificationType(type)) {
    const parachatCount = getParachatMessageCount(notification);

    if (parachatCount > 1) {
      return `${actorName} sent you ${parachatCount} Parachat messages.`;
    }

    if (type === "parachat_photo") return `${actorName} sent you a photo in Parachat.`;
    return `${actorName} sent you a Parachat message.`;
  }

  if (isReelActivityNotificationType(type)) {
    const count = getReelActivityCount(notification);
    const verb = getReelActivityVerb(type);

    if (count > 2) return `${actorName} and ${count - 1} others ${verb} your Reel.`;
    if (count === 2) return `${actorName} and 1 other ${verb} your Reel.`;
    return `${actorName} ${verb} your Reel.`;
  }

  if (type === "reel_comment") return `${actorName} commented on your Reel.`;
  if (notification.message?.trim()) return notification.message.trim();
  if (type === "friend_request") return `${actorName} sent you a friend request.`;
  if (type === "friend_accept") return `${actorName} accepted your friend request.`;
  if (type === "post_like") return `${actorName} liked your post.`;
  if (type === "comment_like") return `${actorName} liked your comment.`;
  if (type === "comment_reply") return `${actorName} replied to your comment.`;
  if (type === "post_comment") return `${actorName} commented on your post.`;
  if (type === "badge_award") return "You earned a new badge.";
  if (type === "share") return `${actorName} shared your post.`;

  return "You have a new notification.";
}

function getNotificationMeta(notification: NotificationCard) {
  const type = notification.type || "";

  if (type.includes("parachat")) return "Parachat";
  if (type.includes("reel")) return "Parapost Reels";
  if (type.includes("friend")) return "Friends";
  if (type.includes("comment")) return "Comments";
  if (type.includes("like")) return "Likes";
  if (type.includes("badge")) return "Badges";
  if (type.includes("share")) return "Shares";

  return "Notification";
}

function getNotificationHref(notification: NotificationCard) {
  const type = notification.type || "";

  if (type === "parachat_message" || type === "parachat_photo") {
    return notification.actor_id ? `/messages?user=${notification.actor_id}` : "/messages";
  }

  if (type === "friend_request") {
    return "/friends/requests";
  }

  if (type === "friend_accept") {
    return "/friends";
  }

  if (type.startsWith("reel_")) {
    if (notification.reel_id && notification.user_id) {
      return `/profile/${notification.user_id}/reels/view?reelId=${notification.reel_id}`;
    }

    if (notification.user_id) {
      return `/profile/${notification.user_id}/reels`;
    }
  }

  if (notification.post_id) {
    return `/dashboard#post-${notification.post_id}`;
  }

  if (notification.actor_id) {
    return `/profile/${notification.actor_id}`;
  }

  return "/dashboard";
}

function getFilterLabel(filter: FilterKey) {
  if (filter === "all") return "All";
  if (filter === "unread") return "Unread";
  if (filter === "friends") return "Friends";
  return "Activity";
}

function NotificationTypeIcon({ type }: { type: string | null }) {
  const normalizedType = type || "";

  if (normalizedType.includes("parachat")) return <span style={notificationTypeIconTextStyle}>💬</span>;
  if (normalizedType.includes("reel")) return <span style={notificationTypeIconTextStyle}>▶</span>;
  if (normalizedType.includes("friend")) return <span style={notificationTypeIconTextStyle}>👥</span>;
  if (normalizedType.includes("comment")) return <span style={notificationTypeIconTextStyle}>💬</span>;
  if (normalizedType.includes("like")) return <span style={notificationTypeIconTextStyle}>♥</span>;
  if (normalizedType.includes("badge")) return <span style={notificationTypeIconTextStyle}>★</span>;
  if (normalizedType.includes("share")) return <span style={notificationTypeIconTextStyle}>↗</span>;

  return <span style={notificationTypeIconTextStyle}>N</span>;
}

function BackToPrevious({
  label = "Back",
  fallbackHref = "/dashboard",
}: {
  label?: string;
  fallbackHref?: string;
}) {
  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }

    if (typeof window !== "undefined") {
      window.location.href = fallbackHref;
    }
  };

  return (
    <button type="button" onClick={handleBack} style={ghostButtonStyle}>
      ← {label}
    </button>
  );
}

export default function NotificationsPage() {
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState("");
  const [notifications, setNotifications] = useState<NotificationCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [statusMessage, setStatusMessage] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [reelActivityModal, setReelActivityModal] = useState<NotificationCard | null>(null);

  const displayNotifications = useMemo(() => {
    return groupReelActivityNotifications(groupParachatNotifications(notifications));
  }, [notifications]);

  const unreadCount = useMemo(() => {
    return displayNotifications.filter((notification) => !notification.is_read).length;
  }, [displayNotifications]);

  const friendsCount = useMemo(() => {
    return displayNotifications.filter((notification) => (notification.type || "").includes("friend")).length;
  }, [displayNotifications]);

  const activityCount = useMemo(() => {
    return displayNotifications.filter((notification) => !(notification.type || "").includes("friend")).length;
  }, [displayNotifications]);

  const latestNotificationTime = useMemo(() => {
    const first = displayNotifications[0];
    return first?.created_at ? formatRelativeTime(first.created_at) : "No activity yet";
  }, [displayNotifications]);

  const filteredNotifications = useMemo(() => {
    if (activeFilter === "unread") return displayNotifications.filter((notification) => !notification.is_read);
    if (activeFilter === "friends") return displayNotifications.filter((notification) => (notification.type || "").includes("friend"));
    if (activeFilter === "activity") return displayNotifications.filter((notification) => !(notification.type || "").includes("friend"));
    return displayNotifications;
  }, [activeFilter, displayNotifications]);

  const reelActivityPeople = useMemo<ReelActivityPerson[]>(() => {
    if (!reelActivityModal?.reel_id || !reelActivityModal.type) return [];

    const uniquePeople = new Map<string, ReelActivityPerson>();

    notifications
      .filter((notification) => {
        return (
          notification.reel_id === reelActivityModal.reel_id &&
          notification.type === reelActivityModal.type &&
          Boolean(notification.actor_id)
        );
      })
      .sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime(),
      )
      .forEach((notification) => {
        if (!notification.actor_id || uniquePeople.has(notification.actor_id)) return;

        uniquePeople.set(notification.actor_id, {
          id: notification.actor_id,
          notificationId: notification.id,
          actor: notification.actor,
          created_at: notification.created_at,
        });
      });

    return Array.from(uniquePeople.values());
  }, [notifications, reelActivityModal]);

  const showStatus = useCallback((message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(""), 2600);
  }, []);

  const loadNotifications = useCallback(async (userId: string) => {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, user_id, actor_id, type, post_id, comment_id, friend_request_id, reel_id, message, is_read, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        console.error("Notifications load error:", error.message);
        setNotifications([]);
        setLoading(false);
        return;
      }

      const rows = (data || []) as NotificationRow[];
      const actorIds = [
        ...new Set(rows.map((notification) => notification.actor_id).filter(Boolean) as string[]),
      ];

      let profilesMap: Record<string, ProfilePreview> = {};

      if (actorIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url, is_online, last_seen_at")
          .in("id", actorIds);

        if (profilesError) {
          console.error("Notification profile load error:", profilesError.message);
        } else {
          profilesMap = Object.fromEntries(
            ((profilesData || []) as ProfilePreview[]).map((profile) => [profile.id, profile])
          );
        }
      }

      setNotifications(
        rows.map((notification) => ({
          ...notification,
          actor: notification.actor_id ? profilesMap[notification.actor_id] || null : null,
        }))
      );
    } catch (error) {
      console.warn("Notifications request failed:", error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (error || !user) {
        setCurrentUserId("");
        setNotifications([]);
        setLoading(false);
        return;
      }

      setCurrentUserId(user.id);
      await loadNotifications(user.id);
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [loadNotifications]);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`notifications-page-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${currentUserId}`,
        },
        async () => {
          await loadNotifications(currentUserId);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, loadNotifications]);

  const handleMarkAllRead = async () => {
    if (!currentUserId || unreadCount === 0) return;

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", currentUserId)
      .eq("is_read", false);

    if (error) {
      alert(`Could not mark notifications read: ${error.message}`);
      return;
    }

    setNotifications((prev) => prev.map((notification) => ({ ...notification, is_read: true })));
    showStatus("All notifications marked as read.");
  };

  const handleOpenNotification = async (notification: NotificationCard) => {
    const href = getNotificationHref(notification);
    const notificationIds = notification.groupedNotificationIds?.length
      ? notification.groupedNotificationIds
      : [notification.id];

    if (!notification.is_read) {
      setNotifications((prev) =>
        prev.map((item) => (notificationIds.includes(item.id) ? { ...item, is_read: true } : item))
      );

      await supabase.from("notifications").update({ is_read: true }).in("id", notificationIds);
    }

    router.push(href);
  };

  const handleOpenReelActivityPeople = async (notification: NotificationCard) => {
    if (!isReelActivityNotificationType(notification.type)) return;

    const notificationIds = notification.groupedNotificationIds?.length
      ? notification.groupedNotificationIds
      : [notification.id];

    setReelActivityModal(notification);

    if (!notification.is_read) {
      setNotifications((prev) =>
        prev.map((item) => (notificationIds.includes(item.id) ? { ...item, is_read: true } : item))
      );

      await supabase.from("notifications").update({ is_read: true }).in("id", notificationIds);
    }
  };

  const handleDeleteNotification = async (notification: NotificationCard) => {
    const notificationIds = notification.groupedNotificationIds?.length
      ? notification.groupedNotificationIds
      : [notification.id];
    const confirmed = window.confirm(
      notificationIds.length > 1 ? "Delete this grouped notification?" : "Delete this notification?"
    );
    if (!confirmed) return;

    setProcessingId(notification.id);

    const { error } = await supabase.from("notifications").delete().in("id", notificationIds);

    if (error) {
      alert(`Could not delete notification: ${error.message}`);
      setProcessingId(null);
      return;
    }

    setNotifications((prev) => prev.filter((item) => !notificationIds.includes(item.id)));
    setProcessingId(null);
    showStatus(notificationIds.length > 1 ? "Grouped notification deleted." : "Notification deleted.");
  };

  const filterButtons: Array<{
    key: FilterKey;
    count: number;
  }> = [
    { key: "all", count: displayNotifications.length },
    { key: "unread", count: unreadCount },
    { key: "friends", count: friendsCount },
    { key: "activity", count: activityCount },
  ];

  return (
    <main className="notifications-page-root" style={pageStyle}>
      <div style={glowOneStyle} />
      <div style={glowTwoStyle} />
      <div style={glowThreeStyle} />

      <style jsx global>{`
        .notifications-page-root {
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
        }

        .notifications-filter-scroller {
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }

        .notifications-filter-scroller::-webkit-scrollbar {
          display: none;
        }

        .notifications-card,
        .notifications-main-button,
        .notifications-delete-button,
        .notifications-reel-people-button,
        .notifications-filter-button {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }

        @media (max-width: 760px) {
          .notifications-page-root {
            height: 100dvh !important;
            min-height: 100dvh !important;
            max-height: 100dvh !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            overscroll-behavior-y: auto !important;
            -webkit-overflow-scrolling: touch;
            touch-action: pan-y;
          }

          .notifications-page-inner {
            max-width: none !important;
            padding: max(14px, env(safe-area-inset-top)) 10px calc(118px + env(safe-area-inset-bottom)) !important;
          }

          .notifications-hero {
            border-radius: 24px !important;
            padding: 14px !important;
            margin-bottom: 12px !important;
          }

          .notifications-topbar {
            align-items: flex-start !important;
            flex-wrap: wrap !important;
            gap: 10px !important;
            margin-bottom: 14px !important;
          }

          .notifications-pill {
            margin-left: auto !important;
            font-size: 10px !important;
            letter-spacing: 0.10em !important;
            padding: 8px 10px !important;
          }

          .notifications-summary-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }

          .notifications-actions-row {
            grid-template-columns: 1fr !important;
            gap: 8px !important;
          }

          .notifications-filter-scroller {
            display: flex !important;
            overflow-x: auto !important;
            gap: 8px !important;
            padding: 2px 2px 8px !important;
            margin-left: -2px !important;
            margin-right: -2px !important;
          }

          .notifications-filter-button {
            flex: 0 0 auto !important;
            min-width: 112px !important;
            width: auto !important;
            min-height: 38px !important;
          }

          .notifications-content-shell {
            border-radius: 24px !important;
            padding: 10px !important;
          }

          .notifications-card {
            grid-template-columns: 1fr !important;
            align-items: stretch !important;
            border-radius: 20px !important;
            gap: 10px !important;
          }

          .notifications-main-button {
            width: 100% !important;
            grid-template-columns: 46px minmax(0, 1fr) !important;
            gap: 10px !important;
          }

          .notifications-avatar {
            width: 46px !important;
            height: 46px !important;
            min-width: 46px !important;
          }

          .notifications-side-actions {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 8px !important;
          }

          .notifications-delete-button,
          .notifications-reel-people-button {
            width: 100% !important;
            min-height: 40px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
        }

        @media (max-width: 380px) {
          .notifications-page-inner {
            padding-left: 8px !important;
            padding-right: 8px !important;
          }

          .notifications-summary-grid {
            grid-template-columns: 1fr !important;
          }

          .notifications-main-button {
            grid-template-columns: 42px minmax(0, 1fr) !important;
          }

          .notifications-avatar {
            width: 42px !important;
            height: 42px !important;
            min-width: 42px !important;
          }
        }

        @media (max-height: 520px) and (orientation: landscape) {
          .notifications-page-inner {
            padding-top: 10px !important;
            padding-bottom: calc(84px + env(safe-area-inset-bottom)) !important;
          }

          .notifications-hero {
            padding: 12px !important;
          }

          .notifications-summary-grid,
          .notifications-actions-row {
            gap: 8px !important;
          }
        }

        @media (min-width: 761px) and (max-width: 1180px) {
          .notifications-page-inner {
            max-width: 980px !important;
            padding-left: 18px !important;
            padding-right: 18px !important;
            padding-bottom: calc(96px + env(safe-area-inset-bottom)) !important;
          }

          .notifications-card {
            border-radius: 22px !important;
          }
        }
      `}</style>

      <div className="notifications-page-inner" style={pageInnerStyle}>
        <section className="notifications-hero" style={heroStyle}>
          <div className="notifications-topbar" style={topBarStyle}>
            <div style={topBarLeftStyle}>
              <BackToPrevious label="Back" fallbackHref="/dashboard" />
              <Link href="/dashboard" style={topBarLinkStyle}>
                Dashboard
              </Link>
            </div>

            <span className="notifications-pill" style={settingsPillStyle}>Notifications</span>
          </div>

          <div style={heroGridStyle}>
            <div style={heroCopyStyle}>
              <div style={eyebrowStyle}>Parapost Network</div>
              <h1 style={titleStyle}>Notifications</h1>
              <p style={subtitleStyle}>
                Friend requests, Parachat messages, comments, likes, shares, Parapost Reels activity, and important updates appear here.
              </p>
            </div>

            <div className="notifications-summary-grid" style={summaryGridStyle}>
              <div style={summaryCardStyle}>
                <span style={summaryLabelStyle}>Total</span>
                <strong style={summaryValueStyle}>{notifications.length}</strong>
              </div>

              <div style={summaryCardStyle}>
                <span style={summaryLabelStyle}>Unread</span>
                <strong style={summaryValueStyle}>{unreadCount}</strong>
              </div>

              <div style={summaryCardStyle}>
                <span style={summaryLabelStyle}>Latest</span>
                <strong style={summarySmallValueStyle}>{latestNotificationTime}</strong>
              </div>
            </div>
          </div>

          <div className="notifications-actions-row" style={heroActionsRowStyle}>
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
              style={{
                ...primaryActionStyle,
                opacity: unreadCount === 0 ? 0.58 : 1,
                cursor: unreadCount === 0 ? "not-allowed" : "pointer",
              }}
            >
              Mark all read
            </button>

            <Link href="/friends/requests" style={secondaryActionStyle}>
              Friend requests
            </Link>

            <Link href="/settings/notifications" style={secondaryActionStyle}>
              Notification settings
            </Link>
          </div>

          <div className="notifications-filter-scroller" style={filterScrollerStyle} aria-label="Notification filters">
            {filterButtons.map((filter) => {
              const isActive = activeFilter === filter.key;

              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveFilter(filter.key)}
                  className="notifications-filter-button"
                  style={{
                    ...filterButtonStyle,
                    ...(isActive ? activeFilterButtonStyle : {}),
                  }}
                >
                  <span>{getFilterLabel(filter.key)}</span>
                  <span style={filterCountStyle}>{filter.count}</span>
                </button>
              );
            })}
          </div>
        </section>

        {statusMessage ? (
          <div style={statusMessageStyle}>
            <span style={statusDotStyle} />
            {statusMessage}
          </div>
        ) : null}

        <section className="notifications-content-shell" style={contentShellStyle}>
          {loading ? (
            <div style={emptyStateStyle}>
              <div style={emptyIconStyle}>N</div>
              <h2 style={emptyTitleStyle}>Loading notifications...</h2>
              <p style={emptyTextStyle}>Getting your latest Parapost Network activity.</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div style={emptyStateStyle}>
              <div style={emptyIconStyle}>N</div>
              <h2 style={emptyTitleStyle}>
                {displayNotifications.length === 0 ? "No notifications yet" : "No notifications in this filter"}
              </h2>
              <p style={emptyTextStyle}>
                {displayNotifications.length === 0
                  ? "When someone sends a friend request, accepts one, sends a Parachat message, comments, likes, shares, or interacts with your posts or Reels, it will show up here."
                  : "Try switching to another notification filter."}
              </p>
            </div>
          ) : (
            <div style={notificationListStyle}>
              {filteredNotifications.map((notification) => {
                const isUnread = !notification.is_read;
                const title = getNotificationTitle(notification);
                const meta = getNotificationMeta(notification);
                const actorName = getDisplayName(notification.actor);
                const isBusy = processingId === notification.id;
                const isReelActivity = isReelActivityNotificationType(notification.type);

                return (
                  <article
                    key={notification.id}
                    className="notifications-card"
                    style={{
                      ...notificationCardStyle,
                      ...(isUnread ? unreadCardStyle : {}),
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenNotification(notification)}
                      className="notifications-main-button"
                      style={notificationMainButtonStyle}
                    >
                      <div className="notifications-avatar" style={avatarShellStyle}>
                        {notification.actor?.avatar_url ? (
                          <img src={notification.actor.avatar_url} alt="" style={avatarImageStyle} />
                        ) : (
                          <span style={avatarFallbackStyle}>{getInitial(notification.actor)}</span>
                        )}

                        {isNotificationProfileActuallyOnline(notification.actor) ? <span style={onlineDotStyle} /> : null}

                        <span style={typeBadgeStyle}>
                          <NotificationTypeIcon type={notification.type} />
                        </span>
                      </div>

                      <div style={notificationTextStyle}>
                        <div style={notificationTitleRowStyle}>
                          <h2 style={notificationTitleStyle}>{title}</h2>
                          {isUnread ? <span style={unreadDotStyle} /> : null}
                        </div>

                        <div style={notificationMetaStyle}>
                          <span>{meta}</span>
                          <span>·</span>
                          <span>{actorName}</span>
                          <span>·</span>
                          <span>{formatRelativeTime(notification.created_at)}</span>
                        </div>
                      </div>
                    </button>

                    <div className="notifications-side-actions" style={notificationSideActionsStyle}>
                      {isReelActivity ? (
                        <button
                          type="button"
                          onClick={() => handleOpenReelActivityPeople(notification)}
                          style={viewPeopleButtonStyle}
                          className="notifications-reel-people-button"
                        >
                          View People
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => handleDeleteNotification(notification)}
                        disabled={isBusy}
                        style={{
                          ...deleteButtonStyle,
                          opacity: isBusy ? 0.6 : 1,
                          cursor: isBusy ? "not-allowed" : "pointer",
                        }}
                        aria-label="Delete notification"
                        className="notifications-delete-button"
                      >
                        {isBusy ? "..." : "Delete"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {reelActivityModal ? (
        <>
          <button
            type="button"
            aria-label="Close Reel activity"
            onClick={() => setReelActivityModal(null)}
            style={reelActivityBackdropStyle}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={getReelActivityModalTitle(reelActivityModal.type)}
            style={reelActivityModalWrapStyle}
          >
            <div style={reelActivityModalCardStyle}>
              <div style={reelActivityModalHeaderStyle}>
                <div>
                  <div style={reelActivityEyebrowStyle}>Reel Activity</div>
                  <h2 style={reelActivityTitleStyle}>
                    {getReelActivityModalTitle(reelActivityModal.type)}
                  </h2>
                  <p style={reelActivitySubtitleStyle}>
                    {reelActivityPeople.length === 1
                      ? `1 person ${getReelActivityVerb(reelActivityModal.type)} this Reel.`
                      : `${reelActivityPeople.length} people ${getReelActivityVerb(reelActivityModal.type)} this Reel.`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setReelActivityModal(null)}
                  style={reelActivityCloseButtonStyle}
                  aria-label="Close Reel activity"
                >
                  ×
                </button>
              </div>

              <div style={reelActivitySectionLabelStyle}>
                {getReelActivityActionLabel(reelActivityModal.type)}
              </div>

              {reelActivityPeople.length === 0 ? (
                <div style={reelActivityEmptyStateStyle}>
                  {getReelActivityEmptyText(reelActivityModal.type)}
                </div>
              ) : (
                <div style={reelActivityPeopleListStyle}>
                  {reelActivityPeople.map((person) => (
                    <div key={person.notificationId} style={reelActivityPersonRowStyle}>
                      <div style={reelActivityPersonAvatarStyle}>
                        {person.actor?.avatar_url ? (
                          <img
                            src={person.actor.avatar_url}
                            alt=""
                            style={reelActivityPersonAvatarImageStyle}
                          />
                        ) : (
                          <span style={reelActivityPersonAvatarFallbackStyle}>
                            {getInitial(person.actor)}
                          </span>
                        )}
                      </div>

                      <div style={reelActivityPersonTextStyle}>
                        <div style={reelActivityPersonNameStyle}>
                          {getDisplayName(person.actor)}
                        </div>
                        <div style={reelActivityPersonMetaStyle}>
                          {person.actor?.username ? `@${person.actor.username.replace(/^@+/, "")}` : "Parapost Member"}
                          <span> · </span>
                          {formatRelativeTime(person.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={reelActivityFooterStyle}>
                <button
                  type="button"
                  onClick={() => handleOpenNotification(reelActivityModal)}
                  style={reelActivityViewReelButtonStyle}
                >
                  View Reel
                </button>

                <button
                  type="button"
                  onClick={() => setReelActivityModal(null)}
                  style={reelActivityDoneButtonStyle}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  height: "100dvh",
  position: "relative",
  overflowY: "auto",
  overflowX: "hidden",
  overscrollBehaviorY: "auto",
  WebkitOverflowScrolling: "touch",
  touchAction: "pan-y",
  boxSizing: "border-box",
  background:
    "radial-gradient(circle at 12% 0%, var(--parapost-accent-soft), transparent 34%), radial-gradient(circle at 88% 16%, var(--parapost-accent-muted-bg), transparent 32%), linear-gradient(180deg, #05050b 0%, #07090d 48%, #05050b 100%)",
  color: "#ffffff",
};

const glowOneStyle: CSSProperties = {
  position: "fixed",
  right: "-180px",
  top: "-180px",
  width: "460px",
  height: "460px",
  borderRadius: "999px",
  background: "var(--parapost-accent-soft)",
  filter: "blur(78px)",
  pointerEvents: "none",
};

const glowTwoStyle: CSSProperties = {
  position: "fixed",
  left: "-160px",
  bottom: "-200px",
  width: "520px",
  height: "520px",
  borderRadius: "999px",
  background: "var(--parapost-accent-muted-bg)",
  filter: "blur(90px)",
  pointerEvents: "none",
};

const glowThreeStyle: CSSProperties = {
  position: "fixed",
  left: "45%",
  top: "18%",
  width: "320px",
  height: "320px",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.035)",
  filter: "blur(70px)",
  pointerEvents: "none",
};

const pageInnerStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  width: "100%",
  maxWidth: "1180px",
  margin: "0 auto",
  padding: "max(18px, env(safe-area-inset-top)) 12px calc(112px + env(safe-area-inset-bottom))",
};

const heroStyle: CSSProperties = {
  border: "1px solid var(--parapost-accent-border)",
  borderRadius: "clamp(22px, 4vw, 34px)",
  padding: "clamp(16px, 3vw, 26px)",
  background:
    "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.055), rgba(15,23,42,0.60))",
  boxShadow: "0 26px 70px rgba(0,0,0,0.38), 0 0 38px var(--parapost-accent-glow)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  marginBottom: "16px",
};

const topBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "18px",
};

const topBarLeftStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  minWidth: 0,
  flexWrap: "wrap",
};

const ghostButtonStyle: CSSProperties = {
  appearance: "none",
  border: 0,
  background: "transparent",
  color: "var(--parapost-accent-text)",
  fontWeight: 950,
  fontSize: "13px",
  padding: 0,
  cursor: "pointer",
};

const topBarLinkStyle: CSSProperties = {
  color: "#e5e7eb",
  fontWeight: 900,
  fontSize: "13px",
  textDecoration: "none",
};

const settingsPillStyle: CSSProperties = {
  border: "1px solid var(--parapost-accent-border)",
  background: "var(--parapost-accent-muted-bg)",
  color: "var(--parapost-accent-readable-text)",
  borderRadius: "999px",
  padding: "9px 12px",
  fontSize: "11px",
  fontWeight: 950,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const heroGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
  gap: "18px",
  alignItems: "end",
};

const heroCopyStyle: CSSProperties = {
  minWidth: 0,
};

const eyebrowStyle: CSSProperties = {
  color: "var(--parapost-accent-text)",
  fontSize: "11px",
  fontWeight: 950,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  marginBottom: "8px",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "clamp(32px, 8vw, 64px)",
  lineHeight: 0.95,
  letterSpacing: "-0.06em",
  fontWeight: 950,
  color: "#ffffff",
};

const subtitleStyle: CSSProperties = {
  margin: "12px 0 0",
  color: "#cbd5e1",
  fontSize: "clamp(13px, 2.3vw, 15px)",
  lineHeight: 1.58,
  maxWidth: "680px",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))",
  gap: "10px",
};

const summaryCardStyle: CSSProperties = {
  minWidth: 0,
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "18px",
  background: "rgba(0,0,0,0.24)",
  padding: "12px",
  display: "grid",
  gap: "5px",
};

const summaryLabelStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: "10px",
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: "0.11em",
};

const summaryValueStyle: CSSProperties = {
  color: "#ffffff",
  fontSize: "clamp(22px, 5vw, 34px)",
  lineHeight: 1,
  fontWeight: 950,
};

const summarySmallValueStyle: CSSProperties = {
  color: "#ffffff",
  fontSize: "clamp(13px, 3vw, 16px)",
  lineHeight: 1.2,
  fontWeight: 950,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const heroActionsRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "10px",
  marginTop: "18px",
  width: "100%",
};

const primaryActionStyle: CSSProperties = {
  minHeight: "42px",
  width: "100%",
  borderRadius: "999px",
  border: "1px solid var(--parapost-accent-active-border)",
  background:
    "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
  color: "var(--parapost-accent-button-text)",
  padding: "0 14px",
  fontWeight: 950,
  fontSize: "13px",
  boxShadow: "0 0 18px var(--parapost-accent-glow)",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
};

const secondaryActionStyle: CSSProperties = {
  minHeight: "42px",
  width: "100%",
  borderRadius: "999px",
  border: "1px solid var(--parapost-accent-border)",
  background: "rgba(255,255,255,0.06)",
  color: "#f9fafb",
  padding: "0 14px",
  fontWeight: 900,
  fontSize: "13px",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
};

const filterScrollerStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))",
  gap: "10px",
  marginTop: "18px",
  width: "100%",
};

const filterButtonStyle: CSSProperties = {
  minHeight: "40px",
  width: "100%",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.045)",
  color: "#cbd5e1",
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const activeFilterButtonStyle: CSSProperties = {
  background: "var(--parapost-accent-active-bg)",
  border: "1px solid var(--parapost-accent-active-border)",
  color: "var(--parapost-accent-readable-text)",
  boxShadow: "0 0 18px var(--parapost-accent-glow)",
};

const filterCountStyle: CSSProperties = {
  minWidth: "22px",
  height: "22px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background: "rgba(0,0,0,0.25)",
  color: "#ffffff",
  fontSize: "11px",
  fontWeight: 950,
};

const statusMessageStyle: CSSProperties = {
  marginBottom: "16px",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  background: "var(--parapost-accent-muted-bg)",
  border: "1px solid var(--parapost-accent-border)",
  color: "#f9fafb",
  borderRadius: "18px",
  padding: "12px 14px",
  fontWeight: 850,
};

const statusDotStyle: CSSProperties = {
  width: "9px",
  height: "9px",
  borderRadius: "999px",
  background: "var(--parapost-accent-2)",
  boxShadow: "0 0 16px var(--parapost-accent-glow)",
  flexShrink: 0,
};

const contentShellStyle: CSSProperties = {
  border: "1px solid var(--parapost-accent-border)",
  borderRadius: "clamp(22px, 4vw, 32px)",
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.045), var(--parapost-accent-muted-bg), rgba(15,23,42,0.52))",
  boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
  padding: "clamp(10px, 2.4vw, 16px)",
};

const emptyStateStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "26px",
  padding: "clamp(28px, 7vw, 44px) 18px",
  textAlign: "center",
  background: "rgba(0,0,0,0.22)",
};

const emptyIconStyle: CSSProperties = {
  width: "60px",
  height: "60px",
  margin: "0 auto 14px",
  borderRadius: "22px",
  display: "grid",
  placeItems: "center",
  background: "var(--parapost-accent-active-bg)",
  border: "1px solid var(--parapost-accent-active-border)",
  color: "var(--parapost-accent-readable-text)",
  boxShadow: "0 0 24px var(--parapost-accent-glow)",
  fontWeight: 950,
};

const emptyTitleStyle: CSSProperties = {
  margin: "0 0 8px",
  color: "#ffffff",
  fontSize: "22px",
  fontWeight: 950,
  letterSpacing: "-0.03em",
};

const emptyTextStyle: CSSProperties = {
  margin: 0,
  color: "#9ca3af",
  lineHeight: 1.6,
  maxWidth: "680px",
  marginLeft: "auto",
  marginRight: "auto",
};

const notificationListStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
};

const notificationCardStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "12px",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "24px",
  padding: "clamp(10px, 2.5vw, 14px)",
  background: "rgba(0,0,0,0.24)",
};

const unreadCardStyle: CSSProperties = {
  border: "1px solid var(--parapost-accent-active-border)",
  background:
    "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.055), rgba(0,0,0,0.26))",
  boxShadow: "0 0 22px var(--parapost-accent-glow)",
};

const notificationMainButtonStyle: CSSProperties = {
  appearance: "none",
  border: 0,
  background: "transparent",
  color: "inherit",
  padding: 0,
  display: "grid",
  gridTemplateColumns: "54px minmax(0, 1fr)",
  alignItems: "center",
  gap: "12px",
  textAlign: "left",
  cursor: "pointer",
  minWidth: 0,
};

const avatarShellStyle: CSSProperties = {
  width: "54px",
  height: "54px",
  minWidth: "54px",
  borderRadius: "999px",
  padding: "3px",
  position: "relative",
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
  boxShadow: "0 0 18px var(--parapost-accent-glow)",
};

const avatarImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "block",
  objectFit: "cover",
  objectPosition: "center",
  borderRadius: "999px",
  border: "2px solid #07090d",
};

const avatarFallbackStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "999px",
  border: "2px solid #07090d",
  display: "grid",
  placeItems: "center",
  color: "var(--parapost-accent-button-text)",
  fontWeight: 950,
};

const onlineDotStyle: CSSProperties = {
  position: "absolute",
  right: "2px",
  bottom: "3px",
  width: "12px",
  height: "12px",
  borderRadius: "999px",
  background: "#22c55e",
  border: "2px solid #07090d",
  boxShadow: "0 0 10px rgba(34,197,94,0.8)",
};

const typeBadgeStyle: CSSProperties = {
  position: "absolute",
  right: "-3px",
  top: "-4px",
  width: "23px",
  height: "23px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background: "#090b12",
  color: "var(--parapost-accent-text)",
  border: "1px solid var(--parapost-accent-border)",
  boxShadow: "0 0 12px var(--parapost-accent-glow)",
};

const notificationTypeIconTextStyle: CSSProperties = {
  fontSize: "11px",
  fontWeight: 950,
  lineHeight: 1,
};

const notificationTextStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
};

const notificationTitleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "8px",
  minWidth: 0,
};

const notificationTitleStyle: CSSProperties = {
  margin: 0,
  color: "#f9fafb",
  fontSize: "clamp(13px, 2.4vw, 15px)",
  fontWeight: 950,
  lineHeight: 1.35,
  overflowWrap: "anywhere",
};

const unreadDotStyle: CSSProperties = {
  width: "9px",
  height: "9px",
  marginTop: "5px",
  borderRadius: "999px",
  background: "var(--parapost-accent-2)",
  boxShadow: "0 0 12px var(--parapost-accent-glow)",
  flexShrink: 0,
};

const notificationMetaStyle: CSSProperties = {
  marginTop: "5px",
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  color: "#94a3b8",
  fontSize: "12px",
  fontWeight: 750,
};

const deleteButtonStyle: CSSProperties = {
  minHeight: "34px",
  borderRadius: "999px",
  border: "1px solid rgba(248,113,113,0.22)",
  background: "rgba(0,0,0,0.26)",
  color: "#fca5a5",
  padding: "0 11px",
  fontWeight: 900,
  fontSize: "12px",
};


const notificationSideActionsStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  alignItems: "center",
};

const viewPeopleButtonStyle: CSSProperties = {
  minHeight: "34px",
  borderRadius: "999px",
  border: "1px solid var(--parapost-accent-border)",
  background: "var(--parapost-accent-muted-bg)",
  color: "#f9fafb",
  padding: "0 12px",
  fontWeight: 900,
  fontSize: "12px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const reelActivityBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 120,
  border: 0,
  background: "rgba(0,0,0,0.64)",
  backdropFilter: "blur(8px)",
  cursor: "pointer",
};

const reelActivityModalWrapStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 130,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "clamp(14px, 4vw, 24px)",
  pointerEvents: "none",
};

const reelActivityModalCardStyle: CSSProperties = {
  width: "min(520px, 100%)",
  maxHeight: "min(82dvh, 680px)",
  overflowY: "auto",
  pointerEvents: "auto",
  borderRadius: "28px",
  border: "1px solid rgba(255,255,255,0.12)",
  background:
    "radial-gradient(circle at 15% 0%, var(--parapost-accent-soft), transparent 40%), linear-gradient(180deg, #111827 0%, #07090d 100%)",
  boxShadow: "0 24px 60px rgba(0,0,0,0.48)",
  padding: "18px",
};

const reelActivityModalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "14px",
  paddingBottom: "14px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const reelActivityEyebrowStyle: CSSProperties = {
  color: "var(--parapost-accent-text)",
  fontSize: "11px",
  fontWeight: 950,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  marginBottom: "7px",
};

const reelActivityTitleStyle: CSSProperties = {
  margin: 0,
  color: "#ffffff",
  fontSize: "clamp(18px, 4vw, 24px)",
  lineHeight: 1.15,
  fontWeight: 950,
};

const reelActivitySubtitleStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#9ca3af",
  fontSize: "13px",
  lineHeight: 1.45,
  fontWeight: 700,
};

const reelActivityCloseButtonStyle: CSSProperties = {
  width: "38px",
  height: "38px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.08)",
  color: "#ffffff",
  fontSize: "24px",
  lineHeight: 1,
  fontWeight: 700,
  cursor: "pointer",
  flexShrink: 0,
};

const reelActivitySectionLabelStyle: CSSProperties = {
  margin: "16px 0 10px",
  color: "#f9fafb",
  fontSize: "13px",
  fontWeight: 950,
};

const reelActivityEmptyStateStyle: CSSProperties = {
  borderRadius: "20px",
  border: "1px dashed rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  padding: "18px",
  color: "#9ca3af",
  fontSize: "14px",
  textAlign: "center",
};

const reelActivityPeopleListStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
};

const reelActivityPersonRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  borderRadius: "18px",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.045)",
  padding: "10px",
};

const reelActivityPersonAvatarStyle: CSSProperties = {
  width: "42px",
  height: "42px",
  borderRadius: "999px",
  overflow: "hidden",
  flexShrink: 0,
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2))",
};

const reelActivityPersonAvatarImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center",
};

const reelActivityPersonAvatarFallbackStyle: CSSProperties = {
  color: "#ffffff",
  fontWeight: 950,
  fontSize: "14px",
};

const reelActivityPersonTextStyle: CSSProperties = {
  minWidth: 0,
};

const reelActivityPersonNameStyle: CSSProperties = {
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 900,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const reelActivityPersonMetaStyle: CSSProperties = {
  marginTop: "3px",
  color: "#94a3b8",
  fontSize: "12px",
  fontWeight: 750,
};

const reelActivityFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
  paddingTop: "16px",
  marginTop: "14px",
  borderTop: "1px solid rgba(255,255,255,0.08)",
};

const reelActivityViewReelButtonStyle: CSSProperties = {
  minHeight: "40px",
  borderRadius: "999px",
  border: "1px solid var(--parapost-accent-border)",
  background: "var(--parapost-accent-muted-bg)",
  color: "#ffffff",
  padding: "0 15px",
  fontWeight: 900,
  cursor: "pointer",
};

const reelActivityDoneButtonStyle: CSSProperties = {
  minHeight: "40px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.13)",
  background: "rgba(255,255,255,0.08)",
  color: "#ffffff",
  padding: "0 15px",
  fontWeight: 900,
  cursor: "pointer",
};

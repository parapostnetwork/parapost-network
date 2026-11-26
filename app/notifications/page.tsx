"use client";
import SharedGroupPostEngagement from "@/app/groups/SharedGroupPostEngagement";
import CommunityMobileBottomNav from "@/components/CommunityMobileBottomNav";
import MentionTextarea from "@/components/MentionTextarea";

import ResponsiveMediaImage from "@/components/ResponsiveMediaImage";

import { CSSProperties, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type NotificationRow = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: string | null;
  post_id: string | null;
  comment_id: string | null;
  share_id?: string | null;
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

type NotificationPost = {
  id: string;
  content: string;
  image_url?: string | null;
  created_at: string;
  user_id: string;
};

type NotificationPostImage = {
  id: string;
  post_id: string;
  user_id: string;
  image_url: string;
  storage_path: string | null;
  display_order: number;
  created_at?: string | null;
};

type NotificationPostComment = {
  id: string;
  post_id: string;
  share_id?: string | null;
  user_id: string;
  content: string;
  created_at: string;
  is_hidden?: boolean | null;
  parent_comment_id?: string | null;
  reply_to_user_id?: string | null;
  reply_to_comment_id?: string | null;
};

type NotificationPostOverlayData = {
  post: NotificationPost;
  contextOwnerId: string | null;
  author: ProfilePreview | null;
  images: NotificationPostImage[];
  comments: NotificationPostComment[];
  profiles: Record<string, ProfilePreview>;
  likeCount: number;
};

type FilterKey = "all" | "unread" | "friends" | "activity" | "mentions";

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


function getNotificationDateSection(value?: string | null): string {
  if (!value) return "Earlier";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Earlier";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  return "Earlier";
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

    const key = `parachat:${notification.actor_id}`;
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
  return (
    type === "reel_like" ||
    type === "reel_comment" ||
    type === "reel_share"
  );
}

function getReelActivityVerb(type?: string | null) {
  if (type === "reel_comment") return "commented on";
  if (type === "reel_share") return "shared";
  return "liked";
}

function getReelActivityModalTitle(type?: string | null) {
  if (type === "reel_comment") return "People who commented on your Reel";
  if (type === "reel_share") return "People who shared your Reel";
  return "People who liked your Reel";
}

function getReelActivityEmptyText(type?: string | null) {
  if (type === "reel_comment") return "No comment activity found for this Reel yet.";
  if (type === "reel_share") return "No share activity found for this Reel yet.";
  return "No like activity found for this Reel yet.";
}

function getReelActivityActionLabel(type?: string | null) {
  if (type === "reel_comment") return "Commented";
  if (type === "reel_share") return "Shared";
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

    const key = `reel:${notification.type}:${notification.reel_id}`;
    const currentGroup = grouped.get(key) || [];
    currentGroup.push(notification);
    grouped.set(key, currentGroup);
  });

  const groupedCards = Array.from(grouped.values()).map((group) => {
    const sortedGroup = [...group].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    const primary = sortedGroup[0];
    const uniqueActorIds = new Set(
      sortedGroup
        .map((notification) => notification.actor_id)
        .filter(Boolean)
    );

    return {
      ...primary,
      is_read: sortedGroup.every((notification) => notification.is_read),
      groupedNotificationIds: sortedGroup.map((notification) => notification.id),
      reelActivityCount: Math.max(1, uniqueActorIds.size),
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

  if (type === "reel_reply") {
    return `${actorName} replied to your comment on a Reel.`;
  }

  if (type === "reel_comment_like") {
    return `${actorName} liked your comment on a Reel.`;
  }

  if (isReelActivityNotificationType(type)) {
    const count = getReelActivityCount(notification);
    const verb = getReelActivityVerb(type);

    if (count > 2) return `${actorName} and ${count - 1} others ${verb} your Reel.`;
    if (count === 2) return `${actorName} and 1 other ${verb} your Reel.`;
    return `${actorName} ${verb} your Reel.`;
  }

  if (notification.share_id && type === "post_like") {
    return `${actorName} liked a post you shared.`;
  }
  if (notification.share_id && type === "post_comment") {
    return `${actorName} commented on a post you shared.`;
  }
  if (notification.share_id && type === "comment_like") {
    return `${actorName} liked your comment on a shared post.`;
  }
  if (notification.share_id && type === "comment_reply") {
    return `${actorName} replied to your comment on a shared post.`;
  }

  if (type.includes("mention")) return `${actorName} mentioned you in a ${notification.comment_id || (notification as NotificationCard & { community_comment_id?: string }).community_comment_id ? "comment" : "post"}.`;

  if (notification.message?.trim()) return notification.message.trim();
  if (type === "friend_request") return `${actorName} sent you a friend request.`;
  if (type === "friend_accept") return `${actorName} accepted your friend request.`;
  if (type === "post_like") return `${actorName} liked your post.`;
  if (type === "comment_like") return `${actorName} liked your comment.`;
  if (type === "comment_reply") return `${actorName} replied to your comment.`;
  if (type === "post_comment") return `${actorName} commented on your post.`;
  if (type === "badge_award") return "You earned a new badge.";
  if (type === "achievement_award") return "You unlocked an achievement.";
  if (type === "share") return `${actorName} shared your post.`;

  return "You have a new notification.";
}

function getPostOverlayActivityTitle(notification: NotificationCard) {
  const actorName = getDisplayName(notification.actor);
  const type = notification.type || "";

  if (notification.share_id && type === "post_like") {
    return `${actorName} liked a post you shared`;
  }
  if (notification.share_id && type === "post_comment") {
    return `${actorName} commented on a post you shared`;
  }
  if (notification.share_id && type === "comment_like") {
    return `${actorName} liked your comment on a shared post`;
  }
  if (notification.share_id && type === "comment_reply") {
    return `${actorName} replied to your comment on a shared post`;
  }

  if (type === "post_like") return `${actorName} liked your post`;
  if (type === "post_comment") return `${actorName} commented on your post`;
  if (type === "comment_like") return `${actorName} liked your comment`;
  if (type === "comment_reply") return `${actorName} replied to your comment`;
  if (type === "post_share" || type === "share") {
    return `${actorName} shared your post`;
  }

  return getNotificationTitle(notification).replace(/[.]$/, "");
}

function getNotificationMeta(notification: NotificationCard) {
  const type = notification.type || "";

  if (type.includes("mention")) return "Mentions";
  if (type.includes("parachat")) return "Parachat";
  if (type.includes("reel")) return "Parapost Reels";
  if (type.includes("live")) return "Live";
  if (type.includes("friend")) return "Friends";
  if (type.includes("comment")) return "Comments";
  if (type.includes("like")) return "Likes";
  if (type.includes("badge")) return "Badges";
  if (type.includes("share")) return "Shares";

  return "Notification";
}

function getNotificationHref(notification: NotificationCard) {
  const type = notification.type || "";

  if (type === "badge_award" || type === "achievement_award") {
    return notification.user_id
      ? `/profile/${notification.user_id}`
      : "/notifications";
  }

  if (type === "parachat_message" || type === "parachat_photo") {
    return notification.actor_id ? `/messages?user=${notification.actor_id}` : "/messages";
  }

  if (type === "group_shared_comment_mention" || type === "group_promotion_comment_mention") return `/notifications?mention=${encodeURIComponent(notification.id)}`;

  if (type === "friend_request") {
    return "/friends/requests";
  }

  if (type === "friend_accept") {
    return "/friends";
  }

  // Route Group and CreatorVerse activity to its content.
  const community = notification as NotificationCard & {
    group_id?: string | null;
    creatorverse_page_id?: string | null;
    community_post_id?: string | null;
    community_comment_id?: string | null;
  };

  if (
    type.startsWith("group_") ||
    type.startsWith("creatorverse_") ||
    community.group_id ||
    community.creatorverse_page_id
  ) {
    const creatorverse =
      type.startsWith("creatorverse_") ||
      (!community.group_id && Boolean(community.creatorverse_page_id));

    const containerId = creatorverse
      ? community.creatorverse_page_id
      : community.group_id;

    const validUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!containerId || !validUuid.test(containerId)) {
      return "/notifications";
    }

    const base = creatorverse
      ? `/creatorverse/${containerId}`
      : `/groups/${containerId}`;

    const params = new URLSearchParams();

    if (community.community_post_id &&
        validUuid.test(community.community_post_id)) {
      params.set("post", community.community_post_id);
    }

    if (community.community_comment_id &&
        validUuid.test(community.community_comment_id)) {
      params.set("comment", community.community_comment_id);
    }

    const query = params.toString();
    return query ? `${base}?${query}` : base;
  }

  // Reels page already supports targeting a specific Reel with ?reel=<id>.
  // This keeps notifications landing on the actual Reel instead of only the profile tab.
  if (type.startsWith("reel_")) {
    return notification.reel_id ? `/reels?reel=${notification.reel_id}` : "/reels";
  }

  // Live notifications should never fall through to a profile by accident.
  // The current notifications rows do not expose a live_stream_id yet, so route to Live safely.
  if (type.includes("live")) {
    return "/live";
  }

  // Post likes, shares, comments, comment likes, and comment replies all belong to the post.
  if (notification.post_id) {
    return `/dashboard?post=${notification.post_id}#post-${notification.post_id}`;
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

  if (normalizedType.includes("mention")) return <span style={notificationTypeIconTextStyle}>@</span>;
  if (normalizedType.includes("parachat")) return <span style={notificationTypeIconTextStyle}>💬</span>;
  if (normalizedType.includes("reel")) return <span style={notificationTypeIconTextStyle}>▶</span>;
  if (normalizedType.includes("live")) return <span style={notificationTypeIconTextStyle}>●</span>;
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

function returnFromMention(): boolean {
  const params = new URLSearchParams(window.location.search);
  const origin = params.get("returnTo");
  if (!params.has("mention") || !origin) return false;

  try {
    const target = new URL(origin, window.location.origin);
    if (target.origin !== window.location.origin) return false;
    if (target.pathname === "/notifications") return false;
    window.location.replace(target.href);
    return true;
  } catch {
    return false;
  }
}

export default function NotificationsPage() {
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null);
  const pathname = usePathname();
  const [notifications, setNotifications] = useState<NotificationCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [statusMessage, setStatusMessage] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [reelActivityModal, setReelActivityModal] = useState<NotificationCard | null>(null);
  const [sharedMention, setSharedMention] = useState<{ groupId: string; postId?: string; shareId: string; commentId: string; kind: "post" | "promotion" } | null>(null);
  const [postOverlayNotification, setPostOverlayNotification] = useState<NotificationCard | null>(null);
  const [postOverlayData, setPostOverlayData] = useState<NotificationPostOverlayData | null>(null);
  const [postOverlayLoading, setPostOverlayLoading] = useState(false);
  const [postOverlayError, setPostOverlayError] = useState("");
  const [postOverlayIsMobile, setPostOverlayIsMobile] = useState(false);
  const [postOverlayExpanded, setPostOverlayExpanded] = useState(false);
  const [postOverlayCommentLikeCounts, setPostOverlayCommentLikeCounts] = useState<Record<string, number>>({});
  const [postOverlayCommentUserLikes, setPostOverlayCommentUserLikes] = useState<Record<string, boolean>>({});
  const [postOverlayCommentLikeBusyId, setPostOverlayCommentLikeBusyId] = useState<string | null>(null);
  const [postOverlayReplyingToId, setPostOverlayReplyingToId] = useState<string | null>(null);
  const [postOverlayReplyDraft, setPostOverlayReplyDraft] = useState("");
  const [postOverlayPostingReplyId, setPostOverlayPostingReplyId] = useState<string | null>(null);
  const [postOverlayEditingCommentId, setPostOverlayEditingCommentId] = useState<string | null>(null);
  const [postOverlayEditingCommentDraft, setPostOverlayEditingCommentDraft] = useState("");
  const [postOverlaySavingCommentId, setPostOverlaySavingCommentId] = useState<string | null>(null);
  const [postOverlayPostLiked, setPostOverlayPostLiked] = useState(false);
  const [postOverlayPostLikeBusy, setPostOverlayPostLikeBusy] = useState(false);
  const [postOverlayShareBusy, setPostOverlayShareBusy] = useState(false);
  const [postOverlayCommentDraft, setPostOverlayCommentDraft] = useState("");
  const [postOverlayPostingComment, setPostOverlayPostingComment] = useState(false);
  const postOverlayCommentComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const postOverlayDialogRef = useRef<HTMLElement | null>(null);
  const postOverlayCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const realtimeReloadTimerRef = useRef<number | null>(null);
  const reelActivityDialogRef = useRef<HTMLDivElement | null>(null);
  const reelActivityCloseButtonRef = useRef<HTMLButtonElement | null>(null);

  const displayNotifications = useMemo(() => {
    return groupReelActivityNotifications(groupParachatNotifications(notifications));
  }, [notifications]);

  const unreadCount = useMemo(() => {
    return displayNotifications.filter((notification) => !notification.is_read).length;
  }, [displayNotifications]);



  const latestNotificationTime = useMemo(() => {
    const first = displayNotifications[0];
    return first?.created_at ? formatRelativeTime(first.created_at) : "No activity yet";
  }, [displayNotifications]);

  const filteredNotifications = useMemo(() => {
    if (activeFilter === "unread") return displayNotifications.filter((notification) => !notification.is_read);
    if (activeFilter === "friends") return displayNotifications.filter((notification) => (notification.type || "").includes("friend"));
    if (activeFilter === "activity") return displayNotifications.filter((notification) => !(notification.type || "").includes("friend"));
    if (activeFilter === "mentions") return displayNotifications.filter((notification) => (notification.type || "").toLowerCase().includes("mention"));
    return displayNotifications;
  }, [activeFilter, displayNotifications]);

  const postOverlayImageUrls = useMemo(() => {
    if (!postOverlayData) return [];

    const galleryUrls = [...postOverlayData.images]
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
      .map((image) => image.image_url)
      .filter((value): value is string => Boolean(value));

    if (galleryUrls.length > 0) return galleryUrls;

    return postOverlayData.post.image_url
      ? [postOverlayData.post.image_url]
      : [];
  }, [postOverlayData]);

  const postOverlayOrderedComments = useMemo(() => {
    if (!postOverlayData) return [];

    const comments = postOverlayData.comments;
    const topLevelComments = comments.filter(
      (comment) => !comment.parent_comment_id
    );
    const orderedComments: NotificationPostComment[] = [];
    const visited = new Set<string>();

    const appendReply = (
      reply: NotificationPostComment,
      childrenByTarget: Map<string, NotificationPostComment[]>
    ) => {
      if (visited.has(reply.id)) return;

      visited.add(reply.id);
      orderedComments.push(reply);

      for (const child of childrenByTarget.get(reply.id) || []) {
        appendReply(child, childrenByTarget);
      }
    };

    for (const rootComment of topLevelComments) {
      if (!visited.has(rootComment.id)) {
        visited.add(rootComment.id);
        orderedComments.push(rootComment);
      }

      const replies = comments.filter(
        (comment) => comment.parent_comment_id === rootComment.id
      );
      const replyIds = new Set(replies.map((reply) => reply.id));
      const childrenByTarget = new Map<
        string,
        NotificationPostComment[]
      >();
      const rootReplies: NotificationPostComment[] = [];

      for (const reply of replies) {
        const targetId = reply.reply_to_comment_id;

        if (
          targetId &&
          targetId !== rootComment.id &&
          replyIds.has(targetId)
        ) {
          const children = childrenByTarget.get(targetId) || [];
          children.push(reply);
          childrenByTarget.set(targetId, children);
        } else {
          rootReplies.push(reply);
        }
      }

      for (const reply of rootReplies) {
        appendReply(reply, childrenByTarget);
      }

      // Preserve malformed or legacy replies rather than hiding them.
      for (const reply of replies) {
        appendReply(reply, childrenByTarget);
      }
    }

    // Preserve orphaned comments whose root no longer exists.
    for (const comment of comments) {
      if (!visited.has(comment.id)) {
        visited.add(comment.id);
        orderedComments.push(comment);
      }
    }

    return orderedComments;
  }, [postOverlayData]);

  const focusPostOverlayCommentComposer = () => {
    if (!currentUserId) {
      alert("You must be logged in to comment.");
      return;
    }

    requestAnimationFrame(() => {
      postOverlayCommentComposerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      postOverlayCommentComposerRef.current?.focus();
    });
  };

  const handleTogglePostOverlayPostLike = async () => {
    if (!currentUserId) {
      alert("You must be logged in to like posts.");
      return;
    }

    if (!postOverlayData || postOverlayPostLikeBusy) return;

    const postId = postOverlayData.post.id;
    const shareId = postOverlayNotification?.share_id || null;
    const alreadyLiked = postOverlayPostLiked;

    setPostOverlayPostLikeBusy(true);
    setPostOverlayPostLiked(!alreadyLiked);

    setPostOverlayData((current) =>
      current
        ? {
            ...current,
            likeCount: Math.max(
              current.likeCount + (alreadyLiked ? -1 : 1),
              0
            ),
          }
        : current
    );

    try {
      if (alreadyLiked) {
        let deleteQuery = supabase
          .from("likes")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", currentUserId);

        deleteQuery = shareId
          ? deleteQuery.eq("share_id", shareId)
          : deleteQuery.is("share_id", null);

        const { error } = await deleteQuery;

        if (error) throw error;

        return;
      }

      const { error } = await supabase.from("likes").insert([
        {
          post_id: postId,
          share_id: shareId,
          user_id: currentUserId,
        },
      ]);

      if (error) throw error;
    } catch (error) {
      setPostOverlayPostLiked(alreadyLiked);

      setPostOverlayData((current) =>
        current
          ? {
              ...current,
              likeCount: Math.max(
                current.likeCount + (alreadyLiked ? 1 : -1),
                0
              ),
            }
          : current
      );

      alert(
        `Post like error: ${
          error instanceof Error ? error.message : "Unable to update like."
        }`
      );
    } finally {
      setPostOverlayPostLikeBusy(false);
    }
  };

  const handleSubmitPostOverlayComment = async () => {
    const trimmed = postOverlayCommentDraft.trim();

    if (
      !trimmed ||
      !currentUserId ||
      !postOverlayData ||
      postOverlayPostingComment
    ) {
      return;
    }

    setPostOverlayPostingComment(true);

    try {
      const { data, error } = await supabase
        .from("comments")
        .insert([
          {
            post_id: postOverlayData.post.id,
            share_id: postOverlayNotification?.share_id || null,
            user_id: currentUserId,
            content: trimmed,
            parent_comment_id: null,
            reply_to_user_id: null,
            reply_to_comment_id: null,
          },
        ])
        .select(
          "id, post_id, share_id, user_id, content, created_at, is_hidden, parent_comment_id, reply_to_user_id, reply_to_comment_id"
        )
        .single();

      if (error) {
        alert(`Comment error: ${error.message}`);
        return;
      }

      const savedComment = data as NotificationPostComment;

      setPostOverlayData((current) =>
        current
          ? {
              ...current,
              comments: [...current.comments, savedComment],
            }
          : current
      );

      setPostOverlayCommentLikeCounts((current) => ({
        ...current,
        [savedComment.id]: 0,
      }));

      setPostOverlayCommentUserLikes((current) => ({
        ...current,
        [savedComment.id]: false,
      }));

      setPostOverlayCommentDraft("");
    } finally {
      setPostOverlayPostingComment(false);
    }
  };

  const handleSharePostOverlayPost = async () => {
    if (!currentUserId) {
      alert("Please log in to share posts.");
      return;
    }

    if (!postOverlayData || postOverlayShareBusy) return;

    const confirmed = window.confirm(
      "Share this post to your Parapost feed? It will appear on the dashboard timeline and on your profile."
    );

    if (!confirmed) return;

    const caption =
      window.prompt("Add a caption for your share, or leave blank:", "") || "";

    const trimmedCaption = caption.trim();

    setPostOverlayShareBusy(true);

    try {
      const { error } = await supabase.from("shares").insert([
        {
          post_id: postOverlayData.post.id,
          user_id: currentUserId,
          caption: trimmedCaption || null,
          share_destination: "feed",
        },
      ]);

      if (error) {
        if (error.code === "23505") {
          alert("You already shared this post to your feed.");
          return;
        }

        alert(`Share error: ${error.message}`);
        return;
      }

      alert("Shared to your feed and profile.");
    } finally {
      setPostOverlayShareBusy(false);
    }
  };

  const handleTogglePostOverlayCommentLike = async (commentId: string) => {
    if (!commentId || postOverlayCommentLikeBusyId) return;

    if (!currentUserId) {
      alert("You must be logged in to like a comment.");
      return;
    }

    const alreadyLiked = !!postOverlayCommentUserLikes[commentId];

    setPostOverlayCommentLikeBusyId(commentId);

    setPostOverlayCommentUserLikes((current) => ({
      ...current,
      [commentId]: !alreadyLiked,
    }));

    setPostOverlayCommentLikeCounts((current) => ({
      ...current,
      [commentId]: alreadyLiked
        ? Math.max((current[commentId] || 1) - 1, 0)
        : (current[commentId] || 0) + 1,
    }));

    try {
      if (alreadyLiked) {
        const { error } = await supabase
          .from("comment_likes")
          .delete()
          .eq("user_id", currentUserId)
          .eq("comment_id", commentId);

        if (error) {
          setPostOverlayCommentUserLikes((current) => ({
            ...current,
            [commentId]: true,
          }));

          setPostOverlayCommentLikeCounts((current) => ({
            ...current,
            [commentId]: (current[commentId] || 0) + 1,
          }));

          alert(`Unlike comment error: ${error.message}`);
        }

        return;
      }

      const { error } = await supabase.from("comment_likes").insert([
        {
          user_id: currentUserId,
          comment_id: commentId,
        },
      ]);

      if (error) {
        setPostOverlayCommentUserLikes((current) => ({
          ...current,
          [commentId]: false,
        }));

        setPostOverlayCommentLikeCounts((current) => ({
          ...current,
          [commentId]: Math.max((current[commentId] || 1) - 1, 0),
        }));

        alert(`Like comment error: ${error.message}`);
      }
    } finally {
      setPostOverlayCommentLikeBusyId((current) =>
        current === commentId ? null : current
      );
    }
  };

  const handleSubmitPostOverlayReply = async (
    replyToComment: NotificationPostComment
  ) => {
    const trimmed = postOverlayReplyDraft.trim();

    if (
      !trimmed ||
      !currentUserId ||
      !postOverlayData ||
      postOverlayPostingReplyId
    ) {
      return;
    }

    const rootParentId =
      replyToComment.parent_comment_id || replyToComment.id;

    setPostOverlayPostingReplyId(replyToComment.id);

    try {
      const { data, error } = await supabase
        .from("comments")
        .insert([
          {
            post_id: postOverlayData.post.id,
            share_id: postOverlayNotification?.share_id || null,
            user_id: currentUserId,
            content: trimmed,
            parent_comment_id: rootParentId,
            reply_to_user_id: replyToComment.user_id,
            reply_to_comment_id: replyToComment.id,
          },
        ])
        .select(
          "id, post_id, share_id, user_id, content, created_at, is_hidden, parent_comment_id, reply_to_user_id, reply_to_comment_id"
        )
        .single();

      if (error) {
        alert(`Reply error: ${error.message}`);
        return;
      }

      const savedReply = data as NotificationPostComment;

      setPostOverlayData((current) =>
        current
          ? {
              ...current,
              comments: [...current.comments, savedReply],
            }
          : current
      );

      setPostOverlayCommentLikeCounts((current) => ({
        ...current,
        [savedReply.id]: 0,
      }));

      setPostOverlayCommentUserLikes((current) => ({
        ...current,
        [savedReply.id]: false,
      }));

      setPostOverlayReplyingToId(null);
      setPostOverlayReplyDraft("");
    } finally {
      setPostOverlayPostingReplyId((current) =>
        current === replyToComment.id ? null : current
      );
    }
  };

  const handleStartEditPostOverlayComment = (
    comment: NotificationPostComment
  ) => {
    if (!currentUserId || comment.user_id !== currentUserId) return;

    setPostOverlayEditingCommentId(comment.id);
    setPostOverlayEditingCommentDraft(comment.content || "");
  };

  const handleCancelEditPostOverlayComment = () => {
    setPostOverlayEditingCommentId(null);
    setPostOverlayEditingCommentDraft("");
    setPostOverlaySavingCommentId(null);
  };

  const handleSavePostOverlayComment = async (
    comment: NotificationPostComment
  ) => {
    if (
      !currentUserId ||
      comment.user_id !== currentUserId ||
      postOverlaySavingCommentId
    ) {
      return;
    }

    const trimmed = postOverlayEditingCommentDraft.trim();

    if (!trimmed) {
      alert(
        "A comment needs some text. Delete the comment instead if you want to remove it."
      );
      return;
    }

    setPostOverlaySavingCommentId(comment.id);

    const { data, error } = await supabase
      .from("comments")
      .update({ content: trimmed })
      .eq("id", comment.id)
      .eq("post_id", comment.post_id)
      .eq("user_id", currentUserId)
      .select(
        "id, post_id, share_id, user_id, content, created_at, is_hidden, parent_comment_id, reply_to_user_id, reply_to_comment_id"
      )
      .single();

    if (error) {
      alert(`Edit comment error: ${error.message}`);
      setPostOverlaySavingCommentId(null);
      return;
    }

    const updatedComment = data as NotificationPostComment;

    setPostOverlayData((current) =>
      current
        ? {
            ...current,
            comments: current.comments.map((item) =>
              item.id === updatedComment.id ? updatedComment : item
            ),
          }
        : current
    );

    setPostOverlayEditingCommentId(null);
    setPostOverlayEditingCommentDraft("");
    setPostOverlaySavingCommentId(null);
  };

  const handleDeletePostOverlayComment = async (
    comment: NotificationPostComment
  ) => {
    if (!currentUserId || !postOverlayData) return;

    const canDelete =
      comment.user_id === currentUserId ||
      postOverlayData.contextOwnerId === currentUserId;

    if (!canDelete) return;
    if (!window.confirm("Delete this comment?")) return;

    await supabase
      .from("comment_likes")
      .delete()
      .eq("comment_id", comment.id);

    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", comment.id);

    if (error) {
      alert(`Delete comment error: ${error.message}`);
      return;
    }

    const shareId = postOverlayNotification?.share_id || null;

    let commentsQuery = supabase
      .from("comments")
      .select(
        "id, post_id, share_id, user_id, content, created_at, is_hidden, parent_comment_id, reply_to_user_id, reply_to_comment_id"
      )
      .eq("post_id", postOverlayData.post.id)
      .order("created_at", { ascending: true });

    commentsQuery = shareId
      ? commentsQuery.eq("share_id", shareId)
      : commentsQuery.is("share_id", null);

    const { data: remainingComments, error: reloadError } =
      await commentsQuery;

    if (reloadError) {
      console.warn(
        "Notification overlay comments could not be refreshed after delete:",
        reloadError.message
      );

      setPostOverlayData((current) =>
        current
          ? {
              ...current,
              comments: current.comments.filter(
                (item) => item.id !== comment.id
              ),
            }
          : current
      );

      return;
    }

    const nextComments =
      (remainingComments || []) as NotificationPostComment[];

    const remainingIds = new Set(
      nextComments.map((item) => item.id)
    );

    setPostOverlayData((current) =>
      current
        ? {
            ...current,
            comments: nextComments,
          }
        : current
    );

    setPostOverlayCommentLikeCounts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([commentId]) =>
          remainingIds.has(commentId)
        )
      )
    );

    setPostOverlayCommentUserLikes((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([commentId]) =>
          remainingIds.has(commentId)
        )
      )
    );

    if (
      postOverlayReplyingToId &&
      !remainingIds.has(postOverlayReplyingToId)
    ) {
      setPostOverlayReplyingToId(null);
      setPostOverlayReplyDraft("");
    }
  };

  const handleReportPostOverlayComment = async (
    commentId: string,
    commentOwnerId?: string | null
  ) => {
    if (!currentUserId) {
      alert("Please log in to report comments.");
      return;
    }

    if (!commentId) return;

    if (commentOwnerId && commentOwnerId === currentUserId) {
      alert("You cannot report your own comment from here.");
      return;
    }

    const reason = window.prompt(
      "Report this comment to Parapost moderation. Please add a short reason:",
      ""
    );

    const trimmedReason = (reason || "").trim();

    if (!trimmedReason) return;

    const { error } = await supabase.from("reports").insert({
      reporter_id: currentUserId,
      reported_user_id: commentOwnerId || null,
      target_type: "comment",
      target_id: commentId,
      reason: trimmedReason.slice(0, 160),
      details: trimmedReason.length > 160 ? trimmedReason : null,
      status: "open",
    });

    if (error) {
      alert(`Could not report this comment: ${error.message}`);
      return;
    }

    alert("Thanks. This comment has been sent to Parapost moderation.");
  };

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

  useEffect(() => {
    if (!reelActivityModal || typeof document === "undefined") return;

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    reelActivityCloseButtonRef.current?.focus({ preventScroll: true });

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setReelActivityModal(null);
        return;
      }

      if (event.key !== "Tab") return;

      const controls = Array.from(
        reelActivityDialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
        ) || []
      );

      const first = controls[0];
      const last = controls[controls.length - 1];

      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleDialogKeyDown);

    return () => {
      window.removeEventListener("keydown", handleDialogKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;

      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [reelActivityModal]);

  useEffect(() => {
    const postId = postOverlayNotification?.post_id;
    const shareId = postOverlayNotification?.share_id || null;

    if (!postId) {
      setPostOverlayData(null);
      setPostOverlayLoading(false);
      setPostOverlayError("");
      return;
    }

    let cancelled = false;

    async function loadPostOverlay() {
      setPostOverlayLoading(true);
      setPostOverlayError("");
      setPostOverlayData(null);
      setPostOverlayCommentLikeCounts({});
      setPostOverlayCommentUserLikes({});
      setPostOverlayReplyingToId(null);
      setPostOverlayReplyDraft("");
      setPostOverlayPostingReplyId(null);
      setPostOverlayCommentLikeBusyId(null);
      setPostOverlayPostLiked(false);
      setPostOverlayPostLikeBusy(false);
      setPostOverlayShareBusy(false);
      setPostOverlayCommentDraft("");
      setPostOverlayPostingComment(false);

      try {
        const { data: postData, error: postError } = await supabase
          .from("posts")
          .select("id, content, image_url, created_at, user_id")
          .eq("id", postId)
          .maybeSingle();

        if (postError) {
          throw postError;
        }

        if (!postData) {
          if (!cancelled) {
            setPostOverlayError("This post is no longer available.");
          }
          return;
        }

        const post = postData as NotificationPost;

        let contextOwnerId: string | null = post.user_id;

        if (shareId) {
          const { data: shareData, error: shareError } = await supabase
            .from("shares")
            .select("user_id")
            .eq("id", shareId)
            .eq("post_id", postId)
            .is("deleted_at", null)
            .maybeSingle();

          if (shareError) {
            throw shareError;
          }

          contextOwnerId =
            typeof shareData?.user_id === "string" ? shareData.user_id : null;
        }

        let commentsQuery = supabase
          .from("comments")
          .select("id, post_id, share_id, user_id, content, created_at, is_hidden, parent_comment_id, reply_to_user_id, reply_to_comment_id")
          .eq("post_id", postId)
          .order("created_at", { ascending: true });

        commentsQuery = shareId
          ? commentsQuery.eq("share_id", shareId)
          : commentsQuery.is("share_id", null);

        let likesQuery = supabase
          .from("likes")
          .select("id", { count: "exact", head: true })
          .eq("post_id", postId);

        likesQuery = shareId
          ? likesQuery.eq("share_id", shareId)
          : likesQuery.is("share_id", null);

        const [imagesResponse, commentsResponse, likesResponse] = await Promise.all([
          supabase
            .from("post_images")
            .select("id, post_id, user_id, image_url, storage_path, display_order, created_at")
            .eq("post_id", postId)
            .order("display_order", { ascending: true }),
          commentsQuery,
          likesQuery,
        ]);

        if (commentsResponse.error) {
          throw commentsResponse.error;
        }

        const targetCommentId = postOverlayNotification?.comment_id;
        if (postOverlayNotification?.type === "comment_mention" && targetCommentId && !commentsResponse.data?.some(comment => comment.id === targetCommentId)) {
          const target = await supabase.rpc('parapost_mention_post_thread', {
            p_post_id: postId, p_share_id: shareId, p_comment_id: targetCommentId
          });
          if (target.error) throw target.error;
          if (Array.isArray(target.data)) {
            const merged = new Map((commentsResponse.data ?? []).map(comment => [comment.id, comment]));
            for (const comment of target.data) {
              if (comment.post_id === postId && (comment.share_id ?? null) === shareId) merged.set(comment.id, comment);
            }
            commentsResponse.data = [...merged.values()];
          }
        }

        if (imagesResponse.error) {
          console.warn(
            "Notification post images could not be loaded:",
            imagesResponse.error.message
          );
        }

        if (likesResponse.error) {
          console.warn(
            "Notification post like count could not be loaded:",
            likesResponse.error.message
          );
        }

        let nextPostLiked = false;

        if (currentUserId) {
          let currentUserLikeQuery = supabase
            .from("likes")
            .select("id")
            .eq("post_id", postId)
            .eq("user_id", currentUserId);

          currentUserLikeQuery = shareId
            ? currentUserLikeQuery.eq("share_id", shareId)
            : currentUserLikeQuery.is("share_id", null);

          const { data: currentUserLike, error: currentUserLikeError } =
            await currentUserLikeQuery.maybeSingle();

          if (currentUserLikeError) {
            console.warn(
              "Notification post current-user like state could not be loaded:",
              currentUserLikeError.message
            );
          } else {
            nextPostLiked = Boolean(currentUserLike);
          }
        }

        const comments = ((commentsResponse.data || []) as NotificationPostComment[])
          .filter((comment) => !comment.is_hidden);

        const images = ((imagesResponse.data || []) as NotificationPostImage[])
          .filter((image) => Boolean(image.image_url));

        const commentIds = comments
          .map((comment) => comment.id)
          .filter(Boolean);

        const nextCommentLikeCounts: Record<string, number> = {};
        const nextCommentUserLikes: Record<string, boolean> = {};

        if (commentIds.length > 0) {
          const { data: commentLikeRows, error: commentLikesError } =
            await supabase
              .from("comment_likes")
              .select("comment_id, user_id")
              .in("comment_id", commentIds);

          if (commentLikesError) {
            console.warn(
              "Notification overlay comment likes could not be loaded:",
              commentLikesError.message
            );
          } else {
            for (const like of commentLikeRows || []) {
              const commentId = String(like.comment_id || "");
              if (!commentId) continue;

              nextCommentLikeCounts[commentId] =
                (nextCommentLikeCounts[commentId] || 0) + 1;

              if (currentUserId && like.user_id === currentUserId) {
                nextCommentUserLikes[commentId] = true;
              }
            }
          }
        }

        const profileIds = [
          ...new Set([
            post.user_id,
            currentUserId,
            ...comments.map((comment) => comment.user_id),
          ].filter(Boolean)),
        ];

        let profiles: Record<string, ProfilePreview> = {};

        if (profileIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url, is_online, last_seen_at")
            .in("id", profileIds);

          if (profilesError) {
            console.warn(
              "Notification post profiles could not be loaded:",
              profilesError.message
            );
          } else {
            profiles = Object.fromEntries(
              ((profilesData || []) as ProfilePreview[]).map((profile) => [
                profile.id,
                profile,
              ])
            );
          }
        }

        if (cancelled) return;

        setPostOverlayCommentLikeCounts(nextCommentLikeCounts);
        setPostOverlayCommentUserLikes(nextCommentUserLikes);
        setPostOverlayPostLiked(nextPostLiked);

        setPostOverlayData({
          post,
          contextOwnerId,
          author: profiles[post.user_id] || null,
          images,
          comments,
          profiles,
          likeCount: likesResponse.count || 0,
        });
      } catch (error) {
        if (cancelled) return;

        console.warn("Notification post overlay load failed:", error);

        setPostOverlayError(
          error instanceof Error
            ? error.message
            : "Could not load this post."
        );
      } finally {
        if (!cancelled) {
          setPostOverlayLoading(false);
        }
      }
    }

    void loadPostOverlay();

    return () => {
      cancelled = true;
    };
  }, [postOverlayNotification, currentUserId]);

  useEffect(() => {
    if (!postOverlayNotification || typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 700px)");

    const syncMobileOverlay = () => {
      setPostOverlayIsMobile(mediaQuery.matches);
    };

    syncMobileOverlay();
    mediaQuery.addEventListener("change", syncMobileOverlay);

    return () => {
      mediaQuery.removeEventListener("change", syncMobileOverlay);
    };
  }, [postOverlayNotification]);

  useEffect(() => {
    if (!postOverlayNotification || typeof document === "undefined") return;

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    postOverlayCloseButtonRef.current?.focus({ preventScroll: true });

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        (returnFromMention() || setPostOverlayNotification(null));
        return;
      }

      if (event.key !== "Tab") return;

      const controls = Array.from(
        postOverlayDialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
        ) || []
      );

      const first = controls[0];
      const last = controls[controls.length - 1];

      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleDialogKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      window.removeEventListener("keydown", handleDialogKeyDown);

      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [postOverlayNotification]);

  useEffect(() => {
    const commentId = postOverlayNotification?.comment_id;

    if (!commentId || !postOverlayData || typeof window === "undefined") return;

    const timer = window.setTimeout(() => {
      const target = document.getElementById(
        `notification-post-comment-${commentId}`
      );

      target?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 160);

    return () => window.clearTimeout(timer);
  }, [
    postOverlayData?.post.id,
    postOverlayNotification?.id,
    postOverlayNotification?.comment_id,
  ]);

  const showStatus = useCallback((message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(""), 2600);
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("mention");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || cancelled) return;
      const { data, error } = await supabase.from("notifications").select("*")
        .eq("id", id).eq("user_id", auth.user.id).maybeSingle();
      if (cancelled) return;
      if (error || !data || !["post_mention", "comment_mention", "group_shared_comment_mention", "group_promotion_comment_mention"].includes(data.type)) {
        setStatusMessage("This mention is no longer available."); return;
      }
      if (data.type === "group_shared_comment_mention" || data.type === "group_promotion_comment_mention") {
        const target = await supabase.rpc('parapost_mention_shared_destination', { p_notification_id: id });
        if (cancelled) return;
        if (target.error || !target.data) { setStatusMessage("This mention is no longer available."); return; }
        setSharedMention(target.data);
      } else {
        setPostOverlayNotification(data as NotificationCard);
      }
      setPostOverlayIsMobile(window.matchMedia("(max-width: 700px)").matches);
      const marked = await supabase.from("notifications").update({ is_read: true }).eq("id", id).eq("user_id", auth.user.id);
      if (!cancelled && !marked.error) setNotifications(rows => rows.map(row => row.id === id ? { ...row, is_read: true } : row));
    })().catch(() => { if (!cancelled) setStatusMessage("This mention could not be opened. Please try again."); });
    return () => { cancelled = true; };
  }, []);

  const loadNotifications = useCallback(async (userId: string) => {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, user_id, actor_id, type, post_id, comment_id, share_id, friend_request_id, reel_id, message, is_read, created_at, group_id, creatorverse_page_id, community_post_id, community_comment_id")
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
        setCurrentUserAvatar(null);
        setNotifications([]);
        setLoading(false);
        return;
      }

      setCurrentUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;

      setCurrentUserAvatar(profile?.avatar_url ?? null);
      await loadNotifications(user.id);
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [loadNotifications]);

  useEffect(() => {
    if (!currentUserId) return;

    const scheduleNotificationReload = () => {
      if (realtimeReloadTimerRef.current) {
        window.clearTimeout(realtimeReloadTimerRef.current);
      }

      realtimeReloadTimerRef.current = window.setTimeout(() => {
        realtimeReloadTimerRef.current = null;
        void loadNotifications(currentUserId);
      }, 180);
    };

    const channel = supabase
      .channel(`notifications-page-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${currentUserId}`,
        },
        scheduleNotificationReload
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${currentUserId}`,
        },
        scheduleNotificationReload
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
        },
        scheduleNotificationReload
      )
      .subscribe();

    return () => {
      if (realtimeReloadTimerRef.current) {
        window.clearTimeout(realtimeReloadTimerRef.current);
        realtimeReloadTimerRef.current = null;
      }
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

  const handleDeleteAllNotifications = async () => {
    if (!currentUserId || notifications.length === 0 || deletingAll) return;

    const confirmed = window.confirm(
      "Delete all notifications? This cannot be undone."
    );
    if (!confirmed) return;

    setDeletingAll(true);

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("user_id", currentUserId);

    if (error) {
      alert(`Could not delete all notifications: ${error.message}`);
      setDeletingAll(false);
      return;
    }

    setNotifications([]);
    setDeletingAll(false);
    showStatus("All notifications deleted.");
  };

  const handleOpenNotification = async (notification: NotificationCard) => {
    const href = getNotificationHref(notification);
    const notificationIds = notification.groupedNotificationIds?.length
      ? notification.groupedNotificationIds
      : [notification.id];

    if (!notification.is_read) {
      setNotifications((prev) =>
        prev.map((item) =>
          notificationIds.includes(item.id)
            ? { ...item, is_read: true }
            : item
        )
      );

      void supabase
        .from("notifications")
        .update({ is_read: true })
        .in("id", notificationIds)
        .then(({ error }) => {
          if (error) {
            console.warn(
              "Could not mark notification read before opening:",
              error.message
            );
          }
        });
    }

    const type = notification.type || "";

    if (type === "group_shared_comment_mention" || type === "group_promotion_comment_mention") {
      window.location.assign(getNotificationHref(notification)); return;
    }

    if (
      type.startsWith("group_") ||
      type.startsWith("creatorverse_")
    ) {
      try {
        const { data: destinationRow, error: destinationError } =
          await supabase
            .from("notifications")
            .select("id, type, group_id, creatorverse_page_id, community_post_id, community_comment_id")
            .eq("id", notification.id)
            .eq("user_id", notification.user_id)
            .maybeSingle();

        if (destinationError || !destinationRow) {
          window.alert(
            "Could not retrieve Group notification destination: " +
            (destinationError?.message || "Notification not found")
          );
          return;
        }

        const destination = getNotificationHref({
          ...notification,
          ...destinationRow,
        });

        const expectedPrefix = type.startsWith("group_")
          ? "/groups/"
          : "/creatorverse/";

        const requiresPost =
          type === "group_like" ||
          type === "group_comment" || type === "group_mention" || type === "creatorverse_mention";

        if (
          !destination.startsWith(expectedPrefix) ||
          (requiresPost && !destination.includes("post="))
        ) {
          window.alert(
            "The notification has no valid Group post destination."
          );
          return;
        }

        window.location.assign(destination);
        return;
      } catch (error) {
        console.error("Community notification navigation failed:", error);
        window.alert("Unable to open the Group notification.");
        return;
      }
    }

    if (notification.post_id && !type.startsWith("reel_")) {
      setPostOverlayExpanded(false);
      setPostOverlayIsMobile(
        typeof window !== "undefined" &&
          window.matchMedia("(max-width: 700px)").matches
      );
      setPostOverlayNotification(notification);
      return;
    }

    if (href.startsWith("/groups/") ||
        href.startsWith("/creatorverse/")) {
      window.location.assign(href);
      return;
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
  ];

  const menuItemStyle: CSSProperties = {
    display: "block",
    width: "100%",
    padding: "11px 14px",
    border: "none",
    background: "transparent",
    color: "#e9e5f5",
    fontSize: 14,
    textAlign: "left",
    textDecoration: "none",
    cursor: "pointer",
  };

  return (
    <main className="notifications-page-root" style={pageStyle}>
      <div style={glowOneStyle} />
      <div style={glowTwoStyle} />
      <div style={glowThreeStyle} />

      {sharedMention && <section aria-label="Mentioned Group share">
        <button type="button" onClick={() => (returnFromMention() || setSharedMention(null))}>Close shared thread</button>
        <SharedGroupPostEngagement key={sharedMention.shareId} {...sharedMention} targetCommentId={sharedMention.commentId} />
      </section>}
      {postOverlayNotification ? (
        <div
          className="notification-post-overlay-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              (returnFromMention() || setPostOverlayNotification(null));
            }
          }}
        >
          <section
            ref={postOverlayDialogRef}
            className="notification-post-overlay-shell"
            role="dialog"
            aria-modal="true"
            aria-label="Post activity"
            onClick={(event) => event.stopPropagation()}
          >
            <header
              className="notification-post-overlay-header"
              style={{
                minHeight: 66,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                padding: "12px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(12,14,22,0.98)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <strong
                  style={{
                    display: "block",
                    color: "#ffffff",
                    fontSize: 17,
                    fontWeight: 950,
                    lineHeight: 1.2,
                  }}
                >
                  {postOverlayNotification.share_id || (postOverlayIsMobile && !postOverlayExpanded)
                    ? getPostOverlayActivityTitle(postOverlayNotification)
                    : postOverlayData
                      ? `${getDisplayName(postOverlayData.author)}'s post`
                      : "Post"}
                </strong>

                <span
                  style={{
                    display: "block",
                    marginTop: 3,
                    color: "#9ca3af",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {postOverlayLoading
                    ? "Loading post..."
                    : postOverlayData
                      ? `${postOverlayData.likeCount} ${
                          postOverlayData.likeCount === 1 ? "Like" : "Likes"
                        } • ${postOverlayData.comments.length} ${
                          postOverlayData.comments.length === 1
                            ? "Comment"
                            : "Comments"
                        }`
                      : "Post activity"}
                </span>
              </div>

              <button
                ref={postOverlayCloseButtonRef}
                type="button"
                onClick={() => (returnFromMention() || setPostOverlayNotification(null))}
                aria-label="Close post"
                style={{
                  width: 44,
                  height: 44,
                  flexShrink: 0,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.07)",
                  color: "#ffffff",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 27,
                  lineHeight: 1,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </header>

            <div className="notification-post-overlay-scroll">
              {postOverlayLoading ? (
                <div
                  style={{
                    padding: 28,
                    color: "#c4b5fd",
                    fontWeight: 800,
                  }}
                >
                  Loading post...
                </div>
              ) : postOverlayError ? (
                <div
                  style={{
                    margin: 18,
                    padding: 18,
                    borderRadius: 16,
                    border: "1px solid rgba(248,113,113,0.24)",
                    background: "rgba(127,29,29,0.18)",
                    color: "#fecaca",
                    fontWeight: 800,
                  }}
                >
                  {postOverlayError}
                </div>
              ) : postOverlayData ? (
                <>
                  <article
                    style={{
                      padding: "16px 18px 14px",
                      borderBottom: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.018)",
                    }}
                  >
                    {!postOverlayIsMobile || postOverlayExpanded ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 999,
                            overflow: "hidden",
                            flexShrink: 0,
                            background: "rgba(139,92,246,0.22)",
                            display: "grid",
                            placeItems: "center",
                            fontWeight: 950,
                          }}
                        >
                          {postOverlayData.author?.avatar_url ? (
                            <ResponsiveMediaImage
                              purpose="avatar"
                              avatarSize={48}
                              src={postOverlayData.author.avatar_url}
                              alt=""
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            getInitial(postOverlayData.author)
                          )}
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <Link
                            href={`/profile/${postOverlayData.post.user_id}`}
                            style={{
                              color: "#ffffff",
                              textDecoration: "none",
                              fontWeight: 950,
                              fontSize: 16,
                            }}
                          >
                            {getDisplayName(postOverlayData.author)}
                          </Link>

                          <div
                            style={{
                              marginTop: 3,
                              color: "#a1a1aa",
                              fontSize: 13,
                            }}
                          >
                            @{postOverlayData.author?.username || "member"} ·{" "}
                            {formatRelativeTime(postOverlayData.post.created_at)}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {postOverlayData.post.content ? (
                      <div
                        style={{
                          marginTop:
                            postOverlayIsMobile && !postOverlayExpanded ? 4 : 16,
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                          color: "#f9fafb",
                          lineHeight: 1.56,
                          fontSize: 15.8,
                          ...(postOverlayIsMobile && !postOverlayExpanded
                            ? {
                                display: "-webkit-box",
                                WebkitBoxOrient: "vertical",
                                WebkitLineClamp: 4,
                                overflow: "hidden",
                              }
                            : {}),
                        }}
                      >
                        {postOverlayData.post.content}
                      </div>
                    ) : null}

                    {postOverlayImageUrls.length > 0 &&
                    (!postOverlayIsMobile || postOverlayExpanded) ? (
                      <div
                        style={{
                          display: "grid",
                          gap: 10,
                          marginTop: 16,
                        }}
                      >
                        {postOverlayImageUrls.map((url, index) => (
                          <img
                            key={`${url}-${index}`}
                            src={url}
                            alt="Post image"
                            loading="lazy"
                            decoding="async"
                            style={{
                              width: "100%",
                              maxHeight: 680,
                              objectFit: "cover",
                              display: "block",
                              borderRadius: 18,
                              background: "#05070d",
                              border: "1px solid rgba(255,255,255,0.10)",
                            }}
                          />
                        ))}
                      </div>
                    ) : null}

                    {postOverlayIsMobile &&
                    !postOverlayExpanded &&
                    postOverlayImageUrls.length > 0 ? (
                      <div
                        style={{
                          marginTop: 12,
                          color: "#c4b5fd",
                          fontSize: 13,
                          fontWeight: 900,
                        }}
                      >
                        Photo post
                      </div>
                    ) : null}

                    {postOverlayIsMobile && !postOverlayExpanded ? (
                      <button
                        type="button"
                        onClick={() => setPostOverlayExpanded(true)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minHeight: 42,
                          marginTop: 14,
                          padding: "0 18px",
                          borderRadius: 999,
                          border: "1px solid rgba(196,181,253,0.32)",
                          background: "rgba(139,92,246,0.14)",
                          color: "#ddd6fe",
                          textDecoration: "none",
                          fontSize: 13,
                          fontWeight: 950,
                        }}
                      >
                        View Post
                      </button>
                    ) : null}

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: 8,
                        marginTop: 16,
                        paddingTop: 12,
                        borderTop: "1px solid rgba(255,255,255,0.10)",
                      }}
                    >
                      <button
                        type="button"
                        disabled={postOverlayPostLikeBusy}
                        onClick={() =>
                          void handleTogglePostOverlayPostLike()
                        }
                        style={{
                          minHeight: 42,
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: postOverlayPostLiked
                            ? "rgba(139,92,246,0.18)"
                            : "rgba(255,255,255,0.035)",
                          color: postOverlayPostLiked
                            ? "#ddd6fe"
                            : "#f4f4f5",
                          fontSize: 13,
                          fontWeight: 900,
                          cursor: postOverlayPostLikeBusy
                            ? "default"
                            : "pointer",
                          opacity: postOverlayPostLikeBusy ? 0.6 : 1,
                        }}
                      >
                        {postOverlayPostLiked ? "Liked" : "Like"}
                      </button>

                      <button
                        type="button"
                        onClick={focusPostOverlayCommentComposer}
                        style={{
                          minHeight: 42,
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.035)",
                          color: "#f4f4f5",
                          fontSize: 13,
                          fontWeight: 900,
                          cursor: "pointer",
                        }}
                      >
                        Comment
                      </button>

                      <button
                        type="button"
                        disabled={postOverlayShareBusy}
                        onClick={() =>
                          void handleSharePostOverlayPost()
                        }
                        style={{
                          minHeight: 42,
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.035)",
                          color: "#f4f4f5",
                          fontSize: 13,
                          fontWeight: 900,
                          cursor: postOverlayShareBusy
                            ? "default"
                            : "pointer",
                          opacity: postOverlayShareBusy ? 0.6 : 1,
                        }}
                      >
                        {postOverlayShareBusy ? "Sharing..." : "Share"}
                      </button>
                    </div>
                  </article>

                  <section style={{ padding: "14px 18px 28px" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        marginBottom: 12,
                      }}
                    >
                      <strong style={{ color: "#f8fafc" }}>
                        Comments
                      </strong>

                      <span
                        style={{
                          color: "#9ca3af",
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        {postOverlayData.comments.length} total
                      </span>
                    </div>

                    {postOverlayData.comments.length === 0 ? (
                      <div
                        style={{
                          padding: "20px 4px",
                          color: "#9ca3af",
                          fontSize: 14,
                        }}
                      >
                        No comments yet.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {postOverlayOrderedComments.map((comment) => {
                          const author =
                            postOverlayData.profiles[comment.user_id] || null;

                          const isTarget =
                            postOverlayNotification.comment_id === comment.id;

                          const commentLikeCount =
                            postOverlayCommentLikeCounts[comment.id] || 0;

                          const commentLiked =
                            !!postOverlayCommentUserLikes[comment.id];

                          const commentLikeBusy =
                            postOverlayCommentLikeBusyId === comment.id;

                          const isReplying =
                            postOverlayReplyingToId === comment.id;

                          const isPostingReply =
                            postOverlayPostingReplyId === comment.id;

                          const canEdit =
                            Boolean(currentUserId) &&
                            comment.user_id === currentUserId;

                          const canDelete =
                            Boolean(currentUserId) &&
                            (comment.user_id === currentUserId ||
                              postOverlayData.contextOwnerId ===
                                currentUserId);

                          const canReport =
                            !!currentUserId &&
                            comment.user_id !== currentUserId;

                          const isEditing =
                            postOverlayEditingCommentId === comment.id;

                          const isSaving =
                            postOverlaySavingCommentId === comment.id;

                          return (
                            <div
                              id={`notification-post-comment-${comment.id}`}
                              key={comment.id}
                              style={{
                                display: "flex",
                                gap: 10,
                                marginLeft: comment.parent_comment_id ? 34 : 0,
                                padding: isTarget ? 10 : 0,
                                borderRadius: 14,
                                background: isTarget
                                  ? "rgba(139,92,246,0.16)"
                                  : "transparent",
                                outline: isTarget
                                  ? "1px solid rgba(196,181,253,0.30)"
                                  : "none",
                              }}
                            >
                              <div
                                style={{
                                  width: comment.parent_comment_id ? 30 : 34,
                                  height: comment.parent_comment_id ? 30 : 34,
                                  borderRadius: 999,
                                  overflow: "hidden",
                                  flexShrink: 0,
                                  background: "rgba(139,92,246,0.22)",
                                  display: "grid",
                                  placeItems: "center",
                                  fontSize: 12,
                                  fontWeight: 950,
                                }}
                              >
                                {author?.avatar_url ? (
                                  <ResponsiveMediaImage
                                    purpose="avatar"
                                    avatarSize={
                                      comment.parent_comment_id ? 30 : 34
                                    }
                                    src={author.avatar_url}
                                    alt=""
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      objectFit: "cover",
                                    }}
                                  />
                                ) : (
                                  getInitial(author)
                                )}
                              </div>

                              <div
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  padding: "10px 12px",
                                  borderRadius: 14,
                                  background: "rgba(255,255,255,0.045)",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 10,
                                  }}
                                >
                                  <Link
                                    href={`/profile/${comment.user_id}`}
                                    style={{
                                      color: "#ffffff",
                                      textDecoration: "none",
                                      fontSize: 13,
                                      fontWeight: 950,
                                    }}
                                  >
                                    {getDisplayName(author)}
                                  </Link>

                                  <span
                                    style={{
                                      color: "#8f8f98",
                                      fontSize: 11,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {formatRelativeTime(comment.created_at)}
                                  </span>
                                </div>

                                {isEditing ? (
                                  <div
                                    style={{
                                      display: "grid",
                                      gap: 8,
                                      marginTop: 8,
                                    }}
                                  >
                                    <MentionTextarea mentionContext={{ surface: "post", postId: postOverlayData?.post.id, shareId: postOverlayNotification?.share_id }}
                                      value={postOverlayEditingCommentDraft}
                                      onChange={(event) =>
                                        setPostOverlayEditingCommentDraft(
                                          event.target.value
                                        )
                                      }
                                      disabled={isSaving}
                                      rows={2}
                                      maxLength={1200}
                                      autoFocus
                                      onKeyDown={(event) => {
                                        if (event.key === "Escape") {
                                          event.preventDefault();
                                          handleCancelEditPostOverlayComment();
                                        }

                                        if (
                                          (event.metaKey || event.ctrlKey) &&
                                          event.key === "Enter"
                                        ) {
                                          event.preventDefault();
                                          void handleSavePostOverlayComment(
                                            comment
                                          );
                                        }
                                      }}
                                      style={{
                                        width: "100%",
                                        resize: "vertical",
                                        borderRadius: 10,
                                        border:
                                          "1px solid rgba(255,255,255,0.14)",
                                        background: "rgba(0,0,0,0.22)",
                                        color: "#ffffff",
                                        padding: "9px 10px",
                                        fontSize: 13,
                                        lineHeight: 1.45,
                                        outline: "none",
                                      }}
                                    />

                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 10,
                                        alignItems: "center",
                                      }}
                                    >
                                      <button
                                        type="button"
                                        disabled={
                                          !postOverlayEditingCommentDraft.trim() ||
                                          isSaving
                                        }
                                        onClick={() =>
                                          void handleSavePostOverlayComment(
                                            comment
                                          )
                                        }
                                        style={{
                                          border: 0,
                                          borderRadius: 8,
                                          padding: "6px 10px",
                                          background: "#7c3aed",
                                          color: "#ffffff",
                                          fontSize: 12,
                                          fontWeight: 850,
                                          cursor:
                                            !postOverlayEditingCommentDraft.trim() ||
                                            isSaving
                                              ? "default"
                                              : "pointer",
                                          opacity:
                                            !postOverlayEditingCommentDraft.trim() ||
                                            isSaving
                                              ? 0.58
                                              : 1,
                                        }}
                                      >
                                        {isSaving ? "Saving..." : "Save"}
                                      </button>

                                      <button
                                        type="button"
                                        disabled={isSaving}
                                        onClick={
                                          handleCancelEditPostOverlayComment
                                        }
                                        style={{
                                          border: 0,
                                          padding: 0,
                                          background: "transparent",
                                          color: "#a1a1aa",
                                          fontSize: 12,
                                          fontWeight: 850,
                                          cursor: "pointer",
                                        }}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    style={{
                                      marginTop: 5,
                                      color: "#f3f4f6",
                                      fontSize: 13,
                                      lineHeight: 1.45,
                                      whiteSpace: "pre-wrap",
                                      overflowWrap: "anywhere",
                                    }}
                                  >
                                    {comment.content}
                                  </div>
                                )}

                                {!isEditing ? (
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      flexWrap: "wrap",
                                      gap: 12,
                                      marginTop: 8,
                                    }}
                                  >
                                  <button
                                    type="button"
                                    disabled={commentLikeBusy}
                                    onClick={() =>
                                      void handleTogglePostOverlayCommentLike(
                                        comment.id
                                      )
                                    }
                                    style={{
                                      border: 0,
                                      padding: 0,
                                      background: "transparent",
                                      color: commentLiked
                                        ? "#c4b5fd"
                                        : "#a1a1aa",
                                      fontSize: 12,
                                      fontWeight: 850,
                                      cursor: commentLikeBusy
                                        ? "default"
                                        : "pointer",
                                    }}
                                  >
                                    Like
                                    {commentLikeCount > 0
                                      ? ` · ${commentLikeCount}`
                                      : ""}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!currentUserId) {
                                        alert(
                                          "You must be logged in to reply."
                                        );
                                        return;
                                      }

                                      setPostOverlayReplyingToId(
                                        (current) =>
                                          current === comment.id
                                            ? null
                                            : comment.id
                                      );
                                      setPostOverlayReplyDraft("");
                                    }}
                                    style={{
                                      border: 0,
                                      padding: 0,
                                      background: "transparent",
                                      color: "#a1a1aa",
                                      fontSize: 12,
                                      fontWeight: 850,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Reply
                                  </button>

                                  {canEdit ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleStartEditPostOverlayComment(
                                          comment
                                        )
                                      }
                                      style={{
                                        border: 0,
                                        padding: 0,
                                        background: "transparent",
                                        color: "#a1a1aa",
                                        fontSize: 12,
                                        fontWeight: 850,
                                        cursor: "pointer",
                                      }}
                                    >
                                      Edit
                                    </button>
                                  ) : null}

                                  {canDelete ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleDeletePostOverlayComment(
                                          comment
                                        )
                                      }
                                      style={{
                                        border: 0,
                                        padding: 0,
                                        background: "transparent",
                                        color: "#f87171",
                                        fontSize: 12,
                                        fontWeight: 850,
                                        cursor: "pointer",
                                      }}
                                    >
                                      Delete
                                    </button>
                                  ) : null}

                                  {canReport ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleReportPostOverlayComment(
                                          comment.id,
                                          comment.user_id
                                        )
                                      }
                                      style={{
                                        border: 0,
                                        padding: 0,
                                        background: "transparent",
                                        color: "#a1a1aa",
                                        fontSize: 12,
                                        fontWeight: 850,
                                        cursor: "pointer",
                                      }}
                                    >
                                      Report
                                    </button>
                                  ) : null}
                                  </div>
                                ) : null}

                                {isReplying ? (
                                  <div
                                    style={{
                                      display: "grid",
                                      gap: 8,
                                      marginTop: 10,
                                    }}
                                  >
                                    <MentionTextarea mentionContext={{ surface: "post", postId: postOverlayData?.post.id, shareId: postOverlayNotification?.share_id }}
                                      value={postOverlayReplyDraft}
                                      onChange={(event) =>
                                        setPostOverlayReplyDraft(
                                          event.target.value
                                        )
                                      }
                                      rows={2}
                                      maxLength={1200}
                                      placeholder={`Reply to ${getDisplayName(author)}...`}
                                      autoFocus
                                      style={{
                                        width: "100%",
                                        resize: "vertical",
                                        minHeight: 58,
                                        borderRadius: 12,
                                        border:
                                          "1px solid rgba(255,255,255,0.13)",
                                        background:
                                          "rgba(255,255,255,0.055)",
                                        color: "#ffffff",
                                        padding: "9px 10px",
                                        fontSize: 13,
                                        lineHeight: 1.4,
                                        outline: "none",
                                      }}
                                    />

                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 8,
                                      }}
                                    >
                                      <button
                                        type="button"
                                        disabled={
                                          !postOverlayReplyDraft.trim() ||
                                          isPostingReply
                                        }
                                        onClick={() =>
                                          void handleSubmitPostOverlayReply(
                                            comment
                                          )
                                        }
                                        style={{
                                          border: 0,
                                          borderRadius: 999,
                                          padding: "7px 13px",
                                          background: "#7c3aed",
                                          color: "#ffffff",
                                          fontSize: 12,
                                          fontWeight: 900,
                                          cursor: isPostingReply
                                            ? "default"
                                            : "pointer",
                                          opacity:
                                            !postOverlayReplyDraft.trim() ||
                                            isPostingReply
                                              ? 0.55
                                              : 1,
                                        }}
                                      >
                                        {isPostingReply
                                          ? "Replying..."
                                          : "Reply"}
                                      </button>

                                      <button
                                        type="button"
                                        disabled={isPostingReply}
                                        onClick={() => {
                                          setPostOverlayReplyingToId(null);
                                          setPostOverlayReplyDraft("");
                                        }}
                                        style={{
                                          border:
                                            "1px solid rgba(255,255,255,0.12)",
                                          borderRadius: 999,
                                          padding: "7px 13px",
                                          background: "transparent",
                                          color: "#d4d4d8",
                                          fontSize: 12,
                                          fontWeight: 850,
                                          cursor: "pointer",
                                        }}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                        marginTop: 18,
                        paddingTop: 16,
                        borderTop: "1px solid rgba(255,255,255,0.10)",
                      }}
                    >
                      <MentionTextarea mentionContext={{ surface: "post", postId: postOverlayData?.post.id, shareId: postOverlayNotification?.share_id }}
                        ref={postOverlayCommentComposerRef}
                        value={postOverlayCommentDraft}
                        onChange={(event) =>
                          setPostOverlayCommentDraft(event.target.value)
                        }
                        disabled={!currentUserId || postOverlayPostingComment}
                        rows={3}
                        maxLength={1200}
                        placeholder={
                          currentUserId
                            ? "Write a comment..."
                            : "Log in to comment."
                        }
                        style={{
                          width: "100%",
                          resize: "vertical",
                          minHeight: 72,
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,0.13)",
                          background: "rgba(255,255,255,0.055)",
                          color: "#ffffff",
                          padding: "10px 12px",
                          fontSize: 13,
                          lineHeight: 1.45,
                          outline: "none",
                          opacity: currentUserId ? 1 : 0.65,
                        }}
                      />

                      <button
                        type="button"
                        disabled={
                          !currentUserId ||
                          !postOverlayCommentDraft.trim() ||
                          postOverlayPostingComment
                        }
                        onClick={() =>
                          void handleSubmitPostOverlayComment()
                        }
                        style={{
                          justifySelf: "start",
                          minHeight: 38,
                          border: 0,
                          borderRadius: 999,
                          padding: "0 16px",
                          background: "#7c3aed",
                          color: "#ffffff",
                          fontSize: 13,
                          fontWeight: 900,
                          cursor:
                            !currentUserId ||
                            !postOverlayCommentDraft.trim() ||
                            postOverlayPostingComment
                              ? "default"
                              : "pointer",
                          opacity:
                            !currentUserId ||
                            !postOverlayCommentDraft.trim() ||
                            postOverlayPostingComment
                              ? 0.55
                              : 1,
                        }}
                      >
                        {postOverlayPostingComment
                          ? "Posting..."
                          : "Comment"}
                      </button>
                    </div>
                  </section>
                </>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      <style jsx global>{`
        .notification-post-overlay-backdrop {
          position: fixed;
          inset: 0;
          z-index: 2147483000;
          display: grid;
          place-items: center;
          padding: 16px;
          background: rgba(0, 0, 0, 0.76);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .notification-post-overlay-shell {
          width: min(760px, calc(100vw - 32px));
          height: min(900px, calc(100dvh - 32px));
          max-height: calc(100dvh - 32px);
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          overflow: hidden;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.14);
          background:
            linear-gradient(
              180deg,
              rgba(20,22,31,0.99),
              rgba(8,10,17,0.995)
            );
          box-shadow: 0 28px 90px rgba(0,0,0,0.72);
          color: #ffffff;
        }

        .notification-post-overlay-scroll {
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }

        @media (max-width: 700px) {
          .notification-post-overlay-backdrop {
            padding: 0;
          }

          .notification-post-overlay-shell {
            width: 100vw;
            height: 100dvh;
            max-height: 100dvh;
            box-sizing: border-box;
            padding-left: env(safe-area-inset-left);
            padding-right: env(safe-area-inset-right);
            border-radius: 0;
            border-left: 0;
            border-right: 0;
          }

          .notification-post-overlay-header {
            padding-top: max(12px, env(safe-area-inset-top)) !important;
          }

          .notification-post-overlay-scroll {
            padding-bottom: env(safe-area-inset-bottom);
            box-sizing: border-box;
          }
        }

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
            flex-direction: row !important;
            flex-wrap: wrap !important;
            justify-content: flex-start !important;
            align-items: center !important;
            gap: 8px !important;
            padding: 0 !important;
            margin-top: 10px !important;
            width: 100% !important;
            overflow: visible !important;
          }

          .notifications-filter-button {
            flex: 0 0 auto !important;
            width: auto !important;
            min-height: 36px !important;
            padding: 0 12px !important;
            font-size: 13px !important;
            white-space: nowrap !important;
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
            min-height: 44px !important;
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

        @media (min-width: 761px) and (max-width: 980px) and (orientation: portrait) {
          .notifications-hero h1 {
            font-size: clamp(36px, 5.8vw, 50px) !important;
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

        <style>{`
          /* notifications-compact-feed-styles */

          .notifications-content-shell {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            border-radius: 0 !important;
          }

          .notifications-feed {
            display: flex !important;
            flex-direction: column !important;
            gap: 0 !important;
            width: 100%;
          }

          .notifications-card {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            padding: 14px 12px !important;
            margin: 0 !important;
            border: none !important;
            border-bottom: 1px solid rgba(180,160,220,.12) !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: transparent !important;
            min-width: 0 !important;
          }

          .notifications-card-unread {
            background: rgba(139,92,246,.075) !important;
          }

          .notifications-main-button {
            display: flex !important;
            flex: 1 1 auto !important;
            align-items: center !important;
            gap: 12px !important;
            min-width: 0 !important;
            width: auto !important;
            padding: 0 !important;
            border: none !important;
            background: transparent !important;
            text-align: left !important;
          }

          .notifications-side-actions {
            display: flex !important;
            flex: 0 0 auto !important;
            align-items: center !important;
            gap: 6px !important;
            margin: 0 !important;
          }

          .notifications-delete-button,
          .notifications-reel-people-button {
            padding: 7px 9px !important;
            font-size: 12px !important;
            border-radius: 9px !important;
          }

          @media (max-width: 600px) {
            .notifications-card {
              padding: 13px 8px !important;
              gap: 7px !important;
            }

            .notifications-main-button {
              gap: 10px !important;
            }

            .notifications-side-actions {
              width: auto !important;
              flex: 0 0 auto !important;
              flex-direction: column !important;
              gap: 5px !important;
            }
          }
        `}</style>

        <style id="notifications-borderless-rows">{`
          .notifications-feed .notifications-card,
          .notifications-feed .notifications-card-unread,
          .notifications-feed .notifications-card:hover {
            background: transparent !important;
            background-image: none !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }

          .notifications-feed .notifications-main-button,
          .notifications-feed .notifications-main-button:hover {
            background: transparent !important;
            background-image: none !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
        `}</style>

        <section className="notifications-compact-header" style={{ padding: "8px 0 14px" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>

              <h1 style={{ margin: 0, color: "#fff", fontSize: "clamp(23px, 4vw, 30px)", fontWeight: 750 }}>
                Notifications
              </h1>
            </div>

            <details style={{ position: "relative", flexShrink: 0, zIndex: 30 }}>
              <summary
                aria-label="Notification management"
                title="Notification options"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: "50%", border: "1px solid rgba(180,150,230,.22)", background: "rgba(125,80,200,.12)", color: "#fff", fontSize: 24, cursor: "pointer", listStyle: "none" }}
              >
                ⋯
              </summary>
              <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 220, padding: "6px 0", borderRadius: 14, border: "1px solid rgba(180,150,230,.25)", background: "#20172d", boxShadow: "0 16px 40px rgba(0,0,0,.38)" }}>
                <button type="button" onClick={handleMarkAllRead} disabled={unreadCount === 0} style={{ ...menuItemStyle, opacity: unreadCount === 0 ? .5 : 1 }}>
                  Mark all as read
                </button>
                <Link href="/friends/requests" style={menuItemStyle}>
                  Friend requests
                </Link>
                <Link href="/settings/notifications" style={menuItemStyle}>
                  Notification settings
                </Link>
                <button type="button" onClick={handleDeleteAllNotifications} disabled={deletingAll || notifications.length === 0} style={{ ...menuItemStyle, color: "#fca5a5", opacity: deletingAll || notifications.length === 0 ? .5 : 1 }}>
                  {deletingAll ? "Deleting..." : "Delete all"}
                </button>
              </div>
            </details>
          </header>

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
                  <span>{filter.key === "mentions" ? "Mentions" : getFilterLabel(filter.key)}</span>
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
              <div
                className="notifications-caught-up"
                style={{
                  position: "relative",
                  isolation: "isolate",
                  overflow: "hidden",
                  width: "100%",
                  minHeight: 590,
                  padding: "65px 22px 185px",
                  borderRadius: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  background: "transparent",
                }}
              >
                <div style={{ position: "relative", zIndex: 2, marginBottom: 15 }}>
                  <svg
                    viewBox="0 0 260 230"
                    aria-hidden="true"
                    style={{
                      width: 220,
                      maxWidth: "60vw",
                      height: "auto",
                      overflow: "visible",
                      fill: "none",
                      stroke: "#d7a3ff",
                      strokeWidth: 5,
                      strokeLinecap: "round",
                      strokeLinejoin: "round",
                      filter: "drop-shadow(0 0 7px #a752ff) drop-shadow(0 0 22px rgba(166,70,255,.8))",
                    }}
                  >
                    <path d="M75 152c10-13 15-29 15-56 0-23 11-40 29-44v-7a8 8 0 0 1 16 0v7c18 4 29 21 29 44 0 27 5 43 15 56 4 5 0 12-6 12H81c-6 0-10-7-6-12Z" />
                    <path d="M110 176c3 11 11 16 19 16s16-5 19-16" />
                    <path d="M181 69l10-18M194 85l21-10M199 102h22" />
                  </svg>
                  <div style={{
                    width: 160,
                    height: 15,
                    margin: "-10px auto 0",
                    borderRadius: "50%",
                    background: "rgba(184,85,255,.55)",
                    filter: "blur(19px)",
                  }} />
                </div>

                <h2 style={{
                  position: "relative",
                  zIndex: 2,
                  margin: "10px 0 14px",
                  color: "#fff",
                  fontSize: "clamp(27px, 5vw, 42px)",
                  fontWeight: 750,
                  lineHeight: 1.2,
                  letterSpacing: "-.03em",
                }}>
                  {displayNotifications.length === 0 || activeFilter === "unread"
                    ? "You’re all caught up"
                    : "Nothing here yet"}
                </h2>

                <p style={{
                  position: "relative",
                  zIndex: 2,
                  marginTop: 0,
                  marginRight: 0,
                  marginBottom: 0,
                  marginLeft: 0,
                  maxWidth: 460,
                  color: "#bab2c6",
                  fontSize: "clamp(15px, 2.5vw, 18px)",
                  lineHeight: 1.6,
                }}>
                  {displayNotifications.length === 0
                    ? "You’ll see new notifications here when there’s activity on your posts, Groups, CreatorVerse, and more."
                    : activeFilter === "unread"
                      ? "You have no unread notifications right now."
                      : "There are no notifications in this category right now."}
                </p>

                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: 18,
                    transform: "translateX(-50%)",
                    width: "80%",
                    maxWidth: 820,
                    height: 170,
                    background: "radial-gradient(ellipse at center, rgba(150,72,221,.19) 0%, rgba(119,43,178,.10) 36%, transparent 72%)",
                    pointerEvents: "none",
                    zIndex: 0,
                  }}
                />
              </div>
          ) : (
            <div className="notifications-feed" style={notificationListStyle}>
              {filteredNotifications.map((notification, index) => {
                const isUnread = !notification.is_read;
                const title = getNotificationTitle(notification);
                const meta = getNotificationMeta(notification);
                const actorName = getDisplayName(notification.actor);
                const isBusy = processingId === notification.id;
                const isReelActivity = isReelActivityNotificationType(notification.type);
                const section = getNotificationDateSection(notification.created_at);
                const previousSection = index > 0
                  ? getNotificationDateSection(filteredNotifications[index - 1].created_at)
                  : null;

                return (
                  <Fragment key={notification.id}>
                    {section !== previousSection ? (
                      <h2 style={{
                        margin: "20px 4px 8px",
                        fontSize: 15,
                        fontWeight: 700,
                        color: "#f0eafa",
                      }}>
                        {section}
                      </h2>
                    ) : null}
                  <article
                    key={notification.id}
                    className={isUnread ? "notifications-card notifications-card-unread" : "notifications-card"}
                    style={{
                      ...notificationCardStyle,
                      ...(isUnread ? unreadCardStyle : {}),
                        background: "transparent",
                        backgroundImage: "none",
                        border: "none",
                        boxShadow: "none",
                        borderRadius: 0,
                        padding: "16px 4px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenNotification(notification)}
                      className="notifications-main-button"
                      style={notificationMainButtonStyle}
                    >
                      <div className="notifications-avatar" style={{
                          ...avatarShellStyle,
                          width: 58,
                          height: 58,
                          minWidth: 58,
                          background: "transparent",
                          border: "none",
                          boxShadow: "none",
                        }}>
                        <span style={{
                            ...avatarClipStyle,
                            width: "100%",
                            height: "100%",
                            border: "none",
                            boxShadow: "none",
                          }}>
                          {notification.actor?.avatar_url ? (
                            <ResponsiveMediaImage purpose="avatar" avatarSize={58} src={notification.actor.avatar_url} alt="" style={{
                                  ...avatarImageStyle,
                                  width: "100%",
                                  height: "100%",
                                  borderRadius: "50%",
                                }} />
                          ) : (
                            <span style={{
                                  ...avatarFallbackStyle,
                                  width: "100%",
                                  height: "100%",
                                  background: "#414958",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: "50%",
                                  boxShadow: "none",
                                  fontSize: 19,
                                  fontWeight: 650,
                                }}>{getInitial(notification.actor)}</span>
                          )}
                        </span>

                        {isNotificationProfileActuallyOnline(notification.actor) ? <span style={onlineDotStyle} /> : null}

                        <span style={{
                            ...typeBadgeStyle,
                            background: "#1877f2",
                            color: "#fff",
                            border: "2px solid #242526",
                            borderRadius: "50%",
                            boxShadow: "none",
                            width: 24,
                            height: 24,
                            top: "auto",
                            bottom: -2,
                            right: -3,
                          }}>
                          <NotificationTypeIcon type={notification.type} />
                        </span>
                      </div>

                      <div style={notificationTextStyle}>
                        <div style={notificationTitleRowStyle}>
                          <h2 style={{
                              ...notificationTitleStyle,
                              fontSize: "clamp(15px, 1.05vw, 16px)",
                              lineHeight: 1.4,
                              fontWeight: 400,
                              color: "#f1f2f5",
                            }}>
                              {title.startsWith(actorName) ? (
                                <>
                                  <strong style={{ fontWeight: 750 }}>{actorName}</strong>
                                  {title.slice(actorName.length)}
                                </>
                              ) : title}
                            </h2>
                          {isUnread ? <span style={{ ...unreadDotStyle, background: "#1877f2" }} /> : null}
                        </div>

                        <div style={{ ...notificationMetaStyle, fontSize: 13, color: "#aeb0b9", marginTop: 5 }}>
                            <span>{formatRelativeTime(notification.created_at)}</span>
                            <span>·</span>
                            <span>{meta}</span>
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

                      <details className="notifications-item-menu" style={{ alignSelf: "flex-start", marginTop: -4,  position: "relative", flexShrink: 0 }}>
                        <summary
                          aria-label="Notification options"
                          title="Notification options"
                          style={{
                            width: 36,
                            height: 36,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "50%",
                            background: "rgba(139,92,246,.12)",
                            color: "#e9ddff",
                            fontSize: 23,
                            cursor: "pointer",
                            listStyle: "none",
                          }}
                        >
                          ⋯
                        </summary>
                        <div style={{
                          position: "absolute",
                          top: "100%",
                          right: 0,
                          zIndex: 50,
                          minWidth: 170,
                          padding: 6,
                          borderRadius: 12,
                          background: "#211830",
                          border: "1px solid rgba(180,150,230,.25)",
                          boxShadow: "0 12px 30px rgba(0,0,0,.35)",
                        }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteNotification(notification)}
                            disabled={isBusy}
                            style={{
                              display: "block",
                              width: "100%",
                              padding: "10px 12px",
                              border: "none",
                              background: "transparent",
                              color: "#fca5a5",
                              fontSize: 13,
                              textAlign: "left",
                              cursor: isBusy ? "not-allowed" : "pointer",
                            }}
                          >
                            {isBusy ? "Deleting..." : "Delete notification"}
                          </button>
                        </div>
                      </details>
                    </div>
                  </article>
                  </Fragment>
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
            ref={reelActivityDialogRef}
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
                  ref={reelActivityCloseButtonRef}
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
                          <ResponsiveMediaImage
                            purpose="avatar" avatarSize={48}
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
      {pathname === "/notifications" && (
        <CommunityMobileBottomNav viewerId={currentUserId} avatarUrl={currentUserAvatar ?? undefined} />
      )}
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
  whiteSpace: "normal",
  overflowWrap: "break-word",
};

const heroActionsRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "10px",
  marginTop: "18px",
  width: "100%",
};

const primaryActionStyle: CSSProperties = {
  minHeight: "44px",
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
  minHeight: "44px",
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
  display: "flex",
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "flex-start",
  alignItems: "center",
  gap: "8px",
  marginTop: "10px",
  width: "100%",
};

const filterButtonStyle: CSSProperties = {
  minHeight: "36px",
  width: "auto",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.045)",
  color: "#cbd5e1",
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  fontSize: "13px",
  fontWeight: 700,
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
  aspectRatio: "1 / 1",
  boxSizing: "border-box",
  flexShrink: 0,
  borderRadius: "999px",
  padding: "3px",
  position: "relative",
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
  boxShadow: "0 0 18px var(--parapost-accent-glow)",
};

const avatarClipStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
  boxSizing: "border-box",
  borderRadius: "999px",
  overflow: "hidden",
  display: "grid",
  placeItems: "center",
};

const avatarImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  maxWidth: "100%",
  maxHeight: "100%",
  boxSizing: "border-box",
  display: "block",
  objectFit: "cover",
  objectPosition: "center",
  borderRadius: "999px",
  border: "2px solid #07090d",
};

const avatarFallbackStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  boxSizing: "border-box",
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
  width: "44px",
  height: "44px",
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
  aspectRatio: "1 / 1",
  boxSizing: "border-box",
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
  maxWidth: "100%",
  maxHeight: "100%",
  boxSizing: "border-box",
  display: "block",
  borderRadius: "999px",
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
  minHeight: "44px",
  borderRadius: "999px",
  border: "1px solid var(--parapost-accent-border)",
  background: "var(--parapost-accent-muted-bg)",
  color: "#ffffff",
  padding: "0 15px",
  fontWeight: 900,
  cursor: "pointer",
};

const reelActivityDoneButtonStyle: CSSProperties = {
  minHeight: "44px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.13)",
  background: "rgba(255,255,255,0.08)",
  color: "#ffffff",
  padding: "0 15px",
  fontWeight: 900,
  cursor: "pointer",
};

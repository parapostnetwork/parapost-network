"use client";

import {
  ChangeEvent,
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import DashboardReelsSection from "./DashboardReelsSection";
import DashboardNotificationsLink from "@/components/DashboardNotificationsLink";
import { supabase } from "@/lib/supabase";

type ProfilePreview = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_online?: boolean | null;
};

type Post = {
  id: string;
  content: string;
  image_url?: string | null;
  created_at: string;
  user_id: string;
};

type SharedReelItem = {
  id: string;
  reel_id: string;
  user_id: string;
  caption: string | null;
  created_at: string;
  reel_title: string;
  reel_caption: string | null;
  reel_video_url: string;
  reel_poster_url: string | null;
  reel_user_id: string;
  creator_profile_id: string | null;
};

type MixedFeedItem =
  | { type: "post"; id: string; created_at: string; post: Post }
  | { type: "reel_share"; id: string; created_at: string; share: SharedReelItem };

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

type Comment = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  post_id: string;
  parent_comment_id?: string | null;
  is_hidden?: boolean | null;
  profiles?: {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
    is_online?: boolean | null;
  } | null;
};

type CommentReport = {
  id: string;
  reason: string | null;
  created_at: string;
  comment_id: string;
  reporter_id: string;
  comment_owner_id: string;
  comments?: Comment | Comment[] | null;
};

type CountMap = Record<string, number>;
type ToggleMap = Record<string, boolean>;
type CommentMap = Record<string, Comment[]>;
type InputMap = Record<string, string>;
type BoxMap = Record<string, boolean>;
type FollowMap = Record<string, boolean>;
type FeedMode = "for_you" | "following";

type ContextMenuState = {
  commentId: string;
  postId: string;
  x: number;
  y: number;
  mode?: "menu" | "report";
} | null;

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";


function isLikelyShortenedLink(hostname: string) {
  const shortenerDomains = [
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "goo.gl",
    "ow.ly",
    "buff.ly",
    "cutt.ly",
    "is.gd",
    "s.id",
    "rebrand.ly",
    "lnkd.in",
    "shorturl.at",
    "tiny.cc",
    "trib.al",
    "amzn.to",
    "youtu.be",
  ];

  return shortenerDomains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
}

function isBlockedLinkProtocol(href: string) {
  const normalized = href.trim().toLowerCase();
  return (
    normalized.startsWith("javascript:") ||
    normalized.startsWith("data:") ||
    normalized.startsWith("vbscript:") ||
    normalized.startsWith("file:")
  );
}

function handleSafeExternalLinkClick(
  event: React.MouseEvent<HTMLAnchorElement>,
  href: string
) {
  event.preventDefault();
  event.stopPropagation();

  if (isBlockedLinkProtocol(href)) {
    alert("This link was blocked because it may be unsafe.");
    return;
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(href);
  } catch {
    alert("This link could not be opened because it does not look valid.");
    return;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, "");
  const isShortened = isLikelyShortenedLink(hostname);

  const message = isShortened
    ? `Safety notice: this appears to be a shortened link (${hostname}). The final destination may be hidden. Only continue if you trust this link.\n\nOpen it anyway?`
    : `You are leaving Parapost Network and opening:\n\n${hostname}\n\nOnly continue if you trust this site.`;

  const confirmed = window.confirm(message);

  if (!confirmed) return;

  window.open(parsedUrl.toString(), "_blank", "noopener,noreferrer");
}

function renderLinkedText(text: string): ReactNode {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (!part.match(urlRegex)) {
      return part;
    }

    const rawLabel = part;
    const cleanLabel = rawLabel.replace(/[),.;!?]+$/, "");
    const trailing = rawLabel.slice(cleanLabel.length);
    const href = cleanLabel.startsWith("http") ? cleanLabel : `https://${cleanLabel}`;

    if (isBlockedLinkProtocol(href)) {
      return (
        <span key={`${part}-${index}`} style={{ color: "#fca5a5", fontWeight: 800 }}>
          [unsafe link blocked]{trailing}
        </span>
      );
    }

    return (
      <span key={`${part}-${index}`}>
        <a
          href={href}
          onClick={(event) => handleSafeExternalLinkClick(event, href)}
          style={{
            color: "#93c5fd",
            fontWeight: 800,
            textDecoration: "none",
            wordBreak: "break-word",
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.textDecoration = "underline";
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.textDecoration = "none";
          }}
        >
          {cleanLabel}
        </a>
        {trailing}
      </span>
    );
  });
}


type LinkPreviewData = {
  href: string;
  hostname: string;
  label: string;
  type: "youtube" | "website";
  youtubeVideoId?: string;
};

function getYoutubeVideoId(url: URL) {
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    return url.pathname.replace("/", "").split(/[?&#]/)[0] || "";
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (url.pathname.startsWith("/watch")) {
      return url.searchParams.get("v") || "";
    }

    if (url.pathname.startsWith("/shorts/")) {
      return url.pathname.split("/shorts/")[1]?.split(/[?&#/]/)[0] || "";
    }

    if (url.pathname.startsWith("/embed/")) {
      return url.pathname.split("/embed/")[1]?.split(/[?&#/]/)[0] || "";
    }
  }

  return "";
}

function getFirstSafeLinkPreview(text: string): LinkPreviewData | null {
  const match = text.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
  if (!match) return null;

  const cleanLabel = match[0].replace(/[),.;!?]+$/, "");
  const href = cleanLabel.startsWith("http") ? cleanLabel : `https://${cleanLabel}`;

  if (isBlockedLinkProtocol(href)) return null;

  try {
    const parsedUrl = new URL(href);
    const hostname = parsedUrl.hostname.replace(/^www\./, "");
    const youtubeVideoId = getYoutubeVideoId(parsedUrl);

    if (youtubeVideoId) {
      return {
        href: parsedUrl.toString(),
        hostname,
        label: "YouTube video",
        type: "youtube",
        youtubeVideoId,
      };
    }

    return {
      href: parsedUrl.toString(),
      hostname,
      label: hostname,
      type: "website",
    };
  } catch {
    return null;
  }
}

function LinkPreviewCard({ text }: { text: string }) {
  const preview = getFirstSafeLinkPreview(text);

  if (!preview) return null;

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
    preview.hostname
  )}&sz=64`;

  return (
    <a
      href={preview.href}
      onClick={(event) => handleSafeExternalLinkClick(event, preview.href)}
      style={linkPreviewCardStyle}
    >
      <div style={linkPreviewMediaStyle}>
        {preview.type === "youtube" && preview.youtubeVideoId ? (
          <>
            <img
              src={`https://img.youtube.com/vi/${preview.youtubeVideoId}/hqdefault.jpg`}
              alt="YouTube preview"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
            <div style={linkPreviewPlayOverlayStyle}>▶</div>
          </>
        ) : (
          <div style={linkPreviewFaviconWrapStyle}>
            <img
              src={faviconUrl}
              alt=""
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
              }}
            />
          </div>
        )}
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={linkPreviewEyebrowStyle}>
          {preview.type === "youtube" ? "YouTube" : "External Website"}
        </div>
        <div style={linkPreviewTitleStyle}>
          {preview.type === "youtube" ? "Watch video" : preview.label}
        </div>
        <div style={linkPreviewDomainStyle}>{preview.hostname}</div>
      </div>
    </a>
  );
}

export default function DashboardPage() {
  const [content, setContent] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [sharedReelItems, setSharedReelItems] = useState<SharedReelItem[]>([]);
  const [commentsByPost, setCommentsByPost] = useState<CommentMap>({});
  const [profilesMap, setProfilesMap] = useState<Record<string, ProfilePreview>>({});
  const [commentInputs, setCommentInputs] = useState<InputMap>({});
  const [openCommentSections, setOpenCommentSections] = useState<BoxMap>({});
  const [replyInputs, setReplyInputs] = useState<InputMap>({});
  const [openReplyBoxes, setOpenReplyBoxes] = useState<BoxMap>({});
  const [likeCounts, setLikeCounts] = useState<CountMap>({});
  const [repostCounts, setRepostCounts] = useState<CountMap>({});
  const [shareCounts, setShareCounts] = useState<CountMap>({});
  const [commentLikeCounts, setCommentLikeCounts] = useState<CountMap>({});
  const [userLikes, setUserLikes] = useState<ToggleMap>({});
  const [userReposts, setUserReposts] = useState<ToggleMap>({});
  const [userCommentLikes, setUserCommentLikes] = useState<ToggleMap>({});
  const [loading, setLoading] = useState(false);
  const [fetchingPosts, setFetchingPosts] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [openPostMenuId, setOpenPostMenuId] = useState<string | null>(null);
  const [commentMenu, setCommentMenu] = useState<ContextMenuState>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostContent, setEditingPostContent] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [reportedComments, setReportedComments] = useState<CommentReport[]>([]);
  const [reportReason, setReportReason] = useState("spam_or_abuse");
  const [reportMessage, setReportMessage] = useState("");
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [pendingFriendRequestCount, setPendingFriendRequestCount] = useState(0);
  const [feedMode, setFeedMode] = useState<FeedMode>("for_you");
  const [followedUserIds, setFollowedUserIds] = useState<string[]>([]);
  const [followingMap, setFollowingMap] = useState<FollowMap>({});
  const [followerCountByUser, setFollowerCountByUser] = useState<CountMap>({});

  const unreadNotificationCount = useMemo(() => {
    return notifications.filter((item) => !item.is_read).length;
  }, [notifications]);

  const commentInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const replyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const realtimeRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showReportMessage = (message: string) => {
    setReportMessage(message);
    window.setTimeout(() => {
      setReportMessage("");
    }, 2500);
  };

  useEffect(() => {
    initializeDashboard();
  }, []);

  useEffect(() => {
    const handleGlobalClick = () => {
      setOpenPostMenuId(null);
      setCommentMenu(null);
    };

    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("scroll", handleGlobalClick);

    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("scroll", handleGlobalClick);
    };
  }, []);

  useEffect(() => {
    const handleOffline = async () => {
      if (!currentUserId) return;
      await supabase.from("profiles").update({ is_online: false }).eq("id", currentUserId);
    };

    window.addEventListener("beforeunload", handleOffline);

    return () => {
      window.removeEventListener("beforeunload", handleOffline);
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!image) {
      setImagePreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(image);
    setImagePreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [image]);

  const scheduleRealtimeRefresh = useCallback((refreshNotifications = false) => {
    if (realtimeRefreshTimeoutRef.current) {
      clearTimeout(realtimeRefreshTimeoutRef.current);
    }

    realtimeRefreshTimeoutRef.current = setTimeout(async () => {
      await fetchAllData(currentUserId || undefined);

      if (refreshNotifications && currentUserId) {
        await Promise.all([
          fetchNotifications(currentUserId),
          fetchPendingFriendRequests(currentUserId),
        ]);
      }
    }, 180);
  }, [currentUserId]);

  const shouldShowIncomingPost = useCallback((post: Post) => {
    if (!post?.user_id) return false;
    if (blockedUserIds.includes(post.user_id)) return false;

    if (feedMode === "following" && currentUserId) {
      return followedUserIds.includes(post.user_id);
    }

    return true;
  }, [blockedUserIds, currentUserId, feedMode, followedUserIds]);

  const refreshNotificationSurfaces = useCallback(async () => {
    if (!currentUserId) return;
    await fetchNotifications(currentUserId);
    await fetchPendingFriendRequests(currentUserId);
  }, [currentUserId]);



  useEffect(() => {
    const channel = supabase
      .channel(`dashboard-live-${currentUserId || "guest"}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        async (payload) => {
          const incomingPost = payload.new as Post;

          if (!incomingPost?.id) return;
          if (!shouldShowIncomingPost(incomingPost)) return;

          setPosts((prev) => {
            if (prev.some((post) => post.id === incomingPost.id)) {
              return prev;
            }

            return [incomingPost, ...prev];
          });

          setCommentsByPost((prev) => ({
            ...prev,
            [incomingPost.id]: prev[incomingPost.id] || [],
          }));

          setLikeCounts((prev) => ({ ...prev, [incomingPost.id]: prev[incomingPost.id] || 0 }));
          setRepostCounts((prev) => ({ ...prev, [incomingPost.id]: prev[incomingPost.id] || 0 }));
          setShareCounts((prev) => ({ ...prev, [incomingPost.id]: prev[incomingPost.id] || 0 }));

          if (incomingPost.user_id) {
            const { data: profileData, error: profileError } = await supabase
              .from("profiles")
              .select("id, username, full_name, avatar_url, is_online")
              .eq("id", incomingPost.user_id)
              .maybeSingle();

            if (!profileError && profileData) {
              setProfilesMap((prev) => ({
                ...prev,
                [incomingPost.user_id]: profileData as ProfilePreview,
              }));
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "posts" },
        (payload) => {
          const updatedPost = payload.new as Post;

          if (!updatedPost?.id) return;

          setPosts((prev) =>
            prev.map((post) => (post.id === updatedPost.id ? { ...post, ...updatedPost } : post))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "posts" },
        (payload) => {
          const deletedPostId = (payload.old as { id?: string } | null)?.id;
          if (!deletedPostId) return;

          setPosts((prev) => prev.filter((post) => post.id !== deletedPostId));
          setCommentsByPost((prev) => {
            const next = { ...prev };
            delete next[deletedPostId];
            return next;
          });
          setLikeCounts((prev) => {
            const next = { ...prev };
            delete next[deletedPostId];
            return next;
          });
          setRepostCounts((prev) => {
            const next = { ...prev };
            delete next[deletedPostId];
            return next;
          });
          setShareCounts((prev) => {
            const next = { ...prev };
            delete next[deletedPostId];
            return next;
          });
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, () => scheduleRealtimeRefresh(false))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "likes" },
        (payload) => {
          const postId = (payload.new as { post_id?: string } | null)?.post_id;
          if (!postId) return;

          setLikeCounts((prev) => ({
            ...prev,
            [postId]: (prev[postId] || 0) + 1,
          }));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "likes" },
        (payload) => {
          const postId = (payload.old as { post_id?: string } | null)?.post_id;
          if (!postId) return;

          setLikeCounts((prev) => ({
            ...prev,
            [postId]: Math.max((prev[postId] || 1) - 1, 0),
          }));
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "reposts" }, () => scheduleRealtimeRefresh(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "shares" }, () => scheduleRealtimeRefresh(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "reel_shares" }, () => scheduleRealtimeRefresh(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "comment_likes" }, () => scheduleRealtimeRefresh(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "comment_reports" }, () => scheduleRealtimeRefresh(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "user_blocks" }, () => scheduleRealtimeRefresh(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "followers" }, () => scheduleRealtimeRefresh(false))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        async (payload) => {
          const incoming = payload.new as NotificationRow;
          if (!currentUserId || incoming.user_id !== currentUserId) return;
          await fetchNotifications(currentUserId);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications" },
        async (payload) => {
          const incoming = payload.new as NotificationRow;
          if (!currentUserId || incoming.user_id !== currentUserId) return;
          await fetchNotifications(currentUserId);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications" },
        async (payload) => {
          const outgoing = payload.old as NotificationRow;
          if (!currentUserId || outgoing.user_id !== currentUserId) return;

          setNotifications((prev) => prev.filter((item) => item.id !== outgoing.id));
          await fetchNotifications(currentUserId);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "friend_requests" },
        async (payload) => {
          const incoming = payload.new as {
            sender_id?: string | null;
            receiver_id?: string | null;
            status?: string | null;
          };

          if (!currentUserId) return;

          const involvesUser =
            incoming.sender_id === currentUserId || incoming.receiver_id === currentUserId;

          if (!involvesUser) return;

          if (incoming.receiver_id === currentUserId && incoming.status === "pending") {
            setPendingFriendRequestCount((prev) => prev + 1);
          } else {
            await fetchPendingFriendRequests(currentUserId);
          }

          await fetchNotifications(currentUserId);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "friend_requests" },
        async (payload) => {
          const oldRow = payload.old as {
            sender_id?: string | null;
            receiver_id?: string | null;
            status?: string | null;
          };
          const newRow = payload.new as {
            sender_id?: string | null;
            receiver_id?: string | null;
            status?: string | null;
          };

          if (!currentUserId) return;

          const involvesUser =
            oldRow.sender_id === currentUserId ||
            oldRow.receiver_id === currentUserId ||
            newRow.sender_id === currentUserId ||
            newRow.receiver_id === currentUserId;

          if (!involvesUser) return;

          const oldPendingForUser =
            oldRow.receiver_id === currentUserId && oldRow.status === "pending";
          const newPendingForUser =
            newRow.receiver_id === currentUserId && newRow.status === "pending";

          if (oldPendingForUser && !newPendingForUser) {
            setPendingFriendRequestCount((prev) => Math.max(prev - 1, 0));
          } else if (!oldPendingForUser && newPendingForUser) {
            setPendingFriendRequestCount((prev) => prev + 1);
          } else {
            await fetchPendingFriendRequests(currentUserId);
          }

          await fetchNotifications(currentUserId);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "friend_requests" },
        async (payload) => {
          const outgoing = payload.old as {
            sender_id?: string | null;
            receiver_id?: string | null;
            status?: string | null;
          };

          if (!currentUserId) return;

          const involvesUser =
            outgoing.sender_id === currentUserId || outgoing.receiver_id === currentUserId;

          if (!involvesUser) return;

          if (outgoing.receiver_id === currentUserId && outgoing.status === "pending") {
            setPendingFriendRequestCount((prev) => Math.max(prev - 1, 0));
          } else {
            await fetchPendingFriendRequests(currentUserId);
          }

          await fetchNotifications(currentUserId);
        }
      )
      .subscribe();

    return () => {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [currentUserId, scheduleRealtimeRefresh, shouldShowIncomingPost]);

  const initializeDashboard = async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (!error && user) {
      setUserEmail(user.email || "");
      setCurrentUserId(user.id);

      await supabase.from("profiles").update({ is_online: true }).eq("id", user.id);

      await Promise.all([fetchAllData(user.id), fetchNotifications(user.id), fetchPendingFriendRequests(user.id)]);
    } else {
      await fetchAllData();
      setNotifications([]);
      setPendingFriendRequestCount(0);
    }
  };

  const normalizeReportComment = (report: CommentReport): Comment | null => {
    if (!report.comments) return null;
    if (Array.isArray(report.comments)) return report.comments[0] || null;
    return report.comments;
  };

  const findPostById = (postId: string) => {
    return posts.find((post) => post.id === postId) || null;
  };

  const findCommentById = (commentId: string) => {
    const allComments = Object.values(commentsByPost).flat();
    return allComments.find((comment) => comment.id === commentId) || null;
  };

  const isBlockedUser = (userId: string) => {
    if (!userId) return false;
    return blockedUserIds.includes(userId);
  };

  const canInteractWithPost = (postId: string) => {
    const post = findPostById(postId);
    if (!post) return false;
    return !isBlockedUser(post.user_id);
  };

  const canInteractWithComment = (commentId: string) => {
    const comment = findCommentById(commentId);
    if (!comment) return false;
    const post = findPostById(comment.post_id);
    if (!post) return false;
    return !isBlockedUser(comment.user_id) && !isBlockedUser(post.user_id);
  };

  const fetchProfilesMap = async (userIds: string[]) => {
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
      console.error("Error fetching profiles:", error.message);
      return;
    }

    const nextMap: Record<string, ProfilePreview> = {};
    for (const profile of data || []) {
      nextMap[profile.id] = profile as ProfilePreview;
    }

    setProfilesMap(nextMap);
  };

  const fetchNotifications = async (userId?: string) => {
    if (!userId) {
      setNotifications([]);
      return;
    }

    setNotificationsLoading(true);

    const { data, error } = await supabase
      .from("notifications")
      .select("id, user_id, actor_id, type, post_id, comment_id, friend_request_id, message, is_read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) {
      console.error("Error fetching notifications:", error.message);
      setNotifications([]);
      setNotificationsLoading(false);
      return;
    }

    setNotifications((data || []) as NotificationRow[]);
    setNotificationsLoading(false);
  };

  const fetchPendingFriendRequests = async (userId?: string) => {
    if (!userId) {
      setPendingFriendRequestCount(0);
      return;
    }

    const { count, error } = await supabase
      .from("friend_requests")
      .select("*", { count: "exact", head: true })
      .eq("receiver_id", userId)
      .eq("status", "pending");

    if (error) {
      console.error("Error fetching pending friend requests:", error.message);
      setPendingFriendRequestCount(0);
      return;
    }

    setPendingFriendRequestCount(count || 0);
  };

  const fetchFollowData = async (userId?: string) => {
    if (!userId) {
      setFollowedUserIds([]);
      setFollowingMap({});
      setFollowerCountByUser({});
      return { followedIds: [] as string[], followerCounts: {} as CountMap };
    }

    const [{ data: followingData, error: followingError }, { data: followerRows, error: followerError }] =
      await Promise.all([
        supabase.from("followers").select("following_id").eq("follower_id", userId),
        supabase.from("followers").select("following_id"),
      ]);

    if (followingError) {
      console.error("Error fetching following list:", followingError.message);
    }

    if (followerError) {
      console.error("Error fetching follower counts:", followerError.message);
    }

    const followedIds = (followingData || []).map((row) => row.following_id).filter(Boolean) as string[];
    const nextFollowingMap: FollowMap = {};
    followedIds.forEach((id) => {
      nextFollowingMap[id] = true;
    });

    const counts: CountMap = {};
    for (const row of followerRows || []) {
      if (!row.following_id) continue;
      counts[row.following_id] = (counts[row.following_id] || 0) + 1;
    }

    setFollowedUserIds(followedIds);
    setFollowingMap(nextFollowingMap);
    setFollowerCountByUser(counts);

    return { followedIds, followerCounts: counts };
  };

  const fetchAllData = async (userId?: string) => {
    setFetchingPosts(true);

    let blockedIds: string[] = [];
    let adminFlag = false;

    if (userId) {
      const { data: adminRow } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

      adminFlag = !!adminRow;
      setIsAdmin(adminFlag);

      const { data: blocksData, error: blocksError } = await supabase
        .from("user_blocks")
        .select("blocker_id, blocked_id")
        .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

      if (blocksError) {
        console.error("Error fetching blocks:", blocksError.message);
      } else {
        blockedIds =
          blocksData?.map((row) => (row.blocker_id === userId ? row.blocked_id : row.blocker_id)) || [];
      }
    } else {
      setIsAdmin(false);
    }

    setBlockedUserIds(blockedIds);

    const { followedIds } = await fetchFollowData(userId);

    const { data: postsData, error: postsError } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (postsError) {
      console.error("Error fetching posts:", postsError.message);
      setFetchingPosts(false);
      return;
    }

    let visiblePosts = ((postsData || []) as Post[]).filter((post) => !blockedIds.includes(post.user_id));

    if (feedMode === "following" && userId) {
      visiblePosts = visiblePosts.filter((post) => followedIds.includes(post.user_id));
    }

    setPosts(visiblePosts);

    let visibleSharedReels: SharedReelItem[] = [];

    const { data: reelSharesData, error: reelSharesError } = await supabase
      .from("reel_shares")
      .select("id, reel_id, user_id, caption, created_at")
      .order("created_at", { ascending: false });

    if (reelSharesError) {
      console.error("Error fetching reel shares:", reelSharesError.message);
      setSharedReelItems([]);
    } else {
      let visibleShareRows = (reelSharesData || []).filter((share) => !blockedIds.includes(share.user_id));

      if (feedMode === "following" && userId) {
        visibleShareRows = visibleShareRows.filter((share) => followedIds.includes(share.user_id));
      }

      const sharedReelIds = [
        ...new Set(visibleShareRows.map((share) => share.reel_id).filter(Boolean)),
      ];

      if (sharedReelIds.length > 0) {
        const { data: sharedReelRows, error: sharedReelsError } = await supabase
          .from("reels")
          .select("id, user_id, creator_profile_id, title, caption, video_url, poster_url")
          .in("id", sharedReelIds);

        if (sharedReelsError) {
          console.error("Error fetching shared reels:", sharedReelsError.message);
        } else {
          const sharedReelMap = new Map<string, {
            id: string;
            user_id: string | null;
            creator_profile_id: string | null;
            title: string | null;
            caption: string | null;
            video_url: string | null;
            poster_url: string | null;
          }>();

          for (const reel of sharedReelRows || []) {
            sharedReelMap.set(reel.id, reel);
          }

          visibleSharedReels = visibleShareRows
            .map((share) => {
              const reel = sharedReelMap.get(share.reel_id);
              if (!reel || !reel.video_url || !reel.user_id) return null;
              if (blockedIds.includes(reel.user_id)) return null;

              return {
                id: share.id,
                reel_id: share.reel_id,
                user_id: share.user_id,
                caption: share.caption || null,
                created_at: share.created_at,
                reel_title: reel.title || "Untitled Reel",
                reel_caption: reel.caption || null,
                reel_video_url: reel.video_url,
                reel_poster_url: reel.poster_url || null,
                reel_user_id: reel.user_id,
                creator_profile_id: reel.creator_profile_id || null,
              } satisfies SharedReelItem;
            })
            .filter(Boolean) as SharedReelItem[];
        }
      }

      setSharedReelItems(visibleSharedReels);
    }

    const visiblePostIds = visiblePosts.map((post) => post.id);

    const { data: commentsData, error: commentsError } = await supabase
      .from("comments")
      .select(`
        id,
        content,
        created_at,
        user_id,
        post_id,
        parent_comment_id,
        is_hidden
      `)
      .in("post_id", visiblePostIds.length ? visiblePostIds : [EMPTY_UUID])
      .order("created_at", { ascending: true });

    if (commentsError) {
      console.error("Error fetching comments:", commentsError.message);
      setFetchingPosts(false);
      return;
    }

    const groupedComments: CommentMap = {};
    for (const comment of (commentsData || []) as Comment[]) {
      if (!visiblePostIds.includes(comment.post_id)) continue;
      if (blockedIds.includes(comment.user_id)) continue;

      if (!groupedComments[comment.post_id]) {
        groupedComments[comment.post_id] = [];
      }

      groupedComments[comment.post_id].push(comment);
    }

    setCommentsByPost(groupedComments);

    const { data: likesData, error: likesError } = await supabase.from("likes").select("post_id, user_id");
    if (likesError) {
      console.error("Error fetching likes:", likesError.message);
      setFetchingPosts(false);
      return;
    }

    const likeMap: CountMap = {};
    const likedByUser: ToggleMap = {};
    for (const like of likesData || []) {
      if (!visiblePostIds.includes(like.post_id)) continue;
      likeMap[like.post_id] = (likeMap[like.post_id] || 0) + 1;
      if (userId && like.user_id === userId) likedByUser[like.post_id] = true;
    }

    setLikeCounts(likeMap);
    setUserLikes(likedByUser);

    const { data: repostsData, error: repostsError } = await supabase
      .from("reposts")
      .select("post_id, user_id");

    if (repostsError) {
      console.error("Error fetching reposts:", repostsError.message);
      setFetchingPosts(false);
      return;
    }

    const repostMap: CountMap = {};
    const repostedByUser: ToggleMap = {};
    for (const repost of repostsData || []) {
      if (!visiblePostIds.includes(repost.post_id)) continue;
      repostMap[repost.post_id] = (repostMap[repost.post_id] || 0) + 1;
      if (userId && repost.user_id === userId) repostedByUser[repost.post_id] = true;
    }

    setRepostCounts(repostMap);
    setUserReposts(repostedByUser);

    const { data: sharesData, error: sharesError } = await supabase.from("shares").select("post_id");
    if (sharesError) {
      console.error("Error fetching shares:", sharesError.message);
      setFetchingPosts(false);
      return;
    }

    const shareMap: CountMap = {};
    for (const share of sharesData || []) {
      if (!visiblePostIds.includes(share.post_id)) continue;
      shareMap[share.post_id] = (shareMap[share.post_id] || 0) + 1;
    }
    setShareCounts(shareMap);

    const { data: commentLikesData, error: commentLikesError } = await supabase
      .from("comment_likes")
      .select("comment_id, user_id");

    if (commentLikesError) {
      console.error("Error fetching comment likes:", commentLikesError.message);
      setFetchingPosts(false);
      return;
    }

    const visibleCommentIds = Object.values(groupedComments).flat().map((comment) => comment.id);
    const commentLikeMap: CountMap = {};
    const likedCommentsByUser: ToggleMap = {};
    for (const like of commentLikesData || []) {
      if (!visibleCommentIds.includes(like.comment_id)) continue;
      commentLikeMap[like.comment_id] = (commentLikeMap[like.comment_id] || 0) + 1;
      if (userId && like.user_id === userId) likedCommentsByUser[like.comment_id] = true;
    }

    setCommentLikeCounts(commentLikeMap);
    setUserCommentLikes(likedCommentsByUser);

    if (adminFlag) {
      const { data: reportsData, error: reportsError } = await supabase
        .from("comment_reports")
        .select("id, reason, created_at, comment_id, reporter_id, comment_owner_id, comments(id, content, created_at, user_id, post_id, parent_comment_id, is_hidden)")
        .order("created_at", { ascending: false });

      if (reportsError) {
        console.error("Error fetching reports:", reportsError.message);
        setReportedComments([]);
      } else {
        setReportedComments((reportsData as CommentReport[]) || []);
      }
    } else {
      setReportedComments([]);
    }

    const allUserIds = [
      ...visiblePosts.map((post) => post.user_id),
      ...visibleSharedReels.map((share) => share.user_id),
      ...visibleSharedReels.map((share) => share.reel_user_id),
      ...visibleSharedReels.map((share) => share.creator_profile_id || ""),
      ...Object.values(groupedComments).flat().map((comment) => comment.user_id),
    ];

    await fetchProfilesMap(allUserIds);
    setFetchingPosts(false);
  };

  useEffect(() => {
    if (!currentUserId) return;
    fetchAllData(currentUserId);
  }, [feedMode]);

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setImage(file);
  };

  const handleRemoveImage = () => {
    setImage(null);
    setImagePreviewUrl("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handlePost = async () => {
    if (!content.trim() && !image) {
      alert("Please add text or choose an image.");
      return;
    }

    setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      alert(`User error: ${userError?.message || "You must be logged in."}`);
      setLoading(false);
      return;
    }

    let imageUrl: string | null = null;

    if (image) {
      const fileExt = image.name.split(".").pop() || "jpg";
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from("post-images").upload(fileName, image, {
        cacheControl: "3600",
        upsert: false,
      });

      if (uploadError) {
        console.error("UPLOAD ERROR:", uploadError);
        alert(`Upload error: ${uploadError.message}`);
        setLoading(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage.from("post-images").getPublicUrl(fileName);
      imageUrl = publicUrlData.publicUrl;
    }

    const { error: insertError } = await supabase.from("posts").insert([
      {
        content: content.trim(),
        user_id: user.id,
        image_url: imageUrl,
      },
    ]);

    if (insertError) {
      console.error("POST INSERT ERROR:", insertError);
      alert(`Post error: ${insertError.message}`);
      setLoading(false);
      return;
    }

    setContent("");
    handleRemoveImage();
    await Promise.all([fetchAllData(user.id), fetchNotifications(user.id)]);
    setLoading(false);
  };

  const handleStartEditPost = (post: Post) => {
    setEditingPostId(post.id);
    setEditingPostContent(post.content || "");
    setOpenPostMenuId(null);
  };

  const handleSavePostEdit = async (postId: string) => {
    const trimmed = editingPostContent.trim();

    const { error } = await supabase
      .from("posts")
      .update({ content: trimmed })
      .eq("id", postId)
      .eq("user_id", currentUserId);

    if (error) {
      alert(`Edit post error: ${error.message}`);
      return;
    }

    setPosts((prev) => prev.map((post) => (post.id === postId ? { ...post, content: trimmed } : post)));
    setEditingPostId(null);
    setEditingPostContent("");
  };

  const handleDeletePost = async (postId: string) => {
    const confirmDelete = window.confirm("Delete this post?");
    if (!confirmDelete) return;

    const commentIds = (commentsByPost[postId] || []).map((comment) => comment.id);

    if (commentIds.length > 0) {
      await supabase.from("comment_likes").delete().in("comment_id", commentIds);
      await supabase.from("comment_reports").delete().in("comment_id", commentIds);
      await supabase.from("comments").delete().eq("post_id", postId);
    }

    await supabase.from("likes").delete().eq("post_id", postId);
    await supabase.from("reposts").delete().eq("post_id", postId);
    await supabase.from("shares").delete().eq("post_id", postId);

    const { error } = await supabase.from("posts").delete().eq("id", postId).eq("user_id", currentUserId);
    if (error) {
      alert(`Delete post error: ${error.message}`);
      return;
    }

    setOpenPostMenuId(null);
    setPosts((prev) => prev.filter((post) => post.id !== postId));
    setCommentsByPost((prev) => {
      const next = { ...prev };
      delete next[postId];
      return next;
    });
  };

  const handleLikeToggle = async (postId: string) => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      alert("You must be logged in to like a post.");
      return;
    }

    if (!canInteractWithPost(postId)) {
      alert("You cannot interact with this post.");
      return;
    }

    const alreadyLiked = !!userLikes[postId];

    if (alreadyLiked) {
      const { error } = await supabase.from("likes").delete().eq("user_id", user.id).eq("post_id", postId);
      if (error) {
        alert(`Unlike error: ${error.message}`);
        return;
      }

      setUserLikes((prev) => ({ ...prev, [postId]: false }));
      setLikeCounts((prev) => ({ ...prev, [postId]: Math.max((prev[postId] || 1) - 1, 0) }));
    } else {
      const { error } = await supabase.from("likes").insert([{ user_id: user.id, post_id: postId }]);
      if (error) {
        alert(`Like error: ${error.message}`);
        return;
      }

      setUserLikes((prev) => ({ ...prev, [postId]: true }));
      setLikeCounts((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
    }

    await fetchNotifications(user.id);
  };

  const handleRepostToggle = async (postId: string) => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      alert("You must be logged in to repost.");
      return;
    }

    if (!canInteractWithPost(postId)) {
      alert("You cannot interact with this post.");
      return;
    }

    const alreadyReposted = !!userReposts[postId];

    if (alreadyReposted) {
      const { error } = await supabase.from("reposts").delete().eq("user_id", user.id).eq("post_id", postId);
      if (error) {
        alert(`Repost error: ${error.message}`);
        return;
      }

      setUserReposts((prev) => ({ ...prev, [postId]: false }));
      setRepostCounts((prev) => ({ ...prev, [postId]: Math.max((prev[postId] || 1) - 1, 0) }));
    } else {
      const { error } = await supabase.from("reposts").insert([{ user_id: user.id, post_id: postId }]);
      if (error) {
        alert(`Repost error: ${error.message}`);
        return;
      }

      setUserReposts((prev) => ({ ...prev, [postId]: true }));
      setRepostCounts((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
    }
  };

  const handleShare = async (postId: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!canInteractWithPost(postId)) {
      alert("You cannot interact with this post.");
      return;
    }

    const shareUrl = `${window.location.origin}/dashboard#post-${postId}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch (error) {
      console.error("Clipboard error:", error);
    }

    const { error } = await supabase.from("shares").insert([{ post_id: postId, user_id: user?.id || null }]);
    if (error) {
      alert(`Share error: ${error.message}`);
      return;
    }

    setShareCounts((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
    alert("Post link copied.");
  };

  const handleDeleteReelShare = async (shareId: string) => {
    if (!currentUserId) return;

    const confirmDelete = window.confirm("Remove this shared reel from your feed?");
    if (!confirmDelete) return;

    const { error } = await supabase
      .from("reel_shares")
      .delete()
      .eq("id", shareId)
      .eq("user_id", currentUserId);

    if (error) {
      alert(`Remove shared reel error: ${error.message}`);
      return;
    }

    setSharedReelItems((prev) => prev.filter((item) => item.id !== shareId));
  };

  const handleFollowToggle = async (targetUserId: string) => {
    if (!currentUserId || !targetUserId || targetUserId === currentUserId) return;

    const alreadyFollowing = !!followingMap[targetUserId];

    if (alreadyFollowing) {
      const { error } = await supabase
        .from("followers")
        .delete()
        .eq("follower_id", currentUserId)
        .eq("following_id", targetUserId);

      if (error) {
        alert(`Unfollow error: ${error.message}`);
        return;
      }

      setFollowingMap((prev) => ({ ...prev, [targetUserId]: false }));
      setFollowedUserIds((prev) => prev.filter((id) => id !== targetUserId));
      setFollowerCountByUser((prev) => ({
        ...prev,
        [targetUserId]: Math.max((prev[targetUserId] || 1) - 1, 0),
      }));
    } else {
      const { error } = await supabase.from("followers").insert([
        {
          follower_id: currentUserId,
          following_id: targetUserId,
        },
      ]);

      if (error) {
        alert(`Follow error: ${error.message}`);
        return;
      }

      setFollowingMap((prev) => ({ ...prev, [targetUserId]: true }));
      setFollowedUserIds((prev) => [...new Set([...prev, targetUserId])]);
      setFollowerCountByUser((prev) => ({
        ...prev,
        [targetUserId]: (prev[targetUserId] || 0) + 1,
      }));
    }
  };

  const toggleCommentSection = (postId: string) => {
    setOpenCommentSections((prev) => {
      const nextOpen = !prev[postId];

      setTimeout(() => {
        if (nextOpen) {
          const input = commentInputRefs.current[postId];
          if (input) input.focus();
        }
      }, 0);

      return {
        ...prev,
        [postId]: nextOpen,
      };
    });
  };

  const focusReplyInput = (commentId: string) => {
    setOpenReplyBoxes((prev) => ({ ...prev, [commentId]: !prev[commentId] }));

    setTimeout(() => {
      const input = replyInputRefs.current[commentId];
      if (input) input.focus();
    }, 0);
  };

  const handleCommentChange = (postId: string, value: string) => {
    setCommentInputs((prev) => ({ ...prev, [postId]: value }));
  };

  const handleReplyChange = (commentId: string, value: string) => {
    setReplyInputs((prev) => ({ ...prev, [commentId]: value }));
  };

  const handleAddComment = async (postId: string) => {
    const commentText = commentInputs[postId]?.trim();
    if (!commentText) {
      alert("Write a comment first.");
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      alert("You must be logged in to comment.");
      return;
    }

    if (!canInteractWithPost(postId)) {
      alert("You cannot comment on this post.");
      return;
    }

    const { data: insertedComment, error } = await supabase
      .from("comments")
      .insert([
        { content: commentText, user_id: user.id, post_id: postId, parent_comment_id: null, is_hidden: false },
      ])
      .select(`
        id,
        content,
        created_at,
        user_id,
        post_id,
        parent_comment_id,
        is_hidden
      `)
      .single();

    if (error) {
      alert(`Comment error: ${error.message}`);
      return;
    }

    setCommentsByPost((prev) => ({
      ...prev,
      [postId]: [...(prev[postId] || []), { ...(insertedComment as Comment), profiles: profilesMap[user.id] || null }],
    }));

    setCommentInputs((prev) => ({ ...prev, [postId]: "" }));
    await fetchNotifications(user.id);
  };

  const handleAddReply = async (postId: string, parentCommentId: string) => {
    const replyText = replyInputs[parentCommentId]?.trim();
    if (!replyText) {
      alert("Write a reply first.");
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      alert("You must be logged in to reply.");
      return;
    }

    if (!canInteractWithPost(postId) || !canInteractWithComment(parentCommentId)) {
      alert("You cannot reply here.");
      return;
    }

    const { data: insertedReply, error } = await supabase
      .from("comments")
      .insert([
        { content: replyText, user_id: user.id, post_id: postId, parent_comment_id: parentCommentId, is_hidden: false },
      ])
      .select(`
        id,
        content,
        created_at,
        user_id,
        post_id,
        parent_comment_id,
        is_hidden
      `)
      .single();

    if (error) {
      alert(`Reply error: ${error.message}`);
      return;
    }

    setCommentsByPost((prev) => ({
      ...prev,
      [postId]: [...(prev[postId] || []), { ...(insertedReply as Comment), profiles: profilesMap[user.id] || null }],
    }));

    setReplyInputs((prev) => ({ ...prev, [parentCommentId]: "" }));
    setOpenReplyBoxes((prev) => ({ ...prev, [parentCommentId]: false }));
    await fetchNotifications(user.id);
  };

  const handleDeleteComment = async (postId: string, commentId: string) => {
    const confirmDelete = window.confirm("Delete this comment?");
    if (!confirmDelete) return;

    await supabase.from("comment_likes").delete().eq("comment_id", commentId);
    await supabase.from("comment_reports").delete().eq("comment_id", commentId);

    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", currentUserId);

    if (error) {
      alert(`Delete comment error: ${error.message}`);
      return;
    }

    setCommentsByPost((prev) => ({
      ...prev,
      [postId]: (prev[postId] || []).filter(
        (comment) => comment.id !== commentId && comment.parent_comment_id !== commentId
      ),
    }));

    setCommentMenu(null);
  };

  const handleCommentLikeToggle = async (commentId: string) => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      alert("You must be logged in to like a comment.");
      return;
    }

    if (!canInteractWithComment(commentId)) {
      alert("You cannot interact with this comment.");
      return;
    }

    const alreadyLiked = !!userCommentLikes[commentId];

    if (alreadyLiked) {
      const { error } = await supabase
        .from("comment_likes")
        .delete()
        .eq("user_id", user.id)
        .eq("comment_id", commentId);

      if (error) {
        alert(`Unlike error: ${error.message}`);
        return;
      }

      setUserCommentLikes((prev) => ({ ...prev, [commentId]: false }));
      setCommentLikeCounts((prev) => ({ ...prev, [commentId]: Math.max((prev[commentId] || 1) - 1, 0) }));
    } else {
      const { error } = await supabase.from("comment_likes").insert([{ user_id: user.id, comment_id: commentId }]);
      if (error) {
        alert(`Like error: ${error.message}`);
        return;
      }

      setUserCommentLikes((prev) => ({ ...prev, [commentId]: true }));
      setCommentLikeCounts((prev) => ({ ...prev, [commentId]: (prev[commentId] || 0) + 1 }));
    }

    await fetchNotifications(user.id);
  };

  const handleHideComment = async (commentId: string, postId: string) => {
    const targetPost = posts.find((post) => post.id === postId);
    if (!targetPost || targetPost.user_id !== currentUserId) {
      alert("Only the post owner can hide comments.");
      return;
    }

    const { error } = await supabase.from("comments").update({ is_hidden: true }).eq("id", commentId);
    if (error) {
      alert(`Hide error: ${error.message}`);
      return;
    }

    setCommentsByPost((prev) => ({
      ...prev,
      [postId]: (prev[postId] || []).map((comment) =>
        comment.id === commentId ? { ...comment, is_hidden: true } : comment
      ),
    }));

    setCommentMenu(null);
  };

  const handleReportComment = async (comment: Comment) => {
    if (!currentUserId) {
      showReportMessage("You must be logged in to report comments.");
      return;
    }

    if (!canInteractWithComment(comment.id)) {
      showReportMessage("You cannot interact with this comment.");
      return;
    }

    if (comment.user_id === currentUserId) {
      showReportMessage("You cannot report your own comment.");
      return;
    }

    const { data: existingReport, error: existingError } = await supabase
      .from("comment_reports")
      .select("id")
      .eq("comment_id", comment.id)
      .eq("reporter_id", currentUserId)
      .maybeSingle();

    if (existingError) {
      showReportMessage(`Report check error: ${existingError.message}`);
      return;
    }

    if (existingReport) {
      showReportMessage("You already reported this comment.");
      setCommentMenu(null);
      return;
    }

    const { error } = await supabase.from("comment_reports").insert([
      { comment_id: comment.id, reporter_id: currentUserId, comment_owner_id: comment.user_id, reason: reportReason },
    ]);

    if (error) {
      showReportMessage(`Report error: ${error.message}`);
      return;
    }

    showReportMessage("Comment reported.");
    setCommentMenu(null);
    setReportReason("spam_or_abuse");

    if (currentUserId) {
      await fetchAllData(currentUserId);
    }
  };

  const handleBlockUser = async (targetUserId: string) => {
    if (targetUserId === currentUserId) return;

    const { error } = await supabase.from("user_blocks").insert([
      { blocker_id: currentUserId, blocked_id: targetUserId },
    ]);

    if (error && !error.message.toLowerCase().includes("duplicate")) {
      alert(`Block error: ${error.message}`);
      return;
    }

    alert("User blocked.");
    setCommentMenu(null);
    await fetchAllData(currentUserId);
  };

  const handleUnblockUser = async (targetUserId: string) => {
    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", currentUserId)
      .eq("blocked_id", targetUserId);

    if (error) {
      alert(`Unblock error: ${error.message}`);
      return;
    }

    await fetchAllData(currentUserId);
  };

  const handleDismissReport = async (reportId: string) => {
    const { error } = await supabase.from("comment_reports").delete().eq("id", reportId);
    if (error) {
      alert(`Dismiss report error: ${error.message}`);
      return;
    }
    setReportedComments((prev) => prev.filter((report) => report.id !== reportId));
  };

  const handleAdminHideReportedComment = async (report: CommentReport) => {
    const reportComment = normalizeReportComment(report);
    if (!reportComment) return;

    const { error } = await supabase.from("comments").update({ is_hidden: true }).eq("id", reportComment.id);
    if (error) {
      alert(`Admin hide error: ${error.message}`);
      return;
    }

    setCommentsByPost((prev) => ({
      ...prev,
      [reportComment.post_id]: (prev[reportComment.post_id] || []).map((comment) =>
        comment.id === reportComment.id ? { ...comment, is_hidden: true } : comment
      ),
    }));

    setReportedComments((prev) =>
      prev.map((item) =>
        item.id === report.id
          ? {
              ...item,
              comments: Array.isArray(item.comments)
                ? item.comments.map((c) => ({ ...c, is_hidden: true }))
                : item.comments
                  ? { ...item.comments, is_hidden: true }
                  : item.comments,
            }
          : item
      )
    );
  };

  const handleAdminDeleteReportedComment = async (report: CommentReport) => {
    const reportComment = normalizeReportComment(report);
    if (!reportComment) return;

    await supabase.from("comment_likes").delete().eq("comment_id", reportComment.id);
    await supabase.from("comment_reports").delete().eq("comment_id", reportComment.id);

    const { error } = await supabase.from("comments").delete().eq("id", reportComment.id);
    if (error) {
      alert(`Admin delete error: ${error.message}`);
      return;
    }

    setCommentsByPost((prev) => ({
      ...prev,
      [reportComment.post_id]: (prev[reportComment.post_id] || []).filter(
        (comment) => comment.id !== reportComment.id && comment.parent_comment_id !== reportComment.id
      ),
    }));

    setReportedComments((prev) => prev.filter((item) => item.comment_id !== reportComment.id));
  };

  const openCommentMenu = (
    e: ReactMouseEvent<HTMLDivElement> | ReactTouchEvent<HTMLDivElement>,
    commentId: string,
    postId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();

    let x = 0;
    let y = 0;

    if ("touches" in e && e.touches.length > 0) {
      x = e.touches[0].clientX;
      y = e.touches[0].clientY;
    } else if ("changedTouches" in e && e.changedTouches.length > 0) {
      x = e.changedTouches[0].clientX;
      y = e.changedTouches[0].clientY;
    } else if ("clientX" in e) {
      x = e.clientX;
      y = e.clientY;
    }

    setCommentMenu({ commentId, postId, x, y, mode: "menu" });
  };

  const getVisibleCommentsForPost = (postId: string, isPostOwner: boolean) => {
    const allComments = commentsByPost[postId] || [];
    return allComments.filter((comment) => (isPostOwner ? true : !comment.is_hidden));
  };

  const getRootComments = (postId: string, isPostOwner: boolean) => {
    return getVisibleCommentsForPost(postId, isPostOwner).filter((comment) => !comment.parent_comment_id);
  };

  const getVisibleCommentCount = (postId: string, isPostOwner: boolean) => {
    return getVisibleCommentsForPost(postId, isPostOwner).length;
  };

  const activeComment = useMemo(() => {
    if (!commentMenu) return null;
    const comments = commentsByPost[commentMenu.postId] || [];
    return comments.find((comment) => comment.id === commentMenu.commentId) || null;
  }, [commentMenu, commentsByPost]);

  const getInitial = (name?: string | null, username?: string | null) => {
    const value = name || username || "U";
    return value.charAt(0).toUpperCase();
  };

  const formatRelativeTime = useCallback((value?: string | null) => {
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
  }, []);

  const mixedFeedItems = useMemo<MixedFeedItem[]>(() => {
    return [
      ...posts.map((post) => ({
        type: "post" as const,
        id: post.id,
        created_at: post.created_at,
        post,
      })),
      ...sharedReelItems.map((share) => ({
        type: "reel_share" as const,
        id: share.id,
        created_at: share.created_at,
        share,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [posts, sharedReelItems]);

  const currentFollowingCount = followedUserIds.length;



  return (
    <div className="min-h-screen bg-[#07090d] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[240px_minmax(0,1fr)_300px]">
          <aside
            className="order-2 xl:order-1"
            style={{
              background: "rgba(255,255,255,0.04)",
              borderRadius: "28px",
              padding: "20px",
              height: "fit-content",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: "24px" }}>Parapost Network</h2>
            <p style={{ color: "#9ca3af", fontSize: "14px" }}>Paranormal social hub</p>

            <div className="mt-6 flex flex-wrap gap-2 xl:block" style={{ marginTop: "24px" }}>
              <div style={navItemStyle}>Home</div>

              <Link
                href={`/profile/${currentUserId}`}
                style={{ ...navItemStyle, display: "block", textDecoration: "none", color: "white" }}
              >
                Profile
              </Link>

              <Link
                href="/reels"
                style={{ ...navItemStyle, display: "block", textDecoration: "none", color: "white" }}
              >
                Parapost Reels
              </Link>

              <div style={navItemStyle}>Messages</div>

              <Link
  href="/friends"
  style={{
    ...navItemStyle,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    textDecoration: "none",
    color: "white",
  }}
>
  <span>Friends</span>

{pendingFriendRequestCount > 0 && (
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
    {pendingFriendRequestCount > 99 ? "99+" : pendingFriendRequestCount}
  </span>
)}  
</Link>

              <DashboardNotificationsLink
                navItemStyle={navItemStyle}
                icon={<BellIcon />}
              />

              <div style={navItemStyle}>Saved Evidence</div>
              <div style={navItemStyle}>Settings</div>
            </div>
          </aside>

          <section className="order-1 xl:order-2 min-w-0">
            <div className="mx-auto w-full max-w-2xl space-y-4 md:space-y-6">
              <div
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 100%)",
                  borderRadius: "28px",
                  padding: "18px",
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
                    marginBottom: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <h3 style={{ marginTop: 0, marginBottom: "4px" }}>Create a Post</h3>
                    <p style={{ margin: 0, color: "#9ca3af", fontSize: "13px" }}>
                      Share evidence, theories, updates, or your latest paranormal experience.
                    </p>
                  </div>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#d1d5db",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: "999px",
                      padding: "6px 10px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Ready to publish
                  </span>
                </div>

                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Share your paranormal experience, evidence, theory, or latest update..."
                  rows={5}
                  style={textAreaStyle}
                />

                <div
                  style={{
                    marginTop: "10px",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: "24px",
                    background: "rgba(255,255,255,0.03)",
                    padding: "14px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      flexWrap: "wrap",
                      marginBottom: imagePreviewUrl ? "12px" : "0px",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "#f9fafb", marginBottom: "4px" }}>
                        Add media
                      </div>
                      <p style={{ margin: 0, fontSize: "13px", color: "#9ca3af" }}>
                        Upload one image with your post. JPG, PNG, or WebP work best.
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        style={secondaryButtonStyle}
                      >
                        {image ? "Change image" : "Upload image"}
                      </button>

                      {image && (
                        <button type="button" onClick={handleRemoveImage} style={dangerGhostButtonStyle}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    style={{ display: "none" }}
                  />

                  {imagePreviewUrl ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                      }}
                    >
                      <div
                        style={{
                          position: "relative",
                          overflow: "hidden",
                          borderRadius: "22px",
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "#0b1020",
                        }}
                      >
                        <img
                          src={imagePreviewUrl}
                          alt="Selected preview"
                          style={{
                            width: "100%",
                            maxHeight: "320px",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
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
                        <p
                          style={{
                            color: "#d1d5db",
                            margin: 0,
                            fontSize: "13px",
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: "999px",
                            padding: "8px 12px",
                          }}
                        >
                          Selected image: {image?.name}
                        </p>

                        <span style={{ color: "#6b7280", fontSize: "12px" }}>
                          Preview only — image uploads when you publish.
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        border: "1px dashed rgba(255,255,255,0.14)",
                        borderRadius: "20px",
                        padding: "16px",
                        color: "#6b7280",
                        fontSize: "13px",
                      }}
                    >
                      No image selected yet.
                    </div>
                  )}
                </div>

                <div
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    flexWrap: "wrap",
                    marginTop: "12px",
                  }}
                >
                  <p style={{ color: "#6b7280", margin: 0, fontSize: "13px" }}>
                    Add text, add an image, or combine both for a stronger post.
                  </p>

                  <button className="w-full sm:w-auto" onClick={handlePost} disabled={loading} style={primaryButtonStyle}>
                    {loading ? "Posting..." : "Publish post"}
                  </button>
                </div>
              </div>

              <DashboardReelsSection />

              {reportMessage && (
                <div
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: "#f9fafb",
                    borderRadius: "20px",
                    padding: "12px 14px",
                  }}
                >
                  {reportMessage}
                </div>
              )}

              <div
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 100%)",
                  borderRadius: "28px",
                  padding: "18px",
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
                    marginBottom: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <h3 style={{ marginTop: 0, marginBottom: "4px" }}>Recent Posts</h3>
                    <p style={{ margin: 0, color: "#9ca3af", fontSize: "13px" }}>
                      Your feed updates live while you browse.
                    </p>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12px",
                        color: "#86efac",
                        background: "rgba(34,197,94,0.10)",
                        border: "1px solid rgba(34,197,94,0.24)",
                        borderRadius: "999px",
                        padding: "6px 10px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: "#22c55e",
                          boxShadow: "0 0 8px rgba(34,197,94,0.7)",
                        }}
                      />
                      Live
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        onClick={() => setFeedMode("for_you")}
                        style={feedMode === "for_you" ? activePillStyle : pillStyle}
                      >
                        For You
                      </button>
                      <button
                        onClick={() => setFeedMode("following")}
                        style={feedMode === "following" ? activePillStyle : pillStyle}
                      >
                        Following
                      </button>
                    </div>
                  </div>
                </div>

                {fetchingPosts ? (
                  <p style={{ color: "#9ca3af" }}>Loading your feed...</p>
                ) : mixedFeedItems.length === 0 ? (
                  <p style={{ color: "#9ca3af" }}>
                    {feedMode === "following"
                      ? "No posts from followed accounts yet."
                      : "No posts yet. Be the first to share evidence, an update, or a theory."}
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {mixedFeedItems.map((feedItem) => {
                      if (feedItem.type === "reel_share") {
                        const shared = feedItem.share;
                        const sharerProfile = profilesMap[shared.user_id];
                        const creatorProfile =
                          profilesMap[shared.creator_profile_id || ""] || profilesMap[shared.reel_user_id];

                        return (
                          <div
                            id={`reel-share-${shared.id}`}
                            key={`reel-share-${shared.id}`}
                            style={{
                              background: "linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.035) 100%)",
                              border: "1px solid rgba(255,255,255,0.12)",
                              borderRadius: "26px",
                              padding: "16px",
                              position: "relative",
                              boxShadow: "0 10px 26px rgba(0,0,0,0.24)",
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {shared.user_id === currentUserId ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteReelShare(shared.id)}
                                style={{
                                  position: "absolute",
                                  top: "14px",
                                  right: "14px",
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  background: "rgba(255,255,255,0.06)",
                                  color: "#f9fafb",
                                  borderRadius: "999px",
                                  padding: "8px 11px",
                                  fontSize: "12px",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                Remove
                              </button>
                            ) : null}

                            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px", paddingRight: shared.user_id === currentUserId ? "82px" : 0 }}>
                              <Link
                                href={`/profile/${shared.user_id}`}
                                style={{
                                  width: "44px",
                                  height: "44px",
                                  borderRadius: "50%",
                                  overflow: "hidden",
                                  background: "#374151",
                                  color: "#f9fafb",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  textDecoration: "none",
                                  flexShrink: 0,
                                  fontWeight: 800,
                                }}
                              >
                                {sharerProfile?.avatar_url ? (
                                  <img
                                    src={sharerProfile.avatar_url}
                                    alt="Profile"
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  />
                                ) : (
                                  getInitial(sharerProfile?.full_name, sharerProfile?.username)
                                )}
                              </Link>

                              <div style={{ minWidth: 0 }}>
                                <Link
                                  href={`/profile/${shared.user_id}`}
                                  style={{ color: "#f9fafb", textDecoration: "none", fontWeight: 700 }}
                                >
                                  {sharerProfile?.full_name || sharerProfile?.username || "Parapost user"}
                                </Link>
                                <div style={{ color: "#9ca3af", fontSize: "13px", marginTop: "3px" }}>
                                  shared a reel · {formatRelativeTime(shared.created_at)}
                                </div>
                              </div>
                            </div>

                            {shared.caption ? (
                              <p style={{ color: "#f9fafb", lineHeight: 1.6, margin: "0 0 12px" }}>
                                {shared.caption}
                              </p>
                            ) : null}

                            <div
                              style={{
                                border: "1px solid rgba(255,255,255,0.10)",
                                borderRadius: "22px",
                                background: "rgba(0,0,0,0.30)",
                                padding: "12px",
                              }}
                            >
                              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                                <Link
                                  href={`/reels?reel=${shared.reel_id}`}
                                  style={{
                                    width: "clamp(142px, 34vw, 210px)",
                                    aspectRatio: "9 / 16",
                                    maxHeight: "360px",
                                boxShadow: "0 14px 34px rgba(0,0,0,0.34)",
                                    borderRadius: "18px",
                                    overflow: "hidden",
                                    position: "relative",
                                    background: "#000",
                                    display: "block",
                                    flexShrink: 0,
                                    }}
                                >
                                  <video
                                    src={shared.reel_video_url}
                                    poster={shared.reel_poster_url || undefined}
                                    muted
                                    playsInline
                                    preload="metadata"
                                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                  />
                                  <div
                                    style={{
                                      position: "absolute",
                                      inset: 0,
                                      background: "linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.34) 100%)",
                                      display: "grid",
                                      placeItems: "center",
                                      color: "white",
                                      fontSize: "32px",
                                      textShadow: "0 6px 18px rgba(0,0,0,0.55)",
                                    }}
                                  >
                                    ▶
                                  </div>
                                </Link>

                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      color: "#d1d5db",
                                      fontSize: "12px",
                                      border: "1px solid rgba(255,255,255,0.10)",
                                      borderRadius: "999px",
                                      padding: "6px 9px",
                                      background: "rgba(255,255,255,0.05)",
                                      marginBottom: "10px",
                                    }}
                                  >
                                    Parapost Reel
                                  </div>

                                  <h4 style={{ margin: "0 0 6px", color: "#fff", fontSize: "18px", lineHeight: 1.2 }}>
                                    {shared.reel_title}
                                  </h4>
                                  <p style={{ color: "#9ca3af", fontSize: "13px", lineHeight: 1.5, margin: "0 0 12px" }}>
                                    Original by {creatorProfile?.full_name || creatorProfile?.username || "Parapost creator"}
                                  </p>

                                  {shared.reel_caption ? (
                                    <p
                                      style={{
                                        color: "#d1d5db",
                                        fontSize: "13px",
                                        lineHeight: 1.5,
                                        margin: "0 0 14px",
                                        display: "-webkit-box",
                                        WebkitLineClamp: 3,
                                        WebkitBoxOrient: "vertical",
                                        overflow: "hidden",
                                      }}
                                    >
                                      {shared.reel_caption}
                                    </p>
                                  ) : null}

                                  <Link href={`/reels?reel=${shared.reel_id}`} style={primaryButtonStyle}>
                                    ▶ View Reel
                                  </Link>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      const post = feedItem.post;
                      const liked = !!userLikes[post.id];
                      const reposted = !!userReposts[post.id];
                      const likeCount = likeCounts[post.id] || 0;
                      const repostCount = repostCounts[post.id] || 0;
                      const shareCount = shareCounts[post.id] || 0;
                      const isPostOwner = currentUserId === post.user_id;
                      const rootComments = getRootComments(post.id, isPostOwner);
                      const commentCount = getVisibleCommentCount(post.id, isPostOwner);
                      const visibleComments = getVisibleCommentsForPost(post.id, isPostOwner);
                      const isCommentsOpen = !!openCommentSections[post.id];
                      const isEditing = editingPostId === post.id;
                      const isFollowingAuthor = !!followingMap[post.user_id];

                      return (
                        <div
                          id={`post-${post.id}`}
                          key={post.id}
                          style={{
                            background: "linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.035) 100%)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: "26px",
                            padding: "16px",
                            position: "relative",
                            transition: "all 180ms ease",
                            boxShadow: "0 10px 26px rgba(0,0,0,0.24)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "translateY(-2px)";
                            e.currentTarget.style.boxShadow = "0 14px 34px rgba(0,0,0,0.28)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateY(0px)";
                            e.currentTarget.style.boxShadow = "0 8px 22px rgba(0,0,0,0.22)";
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isPostOwner && (
                            <div style={{ position: "absolute", top: "14px", right: "14px" }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCommentMenu(null);
                                  setOpenPostMenuId((prev) => (prev === post.id ? null : post.id));
                                }}
                                style={dotsButtonStyle}
                              >
                                <DotsIcon />
                              </button>

                              {openPostMenuId === post.id && (
                                <div style={postMenuStyle} onClick={(e) => e.stopPropagation()}>
                                  <button style={menuItemStyle} onClick={() => handleStartEditPost(post)}>
                                    Edit post
                                  </button>
                                  <button
                                    style={{ ...menuItemStyle, color: "#f87171" }}
                                    onClick={() => handleDeletePost(post.id)}
                                  >
                                    Delete post
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          <div
                            style={{
                              marginBottom: "14px",
                              paddingRight: isPostOwner ? "44px" : 0,
                              display: "flex",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              gap: "12px",
                              flexWrap: "wrap",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                minWidth: 0,
                              }}
                            >
                              <Link
                                href={`/profile/${post.user_id}`}
                                aria-label={`View ${profilesMap[post.user_id]?.full_name || profilesMap[post.user_id]?.username || "user"} profile`}
                                style={{
                                  position: "relative",
                                  width: "48px",
                                  height: "48px",
                                  borderRadius: "50%",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                  textDecoration: "none",
                                  transition: "transform 160ms ease, filter 160ms ease",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = "scale(1.03)";
                                  e.currentTarget.style.filter = "brightness(1.06)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = "scale(1)";
                                  e.currentTarget.style.filter = "brightness(1)";
                                }}
                              >
                                {profilesMap[post.user_id]?.avatar_url ? (
                                  <img
                                    src={profilesMap[post.user_id]?.avatar_url || ""}
                                    alt="Profile"
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
                                    {getInitial(
                                      profilesMap[post.user_id]?.full_name,
                                      profilesMap[post.user_id]?.username
                                    )}
                                  </div>
                                )}

                                {profilesMap[post.user_id]?.is_online && (
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
                                )}
                              </Link>

                              <div style={{ minWidth: 0 }}>
                                <Link
                                  href={`/profile/${post.user_id}`}
                                  style={{
                                    color: "#f9fafb",
                                    textDecoration: "none",
                                    fontWeight: 600,
                                    display: "inline-block",
                                    marginBottom: "4px",
                                    transition: "opacity 160ms ease",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.opacity = "0.85";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.opacity = "1";
                                  }}
                                >
                                  {profilesMap[post.user_id]?.full_name ||
                                    profilesMap[post.user_id]?.username ||
                                    "Unnamed User"}
                                </Link>

                                <div
                                  style={{ fontSize: "13px", color: "#9ca3af" }}
                                  title={new Date(post.created_at).toLocaleString()}
                                >
                                  @{profilesMap[post.user_id]?.username || "no-username"} ·{" "}
                                  {formatRelativeTime(post.created_at)}
                                </div>

                              </div>
                            </div>

                            {!isPostOwner && (
                              <button
                                onClick={() => handleFollowToggle(post.user_id)}
                                style={isFollowingAuthor ? secondaryButtonStyle : primaryButtonStyle}
                              >
                                {isFollowingAuthor ? "Following" : "Follow"}
                              </button>
                            )}
                          </div>

                          {isEditing ? (
                            <div style={{ marginBottom: "12px" }}>
                              <textarea
                                value={editingPostContent}
                                onChange={(e) => setEditingPostContent(e.target.value)}
                                rows={4}
                                style={textAreaStyle}
                              />
                              <div className="flex flex-col sm:flex-row" style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                                <button className="w-full sm:w-auto" onClick={() => handleSavePostEdit(post.id)} style={primaryButtonStyle}>
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingPostId(null);
                                    setEditingPostContent("");
                                  }}
                                  className="w-full sm:w-auto"
                                  style={secondaryButtonStyle}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {post.content && (
                                <>
                                  <p
                                    style={{
                                      margin: 0,
                                      whiteSpace: "pre-wrap",
                                      lineHeight: 1.6,
                                      color: "#f9fafb",
                                    }}
                                  >
                                    {renderLinkedText(post.content)}
                                  </p>

                                  <LinkPreviewCard text={post.content} />
                                </>
                              )}
                            </>
                          )}

                          {post.image_url && (
                            <img
                              src={post.image_url}
                              alt="Post"
                              style={{
                                width: "100%",
                                maxHeight: "680px",
                                marginTop: "12px",
                                borderRadius: "22px",
                                objectFit: "cover",
                                boxShadow: "0 10px 28px rgba(0,0,0,0.30)",
                              }}
                            />
                          )}

                          <div
                            className="grid grid-cols-2 sm:flex"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "14px",
                              marginTop: "20px",
                              flexWrap: "wrap",
                            }}
                          >
                            <ActionButton onClick={() => handleLikeToggle(post.id)}>
                              <HeartIcon filled={liked} />
                              <ActionCount value={likeCount} />
                            </ActionButton>

                            <ActionButton onClick={() => toggleCommentSection(post.id)}>
                              <CommentIcon open={isCommentsOpen} />
                              <ActionCount value={commentCount} />
                            </ActionButton>

                            <ActionButton onClick={() => handleRepostToggle(post.id)}>
                              <RepostIcon active={reposted} />
                              <ActionCount value={repostCount} />
                            </ActionButton>

                            <ActionButton onClick={() => handleShare(post.id)}>
                              <ShareIcon />
                              <ActionCount value={shareCount} />
                            </ActionButton>
                          </div>

                          {isCommentsOpen && (
                            <div
                              style={{
                                marginTop: "22px",
                                paddingTop: "18px",
                                borderTop: "1px solid rgba(255,255,255,0.08)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  marginBottom: "12px",
                                }}
                              >
                                <h4
                                  style={{
                                    margin: 0,
                                    fontSize: "16px",
                                    fontWeight: 700,
                                    color: "#f9fafb",
                                  }}
                                >
                                  Comments
                                </h4>

                                <span
                                  style={{
                                    fontSize: "12px",
                                    color: "#9ca3af",
                                    background: "rgba(255,255,255,0.04)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    borderRadius: "999px",
                                    padding: "4px 8px",
                                  }}
                                >
                                  {commentCount} total
                                </span>
                              </div>

                              <div
                                className="flex flex-col sm:flex-row"
                                style={{
                                  display: "flex",
                                  gap: "10px",
                                  marginBottom: "14px",
                                  flexWrap: "wrap",
                                  alignItems: "stretch",
                                }}
                              >
                                <input
                                  ref={(el) => {
                                    commentInputRefs.current[post.id] = el;
                                  }}
                                  type="text"
                                  value={commentInputs[post.id] || ""}
                                  onChange={(e) => handleCommentChange(post.id, e.target.value)}
                                  placeholder="Write a comment..."
                                  className="w-full sm:w-auto"
                                  style={{
                                    ...inputStyle,
                                    minWidth: 0,
                                    flex: 1,
                                    height: "46px",
                                    borderRadius: "16px",
                                    background: "rgba(255,255,255,0.04)",
                                    border: "1px solid rgba(255,255,255,0.10)",
                                    color: "#f9fafb",
                                    padding: "0 14px",
                                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                                  }}
                                />

                                <button
                                  className="w-full sm:w-auto"
                                  onClick={() => handleAddComment(post.id)}
                                  style={{
                                    ...primaryButtonStyle,
                                    minHeight: "46px",
                                    borderRadius: "16px",
                                    padding: "0 18px",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  Comment
                                </button>
                              </div>

                              {rootComments.length === 0 ? (
                                <p style={{ color: "#9ca3af", margin: 0 }}>No comments yet.</p>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                  {rootComments.map((comment) => (
                                    <CommentThread
                                      key={comment.id}
                                      comment={comment}
                                      postId={post.id}
                                      blockedUserIds={blockedUserIds}
                                      posts={posts}
                                      isPostOwner={isPostOwner}
                                      allComments={visibleComments}
                                      openReplyBoxes={openReplyBoxes}
                                      replyInputs={replyInputs}
                                      userCommentLikes={userCommentLikes}
                                      commentLikeCounts={commentLikeCounts}
                                      replyInputRefs={replyInputRefs}
                                      onReplyToggle={focusReplyInput}
                                      onReplyChange={handleReplyChange}
                                      onAddReply={handleAddReply}
                                      onLike={handleCommentLikeToggle}
                                      onHide={handleHideComment}
                                      onOpenMenu={openCommentMenu}
                                      depth={0}
                                      profilesMap={profilesMap}
                                      formatRelativeTime={formatRelativeTime}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside
            className="order-3 xl:order-3"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <div
              style={{
                background: "rgba(255,255,255,0.05)",
                borderRadius: "28px",
                padding: "20px",
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
              }}
            >
              <h3 style={{ marginTop: 0 }}>Your Network</h3>
              <p style={{ color: "#d1d5db", marginBottom: "10px" }}>
                Following: <strong style={{ color: "white" }}>{currentFollowingCount}</strong>
              </p>
              <p style={{ color: "#d1d5db", marginBottom: "10px" }}>
                Current feed: <strong style={{ color: "white" }}>{feedMode === "for_you" ? "For You" : "Following"}</strong>
              </p>
              {userEmail && (
                <p style={{ color: "#9ca3af", marginBottom: 0, fontSize: "13px", wordBreak: "break-word" }}>
                  Signed in as <span style={{ color: "#f3f4f6" }}>{userEmail}</span>
                </p>
              )}
            </div>

            <div
              style={{
                background: "rgba(255,255,255,0.05)",
                borderRadius: "28px",
                padding: "20px",
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
              }}
            >
              <h3 style={{ marginTop: 0 }}>Trending Topics</h3>
              <ul style={{ paddingLeft: "18px", color: "#d1d5db", lineHeight: 1.8 }}>
                <li>Shadow figures</li>
                <li>Haunted hospitals</li>
                <li>EVP evidence</li>
                <li>UFO sightings</li>
                <li>Abandoned locations</li>
              </ul>
            </div>

            <div
              style={{
                background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 100%)",
                borderRadius: "28px",
                padding: "20px",
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
                <h3 style={{ margin: 0 }}>Parapost Reels</h3>
                <span
                  style={{
                    fontSize: "12px",
                    color: "#d1d5db",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: "999px",
                    padding: "6px 10px",
                    whiteSpace: "nowrap",
                  }}
                >
                  Launch prep
                </span>
              </div>
              <p style={{ color: "#d1d5db", marginTop: 0, lineHeight: 1.6 }}>
                Best launch placement: left navigation for visibility, plus a compact promo card near Create a Post.
              </p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <span style={activePillStyle}>Main nav</span>
                <span style={pillStyle}>Composer promo</span>
                <span style={pillStyle}>Profile tab later</span>
              </div>
            </div>

            <div
              style={{
                background: "rgba(255,255,255,0.05)",
                borderRadius: "28px",
                padding: "20px",
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
              }}
            >
              <h3 style={{ marginTop: 0 }}>Quick Stats</h3>
              <p style={{ color: "#d1d5db", marginBottom: "10px" }}>
                Total feed items: <strong style={{ color: "white" }}>{mixedFeedItems.length}</strong>
              </p>
              <p style={{ color: "#d1d5db", marginBottom: "10px" }}>
                Total likes:{" "}
                <strong style={{ color: "white" }}>
                  {Object.values(likeCounts).reduce((sum, count) => sum + count, 0)}
                </strong>
              </p>
              <p style={{ color: "#d1d5db", marginBottom: "10px" }}>
                Total reposts:{" "}
                <strong style={{ color: "white" }}>
                  {Object.values(repostCounts).reduce((sum, count) => sum + count, 0)}
                </strong>
              </p>
              <p style={{ color: "#d1d5db", marginBottom: "10px" }}>
                Total shares:{" "}
                <strong style={{ color: "white" }}>
                  {Object.values(shareCounts).reduce((sum, count) => sum + count, 0)}
                </strong>
              </p>
              <p style={{ color: "#d1d5db", marginBottom: "10px" }}>
                Total comments:{" "}
                <strong style={{ color: "white" }}>
                  {Object.values(commentsByPost).reduce((sum, list) => {
                    return sum + list.filter((comment) => !comment.is_hidden).length;
                  }, 0)}
                </strong>
              </p>
              <p style={{ color: "#d1d5db", marginBottom: "10px" }}>
                Blocked users: <strong style={{ color: "white" }}>{blockedUserIds.length}</strong>
              </p>
              <p style={{ color: "#d1d5db", margin: 0 }}>
                Status: <strong style={{ color: "#22c55e" }}>Online</strong>
              </p>
            </div>

            <div
              style={{
                background: "rgba(255,255,255,0.05)",
                borderRadius: "28px",
                padding: "20px",
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
              }}
            >
              <h3 style={{ marginTop: 0 }}>Blocked Users</h3>

              {blockedUserIds.length === 0 ? (
                <p style={{ color: "#9ca3af", margin: 0 }}>No blocked users.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {blockedUserIds.map((userId) => (
                    <div
                      key={userId}
                      style={{
                        background: "#0b1020",
                        border: "1px solid #1f2937",
                        borderRadius: "10px",
                        padding: "10px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#9ca3af",
                          marginBottom: "8px",
                          wordBreak: "break-all",
                        }}
                      >
                        {userId}
                      </div>

                      <button onClick={() => handleUnblockUser(userId)} style={secondaryButtonStyle}>
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {isAdmin && (
              <div
                style={{
                  background: "#111827",
                  borderRadius: "16px",
                  padding: "20px",
                  border: "1px solid #1f2937",
                }}
              >
                <h3 style={{ marginTop: 0 }}>Reported Comments</h3>

                {reportedComments.length === 0 ? (
                  <p style={{ color: "#9ca3af", margin: 0 }}>No reports right now.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {reportedComments.map((report) => {
                      const reportComment = normalizeReportComment(report);

                      return (
                        <div
                          key={report.id}
                          style={{
                            background: "#0b1020",
                            border: "1px solid #1f2937",
                            borderRadius: "12px",
                            padding: "12px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#9ca3af",
                              marginBottom: "8px",
                            }}
                          >
                            {formatRelativeTime(report.created_at)}
                          </div>

                          <p style={{ margin: "0 0 8px 0", color: "#f9fafb", lineHeight: 1.5 }}>
                            {reportComment?.content || "Comment no longer exists."}
                          </p>

                          <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>
                            Reason: {report.reason || "spam_or_abuse"}
                          </div>

                          <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>
                            Reporter: {report.reporter_id}
                          </div>

                          <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "10px" }}>
                            Comment owner: {report.comment_owner_id}
                          </div>

                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            {reportComment && !reportComment.is_hidden && (
                              <button onClick={() => handleAdminHideReportedComment(report)} style={secondaryButtonStyle}>
                                Hide comment
                              </button>
                            )}

                            {reportComment && (
                              <button
                                onClick={() => handleAdminDeleteReportedComment(report)}
                                style={{ ...secondaryButtonStyle, color: "#f87171" }}
                              >
                                Delete comment
                              </button>
                            )}

                            <button onClick={() => handleDismissReport(report.id)} style={secondaryButtonStyle}>
                              Dismiss report
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>

        {commentMenu && activeComment && (
          <div
            style={{
              position: "fixed",
              top: Math.min(commentMenu.y, window.innerHeight - 260),
              left: Math.min(commentMenu.x, window.innerWidth - 240),
              background: "#111827",
              border: "1px solid #1f2937",
              borderRadius: "12px",
              boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
              zIndex: 1000,
              minWidth: "220px",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {commentMenu.mode === "report" ? (
              <div style={{ padding: "12px" }}>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "#f9fafb",
                    marginBottom: "10px",
                  }}
                >
                  Report comment
                </div>

                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#0b1020",
                    color: "#f9fafb",
                    border: "1px solid #1f2937",
                    borderRadius: "10px",
                    padding: "10px",
                    marginBottom: "10px",
                  }}
                >
                  <option value="spam_or_abuse">Spam or abuse</option>
                  <option value="harassment">Harassment</option>
                  <option value="hate_speech">Hate speech</option>
                  <option value="violence">Violence</option>
                  <option value="misinformation">Misinformation</option>
                  <option value="other">Other</option>
                </select>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button style={primaryButtonStyle} onClick={() => handleReportComment(activeComment)}>
                    Submit
                  </button>

                  <button
                    style={secondaryButtonStyle}
                    onClick={() =>
                      setCommentMenu((prev) =>
                        prev
                          ? {
                              ...prev,
                              mode: "menu",
                            }
                          : prev
                      )
                    }
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <>
                {activeComment.user_id === currentUserId && (
                  <button
                    style={menuItemStyle}
                    onClick={() => handleDeleteComment(commentMenu.postId, activeComment.id)}
                  >
                    Delete comment
                  </button>
                )}

                {activeComment.user_id !== currentUserId && (
                  <>
                    <button
                      style={menuItemStyle}
                      onClick={() =>
                        setCommentMenu((prev) =>
                          prev
                            ? {
                                ...prev,
                                mode: "report",
                              }
                            : prev
                        )
                      }
                    >
                      Report comment
                    </button>

                    <button style={menuItemStyle} onClick={() => handleBlockUser(activeComment.user_id)}>
                      Block user
                    </button>
                  </>
                )}

                {posts.find((post) => post.id === commentMenu.postId)?.user_id === currentUserId &&
                  activeComment.user_id !== currentUserId &&
                  !activeComment.is_hidden && (
                    <button
                      style={{ ...menuItemStyle, color: "yellow" }}
                      onClick={() => handleHideComment(activeComment.id, commentMenu.postId)}
                    >
                      Hide comment
                    </button>
                  )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CommentThread({
  comment,
  postId,
  isPostOwner,
  allComments,
  openReplyBoxes,
  replyInputs,
  userCommentLikes,
  commentLikeCounts,
  replyInputRefs,
  onReplyToggle,
  onReplyChange,
  onAddReply,
  onLike,
  onHide,
  onOpenMenu,
  depth,
  blockedUserIds,
  posts,
  profilesMap,
  formatRelativeTime,
}: {
  comment: Comment;
  postId: string;
  isPostOwner: boolean;
  allComments: Comment[];
  openReplyBoxes: Record<string, boolean>;
  replyInputs: Record<string, string>;
  userCommentLikes: Record<string, boolean>;
  commentLikeCounts: Record<string, number>;
  replyInputRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  onReplyToggle: (commentId: string) => void;
  onReplyChange: (commentId: string, value: string) => void;
  onAddReply: (postId: string, parentCommentId: string) => void;
  onLike: (commentId: string) => void;
  onHide: (commentId: string, postId: string) => void;
  onOpenMenu: (
    e: ReactMouseEvent<HTMLDivElement> | ReactTouchEvent<HTMLDivElement>,
    commentId: string,
    postId: string
  ) => void;
  depth: number;
  blockedUserIds: string[];
  posts: Post[];
  profilesMap: Record<string, ProfilePreview>;
  formatRelativeTime: (value?: string | null) => string;
}) {
  const childReplies = allComments.filter(
    (item) => item.parent_comment_id === comment.id && (isPostOwner ? true : !item.is_hidden)
  );

  const liked = !!userCommentLikes[comment.id];
  const likeCount = commentLikeCounts[comment.id] || 0;
  const isHidden = !!comment.is_hidden;

  const interactionDisabled =
    blockedUserIds.includes(comment.user_id) ||
    blockedUserIds.includes(posts.find((p) => p.id === postId)?.user_id || "");

  const visualDepth = Math.min(depth, 1);
  const indent = visualDepth === 0 ? 0 : 22;

  const mergedComment: Comment = {
    ...comment,
    profiles: comment.profiles || profilesMap[comment.user_id] || null,
  };

  return (
    <div
      style={{
        marginTop: depth === 0 ? 0 : "10px",
        marginLeft: indent,
        position: "relative",
      }}
    >
      {depth > 0 && (
        <div
          style={{
            position: "absolute",
            left: "-12px",
            top: 0,
            bottom: 0,
            width: "1px",
            background: "#1f2937",
          }}
        />
      )}

      <CommentCard
        comment={mergedComment}
        isPostOwner={isPostOwner}
        isHidden={isHidden}
        liked={liked}
        likeCount={likeCount}
        interactionDisabled={interactionDisabled}
        onLike={() => onLike(comment.id)}
        onReply={() => onReplyToggle(comment.id)}
        onHide={() => onHide(comment.id, postId)}
        onOpenMenu={(e) => onOpenMenu(e, comment.id, postId)}
        formatRelativeTime={formatRelativeTime}
      />

      {openReplyBoxes[comment.id] && !isHidden && (
        <div
          className="flex flex-col sm:flex-row"
          style={{
            display: "flex",
            gap: "10px",
            marginTop: "10px",
            marginLeft: depth === 0 ? "22px" : "0px",
            flexWrap: "wrap",
            alignItems: "stretch",
          }}
        >
          <input
            ref={(el) => {
              replyInputRefs.current[comment.id] = el;
            }}
            type="text"
            value={replyInputs[comment.id] || ""}
            onChange={(e) => onReplyChange(comment.id, e.target.value)}
            placeholder="Write a reply..."
            className="w-full sm:w-auto"
            style={{
              ...inputStyle,
              minWidth: 0,
              flex: 1,
              height: "44px",
              borderRadius: "15px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "#f9fafb",
              padding: "0 14px",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
            }}
          />
          <button
            className="w-full sm:w-auto"
            onClick={() => onAddReply(postId, comment.id)}
            style={{
              ...primaryButtonStyle,
              minHeight: "44px",
              borderRadius: "15px",
              padding: "0 16px",
              whiteSpace: "nowrap",
            }}
          >
            Reply
          </button>
        </div>
      )}

      {childReplies.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            marginTop: "10px",
          }}
        >
          {childReplies.map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              postId={postId}
              blockedUserIds={blockedUserIds}
              posts={posts}
              isPostOwner={isPostOwner}
              allComments={allComments}
              openReplyBoxes={openReplyBoxes}
              replyInputs={replyInputs}
              userCommentLikes={userCommentLikes}
              commentLikeCounts={commentLikeCounts}
              replyInputRefs={replyInputRefs}
              onReplyToggle={onReplyToggle}
              onReplyChange={onReplyChange}
              onAddReply={onAddReply}
              onLike={onLike}
              onHide={onHide}
              onOpenMenu={onOpenMenu}
              depth={depth + 1}
              profilesMap={profilesMap}
              formatRelativeTime={formatRelativeTime}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentCard({
  comment,
  isPostOwner,
  isHidden,
  liked,
  likeCount,
  interactionDisabled = false,
  onReply,
  onLike,
  onHide,
  onOpenMenu,
  formatRelativeTime,
}: {
  comment: Comment;
  isPostOwner: boolean;
  isHidden: boolean;
  liked: boolean;
  likeCount: number;
  interactionDisabled?: boolean;
  onReply: () => void;
  onLike: () => void;
  onHide: () => void;
  onOpenMenu: (e: ReactMouseEvent<HTMLDivElement> | ReactTouchEvent<HTMLDivElement>) => void;
  formatRelativeTime: (value?: string | null) => string;
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLongPress = (e: ReactTouchEvent<HTMLDivElement>) => {
    longPressTimer.current = setTimeout(() => {
      if (interactionDisabled) return;
      onOpenMenu(e);
    }, 550);
  };

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const profile = comment.profiles;
  const displayName = profile?.full_name || profile?.username || "Unnamed User";
  const username = profile?.username || "no-username";
  const isOnline = !!profile?.is_online;
  const isReply = !!comment.parent_comment_id;

  return (
    <div
      onContextMenu={(e) => {
        if (interactionDisabled) return;
        onOpenMenu(e);
      }}
      onTouchStart={(e) => {
        if (interactionDisabled) return;
        startLongPress(e);
      }}
      onTouchEnd={clearLongPress}
      onTouchMove={clearLongPress}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: isHidden ? "1px solid #374151" : "1px solid rgba(255,255,255,0.08)",
        borderRadius: "20px",
        padding: "12px",
      }}
    >
      <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
        <Link
          href={`/profile/${comment.user_id}`}
          aria-label={`View ${displayName} profile`}
          style={{
            position: "relative",
            width: "38px",
            height: "38px",
            flexShrink: 0,
            textDecoration: "none",
            borderRadius: "50%",
            transition: "transform 160ms ease, filter 160ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.04)";
            e.currentTarget.style.filter = "brightness(1.06)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.filter = "brightness(1)";
          }}
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={displayName}
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "50%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "50%",
                background: "#374151",
                color: "#f9fafb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}

          {isOnline && (
            <span
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: "#22c55e",
                border: "2px solid #07090d",
              }}
            />
          )}
        </Link>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
            <Link
              href={`/profile/${comment.user_id}`}
              style={{
                fontWeight: 600,
                color: "#f9fafb",
                textDecoration: "none",
                transition: "opacity 160ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.85";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
            >
              {displayName}
            </Link>
            <span style={{ fontSize: "12px", color: "#6b7280" }}>@{username}</span>
            {isReply && (
              <span
                style={{
                  fontSize: "11px",
                  color: "#d1d5db",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "999px",
                  padding: "2px 8px",
                }}
              >
                Reply
              </span>
            )}
            {isHidden && (
              <span
                style={{
                  fontSize: "11px",
                  color: "#fbbf24",
                  background: "rgba(251,191,36,0.08)",
                  border: "1px solid rgba(251,191,36,0.18)",
                  borderRadius: "999px",
                  padding: "2px 8px",
                }}
              >
                Hidden
              </span>
            )}
          </div>

          <div
            style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}
            title={new Date(comment.created_at).toLocaleString()}
          >
            {formatRelativeTime(comment.created_at)}
          </div>

          <div style={{ color: "#f3f4f6", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
            {comment.content}
          </div>

          {!isHidden && (
            <div style={{ display: "flex", gap: "10px", marginTop: "10px", flexWrap: "wrap" }}>
              <button onClick={onReply} style={tinyGhostButtonStyle}>Reply</button>
              <button onClick={onLike} style={tinyGhostButtonStyle}>
                {liked ? "Liked" : "Like"} {likeCount > 0 ? `(${likeCount})` : ""}
              </button>
              {isPostOwner && <button onClick={onHide} style={tinyGhostButtonStyle}>Hide</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={actionButtonStyle}>
      {children}
    </button>
  );
}

function ActionCount({ value }: { value: number }) {
  return <span style={{ color: "#d1d5db", fontSize: "13px" }}>{value}</span>;
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 18H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M18 16V11C18 7.68629 15.3137 5 12 5C8.68629 5 6 7.68629 6 11V16L4 18H20L18 16Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="18" cy="12" r="1.8" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} aria-hidden="true">
      <path
        d="M12 20.5C12 20.5 4 15.2 4 9.5C4 6.46243 6.46243 4 9.5 4C11.243 4 12.7978 4.81055 13.8 6.07614C14.8022 4.81055 16.357 4 18.1 4C21.1376 4 23.6 6.46243 23.6 9.5C23.6 15.2 15.6 20.5 15.6 20.5H12Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CommentIcon({ open }: { open: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 17L4 20V6C4 4.89543 4.89543 4 6 4H18C19.1046 4 20 4.89543 20 6V15C20 16.1046 19.1046 17 18 17H7Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      {open && <path d="M8 9H16M8 13H13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
    </svg>
  );
}

function RepostIcon({ active }: { active: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M17 7L20 10L17 13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 10H20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M7 17L4 14L7 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 14H4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      {active && <circle cx="12" cy="12" r="2.2" fill="currentColor" />}
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 5L20 5L20 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 14L20 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path
        d="M20 14V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V6C4 4.89543 4.89543 4 6 4H10"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

const navItemStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: "18px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  marginBottom: "10px",
};

const textAreaStyle: CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  color: "#f9fafb",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "20px",
  padding: "14px 16px",
  outline: "none",
  resize: "vertical",
};

const inputStyle: CSSProperties = {
  flex: 1,
  background: "rgba(255,255,255,0.04)",
  color: "#f9fafb",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "14px",
  padding: "12px 14px",
  outline: "none",
};

const primaryButtonStyle: CSSProperties = {
  background: "white",
  color: "black",
  border: "none",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 700,
  cursor: "pointer",
  minHeight: "42px",
  transition: "all 160ms ease",
};

const secondaryButtonStyle: CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 600,
  cursor: "pointer",
  minHeight: "42px",
  transition: "all 160ms ease",
};

const dangerGhostButtonStyle: CSSProperties = {
  background: "rgba(248,113,113,0.10)",
  color: "#fecaca",
  border: "1px solid rgba(248,113,113,0.24)",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 600,
  cursor: "pointer",
  minHeight: "42px",
  transition: "all 160ms ease",
};

const tinyGhostButtonStyle: CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  color: "#d1d5db",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "999px",
  padding: "6px 10px",
  fontSize: "12px",
  cursor: "pointer",
};

const actionButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  minHeight: "40px",
  minWidth: "88px",
  background: "rgba(255,255,255,0.04)",
  color: "#f9fafb",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "999px",
  padding: "8px 12px",
  cursor: "pointer",
  transition: "all 160ms ease",
};

const dotsButtonStyle: CSSProperties = {
  width: "34px",
  height: "34px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "white",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const postMenuStyle: CSSProperties = {
  position: "absolute",
  top: "40px",
  right: 0,
  background: "#111827",
  border: "1px solid #1f2937",
  borderRadius: "12px",
  overflow: "hidden",
  minWidth: "160px",
  zIndex: 50,
};

const menuItemStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "10px 12px",
  border: "none",
  background: "transparent",
  color: "white",
  cursor: "pointer",
};

const pillStyle: CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  color: "#d1d5db",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "999px",
  padding: "8px 12px",
  fontWeight: 600,
  cursor: "pointer",
};

const activePillStyle: CSSProperties = {
  background: "white",
  color: "black",
  border: "1px solid white",
  borderRadius: "999px",
  padding: "8px 12px",
  fontWeight: 700,
  cursor: "pointer",
};


const sharedReelBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  width: "fit-content",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "#d1d5db",
  padding: "7px 10px",
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "0.01em",
};

const sharedReelPreviewFrameStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  borderRadius: "22px",
  border: "1px solid rgba(255,255,255,0.11)",
  background: "linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.025) 100%)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.34)",
};

const sharedReelPlayOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  pointerEvents: "none",
  background:
    "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.10) 45%, rgba(0,0,0,0.38) 100%)",
};

const sharedReelPlayButtonStyle: CSSProperties = {
  width: "56px",
  height: "56px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,0.92)",
  color: "#000",
  fontSize: "22px",
  fontWeight: 900,
  boxShadow: "0 10px 26px rgba(0,0,0,0.38)",
};

const sharedReelMetaStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: "13px",
  lineHeight: 1.5,
};

const sharedReelActionLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  minHeight: "40px",
  borderRadius: "999px",
  background: "white",
  color: "black",
  border: "none",
  padding: "9px 14px",
  fontWeight: 900,
  fontSize: "13px",
  textDecoration: "none",
  boxShadow: "0 8px 20px rgba(0,0,0,0.18)",
};

const sharedReelRemoveButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "40px",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.05)",
  color: "#fecaca",
  border: "1px solid rgba(248,113,113,0.22)",
  padding: "9px 14px",
  fontWeight: 800,
  fontSize: "13px",
  cursor: "pointer",
};


const linkPreviewCardStyle: CSSProperties = {
  marginTop: "12px",
  display: "flex",
  gap: "12px",
  alignItems: "center",
  borderRadius: "20px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(0,0,0,0.24)",
  padding: "10px",
  textDecoration: "none",
  color: "white",
  boxShadow: "0 10px 26px rgba(0,0,0,0.18)",
};

const linkPreviewMediaStyle: CSSProperties = {
  width: "116px",
  height: "74px",
  borderRadius: "16px",
  overflow: "hidden",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  flexShrink: 0,
  position: "relative",
};

const linkPreviewPlayOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  color: "white",
  fontSize: "26px",
  textShadow: "0 6px 18px rgba(0,0,0,0.65)",
  background: "rgba(0,0,0,0.12)",
};

const linkPreviewFaviconWrapStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.075) 0%, rgba(255,255,255,0.025) 100%)",
};

const linkPreviewEyebrowStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: "12px",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: "4px",
};

const linkPreviewTitleStyle: CSSProperties = {
  color: "#f9fafb",
  fontSize: "15px",
  fontWeight: 900,
  lineHeight: 1.25,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const linkPreviewDomainStyle: CSSProperties = {
  color: "#93c5fd",
  fontSize: "13px",
  marginTop: "4px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};


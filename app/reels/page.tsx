/* eslint-disable react-hooks/exhaustive-deps, @next/next/no-img-element */
"use client";
// REELS FLOW POLISH v1 - smoother route exits, lightweight prefetch, and safer video pause behavior.

import {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  SyntheticEvent as ReactSyntheticEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReelUploadModal from "./ReelUploadModal";
import ReelCard from "@/components/reels/ReelCard";
import ReelCommentsPanel from "@/components/reels/ReelCommentsPanel";
import { supabase } from "@/lib/supabase";

type ReelItem = {
  id: string;
  user_id: string;
  creator_profile_id: string;
  title: string;
  creator: string;
  creatorName: string;
  creatorAvatarUrl?: string;
  caption: string;
  video: string;
  poster: string;
  likes: number;
  comments: number;
  shares: number;
  createdAt?: string;
};

type ReelComment = {
  id: string;
  reelId: string;
  authorUserId: string;
  author: string;
  text: string;
  time: string;
  parentCommentId?: string | null;
  replyToAuthor?: string | null;
};

type ReelLikeDbRow = {
  id: string;
  reel_id: string | null;
  user_id: string | null;
  created_at?: string | null;
};

type ReelCommentDbRow = {
  id: string;
  reel_id: string | null;
  user_id: string | null;
  content: string | null;
  parent_comment_id?: string | null;
  reply_to_author?: string | null;
  created_at?: string | null;
};

type ReelCommentLikeDbRow = {
  id: string;
  comment_id: string | null;
  user_id: string | null;
  created_at?: string | null;
};

type MenuState = {
  reelId: string;
  x: number;
  y: number;
} | null;

type CommentMenuState = {
  commentId: string;
  x: number;
  y: number;
  isReply?: boolean;
} | null;

type ReelDbRow = {
  id: string;
  user_id: string | null;
  creator_profile_id: string | null;
  title: string | null;
  caption: string | null;
  video_url: string | null;
  poster_url: string | null;
  duration_seconds?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  created_at?: string | null;
};

type ProfileRow = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type FriendRequestRelationDbRow = {
  sender_id: string | null;
  receiver_id: string | null;
  status?: string | null;
};

type FollowerRelationDbRow = {
  follower_id: string | null;
  following_id: string | null;
};

type ReelRelationship = "you" | "friends" | "following" | "follower" | "profile";
type PlayPauseFeedback = { reelId: string; mode: "play" | "pause"; nonce: number } | null;

const initialComments: ReelComment[] = [];
const REEL_CAPTION_MAX_LENGTH = 4000;


const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background:
    "radial-gradient(circle at 12% 0%, rgba(168,85,247,0.28), transparent 36%), radial-gradient(circle at 88% 18%, rgba(124,58,237,0.18), transparent 34%), radial-gradient(circle at 50% 100%, rgba(236,72,153,0.10), transparent 32%), linear-gradient(180deg, #05050b 0%, #07090d 48%, #05050b 100%)",
  color: "#fff",
};

const topBarStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 60,
  padding: "16px 22px 0",
  background: "transparent",
  backdropFilter: "none",
  pointerEvents: "none",
};

const topBarInnerStyle: CSSProperties = {
  maxWidth: "1560px",
  margin: "0 auto",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
  pointerEvents: "auto",
};

const buttonStyle: CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
  backdropFilter: "blur(10px)",
};

const primaryButtonStyle: CSSProperties = {
  background: "linear-gradient(135deg, #a855f7, #7c3aed)",
  color: "#fff",
  border: "1px solid rgba(216,180,254,0.34)",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 800,
  fontSize: "14px",
  cursor: "pointer",
  boxShadow: "0 12px 26px rgba(168,85,247,0.28)",
};

const navLinkStyle: CSSProperties = {
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.08)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 700,
  fontSize: "14px",
  backdropFilter: "blur(10px)",
};

const scrollContainerStyle: CSSProperties = {
  height: "100dvh",
  overflowY: "auto",
  scrollSnapType: "y mandatory",
  scrollBehavior: "smooth",
  WebkitOverflowScrolling: "touch",
  overscrollBehaviorY: "contain",
  touchAction: "pan-y",
};

const sectionStyle: CSSProperties = {
  position: "relative",
  minHeight: "100dvh",
  scrollSnapAlign: "start",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  background:
    "radial-gradient(circle at 18% 12%, rgba(168,85,247,0.14), transparent 34%), radial-gradient(circle at 82% 85%, rgba(236,72,153,0.08), transparent 32%), transparent",
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.64)",
  zIndex: 80,
};

const modalWrapStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
  zIndex: 90,
};

const modalCardStyle: CSSProperties = {
  width: "min(560px, 100%)",
  background: "#0b1020",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "28px",
  padding: "20px",
  boxShadow: "0 16px 36px rgba(0,0,0,0.36)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "18px",
  padding: "14px 16px",
  fontSize: "14px",
  outline: "none",
};

const textAreaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: "120px",
  resize: "vertical",
  fontFamily: "inherit",
};

const menuItemStyle: CSSProperties = {
  width: "100%",
  background: "transparent",
  color: "white",
  border: "none",
  padding: "13px 14px",
  textAlign: "left",
  cursor: "pointer",
  fontSize: "14px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getViewportType(width: number) {
  if (width <= 767) return "mobile";
  if (width <= 1024) return "tablet";
  return "desktop";
}

function formatHandle(username?: string | null) {
  if (!username) return "@user";
  return `@${username.replace(/^@+/, "")}`;
}

function buildReelItems(rows: ReelDbRow[], profiles: ProfileRow[]): ReelItem[] {
  const profileMap = new Map<string, ProfileRow>();
  profiles.forEach((profile) => {
    profileMap.set(profile.id, profile);
  });

  return rows
    .filter((row) => row.id && row.video_url)
    .map((row) => {
      const profileId = row.creator_profile_id || row.user_id || "";
      const profile = profileMap.get(profileId);

      const creatorName =
        profile?.display_name?.trim() ||
        profile?.username?.trim() ||
        "Unknown User";

      return {
        id: row.id,
        user_id: row.user_id || "",
        creator_profile_id: profileId,
        title: row.title?.trim() || "Untitled Reel",
        creator: formatHandle(profile?.username),
        creatorName,
        creatorAvatarUrl: profile?.avatar_url || undefined,
        caption: row.caption?.trim() || "",
        video: row.video_url || "",
        poster: row.poster_url || "",
        likes: Number(row.likes || 0),
        comments: Number(row.comments || 0),
        shares: Number(row.shares || 0),
        createdAt: row.created_at || undefined,
      };
    });
}

function formatRelativeTime(value?: string | null) {
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
}


function formatActionCount(value: number | string) {
  if (typeof value === "string") return value;

  if (!Number.isFinite(value)) return "0";
  if (value < 1000) return `${value}`;

  try {
    return new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: value < 10000 ? 1 : 0,
    }).format(value);
  } catch {
    if (value >= 1000000) return `${Math.floor(value / 1000000)}M`;
    return `${Math.floor(value / 1000)}K`;
  }
}

function getRelationshipLabel(relationship: ReelRelationship) {
  if (relationship === "you") return "You";
  if (relationship === "friends") return "Friends";
  if (relationship === "following") return "Following";
  if (relationship === "follower") return "Follower";
  return "Profile";
}

function getRelationshipBadgeStyle(relationship: ReelRelationship): CSSProperties {
  if (relationship === "friends") {
    return {
      background: "rgba(168,85,247,0.26)",
      borderColor: "rgba(216,180,254,0.36)",
      color: "#f3e8ff",
    };
  }

  if (relationship === "following") {
    return {
      background: "rgba(59,130,246,0.20)",
      borderColor: "rgba(147,197,253,0.30)",
      color: "#dbeafe",
    };
  }

  if (relationship === "follower") {
    return {
      background: "rgba(34,197,94,0.18)",
      borderColor: "rgba(134,239,172,0.28)",
      color: "#dcfce7",
    };
  }

  if (relationship === "you") {
    return {
      background: "rgba(255,255,255,0.16)",
      borderColor: "rgba(255,255,255,0.24)",
      color: "#ffffff",
    };
  }

  return {
    background: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.18)",
    color: "#f9fafb",
  };
}

function getTargetReelIdFromUrl() {
  if (typeof window === "undefined") return "";

  const params = new URLSearchParams(window.location.search);
  return params.get("reel") || window.location.hash.replace("#", "");
}

function isReelOwner(
  reel: Pick<ReelItem, "user_id" | "creator_profile_id"> | null | undefined,
  userId: string
) {
  if (!reel || !userId) return false;
  return reel.user_id === userId || reel.creator_profile_id === userId;
}

async function insertReelNotification({
  userId,
  actorId,
  reelId,
  type,
  message,
  commentId = null,
}: {
  userId: string;
  actorId: string;
  reelId: string;
  type: "reel_like" | "reel_comment" | "reel_share" | "reel_reply";
  message: string;
  commentId?: string | null;
}) {
  if (!userId || !actorId || !reelId || userId === actorId) return;

  // A Reel can only be actively liked once by the same user.
  // Avoid accumulating duplicate like notifications in the database.
  if (type === "reel_like") {
    const { data: existingRows, error: existingError } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("actor_id", actorId)
      .eq("reel_id", reelId)
      .eq("type", "reel_like")
      .limit(1);

    if (existingError) {
      console.warn("Reel like notification check skipped:", existingError.message);
    } else if (existingRows && existingRows.length > 0) {
      return;
    }
  }

  const { error } = await supabase.from("notifications").insert([
    {
      user_id: userId,
      actor_id: actorId,
      type,
      post_id: null,
      comment_id: commentId,
      friend_request_id: null,
      reel_id: reelId,
      message,
      is_read: false,
    },
  ]);

  if (error) {
    console.warn("Reel notification skipped:", error.message);
  }
}

async function removeReelLikeNotification({
  userId,
  actorId,
  reelId,
}: {
  userId: string;
  actorId: string;
  reelId: string;
}) {
  if (!userId || !actorId || !reelId || userId === actorId) return;

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("user_id", userId)
    .eq("actor_id", actorId)
    .eq("reel_id", reelId)
    .eq("type", "reel_like");

  if (error) {
    console.warn("Reel like notification cleanup skipped:", error.message);
  }
}

export default function ReelsPage() {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState("");
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<ReelComment[]>(initialComments);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentLikeMap, setCommentLikeMap] = useState<Record<string, number>>({});
  const [commentLikedMap, setCommentLikedMap] = useState<Record<string, boolean>>({});
  const [hiddenCommentMap, setHiddenCommentMap] = useState<Record<string, boolean>>({});
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [commentMenu, setCommentMenu] = useState<CommentMenuState>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [commentLikeBurstId, setCommentLikeBurstId] = useState<string | null>(null);
  const [shareCaption, setShareCaption] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [targetReelId, setTargetReelId] = useState("");
  const [activeReelId, setActiveReelId] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [muteAll, setMuteAll] = useState(true);
  const [detailsReelId, setDetailsReelId] = useState("");
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [relationshipMap, setRelationshipMap] = useState<Record<string, ReelRelationship>>({});
  const [videoFitMap, setVideoFitMap] = useState<Record<string, "cover" | "contain">>({});
  const [reelMenu, setReelMenu] = useState<MenuState>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingReelId, setEditingReelId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [viewportWidth, setViewportWidth] = useState(1440);
  const [viewportHeight, setViewportHeight] = useState(900);
  const [holdPausedId, setHoldPausedId] = useState<string | null>(null);
  const [heartBurstId, setHeartBurstId] = useState<string | null>(null);
  const [playPauseFeedback, setPlayPauseFeedback] = useState<PlayPauseFeedback>(null);
  const [isFetchingReels, setIsFetchingReels] = useState(true);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const heartTimeoutRef = useRef<number | null>(null);
  const playPauseFeedbackTimeoutRef = useRef<number | null>(null);
  const playPauseFeedbackNonceRef = useRef(0);
  const didPositionTargetReelRef = useRef(false);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const commentTouchTimeRef = useRef<Record<string, number>>({});
  const commentLongPressTimeoutRef = useRef<number | null>(null);
  const commentLikeBurstTimeoutRef = useRef<number | null>(null);
  const reelsRealtimeRefreshTimerRef = useRef<number | null>(null);
  const viewportResizeFrameRef = useRef<number | null>(null);

  useEffect(() => {
    router.prefetch("/dashboard");
    router.prefetch("/notifications");
    router.prefetch("/messages");
    router.prefetch("/friends");
    router.prefetch("/settings");
  }, [router]);

  const pauseAllReelVideos = () => {
    Object.values(videoRefs.current).forEach((video) => {
      try {
        video?.pause();
      } catch {
        // A video can disappear during route changes or reloads.
      }
    });
  };

  const closeReelsOverlays = () => {
    setReelMenu(null);
    setCommentMenu(null);
    setCommentsOpen(false);
    setShareOpen(false);
    setDetailsReelId("");
    setEditOpen(false);
    setIsUploadModalOpen(false);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("create") !== "1") return;

    setReelMenu(null);
    setCommentMenu(null);
    setCommentsOpen(false);
    setShareOpen(false);
    setDetailsReelId("");
    setEditOpen(false);
    setIsUploadModalOpen(true);

    params.delete("create");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, []);

  const prepareReelsRouteExit = () => {
    closeReelsOverlays();
    setHoldPausedId(null);
    setPlayPauseFeedback(null);
    pauseAllReelVideos();
  };

  const detailsReel = useMemo(() => {
    return reels.find((reel) => reel.id === detailsReelId) || null;
  }, [reels, detailsReelId]);

  const detailsOpen = Boolean(detailsReelId && detailsReel);

  const loadRelationshipMap = async (viewerId: string, creatorIds: string[]) => {
    const uniqueCreatorIds = Array.from(new Set(creatorIds.filter(Boolean)));

    if (!viewerId || uniqueCreatorIds.length === 0) {
      setRelationshipMap({});
      return;
    }

    const nextRelationshipMap: Record<string, ReelRelationship> = {};
    uniqueCreatorIds.forEach((creatorId) => {
      nextRelationshipMap[creatorId] = creatorId === viewerId ? "you" : "profile";
    });

    const otherCreatorIds = uniqueCreatorIds.filter((creatorId) => creatorId !== viewerId);

    if (otherCreatorIds.length === 0) {
      setRelationshipMap(nextRelationshipMap);
      return;
    }

    const [
      { data: friendRows, error: friendError },
      { data: followingRows, error: followingError },
      { data: followerRows, error: followerError },
    ] = await Promise.all([
      supabase
        .from("friend_requests")
        .select("sender_id, receiver_id, status")
        .eq("status", "accepted")
        .or(`sender_id.eq.${viewerId},receiver_id.eq.${viewerId}`),
      supabase
        .from("followers")
        .select("follower_id, following_id")
        .eq("follower_id", viewerId)
        .in("following_id", otherCreatorIds),
      supabase
        .from("followers")
        .select("follower_id, following_id")
        .eq("following_id", viewerId)
        .in("follower_id", otherCreatorIds),
    ]);

    if (friendError) {
      console.warn("Reel relationship friend check skipped:", friendError.message);
    }

    if (followingError) {
      console.warn("Reel relationship following check skipped:", followingError.message);
    }

    if (followerError) {
      console.warn("Reel relationship follower check skipped:", followerError.message);
    }

    const friendIdSet = new Set<string>();
    ((friendRows || []) as FriendRequestRelationDbRow[]).forEach((row) => {
      const friendId = row.sender_id === viewerId ? row.receiver_id : row.sender_id;
      if (friendId && otherCreatorIds.includes(friendId)) {
        friendIdSet.add(friendId);
      }
    });

    const followingIdSet = new Set<string>();
    ((followingRows || []) as FollowerRelationDbRow[]).forEach((row) => {
      if (row.following_id) {
        followingIdSet.add(row.following_id);
      }
    });

    const followerIdSet = new Set<string>();
    ((followerRows || []) as FollowerRelationDbRow[]).forEach((row) => {
      if (row.follower_id) {
        followerIdSet.add(row.follower_id);
      }
    });

    otherCreatorIds.forEach((creatorId) => {
      if (friendIdSet.has(creatorId)) {
        nextRelationshipMap[creatorId] = "friends";
      } else if (followingIdSet.has(creatorId)) {
        nextRelationshipMap[creatorId] = "following";
      } else if (followerIdSet.has(creatorId)) {
        nextRelationshipMap[creatorId] = "follower";
      } else {
        nextRelationshipMap[creatorId] = "profile";
      }
    });

    setRelationshipMap(nextRelationshipMap);
  };

  const fetchReels = async (preferredReelId = "") => {
    setIsFetchingReels(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const nextUserId = user?.id || "";
    setCurrentUserId(nextUserId);

    const { data: reelRows, error: reelsError } = await supabase
      .from("reels")
      .select("*")
      .order("created_at", { ascending: false });

    if (reelsError) {
      console.error("Error loading reels:", reelsError.message);
      setReels([]);
      setComments([]);
      setLikedMap({});
      setRelationshipMap({});
      setVideoFitMap({});
      setIsFetchingReels(false);
      return;
    }

    const rows = (reelRows || []) as ReelDbRow[];
    const profileIds = Array.from(
      new Set(rows.map((row) => row.creator_profile_id || row.user_id).filter(Boolean))
    ) as string[];

    let profiles: ProfileRow[] = [];

    if (profileIds.length > 0) {
      const { data: profileRows, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", profileIds);

      if (profilesError) {
        console.error("Error loading reel profiles:", profilesError.message);
      } else {
        profiles = (profileRows || []) as ProfileRow[];
      }
    }

    let mapped = buildReelItems(rows, profiles);

    await loadRelationshipMap(
      nextUserId,
      mapped.map((reel) => reel.creator_profile_id)
    );

    const reelIds = mapped.map((reel) => reel.id);

    if (reelIds.length > 0) {
      const [{ data: likeRows, error: likesError }, { data: commentRows, error: commentsError }] =
        await Promise.all([
          supabase.from("reel_likes").select("id, reel_id, user_id, created_at").in("reel_id", reelIds),
          supabase.from("reel_comments").select("id, reel_id, user_id, content, parent_comment_id, reply_to_author, created_at").in("reel_id", reelIds).order("created_at", { ascending: false }),
        ]);

      if (!likesError && likeRows) {
        const likedByCurrentUser: Record<string, boolean> = {};
        const likeCountMap: Record<string, number> = {};

        (likeRows as ReelLikeDbRow[]).forEach((row) => {
          if (!row.reel_id) return;
          likeCountMap[row.reel_id] = (likeCountMap[row.reel_id] || 0) + 1;
          if (nextUserId && row.user_id === nextUserId) {
            likedByCurrentUser[row.reel_id] = true;
          }
        });

        mapped = mapped.map((reel) => ({
          ...reel,
          likes: likeCountMap[reel.id] ?? reel.likes,
        }));

        setLikedMap(likedByCurrentUser);
      } else if (likesError) {
        console.error("Error loading reel likes:", likesError.message);
        setLikedMap({});
      }

      if (!commentsError && commentRows) {
        const commentUserIds = Array.from(
          new Set(
            (commentRows as ReelCommentDbRow[])
              .map((row) => row.user_id)
              .filter(Boolean)
          )
        ) as string[];

        let commentProfiles: ProfileRow[] = [];

        if (commentUserIds.length > 0) {
          const { data: commentProfileRows, error: commentProfilesError } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .in("id", commentUserIds);

          if (commentProfilesError) {
            console.warn("Error loading reel comment profiles:", commentProfilesError.message);
          } else {
            commentProfiles = (commentProfileRows || []) as ProfileRow[];
          }
        }

        const profileMap = new Map<string, ProfileRow>();
        profiles.forEach((profile) => profileMap.set(profile.id, profile));
        commentProfiles.forEach((profile) => profileMap.set(profile.id, profile));

        const mappedComments = (commentRows as ReelCommentDbRow[]).map((row) => {
          const profile = row.user_id ? profileMap.get(row.user_id) : undefined;
          return {
            id: row.id,
            reelId: row.reel_id || "",
            authorUserId: row.user_id || "",
            author: formatHandle(profile?.username),
            text: row.content?.trim() || "",
            time: formatRelativeTime(row.created_at),
            parentCommentId: row.parent_comment_id || null,
            replyToAuthor: row.reply_to_author || null,
          } satisfies ReelComment;
        });

        const commentCountMap: Record<string, number> = {};
        mappedComments.forEach((comment) => {
          if (!comment.reelId) return;
          commentCountMap[comment.reelId] = (commentCountMap[comment.reelId] || 0) + 1;
        });

        mapped = mapped.map((reel) => ({
          ...reel,
          comments: commentCountMap[reel.id] ?? reel.comments,
        }));

        setComments(mappedComments);

        const commentIds = mappedComments.map((comment) => comment.id).filter(Boolean);

        if (commentIds.length > 0) {
          const { data: commentLikeRows, error: commentLikesError } = await supabase
            .from("reel_comment_likes")
            .select("id, comment_id, user_id, created_at")
            .in("comment_id", commentIds);

          if (!commentLikesError && commentLikeRows) {
            const nextCommentLikeMap: Record<string, number> = {};
            const nextCommentLikedMap: Record<string, boolean> = {};

            (commentLikeRows as ReelCommentLikeDbRow[]).forEach((row) => {
              if (!row.comment_id) return;
              nextCommentLikeMap[row.comment_id] = (nextCommentLikeMap[row.comment_id] || 0) + 1;

              if (nextUserId && row.user_id === nextUserId) {
                nextCommentLikedMap[row.comment_id] = true;
              }
            });

            setCommentLikeMap(nextCommentLikeMap);
            setCommentLikedMap(nextCommentLikedMap);
          } else {
            setCommentLikeMap({});
            setCommentLikedMap({});

            if (commentLikesError) {
              console.warn("Error loading reel comment likes:", commentLikesError.message);
            }
          }
        } else {
          setCommentLikeMap({});
          setCommentLikedMap({});
        }
      } else if (commentsError) {
        console.error("Error loading reel comments:", commentsError.message);
        setComments(initialComments);
        setCommentLikeMap({});
        setCommentLikedMap({});
      }

      const { data: shareRows, error: shareRowsError } = await supabase
        .from("reel_shares")
        .select("reel_id")
        .in("reel_id", reelIds);

      if (!shareRowsError && shareRows) {
        const shareCountMap: Record<string, number> = {};

        (shareRows as { reel_id: string | null }[]).forEach((row) => {
          if (!row.reel_id) return;
          shareCountMap[row.reel_id] = (shareCountMap[row.reel_id] || 0) + 1;
        });

        mapped = mapped.map((reel) => ({
          ...reel,
          shares: shareCountMap[reel.id] ?? reel.shares,
        }));
      } else if (shareRowsError) {
        console.warn("Error loading reel share counts:", shareRowsError.message);
      }

    } else {
      setComments(initialComments);
      setLikedMap({});
    }

    setReels(mapped);

    if (mapped.length > 0) {
      const preferredExists =
        !!preferredReelId && mapped.some((reel) => reel.id === preferredReelId);

      setActiveReelId((prev) => {
        if (preferredExists) return preferredReelId;
        return prev || mapped[0].id;
      });
    } else {
      setActiveReelId("");
    }

    setIsFetchingReels(false);
  };

  useEffect(() => {
    const nextTargetReelId = getTargetReelIdFromUrl();
    setTargetReelId(nextTargetReelId);
    fetchReels(nextTargetReelId);
  }, []);

  useEffect(() => {
    const scheduleReelsRefresh = () => {
      if (reelsRealtimeRefreshTimerRef.current) {
        window.clearTimeout(reelsRealtimeRefreshTimerRef.current);
      }

      reelsRealtimeRefreshTimerRef.current = window.setTimeout(() => {
        reelsRealtimeRefreshTimerRef.current = null;
        void fetchReels();
      }, 250);
    };

    const channel = supabase
      .channel(`reels-live-${currentUserId || "guest"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reels" }, scheduleReelsRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "reel_likes" }, scheduleReelsRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "reel_comments" }, scheduleReelsRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "reel_comment_likes" }, scheduleReelsRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "reel_shares" }, scheduleReelsRefresh)
      .subscribe();

    return () => {
      if (reelsRealtimeRefreshTimerRef.current) {
        window.clearTimeout(reelsRealtimeRefreshTimerRef.current);
        reelsRealtimeRefreshTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  useEffect(() => {
    const commitViewportSize = () => {
      viewportResizeFrameRef.current = null;
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };

    const scheduleViewportSize = () => {
      if (viewportResizeFrameRef.current !== null) return;
      viewportResizeFrameRef.current = window.requestAnimationFrame(commitViewportSize);
    };

    commitViewportSize();
    window.addEventListener("resize", scheduleViewportSize, { passive: true });
    window.addEventListener("orientationchange", scheduleViewportSize);

    return () => {
      window.removeEventListener("resize", scheduleViewportSize);
      window.removeEventListener("orientationchange", scheduleViewportSize);
      if (viewportResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(viewportResizeFrameRef.current);
        viewportResizeFrameRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (!targetReelId || reels.length === 0 || didPositionTargetReelRef.current) {
      return;
    }

    if (!reels.some((reel) => reel.id === targetReelId)) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) return;

    const target = container.querySelector<HTMLElement>(
      `[data-reel-id="${targetReelId}"]`
    );

    if (!target) return;

    didPositionTargetReelRef.current = true;
    setActiveReelId(targetReelId);

    const previousScrollBehavior = container.style.scrollBehavior;
    container.style.scrollBehavior = "auto";
    target.scrollIntoView({ behavior: "auto", block: "start" });
    container.style.scrollBehavior = previousScrollBehavior || "";
  }, [targetReelId, reels]);

  useEffect(() => {
    const closeMenu = () => {
      // On mobile, the owner menu opens from pointer/touch events.
      // A synthetic click can fire right after touch and instantly close the sheet.
      // Let the mobile overlay close itself instead.
      if (typeof window !== "undefined" && window.innerWidth <= 767) {
        return;
      }

      setReelMenu(null);
      setCommentMenu(null);
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu);
    };
  }, []);

  useEffect(() => {
    if (!commentsOpen) return;

    const focusTimer = window.setTimeout(() => {
      commentInputRef.current?.focus();
    }, 260);

    return () => window.clearTimeout(focusTimer);
  }, [commentsOpen, activeReelId]);

  useEffect(() => {
    reels.forEach((reel) => {
      const video = videoRefs.current[reel.id];
      if (!video) return;

      video.muted = muteAll;

      if (reel.id === activeReelId && holdPausedId !== reel.id && !commentsOpen && !detailsOpen) {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
      } else {
        video.pause();
      }
    });
  }, [activeReelId, reels, muteAll, holdPausedId, commentsOpen, detailsOpen]);

  useEffect(() => {
    const handlePageHidden = () => {
      if (document.visibilityState === "hidden") {
        pauseAllReelVideos();
      }
    };

    const handlePageHide = () => {
      prepareReelsRouteExit();
    };

    document.addEventListener("visibilitychange", handlePageHidden);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handlePageHidden);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  useEffect(() => {
    return () => {
      prepareReelsRouteExit();

      if (heartTimeoutRef.current) {
        window.clearTimeout(heartTimeoutRef.current);
      }

      if (playPauseFeedbackTimeoutRef.current) {
        window.clearTimeout(playPauseFeedbackTimeoutRef.current);
      }

      if (commentLongPressTimeoutRef.current) {
        window.clearTimeout(commentLongPressTimeoutRef.current);
      }

      if (commentLikeBurstTimeoutRef.current) {
        window.clearTimeout(commentLikeBurstTimeoutRef.current);
      }
    };
  }, []);

  const viewportType = getViewportType(viewportWidth);

  const stageMetrics = useMemo(() => {
    const isTinyPhone = viewportWidth <= 380;
    const isSmallPhone = viewportWidth <= 430;
    const isShortScreen = viewportHeight <= 700;
    const isLandscapePhone = viewportType === "mobile" && viewportWidth > viewportHeight;
    const isNotebook = viewportWidth > 1024 && viewportWidth <= 1366;

    if (viewportType === "mobile") {
      return {
        stageWidth: "100vw",
        stageHeight: "100dvh",
        borderRadius: 0,
        showDesktopArrows: false,
        outerPadding: 0,
        actionRight: isTinyPhone ? 7 : 10,
        textLeft: isTinyPhone ? 10 : 12,
        textRight: isTinyPhone ? 68 : 78,
        bottomOffset: isLandscapePhone ? 54 : isShortScreen ? 68 : 88,
        topOffset: 0,
        titleSize: isTinyPhone ? 18 : 20,
        captionSize: isTinyPhone ? 13 : 14,
        captionLines: isShortScreen || isLandscapePhone ? 1 : 2,
        topHeaderPad: isLandscapePhone ? 8 : 12,
        actionButtonSize: isTinyPhone ? 42 : isSmallPhone ? 44 : 48,
        actionSymbolSize: isTinyPhone ? 16 : 18,
        actionGap: isShortScreen || isLandscapePhone ? 7 : 9,
        actionLabelSize: isTinyPhone ? 10 : 11,
        actionLabelMaxWidth: isTinyPhone ? 48 : 58,
      };
    }

    if (viewportType === "tablet") {
      const isNarrowTablet = viewportWidth <= 820;

      return {
        stageWidth: isNarrowTablet ? "min(88vw, 560px)" : "min(72vw, 620px)",
        stageHeight: "min(calc(100dvh - 142px), 820px)",
        borderRadius: 30,
        showDesktopArrows: false,
        outerPadding: isNarrowTablet ? 14 : 20,
        actionRight: 14,
        textLeft: 18,
        textRight: 90,
        bottomOffset: 22,
        topOffset: 8,
        titleSize: 24,
        captionSize: 15,
        captionLines: 3,
        topHeaderPad: 14,
        actionButtonSize: 50,
        actionSymbolSize: 19,
        actionGap: 10,
        actionLabelSize: 12,
        actionLabelMaxWidth: 64,
      };
    }

    return {
      stageWidth: isNotebook ? "min(42vw, 560px)" : "min(34vw, 540px)",
      stageHeight: "min(90dvh, 980px)",
      borderRadius: 32,
      showDesktopArrows: true,
      outerPadding: isNotebook ? 20 : 24,
      actionRight: 12,
      textLeft: 18,
      textRight: 84,
      bottomOffset: 16,
      topOffset: 8,
      titleSize: 22,
      captionSize: 14,
      captionLines: 3,
      topHeaderPad: 12,
      actionButtonSize: 52,
      actionSymbolSize: 19,
      actionGap: 10,
      actionLabelSize: 12,
      actionLabelMaxWidth: 64,
    };
  }, [viewportType, viewportWidth, viewportHeight]);

  const activeReel = useMemo(() => {
    return reels.find((reel) => reel.id === activeReelId) || reels[0];
  }, [reels, activeReelId]);


  const activeComments = useMemo(() => {
    return comments.filter(
      (comment) =>
        comment.reelId === activeReelId &&
        !comment.parentCommentId &&
        !hiddenCommentMap[comment.id]
    );
  }, [comments, activeReelId, hiddenCommentMap]);

  const scrollToReel = (reelId: string) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const target = container.querySelector<HTMLElement>(`[data-reel-id="${reelId}"]`);
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveReelId(reelId);
  };

  const scrollToAdjacentReel = (direction: "prev" | "next") => {
    if (commentsOpen || detailsOpen) return;

    const currentIndex = reels.findIndex((reel) => reel.id === activeReelId);
    if (currentIndex === -1) return;

    const nextIndex = direction === "prev" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= reels.length) return;

    scrollToReel(reels[nextIndex].id);
  };

  const handleCloseComments = () => {
    const reelIdToRestore = activeReelId;

    setCommentsOpen(false);
    setCommentMenu(null);
    setEditingCommentId(null);
    setEditingCommentText("");
    setSavingCommentId(null);
    setReplyingToCommentId(null);
    setReplyDraft("");

    window.setTimeout(() => {
      const container = scrollContainerRef.current;
      if (!container || !reelIdToRestore) return;

      const target = container.querySelector<HTMLElement>(
        `[data-reel-id="${reelIdToRestore}"]`
      );

      if (!target) return;

      const previousScrollBehavior = container.style.scrollBehavior;
      container.style.scrollBehavior = "auto";
      target.scrollIntoView({ behavior: "auto", block: "start" });
      container.style.scrollBehavior = previousScrollBehavior || "";
      setActiveReelId(reelIdToRestore);

      window.requestAnimationFrame(() => {
        const video = videoRefs.current[reelIdToRestore];
        if (!video) return;

        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
      });
    }, 80);
  };

  const updateActiveFromScroll = () => {
    if (commentsOpen || detailsOpen) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const containerTop = container.getBoundingClientRect().top;
    let closestId = activeReelId;
    let closestDistance = Number.POSITIVE_INFINITY;

    const sections = Array.from(
      container.querySelectorAll<HTMLElement>("[data-reel-id]")
    );

    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      const distance = Math.abs(rect.top - containerTop);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestId = section.dataset.reelId || closestId;
      }
    });

    if (closestId !== activeReelId) {
      setActiveReelId(closestId);
      setHoldPausedId(null);
    }
  };

  const showPlayPauseFeedback = (reelId: string, mode: "play" | "pause") => {
    if (playPauseFeedbackTimeoutRef.current) {
      window.clearTimeout(playPauseFeedbackTimeoutRef.current);
    }

    playPauseFeedbackNonceRef.current += 1;
    setPlayPauseFeedback({
      reelId,
      mode,
      nonce: playPauseFeedbackNonceRef.current,
    });

    playPauseFeedbackTimeoutRef.current = window.setTimeout(() => {
      setPlayPauseFeedback(null);
    }, 420);
  };

  const handleTogglePlayPause = (reelId: string) => {
    if (commentsOpen || detailsOpen) return;

    const video = videoRefs.current[reelId];
    if (!video) return;

    const shouldPlay = video.paused || video.ended;

    if (shouldPlay) {
      showPlayPauseFeedback(reelId, "play");
      setHoldPausedId(null);

      window.requestAnimationFrame(() => {
        const currentVideo = videoRefs.current[reelId];
        if (!currentVideo) return;

        const playPromise = currentVideo.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
      });
    } else {
      showPlayPauseFeedback(reelId, "pause");
      setHoldPausedId(reelId);
      video.pause();
    }
  };

  const triggerHeartBurst = (reelId: string) => {
    setHeartBurstId(reelId);
    if (heartTimeoutRef.current) {
      window.clearTimeout(heartTimeoutRef.current);
    }
    heartTimeoutRef.current = window.setTimeout(() => {
      setHeartBurstId(null);
    }, 700);
  };

  const handleDoubleTapLike = async (reelId: string) => {
    if (likedMap[reelId]) return;
    await handleLikeToggle(reelId, true);
  };

  const handleLikeToggle = async (reelId: string, forceLike = false) => {
    if (!currentUserId) {
      alert("You must be logged in to like reels.");
      return;
    }

    const reel = reels.find((item) => item.id === reelId);
    if (!reel) return;

    const nextLiked = forceLike ? true : !likedMap[reelId];

    setLikedMap((prev) => ({
      ...prev,
      [reelId]: nextLiked,
    }));

    setReels((prev) =>
      prev.map((item) =>
        item.id === reelId
          ? { ...item, likes: Math.max(item.likes + (nextLiked ? 1 : -1), 0) }
          : item
      )
    );

    if (nextLiked) {
      triggerHeartBurst(reelId);
      const { error: likeInsertError } = await supabase.from("reel_likes").insert([
        {
          reel_id: reelId,
          user_id: currentUserId,
        },
      ]);

      if (likeInsertError && !likeInsertError.message.toLowerCase().includes("duplicate")) {
        console.error("Reel like insert error:", likeInsertError.message);
        alert(likeInsertError.message || "Could not like reel.");
        await fetchReels();
        return;
      }

      await insertReelNotification({
        userId: reel.creator_profile_id || reel.user_id,
        actorId: currentUserId,
        reelId,
        type: "reel_like",
        message: "liked your reel.",
      });
    } else {
      const { error: likeDeleteError } = await supabase
        .from("reel_likes")
        .delete()
        .eq("reel_id", reelId)
        .eq("user_id", currentUserId);

      if (likeDeleteError) {
        console.error("Reel like delete error:", likeDeleteError.message);
        alert(likeDeleteError.message || "Could not remove reel like.");
        await fetchReels();
        return;
      }

      await removeReelLikeNotification({
        userId: reel.creator_profile_id || reel.user_id,
        actorId: currentUserId,
        reelId,
      });
    }
  };

  const handleShareLink = async (reelId: string) => {
    const reelUrl = `${window.location.origin}/reels#${reelId}`;

    try {
      await navigator.clipboard.writeText(reelUrl);
      setShareMessage("Reel link copied.");
    } catch {
      setShareMessage("Could not copy reel link.");
    }

    window.setTimeout(() => {
      setShareMessage("");
    }, 2200);
  };

  const handleAddComment = async () => {
    const trimmed = commentDraft.trim();
    if (!trimmed || !activeReel) return;

    if (!currentUserId) {
      alert("You must be logged in to comment on reels.");
      return;
    }

    const optimisticCommentId = `comment-${Date.now()}`;

    const nextComment: ReelComment = {
      id: optimisticCommentId,
      reelId: activeReel.id,
      authorUserId: currentUserId,
      author: "@you",
      text: trimmed,
      time: "Just now",
      parentCommentId: null,
      replyToAuthor: null,
    };

    setComments((prev) => [nextComment, ...prev]);
    setReels((prev) =>
      prev.map((reel) =>
        reel.id === activeReel.id ? { ...reel, comments: reel.comments + 1 } : reel
      )
    );
    setCommentDraft("");

    const { data: insertedComment, error: commentInsertError } = await supabase
      .from("reel_comments")
      .insert([
        {
          reel_id: activeReel.id,
          user_id: currentUserId,
          content: trimmed,
          parent_comment_id: null,
          reply_to_author: null,
        },
      ])
      .select("id")
      .single();

    if (commentInsertError) {
      console.error("Reel comment insert error:", commentInsertError.message);
      alert(commentInsertError.message || "Could not save reel comment.");
      await fetchReels();
      return;
    }

    if (insertedComment?.id) {
      setComments((prev) =>
        prev.map((comment) =>
          comment.id === optimisticCommentId ? { ...comment, id: insertedComment.id } : comment
        )
      );
    }

    const activeReelOwnerId = activeReel.creator_profile_id || activeReel.user_id;

    if (activeReelOwnerId && activeReelOwnerId !== currentUserId) {
      await insertReelNotification({
        userId: activeReelOwnerId,
        actorId: currentUserId,
        reelId: activeReel.id,
        type: "reel_comment",
        message: "commented on your reel.",
      });
    }
  };

  const handleCommentInputKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleAddComment();
    }
  };

  const handleStartEditComment = (comment: ReelComment) => {
    if (!currentUserId || comment.authorUserId !== currentUserId) {
      alert("You can only edit your own comments.");
      return;
    }

    setCommentMenu(null);
    setReplyingToCommentId(null);
    setReplyDraft("");
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.text);
  };

  const handleCancelEditComment = () => {
    setEditingCommentId(null);
    setEditingCommentText("");
    setSavingCommentId(null);
  };

  const handleSaveEditComment = async (comment: ReelComment) => {
    const trimmed = editingCommentText.trim();

    if (!currentUserId || comment.authorUserId !== currentUserId) {
      alert("You can only edit your own comments.");
      return;
    }

    if (!trimmed) {
      alert("Comment cannot be empty.");
      return;
    }

    if (trimmed === comment.text.trim()) {
      handleCancelEditComment();
      return;
    }

    setSavingCommentId(comment.id);

    const previousComments = comments;
    setComments((prev) =>
      prev.map((item) =>
        item.id === comment.id ? { ...item, text: trimmed, time: "Just now" } : item
      )
    );

    const { error } = await supabase
      .from("reel_comments")
      .update({ content: trimmed })
      .eq("id", comment.id)
      .eq("user_id", currentUserId);

    if (error) {
      setComments(previousComments);
      setSavingCommentId(null);
      alert(error.message || "Could not edit comment.");
      await fetchReels();
      return;
    }

    setEditingCommentId(null);
    setEditingCommentText("");
    setSavingCommentId(null);
    setCommentMenu(null);
  };

  const handleCommentLikeToggle = async (commentId: string, forceLike = false) => {
    if (!currentUserId) {
      alert("You must be logged in to like comments.");
      return;
    }

    const currentLiked = !!commentLikedMap[commentId];

    if (forceLike && currentLiked) {
      setCommentLikeBurstId(commentId);
      if (commentLikeBurstTimeoutRef.current) {
        window.clearTimeout(commentLikeBurstTimeoutRef.current);
      }
      commentLikeBurstTimeoutRef.current = window.setTimeout(() => {
        setCommentLikeBurstId(null);
      }, 520);
      return;
    }

    const nextLiked = forceLike ? true : !currentLiked;

    setCommentLikedMap((prev) => ({
      ...prev,
      [commentId]: nextLiked,
    }));

    setCommentLikeMap((prev) => ({
      ...prev,
      [commentId]: Math.max((prev[commentId] || 0) + (nextLiked ? 1 : -1), 0),
    }));

    if (nextLiked) {
      setCommentLikeBurstId(commentId);
      if (commentLikeBurstTimeoutRef.current) {
        window.clearTimeout(commentLikeBurstTimeoutRef.current);
      }
      commentLikeBurstTimeoutRef.current = window.setTimeout(() => {
        setCommentLikeBurstId(null);
      }, 520);

      const { error } = await supabase.from("reel_comment_likes").insert([
        {
          comment_id: commentId,
          user_id: currentUserId,
        },
      ]);

      if (error && !error.message.toLowerCase().includes("duplicate")) {
        console.error("Reel comment like insert error:", error.message);
        alert(error.message || "Could not like comment.");
        await fetchReels();
      }

      return;
    }

    const { error } = await supabase
      .from("reel_comment_likes")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", currentUserId);

    if (error) {
      console.error("Reel comment like delete error:", error.message);
      alert(error.message || "Could not remove comment like.");
      await fetchReels();
    }
  };

  const handleStartCommentReply = (comment: ReelComment) => {
    setReplyingToCommentId(comment.id);
    setReplyDraft(`@${comment.author.replace(/^@+/, "")} `);
  };

  const handleCancelCommentReply = () => {
    setReplyingToCommentId(null);
    setReplyDraft("");
  };

  const handleSubmitCommentReply = async (parentComment: ReelComment) => {
    const trimmed = replyDraft.trim();
    if (!trimmed || !activeReel) return;

    if (!currentUserId) {
      alert("You must be logged in to reply to comments.");
      return;
    }

    const optimisticReplyId = `reply-${Date.now()}`;

    const nextReply: ReelComment = {
      id: optimisticReplyId,
      reelId: activeReel.id,
      authorUserId: currentUserId,
      author: "@you",
      text: trimmed,
      time: "Just now",
      parentCommentId: parentComment.id,
      replyToAuthor: parentComment.author,
    };

    setComments((prev) => {
      const parentIndex = prev.findIndex((comment) => comment.id === parentComment.id);
      if (parentIndex === -1) return [nextReply, ...prev];

      const next = [...prev];
      next.splice(parentIndex + 1, 0, nextReply);
      return next;
    });
    setReels((prev) =>
      prev.map((reel) =>
        reel.id === activeReel.id ? { ...reel, comments: reel.comments + 1 } : reel
      )
    );
    setReplyingToCommentId(null);
    setReplyDraft("");

    const { data: insertedReply, error: commentInsertError } = await supabase
      .from("reel_comments")
      .insert([
        {
          reel_id: activeReel.id,
          user_id: currentUserId,
          content: trimmed,
          parent_comment_id: parentComment.id,
          reply_to_author: parentComment.author,
        },
      ])
      .select("id")
      .single();

    if (commentInsertError) {
      console.error("Reel comment reply insert error:", commentInsertError.message);
      alert(commentInsertError.message || "Could not save reel reply.");
      await fetchReels();
      return;
    }

    if (insertedReply?.id) {
      setComments((prev) =>
        prev.map((comment) =>
          comment.id === optimisticReplyId ? { ...comment, id: insertedReply.id } : comment
        )
      );
    }

    const parentCommentAuthorId = parentComment.authorUserId;
    const activeReplyReelOwnerId = activeReel.creator_profile_id || activeReel.user_id;

    // Notify the member whose comment received the reply.
    if (parentCommentAuthorId && parentCommentAuthorId !== currentUserId) {
      await insertReelNotification({
        userId: parentCommentAuthorId,
        actorId: currentUserId,
        reelId: activeReel.id,
        type: "reel_reply",
        message: "replied to your comment on a Reel.",
        commentId: parentComment.id,
      });
    }

    // Also notify the Reel owner when they are a different person.
    // This avoids duplicate notifications when the owner wrote the parent comment.
    if (
      activeReplyReelOwnerId &&
      activeReplyReelOwnerId !== currentUserId &&
      activeReplyReelOwnerId !== parentCommentAuthorId
    ) {
      await insertReelNotification({
        userId: activeReplyReelOwnerId,
        actorId: currentUserId,
        reelId: activeReel.id,
        type: "reel_comment",
        message: "replied to a comment on your reel.",
        commentId: parentComment.id,
      });
    }
  };

  const handleHideComment = (commentId: string) => {
    setHiddenCommentMap((prev) => ({
      ...prev,
      [commentId]: true,
    }));
    setCommentMenu(null);
  };

  const handleDeleteLocalComment = async (commentId: string) => {
    if (!currentUserId) {
      alert("You must be logged in to delete comments.");
      return;
    }

    const comment = comments.find((item) => item.id === commentId);
    if (!comment) return;

    const reel = reels.find((item) => item.id === comment.reelId);
    const canDeleteComment =
      comment.authorUserId === currentUserId ||
      Boolean(
        reel &&
          currentUserId &&
          (reel.user_id === currentUserId ||
            reel.creator_profile_id === currentUserId)
      );

    if (!canDeleteComment) {
      alert("You can only delete your own comments.");
      return;
    }

    const confirmDelete = window.confirm("Delete this comment?");
    if (!confirmDelete) return;

    if (editingCommentId === commentId) {
      handleCancelEditComment();
    }

    const deletedCommentIds = comments
      .filter((item) => item.id === commentId || item.parentCommentId === commentId)
      .map((item) => item.id);

    const { error } = await supabase.from("reel_comments").delete().eq("id", commentId);

    if (error) {
      console.error("Reel comment delete error:", error.message);
      alert(error.message || "Could not delete comment.");
      await fetchReels();
      return;
    }

    setComments((prev) =>
      prev.filter((item) => item.id !== commentId && item.parentCommentId !== commentId)
    );

    setCommentLikeMap((prev) => {
      const next = { ...prev };
      deletedCommentIds.forEach((id) => delete next[id]);
      return next;
    });

    setCommentLikedMap((prev) => {
      const next = { ...prev };
      deletedCommentIds.forEach((id) => delete next[id]);
      return next;
    });

    setReels((prev) =>
      prev.map((item) =>
        item.id === comment.reelId
          ? { ...item, comments: Math.max(item.comments - deletedCommentIds.length, 0) }
          : item
      )
    );

    setCommentMenu(null);
  };

  const handleCopyCommentText = async (commentId: string) => {
    const comment = comments.find((item) => item.id === commentId);
    if (!comment) return;

    try {
      await navigator.clipboard.writeText(comment.text);
      setShareMessage("Comment copied.");
    } catch {
      setShareMessage("Could not copy comment.");
    }

    setCommentMenu(null);
    window.setTimeout(() => {
      setShareMessage("");
    }, 1800);
  };

  const handleReportComment = async (commentId: string) => {
    if (!currentUserId) {
      alert("You must be logged in to report comments.");
      return;
    }

    const comment = comments.find((item) => item.id === commentId);

    if (!comment) {
      setCommentMenu(null);
      return;
    }

    if (comment.authorUserId === currentUserId) {
      setCommentMenu(null);
      alert("You cannot report your own comment from here.");
      return;
    }

    const reason = window.prompt(
      "Report this Reel comment to Parapost moderation. Please add a short reason:",
      ""
    );

    const trimmedReason = (reason || "").trim();

    if (!trimmedReason) {
      setCommentMenu(null);
      return;
    }

    const { error } = await supabase.from("reports").insert({
      reporter_id: currentUserId,
      reported_user_id: comment.authorUserId || null,
      target_type: "comment",
      target_id: comment.id,
      reason: trimmedReason.slice(0, 160),
      details: trimmedReason.length > 160 ? trimmedReason : null,
      status: "open",
    });

    setCommentMenu(null);

    if (error) {
      alert(`Could not report this comment: ${error.message}`);
      return;
    }

    alert("Thanks. This Reel comment has been sent to Parapost moderation.");
  };

  const handleOpenCommentMenu = (
    event: ReactMouseEvent<HTMLElement>,
    commentId: string,
    isReply = false
  ) => {
    event.preventDefault();
    event.stopPropagation();

    setCommentMenu({
      commentId,
      isReply,
      x: clamp(event.clientX - 160, 12, window.innerWidth - 220),
      y: clamp(event.clientY + 8, 12, window.innerHeight - 170),
    });
  };

  const handleCommentTouchStart = (commentId: string, isReply = false) => {
    if (commentLongPressTimeoutRef.current) {
      window.clearTimeout(commentLongPressTimeoutRef.current);
    }

    commentLongPressTimeoutRef.current = window.setTimeout(() => {
      setCommentMenu({
        commentId,
        isReply,
        x: Math.max(12, Math.min(window.innerWidth - 220, window.innerWidth / 2 - 100)),
        y: Math.max(80, Math.min(window.innerHeight - 190, window.innerHeight / 2)),
      });
    }, 520);
  };

  const handleCommentTouchEnd = (commentId: string) => {
    if (commentLongPressTimeoutRef.current) {
      window.clearTimeout(commentLongPressTimeoutRef.current);
      commentLongPressTimeoutRef.current = null;
    }

    const now = Date.now();
    const lastTouch = commentTouchTimeRef.current[commentId] || 0;

    if (now - lastTouch < 320) {
      handleCommentLikeToggle(commentId, true);
      commentTouchTimeRef.current[commentId] = 0;
      return;
    }

    commentTouchTimeRef.current[commentId] = now;
  };

  const handleShareToFeed = async () => {
    if (!activeReel) return;

    if (!currentUserId) {
      alert("You must be logged in to share reels.");
      return;
    }

    const trimmedCaption = shareCaption.trim();

    setReels((prev) =>
      prev.map((reel) =>
        reel.id === activeReel.id
          ? {
              ...reel,
              shares: reel.shares + 1,
            }
          : reel
      )
    );

    setShareMessage("Sharing reel to your feed...");
    setShareOpen(false);

    const sharedAt = new Date().toISOString();

    const { error: shareInsertError } = await supabase.from("reel_shares").insert([
      {
        reel_id: activeReel.id,
        user_id: currentUserId,
        caption: trimmedCaption || null,
        created_at: sharedAt,
      },
    ]);

    if (shareInsertError) {
      console.error("Reel share insert error:", shareInsertError.message);
      alert(shareInsertError.message || "Could not share reel to your feed.");
      await fetchReels();
      return;
    }

    const { error: reelUpdateError } = await supabase
      .from("reels")
      .update({
        shares: activeReel.shares + 1,
      })
      .eq("id", activeReel.id);

    if (reelUpdateError) {
      console.warn("Reel share count update skipped:", reelUpdateError.message);
    }

    const activeReelOwnerId = activeReel.creator_profile_id || activeReel.user_id;

    if (activeReelOwnerId && activeReelOwnerId !== currentUserId) {
      await insertReelNotification({
        userId: activeReelOwnerId,
        actorId: currentUserId,
        reelId: activeReel.id,
        type: "reel_share",
        message: "shared your reel.",
      });
    }

    setShareMessage("Shared to your feed.");
    setShareCaption("");

    window.setTimeout(() => {
      setShareMessage("");
    }, 2600);
  };

  const handleReportReel = async (reel: ReelItem) => {
    if (!currentUserId) {
      alert("You must be logged in to report Reels.");
      return;
    }

    if (isReelOwner(reel, currentUserId)) {
      alert("You cannot report your own Reel from here.");
      return;
    }

    const reason = window.prompt(
      "Report this Reel to Parapost moderation. Please add a short reason:",
      ""
    );

    const trimmedReason = (reason || "").trim();

    if (!trimmedReason) {
      setReelMenu(null);
      return;
    }

    const reportedUserId = reel.creator_profile_id || reel.user_id || null;

    const { error } = await supabase.from("reports").insert({
      reporter_id: currentUserId,
      reported_user_id: reportedUserId,
      target_type: "reel",
      target_id: reel.id,
      reason: trimmedReason.slice(0, 160),
      details: trimmedReason.length > 160 ? trimmedReason : null,
      status: "open",
    });

    setReelMenu(null);

    if (error) {
      alert(`Could not report this Reel: ${error.message}`);
      return;
    }

    alert("Thanks. This Reel has been sent to Parapost moderation.");
  };

  const openOwnerReelMenuAtPoint = (clientX: number, clientY: number, reel: ReelItem) => {
    if (!currentUserId) {
      setReelMenu(null);
      return;
    }

    const menuWidth = 208;
    const menuHeight = 124;
    const isMobileMenu = window.innerWidth <= 767;

    const x = isMobileMenu
      ? clamp(window.innerWidth / 2 - menuWidth / 2, 12, window.innerWidth - menuWidth - 12)
      : clamp(clientX - menuWidth + 42, 12, window.innerWidth - menuWidth - 12);

    const y = isMobileMenu
      ? clamp(window.innerHeight - menuHeight - 88, 70, window.innerHeight - menuHeight - 12)
      : clamp(clientY + 10, 12, window.innerHeight - menuHeight - 12);

    setReelMenu({
      reelId: reel.id,
      x,
      y,
    });
  };

  const openOwnerReelMenuFromAction = (reel: ReelItem) => {
    if (!currentUserId) {
      setReelMenu(null);
      return;
    }

    setActiveReelId(reel.id);

    if (typeof window === "undefined") {
      setReelMenu({ reelId: reel.id, x: 12, y: 80 });
      return;
    }

    const menuWidth = 208;
    const menuHeight = 124;

    setReelMenu({
      reelId: reel.id,
      x: clamp(window.innerWidth / 2 - menuWidth / 2, 12, window.innerWidth - menuWidth - 12),
      y: clamp(window.innerHeight - menuHeight - 88, 70, window.innerHeight - menuHeight - 12),
    });
  };

  const handleOpenReelMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    reel: ReelItem
  ) => {
    event.preventDefault();
    event.stopPropagation();

    // Mobile uses pointer-down so the video/tap layer and delayed click event
    // cannot swallow or immediately close the owner menu.
    if (viewportType === "mobile") {
      return;
    }

    openOwnerReelMenuAtPoint(event.clientX, event.clientY, reel);
  };

  const handleOpenReelMenuPointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
    reel: ReelItem
  ) => {
    if (viewportType !== "mobile") {
      event.stopPropagation();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openOwnerReelMenuAtPoint(
      event.clientX || window.innerWidth - 44,
      event.clientY || 44,
      reel
    );
  };

  const handleStartEditReel = (reel: ReelItem) => {
    setEditingReelId(reel.id);
    setEditTitle(reel.title);
    setEditCaption(reel.caption);
    setEditOpen(true);
    setReelMenu(null);
  };

  const handleSaveReelEdit = async () => {
    if (!editingReelId) return;

    if (!currentUserId) {
      alert("You must be logged in to edit reels.");
      return;
    }

    const nextTitle = editTitle.trim();
    const nextCaption = editCaption.trim();

    const { error } = await supabase
      .from("reels")
      .update({
        title: nextTitle,
        caption: nextCaption,
      })
      .eq("id", editingReelId)
      .or(`user_id.eq.${currentUserId},creator_profile_id.eq.${currentUserId}`);

    if (error) {
      alert(error.message || "Could not save reel changes.");
      return;
    }

    setReels((prev) =>
      prev.map((reel) =>
        reel.id === editingReelId
          ? {
              ...reel,
              title: nextTitle || reel.title,
              caption: nextCaption,
            }
          : reel
      )
    );

    setEditOpen(false);
    setEditingReelId(null);
    setEditTitle("");
    setEditCaption("");
  };

  const handleDeleteReel = async (reelId: string) => {
    if (!currentUserId) {
      alert("You must be logged in to delete reels.");
      return;
    }

    const confirmDelete = window.confirm("Delete this reel?");
    if (!confirmDelete) return;

    const { error } = await supabase
      .from("reels")
      .delete()
      .eq("id", reelId)
      .or(`user_id.eq.${currentUserId},creator_profile_id.eq.${currentUserId}`);

    if (error) {
      alert(error.message || "Could not delete reel.");
      return;
    }

    const nextReels = reels.filter((reel) => reel.id !== reelId);
    setReels(nextReels);
    setComments((prev) => prev.filter((comment) => comment.reelId !== reelId));
    setProgressMap((prev) => {
      const next = { ...prev };
      delete next[reelId];
      return next;
    });
    setVideoFitMap((prev) => {
      const next = { ...prev };
      delete next[reelId];
      return next;
    });

    if (activeReelId === reelId) {
      setActiveReelId(nextReels[0]?.id || "");
    }

    setReelMenu(null);
  };

  const handleVideoLoadedMetadata = (
    reelId: string,
    event: ReactSyntheticEvent<HTMLVideoElement>
  ) => {
    const video = event.currentTarget;
    const nextFit = video.videoWidth > video.videoHeight ? "contain" : "cover";

    setVideoFitMap((prev) => {
      if (prev[reelId] === nextFit) return prev;
      return {
        ...prev,
        [reelId]: nextFit,
      };
    });
  };

  const openDetailsForReel = (reelId: string) => {
    setActiveReelId(reelId);
    setDetailsReelId(reelId);
    videoRefs.current[reelId]?.pause();
  };

  const closeDetails = () => {
    const resumeReelId = detailsReelId;
    setDetailsReelId("");

    window.setTimeout(() => {
      if (!commentsOpen && resumeReelId === activeReelId) {
        const playPromise = videoRefs.current[resumeReelId]?.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
      }
    }, 80);
  };

  return (
    <div style={pageStyle}>
      <div style={topBarStyle}>
        <div
          style={{
            ...topBarInnerStyle,
            ...(viewportType === "mobile"
              ? {
                  gap: "8px",
                  flexWrap: "nowrap",
                  alignItems: "flex-start",
                }
              : viewportType === "tablet"
                ? {
                    width: "min(760px, calc(100vw - 32px))",
                    margin: "0 auto",
                    gap: "10px",
                    flexDirection: "column",
                    flexWrap: "nowrap",
                    alignItems: "stretch",
                    justifyContent: "flex-start",
                    paddingInline: "4px",
                  }
                : {}),
          }}
        >
          <div
            style={{
              paddingTop: `${stageMetrics.topHeaderPad}px`,
              ...(viewportType === "tablet"
                ? {
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    minHeight: "34px",
                  }
                : {}),
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: viewportType === "mobile" ? "18px" : viewportType === "tablet" ? "23px" : "26px",
                lineHeight: 1.05,
                textShadow: "0 2px 12px rgba(0,0,0,0.45)",
                whiteSpace: "nowrap",
              }}
            >
              Parapost Reels
            </h1>
          </div>

          <div
            style={{
              display: "flex",
              gap: viewportType === "mobile" ? "6px" : viewportType === "tablet" ? "8px" : "10px",
              flexWrap: "nowrap",
              paddingTop: viewportType === "tablet" ? 0 : `${stageMetrics.topHeaderPad}px`,
              justifyContent: viewportType === "tablet" ? "flex-start" : "flex-end",
              alignItems: "center",
              width: viewportType === "tablet" ? "100%" : undefined,
              minWidth: 0,
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => {
                setReelMenu(null);
                setCommentMenu(null);
                setShareOpen(false);
                setDetailsReelId("");
                setIsUploadModalOpen(true);
              }}
              style={
                viewportType === "mobile"
                  ? { ...buttonStyle, padding: "8px 10px", fontSize: "12px", minHeight: "36px" }
                  : viewportType === "tablet"
                    ? { ...buttonStyle, padding: "9px 13px", fontSize: "13px", minHeight: "40px", whiteSpace: "nowrap" }
                    : buttonStyle
              }
            >
              {viewportType === "mobile" ? "+ Reel" : "+ Create Reel"}
            </button>

            <button
              onClick={() => setMuteAll((prev) => !prev)}
              style={
                viewportType === "mobile"
                  ? { ...buttonStyle, padding: "8px 10px", fontSize: "12px", minHeight: "36px" }
                  : viewportType === "tablet"
                    ? { ...buttonStyle, padding: "9px 13px", fontSize: "13px", minHeight: "40px", whiteSpace: "nowrap" }
                    : buttonStyle
              }
            >
              {muteAll ? "Unmute" : "Mute"}
            </button>

            <Link
              href="/dashboard"
              onClick={prepareReelsRouteExit}
              style={
                viewportType === "mobile"
                  ? { ...navLinkStyle, padding: "8px 10px", fontSize: "12px", minHeight: "36px" }
                  : viewportType === "tablet"
                    ? { ...navLinkStyle, padding: "9px 13px", fontSize: "13px", minHeight: "40px", whiteSpace: "nowrap" }
                    : navLinkStyle
              }
            >
              {viewportType === "mobile" ? "Dashboard" : "Back to Dashboard"}
            </Link>
          </div>
        </div>
      </div>

      {stageMetrics.showDesktopArrows && reels.length > 1 && (
        <div
          style={{
            position: "fixed",
            right: "32px",
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            zIndex: 50,
          }}
        >
          <button
            onClick={() => scrollToAdjacentReel("prev")}
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)",
              color: "white",
              cursor: commentsOpen || detailsOpen ? "not-allowed" : "pointer",
              fontSize: "22px",
              backdropFilter: "blur(12px)",
              opacity: commentsOpen || detailsOpen ? 0.45 : 1,
            }}
            aria-label="Previous reel"
            disabled={commentsOpen || detailsOpen}
          >
            ↑
          </button>

          <button
            onClick={() => scrollToAdjacentReel("next")}
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)",
              color: "white",
              cursor: commentsOpen || detailsOpen ? "not-allowed" : "pointer",
              fontSize: "22px",
              backdropFilter: "blur(12px)",
              opacity: commentsOpen || detailsOpen ? 0.45 : 1,
            }}
            aria-label="Next reel"
            disabled={commentsOpen || detailsOpen}
          >
            ↓
          </button>
        </div>
      )}

      {isFetchingReels ? (
        <div
          style={{
            minHeight: "100dvh",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "28px", fontWeight: 900, marginBottom: "10px" }}>
              Loading reels...
            </div>
            <div style={{ color: "#9ca3af", fontSize: "15px" }}>
              Pulling your latest reel uploads from the database.
            </div>
          </div>
        </div>
      ) : reels.length === 0 ? (
        <div
          style={{
            minHeight: "100dvh",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              maxWidth: "520px",
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              borderRadius: "28px",
              padding: "28px",
            }}
          >
            <div style={{ fontSize: "32px", fontWeight: 900, marginBottom: "10px" }}>
              No reels yet
            </div>
            <div
              style={{
                color: "#d1d5db",
                lineHeight: 1.7,
                fontSize: "15px",
                marginBottom: "18px",
              }}
            >
              Your reels page is now connected to Supabase. Upload the first reel to populate the feed.
            </div>
            <button
              onClick={() => setIsUploadModalOpen(true)}
              style={primaryButtonStyle}
            >
              Create First Reel
            </button>
          </div>
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          style={scrollContainerStyle}
          onScroll={updateActiveFromScroll}
        >
          {reels.map((reel) => {
            const isLiked = !!likedMap[reel.id];
            const isOwner = isReelOwner(reel, currentUserId);
            const relationship = relationshipMap[reel.creator_profile_id] || (isOwner ? "you" : "profile");
            const displayedLikes = reel.likes;
            const displayedComments = comments.filter(
              (comment) => comment.reelId === reel.id
            ).length;
            const displayedShares = reel.shares;
            const progress = progressMap[reel.id] || 0;
            const shouldShowSeeMore =
              reel.caption.length > (viewportType === "desktop" ? 160 : 110) ||
              reel.caption.includes("\n");

            const isActiveCommentsReel = commentsOpen && activeReelId === reel.id;
            const isActiveDetailsReel = detailsReelId === reel.id;
            const isOverlayedReel = isActiveCommentsReel || isActiveDetailsReel;
            const creatorProfileId = reel.creator_profile_id || reel.user_id;
            const creatorProfileHref = creatorProfileId ? `/profile/${creatorProfileId}` : "/reels";
            const reelActions = [
              {
                symbol: isLiked ? "♥" : "♡",
                label: formatActionCount(displayedLikes),
                ariaLabel: isLiked ? "Unlike reel" : "Like reel",
                action: () => handleLikeToggle(reel.id),
              },
              {
                symbol: "💬",
                label: formatActionCount(displayedComments),
                ariaLabel: "Open reel comments",
                action: () => {
                  setActiveReelId(reel.id);
                  videoRefs.current[reel.id]?.pause();
                  setCommentsOpen(true);
                },
              },
              {
                symbol: "↗",
                label: formatActionCount(displayedShares),
                ariaLabel: "Share reel to feed",
                action: () => {
                  setActiveReelId(reel.id);
                  videoRefs.current[reel.id]?.pause();
                  setShareOpen(true);
                },
              },
              {
                symbol: "🔗",
                label: "Link",
                ariaLabel: "Copy reel link",
                action: () => {
                  setActiveReelId(reel.id);
                  void handleShareLink(reel.id);
                },
              },
              ...(currentUserId && viewportType === "mobile"
                ? [
                    {
                      symbol: "⋯",
                      label: isOwner ? "Manage" : "Report",
                      ariaLabel: isOwner ? "Manage your Reel" : "Report this Reel",
                      action: () => openOwnerReelMenuFromAction(reel),
                    },
                  ]
                : []),
            ];

            return (
              <section
                key={reel.id}
                data-reel-id={reel.id}
                id={reel.id}
                style={{
                  ...sectionStyle,
                  padding:
                    viewportType === "tablet"
                      ? `126px ${stageMetrics.outerPadding}px ${stageMetrics.outerPadding}px`
                      : `${stageMetrics.topOffset}px ${stageMetrics.outerPadding}px ${stageMetrics.outerPadding}px`,
                  boxSizing: "border-box",
                }}
              >
                <ReelCard
                  width={stageMetrics.stageWidth}
                  height={stageMetrics.stageHeight}
                  borderRadius={stageMetrics.borderRadius}
                  isDimmed={isOverlayedReel}
                  isMobile={viewportType === "mobile"}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: "3px",
                      background: "rgba(255,255,255,0.12)",
                      zIndex: 6,
                    }}
                  >
                    <div
                      style={{
                        width: `${progress}%`,
                        height: "100%",
                        background: "white",
                        transition: "width 120ms linear",
                      }}
                    />
                  </div>

                  <div
                    onDoubleClick={() => handleDoubleTapLike(reel.id)}
                    onClick={() => handleTogglePlayPause(reel.id)}
                    style={{
                      position: "absolute",
                      inset: 0,
                      cursor: commentsOpen || detailsOpen ? "default" : "pointer",
                    }}
                  >
                    <video
                      ref={(el) => {
                        videoRefs.current[reel.id] = el;
                      }}
                      src={reel.video}
                      poster={reel.poster || undefined}
                      muted
                      playsInline
                      loop
                      preload="metadata"
                      onLoadedMetadata={(event) => handleVideoLoadedMetadata(reel.id, event)}
                      onTimeUpdate={(event) => {
                        const video = event.currentTarget;
                        const percent = video.duration
                          ? (video.currentTime / video.duration) * 100
                          : 0;

                        setProgressMap((prev) => ({
                          ...prev,
                          [reel.id]: percent,
                        }));
                      }}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: videoFitMap[reel.id] || "cover",
                        objectPosition: "center",
                        background: "#000",
                        filter: "contrast(1.04) saturate(1.07)",
                      }}
                    />

                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background:
                          "linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.08) 24%, rgba(0,0,0,0.22) 58%, rgba(0,0,0,0.86) 100%)",
                        pointerEvents: "none",
                      }}
                    />

                    {heartBurstId === reel.id && (
                      <div
                        style={{
                          position: "absolute",
                          top: "50%",
                          left: "50%",
                          transform: "translate(-50%, -50%)",
                          fontSize: viewportType === "mobile" ? "64px" : "80px",
                          color: "white",
                          opacity: 0.95,
                          pointerEvents: "none",
                          zIndex: 8,
                          textShadow: "0 8px 26px rgba(0,0,0,0.45)",
                        }}
                      >
                        ♥
                      </div>
                    )}

                    {playPauseFeedback?.reelId === reel.id && (
                      <div
                        key={`${playPauseFeedback.reelId}-${playPauseFeedback.mode}-${playPauseFeedback.nonce}`}
                        style={{
                          position: "absolute",
                          top: "50%",
                          left: "50%",
                          transform: "translate(-50%, -50%) scale(0.92)",
                          width: viewportType === "mobile" ? "64px" : "76px",
                          height: viewportType === "mobile" ? "64px" : "76px",
                          borderRadius: "50%",
                          background: "rgba(0,0,0,0.34)",
                          border: "1px solid rgba(255,255,255,0.14)",
                          color: "white",
                          display: "grid",
                          placeItems: "center",
                          fontSize: viewportType === "mobile" ? "30px" : "36px",
                          lineHeight: 1,
                          opacity: 0,
                          pointerEvents: "none",
                          zIndex: 9,
                          boxShadow: "0 14px 34px rgba(0,0,0,0.30)",
                          backdropFilter: "blur(9px)",
                          animation: "parapostPlayPausePop 420ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
                          willChange: "transform, opacity",
                        }}
                      >
                        {playPauseFeedback.mode === "play" ? (
                          <span style={{ display: "block", transform: "translateX(2px)" }}>▶</span>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "5px",
                            }}
                          >
                            <span
                              style={{
                                width: viewportType === "mobile" ? "5px" : "6px",
                                height: viewportType === "mobile" ? "22px" : "26px",
                                borderRadius: "999px",
                                background: "currentColor",
                                display: "block",
                              }}
                            />
                            <span
                              style={{
                                width: viewportType === "mobile" ? "5px" : "6px",
                                height: viewportType === "mobile" ? "22px" : "26px",
                                borderRadius: "999px",
                                background: "currentColor",
                                display: "block",
                              }}
                            />
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {currentUserId && viewportType !== "mobile" ? (
                    <div
                      style={{
                        position: "absolute",
                        top: "12px",
                        right: "14px",
                        zIndex: 24,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        pointerEvents: "auto",
                      }}
                    >
                      <button
                        type="button"
                        onClick={(event) => handleOpenReelMenu(event, reel)}
                        onPointerDown={(event) => handleOpenReelMenuPointer(event, reel)}
                        onTouchStart={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        style={{
                          width: "42px",
                          height: "42px",
                          borderRadius: "50%",
                          border: "1px solid rgba(255,255,255,0.14)",
                          background: "rgba(0,0,0,0.42)",
                          color: "white",
                          cursor: "pointer",
                          fontSize: "20px",
                          touchAction: "manipulation",
                          WebkitTapHighlightColor: "transparent",
                          boxShadow: "0 10px 24px rgba(0,0,0,0.24)",
                        }}
                        aria-label={isOwner ? "Open Reel owner menu" : "Open Reel options"}
                      >
                        ⋯
                      </button>
                    </div>
                  ) : null}

                  <div
                    style={{
                      position: "absolute",
                      right: `${stageMetrics.actionRight}px`,
                      bottom: `${stageMetrics.bottomOffset}px`,
                      zIndex: 7,
                      display: "flex",
                      flexDirection: "column",
                      gap: `${stageMetrics.actionGap}px`,
                      alignItems: "center",
                      opacity: isOverlayedReel ? 0.12 : 1,
                      pointerEvents: isOverlayedReel ? "none" : "auto",
                      transition: "opacity 180ms ease",
                    }}
                  >
                    {reelActions.map((item, actionIndex) => (
                      <div
                        key={`${reel.id}-${actionIndex}`}
                        style={{
                          display: "grid",
                          justifyItems: "center",
                          gap: "5px",
                        }}
                      >
                        <button
                          type="button"
                          aria-label={item.ariaLabel}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                          }}
                          onTouchStart={(event) => {
                            event.stopPropagation();
                          }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            item.action();
                          }}
                          style={{
                            width: `${stageMetrics.actionButtonSize}px`,
                            height: `${stageMetrics.actionButtonSize}px`,
                            borderRadius: "50%",
                            border: "1px solid rgba(255,255,255,0.16)",
                            background: "rgba(0,0,0,0.34)",
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            fontSize: `${stageMetrics.actionSymbolSize}px`,
                            backdropFilter: "blur(12px)",
                            boxShadow: "0 8px 18px rgba(0,0,0,0.38)",
                          }}
                        >
                          {item.symbol}
                        </button>

                        <div
                          style={{
                            fontSize: `${stageMetrics.actionLabelSize}px`,
                            fontWeight: 700,
                            color: "#f3f4f6",
                            textAlign: "center",
                            maxWidth: `${stageMetrics.actionLabelMaxWidth}px`,
                            lineHeight: 1.1,
                            textShadow: "0 2px 10px rgba(0,0,0,0.45)",
                          }}
                        >
                          {item.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      position: "absolute",
                      left: `${stageMetrics.textLeft}px`,
                      right: `${stageMetrics.textRight}px`,
                      bottom: `${stageMetrics.bottomOffset}px`,
                      zIndex: 7,
                      display: "grid",
                      gap: "8px",
                      opacity: isOverlayedReel ? 0.1 : 1,
                      pointerEvents: isOverlayedReel ? "none" : "auto",
                      transition: "opacity 180ms ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        flexWrap: "wrap",
                      }}
                    >
                      <Link
                        href={creatorProfileHref}
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                        style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "50%",
                          background: "rgba(255,255,255,0.14)",
                          border: "1px solid rgba(255,255,255,0.18)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                          fontWeight: 800,
                          fontSize: "15px",
                          backdropFilter: "blur(12px)",
                          color: "#ffffff",
                          textDecoration: "none",
                          flexShrink: 0,
                        }}
                        aria-label={`Open ${reel.creatorName}'s profile`}
                      >
                        {reel.creatorAvatarUrl ? (
                          <img
                            src={reel.creatorAvatarUrl}
                            alt={reel.creatorName}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          reel.creatorName.charAt(0)
                        )}
                      </Link>

                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            minWidth: 0,
                            flexWrap: "wrap",
                          }}
                        >
                          <Link
                            href={creatorProfileHref}
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                            style={{
                              fontWeight: 800,
                              fontSize: "15px",
                              lineHeight: 1.15,
                              textShadow: "0 2px 10px rgba(0,0,0,0.42)",
                              color: "#ffffff",
                              textDecoration: "none",
                              minWidth: 0,
                            }}
                          >
                            {reel.creatorName}
                          </Link>

                          <Link
                            href={creatorProfileHref}
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              minHeight: "22px",
                              borderRadius: "999px",
                              border: "1px solid rgba(255,255,255,0.18)",
                              padding: "3px 8px",
                              fontSize: "11px",
                              fontWeight: 850,
                              lineHeight: 1,
                              textDecoration: "none",
                              backdropFilter: "blur(12px)",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.20)",
                              ...getRelationshipBadgeStyle(relationship),
                            }}
                          >
                            {getRelationshipLabel(relationship)}
                          </Link>
                        </div>

                        <Link
                          href={creatorProfileHref}
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                          style={{
                            fontSize: "13px",
                            color: "#e5e7eb",
                            textShadow: "0 2px 10px rgba(0,0,0,0.42)",
                            textDecoration: "none",
                            display: "inline-flex",
                            maxWidth: "100%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {reel.creator}
                        </Link>
                      </div>
                    </div>

                    <div
                      style={{
                        fontWeight: 900,
                        fontSize: `${stageMetrics.titleSize}px`,
                        lineHeight: 1.06,
                        textShadow: "0 3px 12px rgba(0,0,0,0.48)",
                      }}
                    >
                      {reel.title}
                    </div>

                    {reel.caption ? (
                      <div
                        style={{
                          display: "grid",
                          gap: "5px",
                          maxWidth: "100%",
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            color: "#f3f4f6",
                            lineHeight: 1.45,
                            maxWidth: "100%",
                            fontSize: `${stageMetrics.captionSize}px`,
                            textShadow: "0 2px 10px rgba(0,0,0,0.45)",
                            whiteSpace: "pre-wrap",
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: stageMetrics.captionLines,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {reel.caption}
                        </p>

                        {shouldShowSeeMore && (
                          <button
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              openDetailsForReel(reel.id);
                            }}
                            style={{
                              width: "fit-content",
                              background: "rgba(255,255,255,0.10)",
                              border: "1px solid rgba(255,255,255,0.16)",
                              color: "white",
                              borderRadius: "999px",
                              fontWeight: 850,
                              cursor: "pointer",
                              padding: "6px 10px",
                              fontSize: "12px",
                              backdropFilter: "blur(10px)",
                              textShadow: "0 2px 10px rgba(0,0,0,0.45)",
                            }}
                          >
                            See more
                          </button>
                        )}
                      </div>
                    ) : null}

                    {shareMessage && activeReel?.id === reel.id ? (
                      <div
                        style={{
                          display: "inline-flex",
                          width: "fit-content",
                          borderRadius: "999px",
                          background: "rgba(255,255,255,0.12)",
                          border: "1px solid rgba(255,255,255,0.18)",
                          padding: "8px 12px",
                          fontSize: "13px",
                          backdropFilter: "blur(12px)",
                        }}
                      >
                        {shareMessage}
                      </div>
                    ) : null}
                  </div>

                  {isActiveCommentsReel && (
                    <ReelCommentsPanel
                      isOpen={commentsOpen}
                      onClose={handleCloseComments}
                      reelTitle={reel.title}
                      activeComments={activeComments}
                      allComments={comments}
                      activeReelId={activeReelId}
                      currentUserId={currentUserId}
                      activeReelOwnerId={activeReel?.creator_profile_id || activeReel?.user_id || ""}
                      commentDraft={commentDraft}
                      setCommentDraft={setCommentDraft}
                      commentInputRef={commentInputRef}
                      onCommentInputKeyDown={handleCommentInputKeyDown}
                      onAddComment={handleAddComment}
                      viewportType={viewportType}
                      commentLikedMap={commentLikedMap}
                      commentLikeMap={commentLikeMap}
                      commentLikeBurstId={commentLikeBurstId}
                      replyingToCommentId={replyingToCommentId}
                      replyDraft={replyDraft}
                      setReplyDraft={setReplyDraft}
                      onCommentLikeToggle={handleCommentLikeToggle}
                      onStartCommentReply={handleStartCommentReply}
                      onCancelCommentReply={handleCancelCommentReply}
                      onSubmitCommentReply={handleSubmitCommentReply}
                      onHideComment={handleHideComment}
                      onOpenCommentMenu={handleOpenCommentMenu}
                      onCommentTouchStart={handleCommentTouchStart}
                      onCommentTouchEnd={handleCommentTouchEnd}
                      commentMenu={commentMenu}
                      setCommentMenu={setCommentMenu}
                      onCopyCommentText={handleCopyCommentText}
                      onReportComment={handleReportComment}
                      onDeleteLocalComment={handleDeleteLocalComment}
                      editingCommentId={editingCommentId}
                      editingCommentText={editingCommentText}
                      savingCommentId={savingCommentId}
                      setEditingCommentText={setEditingCommentText}
                      onStartEditComment={handleStartEditComment}
                      onSaveEditComment={handleSaveEditComment}
                      onCancelEditComment={handleCancelEditComment}
                    />
                  )}
                </ReelCard>
              </section>
            );
          })}
        </div>
      )}

      {reelMenu && (() => {
        const menuReel = reels.find((item) => item.id === reelMenu.reelId);

        if (!menuReel || !currentUserId) {
          return null;
        }

        const menuReelIsOwner = isReelOwner(menuReel, currentUserId);

        const menuBody = menuReelIsOwner ? (
          <>
            <button
              type="button"
              style={{
                ...menuItemStyle,
                minHeight: viewportType === "mobile" ? 56 : undefined,
                fontWeight: 850,
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onTouchStart={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleStartEditReel(menuReel);
              }}
            >
              Edit Reel
            </button>
            <button
              type="button"
              style={{
                ...menuItemStyle,
                color: "#fecaca",
                borderBottom: "none",
                minHeight: viewportType === "mobile" ? 56 : undefined,
                fontWeight: 850,
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onTouchStart={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void handleDeleteReel(menuReel.id);
              }}
            >
              Delete Reel
            </button>
          </>
        ) : (
          <button
            type="button"
            style={{
              ...menuItemStyle,
              color: "#fecaca",
              borderBottom: "none",
              minHeight: viewportType === "mobile" ? 56 : undefined,
              fontWeight: 850,
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onTouchStart={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void handleReportReel(menuReel);
            }}
          >
            Report Reel
          </button>
        );

        if (viewportType === "mobile") {
          return (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                background: "rgba(0,0,0,0.46)",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                padding: "0 12px calc(18px + env(safe-area-inset-bottom))",
                pointerEvents: "auto",
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setReelMenu(null);
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onTouchMove={(event) => event.stopPropagation()}
            >
              <div
                style={{
                  width: "min(420px, 100%)",
                  background:
                    "linear-gradient(180deg, rgba(15,23,42,0.99), rgba(7,9,13,0.99))",
                  border: "1px solid rgba(168,85,247,0.30)",
                  borderRadius: "22px",
                  overflow: "hidden",
                  boxShadow: "0 22px 48px rgba(0,0,0,0.42)",
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onTouchStart={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <div
                  style={{
                    padding: "14px 14px 10px",
                    borderBottom: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div style={{ color: "#fff", fontWeight: 950, fontSize: 15 }}>Reel options</div>
                  <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 3 }}>
                    {menuReelIsOwner
                      ? "Only you can edit or delete this Reel."
                      : "Report this Reel to Parapost moderation."}
                  </div>
                </div>
                {menuBody}
                <button
                  type="button"
                  style={{
                    ...menuItemStyle,
                    borderBottom: "none",
                    color: "#d1d5db",
                    minHeight: 52,
                    textAlign: "center",
                    fontWeight: 850,
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onTouchStart={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setReelMenu(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          );
        }

        return (
          <div
            style={{
              position: "fixed",
              top: reelMenu.y,
              left: reelMenu.x,
              zIndex: 9999,
              minWidth: "200px",
              pointerEvents: "auto",
              background:
                "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(7,9,13,0.98))",
              border: "1px solid rgba(168,85,247,0.28)",
              borderRadius: "18px",
              overflow: "hidden",
              boxShadow: "0 18px 34px rgba(0,0,0,0.34)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {menuBody}
          </div>
        );
      })()}


      {detailsOpen && detailsReel && (
        <>
          <div style={overlayStyle} onClick={closeDetails} />
          <div
            style={{
              position: "fixed",
              zIndex: 94,
              ...(viewportType === "desktop"
                ? {
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: "min(460px, 100%)",
                    borderLeft: "1px solid rgba(255,255,255,0.11)",
                    borderRadius: 0,
                  }
                : {
                    left: 0,
                    right: 0,
                    bottom: 0,
                    maxHeight: viewportType === "tablet" ? "76dvh" : "82dvh",
                    borderTop: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "28px 28px 0 0",
                  }),
              background: "linear-gradient(180deg, rgba(11,16,32,0.98), rgba(7,9,13,0.98))",
              color: "white",
              boxShadow:
                viewportType === "desktop"
                  ? "-18px 0 44px rgba(0,0,0,0.48)"
                  : "0 -18px 44px rgba(0,0,0,0.48)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: viewportType === "desktop" ? "22px 22px 16px" : "16px 18px 12px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div>
                <div style={{ fontSize: "22px", fontWeight: 900, lineHeight: 1.1 }}>
                  Reel Details
                </div>
                <div style={{ color: "#9ca3af", fontSize: "13px", marginTop: "5px" }}>
                  Full caption and reel information
                </div>
              </div>

              <button onClick={closeDetails} style={buttonStyle}>
                Close
              </button>
            </div>

            <div
              style={{
                padding: viewportType === "desktop" ? "18px 22px 22px" : "16px 18px 22px",
                overflowY: "auto",
                display: "grid",
                gap: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    width: "46px",
                    height: "46px",
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    overflow: "hidden",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 900,
                  }}
                >
                  {detailsReel.creatorAvatarUrl ? (
                    <img
                      src={detailsReel.creatorAvatarUrl}
                      alt={detailsReel.creatorName}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    detailsReel.creatorName.charAt(0)
                  )}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: "15px" }}>
                    {detailsReel.creatorName}
                  </div>
                  <div style={{ color: "#9ca3af", fontSize: "13px" }}>
                    {detailsReel.creator} • {formatRelativeTime(detailsReel.createdAt)}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ color: "#9ca3af", fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "7px" }}>
                  Title
                </div>
                <div style={{ fontSize: "22px", fontWeight: 950, lineHeight: 1.12 }}>
                  {detailsReel.title}
                </div>
              </div>

              <div>
                <div style={{ color: "#9ca3af", fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "7px" }}>
                  Caption
                </div>
                <div
                  style={{
                    borderRadius: "22px",
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.045)",
                    padding: "15px",
                    color: "#f3f4f6",
                    fontSize: "14px",
                    lineHeight: 1.65,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}
                >
                  {detailsReel.caption || "No caption added."}
                </div>
                <div style={{ marginTop: "8px", color: "#9ca3af", fontSize: "12px", textAlign: "right" }}>
                  {detailsReel.caption.length}/{REEL_CAPTION_MAX_LENGTH}
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  onClick={() => {
                    const nextReelId = detailsReel.id;
                    setDetailsReelId("");
                    setActiveReelId(nextReelId);
                    setCommentsOpen(true);
                  }}
                  style={buttonStyle}
                >
                  Comments
                </button>
                <button onClick={() => handleShareLink(detailsReel.id)} style={buttonStyle}>
                  Copy Link
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {shareOpen && activeReel && (
        <>
          <div style={overlayStyle} onClick={() => setShareOpen(false)} />
          <div
            style={{
              ...modalWrapStyle,
              ...(viewportType !== "desktop"
                ? {
                    alignItems: "flex-end",
                    padding: "12px 12px calc(20px + env(safe-area-inset-bottom))",
                  }
                : {}),
            }}
          >
            <div
              style={{
                ...modalCardStyle,
                ...(viewportType !== "desktop"
                  ? {
                      maxHeight: "calc(100dvh - 32px)",
                      overflowY: "auto",
                      WebkitOverflowScrolling: "touch",
                      borderRadius: "26px 26px 0 0",
                      padding: viewportType === "mobile" ? "16px" : "18px",
                    }
                  : {}),
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "12px",
                  marginBottom: "14px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: "24px", marginBottom: "6px" }}>
                    Share Reel to Feed
                  </div>
                  <div style={{ fontSize: "13px", color: "#9ca3af" }}>
                    {activeReel.title} by {activeReel.creator}
                  </div>
                </div>

                <button onClick={() => setShareOpen(false)} style={buttonStyle}>
                  Close
                </button>
              </div>

              <div style={{ display: "grid", gap: "14px" }}>
                <div
                  style={{
                    borderRadius: "22px",
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "#101828",
                  }}
                >
                  <video
                    src={activeReel.video}
                    poster={activeReel.poster || undefined}
                    muted
                    playsInline
                    controls
                    style={{
                      width: "100%",
                      height: viewportType === "mobile" ? "190px" : viewportType === "tablet" ? "230px" : "260px",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </div>

                <textarea
                  value={shareCaption}
                  onChange={(event) => setShareCaption(event.target.value)}
                  placeholder="Add a caption for when this reel is shared to your feed..."
                  style={textAreaStyle}
                />

                <div
                  style={{
                    display: "flex",
                    justifyContent: viewportType === "mobile" ? "stretch" : "space-between",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  <button onClick={() => handleShareLink(activeReel.id)} style={buttonStyle}>
                    Copy Reel Link
                  </button>
                  <button onClick={handleShareToFeed} style={primaryButtonStyle}>
                    Share to Feed
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {editOpen && (
        <>
          <div
            style={overlayStyle}
            onClick={() => {
              setEditOpen(false);
              setEditingReelId(null);
            }}
          />
          <div
            style={{
              ...modalWrapStyle,
              ...(viewportType !== "desktop"
                ? {
                    alignItems: "flex-end",
                    padding: "12px 12px calc(20px + env(safe-area-inset-bottom))",
                  }
                : {}),
            }}
          >
            <div
              style={{
                ...modalCardStyle,
                ...(viewportType !== "desktop"
                  ? {
                      maxHeight: "calc(100dvh - 32px)",
                      overflowY: "auto",
                      WebkitOverflowScrolling: "touch",
                      borderRadius: "26px 26px 0 0",
                      padding: viewportType === "mobile" ? "16px" : "18px",
                    }
                  : {}),
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "12px",
                  marginBottom: "14px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: "24px", marginBottom: "6px" }}>
                    Edit Reel
                  </div>
                  <div style={{ fontSize: "13px", color: "#9ca3af" }}>
                    Only your own reel can be edited or deleted.
                  </div>
                </div>

                <button
                  onClick={() => {
                    setEditOpen(false);
                    setEditingReelId(null);
                  }}
                  style={buttonStyle}
                >
                  Close
                </button>
              </div>

              <div style={{ display: "grid", gap: "14px" }}>
                <input
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value.slice(0, 80))}
                  placeholder="Reel title"
                  style={inputStyle}
                  maxLength={80}
                />

                <textarea
                  value={editCaption}
                  onChange={(event) => setEditCaption(event.target.value.slice(0, REEL_CAPTION_MAX_LENGTH))}
                  placeholder="Reel caption"
                  style={textAreaStyle}
                  maxLength={REEL_CAPTION_MAX_LENGTH}
                />
                <div
                  style={{
                    marginTop: "-6px",
                    color: "#9ca3af",
                    fontSize: "12px",
                    textAlign: "right",
                  }}
                >
                  {editCaption.length}/{REEL_CAPTION_MAX_LENGTH}
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: viewportType === "mobile" ? "stretch" : "space-between",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    onClick={() => {
                      setEditOpen(false);
                      setEditingReelId(null);
                    }}
                    style={buttonStyle}
                  >
                    Cancel
                  </button>
                  <button onClick={handleSaveReelEdit} style={primaryButtonStyle}>
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <style jsx global>{`
        @media (max-width: 767px) {
          .parapost-reels-modal-action-row button,
          .parapost-reels-modal-action-row a {
            flex: 1 1 100%;
          }
        }

        @media (max-height: 700px) and (orientation: landscape) {
          body {
            overscroll-behavior-y: contain;
          }
        }

        @keyframes parapostPlayPausePop {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.82);
          }
          18% {
            opacity: 0.96;
            transform: translate(-50%, -50%) scale(1);
          }
          68% {
            opacity: 0.82;
            transform: translate(-50%, -50%) scale(0.98);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(1.08);
          }
        }
      `}</style>

      <ReelUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        userId={currentUserId || null}
        onUploadSuccess={(newReel) => {
          setReels((prev) => [newReel, ...prev]);
          setActiveReelId(newReel.id);
          setIsUploadModalOpen(false);
          window.setTimeout(() => {
            scrollToReel(newReel.id);
          }, 100);
          fetchReels();
        }}
      />
    </div>
  );
}

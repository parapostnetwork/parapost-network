"use client";

import {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
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
  favorites: number;
  shares: number;
  createdAt?: string;
};

type ReelComment = {
  id: string;
  reelId: string;
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
  favorites?: number | null;
  shares?: number | null;
  created_at?: string | null;
};

type ProfileRow = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

const initialComments: ReelComment[] = [];

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#000",
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
  background: "white",
  color: "#000",
  border: "none",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 800,
  fontSize: "14px",
  cursor: "pointer",
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
  height: "100vh",
  overflowY: "auto",
  scrollSnapType: "y mandatory",
  scrollBehavior: "smooth",
  WebkitOverflowScrolling: "touch",
};

const sectionStyle: CSSProperties = {
  position: "relative",
  minHeight: "100vh",
  scrollSnapAlign: "start",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  background: "#000",
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
        favorites: Number(row.favorites || 0),
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

function getTargetReelIdFromUrl() {
  if (typeof window === "undefined") return "";

  const params = new URLSearchParams(window.location.search);
  return params.get("reel") || window.location.hash.replace("#", "");
}

async function insertReelNotification({
  userId,
  actorId,
  type,
  message,
}: {
  userId: string;
  actorId: string;
  type: "reel_like" | "reel_comment";
  message: string;
}) {
  if (!userId || !actorId || userId === actorId) return;

  const { error } = await supabase.from("notifications").insert([
    {
      user_id: userId,
      actor_id: actorId,
      type,
      post_id: null,
      comment_id: null,
      friend_request_id: null,
      message,
      is_read: false,
    },
  ]);

  if (error) {
    console.warn("Reel notification skipped:", error.message);
  }
}

export default function ReelsPage() {
  const [currentUserId, setCurrentUserId] = useState("");
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [favoritedMap, setFavoritedMap] = useState<Record<string, boolean>>({});
  const [shareBoostMap, setShareBoostMap] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<ReelComment[]>(initialComments);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentLikeMap, setCommentLikeMap] = useState<Record<string, number>>({});
  const [commentLikedMap, setCommentLikedMap] = useState<Record<string, boolean>>({});
  const [hiddenCommentMap, setHiddenCommentMap] = useState<Record<string, boolean>>({});
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [commentMenu, setCommentMenu] = useState<CommentMenuState>(null);
  const [commentLikeBurstId, setCommentLikeBurstId] = useState<string | null>(null);
  const [shareCaption, setShareCaption] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [targetReelId, setTargetReelId] = useState("");
  const [activeReelId, setActiveReelId] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [muteAll, setMuteAll] = useState(true);
  const [expandedCaptions, setExpandedCaptions] = useState<Record<string, boolean>>({});
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [reelMenu, setReelMenu] = useState<MenuState>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingReelId, setEditingReelId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [viewportWidth, setViewportWidth] = useState(1440);
  const [holdPausedId, setHoldPausedId] = useState<string | null>(null);
  const [heartBurstId, setHeartBurstId] = useState<string | null>(null);
  const [isFetchingReels, setIsFetchingReels] = useState(true);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const heartTimeoutRef = useRef<number | null>(null);
  const didPositionTargetReelRef = useRef(false);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const commentTouchTimeRef = useRef<Record<string, number>>({});
  const commentLongPressTimeoutRef = useRef<number | null>(null);
  const commentLikeBurstTimeoutRef = useRef<number | null>(null);

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

    const reelIds = mapped.map((reel) => reel.id);

    if (reelIds.length > 0) {
      const [{ data: likeRows, error: likesError }, { data: commentRows, error: commentsError }] =
        await Promise.all([
          supabase.from("reel_likes").select("id, reel_id, user_id, created_at").in("reel_id", reelIds),
          supabase.from("reel_comments").select("id, reel_id, user_id, content, created_at").in("reel_id", reelIds).order("created_at", { ascending: false }),
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
        const profileMap = new Map<string, ProfileRow>();
        profiles.forEach((profile) => profileMap.set(profile.id, profile));

        const mappedComments = (commentRows as ReelCommentDbRow[]).map((row) => {
          const profile = row.user_id ? profileMap.get(row.user_id) : undefined;
          return {
            id: row.id,
            reelId: row.reel_id || "",
            author: formatHandle(profile?.username),
            text: row.content?.trim() || "",
            time: formatRelativeTime(row.created_at),
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
      } else if (commentsError) {
        console.error("Error loading reel comments:", commentsError.message);
        setComments(initialComments);
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
    const channel = supabase
      .channel(`reels-live-${currentUserId || "guest"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reels" }, async () => {
        await fetchReels();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "reel_likes" }, async () => {
        await fetchReels();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "reel_comments" }, async () => {
        await fetchReels();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "reel_shares" }, async () => {
        await fetchReels();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  useEffect(() => {
    const setWidth = () => setViewportWidth(window.innerWidth);
    setWidth();
    window.addEventListener("resize", setWidth);
    return () => window.removeEventListener("resize", setWidth);
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

      if (reel.id === activeReelId && holdPausedId !== reel.id && !commentsOpen) {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
      } else {
        video.pause();
      }
    });
  }, [activeReelId, reels, muteAll, holdPausedId, commentsOpen]);

  useEffect(() => {
    return () => {
      if (heartTimeoutRef.current) {
        window.clearTimeout(heartTimeoutRef.current);
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
    if (viewportType === "mobile") {
      return {
        stageWidth: "100vw",
        stageHeight: "100vh",
        borderRadius: 0,
        showDesktopArrows: false,
        outerPadding: 0,
        actionRight: 12,
        textLeft: 12,
        textRight: 80,
        bottomOffset: 20,
        topOffset: 0,
        titleSize: 20,
        captionSize: 14,
        topHeaderPad: 16,
      };
    }

    if (viewportType === "tablet") {
      return {
        stageWidth: "min(74vw, 560px)",
        stageHeight: "min(89vh, 960px)",
        borderRadius: 30,
        showDesktopArrows: false,
        outerPadding: 18,
        actionRight: 14,
        textLeft: 16,
        textRight: 86,
        bottomOffset: 18,
        topOffset: 8,
        titleSize: 24,
        captionSize: 15,
        topHeaderPad: 16,
      };
    }

    return {
      stageWidth: "min(34vw, 540px)",
      stageHeight: "min(90vh, 980px)",
      borderRadius: 32,
      showDesktopArrows: true,
      outerPadding: 24,
      actionRight: 12,
      textLeft: 18,
      textRight: 82,
      bottomOffset: 16,
      topOffset: 8,
      titleSize: 22,
      captionSize: 14,
      topHeaderPad: 12,
    };
  }, [viewportType]);

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

  const getVisibleRepliesForComment = (commentId: string) => {
    return comments.filter(
      (comment) =>
        comment.reelId === activeReelId &&
        comment.parentCommentId === commentId &&
        !hiddenCommentMap[comment.id]
    );
  };

  const scrollToReel = (reelId: string) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const target = container.querySelector<HTMLElement>(`[data-reel-id="${reelId}"]`);
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveReelId(reelId);
  };

  const scrollToAdjacentReel = (direction: "prev" | "next") => {
    if (commentsOpen) return;

    const currentIndex = reels.findIndex((reel) => reel.id === activeReelId);
    if (currentIndex === -1) return;

    const nextIndex = direction === "prev" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= reels.length) return;

    scrollToReel(reels[nextIndex].id);
  };

  const updateActiveFromScroll = () => {
    if (commentsOpen) return;

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

  const handleTogglePlayPause = (reelId: string) => {
    if (commentsOpen) return;

    const video = videoRefs.current[reelId];
    if (!video) return;

    if (video.paused) {
      setHoldPausedId(null);
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    } else {
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
        userId: reel.user_id,
        actorId: currentUserId,
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
    }
  };

  const handleFavoriteToggle = (reelId: string) => {
    setFavoritedMap((prev) => ({
      ...prev,
      [reelId]: !prev[reelId],
    }));
  };

  const handleFollowToggle = (creatorProfileId: string) => {
    if (!creatorProfileId || creatorProfileId === currentUserId) return;

    setFollowingMap((prev) => ({
      ...prev,
      [creatorProfileId]: !prev[creatorProfileId],
    }));
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

    const nextComment: ReelComment = {
      id: `comment-${Date.now()}`,
      reelId: activeReel.id,
      author: "@you",
      text: trimmed,
      time: "Just now",
    };

    setComments((prev) => [nextComment, ...prev]);
    setReels((prev) =>
      prev.map((reel) =>
        reel.id === activeReel.id ? { ...reel, comments: reel.comments + 1 } : reel
      )
    );
    setCommentDraft("");

    const { error: commentInsertError } = await supabase.from("reel_comments").insert([
      {
        reel_id: activeReel.id,
        user_id: currentUserId,
        content: trimmed,
      },
    ]);

    if (commentInsertError) {
      console.error("Reel comment insert error:", commentInsertError.message);
      alert(commentInsertError.message || "Could not save reel comment.");
      await fetchReels();
      return;
    }

    if (activeReel.user_id && activeReel.user_id !== currentUserId) {
      await insertReelNotification({
        userId: activeReel.user_id,
        actorId: currentUserId,
        type: "reel_comment",
        message: "commented on your reel.",
      });
    }
  };

  const handleCommentInputKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleAddComment();
    }
  };

  const handleCommentLikeToggle = (commentId: string, forceLike = false) => {
    const nextLiked = forceLike ? true : !commentLikedMap[commentId];

    if (forceLike && commentLikedMap[commentId]) {
      setCommentLikeBurstId(commentId);
      if (commentLikeBurstTimeoutRef.current) {
        window.clearTimeout(commentLikeBurstTimeoutRef.current);
      }
      commentLikeBurstTimeoutRef.current = window.setTimeout(() => {
        setCommentLikeBurstId(null);
      }, 520);
      return;
    }

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

    const nextReply: ReelComment = {
      id: `reply-${Date.now()}`,
      reelId: activeReel.id,
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

    const { error: commentInsertError } = await supabase.from("reel_comments").insert([
      {
        reel_id: activeReel.id,
        user_id: currentUserId,
        content: trimmed,
      },
    ]);

    if (commentInsertError) {
      console.error("Reel comment reply insert error:", commentInsertError.message);
      alert(commentInsertError.message || "Could not save reel reply.");
      await fetchReels();
      return;
    }

    if (activeReel.user_id && activeReel.user_id !== currentUserId) {
      await insertReelNotification({
        userId: activeReel.user_id,
        actorId: currentUserId,
        type: "reel_comment",
        message: "replied to a comment on your reel.",
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

  const handleDeleteLocalComment = (commentId: string) => {
    setComments((prev) =>
      prev.filter(
        (comment) => comment.id !== commentId && comment.parentCommentId !== commentId
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

  const handleReportComment = (commentId: string) => {
    setCommentMenu(null);
    alert("Report comment flow comes next when moderation is database-backed.");
  };

  const handleOpenCommentMenu = (
    event: React.MouseEvent<HTMLElement>,
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

    const { error: shareInsertError } = await supabase.from("reel_shares").insert([
      {
        reel_id: activeReel.id,
        user_id: currentUserId,
        caption: trimmedCaption || null,
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

    setShareMessage("Shared to your feed.");
    setShareCaption("");

    window.setTimeout(() => {
      setShareMessage("");
    }, 2600);
  };

  const handleOpenReelMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    reelId: string
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const x = clamp(event.clientX - 190, 12, window.innerWidth - 220);
    const y = clamp(event.clientY + 8, 12, window.innerHeight - 120);

    setReelMenu({
      reelId,
      x,
      y,
    });
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

    const nextTitle = editTitle.trim();
    const nextCaption = editCaption.trim();

    const { error } = await supabase
      .from("reels")
      .update({
        title: nextTitle,
        caption: nextCaption,
      })
      .eq("id", editingReelId)
      .eq("user_id", currentUserId);

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
    const confirmDelete = window.confirm("Delete this reel?");
    if (!confirmDelete) return;

    const { error } = await supabase
      .from("reels")
      .delete()
      .eq("id", reelId)
      .eq("user_id", currentUserId);

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

    if (activeReelId === reelId) {
      setActiveReelId(nextReels[0]?.id || "");
    }

    setReelMenu(null);
  };

  const isCaptionExpanded = (reelId: string) => !!expandedCaptions[reelId];

  return (
    <div style={pageStyle}>
      <div style={topBarStyle}>
        <div style={topBarInnerStyle}>
          <div style={{ paddingTop: `${stageMetrics.topHeaderPad}px` }}>
            <h1
              style={{
                margin: 0,
                fontSize: "26px",
                lineHeight: 1.05,
                textShadow: "0 2px 12px rgba(0,0,0,0.45)",
              }}
            >
              Parapost Reels
            </h1>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              paddingTop: `${stageMetrics.topHeaderPad}px`,
            }}
          >
            <button onClick={() => setIsUploadModalOpen(true)} style={buttonStyle}>
              + Create Reel
            </button>

            <button onClick={() => setMuteAll((prev) => !prev)} style={buttonStyle}>
              {muteAll ? "Unmute" : "Mute"}
            </button>

            <Link href="/dashboard" style={navLinkStyle}>
              Back to Dashboard
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
              cursor: commentsOpen ? "not-allowed" : "pointer",
              fontSize: "22px",
              backdropFilter: "blur(12px)",
              opacity: commentsOpen ? 0.45 : 1,
            }}
            aria-label="Previous reel"
            disabled={commentsOpen}
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
              cursor: commentsOpen ? "not-allowed" : "pointer",
              fontSize: "22px",
              backdropFilter: "blur(12px)",
              opacity: commentsOpen ? 0.45 : 1,
            }}
            aria-label="Next reel"
            disabled={commentsOpen}
          >
            ↓
          </button>
        </div>
      )}

      {isFetchingReels ? (
        <div
          style={{
            minHeight: "100vh",
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
            minHeight: "100vh",
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
            const isFavorited = !!favoritedMap[reel.id];
            const isOwner = !!currentUserId && reel.user_id === currentUserId;
            const isFollowingCreator = !!followingMap[reel.creator_profile_id];
            const displayedLikes = reel.likes;
            const displayedFavorites = reel.favorites + (isFavorited ? 1 : 0);
            const displayedComments = comments.filter(
              (comment) => comment.reelId === reel.id
            ).length;
            const displayedShares = reel.shares;
            const progress = progressMap[reel.id] || 0;
            const expanded = isCaptionExpanded(reel.id);
            const shortCaption =
              reel.caption.length > 100 && !expanded
                ? `${reel.caption.slice(0, 100)}...`
                : reel.caption;

            const isActiveCommentsReel = commentsOpen && activeReelId === reel.id;

            return (
              <section
                key={reel.id}
                data-reel-id={reel.id}
                id={reel.id}
                style={{
                  ...sectionStyle,
                  padding: `${stageMetrics.topOffset}px ${stageMetrics.outerPadding}px ${stageMetrics.outerPadding}px`,
                }}
              >
                <ReelCard
                  width={stageMetrics.stageWidth}
                  height={stageMetrics.stageHeight}
                  borderRadius={stageMetrics.borderRadius}
                  isDimmed={isActiveCommentsReel}
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
                    onMouseDown={() => {
                      if (viewportType === "desktop" && !commentsOpen) {
                        setHoldPausedId(reel.id);
                        videoRefs.current[reel.id]?.pause();
                      }
                    }}
                    onMouseUp={() => {
                      if (
                        viewportType === "desktop" &&
                        holdPausedId === reel.id &&
                        !commentsOpen
                      ) {
                        setHoldPausedId(null);
                        const playPromise = videoRefs.current[reel.id]?.play();
                        if (playPromise && typeof playPromise.catch === "function") {
                          playPromise.catch(() => {});
                        }
                      }
                    }}
                    onMouseLeave={() => {
                      if (
                        viewportType === "desktop" &&
                        holdPausedId === reel.id &&
                        !commentsOpen
                      ) {
                        setHoldPausedId(null);
                        const playPromise = videoRefs.current[reel.id]?.play();
                        if (playPromise && typeof playPromise.catch === "function") {
                          playPromise.catch(() => {});
                        }
                      }
                    }}
                    onTouchStart={() => {
                      if (!commentsOpen) {
                        setHoldPausedId(reel.id);
                        videoRefs.current[reel.id]?.pause();
                      }
                    }}
                    onTouchEnd={() => {
                      if (holdPausedId === reel.id && !commentsOpen) {
                        setHoldPausedId(null);
                        const playPromise = videoRefs.current[reel.id]?.play();
                        if (playPromise && typeof playPromise.catch === "function") {
                          playPromise.catch(() => {});
                        }
                      }
                    }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      cursor: commentsOpen ? "default" : "pointer",
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
                      preload="metadata"
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
                      onEnded={() => scrollToAdjacentReel("next")}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
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
                  </div>

                  <div
                    style={{
                      position: "absolute",
                      top: "12px",
                      right: "14px",
                      zIndex: 7,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      onClick={(event) => handleOpenReelMenu(event, reel.id)}
                      style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "50%",
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(0,0,0,0.35)",
                        color: "white",
                        cursor: "pointer",
                        fontSize: "20px",
                      }}
                      aria-label="Open reel menu"
                    >
                      ⋯
                    </button>
                  </div>

                  <div
                    style={{
                      position: "absolute",
                      right: `${stageMetrics.actionRight}px`,
                      bottom: `${stageMetrics.bottomOffset}px`,
                      zIndex: 7,
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      alignItems: "center",
                      opacity: isActiveCommentsReel ? 0.12 : 1,
                      pointerEvents: isActiveCommentsReel ? "none" : "auto",
                      transition: "opacity 180ms ease",
                    }}
                  >
                    {[
                      {
                        symbol: isLiked ? "♥" : "♡",
                        label: displayedLikes,
                        action: () => handleLikeToggle(reel.id),
                      },
                      {
                        symbol: "💬",
                        label: displayedComments,
                        action: () => {
                          setActiveReelId(reel.id);
                          setCommentsOpen(true);
                        },
                      },
                      {
                        symbol: isFavorited ? "★" : "☆",
                        label: displayedFavorites,
                        action: () => handleFavoriteToggle(reel.id),
                      },
                      {
                        symbol: "↗",
                        label: displayedShares,
                        action: () => {
                          setActiveReelId(reel.id);
                          setShareOpen(true);
                        },
                      },
                    ].map((item, actionIndex) => (
                      <div
                        key={`${reel.id}-${actionIndex}`}
                        style={{
                          display: "grid",
                          justifyItems: "center",
                          gap: "5px",
                        }}
                      >
                        <button
                          onClick={item.action}
                          style={{
                            width: viewportType === "mobile" ? "48px" : "52px",
                            height: viewportType === "mobile" ? "48px" : "52px",
                            borderRadius: "50%",
                            border: "1px solid rgba(255,255,255,0.16)",
                            background: "rgba(0,0,0,0.34)",
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            fontSize: viewportType === "mobile" ? "18px" : "19px",
                            backdropFilter: "blur(12px)",
                            boxShadow: "0 8px 18px rgba(0,0,0,0.38)",
                          }}
                        >
                          {item.symbol}
                        </button>

                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: 700,
                            color: "#f3f4f6",
                            textAlign: "center",
                            maxWidth: "64px",
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
                      opacity: isActiveCommentsReel ? 0.1 : 1,
                      pointerEvents: isActiveCommentsReel ? "none" : "auto",
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
                      <div
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
                        }}
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
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: "15px",
                            lineHeight: 1.15,
                            textShadow: "0 2px 10px rgba(0,0,0,0.42)",
                          }}
                        >
                          {reel.creatorName}
                        </div>
                        <div
                          style={{
                            fontSize: "13px",
                            color: "#e5e7eb",
                            textShadow: "0 2px 10px rgba(0,0,0,0.42)",
                          }}
                        >
                          {reel.creator}
                        </div>
                      </div>

                      {!isOwner && (
                        <button
                          onClick={() => handleFollowToggle(reel.creator_profile_id)}
                          style={isFollowingCreator ? buttonStyle : primaryButtonStyle}
                        >
                          {isFollowingCreator ? "Following" : "Follow"}
                        </button>
                      )}
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

                    <p
                      style={{
                        margin: 0,
                        color: "#f3f4f6",
                        lineHeight: 1.45,
                        maxWidth: "100%",
                        fontSize: `${stageMetrics.captionSize}px`,
                        textShadow: "0 2px 10px rgba(0,0,0,0.45)",
                      }}
                    >
                      {shortCaption}{" "}
                      {reel.caption.length > 100 && (
                        <button
                          onClick={() =>
                            setExpandedCaptions((prev) => ({
                              ...prev,
                              [reel.id]: !prev[reel.id],
                            }))
                          }
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "white",
                            fontWeight: 800,
                            cursor: "pointer",
                            padding: 0,
                            textShadow: "0 2px 10px rgba(0,0,0,0.45)",
                          }}
                        >
                          {expanded ? "less" : "more"}
                        </button>
                      )}
                    </p>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "2px" }}>
                      <button
                        onClick={() => {
                          const video = videoRefs.current[reel.id];
                          if (!video) return;
                          video.currentTime = 0;
                          const playPromise = video.play();
                          if (playPromise && typeof playPromise.catch === "function") {
                            playPromise.catch(() => {});
                          }
                        }}
                        style={buttonStyle}
                      >
                        Replay
                      </button>

                      <button
                        onClick={() => {
                          setActiveReelId(reel.id);
                          setCommentsOpen(true);
                        }}
                        style={buttonStyle}
                      >
                        Comments
                      </button>

                      <button onClick={() => handleShareLink(reel.id)} style={buttonStyle}>
                        Copy Link
                      </button>
                    </div>

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
                      onClose={() => setCommentsOpen(false)}
                      reelTitle={reel.title}
                      activeComments={activeComments}
                      allComments={comments}
                      activeReelId={activeReelId}
                      currentUserId={currentUserId}
                      activeReelOwnerId={activeReel?.user_id || ""}
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
                    />
                  )}
                </ReelCard>
              </section>
            );
          })}
        </div>
      )}

      {reelMenu && (
        <div
          style={{
            position: "fixed",
            top: reelMenu.y,
            left: reelMenu.x,
            zIndex: 100,
            minWidth: "200px",
            background: "#0b1020",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "18px",
            overflow: "hidden",
            boxShadow: "0 18px 34px rgba(0,0,0,0.34)",
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {(() => {
            const menuReel = reels.find((item) => item.id === reelMenu.reelId);
            const isOwner =
              !!menuReel && !!currentUserId && menuReel.user_id === currentUserId;

            if (!menuReel) return null;

            return isOwner ? (
              <>
                <button style={menuItemStyle} onClick={() => handleStartEditReel(menuReel)}>
                  Edit Reel
                </button>
                <button
                  style={{ ...menuItemStyle, color: "#fecaca", borderBottom: "none" }}
                  onClick={() => handleDeleteReel(menuReel.id)}
                >
                  Delete Reel
                </button>
              </>
            ) : (
              <>
                <button
                  style={menuItemStyle}
                  onClick={() => alert("Report flow comes next when reel moderation is database-backed.")}
                >
                  Report Reel
                </button>
                <button
                  style={{ ...menuItemStyle, borderBottom: "none" }}
                  onClick={() => alert("Block flow comes next when user relationships are database-backed.")}
                >
                  Block User
                </button>
              </>
            );
          })()}
        </div>
      )}


      {shareOpen && activeReel && (
        <>
          <div style={overlayStyle} onClick={() => setShareOpen(false)} />
          <div style={modalWrapStyle}>
            <div style={modalCardStyle}>
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
                      height: "260px",
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
                    justifyContent: "space-between",
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
          <div style={modalWrapStyle}>
            <div style={modalCardStyle}>
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
                  onChange={(event) => setEditTitle(event.target.value)}
                  placeholder="Reel title"
                  style={inputStyle}
                />

                <textarea
                  value={editCaption}
                  onChange={(event) => setEditCaption(event.target.value)}
                  placeholder="Reel caption"
                  style={textAreaStyle}
                />

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
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

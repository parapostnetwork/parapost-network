/* eslint-disable react-hooks/exhaustive-deps, @next/next/no-img-element */
"use client";

import {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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

type ReelDbRow = {
  id: string;
  user_id: string | null;
  creator_profile_id: string | null;
  title: string | null;
  caption: string | null;
  video_url: string | null;
  poster_url: string | null;
  shares?: number | null;
  created_at?: string | null;
};

type ProfileRow = {
  id: string;
  username?: string | null;
  full_name?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  is_private?: boolean | null;
};

type MenuState = {
  reelId: string;
  x: number;
  y: number;
} | null;

type PlayPauseFeedback = {
  reelId: string;
  mode: "play" | "pause";
  nonce: number;
} | null;

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
  padding: "clamp(12px, 3vw, 22px)",
  zIndex: 90,
  overflowY: "auto",
  overscrollBehavior: "contain",
  WebkitOverflowScrolling: "touch",
  boxSizing: "border-box",
};

const modalCardStyle: CSSProperties = {
  width: "min(560px, 100%)",
  maxHeight: "min(92dvh, 760px)",
  overflowY: "auto",
  overscrollBehavior: "contain",
  WebkitOverflowScrolling: "touch",
  background: "#0b1020",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "28px",
  padding: "clamp(16px, 3vw, 20px)",
  boxSizing: "border-box",
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

function formatCompactCount(value: number | string) {
  const numericValue =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value).replace(/[^0-9]/g, ""), 10);

  if (!Number.isFinite(numericValue)) return String(value);
  if (numericValue < 1000) return String(numericValue);
  if (numericValue < 1000000) {
    const next = numericValue / 1000;
    return `${next >= 10 ? next.toFixed(0) : next.toFixed(1)}K`;
  }

  const next = numericValue / 1000000;
  return `${next >= 10 ? next.toFixed(0) : next.toFixed(1)}M`;
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isReelOwner(
  reel: Pick<ReelItem, "user_id" | "creator_profile_id"> | null | undefined,
  userId: string,
  fallbackProfileId = "",
) {
  if (!reel || !userId) return false;
  return (
    reel.user_id === userId ||
    reel.creator_profile_id === userId ||
    (!!fallbackProfileId && userId === fallbackProfileId)
  );
}

function buildReelItems(rows: ReelDbRow[], profiles: ProfileRow[]): ReelItem[] {
  const profileMap = new Map<string, ProfileRow>();
  profiles.forEach((profile) => profileMap.set(profile.id, profile));

  return rows
    .filter((row) => row.id && row.video_url)
    .map((row) => {
      const profileId = row.creator_profile_id || row.user_id || "";
      const profile = profileMap.get(profileId);

      const creatorName =
        profile?.display_name?.trim() ||
        profile?.full_name?.trim() ||
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
        likes: 0,
        comments: 0,
        shares: Number(row.shares || 0),
        createdAt: row.created_at || undefined,
      };
    });
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

export default function ProfileReelsViewerPage() {
  const params = useParams();

  const profileId = useMemo(() => {
    const raw = params?.id;
    return typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw[0] || ""
        : "";
  }, [params]);

  const [resolvedProfileId, setResolvedProfileId] = useState("");
  const effectiveProfileId = resolvedProfileId || profileId;

  const [currentUserId, setCurrentUserId] = useState("");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [shareBoostMap, setShareBoostMap] = useState<Record<string, number>>(
    {},
  );
  const [comments, setComments] = useState<ReelComment[]>(initialComments);
  const [commentLikeMap, setCommentLikeMap] = useState<Record<string, number>>(
    {},
  );
  const [commentLikedMap, setCommentLikedMap] = useState<
    Record<string, boolean>
  >({});
  const [commentDraft, setCommentDraft] = useState("");
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [shareCaption, setShareCaption] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [activeReelId, setActiveReelId] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [lockedCommentReelId, setLockedCommentReelId] = useState<string | null>(
    null,
  );
  const [shareOpen, setShareOpen] = useState(false);
  const [muteAll, setMuteAll] = useState(true);
  const [detailsReelId, setDetailsReelId] = useState("");
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [videoFitMap, setVideoFitMap] = useState<
    Record<string, "cover" | "contain">
  >({});
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [reelMenu, setReelMenu] = useState<MenuState>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingReelId, setEditingReelId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentDraft, setEditingCommentDraft] = useState("");
  const [viewportWidth, setViewportWidth] = useState(1440);
  const [viewportHeight, setViewportHeight] = useState(900);
  const [holdPausedId, setHoldPausedId] = useState<string | null>(null);
  const [heartBurstId, setHeartBurstId] = useState<string | null>(null);
  const [playPauseFeedback, setPlayPauseFeedback] =
    useState<PlayPauseFeedback>(null);
  const [isFetchingReels, setIsFetchingReels] = useState(true);
  const [canViewProfileContent, setCanViewProfileContent] = useState(true);
  const [pageErrorMessage, setPageErrorMessage] = useState("");

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const heartTimeoutRef = useRef<number | null>(null);
  const playPauseFeedbackTimeoutRef = useRef<number | null>(null);
  const playPauseFeedbackNonceRef = useRef(0);
  const initialTargetReelIdRef = useRef("");
  const hasInitialScrolledRef = useRef(false);

  const detailsReel = useMemo(() => {
    return reels.find((reel) => reel.id === detailsReelId) || null;
  }, [reels, detailsReelId]);

  const detailsOpen = Boolean(detailsReelId && detailsReel);

  const fetchReels = async () => {
    setIsFetchingReels(true);
    setPageErrorMessage("");

    if (!profileId || !isValidUuid(profileId)) {
      setResolvedProfileId("");
      setProfile(null);
      setReels([]);
      setComments([]);
      setCommentLikeMap({});
      setCommentLikedMap({});
      setLikedMap({});
      setFollowingMap({});
      setCanViewProfileContent(false);
      setPageErrorMessage("Profile not found.");
      setIsFetchingReels(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const nextUserId = user?.id || "";
    setCurrentUserId(nextUserId);

    let nextProfileId = profileId;
    let profileData: ProfileRow | null = null;

    const profileResult = await supabase
      .from("profiles")
      .select("id, username, full_name, display_name, avatar_url, is_private")
      .eq("id", nextProfileId)
      .maybeSingle();

    if (profileResult.error) {
      console.error("Error loading profile:", profileResult.error.message);
      setResolvedProfileId("");
      setProfile(null);
      setReels([]);
      setComments([]);
      setCommentLikeMap({});
      setCommentLikedMap({});
      setLikedMap({});
      setFollowingMap({});
      setCanViewProfileContent(false);
      setPageErrorMessage(
        profileResult.error.message || "Unable to load profile.",
      );
      setIsFetchingReels(false);
      return;
    }

    profileData = (profileResult.data as ProfileRow | null) || null;

    // Safety fallback: if the route accidentally receives a Reel ID instead of a Profile ID,
    // resolve the Reel owner and still open the correct profile Reel viewer.
    if (!profileData) {
      const { data: fallbackReel, error: fallbackReelError } = await supabase
        .from("reels")
        .select("id, user_id, creator_profile_id")
        .eq("id", profileId)
        .maybeSingle();

      if (!fallbackReelError && fallbackReel) {
        const fallbackProfileId =
          fallbackReel.creator_profile_id || fallbackReel.user_id || "";

        if (fallbackProfileId && isValidUuid(fallbackProfileId)) {
          nextProfileId = fallbackProfileId;
          if (!initialTargetReelIdRef.current) {
            initialTargetReelIdRef.current = fallbackReel.id;
          }

          const fallbackProfileResult = await supabase
            .from("profiles")
            .select(
              "id, username, full_name, display_name, avatar_url, is_private",
            )
            .eq("id", fallbackProfileId)
            .maybeSingle();

          if (!fallbackProfileResult.error) {
            profileData =
              (fallbackProfileResult.data as ProfileRow | null) || null;
          }
        }
      }
    }

    setResolvedProfileId(nextProfileId !== profileId ? nextProfileId : "");

    const loadedProfile = profileData;
    setProfile(loadedProfile);

    if (!loadedProfile) {
      setReels([]);
      setComments([]);
      setCommentLikeMap({});
      setCommentLikedMap({});
      setLikedMap({});
      setFollowingMap({});
      setCanViewProfileContent(false);
      setPageErrorMessage("Profile not found.");
      setIsFetchingReels(false);
      return;
    }

    const profileIsPrivate = Boolean(loadedProfile.is_private);
    const viewerIsOwner = Boolean(nextUserId && nextUserId === nextProfileId);
    let viewerIsFriend = false;

    if (profileIsPrivate && nextUserId && !viewerIsOwner) {
      const { data: friendshipRows, error: friendshipError } = await supabase
        .from("friend_requests")
        .select("id")
        .eq("status", "accepted")
        .or(
          `and(sender_id.eq.${nextUserId},receiver_id.eq.${nextProfileId}),and(sender_id.eq.${nextProfileId},receiver_id.eq.${nextUserId})`,
        )
        .limit(1);

      if (friendshipError) {
        console.warn(
          "Private profile friendship check failed:",
          friendshipError.message,
        );
      } else {
        viewerIsFriend = Boolean(friendshipRows && friendshipRows.length > 0);
      }
    }

    const canView = !profileIsPrivate || viewerIsOwner || viewerIsFriend;
    setCanViewProfileContent(canView);

    if (!canView) {
      setReels([]);
      setComments([]);
      setCommentLikeMap({});
      setCommentLikedMap({});
      setLikedMap({});
      setShareBoostMap({});
      setActiveReelId("");
      setFollowingMap({});
      setIsFetchingReels(false);
      return;
    }

    const [reelsResult, followersResult] = await Promise.all([
      supabase
        .from("reels")
        .select("*")
        .or(
          `user_id.eq.${nextProfileId},creator_profile_id.eq.${nextProfileId}`,
        )
        .order("created_at", { ascending: false }),
      nextUserId && nextProfileId && nextUserId !== nextProfileId
        ? supabase
            .from("followers")
            .select("follower_id, following_id")
            .eq("follower_id", nextUserId)
            .eq("following_id", nextProfileId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (followersResult.data) {
      setFollowingMap({ [nextProfileId]: true });
    } else {
      setFollowingMap({});
    }

    if (reelsResult.error) {
      console.error("Error loading profile reels:", reelsResult.error.message);
      setReels([]);
      setComments([]);
      setLikedMap({});
      setIsFetchingReels(false);
      return;
    }

    const rows = (reelsResult.data || []) as ReelDbRow[];
    const creatorProfileIds = Array.from(
      new Set(
        rows
          .map((row) => row.creator_profile_id || row.user_id)
          .filter(Boolean),
      ),
    ) as string[];

    let profiles: ProfileRow[] = [];
    if (creatorProfileIds.length > 0) {
      const { data: profileRows, error: profilesError } = await supabase
        .from("profiles")
        .select("id, username, full_name, display_name, avatar_url")
        .in("id", creatorProfileIds);

      if (profilesError) {
        console.error(
          "Error loading reel creator profiles:",
          profilesError.message,
        );
      } else {
        profiles = (profileRows || []) as ProfileRow[];
      }
    }

    if (!profiles.some((item) => item.id === loadedProfile.id)) {
      profiles = [loadedProfile, ...profiles];
    }

    let mapped = buildReelItems(rows, profiles);
    const reelIds = mapped.map((reel) => reel.id);

    if (reelIds.length > 0) {
      const [
        { data: likeRows, error: likesError },
        { data: commentRows, error: commentsError },
      ] = await Promise.all([
        supabase
          .from("reel_likes")
          .select("id, reel_id, user_id, created_at")
          .in("reel_id", reelIds),
        supabase
          .from("reel_comments")
          .select(
            "id, reel_id, user_id, content, parent_comment_id, reply_to_author, created_at",
          )
          .in("reel_id", reelIds)
          .order("created_at", { ascending: false }),
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
          likes: likeCountMap[reel.id] ?? 0,
        }));

        setLikedMap(likedByCurrentUser);
      } else {
        setLikedMap({});
        if (likesError) {
          console.error("Error loading reel likes:", likesError.message);
        }
      }

      if (!commentsError && commentRows) {
        const commentUserIds = Array.from(
          new Set(
            (commentRows as ReelCommentDbRow[])
              .map((row) => row.user_id)
              .filter(Boolean),
          ),
        ) as string[];

        let commentProfiles: ProfileRow[] = [];

        if (commentUserIds.length > 0) {
          const { data: commentProfileRows, error: commentProfilesError } =
            await supabase
              .from("profiles")
              .select("id, username, full_name, display_name, avatar_url")
              .in("id", commentUserIds);

          if (commentProfilesError) {
            console.warn(
              "Error loading profile reel comment profiles:",
              commentProfilesError.message,
            );
          } else {
            commentProfiles = (commentProfileRows || []) as ProfileRow[];
          }
        }

        const profileMap = new Map<string, ProfileRow>();
        profiles.forEach((item) => profileMap.set(item.id, item));
        profileMap.set(loadedProfile.id, loadedProfile);
        commentProfiles.forEach((item) => profileMap.set(item.id, item));

        const mappedComments = (commentRows as ReelCommentDbRow[]).map(
          (row) => {
            const commentProfile = row.user_id
              ? profileMap.get(row.user_id)
              : undefined;
            return {
              id: row.id,
              reelId: row.reel_id || "",
              authorUserId: row.user_id || "",
              author: formatHandle(commentProfile?.username),
              text: row.content?.trim() || "",
              time: formatRelativeTime(row.created_at),
              parentCommentId: row.parent_comment_id || null,
              replyToAuthor: row.reply_to_author || null,
            } satisfies ReelComment;
          },
        );

        const commentCountMap: Record<string, number> = {};
        mappedComments.forEach((comment) => {
          if (!comment.reelId) return;
          commentCountMap[comment.reelId] =
            (commentCountMap[comment.reelId] || 0) + 1;
        });

        mapped = mapped.map((reel) => ({
          ...reel,
          comments: commentCountMap[reel.id] ?? 0,
        }));

        setComments(mappedComments);

        const commentIds = mappedComments
          .map((comment) => comment.id)
          .filter(Boolean);

        if (commentIds.length > 0) {
          const { data: commentLikeRows, error: commentLikesError } =
            await supabase
              .from("reel_comment_likes")
              .select("id, comment_id, user_id, created_at")
              .in("comment_id", commentIds);

          if (!commentLikesError && commentLikeRows) {
            const nextCommentLikeMap: Record<string, number> = {};
            const nextCommentLikedMap: Record<string, boolean> = {};

            (commentLikeRows as ReelCommentLikeDbRow[]).forEach((row) => {
              if (!row.comment_id) return;
              nextCommentLikeMap[row.comment_id] =
                (nextCommentLikeMap[row.comment_id] || 0) + 1;

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
              console.warn(
                "Error loading profile reel comment likes:",
                commentLikesError.message,
              );
            }
          }
        } else {
          setCommentLikeMap({});
          setCommentLikedMap({});
        }
      } else {
        setComments(initialComments);
        setCommentLikeMap({});
        setCommentLikedMap({});
        if (commentsError) {
          console.error("Error loading reel comments:", commentsError.message);
        }
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
        console.warn("Error loading profile reel share counts:", shareRowsError.message);
      }

    } else {
      setComments(initialComments);
      setCommentLikeMap({});
      setCommentLikedMap({});
      setLikedMap({});
    }

    const initialTarget = initialTargetReelIdRef.current;
    if (initialTarget && mapped.some((reel) => reel.id === initialTarget)) {
      const targetReel = mapped.find((reel) => reel.id === initialTarget);
      mapped = [
        ...(targetReel ? [targetReel] : []),
        ...mapped.filter((reel) => reel.id !== initialTarget),
      ];
    }

    setReels(mapped);

    if (mapped.length > 0) {
      const target = initialTargetReelIdRef.current;
      const matched = target ? mapped.find((reel) => reel.id === target) : null;
      setActiveReelId(matched?.id || mapped[0].id);
    } else {
      setActiveReelId("");
    }

    setIsFetchingReels(false);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    initialTargetReelIdRef.current = url.searchParams.get("reelId") || "";
  }, []);

  useEffect(() => {
    fetchReels();
  }, [profileId]);

  useEffect(() => {
    if (
      !effectiveProfileId ||
      !isValidUuid(effectiveProfileId) ||
      !canViewProfileContent
    )
      return;

    const channel = supabase
      .channel(
        `profile-reels-live-${effectiveProfileId}-${currentUserId || "guest"}`,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reels" },
        async () => {
          await fetchReels();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reel_likes" },
        async () => {
          await fetchReels();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reel_comments" },
        async () => {
          await fetchReels();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reel_comment_likes" },
        async () => {
          await fetchReels();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reel_shares" },
        async () => {
          await fetchReels();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveProfileId, currentUserId, canViewProfileContent]);

  useEffect(() => {
    const setViewportSize = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };

    setViewportSize();
    window.addEventListener("resize", setViewportSize);
    window.addEventListener("orientationchange", setViewportSize);

    return () => {
      window.removeEventListener("resize", setViewportSize);
      window.removeEventListener("orientationchange", setViewportSize);
    };
  }, []);

  useEffect(() => {
    const closeMenu = () => {
      // On mobile, the owner menu opens from pointer/touch events.
      // A synthetic click can fire right after touch and instantly close the sheet.
      // Let the mobile overlay close itself instead.
      if (typeof window !== "undefined" && window.innerWidth <= 767) {
        return;
      }

      setReelMenu(null);
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu);
    };
  }, []);

  useEffect(() => {
    reels.forEach((reel) => {
      const video = videoRefs.current[reel.id];
      if (!video) return;

      video.muted = muteAll;

      if (
        reel.id === activeReelId &&
        holdPausedId !== reel.id &&
        !commentsOpen &&
        !detailsOpen
      ) {
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
    if (!isFetchingReels && activeReelId && !hasInitialScrolledRef.current) {
      hasInitialScrolledRef.current = true;

      const container = scrollContainerRef.current;
      if (container) {
        container.scrollTop = 0;
      }
    }
  }, [isFetchingReels, activeReelId]);

  useEffect(() => {
    return () => {
      if (heartTimeoutRef.current) {
        window.clearTimeout(heartTimeoutRef.current);
      }

      if (playPauseFeedbackTimeoutRef.current) {
        window.clearTimeout(playPauseFeedbackTimeoutRef.current);
      }
    };
  }, []);

  const viewportType = getViewportType(viewportWidth);
  const isTinyPhone = viewportWidth <= 380;
  const isShortViewport = viewportHeight <= 690;
  const isTabletWide = viewportWidth >= 900 && viewportWidth <= 1180;
  const isNotebookWidth = viewportWidth > 1024 && viewportWidth <= 1366;

  const stageMetrics = useMemo(() => {
    if (viewportType === "mobile") {
      return {
        stageWidth: "100vw",
        stageHeight: "100dvh",
        borderRadius: 0,
        showDesktopArrows: false,
        outerPadding: 0,
        actionRight: isTinyPhone ? 8 : 12,
        textLeft: isTinyPhone ? 10 : 12,
        textRight: isTinyPhone ? 72 : 80,
        bottomOffset: isShortViewport ? 74 : 92,
        topOffset: 0,
        titleSize: isTinyPhone ? 18 : 20,
        captionSize: 14,
        topHeaderPad: isShortViewport ? 8 : 12,
      };
    }

    if (viewportType === "tablet") {
      return {
        stageWidth: isTabletWide ? "min(68vw, 650px)" : "min(82vw, 590px)",
        stageHeight: "min(calc(100dvh - 142px), 820px)",
        borderRadius: 30,
        showDesktopArrows: false,
        outerPadding: 18,
        actionRight: 14,
        textLeft: 16,
        textRight: 86,
        bottomOffset: 24,
        topOffset: 8,
        titleSize: 24,
        captionSize: 15,
        topHeaderPad: 14,
      };
    }

    return {
      stageWidth: isNotebookWidth ? "min(46vw, 520px)" : "min(34vw, 540px)",
      stageHeight: "min(90dvh, 980px)",
      borderRadius: 32,
      showDesktopArrows: true,
      outerPadding: isNotebookWidth ? 20 : 24,
      actionRight: 12,
      textLeft: 18,
      textRight: 82,
      bottomOffset: 18,
      topOffset: 8,
      titleSize: 22,
      captionSize: 14,
      topHeaderPad: 12,
    };
  }, [
    isNotebookWidth,
    isShortViewport,
    isTabletWide,
    isTinyPhone,
    viewportType,
  ]);

  const activeReel = useMemo(() => {
    return reels.find((reel) => reel.id === activeReelId) || reels[0];
  }, [reels, activeReelId]);

  const commentReelId = lockedCommentReelId || activeReelId;

  const commentReel = useMemo(() => {
    return reels.find((reel) => reel.id === commentReelId) || activeReel;
  }, [reels, commentReelId, activeReel]);

  const activeComments = useMemo(() => {
    return comments.filter(
      (comment) => comment.reelId === commentReelId && !comment.parentCommentId,
    );
  }, [comments, commentReelId]);

  const getVisibleRepliesForComment = (commentId: string) => {
    return comments.filter(
      (comment) =>
        comment.reelId === commentReelId &&
        comment.parentCommentId === commentId,
    );
  };

  const openCommentsForReel = (reelId: string) => {
    setDetailsReelId("");
    setActiveReelId(reelId);
    setLockedCommentReelId(reelId);
    setCommentsOpen(true);
    setReplyingToCommentId(null);
    setReplyDraft("");

    const video = videoRefs.current[reelId];
    if (video) {
      video.pause();
    }
  };

  const closeComments = () => {
    const resumeReelId = lockedCommentReelId || activeReelId;

    setCommentsOpen(false);
    setLockedCommentReelId("");
    setCommentDraft("");
    setReplyingToCommentId(null);
    setReplyDraft("");
    setEditingCommentId(null);
    setEditingCommentDraft("");

    window.setTimeout(() => {
      const container = scrollContainerRef.current;

      if (container && resumeReelId) {
        const target = container.querySelector<HTMLElement>(
          `[data-reel-id="${resumeReelId}"]`,
        );

        if (target) {
          const previousScrollBehavior = container.style.scrollBehavior;
          container.style.scrollBehavior = "auto";
          target.scrollIntoView({ behavior: "auto", block: "start" });
          container.style.scrollBehavior = previousScrollBehavior || "";
          setActiveReelId(resumeReelId);
        }
      }

      const video = videoRefs.current[resumeReelId];
      if (video) {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
      }
    }, 80);
  };

  const openDetailsForReel = (reelId: string) => {
    setCommentsOpen(false);
    setLockedCommentReelId("");
    setDetailsReelId(reelId);
    setActiveReelId(reelId);

    const video = videoRefs.current[reelId];
    if (video) {
      video.pause();
    }
  };

  const closeDetails = () => {
    const resumeReelId = detailsReelId;
    setDetailsReelId("");

    window.setTimeout(() => {
      const video = videoRefs.current[resumeReelId];
      if (video) {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
      }
    }, 80);
  };

  const scrollToReel = (
    reelId: string,
    behavior: ScrollBehavior = "smooth",
  ) => {
    if (commentsOpen || detailsOpen) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const target = container.querySelector<HTMLElement>(
      `[data-reel-id="${reelId}"]`,
    );
    if (!target) return;

    target.scrollIntoView({ behavior, block: "start" });
    setActiveReelId(reelId);
  };

  const scrollToAdjacentReel = (direction: "prev" | "next") => {
    if (commentsOpen || detailsOpen) return;

    const currentIndex = reels.findIndex((reel) => reel.id === activeReelId);
    if (currentIndex === -1) return;

    const nextIndex =
      direction === "prev" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= reels.length) return;

    scrollToReel(reels[nextIndex].id);
  };

  const updateActiveFromScroll = () => {
    if (commentsOpen || detailsOpen) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const containerTop = container.getBoundingClientRect().top;
    let closestId = activeReelId;
    let closestDistance = Number.POSITIVE_INFINITY;

    const sections = Array.from(
      container.querySelectorAll<HTMLElement>("[data-reel-id]"),
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
          : item,
      ),
    );

    if (nextLiked) {
      triggerHeartBurst(reelId);

      const { error: likeInsertError } = await supabase
        .from("reel_likes")
        .insert([
          {
            reel_id: reelId,
            user_id: currentUserId,
          },
        ]);

      if (
        likeInsertError &&
        !likeInsertError.message.toLowerCase().includes("duplicate")
      ) {
        console.error(
          "Profile reel like insert error:",
          likeInsertError.message,
        );
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
        console.error(
          "Profile reel like delete error:",
          likeDeleteError.message,
        );
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

  const handleFollowToggle = async () => {
    if (
      !currentUserId ||
      !effectiveProfileId ||
      currentUserId === effectiveProfileId
    )
      return;

    const isFollowing = !!followingMap[effectiveProfileId];
    if (isFollowing) {
      const { error } = await supabase
        .from("followers")
        .delete()
        .eq("follower_id", currentUserId)
        .eq("following_id", effectiveProfileId);

      if (error) {
        alert(`Unfollow error: ${error.message}`);
        return;
      }

      setFollowingMap({});
      return;
    }

    const { error } = await supabase
      .from("followers")
      .insert([
        { follower_id: currentUserId, following_id: effectiveProfileId },
      ]);

    if (error) {
      alert(`Follow error: ${error.message}`);
      return;
    }

    setFollowingMap({ [effectiveProfileId]: true });
  };

  const handleShareLink = async (reelId: string) => {
    const reelUrl = `${window.location.origin}/profile/${effectiveProfileId}/reels/view?reelId=${reelId}`;

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

  const openShareForReel = (reelId: string) => {
    setDetailsReelId("");
    setCommentsOpen(false);
    setLockedCommentReelId("");
    setActiveReelId(reelId);
    setShareOpen(true);

    const video = videoRefs.current[reelId];
    if (video) {
      video.pause();
    }
  };

  const closeShareModal = () => {
    const resumeReelId = activeReelId;
    setShareOpen(false);

    window.setTimeout(() => {
      if (commentsOpen || detailsOpen || !resumeReelId) return;

      const video = videoRefs.current[resumeReelId];
      if (video) {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
      }
    }, 80);
  };

  const handleAddComment = async () => {
    const trimmed = commentDraft.trim();
    const targetReel = commentReel;
    if (!trimmed || !targetReel) return;

    if (!currentUserId) {
      alert("You must be logged in to comment on reels.");
      return;
    }

    const optimisticCommentId = `comment-${Date.now()}`;

    const nextComment: ReelComment = {
      id: optimisticCommentId,
      reelId: targetReel.id,
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
        reel.id === targetReel.id
          ? { ...reel, comments: reel.comments + 1 }
          : reel,
      ),
    );
    setCommentDraft("");
    setReplyingToCommentId(null);
    setReplyDraft("");

    const { data: insertedComment, error: commentInsertError } = await supabase
      .from("reel_comments")
      .insert([
        {
          reel_id: targetReel.id,
          user_id: currentUserId,
          content: trimmed,
          parent_comment_id: null,
          reply_to_author: null,
        },
      ])
      .select("id")
      .single();

    if (commentInsertError) {
      console.error(
        "Profile reel comment insert error:",
        commentInsertError.message,
      );
      alert(commentInsertError.message || "Could not save reel comment.");
      await fetchReels();
      return;
    }

    if (insertedComment?.id) {
      setComments((prev) =>
        prev.map((comment) =>
          comment.id === optimisticCommentId
            ? { ...comment, id: insertedComment.id }
            : comment,
        ),
      );
    }

    await insertReelNotification({
      userId: targetReel.creator_profile_id || targetReel.user_id,
      actorId: currentUserId,
      reelId: targetReel.id,
      type: "reel_comment",
      message: "commented on your reel.",
    });

    setLockedCommentReelId(targetReel.id);
    setCommentsOpen(true);
  };

  const handleStartCommentReply = (comment: ReelComment) => {
    if (!currentUserId) {
      alert("You must be logged in to reply to comments.");
      return;
    }

    setEditingCommentId(null);
    setEditingCommentDraft("");
    setReplyingToCommentId(comment.id);
    setReplyDraft("");
  };

  const handleCancelCommentReply = () => {
    setReplyingToCommentId(null);
    setReplyDraft("");
  };

  const handleSubmitCommentReply = async (parentComment: ReelComment) => {
    const trimmed = replyDraft.trim();
    const targetReel = commentReel;

    if (!trimmed || !targetReel) return;

    if (!currentUserId) {
      alert("You must be logged in to reply to comments.");
      return;
    }

    const optimisticReplyId = `reply-${Date.now()}`;

    const nextReply: ReelComment = {
      id: optimisticReplyId,
      reelId: targetReel.id,
      authorUserId: currentUserId,
      author: "@you",
      text: trimmed,
      time: "Just now",
      parentCommentId: parentComment.id,
      replyToAuthor: parentComment.author,
    };

    setComments((prev) => [nextReply, ...prev]);
    setReels((prev) =>
      prev.map((reel) =>
        reel.id === targetReel.id ? { ...reel, comments: reel.comments + 1 } : reel,
      ),
    );
    setReplyDraft("");
    setReplyingToCommentId(null);

    const { data: insertedReply, error: replyInsertError } = await supabase
      .from("reel_comments")
      .insert([
        {
          reel_id: targetReel.id,
          user_id: currentUserId,
          content: trimmed,
          parent_comment_id: parentComment.id,
          reply_to_author: parentComment.author,
        },
      ])
      .select("id")
      .single();

    if (replyInsertError) {
      console.error("Profile reel reply insert error:", replyInsertError.message);
      alert(replyInsertError.message || "Could not save reel reply.");
      await fetchReels();
      return;
    }

    if (insertedReply?.id) {
      setComments((prev) =>
        prev.map((comment) =>
          comment.id === optimisticReplyId ? { ...comment, id: insertedReply.id } : comment,
        ),
      );
    }

    const parentCommentAuthorId = parentComment.authorUserId;
    const targetReelOwnerId = targetReel.creator_profile_id || targetReel.user_id;

    // Notify the member whose comment received the reply.
    if (parentCommentAuthorId && parentCommentAuthorId !== currentUserId) {
      await insertReelNotification({
        userId: parentCommentAuthorId,
        actorId: currentUserId,
        reelId: targetReel.id,
        type: "reel_reply",
        message: "replied to your comment on a Reel.",
        commentId: parentComment.id,
      });
    }

    // Also notify the Reel owner when they are a different person.
    // This avoids duplicate notifications when the owner wrote the parent comment.
    if (
      targetReelOwnerId &&
      targetReelOwnerId !== currentUserId &&
      targetReelOwnerId !== parentCommentAuthorId
    ) {
      await insertReelNotification({
        userId: targetReelOwnerId,
        actorId: currentUserId,
        reelId: targetReel.id,
        type: "reel_comment",
        message: "replied to a comment on your reel.",
        commentId: parentComment.id,
      });
    }
  };

  const handleCommentLikeToggle = async (
    commentId: string,
    forceLike = false,
  ) => {
    if (!currentUserId) {
      alert("You must be logged in to like comments.");
      return;
    }

    const currentLiked = !!commentLikedMap[commentId];
    const nextLiked = forceLike ? true : !currentLiked;

    if (forceLike && currentLiked) return;

    setCommentLikedMap((prev) => ({ ...prev, [commentId]: nextLiked }));
    setCommentLikeMap((prev) => ({
      ...prev,
      [commentId]: Math.max((prev[commentId] || 0) + (nextLiked ? 1 : -1), 0),
    }));

    if (nextLiked) {
      const { error } = await supabase.from("reel_comment_likes").insert([
        {
          comment_id: commentId,
          user_id: currentUserId,
        },
      ]);

      if (error && !error.message.toLowerCase().includes("duplicate")) {
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
      alert(error.message || "Could not remove comment like.");
      await fetchReels();
    }
  };

  const handleStartEditComment = (comment: ReelComment) => {
    if (!currentUserId || comment.authorUserId !== currentUserId) {
      alert("You can only edit your own comments.");
      return;
    }

    setReplyingToCommentId(null);
    setReplyDraft("");
    setEditingCommentId(comment.id);
    setEditingCommentDraft(comment.text);
  };

  const handleCancelEditComment = () => {
    setEditingCommentId(null);
    setEditingCommentDraft("");
  };

  const handleSaveEditedComment = async (commentId: string) => {
    if (!currentUserId) {
      alert("You must be logged in to edit comments.");
      return;
    }

    const trimmed = editingCommentDraft.trim();
    if (!trimmed) {
      alert("Comment cannot be empty.");
      return;
    }

    const comment = comments.find((item) => item.id === commentId);
    if (!comment || comment.authorUserId !== currentUserId) {
      alert("You can only edit your own comments.");
      return;
    }

    const previousText = comment.text;

    setComments((prev) =>
      prev.map((item) =>
        item.id === commentId
          ? { ...item, text: trimmed, time: "Just now" }
          : item,
      ),
    );
    setEditingCommentId(null);
    setEditingCommentDraft("");

    const { error } = await supabase
      .from("reel_comments")
      .update({ content: trimmed })
      .eq("id", commentId)
      .eq("user_id", currentUserId);

    if (error) {
      setComments((prev) =>
        prev.map((item) =>
          item.id === commentId ? { ...item, text: previousText } : item,
        ),
      );
      alert(error.message || "Could not edit comment.");
      await fetchReels();
    }
  };

  const handleDeleteComment = async (commentId: string) => {
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
          reel.creator_profile_id === currentUserId),
      );

    if (!canDeleteComment) {
      alert("You can only delete your own comments.");
      return;
    }

    const confirmDelete = window.confirm("Delete this comment?");
    if (!confirmDelete) return;

    const deletedCommentIds = comments
      .filter(
        (item) => item.id === commentId || item.parentCommentId === commentId,
      )
      .map((item) => item.id);

    const { error } = await supabase
      .from("reel_comments")
      .delete()
      .eq("id", commentId);

    if (error) {
      alert(error.message || "Could not delete comment.");
      await fetchReels();
      return;
    }

    setComments((prev) =>
      prev.filter(
        (item) => item.id !== commentId && item.parentCommentId !== commentId,
      ),
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
          ? {
              ...item,
              comments: Math.max(item.comments - deletedCommentIds.length, 0),
            }
          : item,
      ),
    );

    if (deletedCommentIds.includes(editingCommentId || "")) {
      handleCancelEditComment();
    }
  };

  const handleReportComment = async (commentId: string) => {
    if (!currentUserId) {
      alert("You must be logged in to report comments.");
      return;
    }

    const comment = comments.find((item) => item.id === commentId);

    if (!comment) return;

    if (comment.authorUserId === currentUserId) {
      alert("You cannot report your own comment from here.");
      return;
    }

    const reason = window.prompt(
      "Report this Reel comment to Parapost moderation. Please add a short reason:",
      "",
    );

    const trimmedReason = (reason || "").trim();

    if (!trimmedReason) return;

    const { error } = await supabase.from("reports").insert({
      reporter_id: currentUserId,
      reported_user_id: comment.authorUserId || null,
      target_type: "comment",
      target_id: comment.id,
      reason: trimmedReason.slice(0, 160),
      details: trimmedReason.length > 160 ? trimmedReason : null,
      status: "open",
    });

    if (error) {
      alert(`Could not report this comment: ${error.message}`);
      return;
    }

    alert("Thanks. This Reel comment has been sent to Parapost moderation.");
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
      console.error("Profile reel share insert error:", shareInsertError.message);
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
      console.warn("Profile reel share count update skipped:", reelUpdateError.message);
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

    if (isReelOwner(reel, currentUserId, effectiveProfileId)) {
      alert("You cannot report your own Reel from here.");
      return;
    }

    const reason = window.prompt(
      "Report this Reel to Parapost moderation. Please add a short reason:",
      "",
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

  const openOwnerReelMenuAtPoint = (
    clientX: number,
    clientY: number,
    reel: ReelItem,
  ) => {
    if (!currentUserId) {
      setReelMenu(null);
      return;
    }

    const menuWidth = 208;
    const menuHeight = 124;
    const isMobileMenu = window.innerWidth <= 767;

    const x = isMobileMenu
      ? clamp(
          window.innerWidth / 2 - menuWidth / 2,
          12,
          window.innerWidth - menuWidth - 12,
        )
      : clamp(clientX - menuWidth + 42, 12, window.innerWidth - menuWidth - 12);

    const y = isMobileMenu
      ? clamp(
          window.innerHeight - menuHeight - 88,
          70,
          window.innerHeight - menuHeight - 12,
        )
      : clamp(clientY + 10, 12, window.innerHeight - menuHeight - 12);

    setReelMenu({
      reelId: reel.id,
      x,
      y,
    });
  };

  const handleOpenReelMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    reel: ReelItem,
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
    reel: ReelItem,
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
      reel,
    );
  };

  const handleStartEditReel = (reel: ReelItem) => {
    setEditingReelId(reel.id);
    setEditTitle(reel.title);
    setEditCaption(reel.caption.slice(0, REEL_CAPTION_MAX_LENGTH));
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
          : reel,
      ),
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

    if (activeReelId === reelId) {
      setActiveReelId(nextReels[0]?.id || "");
    }

    setReelMenu(null);
  };

  const creatorName =
    profile?.display_name?.trim() ||
    profile?.full_name?.trim() ||
    profile?.username?.trim() ||
    "Profile";

  const responsiveTopButtonStyle: CSSProperties = {
    ...buttonStyle,
    minHeight: viewportType === "mobile" ? 34 : 40,
    padding:
      viewportType === "mobile"
        ? "7px 10px"
        : viewportType === "tablet"
          ? "9px 13px"
          : buttonStyle.padding,
    fontSize:
      viewportType === "mobile"
        ? "12px"
        : viewportType === "tablet"
          ? "13px"
          : buttonStyle.fontSize,
    whiteSpace: "nowrap",
  };

  const responsiveTopLinkStyle: CSSProperties = {
    ...navLinkStyle,
    minHeight: viewportType === "mobile" ? 34 : 40,
    padding:
      viewportType === "mobile"
        ? "7px 10px"
        : viewportType === "tablet"
          ? "9px 13px"
          : navLinkStyle.padding,
    fontSize:
      viewportType === "mobile"
        ? "12px"
        : viewportType === "tablet"
          ? "13px"
          : navLinkStyle.fontSize,
    whiteSpace: "nowrap",
  };

  return (
    <div
      style={{
        ...pageStyle,
        minHeight: "100dvh",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          ...topBarStyle,
          padding:
            viewportType === "mobile"
              ? "10px 10px 0"
              : viewportType === "tablet"
                ? "14px 16px 0"
                : topBarStyle.padding,
        }}
      >
        <div
          style={{
            ...topBarInnerStyle,
            ...(viewportType === "mobile"
              ? {
                  width: "auto",
                  margin: 0,
                  gap: "8px",
                  flexDirection: "column",
                  flexWrap: "nowrap",
                  alignItems: "flex-start",
                  justifyContent: "flex-start",
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
                : {
                    gap: "12px",
                    alignItems: topBarInnerStyle.alignItems,
                  }),
          }}
        >
          <div
            style={{
              paddingTop: `${stageMetrics.topHeaderPad}px`,
              ...(viewportType === "mobile" || viewportType === "tablet"
                ? {
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    minHeight: viewportType === "mobile" ? "30px" : "34px",
                  }
                : {}),
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize:
                  viewportType === "mobile"
                    ? isTinyPhone
                      ? "18px"
                      : "20px"
                    : "26px",
                lineHeight: 1.05,
                textShadow: "0 2px 12px rgba(0,0,0,0.45)",
              }}
            >
              {creatorName} Reels
            </h1>
          </div>

          <div
            style={{
              display: "flex",
              gap:
                viewportType === "mobile"
                  ? "7px"
                  : viewportType === "tablet"
                    ? "8px"
                    : "10px",
              flexWrap:
                viewportType === "mobile" || viewportType === "tablet"
                  ? "nowrap"
                  : "wrap",
              justifyContent:
                viewportType === "mobile" || viewportType === "tablet"
                  ? "flex-start"
                  : "flex-start",
              alignItems: "center",
              width:
                viewportType === "mobile" || viewportType === "tablet"
                  ? "100%"
                  : undefined,
              minWidth: 0,
              paddingTop:
                viewportType === "mobile" || viewportType === "tablet"
                  ? 0
                  : `${stageMetrics.topHeaderPad}px`,
            }}
          >
            <button
              onClick={() => setMuteAll((prev) => !prev)}
              style={responsiveTopButtonStyle}
            >
              {muteAll ? "Unmute" : "Mute"}
            </button>

            <Link
              href={`/profile/${effectiveProfileId}/reels`}
              style={responsiveTopLinkStyle}
            >
              {viewportType === "mobile" ? "Grid" : "Back to Grid"}
            </Link>

            <Link
              href={`/profile/${effectiveProfileId}`}
              style={responsiveTopLinkStyle}
            >
              {viewportType === "mobile" ? "Profile" : "Back to Profile"}
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
            disabled={commentsOpen || detailsOpen}
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)",
              color: "white",
              cursor: commentsOpen || detailsOpen ? "not-allowed" : "pointer",
              opacity: commentsOpen || detailsOpen ? 0.45 : 1,
              fontSize: "22px",
              backdropFilter: "blur(12px)",
            }}
            aria-label="Previous reel"
          >
            ↑
          </button>

          <button
            onClick={() => scrollToAdjacentReel("next")}
            disabled={commentsOpen || detailsOpen}
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)",
              color: "white",
              cursor: commentsOpen || detailsOpen ? "not-allowed" : "pointer",
              opacity: commentsOpen || detailsOpen ? 0.45 : 1,
              fontSize: "22px",
              backdropFilter: "blur(12px)",
            }}
            aria-label="Next reel"
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
            <div
              style={{
                fontSize: "28px",
                fontWeight: 900,
                marginBottom: "10px",
              }}
            >
              Loading reels...
            </div>
            <div style={{ color: "#9ca3af", fontSize: "15px" }}>
              Pulling this profile&apos;s reel uploads from the database.
            </div>
          </div>
        </div>
      ) : pageErrorMessage ? (
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
            <div
              style={{
                fontSize: "32px",
                fontWeight: 900,
                marginBottom: "10px",
              }}
            >
              Profile unavailable
            </div>
            <div
              style={{
                color: "#d1d5db",
                lineHeight: 1.7,
                fontSize: "15px",
                marginBottom: "18px",
              }}
            >
              {pageErrorMessage}
            </div>
            <Link href="/dashboard" style={primaryButtonStyle}>
              Back to Dashboard
            </Link>
          </div>
        </div>
      ) : !canViewProfileContent ? (
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
              maxWidth: "560px",
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              borderRadius: "28px",
              padding: "30px",
              boxShadow: "0 16px 36px rgba(0,0,0,0.28)",
            }}
          >
            <div
              style={{
                width: "62px",
                height: "62px",
                borderRadius: "999px",
                display: "grid",
                placeItems: "center",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                margin: "0 auto 16px",
                fontSize: "24px",
              }}
            >
              🔒
            </div>
            <div
              style={{
                fontSize: "32px",
                fontWeight: 900,
                marginBottom: "10px",
              }}
            >
              This user&apos;s profile is private.
            </div>
            <div
              style={{
                color: "#d1d5db",
                lineHeight: 1.7,
                fontSize: "15px",
                marginBottom: "18px",
              }}
            >
              You can still view this profile&apos;s basic information, but
              direct Reels are hidden unless you are connected.
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <Link
                href={`/profile/${effectiveProfileId}`}
                style={primaryButtonStyle}
              >
                View Profile
              </Link>
              <Link href="/dashboard" style={navLinkStyle}>
                Back to Dashboard
              </Link>
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
            <div
              style={{
                fontSize: "32px",
                fontWeight: 900,
                marginBottom: "10px",
              }}
            >
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
              This profile does not have any reels to show yet.
            </div>
            <Link
              href={`/profile/${effectiveProfileId}`}
              style={primaryButtonStyle}
            >
              Back to Profile
            </Link>
          </div>
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          style={{
            ...scrollContainerStyle,
            overflowY: commentsOpen || detailsOpen ? "hidden" : "auto",
            scrollBehavior: commentsOpen || detailsOpen ? "auto" : "smooth",
            overscrollBehavior: "contain",
            background: "#07090d",
            scrollSnapType: "y mandatory",
          }}
          onScroll={
            commentsOpen || detailsOpen ? undefined : updateActiveFromScroll
          }
        >
          {reels.map((reel) => {
            const isLiked = !!likedMap[reel.id];
            const isOwner = isReelOwner(
              reel,
              currentUserId,
              effectiveProfileId,
            );
            const isFollowingCreator = !!followingMap[effectiveProfileId];
            const displayedLikes = reel.likes;
            const displayedComments = comments.filter(
              (comment) => comment.reelId === reel.id,
            ).length;
            const displayedShares = reel.shares + (shareBoostMap[reel.id] || 0);
            const progress = progressMap[reel.id] || 0;
            const hasLongCaption = reel.caption.length > 140;
            const isActiveCommentsReel =
              commentsOpen && commentReelId === reel.id;
            const isActiveDetailsReel = detailsReelId === reel.id;
            const isDimmedReel = isActiveCommentsReel || isActiveDetailsReel;

            return (
              <section
                key={reel.id}
                data-reel-id={reel.id}
                id={reel.id}
                style={{
                  ...sectionStyle,
                  padding:
                    viewportType === "mobile"
                      ? `0px ${stageMetrics.outerPadding}px ${stageMetrics.outerPadding}px`
                      : viewportType === "tablet"
                        ? `126px ${stageMetrics.outerPadding}px ${stageMetrics.outerPadding}px`
                        : `${stageMetrics.topOffset}px ${stageMetrics.outerPadding}px ${stageMetrics.outerPadding}px`,
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: stageMetrics.stageWidth,
                    height: stageMetrics.stageHeight,
                    maxWidth: "100%",
                    overflow: "hidden",
                    borderRadius: stageMetrics.borderRadius,
                    background: "#000",
                    boxShadow:
                      viewportType === "mobile"
                        ? "none"
                        : "0 16px 44px rgba(0,0,0,0.46)",
                    transform: isDimmedReel ? "scale(0.985)" : "scale(1)",
                    filter: isDimmedReel ? "brightness(0.78)" : "brightness(1)",
                    transition: "transform 220ms ease, filter 220ms ease",
                  }}
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
                      cursor:
                        commentsOpen || detailsOpen ? "default" : "pointer",
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
                      onLoadedMetadata={(event) => {
                        const video = event.currentTarget;
                        const isLandscape =
                          video.videoWidth > video.videoHeight;
                        setVideoFitMap((prev) => ({
                          ...prev,
                          [reel.id]: isLandscape ? "contain" : "cover",
                        }));
                      }}
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
                      onEnded={(event) => {
                        event.currentTarget.currentTime = 0;
                        const playPromise = event.currentTarget.play();
                        if (
                          playPromise &&
                          typeof playPromise.catch === "function"
                        ) {
                          playPromise.catch(() => {});
                        }
                      }}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: videoFitMap[reel.id] || "cover",
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
                          animation:
                            "parapostPlayPausePop 420ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
                          willChange: "transform, opacity",
                        }}
                      >
                        {playPauseFeedback.mode === "play" ? (
                          <span
                            style={{
                              display: "block",
                              transform: "translateX(2px)",
                            }}
                          >
                            ▶
                          </span>
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
                                width:
                                  viewportType === "mobile" ? "5px" : "6px",
                                height:
                                  viewportType === "mobile" ? "22px" : "26px",
                                borderRadius: "999px",
                                background: "currentColor",
                                display: "block",
                              }}
                            />
                            <span
                              style={{
                                width:
                                  viewportType === "mobile" ? "5px" : "6px",
                                height:
                                  viewportType === "mobile" ? "22px" : "26px",
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
                        onPointerDown={(event) =>
                          handleOpenReelMenuPointer(event, reel)
                        }
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
                        aria-label={
                          isOwner ? "Open Reel owner menu" : "Open Reel options"
                        }
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
                      gap: "10px",
                      alignItems: "center",
                      opacity: isDimmedReel ? 0.12 : 1,
                      pointerEvents: isDimmedReel ? "none" : "auto",
                      transition: "opacity 180ms ease",
                    }}
                  >
                    {[
                      {
                        symbol: isLiked ? "♥" : "♡",
                        label: formatCompactCount(displayedLikes),
                        ariaLabel: isLiked ? "Unlike reel" : "Like reel",
                        action: () => handleLikeToggle(reel.id),
                      },
                      {
                        symbol: "💬",
                        label: formatCompactCount(displayedComments),
                        ariaLabel: "Open reel comments",
                        action: () => {
                          openCommentsForReel(reel.id);
                        },
                      },
                      {
                        symbol: "↗",
                        label: formatCompactCount(displayedShares),
                        ariaLabel: "Share reel to feed",
                        action: () => {
                          openShareForReel(reel.id);
                        },
                      },
                      {
                        symbol: "🔗",
                        label: "Link",
                        ariaLabel: "Copy reel link",
                        action: () => handleShareLink(reel.id),
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
                          type="button"
                          onClick={item.action}
                          aria-label={item.ariaLabel}
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
                            fontSize:
                              viewportType === "mobile" ? "18px" : "19px",
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

                    {currentUserId && viewportType === "mobile" ? (
                      <div
                        style={{
                          display: "grid",
                          justifyItems: "center",
                          gap: "5px",
                        }}
                      >
                        <button
                          type="button"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                          }}
                          onTouchStart={(event) => {
                            event.stopPropagation();
                          }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setActiveReelId(reel.id);
                            openOwnerReelMenuAtPoint(
                              window.innerWidth - 64,
                              window.innerHeight - 180,
                              reel,
                            );
                          }}
                          style={{
                            width: "48px",
                            height: "48px",
                            borderRadius: "50%",
                            border: "1px solid rgba(216,180,254,0.32)",
                            background: "rgba(88,28,135,0.48)",
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            fontSize: "18px",
                            fontWeight: 900,
                            backdropFilter: "blur(12px)",
                            boxShadow: "0 8px 18px rgba(0,0,0,0.38)",
                            WebkitTapHighlightColor: "transparent",
                          }}
                          aria-label={
                            isOwner ? "Manage your Reel" : "Report this Reel"
                          }
                        >
                          {isOwner ? "⚙" : "⋯"}
                        </button>

                        <div
                          style={{
                            fontSize: "11px",
                            fontWeight: 800,
                            color: "#f3e8ff",
                            textAlign: "center",
                            maxWidth: "64px",
                            lineHeight: 1.1,
                            textShadow: "0 2px 10px rgba(0,0,0,0.45)",
                          }}
                        >
                          {isOwner ? "Manage" : "Report"}
                        </div>
                      </div>
                    ) : null}
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
                      opacity: isDimmedReel ? 0.1 : 1,
                      pointerEvents: isDimmedReel ? "none" : "auto",
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
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
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
                          onClick={handleFollowToggle}
                          style={
                            isFollowingCreator
                              ? buttonStyle
                              : primaryButtonStyle
                          }
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

                    {reel.caption ? (
                      <div
                        style={{
                          margin: 0,
                          color: "#f3f4f6",
                          lineHeight: 1.45,
                          maxWidth: "100%",
                          fontSize: `${stageMetrics.captionSize}px`,
                          textShadow: "0 2px 10px rgba(0,0,0,0.45)",
                        }}
                      >
                        <span
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: viewportType === "mobile" ? 2 : 3,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {reel.caption}
                        </span>
                        {hasLongCaption && (
                          <button
                            onClick={() => openDetailsForReel(reel.id)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "white",
                              fontWeight: 900,
                              cursor: "pointer",
                              padding: "4px 0 0",
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
                </div>
              </section>
            );
          })}
        </div>
      )}

      {reelMenu &&
        (() => {
          const menuReel = reels.find((item) => item.id === reelMenu.reelId);

          if (!menuReel || !currentUserId) {
            return null;
          }

          const menuReelIsOwner = isReelOwner(
            menuReel,
            currentUserId,
            effectiveProfileId,
          );

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
                    <div
                      style={{ color: "#fff", fontWeight: 950, fontSize: 15 }}
                    >
                      Reel options
                    </div>
                    <div
                      style={{ color: "#9ca3af", fontSize: 12, marginTop: 3 }}
                    >
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

      {commentsOpen && commentReel && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "relative",
              width: stageMetrics.stageWidth,
              height: stageMetrics.stageHeight,
              maxWidth: "100%",
              borderRadius: stageMetrics.borderRadius,
              overflow: "hidden",
              pointerEvents: "auto",
            }}
          >
            <button
              type="button"
              onClick={closeComments}
              aria-label="Close comments"
              style={{
                position: "absolute",
                inset: 0,
                border: "none",
                padding: 0,
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.00) 0%, rgba(0,0,0,0.06) 38%, rgba(0,0,0,0.30) 72%, rgba(0,0,0,0.52) 100%)",
                cursor: "default",
              }}
            />

            <div
              role="dialog"
              aria-label="Reel comments"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height:
                  viewportType === "mobile"
                    ? isShortViewport
                      ? "58%"
                      : "52%"
                    : viewportType === "tablet"
                      ? "56%"
                      : "52%",
                minHeight:
                  viewportType === "mobile"
                    ? isShortViewport
                      ? "250px"
                      : "275px"
                    : "280px",
                maxHeight:
                  viewportType === "mobile"
                    ? "64%"
                    : viewportType === "tablet"
                      ? "60%"
                      : "56%",
                borderTopLeftRadius: "24px",
                borderTopRightRadius: "24px",
                background:
                  "linear-gradient(180deg, rgba(20,20,24,0.985) 0%, rgba(11,11,14,0.99) 100%)",
                borderTop: "1px solid rgba(255,255,255,0.09)",
                boxShadow: "0 -12px 32px rgba(0,0,0,0.42)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                backdropFilter: "blur(16px)",
              }}
            >
              <div
                style={{
                  padding: "10px 14px 12px",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: "34px",
                    height: "4px",
                    borderRadius: "999px",
                    background: "rgba(255,255,255,0.26)",
                    margin: "0 auto 10px",
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "12px",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: "16px", fontWeight: 850 }}>
                      Comments
                    </div>
                    <div
                      style={{
                        marginTop: "4px",
                        fontSize: "12px",
                        color: "rgba(255,255,255,0.62)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {activeComments.length} comment
                      {activeComments.length === 1 ? "" : "s"} ·{" "}
                      {commentReel.title}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={closeComments}
                    aria-label="Close comments"
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "999px",
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.065)",
                      color: "#ffffff",
                      cursor: "pointer",
                      fontSize: "17px",
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  overscrollBehavior: "contain",
                  WebkitOverflowScrolling: "touch",
                  touchAction: "pan-y",
                  padding: viewportType === "mobile" ? "10px" : "12px",
                  display: "grid",
                  alignContent: "start",
                  gap: "10px",
                }}
              >
                {activeComments.length === 0 ? (
                  <div
                    style={{
                      border: "1px dashed rgba(255,255,255,0.12)",
                      borderRadius: "18px",
                      padding: "16px",
                      color: "#9ca3af",
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    No comments yet. Start the conversation.
                  </div>
                ) : (
                  activeComments.map((comment) => {
                    const commentLiked = !!commentLikedMap[comment.id];
                    const commentLikeCount = commentLikeMap[comment.id] || 0;
                    const canDeleteComment =
                      comment.authorUserId === currentUserId ||
                      commentReel.user_id === currentUserId ||
                      commentReel.creator_profile_id === currentUserId;
                    const replies = getVisibleRepliesForComment(comment.id);

                    return (
                      <div
                        key={comment.id}
                        style={{
                          background: "rgba(255,255,255,0.045)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "18px",
                          padding: "12px 13px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "10px",
                            marginBottom: "7px",
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: "14px" }}>
                            {comment.author}
                          </div>
                          <div style={{ fontSize: "12px", color: "#9ca3af" }}>
                            {comment.time}
                          </div>
                        </div>

                        {editingCommentId === comment.id ? (
                          <div
                            style={{
                              display: "grid",
                              gap: "8px",
                              marginBottom: "10px",
                            }}
                          >
                            <textarea
                              value={editingCommentDraft}
                              onChange={(event) =>
                                setEditingCommentDraft(event.target.value)
                              }
                              rows={2}
                              style={{
                                ...textAreaStyle,
                                minHeight: "64px",
                                maxHeight: "110px",
                                borderRadius: "16px",
                                padding: "11px 12px",
                                fontSize: "14px",
                              }}
                            />

                            <div
                              style={{
                                display: "flex",
                                justifyContent: "flex-end",
                                gap: "8px",
                              }}
                            >
                              <button
                                type="button"
                                onClick={handleCancelEditComment}
                                style={{
                                  ...buttonStyle,
                                  padding: "8px 12px",
                                  fontSize: "12px",
                                }}
                              >
                                Cancel
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleSaveEditedComment(comment.id)
                                }
                                disabled={!editingCommentDraft.trim()}
                                style={{
                                  ...primaryButtonStyle,
                                  padding: "8px 12px",
                                  fontSize: "12px",
                                  opacity: editingCommentDraft.trim()
                                    ? 1
                                    : 0.45,
                                  cursor: editingCommentDraft.trim()
                                    ? "pointer"
                                    : "not-allowed",
                                }}
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            style={{
                              color: "#e5e7eb",
                              lineHeight: 1.55,
                              fontSize: "14px",
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                              marginBottom: "10px",
                            }}
                          >
                            {comment.text}
                          </div>
                        )}

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "13px",
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => handleCommentLikeToggle(comment.id)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: commentLiked ? "#ffffff" : "#aeb3bd",
                              fontSize: "12px",
                              fontWeight: 850,
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            {commentLiked ? "Liked" : "Like"}
                            {commentLikeCount > 0
                              ? ` · ${commentLikeCount}`
                              : ""}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStartCommentReply(comment)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#aeb3bd",
                              fontSize: "12px",
                              fontWeight: 850,
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            Reply
                          </button>

                          {comment.authorUserId === currentUserId ? (
                            <button
                              type="button"
                              onClick={() => handleStartEditComment(comment)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#c4b5fd",
                                fontSize: "12px",
                                fontWeight: 850,
                                cursor: "pointer",
                                padding: 0,
                              }}
                            >
                              Edit
                            </button>
                          ) : null}

                          {canDeleteComment ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(comment.id)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#fca5a5",
                                fontSize: "12px",
                                fontWeight: 850,
                                cursor: "pointer",
                                padding: 0,
                              }}
                            >
                              Delete
                            </button>
                          ) : null}

                          {currentUserId &&
                          comment.authorUserId !== currentUserId ? (
                            <button
                              type="button"
                              onClick={() => handleReportComment(comment.id)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#fca5a5",
                                fontSize: "12px",
                                fontWeight: 850,
                                cursor: "pointer",
                                padding: 0,
                              }}
                            >
                              Report
                            </button>
                          ) : null}
                        </div>

                        {replyingToCommentId === comment.id ? (
                          <div
                            style={{
                              display: "grid",
                              gap: "8px",
                              marginTop: "11px",
                            }}
                          >
                            <textarea
                              value={replyDraft}
                              onChange={(event) => setReplyDraft(event.target.value)}
                              placeholder="Write a reply..."
                              rows={2}
                              style={{
                                ...textAreaStyle,
                                minHeight: "64px",
                                maxHeight: "100px",
                                borderRadius: "16px",
                                padding: "11px 12px",
                                fontSize: "14px",
                              }}
                            />

                            <div
                              style={{
                                display: "flex",
                                justifyContent: "flex-end",
                                gap: "8px",
                              }}
                            >
                              <button
                                type="button"
                                onClick={handleCancelCommentReply}
                                style={{
                                  ...buttonStyle,
                                  padding: "8px 12px",
                                  fontSize: "12px",
                                }}
                              >
                                Cancel
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSubmitCommentReply(comment)}
                                disabled={!replyDraft.trim()}
                                style={{
                                  ...primaryButtonStyle,
                                  padding: "8px 12px",
                                  fontSize: "12px",
                                  opacity: replyDraft.trim() ? 1 : 0.45,
                                  cursor: replyDraft.trim() ? "pointer" : "not-allowed",
                                }}
                              >
                                Reply
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {replies.length > 0 ? (
                          <div
                            style={{
                              marginTop: "11px",
                              marginLeft: "12px",
                              paddingLeft: "12px",
                              borderLeft: "2px solid rgba(168,85,247,0.20)",
                              display: "grid",
                              gap: "8px",
                            }}
                          >
                            {replies.map((reply) => {
                              const replyLiked = !!commentLikedMap[reply.id];
                              const replyLikeCount =
                                commentLikeMap[reply.id] || 0;
                              const canDeleteReply =
                                reply.authorUserId === currentUserId ||
                                commentReel.user_id === currentUserId ||
                                commentReel.creator_profile_id ===
                                  currentUserId;

                              return (
                                <div
                                  key={reply.id}
                                  style={{
                                    background: "rgba(255,255,255,0.028)",
                                    border: "1px solid rgba(255,255,255,0.06)",
                                    borderRadius: "16px",
                                    padding: "10px 11px",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      gap: "10px",
                                      marginBottom: "6px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontWeight: 800,
                                        fontSize: "13px",
                                      }}
                                    >
                                      {reply.author}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        color: "#9ca3af",
                                      }}
                                    >
                                      {reply.time}
                                    </div>
                                  </div>

                                  {reply.replyToAuthor ? (
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        color: "#9ca3af",
                                        fontWeight: 800,
                                        marginBottom: "5px",
                                      }}
                                    >
                                      replying to {reply.replyToAuthor}
                                    </div>
                                  ) : null}

                                  {editingCommentId === reply.id ? (
                                    <div
                                      style={{
                                        display: "grid",
                                        gap: "8px",
                                        marginBottom: "9px",
                                      }}
                                    >
                                      <textarea
                                        value={editingCommentDraft}
                                        onChange={(event) =>
                                          setEditingCommentDraft(
                                            event.target.value,
                                          )
                                        }
                                        rows={2}
                                        style={{
                                          ...textAreaStyle,
                                          minHeight: "60px",
                                          maxHeight: "100px",
                                          borderRadius: "15px",
                                          padding: "10px 11px",
                                          fontSize: "13px",
                                        }}
                                      />

                                      <div
                                        style={{
                                          display: "flex",
                                          justifyContent: "flex-end",
                                          gap: "8px",
                                        }}
                                      >
                                        <button
                                          type="button"
                                          onClick={handleCancelEditComment}
                                          style={{
                                            ...buttonStyle,
                                            padding: "7px 11px",
                                            fontSize: "12px",
                                          }}
                                        >
                                          Cancel
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleSaveEditedComment(reply.id)
                                          }
                                          disabled={!editingCommentDraft.trim()}
                                          style={{
                                            ...primaryButtonStyle,
                                            padding: "7px 11px",
                                            fontSize: "12px",
                                            opacity: editingCommentDraft.trim()
                                              ? 1
                                              : 0.45,
                                            cursor: editingCommentDraft.trim()
                                              ? "pointer"
                                              : "not-allowed",
                                          }}
                                        >
                                          Save
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div
                                      style={{
                                        color: "#d1d5db",
                                        lineHeight: 1.5,
                                        fontSize: "13px",
                                        whiteSpace: "pre-wrap",
                                        overflowWrap: "anywhere",
                                        marginBottom: "9px",
                                      }}
                                    >
                                      {reply.text.replace(/^@\S+\s*/, "")}
                                    </div>
                                  )}

                                  <div
                                    style={{
                                      display: "flex",
                                      gap: "12px",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCommentLikeToggle(reply.id)
                                      }
                                      style={{
                                        background: "transparent",
                                        border: "none",
                                        color: replyLiked
                                          ? "#ffffff"
                                          : "#aeb3bd",
                                        fontSize: "12px",
                                        fontWeight: 850,
                                        cursor: "pointer",
                                        padding: 0,
                                      }}
                                    >
                                      {replyLiked ? "Liked" : "Like"}
                                      {replyLikeCount > 0
                                        ? ` · ${replyLikeCount}`
                                        : ""}
                                    </button>

                                    {reply.authorUserId === currentUserId ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleStartEditComment(reply)
                                        }
                                        style={{
                                          background: "transparent",
                                          border: "none",
                                          color: "#c4b5fd",
                                          fontSize: "12px",
                                          fontWeight: 850,
                                          cursor: "pointer",
                                          padding: 0,
                                        }}
                                      >
                                        Edit
                                      </button>
                                    ) : null}

                                    {canDeleteReply ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleDeleteComment(reply.id)
                                        }
                                        style={{
                                          background: "transparent",
                                          border: "none",
                                          color: "#fca5a5",
                                          fontSize: "12px",
                                          fontWeight: 850,
                                          cursor: "pointer",
                                          padding: 0,
                                        }}
                                      >
                                        Delete
                                      </button>
                                    ) : null}

                                    {currentUserId &&
                                    reply.authorUserId !== currentUserId ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleReportComment(reply.id)
                                        }
                                        style={{
                                          background: "transparent",
                                          border: "none",
                                          color: "#fca5a5",
                                          fontSize: "12px",
                                          fontWeight: 850,
                                          cursor: "pointer",
                                          padding: 0,
                                        }}
                                      >
                                        Report
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>

              <div
                style={{
                  padding:
                    "10px 12px calc(12px + env(safe-area-inset-bottom, 0px))",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  background:
                    "linear-gradient(180deg, rgba(15,15,18,0.94) 0%, rgba(9,9,12,0.98) 100%)",
                  flexShrink: 0,
                  display: "grid",
                  gap: "8px",
                }}
              >
                <textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Write a comment..."
                  rows={2}
                  style={{
                    ...textAreaStyle,
                    minHeight: "72px",
                    maxHeight: "110px",
                    borderRadius: "16px",
                    padding: "12px 14px",
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "#9ca3af" }}>
                    Video is paused while commenting
                  </div>

                  <button
                    onClick={handleAddComment}
                    disabled={!commentDraft.trim()}
                    style={{
                      ...primaryButtonStyle,
                      opacity: commentDraft.trim() ? 1 : 0.45,
                      cursor: commentDraft.trim() ? "pointer" : "not-allowed",
                    }}
                  >
                    Post Comment
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
                    maxHeight: viewportType === "tablet" ? "78dvh" : "82dvh",
                    borderTop: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "28px 28px 0 0",
                  }),
              background:
                "linear-gradient(180deg, rgba(11,16,32,0.98), rgba(7,9,13,0.98))",
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
                padding:
                  viewportType === "desktop"
                    ? "22px 22px 16px"
                    : "16px 18px 12px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div>
                <div
                  style={{ fontSize: "22px", fontWeight: 900, lineHeight: 1.1 }}
                >
                  Reel Details
                </div>
                <div
                  style={{
                    color: "#9ca3af",
                    fontSize: "13px",
                    marginTop: "5px",
                  }}
                >
                  Full caption and reel information
                </div>
              </div>

              <button onClick={closeDetails} style={buttonStyle}>
                Close
              </button>
            </div>

            <div
              style={{
                padding:
                  viewportType === "desktop"
                    ? "18px 22px 22px"
                    : "16px 18px 22px",
                overflowY: "auto",
                overscrollBehavior: "contain",
                WebkitOverflowScrolling: "touch",
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
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
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
                    {detailsReel.creator} •{" "}
                    {formatRelativeTime(detailsReel.createdAt)}
                  </div>
                </div>
              </div>

              <div>
                <div
                  style={{
                    color: "#9ca3af",
                    fontSize: "12px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "7px",
                  }}
                >
                  Title
                </div>
                <div
                  style={{
                    fontSize: "22px",
                    fontWeight: 900,
                    lineHeight: 1.12,
                  }}
                >
                  {detailsReel.title}
                </div>
              </div>

              <div>
                <div
                  style={{
                    color: "#9ca3af",
                    fontSize: "12px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "7px",
                  }}
                >
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
                <div
                  style={{
                    marginTop: "8px",
                    color: "#9ca3af",
                    fontSize: "12px",
                    textAlign: "right",
                  }}
                >
                  {detailsReel.caption.length}/{REEL_CAPTION_MAX_LENGTH}
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  onClick={() => openCommentsForReel(detailsReel.id)}
                  style={buttonStyle}
                >
                  Comments
                </button>
                <button
                  onClick={() => handleShareLink(detailsReel.id)}
                  style={buttonStyle}
                >
                  Copy Link
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <style jsx global>{`
        @media (max-width: 480px) {
          .parapost-reel-mobile-action button {
            min-height: 42px;
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

      {shareOpen && activeReel && (
        <>
          <div style={overlayStyle} onClick={closeShareModal} />
          <div style={modalWrapStyle}>
            <div
              style={{
                ...modalCardStyle,
                width:
                  viewportType === "mobile"
                    ? "min(100%, 430px)"
                    : modalCardStyle.width,
                borderRadius:
                  viewportType === "mobile"
                    ? "24px"
                    : modalCardStyle.borderRadius,
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
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: "24px",
                      marginBottom: "6px",
                    }}
                  >
                    Share Reel to Feed
                  </div>
                  <div style={{ fontSize: "13px", color: "#9ca3af" }}>
                    {activeReel.title} by {activeReel.creator}
                  </div>
                </div>

                <button onClick={closeShareModal} style={buttonStyle}>
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
                      height:
                        viewportType === "mobile"
                          ? "190px"
                          : viewportType === "tablet"
                            ? "230px"
                            : "260px",
                      objectFit: "contain",
                      display: "block",
                      background: "#000",
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
                    flexDirection: viewportType === "mobile" ? "column" : "row",
                  }}
                >
                  <button
                    onClick={() => handleShareLink(activeReel.id)}
                    style={buttonStyle}
                  >
                    Copy Reel Link
                  </button>
                  <button
                    onClick={handleShareToFeed}
                    style={primaryButtonStyle}
                  >
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
            <div
              style={{
                ...modalCardStyle,
                width:
                  viewportType === "mobile"
                    ? "min(100%, 430px)"
                    : modalCardStyle.width,
                borderRadius:
                  viewportType === "mobile"
                    ? "24px"
                    : modalCardStyle.borderRadius,
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
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: "24px",
                      marginBottom: "6px",
                    }}
                  >
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
                  onChange={(event) =>
                    setEditCaption(
                      event.target.value.slice(0, REEL_CAPTION_MAX_LENGTH),
                    )
                  }
                  placeholder="Reel caption"
                  style={textAreaStyle}
                  maxLength={REEL_CAPTION_MAX_LENGTH}
                />
                <div
                  style={{
                    marginTop: "-8px",
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
                  <button
                    onClick={handleSaveReelEdit}
                    style={primaryButtonStyle}
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ReelRow = {
  id: string;
  user_id: string;
  video_url: string | null;
  caption: string | null;
  created_at: string | null;
};

type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
};

type CommentProfile =
  | {
      username: string | null;
      full_name: string | null;
    }
  | Array<{
      username: string | null;
      full_name: string | null;
    }>
  | null;

type CommentRow = {
  id: string;
  reel_id: string;
  user_id: string;
  content: string;
  created_at: string | null;
  profiles?: CommentProfile;
};

type ReelLikeRow = {
  id: string;
  reel_id: string;
  user_id: string;
};

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function getDisplayName(profile: ProfileRow | null) {
  if (!profile) return "Profile";
  return profile.username || profile.full_name || "Profile";
}

function getCommentProfile(comment: CommentRow) {
  const raw = comment.profiles;
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw;
}

function getCommentAuthorName(comment: CommentRow) {
  const profile = getCommentProfile(comment);
  return profile?.username || profile?.full_name || "User";
}

export default function ProfileReelsViewerPage() {
  const params = useParams();

  const profileId = useMemo(() => {
    const raw = params?.id;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] || "" : "";
  }, [params]);

  const targetReelIdRef = useRef("");
  const reelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hasScrolledRef = useRef(false);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [reels, setReels] = useState<ReelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedReelId, setSelectedReelId] = useState("");
  const [mutedMap, setMutedMap] = useState<Record<string, boolean>>({});
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [likeLoadingMap, setLikeLoadingMap] = useState<Record<string, boolean>>({});
  const [shareMessage, setShareMessage] = useState("");

  const [viewerId, setViewerId] = useState("");
  const [viewerUsername, setViewerUsername] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsSubmitting, setCommentsSubmitting] = useState(false);
  const [commentMessage, setCommentMessage] = useState("");
  const [commentInput, setCommentInput] = useState("");
  const [commentsByReel, setCommentsByReel] = useState<Record<string, CommentRow[]>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    targetReelIdRef.current = url.searchParams.get("reelId") || "";
  }, []);

  useEffect(() => {
    let isMounted = true;
    hasScrolledRef.current = false;

    async function loadData() {
      if (!profileId) {
        if (!isMounted) return;
        setErrorMessage("Missing profile id.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const nextViewerId = user?.id || "";
      setViewerId(nextViewerId);

      let nextViewerUsername = "";
      if (nextViewerId) {
        const { data: viewerProfile } = await supabase
          .from("profiles")
          .select("username, full_name")
          .eq("id", nextViewerId)
          .maybeSingle();

        nextViewerUsername = viewerProfile?.username || viewerProfile?.full_name || "";
      }
      setViewerUsername(nextViewerUsername);

      const [profileResult, reelsResult, commentCountsResult, likesResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, full_name")
          .eq("id", profileId)
          .maybeSingle(),
        supabase
          .from("reels")
          .select("id, user_id, video_url, caption, created_at")
          .eq("user_id", profileId)
          .order("created_at", { ascending: false }),
        supabase.from("reel_comments").select("id, reel_id"),
        supabase.from("reel_likes").select("id, reel_id, user_id"),
      ]);

      if (!isMounted) return;

      if (profileResult.error) {
        setErrorMessage(profileResult.error.message || "Failed to load profile.");
        setProfile(null);
        setReels([]);
        setLoading(false);
        return;
      }

      setProfile((profileResult.data as ProfileRow | null) || null);

      if (reelsResult.error) {
        setErrorMessage(reelsResult.error.message || "Failed to load reels.");
        setReels([]);
        setLoading(false);
        return;
      }

      const safeRows = ((reelsResult.data as ReelRow[]) || []).filter(
        (item) => item && typeof item.id === "string"
      );

      setReels(safeRows);

      const nextMutedMap: Record<string, boolean> = {};
      safeRows.forEach((reel) => {
        nextMutedMap[reel.id] = true;
      });
      setMutedMap(nextMutedMap);

      if (safeRows.length > 0) {
        const targetId = targetReelIdRef.current;
        const matched = targetId ? safeRows.find((reel) => reel.id === targetId) : null;
        setSelectedReelId(matched?.id || safeRows[0].id);
      } else {
        setSelectedReelId("");
      }

      const nextCommentCounts: Record<string, number> = {};
      for (const row of commentCountsResult.data || []) {
        if (!row.reel_id) continue;
        nextCommentCounts[row.reel_id] = (nextCommentCounts[row.reel_id] || 0) + 1;
      }
      setCommentCounts(nextCommentCounts);

      const nextLikedMap: Record<string, boolean> = {};
      const nextLikeCounts: Record<string, number> = {};
      for (const row of (likesResult.data as ReelLikeRow[]) || []) {
        if (!row.reel_id) continue;
        nextLikeCounts[row.reel_id] = (nextLikeCounts[row.reel_id] || 0) + 1;
        if (nextViewerId && row.user_id === nextViewerId) {
          nextLikedMap[row.reel_id] = true;
        }
      }
      setLikedMap(nextLikedMap);
      setLikeCounts(nextLikeCounts);

      setLoading(false);
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [profileId]);

  useEffect(() => {
    if (loading || !selectedReelId || hasScrolledRef.current) return;

    let attempts = 0;
    const maxAttempts = 20;

    const scrollToSelected = () => {
      attempts += 1;
      const element = reelRefs.current[selectedReelId];

      if (element) {
        element.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });

        element.classList.add("deep-link-highlight");
        window.setTimeout(() => {
          element.classList.remove("deep-link-highlight");
        }, 1400);

        hasScrolledRef.current = true;
        return;
      }

      if (attempts < maxAttempts) {
        window.setTimeout(scrollToSelected, 120);
      }
    };

    window.setTimeout(scrollToSelected, 200);
  }, [loading, selectedReelId]);

  useEffect(() => {
    if (reels.length === 0) return;

    const items = reels
      .map((reel) => reelRefs.current[reel.id])
      .filter((item): item is HTMLDivElement => Boolean(item));

    if (items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let bestId = "";
        let bestRatio = 0;

        entries.forEach((entry) => {
          const id = (entry.target as HTMLDivElement).dataset.reelId || "";
          if (!id) return;
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestId = id;
          }
        });

        if (bestId) {
          setSelectedReelId((prev) => (prev === bestId ? prev : bestId));
        }
      },
      {
        threshold: [0.35, 0.5, 0.7, 0.9],
      }
    );

    items.forEach((item) => observer.observe(item));

    return () => observer.disconnect();
  }, [reels]);

  useEffect(() => {
    const videos = Array.from(document.querySelectorAll("video[data-profile-reel='true']"));

    if (videos.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let bestVideo: HTMLVideoElement | null = null;
        let bestRatio = 0;

        entries.forEach((entry) => {
          const video = entry.target as HTMLVideoElement;

          if (!entry.isIntersecting || entry.intersectionRatio < 0.65) {
            video.pause();
            return;
          }

          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestVideo = video;
          }
        });

        const activeVideo = bestVideo as HTMLVideoElement | null;

        if (activeVideo && bestRatio >= 0.72) {
          void activeVideo.play().catch(() => {});
        }
      },
      { threshold: [0.35, 0.65, 0.72, 0.95] }
    );

    videos.forEach((video) => observer.observe(video));

    return () => observer.disconnect();
  }, [reels]);

  const loadCommentsForReel = async (reelId: string) => {
    setCommentsLoading(true);
    setCommentMessage("");

    const { data, error } = await supabase
      .from("reel_comments")
      .select(`
        id,
        reel_id,
        user_id,
        content,
        created_at,
        profiles:user_id (
          username,
          full_name
        )
      `)
      .eq("reel_id", reelId)
      .order("created_at", { ascending: false });

    if (error) {
      setCommentMessage(error.message || "Unable to load comments.");
      setCommentsLoading(false);
      return;
    }

    const safeComments = ((data as unknown[]) || []).filter(
      (item): item is CommentRow =>
        Boolean(
          item &&
            typeof item === "object" &&
            "id" in item &&
            "reel_id" in item &&
            "user_id" in item &&
            "content" in item
        )
    );

    setCommentsByReel((prev) => ({ ...prev, [reelId]: safeComments }));
    setCommentCounts((prev) => ({ ...prev, [reelId]: safeComments.length }));
    setCommentsLoading(false);
  };

  const openCommentsForReel = async (reelId: string) => {
    setSelectedReelId(reelId);
    setCommentsOpen(true);
    await loadCommentsForReel(reelId);
  };

  const handleMuteToggle = (reelId: string) => {
    setMutedMap((prev) => {
      const nextMuted = !prev[reelId];
      const next = { ...prev, [reelId]: nextMuted };

      const video = document.querySelector<HTMLVideoElement>(`video[data-reel-id="${reelId}"]`);
      if (video) {
        video.muted = nextMuted;
      }

      return next;
    });
  };

  const handleLikeToggle = async (reelId: string) => {
    if (!viewerId) {
      setShareMessage("Log in to like reels.");
      window.setTimeout(() => setShareMessage(""), 1800);
      return;
    }

    if (likeLoadingMap[reelId]) return;

    setLikeLoadingMap((prev) => ({ ...prev, [reelId]: true }));

    const isLiked = !!likedMap[reelId];

    if (isLiked) {
      const { error } = await supabase
        .from("reel_likes")
        .delete()
        .eq("reel_id", reelId)
        .eq("user_id", viewerId);

      if (error) {
        setShareMessage(error.message || "Unable to remove like.");
        window.setTimeout(() => setShareMessage(""), 1800);
        setLikeLoadingMap((prev) => ({ ...prev, [reelId]: false }));
        return;
      }

      setLikedMap((prev) => ({ ...prev, [reelId]: false }));
      setLikeCounts((prev) => ({
        ...prev,
        [reelId]: Math.max((prev[reelId] || 1) - 1, 0),
      }));
      setLikeLoadingMap((prev) => ({ ...prev, [reelId]: false }));
      return;
    }

    const { error } = await supabase.from("reel_likes").insert([
      {
        reel_id: reelId,
        user_id: viewerId,
      },
    ]);

    if (error) {
      setShareMessage(error.message || "Unable to like reel.");
      window.setTimeout(() => setShareMessage(""), 1800);
      setLikeLoadingMap((prev) => ({ ...prev, [reelId]: false }));
      return;
    }

    setLikedMap((prev) => ({ ...prev, [reelId]: true }));
    setLikeCounts((prev) => ({
      ...prev,
      [reelId]: (prev[reelId] || 0) + 1,
    }));
    setLikeLoadingMap((prev) => ({ ...prev, [reelId]: false }));
  };

  const handleShare = async (reelId: string) => {
    if (typeof window === "undefined") return;
    const shareUrl = `${window.location.origin}/profile/${profileId}/reels/view?reelId=${reelId}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${getDisplayName(profile)} Reel`,
          url: shareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      setShareMessage("Reel link copied.");
      window.setTimeout(() => setShareMessage(""), 1800);
    } catch {
      setShareMessage("Share cancelled.");
      window.setTimeout(() => setShareMessage(""), 1800);
    }
  };

  const handleSubmitComment = async (event: FormEvent) => {
    event.preventDefault();

    if (!selectedReelId) return;
    if (!viewerId) {
      setCommentMessage("You must be logged in to comment.");
      return;
    }

    const trimmed = commentInput.trim();
    if (!trimmed) {
      setCommentMessage("Write a comment first.");
      return;
    }

    setCommentsSubmitting(true);
    setCommentMessage("");

    const { data, error } = await supabase
      .from("reel_comments")
      .insert([
        {
          reel_id: selectedReelId,
          user_id: viewerId,
          content: trimmed,
        },
      ])
      .select("id, reel_id, user_id, content, created_at")
      .single();

    if (error) {
      setCommentMessage(error.message || "Unable to post comment.");
      setCommentsSubmitting(false);
      return;
    }

    const newComment: CommentRow = {
      ...(data as CommentRow),
      profiles: {
        username: viewerUsername || null,
        full_name: null,
      },
    };

    setCommentsByReel((prev) => ({
      ...prev,
      [selectedReelId]: [newComment, ...(prev[selectedReelId] || [])],
    }));

    setCommentCounts((prev) => ({
      ...prev,
      [selectedReelId]: (prev[selectedReelId] || 0) + 1,
    }));

    setCommentInput("");
    setCommentMessage("Comment posted.");
    setCommentsSubmitting(false);
    window.setTimeout(() => setCommentMessage(""), 1600);
  };

  const selectedComments = commentsByReel[selectedReelId] || [];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f10",
        color: "#ffffff",
      }}
    >
      <style jsx>{`
        .deep-link-highlight {
          outline: 2px solid rgba(88, 196, 255, 0.95);
          box-shadow: 0 0 0 4px rgba(88, 196, 255, 0.15);
          transition: outline 0.25s ease, box-shadow 0.25s ease;
        }

        .snap-item {
          scroll-snap-align: start;
        }

        @media (max-width: 767px) {
          .snap-list {
            scroll-snap-type: y proximity;
          }

          .snap-item {
            min-height: 92vh;
          }
        }

        @media (min-width: 768px) {
          .snap-list {
            scroll-snap-type: none;
          }

          .snap-item {
            min-height: auto;
          }
        }
      `}</style>

      <div
        style={{
          width: "100%",
          maxWidth: "820px",
          margin: "0 auto",
          padding: "20px 14px 24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "18px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "1.6rem",
                lineHeight: 1.2,
              }}
            >
              {profile?.full_name || profile?.username || "Profile"} Reels
            </h1>
            <p
              style={{
                margin: "8px 0 0",
                color: "rgba(255,255,255,0.72)",
                fontSize: "0.95rem",
              }}
            >
              Viewer mode with real likes, comments drawer, and polished overlay controls.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <Link prefetch={false} href={`/profile/${profileId}/reels`} style={secondaryLinkStyle}>
              Back to Grid
            </Link>
            <Link prefetch={false} href={`/profile/${profileId}`} style={secondaryLinkStyle}>
              Back to Profile
            </Link>
          </div>
        </div>

        {shareMessage ? (
          <div
            style={{
              marginBottom: "14px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: "16px",
              padding: "12px 14px",
              color: "#f9fafb",
              fontSize: "14px",
            }}
          >
            {shareMessage}
          </div>
        ) : null}

        {loading ? (
          <div style={cardStyle}>Loading reels...</div>
        ) : errorMessage ? (
          <div style={{ ...cardStyle, color: "#ffb4b4" }}>{errorMessage}</div>
        ) : reels.length === 0 ? (
          <div style={cardStyle}>No reels found for this profile yet.</div>
        ) : (
          <div
            className="snap-list"
            style={{
              display: "grid",
              gap: "18px",
            }}
          >
            {reels.map((reel) => {
              const isSelected = reel.id === selectedReelId;
              const isMuted = mutedMap[reel.id] ?? true;
              const isLiked = likedMap[reel.id] ?? false;
              const likeCount = likeCounts[reel.id] || 0;
              const likeLoading = likeLoadingMap[reel.id] || false;
              const commentCount = commentCounts[reel.id] || 0;

              return (
                <div
                  key={reel.id}
                  ref={(element) => {
                    reelRefs.current[reel.id] = element;
                  }}
                  id={`reel-${reel.id}`}
                  data-reel-id={reel.id}
                  className="snap-item"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    borderRadius: "26px",
                    overflow: "hidden",
                    background: "rgba(255,255,255,0.05)",
                    border: isSelected
                      ? "1px solid rgba(88, 196, 255, 0.7)"
                      : "1px solid rgba(255,255,255,0.08)",
                    boxShadow: "0 14px 30px rgba(0,0,0,0.25)",
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      background: "#000",
                    }}
                  >
                    {reel.video_url ? (
                      <video
                        src={reel.video_url}
                        controls
                        playsInline
                        muted={isMuted}
                        preload="metadata"
                        data-profile-reel="true"
                        data-reel-id={reel.id}
                        style={{
                          display: "block",
                          width: "100%",
                          maxHeight: "78vh",
                          background: "#000000",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          padding: "24px 14px",
                          color: "#ffb4b4",
                        }}
                      >
                        Missing video URL for this reel.
                      </div>
                    )}

                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                        background:
                          "linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.00) 30%, rgba(0,0,0,0.00) 58%, rgba(0,0,0,0.65) 100%)",
                      }}
                    />

                    <div
                      style={{
                        position: "absolute",
                        top: "14px",
                        left: "14px",
                        right: "14px",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        alignItems: "flex-start",
                        pointerEvents: "none",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            display: "inline-flex",
                            width: "fit-content",
                            alignItems: "center",
                            gap: "8px",
                            background: "rgba(0,0,0,0.55)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: "999px",
                            padding: "8px 12px",
                            fontWeight: 700,
                            fontSize: "13px",
                            color: "#fff",
                            backdropFilter: "blur(10px)",
                          }}
                        >
                          <span>@{profile?.username || "profile"}</span>
                        </div>

                        {reel.created_at ? (
                          <div
                            style={{
                              color: "rgba(255,255,255,0.86)",
                              fontSize: "12px",
                              paddingLeft: "4px",
                            }}
                          >
                            {formatDate(reel.created_at)}
                          </div>
                        ) : null}
                      </div>

                      {isSelected ? (
                        <div
                          style={{
                            background: "rgba(88, 196, 255, 0.18)",
                            color: "#bfeaff",
                            border: "1px solid rgba(88, 196, 255, 0.40)",
                            borderRadius: "999px",
                            padding: "8px 12px",
                            fontSize: "12px",
                            fontWeight: 700,
                            backdropFilter: "blur(10px)",
                          }}
                        >
                          Active Reel
                        </div>
                      ) : null}
                    </div>

                    <div
                      style={{
                        position: "absolute",
                        right: "14px",
                        bottom: "16px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        zIndex: 2,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleLikeToggle(reel.id)}
                        style={overlayActionButtonStyle}
                        title="Like reel"
                        disabled={likeLoading}
                      >
                        <span style={{ fontSize: "18px", lineHeight: 1 }}>
                          {isLiked ? "♥" : "♡"}
                        </span>
                        <span style={overlayActionLabelStyle}>
                          {likeLoading ? "..." : likeCount}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openCommentsForReel(reel.id)}
                        style={overlayActionButtonStyle}
                        title="Open comments"
                      >
                        <span style={{ fontSize: "18px", lineHeight: 1 }}>💬</span>
                        <span style={overlayActionLabelStyle}>{commentCount}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleShare(reel.id)}
                        style={overlayActionButtonStyle}
                        title="Share reel"
                      >
                        <span style={{ fontSize: "18px", lineHeight: 1 }}>↗</span>
                        <span style={overlayActionLabelStyle}>Share</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMuteToggle(reel.id)}
                        style={overlayActionButtonStyle}
                        title={isMuted ? "Unmute reel" : "Mute reel"}
                      >
                        <span style={{ fontSize: "18px", lineHeight: 1 }}>
                          {isMuted ? "🔇" : "🔊"}
                        </span>
                        <span style={overlayActionLabelStyle}>{isMuted ? "Mute" : "Sound"}</span>
                      </button>

                      <Link
                        prefetch={false}
                        href={`/profile/${profileId}`}
                        style={{
                          ...overlayActionButtonStyle,
                          textDecoration: "none",
                        }}
                        title="Open profile"
                      >
                        <span style={{ fontSize: "18px", lineHeight: 1 }}>👤</span>
                        <span style={overlayActionLabelStyle}>Profile</span>
                      </Link>
                    </div>

                    <div
                      style={{
                        position: "absolute",
                        left: "16px",
                        right: "88px",
                        bottom: "18px",
                        zIndex: 2,
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <div
                        style={{
                          display: "inline-flex",
                          width: "fit-content",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px 12px",
                          borderRadius: "999px",
                          background: "rgba(0,0,0,0.55)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "#fff",
                          backdropFilter: "blur(10px)",
                        }}
                      >
                        <span>Parapost Reels</span>
                      </div>

                      {reel.caption ? (
                        <div
                          style={{
                            color: "#fff",
                            fontSize: "14px",
                            lineHeight: 1.45,
                            textShadow: "0 1px 6px rgba(0,0,0,0.50)",
                            maxWidth: "100%",
                            display: "-webkit-box",
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {reel.caption}
                        </div>
                      ) : (
                        <div
                          style={{
                            color: "rgba(255,255,255,0.85)",
                            fontSize: "13px",
                            lineHeight: 1.4,
                          }}
                        >
                          No caption added for this reel yet.
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "12px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      flexWrap: "wrap",
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.9rem",
                        color: isSelected ? "#9eddff" : "rgba(255,255,255,0.78)",
                        fontWeight: isSelected ? 700 : 500,
                      }}
                    >
                      {isSelected ? "Selected Reel" : "Reel ID"}: {reel.id}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        alignItems: "center",
                        flexWrap: "wrap",
                        color: "rgba(255,255,255,0.72)",
                        fontSize: "13px",
                      }}
                    >
                      <span>{likeCount} likes</span>
                      <span>•</span>
                      <span>{commentCount} comments</span>
                      <span>•</span>
                      <span>{isMuted ? "Muted" : "Sound on"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {commentsOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 60,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: "14px",
          }}
          onClick={() => setCommentsOpen(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "720px",
              maxHeight: "82vh",
              background: "#121317",
              borderRadius: "24px 24px 0 0",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 20px 50px rgba(0,0,0,0.38)",
              overflow: "hidden",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: "16px" }}>Reel Comments</div>
                <div style={{ color: "rgba(255,255,255,0.64)", fontSize: "13px", marginTop: "4px" }}>
                  {commentCounts[selectedReelId] || 0} total comments
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCommentsOpen(false)}
                style={closeButtonStyle}
              >
                Close
              </button>
            </div>

            <div
              style={{
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                maxHeight: "calc(82vh - 140px)",
                overflowY: "auto",
              }}
            >
              {commentsLoading ? (
                <div style={drawerMutedCardStyle}>Loading comments...</div>
              ) : selectedComments.length === 0 ? (
                <div style={drawerMutedCardStyle}>No comments yet. Be the first to comment.</div>
              ) : (
                selectedComments.map((comment) => (
                  <div
                    key={comment.id}
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "18px",
                      padding: "12px 14px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "10px",
                        alignItems: "center",
                        marginBottom: "8px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "#fff", fontSize: "14px" }}>
                        @{getCommentAuthorName(comment)}
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "12px" }}>
                        {formatDateTime(comment.created_at)}
                      </div>
                    </div>
                    <div
                      style={{
                        color: "rgba(255,255,255,0.88)",
                        lineHeight: 1.5,
                        fontSize: "14px",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {comment.content}
                    </div>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={handleSubmitComment}
              style={{
                padding: "14px 16px 16px",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                background: "#121317",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <textarea
                value={commentInput}
                onChange={(event) => setCommentInput(event.target.value)}
                placeholder="Write a comment..."
                rows={3}
                style={commentTextareaStyle}
              />

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "10px",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ color: "rgba(255,255,255,0.60)", fontSize: "12px" }}>
                  {commentMessage || "Keep it respectful and on-topic."}
                </div>

                <button
                  type="submit"
                  disabled={commentsSubmitting}
                  style={submitCommentButtonStyle}
                >
                  {commentsSubmitting ? "Posting..." : "Post Comment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  borderRadius: "24px",
  padding: "18px",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
};

const secondaryLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
  background: "rgba(255,255,255,0.05)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 600,
  minHeight: "42px",
};

const overlayActionButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "5px",
  width: "56px",
  minHeight: "56px",
  borderRadius: "18px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(0,0,0,0.52)",
  color: "#ffffff",
  cursor: "pointer",
  backdropFilter: "blur(10px)",
  boxShadow: "0 8px 18px rgba(0,0,0,0.22)",
};

const overlayActionLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  lineHeight: 1,
};

const closeButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "40px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.05)",
  color: "#fff",
  padding: "0 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const drawerMutedCardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.72)",
  borderRadius: "18px",
  padding: "14px",
  fontSize: "14px",
};

const commentTextareaStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: "16px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "#fff",
  padding: "12px 14px",
  resize: "vertical",
  minHeight: "86px",
  outline: "none",
  fontSize: "14px",
};

const submitCommentButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "42px",
  borderRadius: "999px",
  border: "none",
  background: "#ffffff",
  color: "#111",
  padding: "0 16px",
  cursor: "pointer",
  fontWeight: 700,
};

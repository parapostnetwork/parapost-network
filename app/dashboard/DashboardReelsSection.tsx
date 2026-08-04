"use client";

import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

type ReelRow = {
  id: string;
  user_id: string | null;
  creator_profile_id?: string | null;
  title: string | null;
  caption: string | null;
  video_url: string | null;
  poster_url: string | null;
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

type FriendRequestRow = {
  sender_id: string | null;
  receiver_id: string | null;
  status: string | null;
};

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

function getInitial(name?: string | null, username?: string | null) {
  const value = name || username || "P";
  return value.charAt(0).toUpperCase();
}

function getDisplayName(profile?: ProfilePreview | null) {
  return profile?.full_name || profile?.username || "Parapost Member";
}

function formatCompactTime(value?: string | null) {
  if (!value) return "new";

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "new";

  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;

  const years = Math.floor(days / 365);
  return `${years}y`;
}

function isRecentlyOnline(profile?: ProfilePreview | null) {
  if (!profile?.is_online) return false;

  if (!profile.last_seen_at) {
    return Boolean(profile.is_online);
  }

  const lastSeenTime = new Date(profile.last_seen_at).getTime();
  if (Number.isNaN(lastSeenTime)) return false;

  return Date.now() - lastSeenTime <= 3 * 60 * 1000;
}

function reelOwnerId(reel: ReelRow) {
  return reel.creator_profile_id || reel.user_id || "";
}

export default function DashboardReelsSection() {
  const [currentUserId, setCurrentUserId] = useState("");
  const [reels, setReels] = useState<ReelRow[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, ProfilePreview>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const rowRef = useRef<HTMLDivElement | null>(null);


  const fetchFriendIds = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("friend_requests")
      .select("sender_id, receiver_id, status")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .eq("status", "accepted");

    if (error) {
      console.error("Dashboard friend Reels friend fetch error:", error.message);
      return [] as string[];
    }

    const ids = ((data || []) as FriendRequestRow[])
      .map((row) => (row.sender_id === userId ? row.receiver_id : row.sender_id))
      .filter(Boolean) as string[];

    return [...new Set(ids)];
  }, []);

  const fetchProfiles = useCallback(async (ids: string[]) => {
    const uniqueIds = [...new Set(ids.filter(Boolean))];

    if (uniqueIds.length === 0) {
      setProfilesMap({});
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, is_online, last_seen_at")
      .in("id", uniqueIds);

    if (error) {
      console.error("Dashboard friend Reels profile fetch error:", error.message);
      return;
    }

    const nextMap: Record<string, ProfilePreview> = {};
    for (const profile of data || []) {
      nextMap[profile.id] = profile as ProfilePreview;
    }

    setProfilesMap(nextMap);
  }, []);

  const fetchDashboardReels = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setCurrentUserId("");
      setReels([]);
      setProfilesMap({});
      setMessage("Sign in to see Reels from your friend circle.");
      setLoading(false);
      return;
    }

    setCurrentUserId(user.id);

    const acceptedFriendIds = await fetchFriendIds(user.id);

    const allowedIds = [...new Set([user.id, ...acceptedFriendIds].filter(Boolean))];

    if (allowedIds.length === 0) {
      setReels([]);
      setProfilesMap({});
      setLoading(false);
      return;
    }

    const safeIds = allowedIds.length ? allowedIds : [EMPTY_UUID];

    const safeIdFilter = safeIds.join(",");

    const { data, error } = await supabase
      .from("reels")
      .select("id, user_id, creator_profile_id, title, caption, video_url, poster_url, created_at")
      .or(`user_id.in.(${safeIdFilter}),creator_profile_id.in.(${safeIdFilter})`)
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) {
      console.error("Dashboard friend Reels fetch error:", error.message);
      setReels([]);
      setMessage("Reels are still loading. Please refresh if they do not appear.");
      setLoading(false);
      return;
    }

    const validReels = ((data || []) as ReelRow[]).filter((reel) => !!reel.video_url);
    const allowedIdSet = new Set(allowedIds);
    const latestReelByCreator = new Map<string, ReelRow>();

    // The query is already sorted newest-first, so the first Reel found for each
    // creator is their latest one. This keeps one Dashboard card per person while
    // Explore Reels and profile Reel pages continue to show their full Reel history.
    for (const reel of validReels) {
      const ownerId = reelOwnerId(reel);

      if (!ownerId || !allowedIdSet.has(ownerId) || latestReelByCreator.has(ownerId)) {
        continue;
      }

      latestReelByCreator.set(ownerId, reel);
    }

    const nextReels = Array.from(latestReelByCreator.values());
    const profileIds = nextReels.map((reel) => reelOwnerId(reel));

    await fetchProfiles([...allowedIds, ...profileIds]);
    setReels(nextReels);
    setLoading(false);
  }, [fetchFriendIds, fetchProfiles]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchDashboardReels();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fetchDashboardReels]);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`dashboard-friend-reels-${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reels" }, () => {
        void fetchDashboardReels();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, () => {
        void fetchDashboardReels();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, fetchDashboardReels]);

  const scrollReels = (direction: "left" | "right") => {
    const row = rowRef.current;
    if (!row) return;

    row.scrollBy({
      left: direction === "right" ? 340 : -340,
      behavior: "smooth",
    });
  };

  return (
    <section style={reelsSectionStyle} className="dashboard-card dashboard-reels-row-card">
      <div style={reelsHeaderStyle} className="dashboard-reels-header">
        <div style={reelsHeadingWrapStyle}>
          <h2 style={reelsTitleStyle}>Parapost Reels</h2>
          <p style={reelsSubtitleStyle}>
            Videos live here. Create and share short clips, creator moments, and fresh content across the Parapost Network.
          </p>
        </div>

        <div style={reelsHeaderActionsStyle} className="dashboard-reels-actions">
          {reels.length > 3 ? (
            <div style={scrollButtonGroupStyle} className="dashboard-reels-scroll-buttons" aria-label="Scroll Parapost Reels">
              <button type="button" onClick={() => scrollReels("left")} style={smallScrollButtonStyle} aria-label="Scroll left">
                ‹
              </button>
              <button type="button" onClick={() => scrollReels("right")} style={smallScrollButtonStyle} aria-label="Scroll right">
                ›
              </button>
            </div>
          ) : null}

          <Link href="/reels" style={exploreReelsButtonStyle} className="dashboard-explore-reels-button">
            Explore Reels
          </Link>
        </div>
      </div>

      {loading ? (
        <div style={reelsEmptyStyle} className="dashboard-reels-empty">
          <span style={emptyPulseStyle} />
          Loading Reels...
        </div>
      ) : reels.length === 0 ? (
        <div style={reelsEmptyStyle} className="dashboard-reels-empty">
          <span style={emptyPulseStyle} />
          <span>{message || "No Reels yet. When you or your friends upload Reels, they will appear here automatically."}</span>
          <Link href="/reels" style={emptyExploreLinkStyle}>
            Open Explore Reels
          </Link>
        </div>
      ) : (
        <div
          ref={rowRef}
          style={reelsScrollerStyle}
          className="dashboard-friend-reels-scroller"
          role="list"
          aria-label="Dashboard Parapost Reels"
        >
          {reels.map((reel) => {
            const ownerId = reelOwnerId(reel);
            const profile = profilesMap[ownerId] || profilesMap[reel.user_id || ""];
            const title = reel.title || reel.caption || "Parapost Reel";
            const handle = profile?.username || "parapost";

            return (
              <Link
                key={reel.id}
                href={`/reels?reel=${reel.id}`}
                style={reelCardStyle}
                className="dashboard-reel-card"
                aria-label={`Open Reel: ${title}`}
                title={`Open Reel: ${title}`}
                role="listitem"
              >
                {reel.poster_url ? (
                  <Image
                    src={reel.poster_url}
                    alt=""
                    fill
                    sizes="(max-width: 410px) 124px, (max-width: 760px) 132px, (max-width: 1180px) 150px, 156px"
                    unoptimized
                    style={reelVideoStyle}
                    className="dashboard-reel-video"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    style={reelVideoFallbackStyle}
                    className="dashboard-reel-video"
                  />
                )}

                <div style={reelGradientStyle} />
                <div style={reelFooterStyle}>
                  <div style={reelAuthorRowStyle}>
                    <div style={reelAvatarStyle}>
                      {profile?.avatar_url ? (
                        <Image
                          src={profile.avatar_url}
                          alt=""
                          fill
                          sizes="28px"
                          unoptimized
                          style={reelAvatarImageStyle}
                        />
                      ) : (
                        <span>{getInitial(profile?.full_name, profile?.username)}</span>
                      )}

                      {isRecentlyOnline(profile) ? <span style={onlineDotStyle} /> : null}
                    </div>

                    <span style={reelTimeStyle}>{formatCompactTime(reel.created_at)}</span>
                  </div>

                  <strong style={reelTitleTextStyle}>{title}</strong>
                  <span style={reelHandleStyle}>
                    @{handle}
                    <span style={creatorNameStyle}> · {getDisplayName(profile)}</span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <style jsx global>{`
        .dashboard-friend-reels-scroller {
          scrollbar-width: thin;
          scrollbar-color: color-mix(in srgb, var(--parapost-accent-2) 48%, transparent) rgba(255, 255, 255, 0.04);
        }

        .dashboard-friend-reels-scroller::-webkit-scrollbar {
          height: 7px;
        }

        .dashboard-friend-reels-scroller::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, var(--parapost-accent-2) 48%, transparent);
          border-radius: 999px;
        }

        .dashboard-reel-card:hover {
          transform: translateY(-2px);
          border-color: var(--parapost-accent-active-border) !important;
          box-shadow: 0 18px 36px rgba(0,0,0,0.36), 0 0 26px var(--parapost-accent-glow) !important;
        }

        .dashboard-reel-card:hover .dashboard-reel-video {
          transform: scale(1.025);
        }

        @media (min-width: 1181px) {
          .dashboard-reels-row-card {
            padding: 17px !important;
            margin-bottom: 18px !important;
          }

          .dashboard-friend-reels-scroller {
            gap: 14px !important;
            padding-bottom: 7px !important;
          }

          .dashboard-reel-card {
            min-width: 156px !important;
            width: 156px !important;
            height: 274px !important;
          }
        }

        @media (min-width: 761px) and (max-width: 1180px) {
          .dashboard-reels-row-card {
            padding: 15px !important;
            border-radius: 24px !important;
            margin-bottom: 15px !important;
          }

          .dashboard-reels-header {
            align-items: center !important;
          }

          .dashboard-friend-reels-scroller {
            gap: 12px !important;
            padding-bottom: 7px !important;
          }

          .dashboard-reel-card {
            min-width: 150px !important;
            width: 150px !important;
            height: 264px !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-reels-row-card {
            padding: 12px !important;
            border-radius: 22px !important;
            margin-bottom: 11px !important;
          }

          .dashboard-reels-header {
            align-items: flex-start !important;
            gap: 10px !important;
            margin-bottom: 10px !important;
          }

          .dashboard-reels-actions {
            gap: 6px !important;
          }

          .dashboard-reels-scroll-buttons {
            display: none !important;
          }

          .dashboard-explore-reels-button {
            min-height: 30px !important;
            border-radius: 12px !important;
            padding-inline: 10px !important;
            font-size: 11.5px !important;
          }

          .dashboard-friend-reels-scroller {
            gap: 10px !important;
            margin-left: -1px !important;
            margin-right: -1px !important;
            padding-left: 1px !important;
            padding-right: 1px !important;
            padding-bottom: 6px !important;
            scrollbar-width: none !important;
            scroll-snap-type: x mandatory !important;
          }

          .dashboard-friend-reels-scroller::-webkit-scrollbar {
            display: none !important;
          }

          .dashboard-reel-card {
            min-width: 132px !important;
            width: 132px !important;
            height: 232px !important;
            border-radius: 17px !important;
            scroll-snap-align: start !important;
          }

          .dashboard-reels-empty {
            min-height: 82px !important;
            border-radius: 17px !important;
            font-size: 12.5px !important;
            padding: 14px !important;
          }
        }

        @media (max-width: 410px) {
          .dashboard-reels-header {
            flex-direction: column !important;
          }

          .dashboard-reels-actions {
            width: 100% !important;
            justify-content: space-between !important;
          }

          .dashboard-explore-reels-button {
            width: 100% !important;
          }

          .dashboard-reel-card {
            min-width: 124px !important;
            width: 124px !important;
            height: 220px !important;
          }
        }
      `}</style>
    </section>
  );
}

const reelsSectionStyle: CSSProperties = {
  borderRadius: 24,
  border: "1px solid var(--parapost-accent-border)",
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--parapost-accent-muted-bg) 55%, rgba(22,28,44,0.90)), rgba(12,15,26,0.93))",
  padding: 16,
  marginBottom: 16,
  boxShadow: "0 18px 44px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.045)",
  overflow: "hidden",
};

const reelsHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
};

const reelsHeadingWrapStyle: CSSProperties = {
  minWidth: 0,
};


const reelsTitleStyle: CSSProperties = {
  margin: 0,
  color: "#fff",
  fontSize: 18,
  fontWeight: 950,
  letterSpacing: "-0.035em",
};

const reelsSubtitleStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#9ca3af",
  fontSize: 12.5,
  lineHeight: 1.45,
  maxWidth: 520,
};

const reelsHeaderActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexShrink: 0,
};

const exploreReelsButtonStyle: CSSProperties = {
  minHeight: 32,
  borderRadius: 12,
  border: "1px solid var(--parapost-accent-border)",
  background: "linear-gradient(180deg, rgba(255,255,255,0.095), rgba(255,255,255,0.048))",
  color: "#f9fafb",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 11px",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
};

const scrollButtonGroupStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
};

const smallScrollButtonStyle: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 11,
  border: "1px solid rgba(255,255,255,0.11)",
  background: "rgba(255,255,255,0.055)",
  color: "#e5e7eb",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  fontSize: 22,
  lineHeight: 1,
  fontWeight: 900,
};

const reelsScrollerStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  overflowX: "auto",
  overflowY: "hidden",
  scrollSnapType: "x proximity",
  overscrollBehaviorX: "contain",
  WebkitOverflowScrolling: "touch",
  paddingBottom: 4,
};

const reelCardStyle: CSSProperties = {
  position: "relative",
  minWidth: 144,
  width: 144,
  height: 254,
  borderRadius: 18,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.10)",
  background:
    "radial-gradient(circle at 50% 15%, color-mix(in srgb, var(--parapost-accent-2) 18%, transparent), transparent 34%), #05070d",
  color: "#fff",
  textDecoration: "none",
  boxShadow: "0 14px 30px rgba(0,0,0,0.28)",
  scrollSnapAlign: "start",
  flexShrink: 0,
  transition: "transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease",
};

const reelVideoStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
  transition: "transform 220ms ease",
};

const reelVideoFallbackStyle: CSSProperties = {
  ...reelVideoStyle,
  background:
    "radial-gradient(circle at 50% 22%, color-mix(in srgb, var(--parapost-accent-2) 26%, transparent), transparent 42%), linear-gradient(180deg, rgba(16,20,34,0.92), rgba(4,6,12,0.98))",
};

const reelGradientStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(180deg, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0.16) 42%, rgba(0,0,0,0.84) 100%)",
  pointerEvents: "none",
};

const reelFooterStyle: CSSProperties = {
  position: "absolute",
  left: 10,
  right: 10,
  bottom: 10,
  display: "grid",
  gap: 4,
};

const reelAuthorRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const reelAvatarStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  overflow: "visible",
  position: "relative",
  background: "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
  border: "1px solid rgba(255,255,255,0.24)",
  color: "#fff",
  fontSize: 11,
  fontWeight: 950,
};

const reelAvatarImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center",
  display: "block",
  borderRadius: 999,
};

const onlineDotStyle: CSSProperties = {
  position: "absolute",
  right: -1,
  bottom: -1,
  width: 8,
  height: 8,
  borderRadius: 999,
  background: "#22c55e",
  border: "1.5px solid #05070d",
};

const reelTimeStyle: CSSProperties = {
  color: "rgba(255,255,255,0.76)",
  fontSize: 10.5,
  fontWeight: 900,
};

const reelTitleTextStyle: CSSProperties = {
  color: "#fff",
  fontSize: 12.5,
  lineHeight: 1.18,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  textShadow: "0 1px 10px rgba(0,0,0,0.45)",
};

const reelHandleStyle: CSSProperties = {
  color: "rgba(255,255,255,0.78)",
  fontSize: 10.5,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const creatorNameStyle: CSSProperties = {
  color: "rgba(255,255,255,0.56)",
};

const reelsEmptyStyle: CSSProperties = {
  minHeight: 94,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.035)",
  color: "#9ca3af",
  display: "grid",
  placeItems: "center",
  gap: 8,
  padding: 16,
  textAlign: "center",
  fontSize: 13,
  lineHeight: 1.5,
};

const emptyPulseStyle: CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: 999,
  background: "var(--parapost-accent-2)",
  boxShadow: "0 0 18px var(--parapost-accent-glow)",
};

const emptyExploreLinkStyle: CSSProperties = {
  minHeight: 32,
  borderRadius: 999,
  border: "1px solid var(--parapost-accent-border)",
  background: "var(--parapost-accent-muted-bg)",
  color: "#fff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 12px",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 900,
};

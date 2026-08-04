"use client";

import Link from "next/link";
import { CSSProperties, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Reel = {
  id: string;
  user_id: string;
  title?: string | null;
  video_url: string | null;
  poster_url?: string | null;
  caption: string | null;
  created_at: string | null;
  views?: number | null;
};

type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_private: boolean | null;
};

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
}

function formatCompactCount(value?: number | string | null) {
  const numericValue =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value || 0).replace(/[^0-9]/g, ""), 10);

  if (!Number.isFinite(numericValue) || numericValue < 0) return "0";
  if (numericValue < 1000) return String(numericValue);
  if (numericValue < 1000000) {
    const next = numericValue / 1000;
    return `${next >= 10 ? next.toFixed(0) : next.toFixed(1)}K`;
  }

  const next = numericValue / 1000000;
  return `${next >= 10 ? next.toFixed(0) : next.toFixed(1)}M`;
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getProfileName(profile: ProfileRow | null) {
  return profile?.full_name || profile?.username || "Profile";
}

function getProfileInitial(profile: ProfileRow | null) {
  return getProfileName(profile).charAt(0).toUpperCase();
}

export default function ProfileReelsGridPage() {
  const params = useParams();

  const profileId = useMemo(() => {
    const raw = params?.id;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] || "" : "";
  }, [params]);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [canViewProfileContent, setCanViewProfileContent] = useState(false);

  const isOwnProfile = Boolean(currentUserId && profileId && currentUserId === profileId);
  const isPrivateProfile = Boolean(profile?.is_private);
  const isPrivateLocked = Boolean(profile && isPrivateProfile && !canViewProfileContent);

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      if (!profileId || !isValidUuid(profileId)) {
        if (!isMounted) return;
        setErrorMessage("Profile not found.");
        setProfile(null);
        setReels([]);
        setCanViewProfileContent(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage("");
      setProfile(null);
      setReels([]);
      setCanViewProfileContent(false);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      const viewerId = user?.id || "";
      setCurrentUserId(viewerId);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, is_private")
        .eq("id", profileId)
        .maybeSingle();

      if (!isMounted) return;

      if (profileError) {
        setErrorMessage(profileError.message || "Unable to load profile.");
        setProfile(null);
        setReels([]);
        setCanViewProfileContent(false);
        setLoading(false);
        return;
      }

      const nextProfile = (profileData as ProfileRow | null) || null;
      setProfile(nextProfile);

      if (!nextProfile) {
        setErrorMessage("Profile not found.");
        setReels([]);
        setCanViewProfileContent(false);
        setLoading(false);
        return;
      }

      const profileIsPrivate = Boolean(nextProfile.is_private);
      const viewerIsOwner = Boolean(viewerId && viewerId === profileId);
      let viewerIsFriend = false;

      if (profileIsPrivate && viewerId && !viewerIsOwner) {
        const { data: friendshipData, error: friendshipError } = await supabase
          .from("friend_requests")
          .select("id")
          .eq("status", "accepted")
          .or(
            `and(sender_id.eq.${viewerId},receiver_id.eq.${profileId}),and(sender_id.eq.${profileId},receiver_id.eq.${viewerId})`
          )
          .limit(1);

        if (!isMounted) return;

        if (!friendshipError) {
          viewerIsFriend = Boolean(friendshipData && friendshipData.length > 0);
        }
      }

      const canView = !profileIsPrivate || viewerIsOwner || viewerIsFriend;
      setCanViewProfileContent(canView);

      if (!canView) {
        setReels([]);
        setLoading(false);
        return;
      }

      const { data: reelsData, error: reelsError } = await supabase
        .from("reels")
        .select("id, user_id, title, video_url, poster_url, caption, created_at")
        .eq("user_id", profileId)
        .order("created_at", { ascending: false });

      if (!isMounted) return;

      if (reelsError) {
        setErrorMessage(reelsError.message || "Unable to load reels.");
        setReels([]);
        setLoading(false);
        return;
      }

      const loadedReels = (reelsData as Reel[]) || [];
      const reelIds = loadedReels.map((reel) => reel.id).filter(Boolean);
      let reelsWithViews = loadedReels;

      if (reelIds.length > 0) {
        const { data: viewRows, error: viewError } = await supabase
          .from("reel_view_totals")
          .select("reel_id, views")
          .in("reel_id", reelIds);

        if (viewError) {
          console.warn("Profile Reel views fetch skipped:", viewError.message);
        } else {
          const viewMap = new Map(
            (viewRows || []).map((row) => [
              String(row.reel_id || ""),
              Number(row.views || 0),
            ])
          );

          reelsWithViews = loadedReels.map((reel) => ({
            ...reel,
            views: viewMap.get(reel.id) || 0,
          }));
        }
      }

      setReels(reelsWithViews);
      setLoading(false);
    }

    void loadPage();

    return () => {
      isMounted = false;
    };
  }, [profileId]);

  return (
    <div
      className="profile-reels-grid-page"
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--parapost-accent, #a855f7) 22%, transparent), transparent 34%), radial-gradient(circle at 92% 10%, rgba(124,58,237,0.16), transparent 30%), #07090d",
        color: "#ffffff",
        padding: "24px 14px 64px",
      }}
    >
      <div
        className="profile-reels-shell"
        style={{
          width: "100%",
          maxWidth: "980px",
          margin: "0 auto",
        }}
      >
        <div
          className="profile-reels-header-card parapost-accent-card"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--parapost-accent, #a855f7) 18%, transparent), rgba(255,255,255,0.055) 36%, rgba(10,13,24,0.94) 100%)",
            borderRadius: "30px",
            padding: "18px",
            border: "1px solid color-mix(in srgb, var(--parapost-accent, #a855f7) 30%, rgba(255,255,255,0.10))",
            backdropFilter: "blur(14px)",
            boxShadow:
              "0 18px 44px rgba(0,0,0,0.28), 0 0 36px color-mix(in srgb, var(--parapost-accent, #a855f7) 16%, transparent)",
            marginBottom: "18px",
          }}
        >
          <div
            className="profile-reels-header-row"
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "14px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div className="profile-reels-title-cluster" style={{ minWidth: 0, display: "flex", alignItems: "center", gap: "14px" }}>
              <div style={avatarStyle}>
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : (
                  getProfileInitial(profile)
                )}
              </div>

              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "8px",
                    padding: "6px 10px",
                    borderRadius: "999px",
                    background:
                      "color-mix(in srgb, var(--parapost-accent, #a855f7) 18%, rgba(255,255,255,0.06))",
                    border:
                      "1px solid color-mix(in srgb, var(--parapost-accent, #a855f7) 28%, rgba(255,255,255,0.12))",
                    color: "#f3e8ff",
                    fontSize: "11px",
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Parapost Reels
                </div>
                <h1
                  style={{
                    margin: 0,
                    fontSize: "1.8rem",
                    lineHeight: 1.1,
                  }}
                >
                  {getProfileName(profile)} Reels
                </h1>
                <p
                  style={{
                    margin: "8px 0 0",
                    color: "#9ca3af",
                    fontSize: "0.95rem",
                  }}
                >
                  {isPrivateLocked
                    ? "This profile keeps Reels private unless you are connected."
                    : "Browse this profile’s reels in grid view. Portrait and landscape videos are supported."}
                </p>
              </div>
            </div>

            <div
              className="profile-reels-header-actions"
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <Link
                href={`/profile/${profileId}`}
                className="profile-reels-back-button parapost-accent-button"
                style={secondaryLinkStyle}
              >
                Back to Profile
              </Link>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={cardStyle}>Loading reels...</div>
        ) : errorMessage ? (
          <div style={{ ...cardStyle, color: "#ffb4b4" }}>{errorMessage}</div>
        ) : isPrivateLocked ? (
          <div style={privateCardStyle}>
            <div style={privateIconStyle}>🔒</div>
            <h2 style={privateTitleStyle}>This user’s profile is private.</h2>
            <p style={privateTextStyle}>
              You can still view this profile’s basic information, but their Reels are hidden unless you are connected.
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap", marginTop: "18px" }}>
              <Link href={`/profile/${profileId}`} style={primaryLinkStyle}>
                View Profile
              </Link>
              <Link href="/dashboard" style={secondaryLinkStyle}>
                Back to Dashboard
              </Link>
            </div>
          </div>
        ) : reels.length === 0 ? (
          <div style={cardStyle}>No reels shared yet.</div>
        ) : (
          <>
            <div
              className="profile-reels-count-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "center",
                marginBottom: "12px",
                flexWrap: "wrap",
              }}
            >
              <div
                className="profile-reels-count-chip"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  borderRadius: "999px",
                  background:
                    "linear-gradient(135deg, color-mix(in srgb, var(--parapost-accent, #a855f7) 18%, transparent), rgba(255,255,255,0.055))",
                  border:
                    "1px solid color-mix(in srgb, var(--parapost-accent, #a855f7) 24%, rgba(255,255,255,0.10))",
                  color: "#f4f0ff",
                  fontSize: "0.92rem",
                  fontWeight: 800,
                }}
              >
                {reels.length} {reels.length === 1 ? "reel" : "reels"}
              </div>
            </div>

            <div
              className="profile-reels-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
                gap: "14px",
              }}
            >
              {reels.map((reel) => (
                <Link
                  key={reel.id}
                  href={`/profile/${profileId}/reels/view?reelId=${reel.id}`}
                  style={{
                    display: "block",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div
                    className="profile-reel-card"
                    style={{
                      position: "relative",
                      aspectRatio: "9 / 16",
                      borderRadius: "24px",
                      overflow: "hidden",
                      background:
                        "linear-gradient(180deg, rgba(10,13,24,0.96), #000)",
                      border:
                        "1px solid color-mix(in srgb, var(--parapost-accent, #a855f7) 20%, rgba(255,255,255,0.12))",
                      boxShadow:
                        "0 14px 32px rgba(0,0,0,0.30), 0 0 22px color-mix(in srgb, var(--parapost-accent, #a855f7) 10%, transparent)",
                      transition:
                        "transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease",
                    }}
                  >
                    {reel.video_url ? (
                      <>
                        {reel.poster_url ? (
                          <img
                            src={reel.poster_url}
                            alt={reel.title || reel.caption || "Parapost Reel preview"}
                            loading="lazy"
                            decoding="async"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                              background: "#000",
                            }}
                          />
                        ) : (
                          <video
                            src={reel.video_url || undefined}
                            muted
                            playsInline
                            preload="metadata"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                              background: "#000",
                            }}
                          />
                        )}
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            background:
                              "linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.00) 38%, rgba(0,0,0,0.72) 100%)",
                          }}
                        />

                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            height: "3px",
                            background:
                              "linear-gradient(90deg, var(--parapost-accent, #a855f7), rgba(255,255,255,0.72))",
                            opacity: 0.88,
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            top: "10px",
                            right: "10px",
                            width: "36px",
                            height: "36px",
                            borderRadius: 999,
                            display: "grid",
                            placeItems: "center",
                            background:
                              "linear-gradient(135deg, var(--parapost-accent, #a855f7), color-mix(in srgb, var(--parapost-accent, #a855f7) 55%, #ffffff))",
                            color: "#ffffff",
                            fontSize: "13px",
                            fontWeight: 900,
                            boxShadow: "0 10px 22px rgba(0,0,0,0.34)",
                          }}
                        >
                          ▶
                        </div>
                        <div
                          style={{
                            position: "absolute",
                            left: "10px",
                            right: "10px",
                            bottom: "10px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                          }}
                        >
                          {reel.title ? (
                            <div
                              style={{
                                color: "#fff",
                                fontSize: "13px",
                                fontWeight: 850,
                                lineHeight: 1.25,
                                textShadow: "0 2px 10px rgba(0,0,0,0.55)",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {reel.title}
                            </div>
                          ) : null}

                          {reel.caption ? (
                            <div
                              style={{
                                color: "rgba(255,255,255,0.88)",
                                fontSize: "11.5px",
                                fontWeight: 650,
                                lineHeight: 1.25,
                                textShadow: "0 2px 9px rgba(0,0,0,0.58)",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {reel.caption}
                            </div>
                          ) : null}

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "8px",
                              color: "rgba(255,255,255,0.86)",
                              fontSize: "12px",
                            }}
                          >
                            <span>{formatDate(reel.created_at)}</span>
                            <span
                              aria-label={`${Number(reel.views || 0)} views`}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                minHeight: "22px",
                                padding: "0 7px",
                                borderRadius: "999px",
                                border: "1px solid rgba(255,255,255,0.14)",
                                background: "rgba(0,0,0,0.52)",
                                color: "#ffffff",
                                fontSize: "10.5px",
                                fontWeight: 900,
                                whiteSpace: "nowrap",
                                backdropFilter: "blur(8px)",
                                WebkitBackdropFilter: "blur(8px)",
                              }}
                            >
                              <span aria-hidden="true">▶</span>
                              {formatCompactCount(reel.views)}
                            </span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#fff",
                          background:
                            "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
                          padding: "16px",
                          textAlign: "center",
                        }}
                      >
                        No video
                      </div>
                    )}
                  </div>

                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      <style jsx global>{`
        .profile-reels-grid-page,
        .profile-reels-header-card,
        .profile-reel-card,
        .profile-reels-back-button,
        .profile-reel-open-pill {
          --profile-reels-accent: var(--parapost-accent, #a855f7);
        }

        .profile-reels-grid-page {
          min-height: 100dvh !important;
          overflow-x: hidden;
          padding-bottom: max(96px, calc(76px + env(safe-area-inset-bottom))) !important;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
        }

        .profile-reels-shell {
          width: min(100%, 1100px) !important;
        }

        .profile-reels-header-row,
        .profile-reels-title-cluster,
        .profile-reels-header-actions,
        .profile-reels-count-row {
          min-width: 0;
        }

        .profile-reels-back-button,
        .profile-reel-open-pill {
          transition: transform 160ms ease, filter 160ms ease, box-shadow 160ms ease;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .profile-reel-card {
          min-width: 0;
          will-change: transform;
        }

        .profile-reel-card:hover {
          transform: translateY(-3px);
          border-color: color-mix(in srgb, var(--parapost-accent, #a855f7) 58%, rgba(255,255,255,0.18)) !important;
          box-shadow:
            0 18px 40px rgba(0,0,0,0.36),
            0 0 34px color-mix(in srgb, var(--parapost-accent, #a855f7) 22%, transparent) !important;
        }

        .profile-reels-back-button:hover,
        .profile-reel-open-pill:hover {
          filter: brightness(1.08);
          transform: translateY(-1px);
        }

        @media (max-width: 360px) {
          .profile-reels-grid-page {
            padding: 12px 9px max(98px, calc(82px + env(safe-area-inset-bottom))) !important;
          }

          .profile-reels-header-card {
            border-radius: 20px !important;
            padding: 12px !important;
            margin-bottom: 12px !important;
          }

          .profile-reels-header-row {
            align-items: flex-start !important;
          }

          .profile-reels-title-cluster {
            gap: 10px !important;
            align-items: flex-start !important;
          }

          .profile-reels-title-cluster h1 {
            font-size: 1.28rem !important;
            line-height: 1.12 !important;
            word-break: break-word;
          }

          .profile-reels-title-cluster p {
            font-size: 0.82rem !important;
            line-height: 1.45 !important;
          }

          .profile-reels-header-actions,
          .profile-reels-header-actions a {
            width: 100% !important;
          }

          .profile-reels-header-actions a {
            justify-content: center !important;
            min-height: 40px !important;
            padding: 9px 12px !important;
          }

          .profile-reels-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 9px !important;
          }

          .profile-reel-card {
            border-radius: 17px !important;
          }

          .profile-reels-count-chip {
            width: 100%;
            justify-content: center;
          }
        }

        @media (min-width: 361px) and (max-width: 760px) {
          .profile-reels-grid-page {
            padding: 16px 11px max(104px, calc(84px + env(safe-area-inset-bottom))) !important;
          }

          .profile-reels-header-card {
            border-radius: 24px !important;
            padding: 14px !important;
            margin-bottom: 14px !important;
          }

          .profile-reels-title-cluster {
            gap: 12px !important;
          }

          .profile-reels-title-cluster h1 {
            font-size: 1.45rem !important;
            line-height: 1.12 !important;
          }

          .profile-reels-title-cluster p {
            font-size: 0.88rem !important;
            line-height: 1.5 !important;
          }

          .profile-reels-header-actions {
            width: 100%;
          }

          .profile-reels-header-actions a {
            flex: 1 1 170px;
            justify-content: center !important;
          }

          .profile-reels-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 11px !important;
          }

          .profile-reel-card {
            border-radius: 20px !important;
          }
        }

        @media (min-width: 761px) and (max-width: 1024px) {
          .profile-reels-grid-page {
            padding: 22px 18px max(112px, calc(88px + env(safe-area-inset-bottom))) !important;
          }

          .profile-reels-shell {
            max-width: 940px !important;
          }

          .profile-reels-header-card {
            padding: 18px !important;
            border-radius: 28px !important;
          }

          .profile-reels-grid {
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)) !important;
            gap: 14px !important;
          }

          .profile-reels-header-actions a {
            min-height: 42px !important;
          }
        }

        @media (min-width: 1025px) and (max-width: 1366px) {
          .profile-reels-grid-page {
            padding: 24px 22px 76px !important;
          }

          .profile-reels-shell {
            max-width: 1120px !important;
          }

          .profile-reels-grid {
            grid-template-columns: repeat(auto-fill, minmax(185px, 1fr)) !important;
            gap: 15px !important;
          }
        }

        @media (min-width: 1367px) {
          .profile-reels-shell {
            max-width: 1180px !important;
          }

          .profile-reels-grid {
            grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)) !important;
          }
        }

        @media (max-height: 560px) and (orientation: landscape) {
          .profile-reels-grid-page {
            padding-bottom: max(76px, calc(60px + env(safe-area-inset-bottom))) !important;
          }

          .profile-reels-header-card {
            padding: 12px !important;
            border-radius: 22px !important;
          }

          .profile-reels-title-cluster h1 {
            font-size: 1.25rem !important;
          }

          .profile-reels-title-cluster p {
            display: none !important;
          }

          .profile-reels-grid {
            grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)) !important;
            gap: 10px !important;
          }

          .profile-reel-card {
            border-radius: 18px !important;
          }
        }
      `}</style>
    </div>
  );
}

const cardStyle: CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.035))",
  borderRadius: "24px",
  padding: "18px",
  border:
    "1px solid color-mix(in srgb, var(--parapost-accent, #a855f7) 20%, rgba(255,255,255,0.10))",
  boxShadow:
    "0 10px 26px rgba(0,0,0,0.22), 0 0 22px color-mix(in srgb, var(--parapost-accent, #a855f7) 8%, transparent)",
};

const avatarStyle: CSSProperties = {
  width: "54px",
  height: "54px",
  flex: "0 0 auto",
  borderRadius: "999px",
  overflow: "hidden",
  display: "grid",
  placeItems: "center",
  background:
    "linear-gradient(135deg, var(--parapost-accent, #a855f7), rgba(15,23,42,0.95))",
  border:
    "1px solid color-mix(in srgb, var(--parapost-accent, #a855f7) 36%, rgba(255,255,255,0.14))",
  boxShadow:
    "0 0 22px color-mix(in srgb, var(--parapost-accent, #a855f7) 28%, transparent)",
  color: "#fff",
  fontSize: "22px",
  fontWeight: 800,
};

const privateCardStyle: CSSProperties = {
  ...cardStyle,
  minHeight: "360px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: "34px 18px",
};

const privateIconStyle: CSSProperties = {
  width: "58px",
  height: "58px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background:
    "color-mix(in srgb, var(--parapost-accent, #a855f7) 16%, rgba(255,255,255,0.08))",
  border:
    "1px solid color-mix(in srgb, var(--parapost-accent, #a855f7) 24%, rgba(255,255,255,0.12))",
  fontSize: "24px",
  marginBottom: "16px",
};

const privateTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.55rem",
  lineHeight: 1.15,
};

const privateTextStyle: CSSProperties = {
  margin: "12px auto 0",
  maxWidth: "520px",
  color: "#aeb7c6",
  lineHeight: 1.6,
};

const primaryLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
  background:
    "linear-gradient(135deg, var(--parapost-accent, #a855f7), #7c3aed)",
  color: "#ffffff",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 800,
  minHeight: "42px",
};

const secondaryLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
  background:
    "color-mix(in srgb, var(--parapost-accent, #a855f7) 12%, rgba(255,255,255,0.055))",
  color: "white",
  border:
    "1px solid color-mix(in srgb, var(--parapost-accent, #a855f7) 24%, rgba(255,255,255,0.10))",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 600,
  minHeight: "42px",
};

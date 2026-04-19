"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
  is_online?: boolean | null;
};

type ReelRow = {
  id: string;
  user_id: string | null;
  creator_profile_id: string | null;
  title: string | null;
  caption: string | null;
  video_url: string | null;
  poster_url: string | null;
  created_at?: string | null;
};

export default function OwnerReelsPage() {
  const params = useParams();
  const profileId = useMemo(() => {
    const raw = params?.id;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] || "" : "";
  }, [params]);

  const [viewerId, setViewerId] = useState("");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [reels, setReels] = useState<ReelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadPage = async () => {
      if (!profileId) {
        setErrorMessage("Profile not found.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      setViewerId(user?.id || "");

      const [profileResult, reelsResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url, bio, is_online")
          .eq("id", profileId)
          .maybeSingle(),
        supabase
          .from("reels")
          .select("id, user_id, creator_profile_id, title, caption, video_url, poster_url, created_at")
          .eq("user_id", profileId)
          .order("created_at", { ascending: false }),
      ]);

      if (profileResult.error) {
        setErrorMessage(profileResult.error.message || "Unable to load profile.");
        setProfile(null);
        setReels([]);
        setLoading(false);
        return;
      }

      setProfile((profileResult.data as ProfileRow | null) || null);

      if (reelsResult.error) {
        setErrorMessage(reelsResult.error.message || "Unable to load reels.");
        setReels([]);
        setLoading(false);
        return;
      }

      setReels((reelsResult.data as ReelRow[]) || []);
      setLoading(false);
    };

    loadPage();
  }, [profileId]);

  const isOwnProfile = !!viewerId && viewerId === profileId;

  const getInitial = (name?: string | null, username?: string | null) => {
    const value = name || username || "U";
    return value.charAt(0).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-[#07090d] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        <div style={pageHeaderStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            <div style={{ position: "relative", width: "72px", height: "72px", flexShrink: 0 }}>
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Profile"
                  style={{
                    width: "72px",
                    height: "72px",
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "2px solid rgba(255,255,255,0.10)",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "72px",
                    height: "72px",
                    borderRadius: "50%",
                    background: "#374151",
                    color: "#f9fafb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: "24px",
                    border: "2px solid rgba(255,255,255,0.10)",
                  }}
                >
                  {getInitial(profile?.full_name, profile?.username)}
                </div>
              )}

              {profile?.is_online && (
                <span
                  style={{
                    position: "absolute",
                    right: "4px",
                    bottom: "4px",
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    background: "#22c55e",
                    border: "3px solid #07090d",
                    boxShadow: "0 0 8px rgba(34,197,94,0.65)",
                  }}
                />
              )}
            </div>

            <div>
              <h1 style={{ margin: 0, fontSize: "30px", lineHeight: 1.05 }}>
                {profile?.full_name || profile?.username || "Reels"}
              </h1>
              <p style={{ margin: "6px 0 0", color: "#9ca3af", fontSize: "14px" }}>
                @{profile?.username || "no-username"} · Reels
              </p>
              <p style={{ margin: "8px 0 0", color: "#d1d5db", fontSize: "14px" }}>
                {isOwnProfile
                  ? "Your uploaded reels live here."
                  : "Only this profile owner's reels are shown here."}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link href={`/profile/${profileId}`} style={secondaryLinkStyle}>
              Back to Profile
            </Link>
            <Link href="/dashboard" style={secondaryLinkStyle}>
              Back to Homepage
            </Link>
            <Link href="/reels" style={primaryLinkStyle}>
              Explore Reels
            </Link>
          </div>
        </div>

        <div style={mainCardStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              marginBottom: "16px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ marginTop: 0, marginBottom: "4px" }}>Reels</h2>
              <p style={{ margin: 0, color: "#9ca3af", fontSize: "13px" }}>
                Compact owner-only reel cards. Desktop fits six across. Mobile fits three across.
              </p>
            </div>

            {reels.length > 0 && (
              <div style={pillMutedStyle}>
                {reels.length} reel{reels.length === 1 ? "" : "s"}
              </div>
            )}
          </div>

          {loading ? (
            <div className="owner-reels-grid" style={gridStyle}>
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} style={cardShellStyle} />
              ))}
            </div>
          ) : errorMessage ? (
            <div style={messageBoxStyle}>{errorMessage}</div>
          ) : !profile ? (
            <div style={messageBoxStyle}>This profile could not be found.</div>
          ) : reels.length === 0 ? (
            <div style={messageBoxStyle}>
              {isOwnProfile ? "You have not uploaded any reels yet." : "This profile has not uploaded any reels yet."}
            </div>
          ) : (
            <div className="owner-reels-grid" style={gridStyle}>
              {reels.map((reel) => (
                <Link
                  key={reel.id}
                  href={`/reels#${reel.id}`}
                  style={cardLinkStyle}
                >
                  {reel.video_url ? (
                    <video
                      src={reel.video_url}
                      poster={reel.poster_url || undefined}
                      muted
                      loop
                      autoPlay
                      playsInline
                      preload="metadata"
                      style={videoStyle}
                    />
                  ) : reel.poster_url ? (
                    <img
                      src={reel.poster_url}
                      alt={reel.title || "Reel"}
                      style={videoStyle}
                    />
                  ) : (
                    <div style={videoFallbackStyle} />
                  )}

                  <div style={overlayStyle} />

                  <div style={overlayContentStyle}>
                    <span style={reelPillStyle}>Reel</span>

                    <div style={titleStyle}>
                      {reel.title?.trim() || "Untitled Reel"}
                    </div>

                    <div style={handleStyle}>
                      @{profile.username || "no-username"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <style jsx>{`
          .owner-reels-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          @media (min-width: 1024px) {
            .owner-reels-grid {
              grid-template-columns: repeat(6, minmax(0, 1fr));
            }
          }
        `}</style>
      </div>
    </div>
  );
}

const pageHeaderStyle: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 100%)",
  borderRadius: "28px",
  padding: "18px",
  border: "1px solid rgba(255,255,255,0.10)",
  backdropFilter: "blur(10px)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
  flexWrap: "wrap",
  marginBottom: "18px",
};

const mainCardStyle: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 100%)",
  borderRadius: "28px",
  padding: "18px",
  border: "1px solid rgba(255,255,255,0.10)",
  backdropFilter: "blur(10px)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
};

const primaryLinkStyle: CSSProperties = {
  background: "white",
  color: "black",
  border: "none",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 700,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  minHeight: "42px",
};

const secondaryLinkStyle: CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  minHeight: "42px",
};

const pillMutedStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "#d1d5db",
  padding: "8px 12px",
  fontSize: "12px",
};

const messageBoxStyle: CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#f9fafb",
  borderRadius: "20px",
  padding: "14px",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
  width: "100%",
};

const cardShellStyle: CSSProperties = {
  borderRadius: "16px",
  height: "220px",
  background: "#0b1020",
  border: "1px solid rgba(255,255,255,0.08)",
};

const cardLinkStyle: CSSProperties = {
  position: "relative",
  borderRadius: "16px",
  overflow: "hidden",
  textDecoration: "none",
  color: "white",
  display: "block",
  height: "220px",
  background: "#0b1020",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 10px 22px rgba(0,0,0,0.22)",
};

const videoStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  background: "#0b1020",
};

const videoFallbackStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
};

const overlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.78) 100%)",
};

const overlayContentStyle: CSSProperties = {
  position: "absolute",
  left: "10px",
  right: "10px",
  bottom: "10px",
  display: "flex",
  flexDirection: "column",
  gap: "5px",
};

const reelPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.14)",
  border: "1px solid rgba(255,255,255,0.18)",
  padding: "4px 8px",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.02em",
};

const titleStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: "13px",
  lineHeight: 1.15,
};

const handleStyle: CSSProperties = {
  fontSize: "11px",
  color: "#d1d5db",
};

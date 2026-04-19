"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type ReelDbRow = {
  id: string;
  user_id: string | null;
  creator_profile_id: string | null;
  title: string | null;
  caption: string | null;
  video_url: string | null;
  poster_url: string | null;
  created_at?: string | null;
};

type ProfileRow = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type ReelCard = {
  id: string;
  title: string;
  videoUrl: string;
  posterUrl: string;
  creatorHandle: string;
};

const sectionCardStyle: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 100%)",
  borderRadius: "28px",
  padding: "18px",
  border: "1px solid rgba(255,255,255,0.10)",
  backdropFilter: "blur(10px)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
};

const buttonLinkStyle: CSSProperties = {
  background: "white",
  color: "#111827",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 800,
  fontSize: "14px",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};

function formatHandle(username?: string | null) {
  if (!username) return "@user";
  return `@${username.replace(/^@+/, "")}`;
}

function mapCards(reels: ReelDbRow[], profiles: ProfileRow[]) {
  const profileMap = new Map<string, ProfileRow>();
  profiles.forEach((profile) => {
    profileMap.set(profile.id, profile);
  });

  return reels
    .filter((row) => row.id && row.video_url)
    .map((row) => {
      const profileId = row.creator_profile_id || row.user_id || "";
      const profile = profileMap.get(profileId);

      return {
        id: row.id,
        title: row.title?.trim() || "Untitled Reel",
        videoUrl: row.video_url || "",
        posterUrl: row.poster_url || "",
        creatorHandle: formatHandle(profile?.username),
      } as ReelCard;
    });
}

export default function DashboardReelsSection() {
  const [reels, setReels] = useState<ReelCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const previewCards = useMemo(() => reels.slice(0, 6), [reels]);

  useEffect(() => {
    const fetchReels = async () => {
      setIsLoading(true);

      const { data: reelRows, error: reelsError } = await supabase
        .from("reels")
        .select("id, user_id, creator_profile_id, title, caption, video_url, poster_url, created_at")
        .order("created_at", { ascending: false })
        .limit(12);

      if (reelsError) {
        console.error("Error fetching dashboard reels:", reelsError.message);
        setReels([]);
        setIsLoading(false);
        return;
      }

      const rows = (reelRows || []) as ReelDbRow[];
      const profileIds = Array.from(
        new Set(
          rows.map((row) => row.creator_profile_id || row.user_id).filter(Boolean)
        )
      ) as string[];

      let profiles: ProfileRow[] = [];

      if (profileIds.length > 0) {
        const { data: profileRows, error: profilesError } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", profileIds);

        if (profilesError) {
          console.error("Error fetching dashboard reel profiles:", profilesError.message);
        } else {
          profiles = (profileRows || []) as ProfileRow[];
        }
      }

      setReels(mapCards(rows, profiles));
      setIsLoading(false);
    };

    fetchReels();
  }, []);

  return (
    <div style={sectionCardStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "14px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ marginTop: 0, marginBottom: "4px" }}>Parapost Reels</h3>
          <p style={{ margin: 0, color: "#9ca3af", fontSize: "13px" }}>
            Explore short-form paranormal clips in a portrait preview strip. Tap any reel to open the full Reels experience.
          </p>
        </div>

        <Link href="/reels" style={buttonLinkStyle}>
          Watch Reels
        </Link>
      </div>

      {isLoading ? (
        <div
          style={{
            display: "flex",
            gap: "12px",
            overflowX: "auto",
            paddingBottom: "4px",
          }}
        >
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              style={{
                minWidth: "180px",
                width: "180px",
                height: "320px",
                borderRadius: "24px",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "#0b1020",
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      ) : previewCards.length === 0 ? (
        <div
          style={{
            border: "1px dashed rgba(255,255,255,0.14)",
            borderRadius: "20px",
            padding: "16px",
            color: "#6b7280",
            fontSize: "13px",
          }}
        >
          No reels yet. Upload the first reel and it will appear here automatically.
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            gap: "12px",
            overflowX: "auto",
            paddingBottom: "4px",
          }}
        >
          {previewCards.slice(0, 3).map((reel) => (
            <Link
              key={reel.id}
              href={`/reels#${reel.id}`}
              style={{
                position: "relative",
                minWidth: "180px",
                width: "180px",
                height: "320px",
                borderRadius: "24px",
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.12)",
                textDecoration: "none",
                color: "white",
                display: "block",
                background: "#0b1020",
                boxShadow: "0 10px 26px rgba(0,0,0,0.24)",
                flexShrink: 0,
              }}
            >
              {reel.videoUrl ? (
                <video
                  src={reel.videoUrl}
                  poster={reel.posterUrl || undefined}
                  muted
                  loop
                  autoPlay
                  playsInline
                  preload="metadata"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    background: "#0b1020",
                  }}
                />
              ) : reel.posterUrl ? (
                <img
                  src={reel.posterUrl}
                  alt={reel.title}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
                  }}
                />
              )}

              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.75) 100%)",
                }}
              />

              <div
                style={{
                  position: "absolute",
                  left: "12px",
                  right: "12px",
                  bottom: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    width: "fit-content",
                    borderRadius: "999px",
                    background: "rgba(255,255,255,0.14)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    padding: "5px 9px",
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                  }}
                >
                  Reel
                </span>

                <div style={{ fontWeight: 700, fontSize: "14px", lineHeight: 1.2 }}>
                  {reel.title}
                </div>

                <div style={{ fontSize: "12px", color: "#d1d5db" }}>
                  {reel.creatorHandle}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

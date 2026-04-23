"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Reel = {
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
  avatar_url: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
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

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      if (!profileId) {
        if (!isMounted) return;
        setErrorMessage("Profile not found.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage("");

      const [profileResult, reelsResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url")
          .eq("id", profileId)
          .maybeSingle(),
        supabase
          .from("reels")
          .select("id, user_id, video_url, caption, created_at")
          .eq("user_id", profileId)
          .order("created_at", { ascending: false }),
      ]);

      if (!isMounted) return;

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

      setReels((reelsResult.data as Reel[]) || []);
      setLoading(false);
    }

    loadPage();

    return () => {
      isMounted = false;
    };
  }, [profileId]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#07090d",
        color: "#ffffff",
        padding: "22px 14px 56px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "980px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 100%)",
            borderRadius: "28px",
            padding: "18px",
            border: "1px solid rgba(255,255,255,0.10)",
            backdropFilter: "blur(10px)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
            marginBottom: "18px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "14px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: "1.8rem",
                  lineHeight: 1.1,
                }}
              >
                {profile?.full_name || profile?.username || "Profile"} Reels
              </h1>
              <p
                style={{
                  margin: "8px 0 0",
                  color: "#9ca3af",
                  fontSize: "0.95rem",
                }}
              >
                Browse this profile’s reels in grid view.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <Link
                href={`/profile/${profileId}`}
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
        ) : reels.length === 0 ? (
          <div style={cardStyle}>No reels shared yet.</div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "center",
                marginBottom: "12px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ color: "#d1d5db", fontSize: "0.95rem" }}>
                {reels.length} {reels.length === 1 ? "reel" : "reels"}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
                gap: "12px",
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
                    style={{
                      position: "relative",
                      aspectRatio: "9 / 16",
                      borderRadius: "22px",
                      overflow: "hidden",
                      background: "#000",
                      border: "1px solid rgba(255,255,255,0.10)",
                      boxShadow: "0 10px 24px rgba(0,0,0,0.24)",
                    }}
                  >
                    {reel.video_url ? (
                      <>
                        <video
                          src={reel.video_url}
                          muted
                          playsInline
                          preload="metadata"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            background:
                              "linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.00) 45%, rgba(0,0,0,0.60) 100%)",
                          }}
                        />
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
                          <div
                            style={{
                              display: "inline-flex",
                              width: "fit-content",
                              alignItems: "center",
                              borderRadius: "999px",
                              background: "rgba(0,0,0,0.56)",
                              color: "#fff",
                              padding: "6px 10px",
                              fontSize: "12px",
                              fontWeight: 700,
                              border: "1px solid rgba(255,255,255,0.14)",
                            }}
                          >
                            Open Reel
                          </div>
                          {reel.created_at ? (
                            <div
                              style={{
                                color: "rgba(255,255,255,0.86)",
                                fontSize: "12px",
                              }}
                            >
                              {formatDate(reel.created_at)}
                            </div>
                          ) : null}
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

                  {reel.caption ? (
                    <div
                      style={{
                        marginTop: "8px",
                        color: "#d1d5db",
                        fontSize: "13px",
                        lineHeight: 1.4,
                        padding: "0 4px",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {reel.caption}
                    </div>
                  ) : null}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
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

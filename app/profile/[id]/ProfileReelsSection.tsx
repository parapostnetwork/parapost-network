"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

// ✅ FIX: Add proper prop type
type ProfileReelsSectionProps = {
  profileUserId: string;
};

// ✅ Optional but recommended: type your reel data
type Reel = {
  id: string;
  video_url: string;
  poster_url?: string;
  title?: string;
  created_at?: string;
};

export default function ProfileReelsSection({
  profileUserId,
}: ProfileReelsSectionProps) {
  const [reels, setReels] = useState<Reel[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("reels")
        .select("*")
        .eq("user_id", profileUserId)
        .order("created_at", { ascending: false });

      setReels(data || []);
    };

    load();
  }, [profileUserId]);

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.05)",
        borderRadius: "20px",
        padding: "16px",
        marginTop: "16px",
      }}
    >
      <h3 style={{ marginBottom: "10px" }}>Reels</h3>

      <div style={{ display: "flex", gap: "12px", overflowX: "auto" }}>
        {reels.map((reel) => (
          <Link
            key={reel.id}
            href={`/reels#${reel.id}`}
            style={{
              width: "180px",
              height: "320px",
              borderRadius: "16px",
              overflow: "hidden",
              position: "relative",
              flexShrink: 0,
            }}
          >
            <video
              src={reel.video_url}
              poster={reel.poster_url}
              muted
              loop
              autoPlay
              playsInline
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />

            <div
              style={{
                position: "absolute",
                bottom: "10px",
                left: "10px",
                right: "10px",
                color: "white",
                fontSize: "13px",
              }}
            >
              <div style={{ fontWeight: "bold" }}>
                {reel.title || "Untitled"}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
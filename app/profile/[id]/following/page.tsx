"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ProfileListRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  location?: string | null;
  is_online?: boolean | null;
  last_seen_at?: string | null;
};

type FollowingRelationRow = {
  follower_id: string | null;
  following_id: string | null;
};

function getInitial(name?: string | null, username?: string | null) {
  const value = name || username || "P";
  return value.charAt(0).toUpperCase();
}

function getDisplayName(profile?: ProfileListRow | null) {
  return profile?.full_name || profile?.username || "Parapost member";
}

function getUsername(profile?: ProfileListRow | null) {
  return profile?.username ? `@${profile.username}` : "@parapost";
}

function ProfileAvatar({ profile }: { profile: ProfileListRow }) {
  return (
    <div style={avatarShellStyle}>
      {profile.avatar_url ? (
        <img src={profile.avatar_url} alt={getDisplayName(profile)} style={avatarImageStyle} />
      ) : (
        <span style={avatarFallbackStyle}>{getInitial(profile.full_name, profile.username)}</span>
      )}
    </div>
  );
}

export default function ProfileFollowingPage() {
  const params = useParams();
  const router = useRouter();

  const profileId = useMemo(() => {
    const raw = params?.id;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] || "" : "";
  }, [params]);

  const [viewerId, setViewerId] = useState("");
  const [profile, setProfile] = useState<ProfileListRow | null>(null);
  const [following, setFollowing] = useState<ProfileListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const isOwnProfile = Boolean(viewerId && profileId && viewerId === profileId);

  useEffect(() => {
    let active = true;

    async function loadFollowing() {
      if (!profileId) return;

      setLoading(true);
      setErrorMessage("");

      const { data: userData } = await supabase.auth.getUser();
      const nextViewerId = userData.user?.id || "";

      const [profileResult, followingResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, full_name, bio, avatar_url, location, is_online, last_seen_at")
          .eq("id", profileId)
          .maybeSingle(),
        supabase
          .from("followers")
          .select("follower_id, following_id")
          .eq("follower_id", profileId),
      ]);

      if (!active) return;

      if (profileResult.error) {
        setErrorMessage(profileResult.error.message);
        setLoading(false);
        return;
      }

      if (followingResult.error) {
        setErrorMessage(followingResult.error.message);
        setLoading(false);
        return;
      }

      const relationRows = ((followingResult.data as FollowingRelationRow[]) || []).filter(Boolean);
      const followingIds = Array.from(
        new Set(relationRows.map((row) => row.following_id).filter(Boolean) as string[])
      );

      let followingProfiles: ProfileListRow[] = [];

      if (followingIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, username, full_name, bio, avatar_url, location, is_online, last_seen_at")
          .in("id", followingIds);

        if (!active) return;

        if (profilesError) {
          setErrorMessage(profilesError.message);
          setLoading(false);
          return;
        }

        const profileMap = new Map(((profilesData as ProfileListRow[]) || []).map((row) => [row.id, row]));
        followingProfiles = followingIds.map((id) => profileMap.get(id)).filter(Boolean) as ProfileListRow[];
      }

      setViewerId(nextViewerId);
      setProfile((profileResult.data as ProfileListRow | null) || null);
      setFollowing(followingProfiles);
      setLoading(false);
    }

    void loadFollowing();

    return () => {
      active = false;
    };
  }, [profileId]);

  const unfollowUser = async (targetUserId: string) => {
    if (!viewerId || !profileId || viewerId !== profileId || !targetUserId) return;

    setSavingUserId(targetUserId);

    const { error } = await supabase
      .from("followers")
      .delete()
      .eq("follower_id", profileId)
      .eq("following_id", targetUserId);

    if (error) {
      alert(`Could not unfollow: ${error.message}`);
      setSavingUserId("");
      return;
    }

    setFollowing((current) => current.filter((item) => item.id !== targetUserId));
    setSavingUserId("");
  };

  return (
    <main style={pageStyle}>
      <section style={shellStyle}>
        <button type="button" onClick={() => router.back()} style={backButtonStyle}>
          ‹ Back
        </button>

        <div style={headerCardStyle}>
          <p style={eyebrowStyle}>Parapost Network</p>
          <h1 style={titleStyle}>Following</h1>
          <p style={subtitleStyle}>
            Profiles {profile ? getDisplayName(profile) : "this member"} follows.
          </p>
          <div style={metaRowStyle}>
            <Link href={`/profile/${profileId}`} style={smallLinkStyle}>View profile</Link>
            <Link href={`/profile/${profileId}/followers`} style={smallLinkStyle}>Followers</Link>
          </div>
        </div>

        <div style={listCardStyle}>
          <div style={listHeaderStyle}>
            <span>{following.length} following</span>
            {isOwnProfile ? <small style={helperTextStyle}>You can unfollow profiles from this list.</small> : null}
          </div>

          {loading ? (
            <div style={emptyStyle}>Loading following...</div>
          ) : errorMessage ? (
            <div style={errorStyle}>{errorMessage}</div>
          ) : following.length === 0 ? (
            <div style={emptyStyle}>Not following anyone yet.</div>
          ) : (
            <div style={rowsStyle}>
              {following.map((item) => (
                <div key={item.id} style={rowStyle}>
                  <Link href={`/profile/${item.id}`} style={profileLinkStyle}>
                    <ProfileAvatar profile={item} />
                    <span style={{ minWidth: 0, overflow: "hidden" }}>
                      <strong style={nameStyle}>{getDisplayName(item)}</strong>
                      <small style={usernameStyle}>{getUsername(item)}</small>
                      {item.bio ? <small style={bioStyle}>{item.bio}</small> : null}
                    </span>
                  </Link>

                  {isOwnProfile ? (
                    <button
                      type="button"
                      onClick={() => unfollowUser(item.id)}
                      disabled={savingUserId === item.id}
                      style={removeButtonStyle}
                    >
                      {savingUserId === item.id ? "Saving..." : "Unfollow"}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "radial-gradient(circle at top left, var(--parapost-accent-strong-glow), transparent 34%), #07090d",
  color: "#fff",
  padding: "24px 14px 96px",
};

const shellStyle: CSSProperties = {
  width: "100%",
  maxWidth: 920,
  margin: "0 auto",
};

const backButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "#e5e7eb",
  borderRadius: 999,
  padding: "10px 14px",
  fontWeight: 850,
  cursor: "pointer",
  marginBottom: 14,
};

const headerCardStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  background: "linear-gradient(135deg, rgba(20,14,38,0.96), rgba(7,9,13,0.98))",
  borderRadius: 26,
  padding: "22px",
  boxShadow: "0 24px 70px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.08)",
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: "var(--parapost-accent-2)",
  textTransform: "uppercase",
  letterSpacing: "0.22em",
  fontSize: 12,
  fontWeight: 950,
};

const titleStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "clamp(32px, 6vw, 54px)",
  letterSpacing: "-0.06em",
  lineHeight: 1,
  fontWeight: 950,
};

const subtitleStyle: CSSProperties = {
  margin: "12px 0 0",
  color: "#cbd5e1",
  fontSize: 15,
  lineHeight: 1.6,
  fontWeight: 650,
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 16,
};

const smallLinkStyle: CSSProperties = {
  color: "#fff",
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  borderRadius: 999,
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 850,
};

const listCardStyle: CSSProperties = {
  marginTop: 16,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(10,12,18,0.92)",
  borderRadius: 26,
  padding: 14,
};

const listHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 8px 14px",
  color: "#f8fafc",
  fontWeight: 950,
};

const helperTextStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: 12,
  fontWeight: 700,
};

const rowsStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  minWidth: 0,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.045)",
  borderRadius: 20,
  padding: 12,
};

const profileLinkStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  minWidth: 0,
  overflow: "hidden",
  color: "#fff",
  textDecoration: "none",
  flex: 1,
};

const avatarShellStyle: CSSProperties = {
  width: 54,
  height: 54,
  minWidth: 54,
  maxWidth: 54,
  flex: "0 0 54px",
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  padding: 3,
  overflow: "hidden",
  boxSizing: "border-box",
  background: "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2))",
  boxShadow: "0 0 20px var(--parapost-accent-glow)",
};

const avatarImageStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  maxWidth: "100%",
  maxHeight: "100%",
  borderRadius: 999,
  objectFit: "cover",
  border: "2px solid #07090d",
  boxSizing: "border-box",
};

const avatarFallbackStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  background: "rgba(7,9,13,0.92)",
  border: "2px solid #07090d",
  fontWeight: 950,
};

const nameStyle: CSSProperties = {
  display: "block",
  color: "#fff",
  fontSize: 15,
  lineHeight: 1.2,
};

const usernameStyle: CSSProperties = {
  display: "block",
  color: "#9ca3af",
  marginTop: 3,
  fontSize: 12,
  fontWeight: 750,
};

const bioStyle: CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "#cbd5e1",
  marginTop: 5,
  fontSize: 12,
  lineHeight: 1.35,
};

const removeButtonStyle: CSSProperties = {
  flex: "0 0 auto",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.07)",
  color: "#e5e7eb",
  borderRadius: 999,
  padding: "9px 12px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const emptyStyle: CSSProperties = {
  color: "#9ca3af",
  textAlign: "center",
  padding: "34px 14px",
  fontWeight: 750,
};

const errorStyle: CSSProperties = {
  color: "#fecaca",
  background: "rgba(127,29,29,0.24)",
  border: "1px solid rgba(248,113,113,0.22)",
  borderRadius: 18,
  padding: 14,
  fontWeight: 750,
};

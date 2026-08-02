"use client";

import Link from "next/link";
import { CSSProperties, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_online: boolean | null;
};

type MutualFriendsPreviewCardProps = {
  currentUserId: string | null;
  profileUserId: string;
  maxAvatars?: number;
  href?: string;
  cardStyle?: CSSProperties;
  titleStyle?: CSSProperties;
  textStyle?: CSSProperties;
};

type MutualFriendsState = {
  count: number;
  profiles: ProfileRow[];
};

function getDisplayName(profile: ProfileRow) {
  return profile.full_name?.trim() || profile.username?.trim() || "Friend";
}

function getInitials(profile: ProfileRow) {
  const name = getDisplayName(profile);
  const parts = name.split(" ").filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

function getOtherUserId(
  row: { sender_id?: string | null; receiver_id?: string | null },
  userId: string
) {
  if (row.sender_id === userId) return row.receiver_id ?? null;
  if (row.receiver_id === userId) return row.sender_id ?? null;
  return null;
}

async function getAcceptedFriendIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("friend_requests")
    .select("sender_id, receiver_id, status")
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .eq("status", "accepted");

  if (error) {
    throw new Error(error.message);
  }

  const ids =
    data?.map((row) =>
      getOtherUserId(
        row as { sender_id?: string | null; receiver_id?: string | null },
        userId
      )
    ) ?? [];

  return uniqueIds(ids.filter((value): value is string => Boolean(value)));
}

async function getMutualFriends(
  currentUserId: string,
  profileUserId: string,
  maxAvatars: number
): Promise<MutualFriendsState> {
  const [currentUserFriends, profileUserFriends] = await Promise.all([
    getAcceptedFriendIds(currentUserId),
    getAcceptedFriendIds(profileUserId),
  ]);

  const profileFriendSet = new Set(profileUserFriends);
  const mutualIds = uniqueIds(
    currentUserFriends.filter((id) => profileFriendSet.has(id))
  );

  if (!mutualIds.length) {
    return { count: 0, profiles: [] };
  }

  const previewIds = mutualIds.slice(0, maxAvatars);

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url, is_online")
    .in("id", previewIds);

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const typedProfiles = ((profiles ?? []) as ProfileRow[]).map((profile) => ({
    ...profile,
    is_online: profile.is_online ?? null,
  }));

  const orderedProfiles: ProfileRow[] = previewIds
    .map((id) => typedProfiles.find((profile) => profile.id === id))
    .filter((profile): profile is ProfileRow => Boolean(profile));

  return {
    count: mutualIds.length,
    profiles: orderedProfiles,
  };
}

function Avatar({
  profile,
  size = 42,
}: {
  profile: ProfileRow;
  size?: number;
}) {
  const imageSize = `${size}px`;
  const displayName = getDisplayName(profile);

  return (
    <Link
      href={`/profile/${profile.id}`}
      title={displayName}
      aria-label={`View ${displayName}'s profile`}
      style={{
        width: imageSize,
        height: imageSize,
        minWidth: imageSize,
        borderRadius: "999px",
        overflow: "visible",
        position: "relative",
        border: "2px solid rgba(7,9,13,0.95)",
        boxShadow: "0 10px 20px rgba(0,0,0,0.28)",
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#f9fafb",
        fontSize: "0.78rem",
        fontWeight: 700,
        textDecoration: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {profile.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.avatar_url}
          alt={displayName}
          loading="lazy"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            borderRadius: "999px",
          }}
        />
      ) : (
        <span>{getInitials(profile)}</span>
      )}

      {profile.is_online ? (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -4,
            bottom: -2,
            width: 10,
            height: 10,
            borderRadius: "999px",
            background: "#22c55e",
            border: "2px solid #07090d",
            boxShadow: "0 0 8px rgba(34,197,94,0.7)",
          }}
        />
      ) : null}
    </Link>
  );
}

export default function MutualFriendsPreviewCard({
  currentUserId,
  profileUserId,
  maxAvatars = 5,
  href,
  cardStyle,
  titleStyle,
  textStyle,
}: MutualFriendsPreviewCardProps) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<MutualFriendsState>({
    count: 0,
    profiles: [],
  });
  const [errorMessage, setErrorMessage] = useState("");

  const targetHref = useMemo(
    () => href || `/profile/${profileUserId}/friends`,
    [href, profileUserId]
  );

  const label = useMemo(() => {
    if (state.count === 1) return "You share 1 mutual friend";
    return `You share ${state.count} mutual friends`;
  }, [state.count]);

  useEffect(() => {
    let isMounted = true;

    async function run() {
      if (!currentUserId || !profileUserId || currentUserId === profileUserId) {
        if (isMounted) {
          setLoading(false);
          setState({ count: 0, profiles: [] });
        }
        return;
      }

      try {
        setLoading(true);
        setErrorMessage("");

        const result = await getMutualFriends(
          currentUserId,
          profileUserId,
          maxAvatars
        );

        if (!isMounted) return;
        setState(result);
      } catch (error) {
        if (!isMounted) return;
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load mutual friends."
        );
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      isMounted = false;
    };
  }, [currentUserId, profileUserId, maxAvatars]);

  if (!currentUserId || currentUserId === profileUserId) {
    return null;
  }

  if (loading) {
    return (
      <section
        className="mutual-friends-preview-card"
        style={{
          marginTop: "18px",
          borderRadius: "22px",
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.04)",
          padding: "16px",
          boxShadow: "0 10px 28px rgba(0,0,0,0.22)",
          overflow: "hidden",
          ...cardStyle,
        }}
      >
        <div
          style={{
            fontSize: "0.95rem",
            fontWeight: 700,
            color: "#f9fafb",
            marginBottom: "8px",
            ...titleStyle,
          }}
        >
          Mutual friends
        </div>
        <div style={{ color: "#9ca3af", fontSize: "0.92rem", ...textStyle }}>
          Loading mutual friends...
        </div>

        <style jsx global>{mutualFriendsPreviewStyles}</style>
      </section>
    );
  }

  if (errorMessage || !state.count) {
    return null;
  }

  return (
    <section
      className="mutual-friends-preview-card"
      style={{
        marginTop: "18px",
        borderRadius: "22px",
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        padding: "16px",
        boxShadow: "0 10px 28px rgba(0,0,0,0.22)",
        overflow: "hidden",
        ...cardStyle,
      }}
    >
      <div
        className="mutual-friends-preview-header"
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "14px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 220px" }}>
          <div
            style={{
              fontSize: "0.95rem",
              fontWeight: 700,
              color: "#f9fafb",
              marginBottom: "6px",
              ...titleStyle,
            }}
          >
            Mutual friends
          </div>

          <div
            style={{
              fontSize: "0.92rem",
              lineHeight: 1.5,
              color: "#d1d5db",
              ...textStyle,
            }}
          >
            {label}.
          </div>
        </div>

        <Link
          href={targetHref}
          className="mutual-friends-view-all"
          style={{
            textDecoration: "none",
            color: "#ffffff",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: "999px",
            padding: "8px 12px",
            fontWeight: 700,
            fontSize: "0.88rem",
            whiteSpace: "nowrap",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          View all
        </Link>
      </div>

      <div
        className="mutual-friends-avatar-row"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginTop: "14px",
          paddingLeft: "2px",
          minWidth: 0,
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
      >
        {state.profiles.map((profile) => (
          <div
            key={profile.id}
            style={{
              flexShrink: 0,
            }}
          >
            <Avatar profile={profile} />
          </div>
        ))}

        {state.count > state.profiles.length ? (
          <div
            style={{
              marginLeft: "10px",
              fontSize: "0.85rem",
              fontWeight: 700,
              color: "#d1d5db",
              flexShrink: 0,
            }}
          >
            +{state.count - state.profiles.length}
          </div>
        ) : null}
      </div>

      <style jsx global>{mutualFriendsPreviewStyles}</style>
    </section>
  );
}

const mutualFriendsPreviewStyles = `
  .mutual-friends-preview-card,
  .mutual-friends-preview-card * {
    box-sizing: border-box;
  }

  .mutual-friends-preview-card {
    overflow-wrap: anywhere;
  }

  .mutual-friends-preview-card a,
  .mutual-friends-preview-card button {
    touch-action: manipulation;
  }

  .mutual-friends-avatar-row::-webkit-scrollbar {
    display: none;
  }

  @media (max-width: 760px) {
    .mutual-friends-preview-card {
      border-radius: 18px !important;
      padding: 14px !important;
      margin-top: 14px !important;
    }

    .mutual-friends-preview-header {
      gap: 10px !important;
    }

    .mutual-friends-view-all {
      min-height: 38px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
  }

  @media (max-width: 420px) {
    .mutual-friends-preview-card {
      padding: 12px !important;
    }

    .mutual-friends-view-all {
      width: 100% !important;
    }
  }
`;

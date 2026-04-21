"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type ProfilePreview = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_online?: boolean | null;
};

type FriendRequestRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  created_at: string;
};

type FriendCard = {
  requestId: string;
  friendId: string;
  createdAt: string;
  profile: ProfilePreview | null;
};

export default function FriendsListPage() {
  const [currentUserId, setCurrentUserId] = useState("");
  const [friends, setFriends] = useState<FriendCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [processingFriendId, setProcessingFriendId] = useState<string | null>(null);

  const showStatus = useCallback((message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => {
      setStatusMessage("");
    }, 2500);
  }, []);

  const fetchFriends = useCallback(async (userId: string) => {
    setLoading(true);

    const { data, error } = await supabase
      .from("friend_requests")
      .select("id, sender_id, receiver_id, status, created_at")
      .eq("status", "accepted")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching accepted friends:", error.message);
      setFriends([]);
      setLoading(false);
      return;
    }

    const rows = (data || []) as FriendRequestRow[];

    const friendIds = [
      ...new Set(
        rows
          .map((row) => (row.sender_id === userId ? row.receiver_id : row.sender_id))
          .filter(Boolean)
      ),
    ];

    let profilesMap: Record<string, ProfilePreview> = {};

    if (friendIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, is_online")
        .in("id", friendIds);

      if (profileError) {
        console.error("Error fetching friend profiles:", profileError.message);
      } else {
        profilesMap = Object.fromEntries(
          ((profileRows || []) as ProfilePreview[]).map((profile) => [profile.id, profile])
        );
      }
    }

    const mapped: FriendCard[] = rows.map((row) => {
      const friendId = row.sender_id === userId ? row.receiver_id : row.sender_id;

      return {
        requestId: row.id,
        friendId,
        createdAt: row.created_at,
        profile: profilesMap[friendId] || null,
      };
    });

    setFriends(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        setCurrentUserId("");
        setFriends([]);
        setLoading(false);
        return;
      }

      setCurrentUserId(user.id);
      await fetchFriends(user.id);
    };

    initialize();
  }, [fetchFriends]);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`friends-list-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friend_requests" },
        async () => {
          await fetchFriends(currentUserId);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        async () => {
          await fetchFriends(currentUserId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, fetchFriends]);

  const filteredFriends = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) return friends;

    return friends.filter((friend) => {
      const name = friend.profile?.full_name?.toLowerCase() || "";
      const username = friend.profile?.username?.toLowerCase() || "";
      return name.includes(query) || username.includes(query);
    });
  }, [friends, searchTerm]);

  const onlineCount = useMemo(() => {
    return friends.filter((friend) => friend.profile?.is_online).length;
  }, [friends]);

  const handleRemoveFriend = async (friend: FriendCard) => {
    const confirmRemove = window.confirm("Remove this friend?");
    if (!confirmRemove) return;

    setProcessingFriendId(friend.friendId);

    const { error } = await supabase
      .from("friend_requests")
      .delete()
      .eq("id", friend.requestId);

    if (error) {
      alert(`Remove friend error: ${error.message}`);
      setProcessingFriendId(null);
      return;
    }

    setFriends((prev) => prev.filter((item) => item.requestId !== friend.requestId));
    setProcessingFriendId(null);
    showStatus("Friend removed.");
  };

  const getInitial = (name?: string | null, username?: string | null) => {
    const value = name || username || "U";
    return value.charAt(0).toUpperCase();
  };

  const formatRelativeTime = (value?: string | null) => {
    if (!value) return "Recently";

    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return "Recently";

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
  };

  return (
    <div className="min-h-screen bg-[#07090d] text-white">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
        <div
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 100%)",
            borderRadius: "28px",
            padding: "20px",
            border: "1px solid rgba(255,255,255,0.10)",
            backdropFilter: "blur(10px)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "18px",
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 800 }}>Friends</h1>
              <p style={{ margin: "6px 0 0", color: "#9ca3af", fontSize: "14px" }}>
                Your accepted connections across Parapost.
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <Link href="/friends/requests" style={secondaryLinkStyle}>
                View Requests
              </Link>
              <span style={countPillStyle}>{friends.length} total</span>
              <span style={onlinePillStyle}>{onlineCount} online</span>
            </div>
          </div>

          {statusMessage && (
            <div
              style={{
                marginBottom: "16px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "#f9fafb",
                borderRadius: "18px",
                padding: "12px 14px",
              }}
            >
              {statusMessage}
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "16px",
            }}
          >
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search friends by name or username..."
              style={searchInputStyle}
            />

            <Link href="/dashboard" style={secondaryLinkStyle}>
              Back to Dashboard
            </Link>
          </div>

          {loading ? (
            <p style={{ color: "#9ca3af", margin: 0 }}>Loading friends...</p>
          ) : filteredFriends.length === 0 ? (
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: "24px",
                padding: "24px",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: "8px", fontSize: "20px" }}>
                {friends.length === 0 ? "No friends yet" : "No matching friends"}
              </h2>
              <p style={{ margin: 0, color: "#9ca3af", lineHeight: 1.6 }}>
                {friends.length === 0
                  ? "Once requests are accepted, your friends will appear here."
                  : "Try a different search term."}
              </p>
            </div>
          ) : (
            <div
              className="grid grid-cols-1 md:grid-cols-2"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "14px",
              }}
            >
              {filteredFriends.map((friend) => {
                const profile = friend.profile;
                const label = profile?.full_name || profile?.username || "Unnamed User";
                const username = profile?.username || "no-username";
                const isBusy = processingFriendId === friend.friendId;

                return (
                  <div
                    key={friend.requestId}
                    style={{
                      background: "linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.035) 100%)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "24px",
                      padding: "16px",
                      boxShadow: "0 10px 26px rgba(0,0,0,0.24)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "12px",
                        marginBottom: "14px",
                      }}
                    >
                      <Link
                        href={`/profile/${friend.friendId}`}
                        style={{
                          position: "relative",
                          width: "60px",
                          height: "60px",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          textDecoration: "none",
                          flexShrink: 0,
                        }}
                      >
                        {profile?.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt={label}
                            style={{
                              width: "60px",
                              height: "60px",
                              borderRadius: "50%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "60px",
                              height: "60px",
                              borderRadius: "50%",
                              background: "#374151",
                              color: "#f9fafb",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              fontSize: "20px",
                            }}
                          >
                            {getInitial(profile?.full_name, profile?.username)}
                          </div>
                        )}

                        {profile?.is_online && (
                          <span
                            style={{
                              position: "absolute",
                              bottom: "2px",
                              right: "2px",
                              width: "13px",
                              height: "13px",
                              borderRadius: "50%",
                              background: "#22c55e",
                              border: "2px solid #07090d",
                              boxShadow: "0 0 6px rgba(34,197,94,0.6)",
                            }}
                          />
                        )}
                      </Link>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <Link
                          href={`/profile/${friend.friendId}`}
                          style={{
                            color: "#f9fafb",
                            textDecoration: "none",
                            fontWeight: 700,
                            fontSize: "17px",
                            display: "inline-block",
                            marginBottom: "4px",
                          }}
                        >
                          {label}
                        </Link>

                        <div style={{ color: "#9ca3af", fontSize: "13px", marginBottom: "6px" }}>
                          @{username}
                        </div>

                        <div style={{ color: "#d1d5db", fontSize: "14px" }}>
                          Friends since {formatRelativeTime(friend.createdAt)}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        flexWrap: "wrap",
                      }}
                    >
                      <Link href={`/profile/${friend.friendId}`} style={primaryLinkStyle}>
                        View Profile
                      </Link>

                      <button
                        type="button"
                        onClick={() => handleRemoveFriend(friend)}
                        disabled={isBusy}
                        style={dangerButtonStyle}
                      >
                        {isBusy ? "Working..." : "Remove Friend"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const secondaryLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "42px",
  padding: "0 16px",
  borderRadius: "999px",
  textDecoration: "none",
  color: "#f9fafb",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.10)",
  fontWeight: 600,
};

const primaryLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "44px",
  padding: "0 18px",
  borderRadius: "999px",
  textDecoration: "none",
  color: "#000000",
  background: "#ffffff",
  border: "1px solid rgba(255,255,255,0.12)",
  fontWeight: 700,
};

const countPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "42px",
  padding: "0 14px",
  borderRadius: "999px",
  color: "#f9fafb",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  fontWeight: 700,
  fontSize: "14px",
};

const onlinePillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "42px",
  padding: "0 14px",
  borderRadius: "999px",
  color: "#86efac",
  background: "rgba(34,197,94,0.10)",
  border: "1px solid rgba(34,197,94,0.24)",
  fontWeight: 700,
  fontSize: "14px",
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "420px",
  minHeight: "46px",
  borderRadius: "16px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#f9fafb",
  padding: "0 14px",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  outline: "none",
};

const dangerButtonStyle: React.CSSProperties = {
  minHeight: "44px",
  borderRadius: "999px",
  padding: "0 18px",
  border: "1px solid rgba(248,113,113,0.25)",
  background: "rgba(248,113,113,0.10)",
  color: "#fecaca",
  fontWeight: 700,
  cursor: "pointer",
};

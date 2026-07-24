"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ProfilePreview = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_online?: boolean | null;
  last_seen_at?: string | null;
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
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState("");
  const [friends, setFriends] = useState<FriendCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [processingFriendId, setProcessingFriendId] = useState<string | null>(null);
  const [onlineNow, setOnlineNow] = useState(() => Date.now());

  useEffect(() => {
    router.prefetch("/dashboard");
    router.prefetch("/friends/requests");
    router.prefetch("/messages");
    router.prefetch("/settings");
  }, [router]);

  const showStatus = useCallback((message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => {
      setStatusMessage("");
    }, 2500);
  }, []);

  const fetchFriends = useCallback(async (userId: string, options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);

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
        .select("id, username, full_name, avatar_url, is_online, last_seen_at")
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

    void initialize();
  }, [fetchFriends]);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`friends-list-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friend_requests" },
        async () => {
          await fetchFriends(currentUserId, { silent: true });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        async () => {
          await fetchFriends(currentUserId, { silent: true });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, fetchFriends]);

  useEffect(() => {
    const onlineTimer = window.setInterval(() => {
      setOnlineNow(Date.now());
    }, 30000);

    return () => {
      window.clearInterval(onlineTimer);
    };
  }, []);

  const filteredFriends = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) return friends;

    return friends.filter((friend) => {
      const name = friend.profile?.full_name?.toLowerCase() || "";
      const username = friend.profile?.username?.toLowerCase() || "";
      return name.includes(query) || username.includes(query);
    });
  }, [friends, searchTerm]);

  const isFriendOnline = useCallback(
    (profile?: ProfilePreview | null) => {
      if (!profile?.is_online || !profile.last_seen_at) return false;

      const lastSeenTime = new Date(profile.last_seen_at).getTime();
      if (Number.isNaN(lastSeenTime)) return false;

      return onlineNow - lastSeenTime <= 3 * 60 * 1000;
    },
    [onlineNow]
  );

  const onlineCount = useMemo(() => {
    return friends.filter((friend) => isFriendOnline(friend.profile)).length;
  }, [friends, isFriendOnline]);

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

    const seconds = Math.max(1, Math.floor((onlineNow - timestamp) / 1000));
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
    <main className="friends-page-root" style={pageStyle}>
      <div style={backgroundGlowOneStyle} />
      <div style={backgroundGlowTwoStyle} />
      <div className="friends-page-inner" style={pageInnerStyle}>
        <section className="friends-hero-shell" style={heroShellStyle}>
          <div className="friends-hero-top" style={heroTopStyle}>
            <div>
              <div style={eyebrowStyle}>Parapost Network</div>
              <h1 style={titleStyle}>Friends</h1>
              <p style={subtitleStyle}>Your accepted connections across Parapost.</p>
            </div>

            <div className="friends-top-actions" style={topActionsStyle}>
              <Link href="/friends/requests" style={secondaryLinkStyle}>
                View Friend Requests
              </Link>
              <span style={countPillStyle}>{friends.length} total</span>
              <span style={onlinePillStyle}>{onlineCount} online</span>
            </div>
          </div>

          {statusMessage ? (
            <div style={statusMessageStyle}>
              <span style={statusAccentDotStyle} />
              {statusMessage}
            </div>
          ) : null}

          <div className="friends-control-row" style={controlRowStyle}>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search friends by name or username..."
              className="friends-search-input"
              style={searchInputStyle}
            />

            <Link
              href="/dashboard"
              className="friends-pill-action friends-back-desktop"
              style={secondaryLinkStyle}
            >
              Back to Dashboard
            </Link>

            <button
              type="button"
              className="friends-pill-action friends-back-mobile"
              style={secondaryLinkStyle}
              onClick={() => {
                router.push("/dashboard?menu=main");
              }}
            >
              <span aria-hidden="true">←</span>
              <span>Back to Menu</span>
            </button>
          </div>

          <div className="friends-stats-grid" style={statsGridStyle}>
            <div style={statCardStyle}>
              <span style={statLabelStyle}>Accepted Friends</span>
              <strong style={statValueStyle}>{friends.length}</strong>
            </div>
            <div style={statCardStyle}>
              <span style={statLabelStyle}>Online Now</span>
              <strong style={statValueStyle}>{onlineCount}</strong>
            </div>
            <div style={statCardStyle}>
              <span style={statLabelStyle}>Search Results</span>
              <strong style={statValueStyle}>{filteredFriends.length}</strong>
            </div>
          </div>

          {loading ? (
            <div style={emptyStateStyle}>
              <div style={emptyIconStyle}>⌛</div>
              <h2 style={emptyTitleStyle}>Loading friends...</h2>
              <p style={emptyTextStyle}>Getting your Parapost connections ready.</p>
            </div>
          ) : filteredFriends.length === 0 ? (
            <div style={emptyStateStyle}>
              <div style={emptyIconStyle}>👥</div>
              <h2 style={emptyTitleStyle}>
                {friends.length === 0 ? "No friends yet" : "No matching friends"}
              </h2>
              <p style={emptyTextStyle}>
                {friends.length === 0
                  ? "Once requests are accepted, your friends will appear here."
                  : "Try a different search term."}
              </p>
            </div>
          ) : (
            <div className="friends-grid" style={friendsGridStyle}>
              {filteredFriends.map((friend) => {
                const profile = friend.profile;
                const label = profile?.full_name || profile?.username || "Unnamed User";
                const username = profile?.username || "no-username";
                const isBusy = processingFriendId === friend.friendId;
                const isOnline = isFriendOnline(profile);

                return (
                  <article key={friend.requestId} className="friends-card" style={friendCardStyle}>
                    <div className="friends-friend-top" style={friendTopStyle}>
                      <Link href={`/profile/${friend.friendId}`} className="friends-avatar-shell" style={avatarShellStyle}>
                        <span style={avatarCropStyle}>
                          {profile?.avatar_url ? (
                            <Image
                              src={profile.avatar_url}
                              alt={label}
                              width={56}
                              height={56}
                              sizes="56px"
                              unoptimized
                              style={avatarImageStyle}
                            />
                          ) : (
                            <span style={avatarFallbackStyle}>
                              {getInitial(profile?.full_name, profile?.username)}
                            </span>
                          )}
                        </span>

                        {isOnline ? <span style={onlineDotStyle} /> : null}
                      </Link>

                      <div style={friendInfoStyle}>
                        <Link href={`/profile/${friend.friendId}`} style={friendNameStyle}>
                          {label}
                        </Link>

                        <div style={friendUsernameStyle}>@{username}</div>

                        <div style={friendSinceStyle}>
                          Friends since {formatRelativeTime(friend.createdAt)}
                        </div>
                      </div>
                    </div>

                    <div className="friends-friend-actions" style={friendActionsStyle}>
                      <Link href={`/profile/${friend.friendId}`} className="friends-card-action" style={primaryLinkStyle}>
                        View Profile
                      </Link>

                      <button
                        type="button"
                        className="friends-card-action"
                        onClick={() => handleRemoveFriend(friend)}
                        disabled={isBusy}
                        style={{
                          ...dangerButtonStyle,
                          opacity: isBusy ? 0.65 : 1,
                          cursor: isBusy ? "not-allowed" : "pointer",
                        }}
                      >
                        {isBusy ? "Working..." : "Remove Friend"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <style jsx global>{`
        html:has(.friends-page-root),
        body:has(.friends-page-root) {
          height: auto !important;
          min-height: 100% !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          overscroll-behavior-y: auto;
        }

        body:has(.friends-page-root) {
          touch-action: pan-y pinch-zoom;
          -webkit-overflow-scrolling: touch;
        }

        .friends-page-root {
          width: 100%;
          min-height: 100svh;
          min-height: 100dvh;
          height: auto !important;
          max-height: none !important;
          overflow-x: hidden !important;
          overflow-y: visible !important;
          position: relative;
          display: block;
          touch-action: pan-y;
          overscroll-behavior-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        .friends-page-inner {
          min-height: 100dvh;
          box-sizing: border-box;
        }

        .friends-hero-shell,
        .friends-card,
        .friends-search-input,
        .friends-pill-action,
        .friends-card-action {
          box-sizing: border-box;
        }

        .friends-pill-action,
        .friends-card-action {
          transition: transform 160ms ease, filter 160ms ease, border-color 160ms ease;
        }

        .friends-back-mobile {
          display: none !important;
          gap: 6px;
          line-height: 1;
        }

        .friends-back-mobile > span {
          display: inline-flex;
          align-items: center;
          line-height: 1;
        }

        .friends-pill-action:hover,
        .friends-card-action:hover {
          transform: translateY(-1px);
          filter: brightness(1.06);
        }

        .friends-search-input::placeholder {
          color: rgba(203, 213, 225, 0.70);
        }

        @media (max-width: 1024px) {
          .friends-back-desktop {
            display: none !important;
          }

          .friends-back-mobile {
            display: inline-flex !important;
          }
        }

        @media (max-width: 760px) {
          html:has(.friends-page-root),
          body:has(.friends-page-root) {
            height: auto !important;
            max-height: none !important;
            overflow-x: hidden !important;
            overflow-y: auto !important;
          }

          .friends-page-root {
            min-height: 100svh !important;
            min-height: 100dvh !important;
            height: auto !important;
            max-height: none !important;
            overflow-y: visible !important;
            align-items: stretch !important;
            padding-bottom: max(32px, env(safe-area-inset-bottom)) !important;
          }

          .friends-page-inner {
            width: 100% !important;
            max-width: 100% !important;
            min-height: 100dvh !important;
            padding: 14px 10px calc(72px + env(safe-area-inset-bottom)) !important;
          }

          .friends-hero-shell {
            width: 100% !important;
            max-width: 100% !important;
            border-radius: 24px !important;
            padding: 14px !important;
          }

          .friends-hero-top {
            gap: 12px !important;
            margin-bottom: 14px !important;
          }

          .friends-top-actions,
          .friends-control-row,
          .friends-friend-actions {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 9px !important;
            justify-content: stretch !important;
          }

          .friends-top-actions > *,
          .friends-control-row > *,
          .friends-friend-actions > * {
            width: 100% !important;
            max-width: none !important;
            box-sizing: border-box !important;
            text-align: center !important;
          }

          .friends-search-input {
            max-width: none !important;
            font-size: 16px !important;
          }

          .friends-stats-grid {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }

          .friends-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
            padding-bottom: 48px !important;
          }

          .friends-card {
            border-radius: 22px !important;
            padding: 14px !important;
          }

          .friends-friend-top {
            align-items: center !important;
          }
        }

        @media (max-width: 380px) {
          .friends-page-inner {
            padding-left: 8px !important;
            padding-right: 8px !important;
            padding-bottom: calc(72px + env(safe-area-inset-bottom)) !important;
          }

          .friends-hero-shell {
            padding: 12px !important;
          }

          .friends-avatar-shell {
            width: 56px !important;
            height: 56px !important;
          }
        }

        @media (min-width: 761px) and (max-width: 1024px) {
          .friends-page-inner {
            max-width: 940px !important;
            padding: 22px 16px calc(96px + env(safe-area-inset-bottom)) !important;
          }

          .friends-hero-shell {
            padding: 18px !important;
            border-radius: 28px !important;
          }

          .friends-grid {
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)) !important;
          }

          .friends-search-input {
            max-width: 100% !important;
          }
        }

        @media (min-width: 1025px) and (max-width: 1366px) {
          .friends-page-inner {
            max-width: 1080px !important;
          }

          .friends-grid {
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)) !important;
          }
        }

        @media (max-height: 540px) and (orientation: landscape) {
          .friends-page-inner {
            padding-top: 10px !important;
            padding-bottom: calc(64px + env(safe-area-inset-bottom)) !important;
          }

          .friends-hero-shell {
            padding: 12px !important;
            border-radius: 22px !important;
          }
        }
      `}</style>
    </main>
  );
}

const pageStyle: CSSProperties = {
  width: "100%",
  minHeight: "100dvh",
  height: "auto",
  maxHeight: "none",
  overflowX: "hidden",
  overflowY: "visible",
  position: "relative",
  display: "block",
  background:
    "radial-gradient(circle at 12% 0%, var(--parapost-accent-soft), transparent 35%), radial-gradient(circle at 88% 18%, var(--parapost-accent-muted-bg), transparent 32%), linear-gradient(180deg, #05050b 0%, #07090d 45%, #05050b 100%)",
  color: "#ffffff",
  overscrollBehaviorY: "auto",
  WebkitOverflowScrolling: "touch",
};

const backgroundGlowOneStyle: CSSProperties = {
  position: "fixed",
  top: "-180px",
  left: "-140px",
  width: "420px",
  height: "420px",
  borderRadius: "999px",
  background: "var(--parapost-accent-soft)",
  filter: "blur(70px)",
  pointerEvents: "none",
};

const backgroundGlowTwoStyle: CSSProperties = {
  position: "fixed",
  right: "-180px",
  bottom: "-220px",
  width: "520px",
  height: "520px",
  borderRadius: "999px",
  background: "var(--parapost-accent-muted-bg)",
  filter: "blur(84px)",
  pointerEvents: "none",
};

const pageInnerStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  width: "100%",
  maxWidth: "1180px",
  minHeight: "100%",
  margin: "0 auto",
  padding: "26px 16px calc(200px + env(safe-area-inset-bottom))",
  boxSizing: "border-box",
};

const heroShellStyle: CSSProperties = {
  border: "1px solid var(--parapost-accent-border)",
  borderRadius: "32px",
  padding: "22px",
  background:
    "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.045), rgba(15,23,42,0.56))",
  boxShadow: "0 26px 70px rgba(0,0,0,0.38), 0 0 38px var(--parapost-accent-glow)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
};

const heroTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "16px",
  flexWrap: "wrap",
  marginBottom: "18px",
};

const eyebrowStyle: CSSProperties = {
  color: "var(--parapost-accent-text)",
  fontSize: "11px",
  fontWeight: 950,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  marginBottom: "8px",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "clamp(32px, 5vw, 58px)",
  lineHeight: 0.95,
  letterSpacing: "-0.06em",
  fontWeight: 950,
  color: "#ffffff",
};

const subtitleStyle: CSSProperties = {
  margin: "12px 0 0",
  color: "#cbd5e1",
  fontSize: "15px",
  lineHeight: 1.6,
};

const topActionsStyle: CSSProperties = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const statusMessageStyle: CSSProperties = {
  marginBottom: "16px",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  background: "var(--parapost-accent-muted-bg)",
  border: "1px solid var(--parapost-accent-border)",
  color: "#f9fafb",
  borderRadius: "18px",
  padding: "12px 14px",
  fontWeight: 850,
};

const statusAccentDotStyle: CSSProperties = {
  width: "9px",
  height: "9px",
  borderRadius: "999px",
  background: "var(--parapost-accent-2)",
  boxShadow: "0 0 16px var(--parapost-accent-glow)",
  flexShrink: 0,
};

const controlRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
  marginBottom: "16px",
};

const statsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "12px",
  marginBottom: "16px",
};

const statCardStyle: CSSProperties = {
  border: "1px solid var(--parapost-accent-border)",
  borderRadius: "22px",
  padding: "14px",
  background: "rgba(255,255,255,0.045)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
};

const statLabelStyle: CSSProperties = {
  display: "block",
  color: "#94a3b8",
  fontSize: "11px",
  fontWeight: 950,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  marginBottom: "8px",
};

const statValueStyle: CSSProperties = {
  display: "block",
  color: "#ffffff",
  fontSize: "28px",
  fontWeight: 950,
  lineHeight: 1,
};

const friendsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "14px",
};

const friendCardStyle: CSSProperties = {
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.065), var(--parapost-accent-muted-bg), rgba(255,255,255,0.035))",
  border: "1px solid var(--parapost-accent-border)",
  borderRadius: "26px",
  padding: "16px",
  boxShadow: "0 16px 36px rgba(0,0,0,0.28)",
};

const friendTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "12px",
  marginBottom: "14px",
};

const avatarShellStyle: CSSProperties = {
  position: "relative",
  width: "62px",
  height: "62px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  textDecoration: "none",
  flexShrink: 0,
  overflow: "visible",
  background: "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
  boxShadow: "0 0 0 1px var(--parapost-accent-active-border), 0 0 22px var(--parapost-accent-glow)",
};

const avatarCropStyle: CSSProperties = {
  width: "56px",
  height: "56px",
  borderRadius: "999px",
  overflow: "hidden",
  display: "grid",
  placeItems: "center",
  border: "2px solid #07090d",
  background: "#0b0f17",
};

const avatarImageStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  minWidth: "100%",
  minHeight: "100%",
  objectFit: "cover",
  objectPosition: "center",
  borderRadius: "999px",
};

const avatarFallbackStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "999px",
  background: "linear-gradient(135deg, var(--parapost-accent-1), #111827)",
  color: "#f9fafb",
  display: "grid",
  placeItems: "center",
  fontWeight: 950,
  fontSize: "20px",
};

const onlineDotStyle: CSSProperties = {
  position: "absolute",
  bottom: "3px",
  right: "3px",
  width: "13px",
  height: "13px",
  borderRadius: "999px",
  background: "#22c55e",
  border: "2px solid #07090d",
  boxShadow: "0 0 10px rgba(34,197,94,0.75)",
  zIndex: 3,
};

const friendInfoStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
};

const friendNameStyle: CSSProperties = {
  color: "#f9fafb",
  textDecoration: "none",
  fontWeight: 950,
  fontSize: "17px",
  display: "inline-block",
  marginBottom: "4px",
};

const friendUsernameStyle: CSSProperties = {
  color: "var(--parapost-accent-text)",
  fontSize: "13px",
  marginBottom: "6px",
  fontWeight: 750,
};

const friendSinceStyle: CSSProperties = {
  color: "#d1d5db",
  fontSize: "14px",
};

const friendActionsStyle: CSSProperties = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
};

const secondaryLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "42px",
  padding: "0 16px",
  borderRadius: "999px",
  textDecoration: "none",
  color: "#f9fafb",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid var(--parapost-accent-border)",
  fontWeight: 850,
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
};

const primaryLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "44px",
  padding: "0 18px",
  borderRadius: "999px",
  textDecoration: "none",
  color: "var(--parapost-accent-button-text)",
  background:
    "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
  border: "1px solid var(--parapost-accent-active-border)",
  fontWeight: 950,
  boxShadow: "0 12px 26px var(--parapost-accent-glow)",
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
};

const countPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "42px",
  padding: "0 14px",
  borderRadius: "999px",
  color: "#f9fafb",
  background: "rgba(255,255,255,0.055)",
  border: "1px solid var(--parapost-accent-border)",
  fontWeight: 850,
  fontSize: "14px",
};

const onlinePillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "42px",
  padding: "0 14px",
  borderRadius: "999px",
  color: "#86efac",
  background: "rgba(34,197,94,0.10)",
  border: "1px solid rgba(34,197,94,0.24)",
  fontWeight: 850,
  fontSize: "14px",
};

const searchInputStyle: CSSProperties = {
  width: "100%",
  maxWidth: "min(460px, 100%)",
  minHeight: "46px",
  borderRadius: "18px",
  background: "rgba(255,255,255,0.055)",
  border: "1px solid var(--parapost-accent-border)",
  color: "#f9fafb",
  padding: "0 14px",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  outline: "none",
};

const dangerButtonStyle: CSSProperties = {
  minHeight: "44px",
  borderRadius: "999px",
  padding: "0 18px",
  border: "1px solid rgba(248,113,113,0.25)",
  background: "rgba(248,113,113,0.10)",
  color: "#fecaca",
  fontWeight: 850,
  cursor: "pointer",
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
};

const emptyStateStyle: CSSProperties = {
  border: "1px solid var(--parapost-accent-border)",
  borderRadius: "26px",
  padding: "26px",
  background: "rgba(255,255,255,0.035)",
  textAlign: "center",
};

const emptyIconStyle: CSSProperties = {
  width: "60px",
  height: "60px",
  borderRadius: "22px",
  display: "grid",
  placeItems: "center",
  margin: "0 auto 12px",
  background: "var(--parapost-accent-muted-bg)",
  border: "1px solid var(--parapost-accent-border)",
  boxShadow: "0 0 22px var(--parapost-accent-glow)",
  fontSize: "24px",
};

const emptyTitleStyle: CSSProperties = {
  margin: "0 0 8px",
  color: "#ffffff",
  fontSize: "22px",
  fontWeight: 950,
  letterSpacing: "-0.03em",
};

const emptyTextStyle: CSSProperties = {
  margin: 0,
  color: "#9ca3af",
  lineHeight: 1.6,
};

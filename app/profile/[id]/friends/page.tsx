"use client";

import Link from "next/link";
import { CSSProperties, useEffect, useMemo, useState } from "react";
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

type FriendRequestRow = {
  sender_id: string | null;
  receiver_id: string | null;
  status: string | null;
};

type FilterMode = "all" | "mutual" | "online";
type SortMode = "default" | "name_asc" | "name_desc";

const PAGE_SIZE = 12;

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

function getDisplayName(profile: ProfileRow) {
  return profile.full_name?.trim() || profile.username?.trim() || "Unknown User";
}

function getInitials(profile: ProfileRow) {
  const name = getDisplayName(profile);
  const parts = name.split(" ").filter(Boolean);

  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function getOtherUserId(row: FriendRequestRow, userId: string) {
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
    (data as FriendRequestRow[] | null)?.map((row) => getOtherUserId(row, userId)) ?? [];

  return uniqueIds(ids.filter((value): value is string => Boolean(value)));
}

function FriendAvatar({ profile }: { profile: ProfileRow }) {
  return (
    <Link
      href={`/profile/${profile.id}`}
      style={{
        position: "relative",
        display: "block",
        width: "72px",
        height: "72px",
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        border: "2px solid rgba(255,255,255,0.10)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.24)",
        textDecoration: "none",
      }}
    >
      {profile.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.avatar_url}
          alt={getDisplayName(profile)}
          style={{
            width: "72px",
            height: "72px",
            objectFit: "cover",
            display: "block",
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
            fontSize: "20px",
          }}
        >
          {getInitials(profile)}
        </div>
      )}

      {profile.is_online ? (
        <span
          style={{
            position: "absolute",
            right: "5px",
            bottom: "5px",
            width: "13px",
            height: "13px",
            borderRadius: "50%",
            background: "#22c55e",
            border: "2px solid #07090d",
            boxShadow: "0 0 8px rgba(34,197,94,0.65)",
          }}
        />
      ) : null}
    </Link>
  );
}

export default function ProfileFriendsPage() {
  const params = useParams();

  const profileId = useMemo(() => {
    const raw = params?.id;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] || "" : "";
  }, [params]);

  const [viewerId, setViewerId] = useState("");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [friends, setFriends] = useState<ProfileRow[]>([]);
  const [mutualFriendIds, setMutualFriendIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [currentPage, setCurrentPage] = useState(1);

  const isOwnProfile = !!viewerId && viewerId === profileId;

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      if (!profileId) {
        if (isMounted) {
          setErrorMessage("Profile not found.");
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setErrorMessage("");

        const {
          data: { user },
        } = await supabase.auth.getUser();

        const currentViewerId = user?.id || "";
        if (isMounted) {
          setViewerId(currentViewerId);
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url, bio, is_online")
          .eq("id", profileId)
          .maybeSingle();

        if (profileError) {
          throw new Error(profileError.message);
        }

        const profileRow = (profileData as ProfileRow | null) || null;

        if (!profileRow) {
          if (isMounted) {
            setProfile(null);
            setFriends([]);
            setMutualFriendIds([]);
            setErrorMessage("This profile could not be found.");
            setLoading(false);
          }
          return;
        }

        const profileFriendIds = await getAcceptedFriendIds(profileId);

        let mutualIds: string[] = [];
        if (currentViewerId && currentViewerId !== profileId) {
          const viewerFriendIds = await getAcceptedFriendIds(currentViewerId);
          const viewerSet = new Set(viewerFriendIds);
          mutualIds = profileFriendIds.filter((id) => viewerSet.has(id));
        }

        let friendProfiles: ProfileRow[] = [];
        if (profileFriendIds.length) {
          const { data: friendRows, error: friendsError } = await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url, is_online")
            .in("id", profileFriendIds);

          if (friendsError) {
            throw new Error(friendsError.message);
          }

          const mapped = (friendRows as ProfileRow[] | null) || [];
          friendProfiles = profileFriendIds
            .map((id) => mapped.find((friend) => friend.id === id))
            .filter((friend): friend is ProfileRow => Boolean(friend));
        }

        if (!isMounted) return;

        setProfile(profileRow);
        setFriends(friendProfiles);
        setMutualFriendIds(mutualIds);
        setLoading(false);
      } catch (error) {
        if (!isMounted) return;

        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load this friends page."
        );
        setLoading(false);
      }
    }

    loadPage();

    return () => {
      isMounted = false;
    };
  }, [profileId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterMode, sortMode]);

  const filteredFriends = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const mutualSet = new Set(mutualFriendIds);

    let next = [...friends];

    if (term) {
      next = next.filter((friend) => {
        const fullName = friend.full_name?.toLowerCase() || "";
        const username = friend.username?.toLowerCase() || "";
        return fullName.includes(term) || username.includes(term);
      });
    }

    if (filterMode === "mutual") {
      next = next.filter((friend) => mutualSet.has(friend.id));
    } else if (filterMode === "online") {
      next = next.filter((friend) => !!friend.is_online);
    }

    if (sortMode === "name_asc") {
      next.sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
    } else if (sortMode === "name_desc") {
      next.sort((a, b) => getDisplayName(b).localeCompare(getDisplayName(a)));
    }

    return next;
  }, [friends, mutualFriendIds, searchTerm, filterMode, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filteredFriends.length / PAGE_SIZE));

  const paginatedFriends = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredFriends.slice(start, start + PAGE_SIZE);
  }, [filteredFriends, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const mutualSet = useMemo(() => new Set(mutualFriendIds), [mutualFriendIds]);
  const onlineCount = useMemo(() => friends.filter((friend) => !!friend.is_online).length, [friends]);

  return (
    <div className="min-h-screen bg-[#07090d] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
          <aside style={sideCardStyle}>
            <h2 style={{ marginTop: 0, fontSize: "24px" }}>Parapost Network</h2>
            <p style={{ color: "#9ca3af", fontSize: "14px", marginTop: 0 }}>Friends view</p>

            <div
              style={{
                marginTop: "22px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <Link href="/dashboard" style={navItemLinkStyle}>
                Home Feed
              </Link>
              {viewerId ? (
                <Link href={`/profile/${viewerId}`} style={navItemLinkStyle}>
                  My Profile
                </Link>
              ) : (
                <div style={navItemStyle}>My Profile</div>
              )}
              <Link href="/friends" style={navItemLinkStyle}>
                Friends
              </Link>
              <Link href="/notifications" style={navItemLinkStyle}>
                Notifications
              </Link>
              <div style={navItemStyle}>Messages</div>
              <div style={navItemStyle}>Settings</div>
            </div>
          </aside>

          <section className="min-w-0">
            <div className="mx-auto w-full max-w-4xl space-y-4 md:space-y-6">
              <div style={mainCardStyle}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "16px",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <h1 style={{ margin: 0, fontSize: "30px", lineHeight: 1.1 }}>
                      {profile ? `${getDisplayName(profile)}'s friends` : "Friends"}
                    </h1>
                    <p
                      style={{
                        margin: "10px 0 0",
                        color: "#9ca3af",
                        fontSize: "15px",
                        lineHeight: 1.6,
                      }}
                    >
                      {loading
                        ? "Loading friends..."
                        : profile
                        ? isOwnProfile
                          ? "All of your accepted friends in one place."
                          : "Browse this profile's friends list and see who you know in common."
                        : "Friends list"}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    {profile ? (
                      <Link
                        href={`/profile/${profile.id}`}
                        style={{ ...secondaryButtonStyle, textDecoration: "none" }}
                      >
                        Back to profile
                      </Link>
                    ) : null}
                    <Link
                      href="/friends"
                      style={{ ...secondaryButtonStyle, textDecoration: "none" }}
                    >
                      My friends
                    </Link>
                  </div>
                </div>

                {!loading && !errorMessage && profile ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                      gap: "12px",
                      marginTop: "18px",
                    }}
                  >
                    <div style={statPillStyle}>
                      <strong style={statNumberStyle}>{friends.length}</strong>
                      <span style={statLabelStyle}>Friends</span>
                    </div>
                    <div style={statPillStyle}>
                      <strong style={statNumberStyle}>{mutualFriendIds.length}</strong>
                      <span style={statLabelStyle}>Mutual</span>
                    </div>
                    <div style={statPillStyle}>
                      <strong style={statNumberStyle}>{onlineCount}</strong>
                      <span style={statLabelStyle}>Online</span>
                    </div>
                    <div style={statPillStyle}>
                      <strong style={statNumberStyle}>{filteredFriends.length}</strong>
                      <span style={statLabelStyle}>Results</span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div style={mainCardStyle}>
                {!loading && !errorMessage && profile ? (
                  <div style={{ marginBottom: "16px" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1.5fr) minmax(180px, 0.7fr)",
                        gap: "12px",
                      }}
                    >
                      <input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Search friends by name or username"
                        style={searchInputStyle}
                      />

                      <select
                        value={sortMode}
                        onChange={(event) => setSortMode(event.target.value as SortMode)}
                        style={selectStyle}
                      >
                        <option value="default">Sort: Default</option>
                        <option value="name_asc">Sort: Name A-Z</option>
                        <option value="name_desc">Sort: Name Z-A</option>
                      </select>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        flexWrap: "wrap",
                        marginTop: "12px",
                      }}
                    >
                      <button
                        onClick={() => setFilterMode("all")}
                        style={getFilterButtonStyle(filterMode === "all")}
                      >
                        All
                      </button>
                      {!isOwnProfile ? (
                        <button
                          onClick={() => setFilterMode("mutual")}
                          style={getFilterButtonStyle(filterMode === "mutual")}
                        >
                          Mutual
                        </button>
                      ) : null}
                      <button
                        onClick={() => setFilterMode("online")}
                        style={getFilterButtonStyle(filterMode === "online")}
                      >
                        Online
                      </button>
                    </div>
                  </div>
                ) : null}

                {loading ? (
                  <p style={{ color: "#9ca3af", marginBottom: 0 }}>Loading friends...</p>
                ) : errorMessage ? (
                  <div style={messageBoxStyle}>{errorMessage}</div>
                ) : !profile ? (
                  <div style={messageBoxStyle}>This profile could not be found.</div>
                ) : friends.length === 0 ? (
                  <div style={messageBoxStyle}>
                    {isOwnProfile
                      ? "You do not have any accepted friends yet."
                      : "This user has no accepted friends to show yet."}
                  </div>
                ) : filteredFriends.length === 0 ? (
                  <div style={messageBoxStyle}>
                    No friends matched your current search or filter.
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))",
                        gap: "16px",
                      }}
                    >
                      {paginatedFriends.map((friend) => {
                        const isMutual = mutualSet.has(friend.id);

                        return (
                          <div key={friend.id} style={friendCardStyle}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "14px",
                              }}
                            >
                              <FriendAvatar profile={friend} />

                              <div style={{ minWidth: 0, flex: 1 }}>
                                <Link
                                  href={`/profile/${friend.id}`}
                                  style={{
                                    color: "#ffffff",
                                    textDecoration: "none",
                                    fontWeight: 700,
                                    fontSize: "16px",
                                    lineHeight: 1.3,
                                  }}
                                >
                                  {getDisplayName(friend)}
                                </Link>

                                <div
                                  style={{
                                    marginTop: "6px",
                                    color: "#9ca3af",
                                    fontSize: "14px",
                                    lineHeight: 1.4,
                                  }}
                                >
                                  @{friend.username || "no-username"}
                                </div>

                                <div
                                  style={{
                                    display: "flex",
                                    gap: "8px",
                                    flexWrap: "wrap",
                                    marginTop: "10px",
                                  }}
                                >
                                  {friend.is_online ? (
                                    <span style={onlinePillStyle}>Online</span>
                                  ) : (
                                    <span style={mutedPillStyle}>Offline</span>
                                  )}

                                  {!isOwnProfile && isMutual ? (
                                    <span style={mutualPillStyle}>Mutual friend</span>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                gap: "10px",
                                flexWrap: "wrap",
                                marginTop: "16px",
                              }}
                            >
                              <Link
                                href={`/profile/${friend.id}`}
                                style={{ ...secondaryButtonStyle, textDecoration: "none" }}
                              >
                                View profile
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div
                      style={{
                        marginTop: "18px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ color: "#9ca3af", fontSize: "14px" }}>
                        Page {currentPage} of {totalPages}
                      </div>

                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <button
                          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          style={getPagerButtonStyle(currentPage === 1)}
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                          disabled={currentPage === totalPages}
                          style={getPagerButtonStyle(currentPage === totalPages)}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          <aside style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={sideCardStyle}>
              <h3 style={{ marginTop: 0 }}>Friends Summary</h3>
              <p style={{ color: "#d1d5db", marginBottom: "10px" }}>
                Profile:{" "}
                <strong style={{ color: "white" }}>
                  {profile ? getDisplayName(profile) : "Loading..."}
                </strong>
              </p>
              <p style={{ color: "#d1d5db", marginBottom: "10px" }}>
                Count: <strong style={{ color: "white" }}>{friends.length}</strong>
              </p>
              {!isOwnProfile ? (
                <p style={{ color: "#d1d5db", marginBottom: 0 }}>
                  Mutual:{" "}
                  <strong style={{ color: "white" }}>{mutualFriendIds.length}</strong>
                </p>
              ) : null}
            </div>

            <div style={sideCardStyle}>
              <h3 style={{ marginTop: 0 }}>Quick Filters</h3>
              <p style={{ color: "#d1d5db", lineHeight: 1.7, marginBottom: "12px" }}>
                Search by profile name, narrow the list to mutual or online friends, and move through pages without overcrowding the screen.
              </p>
              <div style={mutedPillStyle}>Social-style browsing added</div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function getFilterButtonStyle(isActive: boolean): CSSProperties {
  return {
    background: isActive ? "white" : "rgba(255,255,255,0.05)",
    color: isActive ? "black" : "white",
    border: isActive ? "none" : "1px solid rgba(255,255,255,0.10)",
    borderRadius: "999px",
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
    minHeight: "40px",
  };
}

function getPagerButtonStyle(isDisabled: boolean): CSSProperties {
  return {
    background: isDisabled ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
    color: isDisabled ? "#6b7280" : "#ffffff",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "999px",
    padding: "10px 16px",
    fontWeight: 700,
    cursor: isDisabled ? "not-allowed" : "pointer",
    minHeight: "40px",
  };
}

const mainCardStyle: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 100%)",
  borderRadius: "28px",
  padding: "18px",
  border: "1px solid rgba(255,255,255,0.10)",
  backdropFilter: "blur(10px)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
};

const sideCardStyle: CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  borderRadius: "28px",
  padding: "20px",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
  height: "fit-content",
};

const friendCardStyle: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.035) 100%)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "26px",
  padding: "16px",
  boxShadow: "0 10px 26px rgba(0,0,0,0.24)",
};

const navItemStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: "16px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#f9fafb",
  fontWeight: 500,
};

const navItemLinkStyle: CSSProperties = {
  ...navItemStyle,
  textDecoration: "none",
  display: "block",
};

const secondaryButtonStyle: CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 600,
  cursor: "pointer",
  minHeight: "42px",
};

const statPillStyle: CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "20px",
  padding: "14px",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const statNumberStyle: CSSProperties = {
  color: "#ffffff",
  fontSize: "20px",
  lineHeight: 1,
};

const statLabelStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: "12px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const messageBoxStyle: CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#f9fafb",
  borderRadius: "20px",
  padding: "14px",
};

const mutualPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "30px",
  padding: "0 10px",
  borderRadius: "999px",
  color: "#86efac",
  background: "rgba(34,197,94,0.10)",
  border: "1px solid rgba(34,197,94,0.24)",
  fontWeight: 700,
  fontSize: "12px",
};

const onlinePillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "30px",
  padding: "0 10px",
  borderRadius: "999px",
  color: "#86efac",
  background: "rgba(34,197,94,0.10)",
  border: "1px solid rgba(34,197,94,0.24)",
  fontWeight: 700,
  fontSize: "12px",
};

const mutedPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "30px",
  padding: "0 10px",
  borderRadius: "999px",
  color: "#d1d5db",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  fontWeight: 700,
  fontSize: "12px",
};

const searchInputStyle: CSSProperties = {
  width: "100%",
  minHeight: "46px",
  borderRadius: "16px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "#ffffff",
  padding: "0 14px",
  outline: "none",
};

const selectStyle: CSSProperties = {
  width: "100%",
  minHeight: "46px",
  borderRadius: "16px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "#ffffff",
  padding: "0 14px",
  outline: "none",
};

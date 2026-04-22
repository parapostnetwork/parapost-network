"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  removeFriend,
} from "@/lib/friends";
import MutualFriendsPreviewCard from "@/components/profile/MutualFriendsPreviewCard";

type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_online?: boolean | null;
};

type Post = {
  id: string;
  content: string;
  image_url?: string | null;
  created_at: string;
  user_id: string;
};

type CountMap = Record<string, number>;
type ToggleMap = Record<string, boolean>;

type FollowRow = {
  follower_id: string;
  following_id: string;
};

type FriendRequestStatus =
  | "none"
  | "outgoing_request"
  | "incoming_request"
  | "friends";

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();

  if (Number.isNaN(diffMs)) return "";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

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
}

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();

  const profileId = useMemo(() => {
    const raw = params?.id;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] || "" : "";
  }, [params]);

  const [viewerId, setViewerId] = useState("");
  const [viewerEmail, setViewerEmail] = useState("");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [likeCounts, setLikeCounts] = useState<CountMap>({});
  const [userLikes, setUserLikes] = useState<ToggleMap>({});
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [followLoading, setFollowLoading] = useState(false);
  const [friendStatus, setFriendStatus] = useState<FriendRequestStatus>("none");
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendStatusMessage, setFriendStatusMessage] = useState("");

  const isOwnProfile = !!viewerId && viewerId === profileId;

  const showFriendStatus = useCallback((message: string) => {
    setFriendStatusMessage(message);
    window.setTimeout(() => {
      setFriendStatusMessage("");
    }, 2500);
  }, []);

  const loadPage = useCallback(async () => {
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

    const nextViewerId = user?.id || "";
    setViewerId(nextViewerId);
    setViewerEmail(user?.email || "");

    const [
      profileResult,
      postsResult,
      likesResult,
      followersResult,
      outgoingRequestResult,
      incomingRequestResult,
      acceptedRequestResult,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, full_name, bio, avatar_url, is_online")
        .eq("id", profileId)
        .maybeSingle(),
      supabase
        .from("posts")
        .select("id, content, image_url, created_at, user_id")
        .eq("user_id", profileId)
        .order("created_at", { ascending: false }),
      supabase.from("likes").select("post_id, user_id"),
      supabase.from("followers").select("follower_id, following_id"),
      nextViewerId && profileId && nextViewerId !== profileId
        ? supabase
            .from("friend_requests")
            .select("id")
            .eq("sender_id", nextViewerId)
            .eq("receiver_id", profileId)
            .eq("status", "pending")
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      nextViewerId && profileId && nextViewerId !== profileId
        ? supabase
            .from("friend_requests")
            .select("id")
            .eq("sender_id", profileId)
            .eq("receiver_id", nextViewerId)
            .eq("status", "pending")
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      nextViewerId && profileId && nextViewerId !== profileId
        ? supabase
            .from("friend_requests")
            .select("id")
            .eq("status", "accepted")
            .or(
              `and(sender_id.eq.${nextViewerId},receiver_id.eq.${profileId}),and(sender_id.eq.${profileId},receiver_id.eq.${nextViewerId})`
            )
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (profileResult.error) {
      setErrorMessage(profileResult.error.message || "Unable to load profile.");
      setProfile(null);
      setPosts([]);
      setLoading(false);
      return;
    }

    setProfile((profileResult.data as ProfileRow | null) || null);

    if (postsResult.error) {
      setErrorMessage(postsResult.error.message || "Unable to load posts.");
      setPosts([]);
    } else {
      setPosts((postsResult.data as Post[]) || []);
    }

    const nextLikeCounts: CountMap = {};
    const nextUserLikes: ToggleMap = {};
    for (const like of likesResult.data || []) {
      nextLikeCounts[like.post_id] = (nextLikeCounts[like.post_id] || 0) + 1;
      if (nextViewerId && like.user_id === nextViewerId) {
        nextUserLikes[like.post_id] = true;
      }
    }

    setLikeCounts(nextLikeCounts);
    setUserLikes(nextUserLikes);

    const followerRows = ((followersResult.data as FollowRow[]) || []).filter(Boolean);
    setFollowersCount(followerRows.filter((row) => row.following_id === profileId).length);
    setFollowingCount(followerRows.filter((row) => row.follower_id === profileId).length);
    setIsFollowing(
      !!nextViewerId &&
        followerRows.some((row) => row.follower_id === nextViewerId && row.following_id === profileId)
    );

    if (!nextViewerId || nextViewerId === profileId) {
      setFriendStatus("none");
    } else if (acceptedRequestResult.data) {
      setFriendStatus("friends");
    } else if (outgoingRequestResult.data) {
      setFriendStatus("outgoing_request");
    } else if (incomingRequestResult.data) {
      setFriendStatus("incoming_request");
    } else {
      setFriendStatus("none");
    }

    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (!viewerId || !profileId || viewerId === profileId) return;

    const channel = supabase
      .channel(`profile-friends-${viewerId}-${profileId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friend_requests" },
        async () => {
          await loadPage();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "followers" },
        async () => {
          await loadPage();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [viewerId, profileId, loadPage]);

  const handleLikeToggle = async (postId: string) => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      alert("You must be logged in to like a post.");
      return;
    }

    const alreadyLiked = !!userLikes[postId];

    if (alreadyLiked) {
      const { error: unlikeError } = await supabase
        .from("likes")
        .delete()
        .eq("user_id", user.id)
        .eq("post_id", postId);

      if (unlikeError) {
        alert(`Unlike error: ${unlikeError.message}`);
        return;
      }

      setUserLikes((prev) => ({ ...prev, [postId]: false }));
      setLikeCounts((prev) => ({
        ...prev,
        [postId]: Math.max((prev[postId] || 1) - 1, 0),
      }));
      return;
    }

    const { error: likeError } = await supabase
      .from("likes")
      .insert([{ user_id: user.id, post_id: postId }]);

    if (likeError) {
      alert(`Like error: ${likeError.message}`);
      return;
    }

    setUserLikes((prev) => ({ ...prev, [postId]: true }));
    setLikeCounts((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
  };

  const handleFollowToggle = async () => {
    if (!viewerId || !profileId || isOwnProfile) return;

    setFollowLoading(true);

    if (isFollowing) {
      const { error } = await supabase
        .from("followers")
        .delete()
        .eq("follower_id", viewerId)
        .eq("following_id", profileId);

      if (error) {
        alert(`Unfollow error: ${error.message}`);
        setFollowLoading(false);
        return;
      }

      setIsFollowing(false);
      setFollowersCount((prev) => Math.max(prev - 1, 0));
      setFollowLoading(false);
      return;
    }

    const { error } = await supabase
      .from("followers")
      .insert([{ follower_id: viewerId, following_id: profileId }]);

    if (error) {
      alert(`Follow error: ${error.message}`);
      setFollowLoading(false);
      return;
    }

    setIsFollowing(true);
    setFollowersCount((prev) => prev + 1);
    setFollowLoading(false);
  };

  const handleSendFriendRequest = async () => {
    if (!viewerId || !profileId || isOwnProfile) return;

    setFriendLoading(true);

    try {
      const { data, error } = await supabase
        .from("friend_requests")
        .insert([
          {
            sender_id: viewerId,
            receiver_id: profileId,
            status: "pending",
          },
        ])
        .select("id")
        .single();

      if (error) {
        throw new Error(error.message);
      }

      const { error: notifyError } = await supabase
        .from("notifications")
        .insert([
          {
            user_id: profileId,
            actor_id: viewerId,
            type: "friend_request",
            post_id: null,
            comment_id: null,
            friend_request_id: data.id,
            message: "sent you a friend request.",
            is_read: false,
          },
        ]);

      if (notifyError) {
        console.error("Friend request notification error:", notifyError.message);
      }

      setFriendStatus("outgoing_request");
      showFriendStatus("Friend request sent.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to send friend request.";
      alert(message);
    } finally {
      setFriendLoading(false);
    }
  };

  const handleCancelFriendRequest = async () => {
    if (!viewerId || !profileId || isOwnProfile) return;

    setFriendLoading(true);
    try {
      await cancelFriendRequest(supabase, viewerId, profileId);
      setFriendStatus("none");
      showFriendStatus("Friend request cancelled.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to cancel friend request.";
      alert(message);
    } finally {
      setFriendLoading(false);
    }
  };

  const handleAcceptFriendRequest = async () => {
    if (!viewerId || !profileId || isOwnProfile) return;

    setFriendLoading(true);
    try {
      await acceptFriendRequest(supabase, viewerId, profileId);

      const { data: acceptedRow } = await supabase
        .from("friend_requests")
        .select("id")
        .eq("sender_id", profileId)
        .eq("receiver_id", viewerId)
        .eq("status", "accepted")
        .maybeSingle();

      const { error: notifyError } = await supabase
        .from("notifications")
        .insert([
          {
            user_id: profileId,
            actor_id: viewerId,
            type: "friend_accept",
            post_id: null,
            comment_id: null,
            friend_request_id: acceptedRow?.id || null,
            message: "accepted your friend request.",
            is_read: false,
          },
        ]);

      if (notifyError) {
        console.error("Friend accept notification error:", notifyError.message);
      }

      setFriendStatus("friends");
      showFriendStatus("Friend request accepted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to accept friend request.";
      alert(message);
    } finally {
      setFriendLoading(false);
    }
  };

  const handleDeclineFriendRequest = async () => {
    if (!viewerId || !profileId || isOwnProfile) return;

    setFriendLoading(true);
    try {
      await declineFriendRequest(supabase, viewerId, profileId);
      setFriendStatus("none");
      showFriendStatus("Friend request declined.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to decline friend request.";
      alert(message);
    } finally {
      setFriendLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (!viewerId || !profileId || isOwnProfile) return;

    const confirmed = window.confirm("Remove this friend?");
    if (!confirmed) return;

    setFriendLoading(true);
    try {
      await removeFriend(supabase, viewerId, profileId);
      setFriendStatus("none");
      showFriendStatus("Friend removed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to remove friend.";
      alert(message);
    } finally {
      setFriendLoading(false);
    }
  };

  const getInitial = (name?: string | null, username?: string | null) => {
    const value = name || username || "U";
    return value.charAt(0).toUpperCase();
  };

  const getFriendStatusLabel = () => {
    if (isOwnProfile) return "";
    if (friendStatus === "friends") return "Friends";
    if (friendStatus === "incoming_request") return "Incoming Request";
    if (friendStatus === "outgoing_request") return "Request Sent";
    return "Not Friends Yet";
  };

  return (
    <div className="min-h-screen bg-[#07090d] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
          <aside style={sideCardStyle}>
            <h2 style={{ marginTop: 0, fontSize: "24px" }}>Parapost Network</h2>
            <p style={{ color: "#9ca3af", fontSize: "14px", marginTop: 0 }}>Profile view</p>

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
            <div className="mx-auto w-full max-w-3xl space-y-4 md:space-y-6">
              <div style={mainCardStyle}>
                <div
                  className="flex flex-col md:flex-row"
                  style={{
                    display: "flex",
                    gap: "18px",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      width: "96px",
                      height: "96px",
                      flexShrink: 0,
                    }}
                  >
                    {profile?.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt="Profile"
                        style={{
                          width: "96px",
                          height: "96px",
                          borderRadius: "50%",
                          objectFit: "cover",
                          border: "2px solid rgba(255,255,255,0.10)",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "96px",
                          height: "96px",
                          borderRadius: "50%",
                          background: "#374151",
                          color: "#f9fafb",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "30px",
                          border: "2px solid rgba(255,255,255,0.10)",
                        }}
                      >
                        {getInitial(profile?.full_name, profile?.username)}
                      </div>
                    )}

                    {profile?.is_online ? (
                      <span
                        style={{
                          position: "absolute",
                          right: "6px",
                          bottom: "6px",
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          background: "#22c55e",
                          border: "3px solid #07090d",
                          boxShadow: "0 0 8px rgba(34,197,94,0.65)",
                        }}
                      />
                    ) : null}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="flex flex-col md:flex-row md:items-start md:justify-between"
                      style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}
                    >
                      <div>
                        <h1 style={{ margin: 0, fontSize: "30px", lineHeight: 1.1 }}>
                          {profile?.full_name || profile?.username || "Profile"}
                        </h1>
                        <p
                          style={{
                            margin: "8px 0 0",
                            color: "#9ca3af",
                            fontSize: "15px",
                          }}
                        >
                          @{profile?.username || "no-username"}
                        </p>

                        {!isOwnProfile && viewerId && (
                          <div style={{ marginTop: "12px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                            <span style={getFriendStatusPillStyle(friendStatus)}>
                              {getFriendStatusLabel()}
                            </span>

                            {friendStatus === "friends" && (
                              <Link href="/friends" style={miniLinkStyle}>
                                View Friends
                              </Link>
                            )}

                            {friendStatus === "incoming_request" && (
                              <Link href="/friends/requests" style={miniLinkStyle}>
                                Open Requests
                              </Link>
                            )}
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <Link
                          href={`/profile/${profileId}/reels`}
                          style={{
                            ...secondaryButtonStyle,
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          Reels
                        </Link>

                        {isOwnProfile ? (
                          <button
                            onClick={() => router.push(`/profile/${viewerId}/edit`)}
                            style={secondaryButtonStyle}
                          >
                            Edit profile
                          </button>
                        ) : viewerId ? (
                          <>
                            <button
                              onClick={handleFollowToggle}
                              disabled={followLoading}
                              style={isFollowing ? secondaryButtonStyle : primaryButtonStyle}
                            >
                              {followLoading ? "Saving..." : isFollowing ? "Following" : "Follow"}
                            </button>

                            {friendStatus === "none" ? (
                              <button
                                onClick={handleSendFriendRequest}
                                disabled={friendLoading}
                                style={secondaryButtonStyle}
                              >
                                {friendLoading ? "Saving..." : "Add Friend"}
                              </button>
                            ) : friendStatus === "outgoing_request" ? (
                              <button
                                onClick={handleCancelFriendRequest}
                                disabled={friendLoading}
                                style={secondaryButtonStyle}
                              >
                                {friendLoading ? "Saving..." : "Requested"}
                              </button>
                            ) : friendStatus === "incoming_request" ? (
                              <>
                                <button
                                  onClick={handleAcceptFriendRequest}
                                  disabled={friendLoading}
                                  style={primaryButtonStyle}
                                >
                                  {friendLoading ? "Saving..." : "Accept"}
                                </button>
                                <button
                                  onClick={handleDeclineFriendRequest}
                                  disabled={friendLoading}
                                  style={secondaryButtonStyle}
                                >
                                  {friendLoading ? "Saving..." : "Decline"}
                                </button>
                              </>
                            ) : friendStatus === "friends" ? (
                              <button
                                onClick={handleRemoveFriend}
                                disabled={friendLoading}
                                style={secondaryButtonStyle}
                              >
                                {friendLoading ? "Saving..." : "Friends"}
                              </button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>

                    {friendStatusMessage && (
                      <div style={statusToastStyle}>
                        {friendStatusMessage}
                      </div>
                    )}

                    <p
                      style={{
                        margin: "14px 0 0",
                        color: "#d1d5db",
                        lineHeight: 1.7,
                      }}
                    >
                      {profile?.bio || "No bio added yet."}
                    </p>

                    <div
                      className="grid grid-cols-2 md:grid-cols-4"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                        gap: "12px",
                        marginTop: "18px",
                      }}
                    >
                      <div style={statPillStyle}>
                        <strong style={statNumberStyle}>{posts.length}</strong>
                        <span style={statLabelStyle}>Posts</span>
                      </div>
                      <div style={statPillStyle}>
                        <strong style={statNumberStyle}>{followersCount}</strong>
                        <span style={statLabelStyle}>Followers</span>
                      </div>
                      <div style={statPillStyle}>
                        <strong style={statNumberStyle}>{followingCount}</strong>
                        <span style={statLabelStyle}>Following</span>
                      </div>
                      <div style={statPillStyle}>
                        <strong style={statNumberStyle}>
                          {Object.values(likeCounts).reduce((sum, count) => sum + count, 0)}
                        </strong>
                        <span style={statLabelStyle}>Likes</span>
                      </div>
                    </div>

                    {!loading && !errorMessage && profile && !isOwnProfile ? (
                      <MutualFriendsPreviewCard
                        currentUserId={viewerId}
                        profileUserId={profileId}
                      />
                    ) : null}
                  </div>
                </div>
              </div>

              <div style={mainCardStyle}>
                <div
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between"
                  style={{
                    display: "flex",
                    gap: "10px",
                    flexWrap: "wrap",
                    marginBottom: "8px",
                  }}
                >
                  <div>
                    <h3 style={{ marginTop: 0, marginBottom: "4px" }}>Profile Feed</h3>
                    <p style={{ margin: 0, color: "#9ca3af", fontSize: "13px" }}>
                      Posts shared by this investigator.
                    </p>
                  </div>
                  <Link
                    href="/dashboard"
                    style={{ ...secondaryButtonStyle, textDecoration: "none" }}
                  >
                    Back to feed
                  </Link>
                </div>

                {loading ? (
                  <p style={{ color: "#9ca3af", marginBottom: 0 }}>Loading profile...</p>
                ) : errorMessage ? (
                  <div style={messageBoxStyle}>{errorMessage}</div>
                ) : !profile ? (
                  <div style={messageBoxStyle}>This profile could not be found.</div>
                ) : posts.length === 0 ? (
                  <p style={{ color: "#9ca3af", marginBottom: 0 }}>No posts shared yet.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {posts.map((post) => {
                      const liked = !!userLikes[post.id];
                      const likeCount = likeCounts[post.id] || 0;

                      return (
                        <div key={post.id} style={postCardStyle}>
                          <div
                            style={{
                              marginBottom: "12px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "12px",
                              flexWrap: "wrap",
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600, color: "#f9fafb" }}>
                                {profile.full_name || profile.username || "Unnamed User"}
                              </div>
                              <div style={{ fontSize: "13px", color: "#9ca3af" }}>
                                @{profile.username || "no-username"} · {formatTimeAgo(post.created_at)}
                              </div>
                            </div>
                          </div>

                          {post.content && (
                            <p
                              style={{
                                margin: 0,
                                whiteSpace: "pre-wrap",
                                lineHeight: 1.7,
                                color: "#f9fafb",
                              }}
                            >
                              {post.content}
                            </p>
                          )}

                          {post.image_url && (
                            <img
                              src={post.image_url}
                              alt="Post"
                              style={{
                                width: "100%",
                                maxHeight: "680px",
                                marginTop: "12px",
                                borderRadius: "18px",
                                objectFit: "cover",
                                display: "block",
                                boxShadow: "0 10px 28px rgba(0,0,0,0.30)",
                              }}
                            />
                          )}

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              marginTop: "18px",
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              onClick={() => handleLikeToggle(post.id)}
                              style={actionButtonStyle}
                            >
                              <span>{liked ? "♥" : "♡"}</span>
                              <span>{likeCount}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={sideCardStyle}>
              <h3 style={{ marginTop: 0 }}>Profile Summary</h3>
              <p style={{ color: "#d1d5db", marginBottom: "10px" }}>
                Viewer: <strong style={{ color: "white" }}>{viewerEmail || "Guest"}</strong>
              </p>
              <p style={{ color: "#d1d5db", marginBottom: "10px" }}>
                Status: <strong style={{ color: "white" }}>{profile?.is_online ? "Online" : "Offline"}</strong>
              </p>
              {!isOwnProfile && viewerId && (
                <p style={{ color: "#d1d5db", marginBottom: 0 }}>
                  Friend Status: <strong style={{ color: "white" }}>{getFriendStatusLabel()}</strong>
                </p>
              )}
            </div>

            <div style={sideCardStyle}>
              <h3 style={{ marginTop: 0 }}>Parapost Reels</h3>
              <p style={{ color: "#d1d5db", lineHeight: 1.7, marginBottom: "12px" }}>
                Best profile placement for launch: add a dedicated Reels strip under the main profile header later so creator content feels premium without pushing regular posts down too hard.
              </p>
              <div style={pillMutedStyle}>Launch prep placement noted</div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function getFriendStatusPillStyle(friendStatus: FriendRequestStatus): CSSProperties {
  if (friendStatus === "friends") {
    return {
      display: "inline-flex",
      alignItems: "center",
      minHeight: "34px",
      padding: "0 12px",
      borderRadius: "999px",
      color: "#86efac",
      background: "rgba(34,197,94,0.10)",
      border: "1px solid rgba(34,197,94,0.24)",
      fontWeight: 700,
      fontSize: "12px",
    };
  }

  if (friendStatus === "incoming_request") {
    return {
      display: "inline-flex",
      alignItems: "center",
      minHeight: "34px",
      padding: "0 12px",
      borderRadius: "999px",
      color: "#fcd34d",
      background: "rgba(250,204,21,0.10)",
      border: "1px solid rgba(250,204,21,0.24)",
      fontWeight: 700,
      fontSize: "12px",
    };
  }

  if (friendStatus === "outgoing_request") {
    return {
      display: "inline-flex",
      alignItems: "center",
      minHeight: "34px",
      padding: "0 12px",
      borderRadius: "999px",
      color: "#c4b5fd",
      background: "rgba(139,92,246,0.10)",
      border: "1px solid rgba(139,92,246,0.24)",
      fontWeight: 700,
      fontSize: "12px",
    };
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "34px",
    padding: "0 12px",
    borderRadius: "999px",
    color: "#d1d5db",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.10)",
    fontWeight: 700,
    fontSize: "12px",
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

const postCardStyle: CSSProperties = {
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

const primaryButtonStyle: CSSProperties = {
  background: "white",
  color: "black",
  border: "none",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 700,
  cursor: "pointer",
  minHeight: "42px",
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

const miniLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "34px",
  padding: "0 12px",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.05)",
  color: "#f9fafb",
  border: "1px solid rgba(255,255,255,0.10)",
  textDecoration: "none",
  fontSize: "12px",
  fontWeight: 700,
};

const statusToastStyle: CSSProperties = {
  marginTop: "14px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#f9fafb",
  borderRadius: "18px",
  padding: "10px 12px",
  fontSize: "13px",
};

const actionButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "#f9fafb",
  padding: "10px 14px",
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

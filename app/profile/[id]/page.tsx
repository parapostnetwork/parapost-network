"use client";

import { ChangeEvent, CSSProperties, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type Reel = {
  id: string;
  video_url: string | null;
  user_id: string;
  created_at?: string | null;
};

type SharedReel = {
  id: string;
  title?: string | null;
  caption?: string | null;
  video_url: string | null;
  poster_url?: string | null;
  user_id: string | null;
  creator_profile_id?: string | null;
  created_at?: string | null;
};

type ReelShareProfilePost = {
  id: string;
  reel_id: string;
  user_id: string;
  caption: string | null;
  created_at: string;
  reel: SharedReel | null;
  originalCreator: ProfileRow | null;
};

type ProfileFeedItem =
  | (Post & { feedKind: "post" })
  | (ReelShareProfilePost & { feedKind: "reel_share" });

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


function isLikelyShortenedLink(hostname: string) {
  const shortenerDomains = [
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "goo.gl",
    "ow.ly",
    "buff.ly",
    "cutt.ly",
    "is.gd",
    "s.id",
    "rebrand.ly",
    "lnkd.in",
    "shorturl.at",
    "tiny.cc",
    "trib.al",
    "amzn.to",
    "youtu.be",
  ];

  return shortenerDomains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
}

function isBlockedLinkProtocol(href: string) {
  const normalized = href.trim().toLowerCase();
  return (
    normalized.startsWith("javascript:") ||
    normalized.startsWith("data:") ||
    normalized.startsWith("vbscript:") ||
    normalized.startsWith("file:")
  );
}

function handleSafeExternalLinkClick(
  event: React.MouseEvent<HTMLAnchorElement>,
  href: string
) {
  event.preventDefault();
  event.stopPropagation();

  if (isBlockedLinkProtocol(href)) {
    alert("This link was blocked because it may be unsafe.");
    return;
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(href);
  } catch {
    alert("This link could not be opened because it does not look valid.");
    return;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, "");
  const isShortened = isLikelyShortenedLink(hostname);

  const message = isShortened
    ? `Safety notice: this appears to be a shortened link (${hostname}). The final destination may be hidden. Only continue if you trust this link.\n\nOpen it anyway?`
    : `You are leaving Parapost Network and opening:\n\n${hostname}\n\nOnly continue if you trust this site.`;

  const confirmed = window.confirm(message);

  if (!confirmed) return;

  window.open(parsedUrl.toString(), "_blank", "noopener,noreferrer");
}

function renderLinkedText(text: string): ReactNode {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (!part.match(urlRegex)) {
      return part;
    }

    const rawLabel = part;
    const cleanLabel = rawLabel.replace(/[),.;!?]+$/, "");
    const trailing = rawLabel.slice(cleanLabel.length);
    const href = cleanLabel.startsWith("http") ? cleanLabel : `https://${cleanLabel}`;

    if (isBlockedLinkProtocol(href)) {
      return (
        <span key={`${part}-${index}`} style={{ color: "#fca5a5", fontWeight: 800 }}>
          [unsafe link blocked]{trailing}
        </span>
      );
    }

    return (
      <span key={`${part}-${index}`}>
        <a
          href={href}
          onClick={(event) => handleSafeExternalLinkClick(event, href)}
          style={{
            color: "#93c5fd",
            fontWeight: 800,
            textDecoration: "none",
            wordBreak: "break-word",
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.textDecoration = "underline";
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.textDecoration = "none";
          }}
        >
          {cleanLabel}
        </a>
        {trailing}
      </span>
    );
  });
}


type LinkPreviewData = {
  href: string;
  hostname: string;
  label: string;
  type: "youtube" | "website";
  youtubeVideoId?: string;
};

function getYoutubeVideoId(url: URL) {
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    return url.pathname.replace("/", "").split(/[?&#]/)[0] || "";
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (url.pathname.startsWith("/watch")) {
      return url.searchParams.get("v") || "";
    }

    if (url.pathname.startsWith("/shorts/")) {
      return url.pathname.split("/shorts/")[1]?.split(/[?&#/]/)[0] || "";
    }

    if (url.pathname.startsWith("/embed/")) {
      return url.pathname.split("/embed/")[1]?.split(/[?&#/]/)[0] || "";
    }
  }

  return "";
}

function getFirstSafeLinkPreview(text: string): LinkPreviewData | null {
  const match = text.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
  if (!match) return null;

  const cleanLabel = match[0].replace(/[),.;!?]+$/, "");
  const href = cleanLabel.startsWith("http") ? cleanLabel : `https://${cleanLabel}`;

  if (isBlockedLinkProtocol(href)) return null;

  try {
    const parsedUrl = new URL(href);
    const hostname = parsedUrl.hostname.replace(/^www\./, "");
    const youtubeVideoId = getYoutubeVideoId(parsedUrl);

    if (youtubeVideoId) {
      return {
        href: parsedUrl.toString(),
        hostname,
        label: "YouTube video",
        type: "youtube",
        youtubeVideoId,
      };
    }

    return {
      href: parsedUrl.toString(),
      hostname,
      label: hostname,
      type: "website",
    };
  } catch {
    return null;
  }
}

function LinkPreviewCard({ text }: { text: string }) {
  const preview = getFirstSafeLinkPreview(text);

  if (!preview) return null;

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
    preview.hostname
  )}&sz=64`;

  return (
    <a
      href={preview.href}
      onClick={(event) => handleSafeExternalLinkClick(event, preview.href)}
      style={linkPreviewCardStyle}
    >
      <div style={linkPreviewMediaStyle}>
        {preview.type === "youtube" && preview.youtubeVideoId ? (
          <>
            <img
              src={`https://img.youtube.com/vi/${preview.youtubeVideoId}/hqdefault.jpg`}
              alt="YouTube preview"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
            <div style={linkPreviewPlayOverlayStyle}>▶</div>
          </>
        ) : (
          <div style={linkPreviewFaviconWrapStyle}>
            <img
              src={faviconUrl}
              alt=""
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
              }}
            />
          </div>
        )}
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={linkPreviewEyebrowStyle}>
          {preview.type === "youtube" ? "YouTube" : "External Website"}
        </div>
        <div style={linkPreviewTitleStyle}>
          {preview.type === "youtube" ? "Watch video" : preview.label}
        </div>
        <div style={linkPreviewDomainStyle}>{preview.hostname}</div>
      </div>
    </a>
  );
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
  const [profilePostContent, setProfilePostContent] = useState("");
  const [profilePostImage, setProfilePostImage] = useState<File | null>(null);
  const [profilePostImagePreviewUrl, setProfilePostImagePreviewUrl] = useState("");
  const [profilePostLoading, setProfilePostLoading] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [sharedReelPosts, setSharedReelPosts] = useState<ReelShareProfilePost[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
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
  const [openPostMenuId, setOpenPostMenuId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostContent, setEditingPostContent] = useState("");

  const profilePostFileInputRef = useRef<HTMLInputElement | null>(null);

  const isOwnProfile = !!viewerId && viewerId === profileId;

  const profileFeedItems = useMemo<ProfileFeedItem[]>(() => {
    return [
      ...posts.map((post) => ({ ...post, feedKind: "post" as const })),
      ...sharedReelPosts.map((share) => ({ ...share, feedKind: "reel_share" as const })),
    ].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [posts, sharedReelPosts]);

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
      reelsResult,
      reelSharesResult,
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
      supabase
        .from("reels")
        .select("id, video_url, user_id, created_at")
        .eq("user_id", profileId)
        .order("created_at", { ascending: false }),
      supabase
        .from("reel_shares")
        .select("id, reel_id, user_id, caption, created_at")
        .eq("user_id", profileId)
        .order("created_at", { ascending: false }),
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
      setSharedReelPosts([]);
      setReels([]);
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

    if (reelsResult.error) {
      setReels([]);
    } else {
      setReels((reelsResult.data as Reel[]) || []);
    }

    if (reelSharesResult.error) {
      setSharedReelPosts([]);
    } else {
      const shareRows = ((reelSharesResult.data as Omit<ReelShareProfilePost, "reel" | "originalCreator">[]) || []).filter(Boolean);
      const sharedReelIds = [...new Set(shareRows.map((share) => share.reel_id).filter(Boolean))];

      let sharedReels: SharedReel[] = [];
      let sharedCreators: ProfileRow[] = [];

      if (sharedReelIds.length > 0) {
        const { data: sharedReelsData, error: sharedReelsError } = await supabase
          .from("reels")
          .select("id, title, caption, video_url, poster_url, user_id, creator_profile_id, created_at")
          .in("id", sharedReelIds);

        if (!sharedReelsError) {
          sharedReels = (sharedReelsData as SharedReel[]) || [];
        }
      }

      const sharedCreatorIds = [
        ...new Set(
          sharedReels
            .map((reel) => reel.creator_profile_id || reel.user_id)
            .filter(Boolean)
        ),
      ] as string[];

      if (sharedCreatorIds.length > 0) {
        const { data: sharedCreatorData, error: sharedCreatorError } = await supabase
          .from("profiles")
          .select("id, username, full_name, bio, avatar_url, is_online")
          .in("id", sharedCreatorIds);

        if (!sharedCreatorError) {
          sharedCreators = (sharedCreatorData as ProfileRow[]) || [];
        }
      }

      const reelMap = new Map(sharedReels.map((reel) => [reel.id, reel]));
      const creatorMap = new Map(sharedCreators.map((creator) => [creator.id, creator]));

      setSharedReelPosts(
        shareRows.map((share) => {
          const reel = reelMap.get(share.reel_id) || null;
          const creatorId = reel?.creator_profile_id || reel?.user_id || "";

          return {
            ...share,
            reel,
            originalCreator: creatorMap.get(creatorId) || null,
          };
        })
      );
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
    const handleGlobalClick = () => {
      setOpenPostMenuId(null);
    };

    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("scroll", handleGlobalClick);

    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("scroll", handleGlobalClick);
    };
  }, []);

  useEffect(() => {
    if (!profilePostImage) {
      setProfilePostImagePreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(profilePostImage);
    setProfilePostImagePreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [profilePostImage]);

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

  const handleRemoveSharedReel = async (shareId: string) => {
    if (!viewerId || !isOwnProfile) return;

    const confirmed = window.confirm("Remove this shared reel from your profile posts?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("reel_shares")
      .delete()
      .eq("id", shareId)
      .eq("user_id", viewerId);

    if (error) {
      alert(`Remove shared reel error: ${error.message}`);
      return;
    }

    setSharedReelPosts((prev) => prev.filter((share) => share.id !== shareId));
  };

  const handleProfilePostImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setProfilePostImage(file);
  };

  const handleRemoveProfilePostImage = () => {
    setProfilePostImage(null);
    setProfilePostImagePreviewUrl("");

    if (profilePostFileInputRef.current) {
      profilePostFileInputRef.current.value = "";
    }
  };

  const handleCreateProfilePost = async () => {
    if (!isOwnProfile || !viewerId) return;

    if (!profilePostContent.trim() && !profilePostImage) {
      alert("Please add text or choose an image.");
      return;
    }

    setProfilePostLoading(true);

    let imageUrl: string | null = null;

    if (profilePostImage) {
      const fileExt = profilePostImage.name.split(".").pop() || "jpg";
      const fileName = `${viewerId}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("post-images")
        .upload(fileName, profilePostImage, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        alert(`Upload error: ${uploadError.message}`);
        setProfilePostLoading(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("post-images")
        .getPublicUrl(fileName);

      imageUrl = publicUrlData.publicUrl;
    }

    const { error: insertError } = await supabase.from("posts").insert([
      {
        content: profilePostContent.trim(),
        user_id: viewerId,
        image_url: imageUrl,
      },
    ]);

    if (insertError) {
      alert(`Post error: ${insertError.message}`);
      setProfilePostLoading(false);
      return;
    }

    setProfilePostContent("");
    handleRemoveProfilePostImage();
    await loadPage();
    setProfilePostLoading(false);
  };


  const handleStartEditPost = (post: Post) => {
    if (post.user_id !== viewerId) return;
    setEditingPostId(post.id);
    setEditingPostContent(post.content || "");
    setOpenPostMenuId(null);
  };

  const handleCancelPostEdit = () => {
    setEditingPostId(null);
    setEditingPostContent("");
  };

  const handleSavePostEdit = async (postId: string) => {
    const trimmed = editingPostContent.trim();

    const { error } = await supabase
      .from("posts")
      .update({ content: trimmed })
      .eq("id", postId)
      .eq("user_id", viewerId);

    if (error) {
      alert(`Edit post error: ${error.message}`);
      return;
    }

    setPosts((prev) =>
      prev.map((post) => (post.id === postId ? { ...post, content: trimmed } : post))
    );

    setEditingPostId(null);
    setEditingPostContent("");
  };

  const handleDeletePost = async (postId: string) => {
    const confirmed = window.confirm("Delete this post from your profile and the homepage feed?");
    if (!confirmed) return;

    const { error: likesDeleteError } = await supabase
      .from("likes")
      .delete()
      .eq("post_id", postId);

    if (likesDeleteError) {
      console.warn("Profile post likes cleanup skipped:", likesDeleteError.message);
    }

    const { error: postDeleteError } = await supabase
      .from("posts")
      .delete()
      .eq("id", postId)
      .eq("user_id", viewerId);

    if (postDeleteError) {
      alert(`Delete post error: ${postDeleteError.message}`);
      return;
    }

    setPosts((prev) => prev.filter((post) => post.id !== postId));
    setLikeCounts((prev) => {
      const next = { ...prev };
      delete next[postId];
      return next;
    });
    setUserLikes((prev) => {
      const next = { ...prev };
      delete next[postId];
      return next;
    });
    setOpenPostMenuId(null);
  };

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
                        <strong style={statNumberStyle}>{reels.length}</strong>
                        <span style={statLabelStyle}>Reels</span>
                      </div>
                      <div style={statPillStyle}>
                        <strong style={statNumberStyle}>{followersCount}</strong>
                        <span style={statLabelStyle}>Followers</span>
                      </div>
                      <div style={statPillStyle}>
                        <strong style={statNumberStyle}>{followingCount}</strong>
                        <span style={statLabelStyle}>Following</span>
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

              {isOwnProfile ? (
                <div style={mainCardStyle}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      marginBottom: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <h3 style={{ marginTop: 0, marginBottom: "4px" }}>Create a Post</h3>
                      <p style={{ margin: 0, color: "#9ca3af", fontSize: "13px" }}>
                        Post to your profile and the homepage feed.
                      </p>
                    </div>

                    <span
                      style={{
                        fontSize: "12px",
                        color: "#d1d5db",
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.10)",
                        borderRadius: "999px",
                        padding: "6px 10px",
                      }}
                    >
                      Profile post
                    </span>
                  </div>

                  <textarea
                    value={profilePostContent}
                    onChange={(event) => setProfilePostContent(event.target.value)}
                    placeholder="Share an update, experience, evidence, link, or thought..."
                    rows={4}
                    style={profilePostTextAreaStyle}
                  />

                  <div style={profilePostMediaBoxStyle}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                        marginBottom: profilePostImagePreviewUrl ? "12px" : "0px",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: "#f9fafb", marginBottom: "4px" }}>
                          Add media
                        </div>
                        <p style={{ margin: 0, fontSize: "13px", color: "#9ca3af" }}>
                          Optional image for your profile post.
                        </p>
                      </div>

                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => profilePostFileInputRef.current?.click()}
                          style={secondaryButtonStyle}
                        >
                          {profilePostImage ? "Change image" : "Upload image"}
                        </button>

                        {profilePostImage ? (
                          <button
                            type="button"
                            onClick={handleRemoveProfilePostImage}
                            style={profilePostDangerButtonStyle}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <input
                      ref={profilePostFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleProfilePostImageChange}
                      style={{ display: "none" }}
                    />

                    {profilePostImagePreviewUrl ? (
                      <img
                        src={profilePostImagePreviewUrl}
                        alt="Selected preview"
                        style={{
                          width: "100%",
                          maxHeight: "320px",
                          objectFit: "cover",
                          borderRadius: "18px",
                          border: "1px solid rgba(255,255,255,0.10)",
                          display: "block",
                        }}
                      />
                    ) : null}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px",
                      flexWrap: "wrap",
                      marginTop: "12px",
                    }}
                  >
                    <p style={{ margin: 0, color: "#6b7280", fontSize: "13px" }}>
                      This will appear on your profile and in the homepage feed.
                    </p>

                    <button
                      onClick={handleCreateProfilePost}
                      disabled={profilePostLoading}
                      style={primaryButtonStyle}
                    >
                      {profilePostLoading ? "Posting..." : "Publish post"}
                    </button>
                  </div>
                </div>
              ) : null}

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
                ) : profileFeedItems.length === 0 ? (
                  <p style={{ color: "#9ca3af", marginBottom: 0 }}>No posts shared yet.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {profileFeedItems.map((item) => {
                      if (item.feedKind === "reel_share") {
                        const creatorName =
                          item.originalCreator?.full_name ||
                          item.originalCreator?.username ||
                          "Original creator";
                        const creatorHandle = item.originalCreator?.username || "creator";

                        return (
                          <div key={item.id} style={postCardStyle}>
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
                                  @{profile.username || "no-username"} shared a reel · {formatTimeAgo(item.created_at)}
                                </div>
                              </div>

                              {isOwnProfile ? (
                                <button
                                  onClick={() => handleRemoveSharedReel(item.id)}
                                  style={secondaryButtonStyle}
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>

                            {item.caption ? (
                              <p
                                style={{
                                  margin: "0 0 12px",
                                  whiteSpace: "pre-wrap",
                                  lineHeight: 1.7,
                                  color: "#f9fafb",
                                }}
                              >
                                {renderLinkedText(item.caption)}
                              </p>
                            ) : null}

                            <div style={sharedReelCardStyle}>
                              <Link
                                href={`/reels?reel=${item.reel_id}`}
                                style={sharedReelPreviewStyle}
                              >
                                {item.reel?.video_url ? (
                                  <video
                                    src={item.reel.video_url}
                                    poster={item.reel.poster_url || undefined}
                                    muted
                                    playsInline
                                    preload="metadata"
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      objectFit: "cover",
                                      display: "block",
                                      background: "#000",
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      display: "grid",
                                      placeItems: "center",
                                      color: "#9ca3af",
                                      background: "#05070a",
                                      textAlign: "center",
                                      padding: "12px",
                                    }}
                                  >
                                    Reel unavailable
                                  </div>
                                )}

                                <div
                                  style={{
                                    position: "absolute",
                                    inset: 0,
                                    background:
                                      "linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.34) 100%)",
                                    display: "grid",
                                    placeItems: "center",
                                    color: "white",
                                    fontSize: "32px",
                                    textShadow: "0 6px 18px rgba(0,0,0,0.55)",
                                  }}
                                >
                                  ▶
                                </div>
                              </Link>

                              <div style={{ flex: 1, minWidth: "180px" }}>
                                <div
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    color: "#d1d5db",
                                    fontSize: "12px",
                                    border: "1px solid rgba(255,255,255,0.10)",
                                    borderRadius: "999px",
                                    padding: "6px 9px",
                                    background: "rgba(255,255,255,0.05)",
                                    marginBottom: "10px",
                                  }}
                                >
                                  Parapost Reel
                                </div>

                                <h4
                                  style={{
                                    margin: "0 0 6px",
                                    color: "#f9fafb",
                                    fontSize: "18px",
                                    lineHeight: 1.25,
                                  }}
                                >
                                  {item.reel?.title || "Parapost Reel"}
                                </h4>

                                <p
                                  style={{
                                    margin: "0 0 12px",
                                    color: "#9ca3af",
                                    fontSize: "13px",
                                    lineHeight: 1.6,
                                  }}
                                >
                                  Original by {creatorName} @{creatorHandle}
                                </p>

                                <Link
                                  href={`/reels?reel=${item.reel_id}`}
                                  style={{ ...primaryButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                                >
                                  ▶ View Reel
                                </Link>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      const post = item;
                      const liked = !!userLikes[post.id];
                      const likeCount = likeCounts[post.id] || 0;
                      const isPostOwner = viewerId === post.user_id;
                      const isEditingPost = editingPostId === post.id;

                      return (
                        <div key={post.id} style={{ ...postCardStyle, position: "relative" }}>
                          <div
                            style={{
                              marginBottom: "12px",
                              display: "flex",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              gap: "12px",
                              flexWrap: "wrap",
                              paddingRight: isPostOwner ? "42px" : 0,
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

                            {isPostOwner ? (
                              <div style={{ position: "absolute", top: "14px", right: "14px" }}>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setOpenPostMenuId((prev) => (prev === post.id ? null : post.id));
                                  }}
                                  style={dotsButtonStyle}
                                  aria-label="Open post menu"
                                >
                                  ⋯
                                </button>

                                {openPostMenuId === post.id ? (
                                  <div style={postMenuStyle} onClick={(event) => event.stopPropagation()}>
                                    <button style={menuItemStyle} onClick={() => handleStartEditPost(post)}>
                                      Edit post
                                    </button>
                                    <button
                                      style={{ ...menuItemStyle, color: "#fca5a5", borderBottom: "none" }}
                                      onClick={() => handleDeletePost(post.id)}
                                    >
                                      Delete post
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>

                          {isEditingPost ? (
                            <div style={{ display: "grid", gap: "10px" }}>
                              <textarea
                                value={editingPostContent}
                                onChange={(event) => setEditingPostContent(event.target.value)}
                                rows={4}
                                style={profilePostTextAreaStyle}
                              />

                              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
                                <button type="button" onClick={handleCancelPostEdit} style={secondaryButtonStyle}>
                                  Cancel
                                </button>
                                <button type="button" onClick={() => handleSavePostEdit(post.id)} style={primaryButtonStyle}>
                                  Save changes
                                </button>
                              </div>
                            </div>
                          ) : post.content ? (
                            <>
                              <p
                                style={{
                                  margin: 0,
                                  whiteSpace: "pre-wrap",
                                  lineHeight: 1.7,
                                  color: "#f9fafb",
                                }}
                              >
                                {renderLinkedText(post.content)}
                              </p>

                              <LinkPreviewCard text={post.content} />
                            </>
                          ) : null}

                          {post.image_url && (
                            <img
                              src={post.image_url}
                              alt="Post"
                              style={{
                                width: "100%",
                                maxHeight: "680px",
                                marginTop: "12px",
                                borderRadius: "22px",
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
                This profile keeps reels browsing separate from Explore Reels. The header Reels button opens the profile grid, and reels can then be opened into the profile-only viewer.
              </p>
              <div style={pillMutedStyle}>Profile-only reels flow active</div>
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

const sharedReelCardStyle: CSSProperties = {
  marginTop: "12px",
  display: "flex",
  gap: "12px",
  alignItems: "center",
  flexWrap: "wrap",
  borderRadius: "22px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(0,0,0,0.30)",
  padding: "12px",
};

const sharedReelPreviewStyle: CSSProperties = {
  width: "clamp(142px, 34vw, 210px)",
  aspectRatio: "9 / 16",
  maxHeight: "360px",
  borderRadius: "18px",
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "#000",
  boxShadow: "0 12px 28px rgba(0,0,0,0.34)",
  flexShrink: 0,
  position: "relative",
  display: "block",
};

const profilePostTextAreaStyle: CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "20px",
  padding: "14px 16px",
  fontSize: "14px",
  outline: "none",
  resize: "vertical",
  fontFamily: "inherit",
  lineHeight: 1.6,
};

const profilePostMediaBoxStyle: CSSProperties = {
  marginTop: "10px",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "22px",
  background: "rgba(255,255,255,0.03)",
  padding: "14px",
};

const profilePostDangerButtonStyle: CSSProperties = {
  background: "rgba(248,113,113,0.08)",
  color: "#fecaca",
  border: "1px solid rgba(248,113,113,0.20)",
  borderRadius: "999px",
  padding: "10px 16px",
  fontWeight: 700,
  cursor: "pointer",
  minHeight: "42px",
};


const dotsButtonStyle: CSSProperties = {
  width: "34px",
  height: "34px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "#f9fafb",
  cursor: "pointer",
  fontSize: "20px",
  lineHeight: 1,
  display: "grid",
  placeItems: "center",
};

const postMenuStyle: CSSProperties = {
  position: "absolute",
  top: "40px",
  right: 0,
  zIndex: 20,
  minWidth: "170px",
  background: "#0b1020",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "16px",
  overflow: "hidden",
  boxShadow: "0 18px 34px rgba(0,0,0,0.34)",
};

const menuItemStyle: CSSProperties = {
  width: "100%",
  background: "transparent",
  color: "#f9fafb",
  border: "none",
  borderBottom: "1px solid rgba(255,255,255,0.07)",
  padding: "12px 14px",
  textAlign: "left",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: 700,
};

const messageBoxStyle: CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#f9fafb",
  borderRadius: "20px",
  padding: "14px",
};


const sharedReelBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  width: "fit-content",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "#d1d5db",
  padding: "7px 10px",
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "0.01em",
};

const sharedReelPreviewFrameStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  borderRadius: "22px",
  border: "1px solid rgba(255,255,255,0.11)",
  background: "linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.025) 100%)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.34)",
};

const sharedReelPlayOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  pointerEvents: "none",
  background:
    "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.10) 45%, rgba(0,0,0,0.38) 100%)",
};

const sharedReelPlayButtonStyle: CSSProperties = {
  width: "56px",
  height: "56px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,0.92)",
  color: "#000",
  fontSize: "22px",
  fontWeight: 900,
  boxShadow: "0 10px 26px rgba(0,0,0,0.38)",
};

const sharedReelMetaStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: "13px",
  lineHeight: 1.5,
};

const sharedReelActionLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  minHeight: "40px",
  borderRadius: "999px",
  background: "white",
  color: "black",
  border: "none",
  padding: "9px 14px",
  fontWeight: 900,
  fontSize: "13px",
  textDecoration: "none",
  boxShadow: "0 8px 20px rgba(0,0,0,0.18)",
};

const sharedReelRemoveButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "40px",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.05)",
  color: "#fecaca",
  border: "1px solid rgba(248,113,113,0.22)",
  padding: "9px 14px",
  fontWeight: 800,
  fontSize: "13px",
  cursor: "pointer",
};


const linkPreviewCardStyle: CSSProperties = {
  marginTop: "12px",
  display: "flex",
  gap: "12px",
  alignItems: "center",
  borderRadius: "20px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(0,0,0,0.24)",
  padding: "10px",
  textDecoration: "none",
  color: "white",
  boxShadow: "0 10px 26px rgba(0,0,0,0.18)",
};

const linkPreviewMediaStyle: CSSProperties = {
  width: "116px",
  height: "74px",
  borderRadius: "16px",
  overflow: "hidden",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  flexShrink: 0,
  position: "relative",
};

const linkPreviewPlayOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  color: "white",
  fontSize: "26px",
  textShadow: "0 6px 18px rgba(0,0,0,0.65)",
  background: "rgba(0,0,0,0.12)",
};

const linkPreviewFaviconWrapStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.075) 0%, rgba(255,255,255,0.025) 100%)",
};

const linkPreviewEyebrowStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: "12px",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: "4px",
};

const linkPreviewTitleStyle: CSSProperties = {
  color: "#f9fafb",
  fontSize: "15px",
  fontWeight: 900,
  lineHeight: 1.25,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const linkPreviewDomainStyle: CSSProperties = {
  color: "#93c5fd",
  fontSize: "13px",
  marginTop: "4px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};


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
import ProfileAboutSection from "@/components/profile/ProfileAboutSection";
import ProfilePhotosSection from "@/components/profile/ProfilePhotosSection";
import BottomNav from "@/components/BottomNav";

type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_online?: boolean | null;
  verified?: boolean | null;
  location?: string | null;
  website?: string | null;
  occupation?: string | null;
  paranormal_focus?: string | null;
  experience_years?: string | null;
  equipment?: string | null;
  favorite_locations?: string | null;
  availability?: string | null;
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

  const [activeProfileTab, setActiveProfileTab] = useState("Posts");
  const [profileActionsOpen, setProfileActionsOpen] = useState(false);

  const profilePostFileInputRef = useRef<HTMLInputElement | null>(null);
  const profileActionSheetRef = useRef<HTMLDivElement | null>(null);

  const isOwnProfile = !!viewerId && viewerId === profileId;

  // ✅ 🔥 ADD THIS FUNCTION RIGHT HERE
  const handleSaveProfileAbout = async (payload: any) => {
    if (!viewerId || !isOwnProfile) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        about_intro: payload.about_intro,
        category: payload.category,
        location: payload.location,
        hometown: payload.hometown,
        relationship_status: payload.relationship_status,
        occupation: payload.occupation,
        company: payload.company,
        education: payload.education,
        website: payload.website,
        email: payload.email,
        phone: payload.phone,
        interests: payload.interests,
        profile_links: payload.profile_links,
      })
      .eq("id", viewerId);

    if (error) {
      console.error("SAVE ERROR:", error);
      alert("Save failed: " + error.message);
      return;
    }

    // 🔥 Prevent UI from disappearing after save
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            ...payload,
          }
        : prev
    );
  };
 
 const handleMessageUser = async () => {
  if (!profileId || !viewerId || profileId === viewerId) return;

  try {
    const { data, error } = await supabase.rpc(
      "get_or_create_direct_conversation",
      {
        other_user_id: profileId,
      }
    );

    if (error || !data) {
      console.error("Message error:", error);
      alert("Could not start conversation");
      return;
    }

    // ✅ Open Parachat hub with selected conversation
    router.push(`/messages?conversation=${data}`);

  } catch (err) {
    console.error("Unexpected message error:", err);
    alert("Something went wrong starting the chat");
  }
};

const profileFeedItems = useMemo<ProfileFeedItem[]>(() => {
  return [
    ...posts.map((post) => ({ ...post, feedKind: "post" as const })),
    ...sharedReelPosts.map((share) => ({
      ...share,
      feedKind: "reel_share" as const,
    })),
  ].sort(
    (a, b) =>
      new Date(b.created_at).getTime() -
      new Date(a.created_at).getTime()
  );
}, [posts, sharedReelPosts]);

const showFriendStatus = useCallback((message: string) => {
  setFriendStatusMessage(message);

  const timer = window.setTimeout(() => {
    setFriendStatusMessage("");
  }, 2500);

  return () => clearTimeout(timer);
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
       .select(`
  id,
  username,
  full_name,
  bio,
  avatar_url,
  is_online,
  location,
  website,
  occupation,
  paranormal_focus,
  experience_years,
  equipment,
  favorite_locations,
  availability,

  about_intro,
  category,
  hometown,
  relationship_status,
  company,
  education,
  email,
  phone,
  interests,
  profile_links
`) 
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
  if (!profileActionsOpen || typeof window === "undefined") return;

  const scrollY = window.scrollY;
  const body = document.body;
  const html = document.documentElement;

  const previousBodyOverflow = body.style.overflow;
  const previousBodyPosition = body.style.position;
  const previousBodyTop = body.style.top;
  const previousBodyWidth = body.style.width;
  const previousHtmlOverflow = html.style.overflow;

  body.style.overflow = "hidden";
  html.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.width = "100%";

  return () => {
    body.style.overflow = previousBodyOverflow;
    body.style.position = previousBodyPosition;
    body.style.top = previousBodyTop;
    body.style.width = previousBodyWidth;
    html.style.overflow = previousHtmlOverflow;

    window.scrollTo(0, scrollY);
  };
}, [profileActionsOpen]);

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

  const handleMobileCreatePostClick = () => {
    if (!isOwnProfile) {
      router.push("/dashboard?createPost=1");
      return;
    }

    setActiveProfileTab("Posts");

    window.setTimeout(() => {
      const composer = document.getElementById("profile-composer");
      composer?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  };

  const handleCopyProfileLink = async () => {
    const href =
      typeof window !== "undefined"
        ? `${window.location.origin}/profile/${profileId}`
        : `/profile/${profileId}`;

    try {
      await navigator.clipboard.writeText(href);
      showFriendStatus("Profile link copied.");
    } catch {
      window.prompt("Copy this profile link:", href);
    }

    setProfileActionsOpen(false);
  };

  const handleOpenProfileSection = (tab: string) => {
    setActiveProfileTab(tab);
    setProfileActionsOpen(false);

    window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 80);
  };

return (
  <div
    className="min-h-screen text-white profile-polish-surface profile-mobile-first-polish"
   style={{
     ...profilePageBackgroundStyle,
     backgroundColor: "#07090d",
     minHeight: "100vh",
     height: "auto",
     overflowX: "hidden",
     overflowY: "auto",
     WebkitOverflowScrolling: "touch",
     overscrollBehaviorY: "auto",
     animation: "profileFadeIn 220ms ease-out",
   }}
  >
    <style>{`
      .profile-mobile-first-polish {
        --pp-line: rgba(255,255,255,0.085);
        --pp-line-strong: rgba(255,255,255,0.14);
        --pp-surface: rgba(18,20,25,0.92);
        --pp-surface-soft: rgba(255,255,255,0.045);
        --pp-purple: #a855f7;
      }

      .profile-polish-surface button {
        transition: transform 140ms ease, filter 140ms ease, box-shadow 140ms ease, border-color 140ms ease, background 140ms ease;
      }

      .profile-polish-surface button:not(:disabled):hover {
        transform: translateY(-1px);
        filter: brightness(1.06);
      }

      .profile-polish-surface button:not(:disabled):active {
        transform: scale(0.985);
      }

      .profile-polish-surface a {
        transition: transform 140ms ease, filter 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
      }

      .profile-mobile-first-polish small {
        display: block;
        color: #7c8597;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.35;
        margin-top: 2px;
      }

      .profile-mobile-first-polish strong {
        font-weight: 900;
      }

      .profile-desktop-action-menu-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
      }

      @media (min-width: 721px) {
        .profile-hero-shell {
          overflow: visible !important;
        }

        .profile-desktop-action-menu {
          max-height: 340px !important;
          overflow-y: auto !important;
          overscroll-behavior: contain !important;
        }
      }

      .profile-desktop-action-menu {
        position: absolute;
        right: 0;
        top: calc(100% + 10px);
        z-index: 5000;
      }

      .profile-desktop-action-menu::-webkit-scrollbar {
        width: 8px;
      }

      .profile-desktop-action-menu::-webkit-scrollbar-track {
        background: rgba(255,255,255,0.035);
        border-radius: 999px;
      }

      .profile-desktop-action-menu::-webkit-scrollbar-thumb {
        background: rgba(168,85,247,0.45);
        border-radius: 999px;
      }

      .profile-mobile-action-overlay {
        touch-action: auto;
      }

      .profile-mobile-action-overlay > div {
        touch-action: pan-y;
      }

      @media (min-width: 721px) {
        .profile-mobile-action-overlay {
          display: none !important;
        }
      }

      @media (max-width: 720px) {
        .profile-desktop-action-menu-wrap {
          display: contents;
        }

        .profile-desktop-action-menu {
          display: none !important;
        }
      }


      .profile-composer-smooth {
        overflow: hidden;
      }

      .profile-composer-textarea {
        font-family: inherit;
      }

      .profile-feed-stack {
        gap: 14px !important;
      }

      .profile-feed-card {
        overflow: hidden;
      }

      .profile-feed-card p {
        font-size: 15px;
        letter-spacing: -0.01em;
      }

      .profile-post-image {
        transition: transform 220ms ease, filter 220ms ease;
      }

      .profile-feed-card:hover .profile-post-image {
        filter: brightness(1.03);
      }

      .profile-shared-reel-card {
        transition: border-color 160ms ease, background 160ms ease;
      }

      @media (min-width: 721px) and (max-width: 1180px) {
        .profile-page-shell {
          padding-left: 16px !important;
          padding-right: 16px !important;
        }

        .profile-layout-grid {
          grid-template-columns: minmax(0, 1fr) !important;
        }

        .profile-center-column {
          max-width: 920px !important;
          margin: 0 auto !important;
          width: 100% !important;
        }

        .profile-feed-stack {
          gap: 16px !important;
        }
      }

      @media (max-width: 980px) {
        .profile-hero-shell {
          border-radius: 20px !important;
        }

        .profile-hero-content {
          align-items: flex-start !important;
          justify-content: flex-start !important;
          text-align: left !important;
          gap: 14px !important;
          padding-left: 18px !important;
          padding-right: 18px !important;
        }

        .profile-hero-info {
          min-width: 0 !important;
          width: 100% !important;
          padding-bottom: 0 !important;
        }

        .profile-hero-topline {
          justify-content: flex-start !important;
          gap: 14px !important;
        }

        .profile-hero-actions {
          width: 100% !important;
          justify-content: flex-start !important;
          gap: 10px !important;
        }

        .profile-hero-actions a,
        .profile-hero-actions button {
          min-height: 42px !important;
          border-radius: 13px !important;
        }
      }

      @media (max-width: 720px) {
        .profile-page-shell {
          max-width: none !important;
          padding-top: 0 !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          padding-bottom: 132px !important;
        }

        .profile-layout-grid {
          gap: 0 !important;
        }

        .profile-center-column,
        .profile-stream-stack {
          max-width: none !important;
          width: 100% !important;
        }

        .profile-stream-stack {
          gap: 0 !important;
        }

        .profile-polish-surface select[aria-label="Choose profile section"] {
          display: none !important;
        }

        .profile-polish-surface .profile-tabs-desktop {
          display: flex !important;
        }

        .profile-hero-shell {
          border-radius: 0 !important;
          border-left: 0 !important;
          border-right: 0 !important;
          background: linear-gradient(180deg, rgba(19,22,29,0.96), rgba(11,13,18,0.98)) !important;
          box-shadow: none !important;
        }

        .profile-cover-zone {
          height: 174px !important;
          overflow: hidden !important;
        }

        .profile-hero-content {
          display: block !important;
          margin-top: -54px !important;
          padding: 0 18px 18px !important;
          text-align: left !important;
        }

        .profile-avatar-wrap {
          width: 112px !important;
          height: 112px !important;
          padding: 4px !important;
          margin: 0 0 14px 0 !important;
          box-shadow: 0 0 22px rgba(168,85,247,0.28) !important;
        }

        .profile-avatar-wrap img,
        .profile-avatar-wrap > div {
          border-width: 3px !important;
        }

        .profile-hero-info {
          width: 100% !important;
          min-width: 0 !important;
          padding: 0 !important;
        }

        .profile-hero-topline {
          width: 100% !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: flex-start !important;
          gap: 12px !important;
          margin-bottom: 0 !important;
        }

        .profile-hero-topline h1 {
          font-size: clamp(30px, 8.2vw, 42px) !important;
          line-height: 1.05 !important;
          letter-spacing: -0.045em !important;
          max-width: 100% !important;
        }

        .profile-hero-topline p {
          font-size: 14px !important;
          line-height: 1.35 !important;
        }

        .profile-hero-actions {
          width: 100% !important;
          max-width: none !important;
          margin-top: 4px !important;
          gap: 10px !important;
        }

        .profile-public-actions {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }

        .profile-owner-actions {
          display: flex !important;
          justify-content: flex-start !important;
          align-items: center !important;
        }

        .profile-public-actions button,
        .profile-public-actions a {
          width: 100% !important;
          min-height: 44px !important;
          justify-content: center !important;
          box-shadow: none !important;
          border-radius: 12px !important;
        }

        .profile-owner-actions button[aria-label="More profile actions"] {
          width: 46px !important;
          min-width: 46px !important;
          height: 44px !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          border-radius: 12px !important;
          box-shadow: none !important;
        }

        .profile-hero-info > p {
          width: 100% !important;
          max-width: none !important;
          margin-top: 14px !important;
          font-size: 16px !important;
          line-height: 1.58 !important;
          color: #e6e8ee !important;
        }

        .profile-meta-row {
          margin-top: 14px !important;
          display: grid !important;
          gap: 10px !important;
          font-size: 14px !important;
          line-height: 1.35 !important;
        }

        .profile-meta-row a {
          overflow-wrap: anywhere !important;
        }


        .profile-feed-section-card {
          padding-left: 0 !important;
          padding-right: 0 !important;
        }

        .profile-feed-section-card > div:first-child {
          padding-left: 14px !important;
          padding-right: 14px !important;
          margin-bottom: 12px !important;
        }

        .profile-composer-smooth {
          padding: 16px 14px !important;
        }

        .profile-composer-textarea {
          min-height: 108px !important;
          border-radius: 14px !important;
          background: #0f1116 !important;
          border-color: rgba(255,255,255,0.08) !important;
        }

        .profile-composer-media-box {
          border-radius: 14px !important;
          background: rgba(255,255,255,0.025) !important;
        }

        .profile-feed-stack {
          gap: 8px !important;
        }

        .profile-feed-card {
          margin-left: 0 !important;
          margin-right: 0 !important;
          border-top: 1px solid rgba(255,255,255,0.07) !important;
          border-bottom: 1px solid rgba(255,255,255,0.045) !important;
        }

        .profile-post-image {
          border-radius: 0 !important;
          margin-left: -14px !important;
          margin-right: -14px !important;
          width: calc(100% + 28px) !important;
          max-width: none !important;
          max-height: none !important;
        }

        .profile-shared-reel-card {
          border-radius: 0 !important;
          margin-left: -14px !important;
          margin-right: -14px !important;
          border-left: 0 !important;
          border-right: 0 !important;
        }

        .profile-stats-bar {
          margin: 0 !important;
          border-radius: 0 !important;
          border-left: 0 !important;
          border-right: 0 !important;
          background: #111318 !important;
          grid-template-columns: repeat(4, 1fr) !important;
          gap: 0 !important;
          padding: 14px 6px !important;
          box-shadow: none !important;
        }

        .profile-stats-bar > div:nth-child(even) {
          display: none !important;
        }

        .profile-stories-row {
          margin: 0 !important;
          border-radius: 0 !important;
          border-left: 0 !important;
          border-right: 0 !important;
          background: #111318 !important;
          padding: 14px 14px 18px !important;
          gap: 14px !important;
          border-top: 1px solid rgba(255,255,255,0.07) !important;
          border-bottom: 1px solid rgba(255,255,255,0.07) !important;
        }

        .profile-story-circle {
          border-radius: 16px !important;
          box-shadow: none !important;
        }

        .profile-tabs-shell {
          position: sticky !important;
          top: 64px !important;
          z-index: 20 !important;
          background: rgba(15,17,22,0.98) !important;
          backdrop-filter: blur(14px) !important;
          -webkit-backdrop-filter: blur(14px) !important;
          border-top: 1px solid rgba(255,255,255,0.065) !important;
          border-bottom: 1px solid rgba(255,255,255,0.065) !important;
          padding: 0 !important;
        }

        .profile-tabs-desktop {
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          padding: 8px 14px !important;
          gap: 20px !important;
          overflow-x: auto !important;
          scrollbar-width: none !important;
        }

        .profile-tabs-desktop::-webkit-scrollbar {
          display: none !important;
        }

        .profile-tabs-desktop button {
          min-width: auto !important;
          border-radius: 10px !important;
          border-width: 0 0 2px 0 !important;
          border-style: solid !important;
          border-color: transparent !important;
          background: transparent !important;
          box-shadow: none !important;
          color: #9ca3af !important;
          padding: 11px 0 !important;
          font-size: 15px !important;
        }

        .profile-tabs-desktop button[aria-pressed="true"] {
          color: #ffffff !important;
          border-bottom-color: #a855f7 !important;
          background: rgba(168,85,247,0.08) !important;
          padding-left: 10px !important;
          padding-right: 10px !important;
        }

        .profile-content-card {
          margin: 0 !important;
          border-radius: 0 !important;
          border-left: 0 !important;
          border-right: 0 !important;
          border-top: 1px solid rgba(255,255,255,0.075) !important;
          border-bottom: 1px solid rgba(255,255,255,0.045) !important;
          box-shadow: none !important;
          background: #111318 !important;
          padding: 16px 14px !important;
        }

        .profile-composer-card {
          background: #15171b !important;
        }

        .profile-feed-card {
          margin-left: -14px !important;
          margin-right: -14px !important;
          border-radius: 0 !important;
          border-left: 0 !important;
          border-right: 0 !important;
          box-shadow: none !important;
          padding: 14px !important;
          background: #17191d !important;
        }

        .profile-feed-card img {
          border-radius: 0 !important;
          margin-left: -14px !important;
          width: calc(100% + 28px) !important;
          max-width: none !important;
        }
      }

      @media (max-width: 520px) {
        .profile-cover-zone {
          height: 162px !important;
        }

        .profile-hero-content {
          margin-top: -50px !important;
          padding-left: 16px !important;
          padding-right: 16px !important;
        }

        .profile-avatar-wrap {
          width: 104px !important;
          height: 104px !important;
        }

        .profile-public-actions {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }

        .profile-hero-actions a,
        .profile-hero-actions button {
          min-height: 44px !important;
          font-size: 13px !important;
        }

        .profile-stats-bar {
          padding-top: 15px !important;
          padding-bottom: 15px !important;
        }

        .profile-story-circle,
        .profile-stories-row > div > div {
          width: 66px !important;
          height: 66px !important;
        }
      }

      @media (max-width: 720px) {
        .profile-mobile-first-polish .profile-hero-content {
          flex-wrap: nowrap !important;
        }

        .profile-mobile-first-polish .profile-hero-info {
          display: block !important;
        }

        .profile-mobile-first-polish .profile-desktop-action-menu-wrap {
          display: inline-flex !important;
          position: relative !important;
        }

        .profile-mobile-first-polish .profile-owner-actions .profile-desktop-action-menu-wrap {
          width: auto !important;
        }

        .profile-mobile-first-polish .profile-desktop-action-menu {
          display: none !important;
        }

        .profile-mobile-first-polish .profile-tabs-shell {
          margin-bottom: 0 !important;
        }
      }


      .profile-mobile-header-real {
        display: none;
      }

      @media (max-width: 720px) {
        .profile-hero-shell {
          overflow: hidden !important;
        }

        .profile-cover-zone {
          height: 170px !important;
        }

        .profile-hero-content {
          display: none !important;
        }

        .profile-mobile-header-real {
          display: block !important;
          position: relative !important;
          margin-top: -54px !important;
          padding: 0 18px 22px !important;
          background: linear-gradient(180deg, rgba(7,9,14,0) 0%, rgba(12,14,20,0.92) 22%, rgba(12,14,20,0.98) 100%) !important;
          text-align: left !important;
        }

        .profile-mobile-avatar-shell-real {
          position: relative !important;
          width: 112px !important;
          height: 112px !important;
          border-radius: 50% !important;
          padding: 4px !important;
          background: linear-gradient(135deg, rgba(168,85,247,0.96), rgba(59,130,246,0.86)) !important;
          box-shadow: 0 0 20px rgba(168,85,247,0.22) !important;
          margin: 0 0 14px !important;
        }

        .profile-mobile-avatar-image-real,
        .profile-mobile-avatar-fallback-real {
          width: 100% !important;
          height: 100% !important;
          border-radius: 50% !important;
          object-fit: cover !important;
          border: 3px solid #07090d !important;
        }

        .profile-mobile-avatar-fallback-real {
          display: grid !important;
          place-items: center !important;
          background: #374151 !important;
          color: #ffffff !important;
          font-size: 34px !important;
          font-weight: 900 !important;
        }

        .profile-mobile-online-dot-real {
          position: absolute !important;
          right: 10px !important;
          bottom: 10px !important;
          width: 18px !important;
          height: 18px !important;
          border-radius: 50% !important;
          background: #22c55e !important;
          border: 3px solid #07090d !important;
        }

        .profile-mobile-camera-real {
          position: absolute !important;
          right: -2px !important;
          bottom: 2px !important;
          width: 34px !important;
          height: 34px !important;
          display: grid !important;
          place-items: center !important;
          border-radius: 12px !important;
          border: 1px solid rgba(255,255,255,0.15) !important;
          background: rgba(13,15,22,0.82) !important;
          color: #ffffff !important;
          font-size: 15px !important;
        }

        .profile-mobile-identity-real {
          width: 100% !important;
        }

        .profile-mobile-identity-real h1 {
          margin: 0 !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          color: #ffffff !important;
          font-size: clamp(30px, 8.4vw, 40px) !important;
          line-height: 1.05 !important;
          letter-spacing: -0.045em !important;
          white-space: normal !important;
          overflow-wrap: anywhere !important;
        }

        .profile-mobile-identity-real h1 span {
          width: 28px !important;
          height: 28px !important;
          flex: 0 0 auto !important;
          display: grid !important;
          place-items: center !important;
          border-radius: 999px !important;
          background: linear-gradient(135deg, #7c3aed, #a855f7) !important;
          color: #ffffff !important;
          font-size: 17px !important;
          line-height: 1 !important;
        }

        .profile-mobile-identity-real p {
          margin: 9px 0 0 !important;
          color: #aeb3c2 !important;
          font-size: 15px !important;
          line-height: 1.35 !important;
          overflow-wrap: anywhere !important;
        }

        .profile-mobile-identity-real p span {
          margin: 0 9px !important;
          color: #6b7280 !important;
        }

        .profile-mobile-actions-real {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 10px !important;
          margin-top: 16px !important;
          width: 100% !important;
        }

        .profile-mobile-actions-real:has(.profile-mobile-owner-more-real) {
          display: flex !important;
          justify-content: flex-start !important;
        }

        .profile-mobile-primary-real,
        .profile-mobile-secondary-real,
        .profile-mobile-owner-more-real {
          min-height: 46px !important;
          border-radius: 13px !important;
          font-size: 15px !important;
          font-weight: 850 !important;
          cursor: pointer !important;
        }

        .profile-mobile-primary-real {
          border: 1px solid rgba(255,255,255,0.10) !important;
          background: linear-gradient(135deg, #9333ea, #7c3aed) !important;
          color: #ffffff !important;
        }

        .profile-mobile-secondary-real {
          border: 1px solid rgba(255,255,255,0.12) !important;
          background: rgba(255,255,255,0.055) !important;
          color: #ffffff !important;
        }

        .profile-mobile-owner-more-real {
          width: 48px !important;
          border: 1px solid rgba(255,255,255,0.12) !important;
          background: rgba(255,255,255,0.055) !important;
          color: #ffffff !important;
          letter-spacing: 0.12em !important;
        }

        .profile-mobile-status-real {
          margin-top: 12px !important;
          border: 1px solid rgba(168,85,247,0.22) !important;
          background: rgba(168,85,247,0.12) !important;
          color: #ede9fe !important;
          border-radius: 12px !important;
          padding: 10px 12px !important;
          font-size: 13px !important;
          font-weight: 800 !important;
        }

        .profile-mobile-bio-real {
          margin: 17px 0 0 !important;
          color: #e5e7eb !important;
          font-size: 16px !important;
          line-height: 1.58 !important;
          letter-spacing: -0.01em !important;
          width: 100% !important;
        }

        .profile-mobile-meta-real {
          display: grid !important;
          gap: 10px !important;
          margin-top: 16px !important;
          color: #aeb3c2 !important;
          font-size: 14px !important;
          line-height: 1.35 !important;
        }

        .profile-mobile-meta-real a {
          color: #c084fc !important;
          text-decoration: none !important;
          font-weight: 800 !important;
          overflow-wrap: anywhere !important;
        }

        .profile-stats-bar {
          margin-top: 0 !important;
        }

        .profile-stories-row {
          padding-bottom: 20px !important;
        }

        .profile-tabs-shell {
          top: 0 !important;
        }
      }

      @media (max-width: 420px) {
        .profile-mobile-header-real {
          padding-left: 16px !important;
          padding-right: 16px !important;
        }

        .profile-mobile-avatar-shell-real {
          width: 104px !important;
          height: 104px !important;
        }

        .profile-mobile-identity-real h1 {
          font-size: clamp(28px, 8vw, 36px) !important;
        }
      }


      @media (max-width: 720px) {
        .profile-mobile-header-real {
          display: none !important;
        }

        .profile-mobile-first-polish .profile-hero-shell {
          overflow: hidden !important;
          border-radius: 0 !important;
          border-left: 0 !important;
          border-right: 0 !important;
        }

        .profile-mobile-first-polish .profile-cover-zone {
          height: 136px !important;
        }

        .profile-mobile-first-polish .profile-hero-content {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: flex-start !important;
          gap: 0 !important;
          margin-top: -50px !important;
          padding: 0 18px 18px !important;
          text-align: center !important;
          background: linear-gradient(180deg, rgba(7,9,14,0) 0%, rgba(12,14,20,0.92) 22%, rgba(12,14,20,0.98) 100%) !important;
        }

        .profile-mobile-first-polish .profile-avatar-wrap {
          width: 102px !important;
          height: 102px !important;
          min-width: 102px !important;
          padding: 4px !important;
          margin: 0 auto 12px !important;
          box-shadow: 0 0 16px rgba(168,85,247,0.18) !important;
        }

        .profile-mobile-first-polish .profile-avatar-wrap img,
        .profile-mobile-first-polish .profile-avatar-wrap > div {
          border-width: 3px !important;
        }

        .profile-mobile-first-polish .profile-hero-info {
          width: 100% !important;
          min-width: 0 !important;
          display: block !important;
          padding: 0 !important;
        }

        .profile-mobile-first-polish .profile-hero-topline {
          width: 100% !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 10px !important;
          margin: 0 !important;
          text-align: center !important;
        }

        .profile-mobile-first-polish .profile-hero-topline h1 {
          justify-content: center !important;
          text-align: center !important;
          font-size: clamp(28px, 8.2vw, 38px) !important;
          line-height: 1.06 !important;
          letter-spacing: -0.045em !important;
          max-width: 100% !important;
          white-space: normal !important;
          overflow-wrap: anywhere !important;
        }

        .profile-mobile-first-polish .profile-hero-topline p {
          justify-content: center !important;
          text-align: center !important;
          font-size: 14px !important;
          line-height: 1.35 !important;
          max-width: 100% !important;
          overflow-wrap: anywhere !important;
        }

        .profile-mobile-first-polish .profile-hero-actions {
          width: 100% !important;
          max-width: 460px !important;
          margin: 14px auto 0 !important;
          gap: 10px !important;
        }

        .profile-mobile-first-polish .profile-public-actions {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }

        .profile-mobile-first-polish .profile-owner-actions {
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
        }

        .profile-mobile-first-polish .profile-public-actions button,
        .profile-mobile-first-polish .profile-public-actions a {
          width: 100% !important;
          min-height: 44px !important;
          justify-content: center !important;
          border-radius: 12px !important;
          box-shadow: none !important;
        }

        .profile-mobile-first-polish .profile-owner-actions button[aria-label="More profile actions"] {
          width: 48px !important;
          min-width: 48px !important;
          height: 44px !important;
          border-radius: 12px !important;
          padding: 0 !important;
          box-shadow: none !important;
        }

        .profile-mobile-first-polish .profile-hero-info > p {
          width: 100% !important;
          max-width: 560px !important;
          margin: 14px auto 0 !important;
          text-align: center !important;
          font-size: 15px !important;
          line-height: 1.52 !important;
          color: #e5e7eb !important;
        }

        .profile-mobile-first-polish .profile-meta-row {
          width: 100% !important;
          max-width: 560px !important;
          margin: 14px auto 0 !important;
          display: grid !important;
          justify-items: center !important;
          gap: 9px !important;
          text-align: center !important;
          font-size: 13px !important;
          line-height: 1.35 !important;
        }

        .profile-mobile-first-polish .profile-meta-row a {
          overflow-wrap: anywhere !important;
        }

        .profile-mobile-first-polish .profile-stats-bar {
          margin: 0 !important;
          border-radius: 0 !important;
          border-left: 0 !important;
          border-right: 0 !important;
          background: #111318 !important;
          grid-template-columns: repeat(4, 1fr) !important;
          gap: 0 !important;
          padding: 13px 4px !important;
          box-shadow: none !important;
        }

        .profile-mobile-first-polish .profile-stories-row {
          margin: 0 !important;
          border-radius: 0 !important;
          border-left: 0 !important;
          border-right: 0 !important;
          background: #111318 !important;
          padding: 12px 14px 14px !important;
          gap: 12px !important;
          border-top: 1px solid rgba(255,255,255,0.07) !important;
          border-bottom: 1px solid rgba(255,255,255,0.07) !important;
        }

        .profile-mobile-first-polish .profile-story-circle,
        .profile-mobile-first-polish .profile-stories-row > div > div:first-child {
          width: 58px !important;
          height: 58px !important;
          border-radius: 15px !important;
          box-shadow: none !important;
        }

        .profile-mobile-first-polish .profile-stories-row span,
        .profile-mobile-first-polish .profile-stories-row p {
          font-size: 11px !important;
          line-height: 1.2 !important;
        }

        .profile-mobile-first-polish .profile-tabs-shell {
          top: 0 !important;
          margin-bottom: 0 !important;
        }

        .profile-mobile-first-polish .profile-tabs-desktop {
          padding: 7px 14px !important;
          gap: 18px !important;
        }

        .profile-mobile-first-polish .profile-tabs-desktop button {
          font-size: 14px !important;
          padding-top: 10px !important;
          padding-bottom: 10px !important;
        }

        .profile-page-shell {
          padding-bottom: 150px !important;
        }
      }

      @media (max-width: 420px) {
        .profile-mobile-first-polish .profile-cover-zone {
          height: 128px !important;
        }

        .profile-mobile-first-polish .profile-hero-content {
          margin-top: -46px !important;
          padding-left: 16px !important;
          padding-right: 16px !important;
        }

        .profile-mobile-first-polish .profile-avatar-wrap {
          width: 94px !important;
          height: 94px !important;
          min-width: 94px !important;
        }

        .profile-mobile-first-polish .profile-hero-topline h1 {
          font-size: clamp(27px, 8vw, 34px) !important;
        }

        .profile-mobile-first-polish .profile-public-actions {
          max-width: 100% !important;
        }

        .profile-mobile-first-polish .profile-story-circle,
        .profile-mobile-first-polish .profile-stories-row > div > div:first-child {
          width: 54px !important;
          height: 54px !important;
        }
      }


      @media (max-width: 720px) {
        .profile-mobile-first-polish .profile-hero-content {
          align-items: flex-start !important;
          text-align: left !important;
        }

        .profile-mobile-first-polish .profile-avatar-wrap {
          margin-left: 0 !important;
          margin-right: 0 !important;
        }

        .profile-mobile-first-polish .profile-hero-info {
          text-align: left !important;
        }

        .profile-mobile-first-polish .profile-hero-topline {
          align-items: flex-start !important;
          text-align: left !important;
        }

        .profile-mobile-first-polish .profile-hero-topline h1 {
          justify-content: flex-start !important;
          text-align: left !important;
        }

        .profile-mobile-first-polish .profile-hero-topline p {
          justify-content: flex-start !important;
          text-align: left !important;
        }

        .profile-mobile-first-polish .profile-owner-actions {
          display: none !important;
        }

        .profile-mobile-first-polish .profile-public-actions {
          max-width: 440px !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
        }

        .profile-mobile-first-polish .profile-hero-info > p {
          text-align: left !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
          max-width: none !important;
        }

        .profile-mobile-meta-action-row {
          width: 100% !important;
          max-width: none !important;
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) 52px !important;
          align-items: end !important;
          gap: 14px !important;
          margin-top: 14px !important;
        }

        .profile-mobile-first-polish .profile-meta-row {
          margin: 0 !important;
          justify-items: start !important;
          text-align: left !important;
          max-width: none !important;
          width: 100% !important;
          gap: 9px !important;
        }

        .profile-mobile-first-polish .profile-meta-row span,
        .profile-mobile-first-polish .profile-meta-row a {
          text-align: left !important;
          width: auto !important;
        }

        .profile-mobile-inline-more {
          width: 50px !important;
          height: 46px !important;
          border-radius: 13px !important;
          border: 1px solid rgba(255,255,255,0.12) !important;
          background: rgba(255,255,255,0.055) !important;
          color: #ffffff !important;
          font-size: 16px !important;
          font-weight: 900 !important;
          letter-spacing: 0.12em !important;
          cursor: pointer !important;
          align-self: end !important;
        }

        .profile-mobile-first-polish .profile-mobile-meta-action-row + * {
          margin-top: 0 !important;
        }
      }

      @media (max-width: 420px) {
        .profile-mobile-meta-action-row {
          grid-template-columns: minmax(0, 1fr) 48px !important;
          gap: 10px !important;
        }

        .profile-mobile-inline-more {
          width: 48px !important;
          height: 44px !important;
        }
      }


      @media (max-width: 720px) {
        .profile-mobile-first-polish .profile-stream-stack {
          gap: 0 !important;
          background: #111318 !important;
        }

        .profile-mobile-first-polish .profile-stream-stack > :not([hidden]) ~ :not([hidden]) {
          --tw-space-y-reverse: 0 !important;
          margin-top: 0 !important;
          margin-bottom: 0 !important;
        }

        .profile-mobile-first-polish .profile-tabs-shell {
          margin-bottom: 0 !important;
          border-bottom: 1px solid rgba(255,255,255,0.07) !important;
        }

        .profile-mobile-first-polish .profile-content-card,
        .profile-mobile-first-polish .profile-composer-card,
        .profile-mobile-first-polish .profile-feed-section-card {
          margin-top: 0 !important;
        }

        .profile-mobile-first-polish .profile-composer-card,
        .profile-mobile-first-polish .profile-feed-section-card {
          border-top: 0 !important;
        }
      }


      @media (max-width: 720px) {
        .profile-mobile-first-polish .profile-tabs-shell {
          background: #111318 !important;
          box-shadow: none !important;
          border-top: 1px solid rgba(255,255,255,0.07) !important;
          border-bottom: 1px solid rgba(255,255,255,0.07) !important;
        }

        .profile-mobile-first-polish .profile-tabs-desktop {
          background: #111318 !important;
          box-shadow: none !important;
          padding-bottom: 0 !important;
        }

        .profile-mobile-first-polish .profile-tabs-desktop button {
          background: transparent !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          border: 0 !important;
          border-bottom: 3px solid transparent !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          margin-bottom: 0 !important;
        }

        .profile-mobile-first-polish .profile-tabs-desktop button[aria-selected="true"],
        .profile-mobile-first-polish .profile-tabs-desktop button[data-active="true"] {
          background: transparent !important;
          box-shadow: none !important;
          border-bottom-color: #a855f7 !important;
          color: #ffffff !important;
        }

        .profile-mobile-first-polish .profile-tabs-desktop button:hover {
          background: transparent !important;
          box-shadow: none !important;
        }

        .profile-mobile-first-polish .profile-tabs-shell::after,
        .profile-mobile-first-polish .profile-tabs-desktop::after,
        .profile-mobile-first-polish .profile-tabs-desktop button::after {
          display: none !important;
          content: none !important;
        }

        .profile-mobile-first-polish .profile-content-card,
        .profile-mobile-first-polish .profile-composer-card,
        .profile-mobile-first-polish .profile-feed-section-card {
          border-top-color: rgba(255,255,255,0.07) !important;
        }
      }


      @media (max-width: 720px) {
    .profile-mobile-action-overlay {
    position: fixed !important;
    inset: 0 !important;
    z-index: 2147483647 !important;
    display: flex !important;
    align-items: flex-end !important;
    justify-content: center !important;
    overflow: hidden !important;
    touch-action: auto !important;
  }

  .profile-mobile-action-sheet {
    width: 100% !important;
    max-height: calc(100dvh - 92px) !important;
    overflow: hidden !important;
    display: flex !important;
    flex-direction: column !important;
    overscroll-behavior: contain !important;
    -webkit-overflow-scrolling: touch !important;
    touch-action: pan-y !important;
    transform: translateZ(0) !important;
  }

  .profile-mobile-action-list {
    overflow-y: auto !important;
    overflow-x: hidden !important;
    max-height: min(52dvh, 360px) !important;
    overscroll-behavior: contain !important;
    -webkit-overflow-scrolling: touch !important;
    touch-action: pan-y !important;
    padding-bottom: calc(22px + env(safe-area-inset-bottom)) !important;
  }

  .profile-mobile-action-sheet button {
    min-height: 58px !important;
    touch-action: pan-y !important;
  }
}

    `}</style>

    {/* Mobile Top Bar */}
    <div className="xl:hidden" style={mobileTopBarStyle}>
      <button
        type="button"
        onClick={() => router.push("/dashboard")}
        style={mobileCircleButtonStyle}
        aria-label="Back to dashboard"
      >
        ‹
      </button>

      <div style={{ textAlign: "center", minWidth: 0 }}>
        <div style={{ fontWeight: 950, letterSpacing: "0.04em" }}>
          PARAPOST
        </div>
        <div
          style={{
            color: "#a855f7",
            fontSize: "11px",
            letterSpacing: "0.32em",
            fontWeight: 900,
          }}
        >
          NETWORK
        </div>
      </div>


    </div>

      <div className="profile-page-shell mx-auto w-full px-3 py-4 sm:px-4 lg:px-6" style={{ maxWidth: "1680px", paddingBottom: "96px" }}>
        <div className="profile-layout-grid grid grid-cols-1 gap-4 md:gap-5 xl:grid-cols-[240px_minmax(0,1fr)_340px]">
          <aside className="hidden xl:block" style={sideCardStyle}>
            <h2 style={{ marginTop: 0, fontSize: "24px", letterSpacing: "-0.03em" }}>PARAPOST</h2>
            <p style={{ color: "#a855f7", fontSize: "13px", marginTop: 0, letterSpacing: "0.28em", fontWeight: 800 }}>NETWORK</p>

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
           <Link href="/messages" style={navItemLinkStyle}>
            Parachat
           </Link>

           <div style={navItemStyle}>Settings</div>
           </div>
           </aside>   

          <section className="profile-center-column min-w-0">
            <div className="profile-stream-stack mx-auto w-full space-y-4 md:space-y-5" style={{ maxWidth: "980px" }}>
              <div className="profile-hero-shell" style={profileHeroShellStyle}>
                <div className="profile-cover-zone" style={profileCoverStyle}>
                  <div style={profileCoverOverlayStyle} />
                  {isOwnProfile ? (
                    <button
                      onClick={() => router.push(`/profile/${viewerId}/edit`)}
                      style={editCoverButtonStyle}
                    >
                      ✎ Edit Cover
                    </button>
                  ) : null}
                </div>

                <div className="profile-mobile-header-real">
                  <div className="profile-mobile-avatar-shell-real">
                    {profile?.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt="Profile"
                        className="profile-mobile-avatar-image-real"
                      />
                    ) : (
                      <div className="profile-mobile-avatar-fallback-real">
                        {getInitial(profile?.full_name, profile?.username)}
                      </div>
                    )}

                    {profile?.is_online ? (
                      <span className="profile-mobile-online-dot-real" />
                    ) : null}

                    {isOwnProfile ? (
                      <button
                        type="button"
                        onClick={() => router.push(`/profile/${viewerId}/edit`)}
                        className="profile-mobile-camera-real"
                        aria-label="Edit profile photo"
                      >
                        📷
                      </button>
                    ) : null}
                  </div>

                  <div className="profile-mobile-identity-real">
                    <h1>
                      {profile?.full_name || "Parapost Member"}
                      {profile?.verified ? <span>✓</span> : null}
                    </h1>

                    <p>
                      @{profile?.username || "no-username"}
                      <span>•</span>
                      {isOwnProfile ? "Your profile" : getFriendStatusLabel()}
                    </p>
                  </div>

                  <div className="profile-mobile-actions-real">
                    {isOwnProfile ? (
                      <button
                        type="button"
                        onClick={() => setProfileActionsOpen(true)}
                        className="profile-mobile-owner-more-real"
                        aria-label="Profile options"
                      >
                        •••
                      </button>
                    ) : viewerId ? (
                      <>
                        {friendStatus === "none" ? (
                          <button
                            type="button"
                            onClick={handleSendFriendRequest}
                            disabled={friendLoading}
                            className="profile-mobile-secondary-real"
                          >
                            {friendLoading ? "Saving..." : "Add Friend"}
                          </button>
                        ) : friendStatus === "outgoing_request" ? (
                          <button
                            type="button"
                            onClick={handleCancelFriendRequest}
                            disabled={friendLoading}
                            className="profile-mobile-secondary-real"
                          >
                            {friendLoading ? "Saving..." : "Requested"}
                          </button>
                        ) : friendStatus === "incoming_request" ? (
                          <>
                            <button
                              type="button"
                              onClick={handleAcceptFriendRequest}
                              disabled={friendLoading}
                              className="profile-mobile-primary-real"
                            >
                              {friendLoading ? "Saving..." : "Accept"}
                            </button>

                            <button
                              type="button"
                              onClick={handleDeclineFriendRequest}
                              disabled={friendLoading}
                              className="profile-mobile-secondary-real"
                            >
                              {friendLoading ? "Saving..." : "Decline"}
                            </button>
                          </>
                        ) : friendStatus === "friends" ? (
                          <button
                            type="button"
                            onClick={handleRemoveFriend}
                            disabled={friendLoading}
                            className="profile-mobile-secondary-real"
                          >
                            {friendLoading ? "Saving..." : "Friends"}
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={handleMessageUser}
                          className="profile-mobile-primary-real"
                        >
                          Parachat
                        </button>
                      </>
                    ) : null}
                  </div>

                  {friendStatusMessage ? (
                    <div className="profile-mobile-status-real">
                      {friendStatusMessage}
                    </div>
                  ) : null}

                  {(profile?.bio &&
                    !profile.bio
                      .toLowerCase()
                      .startsWith("no bio added yet")) ||
                  isOwnProfile ? (
                    <p className="profile-mobile-bio-real">
                      {profile?.bio &&
                      !profile.bio
                        .toLowerCase()
                        .startsWith("no bio added yet")
                        ? profile.bio
                        : "No bio added yet. Add a short intro, your interests, and what you share on Parapost."}
                    </p>
                  ) : null}

                  <div className="profile-mobile-meta-real">
                    {profile?.location ? <span>📍 {profile.location}</span> : null}

                    {profile?.website ? (
                      <a
                        href={
                          profile.website.startsWith("http")
                            ? profile.website
                            : `https://${profile.website}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        🔗{" "}
                        {profile.website
                          .replace(/^https?:\/\//, "")
                          .replace(/^www\./, "")}
                      </a>
                    ) : null}

                    <span>📅 Joined Parapost</span>
                  </div>
                </div>

                <div className="profile-hero-content" style={profileHeroContentStyle}>
                  <div className="profile-avatar-wrap" style={profileAvatarWrapStyle}>
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="Profile" style={profileAvatarStyle} />
                    ) : (
                      <div style={profileAvatarFallbackStyle}>
                        {getInitial(profile?.full_name, profile?.username)}
                      </div>
                    )}

                    {profile?.is_online ? <span style={profileOnlineDotStyle} /> : null}

                    {isOwnProfile ? (
                      <button
                        onClick={() => router.push(`/profile/${viewerId}/edit`)}
                        style={avatarCameraButtonStyle}
                        aria-label="Edit profile photo"
                      >
                        📷
                      </button>
                    ) : null}
                  </div>

                  <div className="profile-hero-info" style={profileHeroInfoStyle}>
                    <div className="profile-hero-topline" style={profileHeroTopLineStyle}>
                      <div style={{ minWidth: 0 }}>
                        <h1 style={profileHeroNameStyle}>
                          {profile?.full_name || profile?.username || "Profile"}
                          <span style={verifiedBadgeStyle}>✓</span>
                        </h1>
                        <p style={profileHandleStyle}>
                          @{profile?.username || "no-username"}
                          <span style={profileDotStyle}>•</span>
                          {isOwnProfile ? "Your profile" : getFriendStatusLabel()}
                        </p>
                      </div>

                      <div className={`profile-hero-actions ${isOwnProfile ? "profile-owner-actions" : "profile-public-actions"}`} style={profileHeroActionsStyle}>
                        {!isOwnProfile && viewerId ? (
                          <>
                            {friendStatus === "none" ? (
                              <button
                                type="button"
                                onClick={handleSendFriendRequest}
                                disabled={friendLoading}
                                style={profilePrimaryButtonStyle}
                              >
                                {friendLoading ? "Saving..." : "Add Friend"}
                              </button>
                            ) : friendStatus === "outgoing_request" ? (
                              <button
                                type="button"
                                onClick={handleCancelFriendRequest}
                                disabled={friendLoading}
                                style={profileGlassButtonStyle}
                              >
                                {friendLoading ? "Saving..." : "Requested"}
                              </button>
                            ) : friendStatus === "incoming_request" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={handleAcceptFriendRequest}
                                  disabled={friendLoading}
                                  style={profilePrimaryButtonStyle}
                                >
                                  {friendLoading ? "Saving..." : "Accept"}
                                </button>

                                <button
                                  type="button"
                                  onClick={handleDeclineFriendRequest}
                                  disabled={friendLoading}
                                  style={profileGlassButtonStyle}
                                >
                                  {friendLoading ? "Saving..." : "Decline"}
                                </button>
                              </>
                            ) : friendStatus === "friends" ? (
                              <button
                                type="button"
                                onClick={handleRemoveFriend}
                                disabled={friendLoading}
                                style={profileGlassButtonStyle}
                              >
                                {friendLoading ? "Saving..." : "Friends"}
                              </button>
                            ) : null}

                            <button
                              type="button"
                              onClick={handleMessageUser}
                              style={profilePrimaryButtonStyle}
                            >
                              Parachat
                            </button>
                          </>
                        ) : null}
                        {isOwnProfile ? (

<div
                          className="profile-desktop-action-menu-wrap"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setProfileActionsOpen((value) => !value)
                            }
                            style={profileIconButtonStyle}
                            aria-label="More profile actions"
                          >
                            •••
                          </button>

                          {profileActionsOpen ? (
                            <div
                              className="profile-desktop-action-menu"
                              style={profileDesktopActionMenuStyle}
                            >
                              <div style={profileDesktopActionMenuHeaderStyle}>
                                <p style={profileActionEyebrowStyle}>
                                  Profile options
                                </p>
                                <strong>
                                  {profile?.full_name ||
                                    profile?.username ||
                                    "Profile"}
                                </strong>
                              </div>

                              {isOwnProfile ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setProfileActionsOpen(false);
                                    router.push(`/profile/${viewerId}/edit`);
                                  }}
                                  style={profileDesktopActionItemStyle}
                                >
                                  <span style={profileActionIconStyle}>✎</span>
                                  <span>
                                    <strong>Edit profile</strong>
                                    <small>Edit avatar, bio, and profile details</small>
                                  </span>
                                </button>
                              ) : null}

                              <button
                                type="button"
                                onClick={() => handleOpenProfileSection("Posts")}
                                style={profileDesktopActionItemStyle}
                              >
                                <span style={profileActionIconStyle}>▤</span>
                                <span>
                                  <strong>View posts</strong>
                                  <small>Go to profile feed</small>
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenProfileSection("Photos")}
                                style={profileDesktopActionItemStyle}
                              >
                                <span style={profileActionIconStyle}>▧</span>
                                <span>
                                  <strong>View photos</strong>
                                  <small>Open photo grid</small>
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setProfileActionsOpen(false);
                                  router.push(`/profile/${profileId}/reels`);
                                }}
                                style={profileDesktopActionItemStyle}
                              >
                                <span style={profileActionIconStyle}>▣</span>
                                <span>
                                  <strong>Open reels</strong>
                                  <small>View short videos</small>
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={handleCopyProfileLink}
                                style={profileDesktopActionItemStyle}
                              >
                                <span style={profileActionIconStyle}>↗</span>
                                <span>
                                  <strong>Copy profile link</strong>
                                  <small>Share this profile</small>
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setProfileActionsOpen(false);
                                  router.push("/dashboard");
                                }}
                                style={profileDesktopActionItemStyle}
                              >
                                <span style={profileActionIconStyle}>⌂</span>
                                <span>
                                  <strong>Back to feed</strong>
                                  <small>Return to homepage feed</small>
                                </span>
                              </button>
                            </div>
                          ) : null}
                        </div>
                        ) : null}
                      </div>
                    </div>

                    {friendStatusMessage ? <div style={statusToastStyle}>{friendStatusMessage}</div> : null}

                    {(profile?.bio &&
                      !profile.bio
                        .toLowerCase()
                        .startsWith("no bio added yet")) ||
                    isOwnProfile ? (
                      <p style={profileBioStyle}>
                        {profile?.bio &&
                        !profile.bio
                          .toLowerCase()
                          .startsWith("no bio added yet")
                          ? profile.bio
                          : "No bio added yet. Add a short intro, your interests, and what you share on Parapost."}
                      </p>
                    ) : null}

                    <div className="profile-mobile-meta-action-row">
                      <div className="profile-meta-row" style={profileMetaRowStyle}>
                        {profile?.location ? <span>📍 {profile.location}</span> : null}

                        {profile?.website ? (
                          <a
                            href={
                              profile.website.startsWith("http")
                                ? profile.website
                                : `https://${profile.website}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ textDecoration: "none", color: "#c084fc", fontWeight: 600 }}
                          >
                            🔗{" "}
                            {profile.website
                              .replace(/^https?:\/\//, "")
                              .replace(/^www\./, "")}
                          </a>
                        ) : null}

                        <span>📅 Joined Parapost</span>
                      </div>

                      {isOwnProfile ? (
                        <button
                          type="button"
                          onClick={() => setProfileActionsOpen(true)}
                          className="profile-mobile-inline-more"
                          aria-label="Profile options"
                        >
                          •••
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="profile-stats-bar" style={profileStatsBarStyle}>
                  <div style={profileStatItemStyle}>
                    <strong style={profileStatNumberStyle}>{followersCount}</strong>
                    <span style={profileStatLabelStyle}>Followers</span>
                  </div>
                  <div style={profileStatDividerStyle} />
                  <div style={profileStatItemStyle}>
                    <strong style={profileStatNumberStyle}>{followingCount}</strong>
                    <span style={profileStatLabelStyle}>Following</span>
                  </div>
                  <div style={profileStatDividerStyle} />
                  <div style={profileStatItemStyle}>
                    <strong style={profileStatNumberStyle}>{posts.length}</strong>
                    <span style={profileStatLabelStyle}>Posts</span>
                  </div>
                  <div style={profileStatDividerStyle} />
                  <div style={profileStatItemStyle}>
                    <strong style={profileStatNumberStyle}>{reels.length}</strong>
                    <span style={profileStatLabelStyle}>Reels</span>
                  </div>
                </div>

                <div className="profile-stories-row" style={profileStoriesRowStyle}>
                  {[
                    { label: "New", icon: "+" },
                    { label: "Photos", icon: "▧" },
                    { label: "Reels", icon: "▣" },
                    { label: "Events", icon: "◇" },
                    { label: "Interests", icon: "✦" },
                  ].map((story) => (
                    <div key={story.label} style={profileStoryItemStyle}>
                      <div className="profile-story-circle" style={profileStoryCircleStyle}>{story.icon}</div>
                      <span style={profileStoryLabelStyle}>{story.label}</span>
                    </div>
                  ))}
                </div>

                <div className="profile-tabs-shell" style={profileTabsShellStyle}>
                  <div className="profile-tabs-desktop" style={profileTabsStyle}>
                    {["Posts", "About", "Reels", "Photos", "Events"].map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() =>
                          setActiveProfileTab((prev) => (prev === tab ? "Posts" : tab))
                        }
                        style={activeProfileTab === tab ? profileActiveTabStyle : profileTabStyle}
                        aria-pressed={activeProfileTab === tab}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                <select
                  value={activeProfileTab}
                  onChange={(event) =>
                    setActiveProfileTab((prev) =>
                      prev === event.target.value ? "Posts" : event.target.value
                    )
                  }
                  style={profileMobileTabSelectStyle}
                  aria-label="Choose profile section"
                >
                  {["Posts", "About", "Reels", "Photos", "Events"].map((tab) => (
                    <option key={tab} value={tab}>
                      {tab}
                    </option>
                  ))}
                </select>  
                </div>

                {!loading && !errorMessage && profile && !isOwnProfile ? (
                  <div style={{ padding: "0 14px 14px" }}>
                    <MutualFriendsPreviewCard currentUserId={viewerId} profileUserId={profileId} />
                  </div>
                ) : null}
              </div>


              {activeProfileTab === "About" && (
                <div className="profile-content-card" style={mainCardStyle}>
                  <ProfileAboutSection
                    profile={profile}
                    isOwnProfile={isOwnProfile}
                    onSave={handleSaveProfileAbout}
                  />
                </div>
              )}

              {activeProfileTab === "Reels" ? (
                <div className="profile-content-card" style={mainCardStyle}>
                  <div style={aboutHeaderStyle}>
                    <div>
                      <h3 style={aboutTitleStyle}>Profile Reels</h3>
                      <p style={aboutSubtitleStyle}>
                        Short videos shared by this profile.
                      </p>
                    </div>
                    <Link href={`/profile/${profileId}/reels`} style={{ ...primaryButtonStyle, textDecoration: "none" }}>
                      Open Reels
                    </Link>
                  </div>

                  {reels.length === 0 ? (
                    <div style={aboutComingSoonStyle}>
                      <strong>No reels yet</strong>
                      <span>When this profile shares reels, they will show here.</span>
                    </div>
                  ) : (
                    <div style={miniReelGridStyle}>
                      {reels.slice(0, 6).map((reel) => (
                        <Link key={reel.id} href={`/profile/${profileId}/reels/view?reelId=${reel.id}`} style={miniReelTileStyle}>
                          {reel.video_url ? (
                            <video src={reel.video_url} muted playsInline preload="metadata" style={miniReelVideoStyle} />
                          ) : (
                            <span>Reel unavailable</span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {activeProfileTab === "Photos" ? (
                <div className="profile-content-card" style={mainCardStyle}>
                  <ProfilePhotosSection
                    profileId={profileId}
                    viewerId={viewerId}
                    profile={profile}
                    posts={posts}
                    isOwnProfile={isOwnProfile}
                  />
                </div>
              ) : null}

              {!["Posts", "About", "Reels", "Photos"].includes(activeProfileTab) ? (
                <div className="profile-content-card" style={mainCardStyle}>
                  <div style={aboutComingSoonStyle}>
                    <strong>{activeProfileTab}</strong>
                    <span>This profile section is set up and ready for the next build step.</span>
                  </div>
                </div>
              ) : null}

              {activeProfileTab === "Posts" && isOwnProfile ? (
                <div id="profile-composer" className="profile-content-card profile-composer-card profile-composer-smooth" style={mainCardStyle}>
                  <div style={profileComposerHeaderStyle}>
                    <div style={profileComposerIconStyle}>＋</div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h3 style={{ margin: 0, color: "#ffffff", fontSize: "20px", letterSpacing: "-0.04em" }}>
                        Create a Post
                      </h3>
                      <p style={{ margin: "5px 0 0", color: "#9ca3af", fontSize: "13px", lineHeight: 1.55 }}>
                        Share an update to your profile and the homepage feed.
                      </p>
                    </div>

                    <span style={profileComposerBadgeStyle}>Profile post</span>
                  </div>

                  <textarea
                    className="profile-composer-textarea"
                    value={profilePostContent}
                    onChange={(event) => setProfilePostContent(event.target.value)}
                    placeholder="Share an update, photo, link, thought, or moment..."
                    rows={4}
                    style={profilePostTextAreaStyle}
                  />

                  <div className="profile-composer-media-box" style={profilePostMediaBoxStyle}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                        marginBottom: profilePostImagePreviewUrl ? "14px" : "0px",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 900, color: "#f9fafb", marginBottom: "4px" }}>
                          Add media
                        </div>
                        <p style={{ margin: 0, fontSize: "13px", color: "#9ca3af", lineHeight: 1.45 }}>
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
                          maxHeight: "360px",
                          objectFit: "cover",
                          borderRadius: "22px",
                          border: "1px solid rgba(255,255,255,0.12)",
                          display: "block",
                          boxShadow: "0 16px 36px rgba(0,0,0,0.30)",
                        }}
                      />
                    ) : null}
                  </div>

                  <div style={profileComposerFooterStyle}>
                    <p style={{ margin: 0, color: "#6b7280", fontSize: "13px", lineHeight: 1.55 }}>
                      This post will appear on this profile and in the homepage feed.
                    </p>

                    <button
                      onClick={handleCreateProfilePost}
                      disabled={profilePostLoading}
                      style={{
                        ...primaryButtonStyle,
                        opacity: profilePostLoading ? 0.7 : 1,
                        cursor: profilePostLoading ? "not-allowed" : "pointer",
                      }}
                    >
                      {profilePostLoading ? "Posting..." : "Publish post"}
                    </button>
                  </div>
                </div>
              ) : null}

              {activeProfileTab === "Posts" ? (
                <div className="profile-content-card profile-feed-section-card" style={mainCardStyle}>
                  <div style={feedHeaderStyle}>
                    <div style={feedTitleBlockStyle}>
                      <span style={feedEyebrowStyle}>Timeline</span>
                      <h3 style={{ margin: 0, color: "#ffffff", fontSize: "22px", letterSpacing: "-0.045em" }}>
                        Profile Feed
                      </h3>
                      <p style={{ margin: "5px 0 0", color: "#9ca3af", fontSize: "13px", lineHeight: 1.55 }}>
                        Posts, updates, and shared reels from this profile.
                      </p>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={feedCountPillStyle}>{posts.length} Posts</span>
                      <span style={feedCountPillStyle}>{sharedReelPosts.length} Reel Shares</span>
                      <Link
                        href="/dashboard"
                        style={{ ...secondaryButtonStyle, textDecoration: "none" }}
                      >
                        Back to feed
                      </Link>
                    </div>
                  </div>

                  {errorMessage ? (
                    <div style={messageBoxStyle}>{errorMessage}</div>
                  ) : !profile ? (
                    <div style={messageBoxStyle}>This profile could not be found.</div>
                  ) : profileFeedItems.length === 0 ? (
                    <div style={feedEmptyStateStyle}>
                      <div style={{ fontSize: "34px", marginBottom: "8px" }}>✦</div>
                      <strong style={{ color: "#ffffff", fontSize: "18px" }}>No posts shared yet</strong>
                      <span style={{ color: "#9ca3af", fontSize: "14px", lineHeight: 1.6 }}>
                        When this profile shares posts or reels, they will appear here.
                      </span>
                    </div>
                  ) : (
                    <div style={feedStackStyle}>
                      {profileFeedItems.map((item) => {
                        if (item.feedKind === "reel_share") {
                          const creatorName =
                            item.originalCreator?.full_name ||
                            item.originalCreator?.username ||
                            "Original creator";
                          const creatorHandle = item.originalCreator?.username || "creator";

                          return (
                            <article
                              key={item.id}
                              style={{ ...postCardStyle, position: "relative" }}
                              onMouseEnter={(event) => {
                                event.currentTarget.style.transform = "translateY(-1px)";
                                event.currentTarget.style.borderColor = "rgba(168,85,247,0.30)";
                                event.currentTarget.style.boxShadow = "0 22px 52px rgba(0,0,0,0.34)";
                              }}
                              onMouseLeave={(event) => {
                                event.currentTarget.style.transform = "translateY(0)";
                                event.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                                event.currentTarget.style.boxShadow = "0 16px 40px rgba(0,0,0,0.26)";
                              }}
                            >
                              <header style={postHeaderStyle}>
                                <div style={postAuthorAvatarStyle}>
                                  {profile.avatar_url ? (
                                    <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                  ) : (
                                    <span style={postAuthorFallbackStyle}>{getInitial(profile.full_name, profile.username)}</span>
                                  )}
                                </div>

                                <div style={postAuthorTextStyle}>
                                  <strong style={postAuthorNameStyle}>
                                    {profile.full_name || profile.username || "Unnamed User"}
                                  </strong>
                                  <span style={postMetaStyle}>
                                    @{profile.username || "no-username"} shared a reel · {formatTimeAgo(item.created_at)}
                                  </span>
                                </div>

                                {isOwnProfile ? (
                                  <button
                                    onClick={() => handleRemoveSharedReel(item.id)}
                                    style={sharedReelRemoveButtonStyle}
                                  >
                                    Remove
                                  </button>
                                ) : null}
                              </header>

                              {item.caption ? (
                                <p style={postContentStyle}>{renderLinkedText(item.caption)}</p>
                              ) : null}

                              <div className="profile-shared-reel-card" style={sharedReelCardStyle}>
                                <Link
                                  href={`/reels?reel=${item.reel_id}`}
                                  style={sharedReelPreviewStyle}
                                  aria-label="View shared reel"
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

                                  <div style={sharedReelPlayOverlayStyle}>
                                    <span style={sharedReelPlayButtonStyle}>▶</span>
                                  </div>
                                </Link>

                                <div style={{ flex: 1, minWidth: "210px" }}>
                                  <div style={sharedReelBadgeStyle}>Parapost Reel</div>

                                  <h4
                                    style={{
                                      margin: "12px 0 7px",
                                      color: "#f9fafb",
                                      fontSize: "20px",
                                      lineHeight: 1.22,
                                      letterSpacing: "-0.035em",
                                    }}
                                  >
                                    {item.reel?.title || "Parapost Reel"}
                                  </h4>

                                  <p style={sharedReelMetaStyle}>
                                    Original by {creatorName} @{creatorHandle}
                                  </p>

                                  {item.reel?.caption ? (
                                    <p style={{ ...sharedReelMetaStyle, marginTop: "8px" }}>
                                      {item.reel.caption}
                                    </p>
                                  ) : null}

                                  <Link href={`/reels?reel=${item.reel_id}`} style={sharedReelActionLinkStyle}>
                                    View Reel
                                  </Link>
                                </div>
                              </div>
                            </article>
                          );
                        }

                        const post = item;
                        const liked = !!userLikes[post.id];
                        const likeCount = likeCounts[post.id] || 0;
                        const isPostOwner = viewerId === post.user_id;
                        const isEditingPost = editingPostId === post.id;

                        return (
                          <article
                            key={post.id}
                            style={{ ...postCardStyle, position: "relative" }}
                            onMouseEnter={(event) => {
                              event.currentTarget.style.transform = "translateY(-1px)";
                              event.currentTarget.style.borderColor = "rgba(168,85,247,0.30)";
                              event.currentTarget.style.boxShadow = "0 22px 52px rgba(0,0,0,0.34)";
                            }}
                            onMouseLeave={(event) => {
                              event.currentTarget.style.transform = "translateY(0)";
                              event.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                              event.currentTarget.style.boxShadow = "0 16px 40px rgba(0,0,0,0.26)";
                            }}
                          >
                            <header style={postHeaderStyle}>
                              <div style={postAuthorAvatarStyle}>
                                {profile.avatar_url ? (
                                  <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                ) : (
                                  <span style={postAuthorFallbackStyle}>{getInitial(profile.full_name, profile.username)}</span>
                                )}
                              </div>

                              <div style={postAuthorTextStyle}>
                                <strong style={postAuthorNameStyle}>
                                  {profile.full_name || profile.username || "Unnamed User"}
                                </strong>
                                <span style={postMetaStyle}>
                                  @{profile.username || "no-username"} · {formatTimeAgo(post.created_at)}
                                </span>
                              </div>

                              {isPostOwner ? (
                                <div style={{ position: "relative", flexShrink: 0 }}>
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
                                        style={{ ...menuItemStyle, color: "#fca5a5", borderBottomColor: "transparent" }}
                                        onClick={() => handleDeletePost(post.id)}
                                      >
                                        Delete post
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </header>

                            {isEditingPost ? (
                              <div style={{ display: "grid", gap: "12px", marginTop: "14px" }}>
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
                                <p style={postContentStyle}>{renderLinkedText(post.content)}</p>
                                <LinkPreviewCard text={post.content} />
                              </>
                            ) : null}

                            {post.image_url ? (
                              <img src={post.image_url} alt="Post" style={postImageStyle} />
                            ) : null}

                            <div style={postActionsRowStyle}>
                              <button
                                onClick={() => handleLikeToggle(post.id)}
                                style={liked ? postLikeButtonActiveStyle : actionButtonStyle}
                                aria-pressed={liked}
                              >
                                <span>{liked ? "♥" : "♡"}</span>
                                <span>{likeCount}</span>
                              </button>

                              <span style={postSubtleMetaPillStyle}>
                                Profile update
                              </span>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </section>

          <aside className="hidden xl:flex" style={rightRailStyle}>
            <div style={rightPanelCardStyle}>
              <div style={rightPanelHeaderStyle}>
                <h3 style={rightPanelTitleStyle}>Profile Strength</h3>
                <span style={miniPurpleLinkStyle}>Great Job</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={profileStrengthRingStyle}>
                  <span style={{ fontSize: "20px", fontWeight: 900 }}>85%</span>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#67e8f9", fontWeight: 900, marginBottom: "4px" }}>
                    Strong Profile
                  </div>
                  <p style={rightPanelTextStyle}>
                    Keep your bio, links, reels, and posts active to help people discover your profile.
                  </p>
                </div>
              </div>

              {isOwnProfile ? (
                <button
                  type="button"
                  onClick={() => router.push(`/profile/${viewerId}/edit`)}
                  style={wideGlassButtonStyle}
                >
                  Improve Profile
                </button>
              ) : null}
            </div>

            <div style={rightPanelCardStyle}>
              <div style={rightPanelHeaderStyle}>
                <h3 style={rightPanelTitleStyle}>Achievements</h3>
                <span style={miniPurpleLinkStyle}>See all</span>
              </div>

              <div style={achievementGridStyle}>
                <div style={achievementItemStyle}>
                  <div style={{ ...achievementIconStyle, borderColor: "rgba(168,85,247,0.60)", color: "#c084fc" }}>👻</div>
                  <strong>Investigator</strong>
                  <span>Level 10</span>
                </div>

                <div style={achievementItemStyle}>
                  <div style={{ ...achievementIconStyle, borderColor: "rgba(34,211,238,0.60)", color: "#67e8f9" }}>📘</div>
                  <strong>Case Solver</strong>
                  <span>Level 7</span>
                </div>

                <div style={achievementItemStyle}>
                  <div style={{ ...achievementIconStyle, borderColor: "rgba(34,197,94,0.60)", color: "#86efac" }}>🛡</div>
                  <strong>Truth Seeker</strong>
                  <span>Level 6</span>
                </div>

                <div style={achievementItemStyle}>
                  <div style={{ ...achievementIconStyle, borderColor: "rgba(248,113,113,0.60)", color: "#fca5a5" }}>🎥</div>
                  <strong>Evidence Finder</strong>
                  <span>Level 5</span>
                </div>
              </div>
            </div>

            <div style={rightPanelCardStyle}>
              <div style={rightPanelHeaderStyle}>
                <h3 style={rightPanelTitleStyle}>My Badges</h3>
                <span style={miniPurpleLinkStyle}>12 total</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                {["👻", "🧭", "🏆", "🔴", "🧿"].map((badge, index) => (
                  <div key={index} style={badgeBubbleStyle}>
                    {badge}
                  </div>
                ))}
                <div style={{ ...badgeBubbleStyle, color: "#d1d5db", background: "rgba(255,255,255,0.06)" }}>
                  +8
                </div>
              </div>
            </div>

            <div style={rightPanelCardStyle}>
              <div style={rightPanelHeaderStyle}>
                <h3 style={rightPanelTitleStyle}>Recent Visitors</h3>
                <span style={miniPurpleLinkStyle}>See all</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {[profile, profile, profile, null, null].map((visitor, index) => (
                  <div key={index} style={visitorAvatarStyle}>
                    {visitor?.avatar_url ? (
                      <img
                        src={visitor.avatar_url}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                      />
                    ) : (
                      <span>{index === 4 ? "👻" : getInitial(profile?.full_name, profile?.username)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={rightPanelCardStyle}>
              <div style={rightPanelHeaderStyle}>
                <h3 style={rightPanelTitleStyle}>Profile Activity</h3>
                <span style={profile?.is_online ? onlineStatusPillStyle : offlineStatusPillStyle}>
                  {profile?.is_online ? "Online" : "Offline"}
                </span>
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                <div style={activityRowStyle}>
                  <span>Posts</span>
                  <strong>{posts.length}</strong>
                </div>
                <div style={activityRowStyle}>
                  <span>Reels</span>
                  <strong>{reels.length}</strong>
                </div>
                <div style={activityRowStyle}>
                  <span>Followers</span>
                  <strong>{followersCount}</strong>
                </div>
                {!isOwnProfile && viewerId ? (
                  <div style={activityRowStyle}>
                    <span>Friend Status</span>
                    <strong>{getFriendStatusLabel()}</strong>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      </div>
      {profileActionsOpen && isOwnProfile ? (
        <div
          className="profile-mobile-action-overlay"
          style={profileActionOverlayStyle}
          onClick={() => setProfileActionsOpen(false)}
        >
          <div
            ref={profileActionSheetRef}
            className="profile-mobile-action-sheet"
            style={profileActionSheetStyle}
            onClick={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
          >
            <div style={profileActionGrabberStyle} />

            <div style={profileActionHeaderStyle}>
              <div>
                <p style={profileActionEyebrowStyle}>Profile options</p>
                <h3 style={profileActionTitleStyle}>
                  {profile?.full_name || profile?.username || "Profile"}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setProfileActionsOpen(false)}
                style={profileActionCloseStyle}
                aria-label="Close profile options"
              >
                ×
              </button>
            </div>

            <div className="profile-mobile-action-list" style={profileActionGridStyle}>
              {isOwnProfile ? (
                <button
                  type="button"
                  onClick={() => {
                    setProfileActionsOpen(false);
                    router.push(`/profile/${viewerId}/edit`);
                  }}
                  style={profileActionItemStyle}
                >
                  <span style={profileActionIconStyle}>✎</span>
                  <span>
                    <strong>Edit profile</strong>
                    <small>Update avatar, bio, and details</small>
                  </span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => handleOpenProfileSection("Posts")}
                style={profileActionItemStyle}
              >
                <span style={profileActionIconStyle}>▤</span>
                <span>
                  <strong>View posts</strong>
                  <small>Go back to the profile feed</small>
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenProfileSection("Photos")}
                style={profileActionItemStyle}
              >
                <span style={profileActionIconStyle}>▧</span>
                <span>
                  <strong>View photos</strong>
                  <small>Open this profile’s photo grid</small>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setProfileActionsOpen(false);
                  router.push(`/profile/${profileId}/reels`);
                }}
                style={profileActionItemStyle}
              >
                <span style={profileActionIconStyle}>▣</span>
                <span>
                  <strong>Open reels</strong>
                  <small>View this profile’s short videos</small>
                </span>
              </button>

              <button
                type="button"
                onClick={handleCopyProfileLink}
                style={profileActionItemStyle}
              >
                <span style={profileActionIconStyle}>↗</span>
                <span>
                  <strong>Copy profile link</strong>
                  <small>Share this profile outside Parapost</small>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setProfileActionsOpen(false);
                  router.push("/dashboard");
                }}
                style={profileActionItemStyle}
              >
                <span style={profileActionIconStyle}>⌂</span>
                <span>
                  <strong>Back to feed</strong>
                  <small>Return to the main Parapost feed</small>
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!profileActionsOpen ? (
        <BottomNav
        currentUserId={viewerId}
        activeItem="profile"
        onCreatePost={handleMobileCreatePostClick}
      />
    ) : null}
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
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.024) 100%)",
  borderRadius: "12px",
  padding: "18px",
  border: "1px solid rgba(255,255,255,0.09)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.22)",
  transition: "border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease",
};

const sideCardStyle: CSSProperties = {
  background: "rgba(255,255,255,0.028)",
  borderRadius: "18px",
  padding: "18px",
  border: "1px solid rgba(255,255,255,0.085)",
  boxShadow: "0 6px 18px rgba(0,0,0,0.16)",
  height: "fit-content",
};

const postCardStyle: CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.052) 0%, rgba(255,255,255,0.026) 100%)",
  border: "1px solid rgba(255,255,255,0.095)",
  borderRadius: "18px",
  padding: "18px",
  boxShadow: "0 12px 30px rgba(0,0,0,0.22)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  transition: "transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, background 160ms ease",
};

const profileComposerHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "13px",
  flexWrap: "wrap",
  marginBottom: "14px",
};

const profileComposerIconStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  borderRadius: "18px",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
  background: "linear-gradient(135deg, #a855f7, #7c3aed)",
  color: "#ffffff",
  fontSize: "25px",
  fontWeight: 950,
  boxShadow: "0 14px 30px rgba(168,85,247,0.28)",
};

const profileComposerBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "32px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "#d1d5db",
  padding: "7px 11px",
  fontSize: "12px",
  fontWeight: 900,
};

const profileComposerFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
  marginTop: "14px",
};

const feedHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "14px",
  flexWrap: "wrap",
  marginBottom: "16px",
};

const feedTitleBlockStyle: CSSProperties = {
  minWidth: 0,
};

const feedEyebrowStyle: CSSProperties = {
  display: "inline-flex",
  width: "fit-content",
  marginBottom: "6px",
  color: "#c084fc",
  fontSize: "11px",
  fontWeight: 950,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
};

const feedCountPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "36px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.055)",
  color: "#d1d5db",
  padding: "8px 12px",
  fontSize: "12px",
  fontWeight: 900,
};

const feedStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "18px",
};

const feedEmptyStateStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  gap: "4px",
  minHeight: "220px",
  borderRadius: "26px",
  border: "1px dashed rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.035)",
  textAlign: "center",
  padding: "28px 18px",
};

const postHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginBottom: "14px",
};

const postAuthorAvatarStyle: CSSProperties = {
  width: "48px",
  height: "48px",
  borderRadius: "50%",
  overflow: "hidden",
  flexShrink: 0,
  border: "2px solid rgba(168,85,247,0.50)",
  background: "#05070a",
  boxShadow: "0 10px 24px rgba(0,0,0,0.26)",
};

const postAuthorFallbackStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg, #7c3aed, #111827)",
  color: "#ffffff",
  fontWeight: 950,
};

const postAuthorTextStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "3px",
};

const postAuthorNameStyle: CSSProperties = {
  color: "#f9fafb",
  fontWeight: 950,
  fontSize: "15px",
  lineHeight: 1.2,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const postMetaStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: "13px",
  fontWeight: 700,
  lineHeight: 1.25,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const postContentStyle: CSSProperties = {
  margin: "0 0 2px",
  whiteSpace: "pre-wrap",
  lineHeight: 1.75,
  color: "#f9fafb",
  fontSize: "15px",
  fontWeight: 500,
};

const postImageStyle: CSSProperties = {
  width: "100%",
  maxHeight: "720px",
  marginTop: "14px",
  borderRadius: "24px",
  objectFit: "cover",
  display: "block",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 16px 36px rgba(0,0,0,0.34)",
};

const postActionsRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  marginTop: "18px",
  paddingTop: "14px",
  borderTop: "1px solid rgba(255,255,255,0.075)",
  flexWrap: "wrap",
};

const postLikeButtonActiveStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  borderRadius: "999px",
  border: "1px solid rgba(236,72,153,0.35)",
  background: "rgba(236,72,153,0.14)",
  color: "#fbcfe8",
  padding: "10px 15px",
  cursor: "pointer",
  minHeight: "42px",
  fontWeight: 900,
  boxShadow: "0 10px 24px rgba(236,72,153,0.14)",
  transition: "transform 160ms ease, filter 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease",
};

const postSubtleMetaPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "34px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.035)",
  color: "#8b949e",
  padding: "7px 11px",
  fontSize: "12px",
  fontWeight: 850,
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
  transition: "transform 160ms ease, filter 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
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
  transition: "transform 160ms ease, filter 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
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
  justifyContent: "center",
  gap: "8px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.055)",
  color: "#f9fafb",
  padding: "10px 15px",
  cursor: "pointer",
  minHeight: "42px",
  fontWeight: 900,
  transition: "transform 160ms ease, filter 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease",
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
  marginTop: "14px",
  display: "flex",
  gap: "16px",
  alignItems: "center",
  flexWrap: "wrap",
  borderRadius: "26px",
  border: "1px solid rgba(168,85,247,0.20)",
  background:
    "linear-gradient(135deg, rgba(168,85,247,0.13), rgba(0,0,0,0.34) 48%, rgba(34,211,238,0.08))",
  padding: "14px",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
};

const sharedReelPreviewStyle: CSSProperties = {
  width: "clamp(148px, 34vw, 220px)",
  aspectRatio: "9 / 16",
  maxHeight: "370px",
  borderRadius: "22px",
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "#000",
  boxShadow: "0 16px 36px rgba(0,0,0,0.38)",
  flexShrink: 0,
  position: "relative",
  display: "block",
};

const profilePostTextAreaStyle: CSSProperties = {
  width: "100%",
  background: "rgba(3,7,18,0.50)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "24px",
  padding: "16px 18px",
  fontSize: "15px",
  outline: "none",
  resize: "vertical",
  fontFamily: "inherit",
  lineHeight: 1.65,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
};

const profilePostMediaBoxStyle: CSSProperties = {
  marginTop: "12px",
  border: "1px solid rgba(255,255,255,0.11)",
  borderRadius: "24px",
  background: "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.022))",
  padding: "15px",
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
  width: "38px",
  height: "38px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.07)",
  color: "#f9fafb",
  cursor: "pointer",
  fontSize: "20px",
  lineHeight: 1,
  display: "grid",
  placeItems: "center",
  transition: "transform 160ms ease, filter 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease",
};

const postMenuStyle: CSSProperties = {
  position: "absolute",
  top: "44px",
  right: 0,
  zIndex: 20,
  minWidth: "176px",
  background: "rgba(8,12,20,0.98)",
  border: "1px solid rgba(255,255,255,0.13)",
  borderRadius: "18px",
  overflow: "hidden",
  boxShadow: "0 20px 40px rgba(0,0,0,0.42)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
};

const menuItemStyle: CSSProperties = {
  width: "100%",
  background: "transparent",
  color: "#f9fafb",
  borderTopWidth: 0,
  borderRightWidth: 0,
  borderBottomWidth: "1px",
  borderLeftWidth: 0,
  borderStyle: "solid",
  borderTopColor: "transparent",
  borderRightColor: "transparent",
  borderBottomColor: "rgba(255,255,255,0.07)",
  borderLeftColor: "transparent",
  padding: "12px 14px",
  textAlign: "left",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: 800,
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
  marginTop: "14px",
  display: "flex",
  gap: "13px",
  alignItems: "center",
  borderRadius: "24px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "linear-gradient(135deg, rgba(255,255,255,0.055), rgba(0,0,0,0.28))",
  padding: "12px",
  textDecoration: "none",
  color: "white",
  boxShadow: "0 12px 30px rgba(0,0,0,0.20)",
};

const linkPreviewMediaStyle: CSSProperties = {
  width: "126px",
  height: "80px",
  borderRadius: "18px",
  overflow: "hidden",
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.10)",
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



const profileDesktopActionMenuStyle: CSSProperties = {
  width: "340px",
  maxHeight: "340px",
  overflowY: "auto",
  overscrollBehavior: "contain",
  scrollbarWidth: "thin",
  borderRadius: "16px",
  border: "1px solid rgba(255,255,255,0.10)",
  background:
    "linear-gradient(180deg, rgba(24,27,34,0.98), rgba(12,14,19,0.98))",
  boxShadow: "0 22px 70px rgba(0,0,0,0.50)",
  padding: "8px",
  paddingBottom: "12px",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
};

const profileDesktopActionMenuHeaderStyle: CSSProperties = {
  padding: "10px 10px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  marginBottom: "6px",
};

const profileDesktopActionItemStyle: CSSProperties = {
  width: "100%",
  border: "1px solid transparent",
  background: "transparent",
  color: "#ffffff",
  borderRadius: "12px",
  padding: "10px",
  display: "grid",
  gridTemplateColumns: "38px minmax(0, 1fr)",
  alignItems: "center",
  gap: "10px",
  textAlign: "left",
  cursor: "pointer",
};

const profileActionOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2147483647,
  background: "rgba(0,0,0,0.62)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: "14px",
  paddingBottom: "calc(14px + env(safe-area-inset-bottom))",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  touchAction: "auto",
};

const profileActionSheetStyle: CSSProperties = {
  width: "100%",
  maxWidth: "560px",
  maxHeight: "calc(100dvh - 92px)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  overscrollBehavior: "contain",
  WebkitOverflowScrolling: "touch",
  borderRadius: "20px",
  border: "1px solid rgba(255,255,255,0.10)",
  background:
    "linear-gradient(180deg, rgba(24,27,34,0.98), rgba(12,14,19,0.98))",
  boxShadow: "0 30px 90px rgba(0,0,0,0.62)",
  padding: "10px",
  paddingBottom: "18px",
  touchAction: "pan-y",
};

const profileActionGrabberStyle: CSSProperties = {
  width: "42px",
  height: "4px",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.18)",
  margin: "4px auto 12px",
};

const profileActionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "14px",
  padding: "6px 6px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const profileActionEyebrowStyle: CSSProperties = {
  margin: 0,
  color: "#a78bfa",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
};

const profileActionTitleStyle: CSSProperties = {
  margin: "3px 0 0",
  color: "#ffffff",
  fontSize: "18px",
  fontWeight: 950,
  letterSpacing: "-0.03em",
};

const profileActionCloseStyle: CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "#ffffff",
  fontSize: "24px",
  fontWeight: 900,
  cursor: "pointer",
};

const profileActionGridStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
  paddingTop: "10px",
  overflowY: "auto",
  overflowX: "hidden",
  maxHeight: "min(52dvh, 360px)",
  overscrollBehavior: "contain",
  WebkitOverflowScrolling: "touch",
  touchAction: "pan-y",
  paddingBottom: "calc(22px + env(safe-area-inset-bottom))",
};

const profileActionItemStyle: CSSProperties = {
  width: "100%",
  border: "1px solid transparent",
  background: "transparent",
  color: "#ffffff",
  borderRadius: "14px",
  padding: "12px",
  display: "grid",
  gridTemplateColumns: "42px minmax(0, 1fr)",
  alignItems: "center",
  gap: "12px",
  textAlign: "left",
  cursor: "pointer",
};

const profileActionIconStyle: CSSProperties = {
  width: "42px",
  height: "42px",
  borderRadius: "13px",
  display: "grid",
  placeItems: "center",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(168,85,247,0.14)",
  color: "#d8b4fe",
  fontSize: "18px",
  fontWeight: 950,
};

const profilePageBackgroundStyle: CSSProperties = {
  background:
    "radial-gradient(circle at 50% 0%, rgba(126,34,206,0.20) 0%, rgba(7,9,13,0.82) 34%, #05070b 72%), linear-gradient(180deg, #080a10 0%, #05070b 100%)",
};

const profileHeroShellStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  borderRadius: "22px",
  border: "1px solid rgba(255,255,255,0.10)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.060) 0%, rgba(255,255,255,0.026) 100%)",
  boxShadow: "0 18px 48px rgba(0,0,0,0.34)",
  backdropFilter: "blur(14px)",
};

const profileCoverStyle: CSSProperties = {
  position: "relative",
  height: "clamp(190px, 24vw, 300px)",
  background:
    "radial-gradient(circle at 50% 30%, rgba(168,85,247,0.62) 0%, rgba(88,28,135,0.35) 28%, rgba(3,7,18,0.78) 58%), linear-gradient(135deg, #0f1020 0%, #16162a 44%, #05070b 100%)",
  overflow: "hidden",
};

const profileCoverOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.12) 45%, rgba(5,7,11,0.96) 100%)",
};

const editCoverButtonStyle: CSSProperties = {
  position: "absolute",
  top: "16px",
  right: "16px",
  zIndex: 2,
  border: "1px solid rgba(255,255,255,0.13)",
  background: "rgba(0,0,0,0.44)",
  color: "white",
  borderRadius: "14px",
  padding: "9px 12px",
  cursor: "pointer",
  fontWeight: 800,
  backdropFilter: "blur(10px)",
};

const profileHeroContentStyle: CSSProperties = {
  position: "relative",
  marginTop: "-86px",
  padding: "0 20px 20px",
  display: "flex",
  gap: "24px",
  alignItems: "flex-end",
  flexWrap: "wrap",
};

const profileAvatarWrapStyle: CSSProperties = {
  position: "relative",
  width: "clamp(132px, 16vw, 184px)",
  height: "clamp(132px, 16vw, 184px)",
  borderRadius: "50%",
  padding: "5px",
  background:
    "linear-gradient(135deg, rgba(168,85,247,1) 0%, rgba(59,130,246,0.95) 50%, rgba(236,72,153,0.9) 100%)",
  boxShadow: "0 0 34px rgba(168,85,247,0.42)",
  flexShrink: 0,
};

const profileAvatarStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  objectFit: "cover",
  border: "4px solid #07090d",
};

const profileAvatarFallbackStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  background: "#374151",
  color: "#f9fafb",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
  fontSize: "42px",
  border: "4px solid #07090d",
};

const profileOnlineDotStyle: CSSProperties = {
  position: "absolute",
  right: "18px",
  bottom: "18px",
  width: "17px",
  height: "17px",
  borderRadius: "50%",
  background: "#22c55e",
  border: "3px solid #07090d",
  boxShadow: "0 0 10px rgba(34,197,94,0.75)",
};

const avatarCameraButtonStyle: CSSProperties = {
  position: "absolute",
  right: "0px",
  bottom: "18px",
  width: "40px",
  height: "40px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(0,0,0,0.62)",
  color: "white",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
};

const profileHeroInfoStyle: CSSProperties = {
  flex: 1,
  minWidth: "300px",
  paddingBottom: "12px",
};

const profileHeroTopLineStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "18px",
  flexWrap: "wrap",
  marginBottom: "12px",
};

const profileHeroNameStyle: CSSProperties = {
  margin: 0,
  fontSize: "clamp(30px, 4vw, 48px)",
  lineHeight: 1.02,
  letterSpacing: "-0.055em",
  color: "#fff",
};

const verifiedBadgeStyle: CSSProperties = {
  display: "inline-grid",
  placeItems: "center",
  width: "23px",
  height: "23px",
  marginLeft: "10px",
  borderRadius: "999px",
  background: "linear-gradient(135deg, #7c3aed, #a855f7)",
  color: "white",
  fontSize: "14px",
  verticalAlign: "middle",
};

const profileHandleStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#aeb3c2",
  fontSize: "14px",
};

const profileDotStyle: CSSProperties = {
  margin: "0 8px",
  color: "#6b7280",
};

const profileHeroActionsStyle: CSSProperties = {
  display: "flex",
  gap: "10px",
  alignItems: "center",
  justifyContent: "flex-end",
  flexWrap: "wrap",
  maxWidth: "520px",
};

const profilePrimaryButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(135deg,#9333ea,#7c3aed)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "14px",
  padding: "11px 18px",
  fontWeight: 850,
  fontSize: "13px",
  cursor: "pointer",
  boxShadow: "0 8px 18px rgba(124,58,237,0.26)",
  transition: "all 0.18s ease",
  whiteSpace: "nowrap",
};

const profileGlassButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.060)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#f9fafb",
  borderRadius: "14px",
  padding: "11px 16px",
  fontWeight: 800,
  fontSize: "13px",
  cursor: "pointer",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  whiteSpace: "nowrap",
};

const profileIconButtonStyle: CSSProperties = {
  width: "42px",
  height: "42px",
  borderRadius: "14px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.055)",
  color: "white",
  cursor: "pointer",
  transition: "transform 160ms ease, filter 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
};

const profileBioStyle: CSSProperties = {
  margin: "12px 0 0",
  color: "#e5e7eb",
  lineHeight: 1.6,
  maxWidth: "760px",
};

const profileMetaRowStyle: CSSProperties = {
  marginTop: "12px",
  display: "flex",
  gap: "14px",
  flexWrap: "wrap",
  color: "#aeb3c2",
  fontSize: "13px",
};

const profileStatsBarStyle: CSSProperties = {
  margin: "0 14px 14px",
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr auto 1fr auto 1fr",
  alignItems: "center",
  borderRadius: "16px",
  border: "1px solid rgba(255,255,255,0.075)",
  background: "rgba(0,0,0,0.20)",
  padding: "15px 10px",
};

const profileStatItemStyle: CSSProperties = {
  display: "grid",
  justifyItems: "center",
  gap: "4px",
};

const profileStatNumberStyle: CSSProperties = {
  color: "#ffffff",
  fontSize: "22px",
  lineHeight: 1,
};

const profileStatLabelStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: "12px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const profileStatDividerStyle: CSSProperties = {
  width: "1px",
  height: "34px",
  background: "rgba(255,255,255,0.09)",
};

const profileStoriesRowStyle: CSSProperties = {
  margin: "0 14px 14px",
  display: "flex",
  gap: "16px",
  overflowX: "auto",
  padding: "14px",
  borderRadius: "16px",
  border: "1px solid rgba(255,255,255,0.075)",
  background: "rgba(0,0,0,0.16)",
};

const profileStoryItemStyle: CSSProperties = {
  display: "grid",
  justifyItems: "center",
  gap: "8px",
  minWidth: "86px",
};

const profileStoryCircleStyle: CSSProperties = {
  width: "66px",
  height: "66px",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  border: "2px solid rgba(168,85,247,0.75)",
  background: "rgba(255,255,255,0.04)",
  boxShadow: "0 0 22px rgba(168,85,247,0.18)",
  fontSize: "23px",
};

const profileStoryLabelStyle: CSSProperties = {
  color: "#d1d5db",
  fontSize: "12px",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const profileTabsShellStyle: CSSProperties = {
  padding: "0 14px 14px",
};

const profileTabsStyle: CSSProperties = {
  display: "flex",
  gap: "6px",
  padding: "6px",
  borderRadius: "16px",
  background: "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.032))",
  border: "1px solid rgba(255,255,255,0.085)",
  overflowX: "auto",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.045)",
};

const profileTabStyle: CSSProperties = {
  background: "transparent",
  color: "#aeb3c2",
  borderTopWidth: "1px",
  borderRightWidth: "1px",
  borderBottomWidth: "2px",
  borderLeftWidth: "1px",
  borderStyle: "solid",
  borderTopColor: "transparent",
  borderRightColor: "transparent",
  borderBottomColor: "transparent",
  borderLeftColor: "transparent",
  padding: "11px 16px",
  fontWeight: 850,
  cursor: "pointer",
  borderRadius: "12px",
  whiteSpace: "nowrap",
};

const profileActiveTabStyle: CSSProperties = {
  ...profileTabStyle,
  background: "rgba(168,85,247,0.16)",
  color: "#ffffff",
  borderTopWidth: "1px",
  borderRightWidth: "1px",
  borderBottomWidth: "2px",
  borderLeftWidth: "1px",
  borderStyle: "solid",
  borderTopColor: "rgba(168,85,247,0.22)",
  borderRightColor: "rgba(168,85,247,0.22)",
  borderBottomColor: "#a855f7",
  borderLeftColor: "rgba(168,85,247,0.22)",
  borderRadius: "12px",
  boxShadow: "none",
};

const profileMobileTabSelectStyle: CSSProperties = {
  display: "none",
  width: "100%",
  minHeight: "48px",
  marginTop: "0",
  borderRadius: "18px",
  border: "1px solid rgba(168,85,247,0.28)",
  background: "rgba(8,10,16,0.96)",
  color: "#f9fafb",
  padding: "0 14px",
  fontWeight: 900,
  outline: "none",
  boxShadow: "0 12px 26px rgba(0,0,0,0.24)",
};

const aboutHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "12px",
  flexWrap: "wrap",
  marginBottom: "16px",
};

const aboutTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "22px",
  letterSpacing: "-0.03em",
};

const aboutSubtitleStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#9ca3af",
  fontSize: "13px",
  lineHeight: 1.6,
};

const aboutSectionTabsStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
  marginBottom: "16px",
};

const aboutSectionTabStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.045)",
  color: "#d1d5db",
  borderRadius: "999px",
  padding: "9px 13px",
  fontWeight: 800,
  cursor: "pointer",
};

const aboutSectionTabActiveStyle: CSSProperties = {
  ...aboutSectionTabStyle,
  color: "#ffffff",
  border: "1px solid rgba(168,85,247,0.42)",
  background: "linear-gradient(135deg, rgba(168,85,247,0.28), rgba(34,211,238,0.10))",
};

const introGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "12px",
};

const introCardStyle: CSSProperties = {
  display: "flex",
  gap: "12px",
  alignItems: "flex-start",
  padding: "14px",
  borderRadius: "20px",
  border: "1px solid rgba(255,255,255,0.09)",
  background: "rgba(255,255,255,0.04)",
};

const introIconStyle: CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "14px",
  display: "grid",
  placeItems: "center",
  background: "rgba(168,85,247,0.12)",
  border: "1px solid rgba(168,85,247,0.24)",
  flexShrink: 0,
};

const introLabelStyle: CSSProperties = {
  color: "#f9fafb",
  fontWeight: 900,
  marginBottom: "4px",
};

const introTextStyle: CSSProperties = {
  margin: 0,
  color: "#cbd5e1",
  fontSize: "13px",
  lineHeight: 1.7,
};

const tagRowStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};

const profileTagStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  padding: "7px 10px",
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#e5e7eb",
  fontSize: "12px",
  fontWeight: 800,
};

const aboutComingSoonStyle: CSSProperties = {
  minHeight: "150px",
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  gap: "8px",
  color: "#9ca3af",
  border: "1px dashed rgba(255,255,255,0.14)",
  borderRadius: "22px",
  background: "rgba(255,255,255,0.025)",
  padding: "18px",
};

const miniReelGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
  gap: "12px",
};

const miniReelTileStyle: CSSProperties = {
  position: "relative",
  minHeight: "230px",
  overflow: "hidden",
  borderRadius: "20px",
  background: "#05070a",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#9ca3af",
  textDecoration: "none",
  display: "grid",
  placeItems: "center",
};

const miniReelVideoStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};



const rightRailStyle: CSSProperties = {
  flexDirection: "column",
  gap: "14px",
  position: "sticky",
  top: "16px",
  height: "fit-content",
};

const rightPanelCardStyle: CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.065) 0%, rgba(255,255,255,0.035) 100%)",
  borderRadius: "24px",
  padding: "16px",
  border: "1px solid rgba(255,255,255,0.105)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.24)",
  backdropFilter: "blur(14px)",
};

const rightPanelHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "14px",
};

const rightPanelTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "16px",
  fontWeight: 900,
  letterSpacing: "-0.02em",
  color: "#f9fafb",
};

const rightPanelTextStyle: CSSProperties = {
  margin: 0,
  color: "#aeb6c3",
  fontSize: "13px",
  lineHeight: 1.5,
};

const miniPurpleLinkStyle: CSSProperties = {
  color: "#c084fc",
  fontSize: "12px",
  fontWeight: 850,
  whiteSpace: "nowrap",
};

const profileStrengthRingStyle: CSSProperties = {
  width: "76px",
  height: "76px",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
  color: "#ffffff",
  background:
    "radial-gradient(circle at center, rgba(168,85,247,0.12) 0%, rgba(8,10,16,0.96) 62%), conic-gradient(from 0deg, #7c3aed 0deg, #a855f7 306deg, rgba(255,255,255,0.10) 306deg)",
  boxShadow: "0 0 24px rgba(168,85,247,0.25)",
  border: "1px solid rgba(255,255,255,0.10)",
};

const wideGlassButtonStyle: CSSProperties = {
  width: "100%",
  marginTop: "14px",
  minHeight: "40px",
  borderRadius: "14px",
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#f9fafb",
  fontWeight: 850,
  cursor: "pointer",
  transition: "transform 160ms ease, filter 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
};

const achievementGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "10px",
};

const achievementItemStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "5px",
  textAlign: "center",
  color: "#d1d5db",
  fontSize: "10px",
  lineHeight: 1.2,
};

const achievementIconStyle: CSSProperties = {
  width: "50px",
  height: "50px",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  fontSize: "21px",
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 0 18px rgba(168,85,247,0.12)",
};

const badgeBubbleStyle: CSSProperties = {
  width: "42px",
  height: "42px",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  fontSize: "18px",
  background: "rgba(168,85,247,0.12)",
  border: "1px solid rgba(168,85,247,0.42)",
  boxShadow: "0 0 18px rgba(168,85,247,0.16)",
};

const visitorAvatarStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  color: "#f9fafb",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(168,85,247,0.42)",
  overflow: "hidden",
  fontWeight: 900,
};

const activityRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  padding: "10px 12px",
  borderRadius: "14px",
  background: "rgba(255,255,255,0.035)",
  border: "1px solid rgba(255,255,255,0.07)",
  color: "#cbd5e1",
  fontSize: "13px",
};

const onlineStatusPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  padding: "5px 9px",
  background: "rgba(34,197,94,0.12)",
  color: "#86efac",
  border: "1px solid rgba(34,197,94,0.25)",
  fontSize: "11px",
  fontWeight: 900,
};

const offlineStatusPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  padding: "5px 9px",
  background: "rgba(255,255,255,0.04)",
  color: "#cbd5e1",
  border: "1px solid rgba(255,255,255,0.10)",
  fontSize: "11px",
  fontWeight: 900,
};



const mobileTopBarStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 60,
  minHeight: "72px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  background:
    "linear-gradient(180deg, rgba(5,7,12,0.96) 0%, rgba(5,7,12,0.80) 100%)",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(18px)",
};

const mobileCircleButtonStyle: CSSProperties = {
  width: "42px",
  height: "42px",
  borderRadius: "50%",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.045)",
  color: "#f9fafb",
  display: "grid",
  placeItems: "center",
  fontSize: "25px",
  fontWeight: 900,
  cursor: "pointer",
};

const mobileBottomNavStyle: CSSProperties = {
  position: "fixed",
  left: "10px",
  right: "10px",
  bottom: "10px",
  zIndex: 80,
  minHeight: "76px",
  borderRadius: "28px",
  border: "1px solid rgba(255,255,255,0.12)",
  background:
    "linear-gradient(180deg, rgba(12,14,24,0.96) 0%, rgba(5,7,12,0.98) 100%)",
  boxShadow: "0 -12px 34px rgba(0,0,0,0.40), 0 0 28px rgba(124,58,237,0.14)",
  backdropFilter: "blur(20px)",
  display: "grid",
  gridTemplateColumns: "1fr 1fr 74px 1fr 1fr",
  alignItems: "center",
  padding: "8px 10px calc(8px + env(safe-area-inset-bottom, 0px))",
};

const mobileBottomNavItemStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "4px",
  color: "#d1d5db",
  textDecoration: "none",
  fontSize: "11px",
  fontWeight: 800,
};

const mobileBottomNavItemActiveStyle: CSSProperties = {
  ...mobileBottomNavItemStyle,
  color: "#c084fc",
  textShadow: "0 0 16px rgba(168,85,247,0.5)",
};

const mobileBottomNavIconStyle: CSSProperties = {
  fontSize: "22px",
  lineHeight: 1,
};

const mobileCreateButtonStyle: CSSProperties = {
  width: "62px",
  height: "62px",
  borderRadius: "50%",
  border: "3px solid rgba(255,255,255,0.88)",
  background:
    "linear-gradient(135deg, #ffffff 0%, #ffffff 42%, #a855f7 43%, #ec4899 100%)",
  color: "#05070a",
  fontSize: "38px",
  fontWeight: 900,
  display: "grid",
  placeItems: "center",
  boxShadow: "0 0 26px rgba(168,85,247,0.50)",
  cursor: "pointer",
};



const premiumSectionLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  borderRadius: "999px",
  background: "rgba(168,85,247,0.10)",
  border: "1px solid rgba(168,85,247,0.24)",
  color: "#d8b4fe",
  padding: "7px 11px",
  fontSize: "12px",
  fontWeight: 900,
  letterSpacing: "0.02em",
};

const softDividerStyle: CSSProperties = {
  height: "1px",
  width: "100%",
  background:
    "linear-gradient(90deg, rgba(255,255,255,0.00) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.00) 100%)",
};

const profileGlowLineStyle: CSSProperties = {
  height: "3px",
  width: "100%",
  borderRadius: "999px",
  background:
    "linear-gradient(90deg, rgba(168,85,247,0.00) 0%, rgba(168,85,247,0.72) 45%, rgba(34,211,238,0.58) 72%, rgba(34,211,238,0.00) 100%)",
  boxShadow: "0 0 22px rgba(168,85,247,0.28)",
};


"use client";
// DASHBOARD SHOWCASE COMING SOON v1 - Showcase feature is fully paused: no profile_showcases reads, writes, or realtime listeners from Dashboard.
// DASHBOARD LOADING PERFORMANCE PASS v1 - page shell, Showcases, and first timeline batch render faster; heavy extras load after first paint.

import {
  ChangeEvent,
  CSSProperties,
  SyntheticEvent,
  ReactNode,
  RefObject,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import DashboardReelsSection from "./DashboardReelsSection";
import LiveChatPanel from "@/components/live/LiveChatPanel";
import { supabase } from "@/lib/supabase";

// Dashboard launch polish: original layout preserved with cleaner professional Parapost surfaces.

type ProfilePreview = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
  location?: string | null;
  is_online?: boolean | null;
  last_seen_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ShowcaseDuration = "24h" | "30d" | "permanent";
type ShowcaseVisibility = "public" | "friends" | "private";
type ShowcaseMediaType = "image" | "video" | "text";
type ShowcaseFontValue =
  | "inter"
  | "roboto"
  | "openSans"
  | "montserrat"
  | "poppins"
  | "lato"
  | "nunito"
  | "raleway"
  | "playfair"
  | "merriweather";

type BlockedUserRow = {
  blocker_id: string | null;
  blocked_id: string | null;
};

type DashboardShowcaseItem = {
  id: string;
  user_id: string;
  title: string | null;
  cover_text: string | null;
  media_url: string | null;
  media_type: ShowcaseMediaType | string | null;
  media_filename?: string | null;
  font_key?: string | null;
  text_position_x?: number | string | null;
  text_position_y?: number | string | null;
  overlay_font_size?: number | null;
  duration?: ShowcaseDuration | string | null;
  visibility: ShowcaseVisibility | string | null;
  expires_at: string | null;
  created_at: string | null;
  profile: ProfilePreview | null;
};


const SHOWCASE_OVERLAY_MIN_FONT_SIZE = 16;
const SHOWCASE_OVERLAY_MAX_FONT_SIZE = 64;
const SHOWCASE_OVERLAY_DEFAULT_FONT_SIZE = 30;

const SHOWCASE_FONT_OPTIONS: Array<{ value: ShowcaseFontValue; label: string; family: string }> = [
  { value: "inter", label: "Parapost Default", family: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { value: "roboto", label: "Clean Sans", family: "Arial, Helvetica, sans-serif" },
  { value: "openSans", label: "Soft Modern", family: "Verdana, Geneva, sans-serif" },
  { value: "montserrat", label: "Classic Serif", family: "Georgia, 'Times New Roman', serif" },
  { value: "poppins", label: "Rounded Casual", family: "'Trebuchet MS', 'Arial Rounded MT Bold', Arial, sans-serif" },
  { value: "lato", label: "Simple Label", family: "Lato, Arial, Helvetica, sans-serif" },
  { value: "nunito", label: "Typewriter", family: "'Courier New', Courier, monospace" },
  { value: "raleway", label: "Bold Impact", family: "Impact, 'Arial Black', Arial, sans-serif" },
  { value: "playfair", label: "Editorial", family: "Georgia, 'Times New Roman', serif" },
  { value: "merriweather", label: "Clean Creator", family: "'Helvetica Neue', Arial, Helvetica, sans-serif" },
];

type PostImage = {
  id: string;
  post_id: string;
  user_id: string;
  image_url: string;
  storage_path: string | null;
  display_order: number;
  created_at?: string | null;
};

type Post = {
  id: string;
  content: string;
  image_url?: string | null;
  created_at: string;
  user_id: string;
  images?: PostImage[];
};

type DashboardComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  is_hidden?: boolean | null;
  parent_comment_id?: string | null;
  reply_to_user_id?: string | null;
};

type SharedReelItem = {
  id: string;
  reel_id: string;
  user_id: string;
  caption: string | null;
  created_at: string;
  reel_title: string;
  reel_caption: string | null;
  reel_video_url: string;
  reel_poster_url: string | null;
  reel_user_id: string;
  creator_profile_id: string | null;
};

type SharedPostItem = {
  id: string;
  post_id: string;
  user_id: string;
  caption: string | null;
  created_at: string;
  original_post: Post;
};

type DashboardLiveStatus = "draft" | "upcoming" | "live" | "ended" | "cancelled" | string;

type DashboardLiveStreamItem = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  provider: string | null;
  external_url: string | null;
  embed_url: string | null;
  thumbnail_url: string | null;
  status: DashboardLiveStatus;
  visibility: string | null;
  is_hidden: boolean | null;
  is_featured: boolean | null;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string | null;
  views?: number | null;
  profile: ProfilePreview | null;
};

const DASHBOARD_LIVE_SELECT =
  "id, user_id, title, description, provider, external_url, embed_url, thumbnail_url, status, visibility, is_hidden, is_featured, scheduled_at, started_at, ended_at, created_at, updated_at, views";

const DASHBOARD_LIVE_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

type MixedFeedItem =
  | { type: "post"; id: string; created_at: string; post: Post }
  | { type: "shared_post"; id: string; created_at: string; sharedPost: SharedPostItem }
  | { type: "reel_share"; id: string; created_at: string; share: SharedReelItem }
  | { type: "live_stream"; id: string; created_at: string; liveStream: DashboardLiveStreamItem };

type FeedMode = "for_you" | "friends" | "following";

type FeelingActivityIconKey =
  | "smile"
  | "heart"
  | "spark"
  | "wave"
  | "target"
  | "brush"
  | "briefcase"
  | "screen"
  | "music"
  | "location"
  | "compass"
  | "star";

type FeelingActivityOption = {
  id: string;
  label: string;
  category: "Feeling" | "Activity";
  helper: string;
  icon: FeelingActivityIconKey;
};
type CountMap = Record<string, number>;
type ToggleMap = Record<string, boolean>;
type FollowMap = Record<string, boolean>;

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";
const POST_CHARACTER_LIMIT = 63206;
const MAX_POST_IMAGES = 10;
const MAX_POST_VIDEO_SECONDS = 60;
const MAX_POST_IMAGE_MB = 12;
const MAX_POST_VIDEO_MB = 100;
const FEED_INITIAL_BATCH_SIZE = 14;
const FEED_BATCH_INCREMENT = 10;
const DASHBOARD_REALTIME_REFRESH_DELAY_MS = 1500;
const DASHBOARD_BACKGROUND_REFRESH_MS = 120000;
const DASHBOARD_COMMENT_PREVIEW_LIMIT = 2;

const FEELING_ACTIVITY_OPTIONS: FeelingActivityOption[] = [
  { id: "happy", label: "Feeling happy", category: "Feeling", helper: "Share a positive mood", icon: "smile" },
  { id: "grateful", label: "Feeling grateful", category: "Feeling", helper: "Appreciation or good news", icon: "heart" },
  { id: "excited", label: "Feeling excited", category: "Feeling", helper: "Something new is happening", icon: "spark" },
  { id: "relaxed", label: "Feeling relaxed", category: "Feeling", helper: "A calm update", icon: "wave" },
  { id: "focused", label: "Feeling focused", category: "Feeling", helper: "Working on something important", icon: "target" },
  { id: "creative", label: "Feeling creative", category: "Feeling", helper: "Ideas, art, projects, or content", icon: "brush" },
  { id: "working", label: "Working", category: "Activity", helper: "Share what you are building", icon: "briefcase" },
  { id: "watching", label: "Watching", category: "Activity", helper: "Shows, videos, events, or streams", icon: "screen" },
  { id: "listening", label: "Listening", category: "Activity", helper: "Music, podcasts, or audio", icon: "music" },
  { id: "traveling", label: "Traveling", category: "Activity", helper: "Trips, places, and movement", icon: "location" },
  { id: "exploring", label: "Exploring", category: "Activity", helper: "Adventures, events, or locations", icon: "compass" },
  { id: "celebrating", label: "Celebrating", category: "Activity", helper: "Milestones and special moments", icon: "star" },
];

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

function normalizePostLinkToken(rawValue: string) {
  const raw = rawValue.trim();
  const leadingMatch = raw.match(/^[("'<\[]+/);
  const trailingMatch = raw.match(/[)"'\].,;:!?]+$/);

  const leading = leadingMatch?.[0] || "";
  const trailing = trailingMatch?.[0] || "";
  const cleanLabel = raw.slice(leading.length, raw.length - trailing.length);

  return {
    leading,
    cleanLabel,
    trailing,
    href: cleanLabel.toLowerCase().startsWith("http://") || cleanLabel.toLowerCase().startsWith("https://")
      ? cleanLabel
      : `https://${cleanLabel}`,
  };
}

function isIpAddressHost(hostname: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function isOddOrHiddenDestinationLink(url: URL) {
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  const parts = hostname.split(".").filter(Boolean);
  const tld = parts[parts.length - 1] || "";

  if (isLikelyShortenedLink(hostname)) return true;
  if (hostname.startsWith("xn--") || hostname.includes(".xn--")) return true;
  if (isIpAddressHost(hostname)) return true;
  if (hostname.length > 48) return true;
  if ((hostname.match(/-/g) || []).length >= 4) return true;
  if (!/^[a-z0-9.-]+$/i.test(hostname)) return true;
  if (tld.length > 12 || tld.length < 2) return true;

  return false;
}

function getExternalLinkSafetyMessage(url: URL) {
  const hostname = url.hostname.replace(/^www\./, "");
  const isOdd = isOddOrHiddenDestinationLink(url);

  if (isOdd) {
    return `Stronger safety warning: this link looks unusual, shortened, or may hide the final destination.\n\nLink: ${hostname}\n\nOnly continue if you recognize and trust this link. Open it anyway?`;
  }

  return `You are leaving Parapost Network and opening:\n\n${hostname}\n\nOnly continue if you trust this site.`;
}

function getDashboardErrorMessage(error: unknown) {
  if (error instanceof Error && typeof error.message === "string") {
    return error.message;
  }

  if (typeof error === "object" && error && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return message;
  }

  if (typeof error === "string") return error;

  return "Unknown dashboard network error";
}

function isDashboardFetchFailure(error: unknown) {
  const message = getDashboardErrorMessage(error).toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed") ||
    message.includes("fetch failed") ||
    message.includes("the user aborted a request") ||
    message.includes("aborted")
  );
}

function shouldRunDashboardNetworkRefresh() {
  if (typeof window === "undefined") return false;

  if (typeof window.navigator !== "undefined" && window.navigator && !window.navigator.onLine) {
    return false;
  }

  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    return false;
  }

  return true;
}

function logDashboardNetworkIssue(label: string, error: unknown) {
  const message = getDashboardErrorMessage(error);

  // Do not log raw TypeError objects for normal fetch/network hiccups.
  // Next.js dev overlay treats raw console TypeErrors as big red errors.
  if (isDashboardFetchFailure(error)) return;

  console.warn(`${label}: ${message}`);
}

function getDashboardLiveTimestamp(stream: {
  status?: string | null;
  scheduled_at?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  created_at?: string | null;
}) {
  // Timeline position must reflect when the Live was published/started/ended.
  // View-count updates must never move a Live or replay to the top.
  if (stream.status === "live") {
    return (
      stream.started_at ||
      stream.created_at ||
      stream.scheduled_at ||
      new Date().toISOString()
    );
  }

  if (stream.status === "ended") {
    return (
      stream.ended_at ||
      stream.started_at ||
      stream.created_at ||
      stream.scheduled_at ||
      new Date().toISOString()
    );
  }

  return (
    stream.created_at ||
    stream.scheduled_at ||
    stream.started_at ||
    stream.ended_at ||
    new Date().toISOString()
  );
}

function formatDashboardLiveDate(value?: string | null) {
  if (!value) return "Schedule pending";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Schedule pending";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function isDashboardLiveStale(stream: {
  status?: string | null;
  started_at?: string | null;
  updated_at?: string | null;
  scheduled_at?: string | null;
  created_at?: string | null;
}) {
  if (stream.status !== "live") return false;

  const anchor =
    stream.started_at ||
    stream.updated_at ||
    stream.scheduled_at ||
    stream.created_at;

  if (!anchor) return false;

  const anchorTime = new Date(anchor).getTime();

  return Number.isFinite(anchorTime) && Date.now() - anchorTime > DASHBOARD_LIVE_STALE_AFTER_MS;
}

function getDashboardEffectiveLiveStatus(stream: {
  status?: string | null;
  started_at?: string | null;
  updated_at?: string | null;
  scheduled_at?: string | null;
  created_at?: string | null;
}) {
  if (isDashboardLiveStale(stream)) return "ended";
  return stream.status;
}

function getDashboardLiveStatusLabel(stream: {
  status?: string | null;
  started_at?: string | null;
  updated_at?: string | null;
  scheduled_at?: string | null;
  created_at?: string | null;
}) {
  const effectiveStatus = getDashboardEffectiveLiveStatus(stream);

  if (effectiveStatus === "live") return "Live Now";
  if (effectiveStatus === "ended") return "Replay";
  if (effectiveStatus === "cancelled") return "Cancelled";
  if (effectiveStatus === "draft") return "Not Published";

  if (effectiveStatus === "upcoming" && stream.scheduled_at) {
    const scheduledTime = new Date(stream.scheduled_at).getTime();

    if (Number.isFinite(scheduledTime)) {
      const msUntilLive = scheduledTime - Date.now();
      const twoHours = 2 * 60 * 60 * 1000;

      if (msUntilLive > 0 && msUntilLive <= twoHours) return "Live Soon";
    }
  }

  return "Upcoming Live";
}

function getDashboardLiveChatStatus(status?: string | null): "draft" | "upcoming" | "live" | "ended" | "cancelled" {
  if (
    status === "draft" ||
    status === "upcoming" ||
    status === "live" ||
    status === "ended" ||
    status === "cancelled"
  ) {
    return status;
  }

  return "upcoming";
}

function getDashboardLiveActionLabel(stream: { status?: string | null }) {
  if (stream.status === "live") return "Watch Live";
  if (stream.status === "ended") return "Watch Replay";
  return "View Live Show";
}

const ONLINE_STATUS_TIMEOUT_MS = 3 * 60 * 1000;

function isRecentOnlineTimestamp(value?: string | null) {
  if (!value) return false;

  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;

  return Date.now() - time <= ONLINE_STATUS_TIMEOUT_MS;
}

function isProfileActuallyOnline(profile?: { is_online?: boolean | null; last_seen_at?: string | null } | null) {
  return Boolean(profile?.is_online && isRecentOnlineTimestamp(profile.last_seen_at));
}

function isVideoMediaUrl(url?: string | null) {
  if (!url) return false;
  const cleanUrl = url.split("?")[0].split("#")[0].toLowerCase();
  return /\.(mp4|webm|mov|m4v|ogg)$/i.test(cleanUrl);
}

function getVideoDurationFromFile(file: File) {
  return new Promise<number>((resolve) => {
    if (typeof document === "undefined") {
      resolve(0);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;

    const finish = (duration: number) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
      resolve(Number.isFinite(duration) ? duration : 0);
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => finish(video.duration || 0);
    video.onerror = () => finish(0);
    video.src = objectUrl;
    video.load();

    window.setTimeout(() => finish(0), 4500);
  });
}

function primeVideoPreview(event: SyntheticEvent<HTMLVideoElement>) {
  const video = event.currentTarget;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const previewTime = duration > 0.5 ? Math.min(0.35, Math.max(0.1, duration / 8)) : 0;

  if (previewTime <= 0 || video.currentTime >= previewTime) return;

  try {
    video.currentTime = previewTime;
  } catch {
    // Some mobile browsers may block seeking before enough metadata is ready.
  }
}

function handleSafeExternalLinkClick(
  event: ReactMouseEvent<HTMLAnchorElement>,
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

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    alert("This link was blocked because it may be unsafe.");
    return;
  }

  const message = getExternalLinkSafetyMessage(parsedUrl);
  if (!window.confirm(message)) return;

  const openedWindow = window.open(parsedUrl.toString(), "_blank", "noopener,noreferrer");

  if (openedWindow) {
    openedWindow.opener = null;
  }
}

function renderLinkedText(text: string): ReactNode {
  const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  Array.from(text.matchAll(urlRegex)).forEach((match, index) => {
    const rawMatch = match[0];
    const matchIndex = match.index || 0;

    if (matchIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, matchIndex));
    }

    const { leading, cleanLabel, trailing, href } = normalizePostLinkToken(rawMatch);

    if (!cleanLabel || isBlockedLinkProtocol(href)) {
      nodes.push(
        <span key={`unsafe-link-${matchIndex}-${index}`} style={{ color: "#fca5a5", fontWeight: 850 }}>
          {leading}[unsafe link blocked]{trailing}
        </span>
      );
    } else {
      nodes.push(
        <span key={`safe-link-${matchIndex}-${index}`}>
          {leading}
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => handleSafeExternalLinkClick(event, href)}
            className="dashboard-post-text-link"
            style={postTextLinkStyle}
          >
            {cleanLabel}
          </a>
          {trailing}
        </span>
      );
    }

    lastIndex = matchIndex + rawMatch.length;
  });

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length ? nodes : text;
}



function ExpandableFeedText({
  text,
  hasMedia = false,
  style,
  className = "",
}: {
  text: string;
  hasMedia?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const normalizedText = text.trim();

  if (!normalizedText) return null;

  const lineCount = normalizedText.split(/\r?\n/).filter((line) => line.trim()).length;
  const shouldOfferToggle =
    normalizedText.length > (hasMedia ? 135 : 280) ||
    lineCount > (hasMedia ? 2 : 4);

  return (
    <div
      className={`parapost-expandable-post-text ${hasMedia ? "parapost-expandable-post-text-media" : "parapost-expandable-post-text-only"} ${expanded ? "parapost-expandable-post-text-open" : ""} ${className}`.trim()}
    >
      <p className="parapost-expandable-post-copy" style={style}>
        {renderLinkedText(normalizedText)}
      </p>

      {shouldOfferToggle ? (
        <button
          type="button"
          className="parapost-expandable-post-toggle"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
          aria-expanded={expanded}
        >
          {expanded ? "Less" : "More"}
        </button>
      ) : null}
    </div>
  );
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
    if (url.pathname.startsWith("/watch")) return url.searchParams.get("v") || "";
    if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/shorts/")[1]?.split(/[?&#/]/)[0] || "";
    if (url.pathname.startsWith("/embed/")) return url.pathname.split("/embed/")[1]?.split(/[?&#/]/)[0] || "";
  }

  return "";
}

function getFirstSafeLinkPreview(text: string): LinkPreviewData | null {
  const match = text.match(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/i);
  if (!match) return null;

  const { cleanLabel, href } = normalizePostLinkToken(match[0]);
  if (!cleanLabel || isBlockedLinkProtocol(href)) return null;

  try {
    const parsedUrl = new URL(href);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) return null;

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

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(preview.hostname)}&sz=64`;

  return (
    <a
      href={preview.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => handleSafeExternalLinkClick(event, preview.href)}
      className="dashboard-link-preview-card dashboard-external-link-preview"
      style={linkPreviewCardStyle}
    >
      <div style={linkPreviewMediaStyle}>
        {preview.type === "youtube" && preview.youtubeVideoId ? (
          <>
            <img
              src={`https://img.youtube.com/vi/${preview.youtubeVideoId}/hqdefault.jpg`}
              alt="YouTube preview"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            <div style={linkPreviewPlayOverlayStyle}>▶</div>
          </>
        ) : (
          <div style={linkPreviewFaviconWrapStyle}>
            <img src={faviconUrl} alt="" style={{ width: 42, height: 42, borderRadius: 12 }} />
          </div>
        )}
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={linkPreviewEyebrowStyle}>{preview.type === "youtube" ? "YouTube" : "External Website"}</div>
        <div style={linkPreviewTitleStyle}>{preview.type === "youtube" ? "Watch video" : preview.label}</div>
        <div style={linkPreviewDomainStyle}>{preview.hostname}</div>
      </div>
    </a>
  );
}

async function fetchPostImagesMap(postIds: string[]) {
  const uniquePostIds = [...new Set(postIds.filter(Boolean))];

  if (uniquePostIds.length === 0) {
    return {} as Record<string, PostImage[]>;
  }

  const { data, error } = await supabase
    .from("post_images")
    .select("id, post_id, user_id, image_url, storage_path, display_order, created_at")
    .in("post_id", uniquePostIds)
    .order("display_order", { ascending: true });

  if (error) {
    console.warn("Could not load post images:", error.message);
    return {} as Record<string, PostImage[]>;
  }

  return ((data || []) as PostImage[]).reduce<Record<string, PostImage[]>>((map, image) => {
    if (!image.post_id || !image.image_url) return map;
    if (!map[image.post_id]) map[image.post_id] = [];
    map[image.post_id].push(image);
    return map;
  }, {});
}

function attachImagesToPosts<T extends Post>(posts: T[], imageMap: Record<string, PostImage[]>) {
  return posts.map((post) => ({
    ...post,
    images: imageMap[post.id] || [],
  }));
}

function getPostImageUrls(post?: Pick<Post, "image_url" | "images"> | null) {
  if (!post) return [];

  const galleryUrls = (post.images || [])
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
    .map((image) => image.image_url)
    .filter(Boolean);

  if (galleryUrls.length > 0) return galleryUrls;
  return post.image_url ? [post.image_url] : [];
}


type DashboardPostImageViewer = {
  url: string;
  alt: string;
};

function DashboardPostImageViewerModal({
  viewer,
  onClose,
}: {
  viewer: DashboardPostImageViewer | null;
  onClose: () => void;
}) {
  const [visualViewportBox, setVisualViewportBox] = useState(() => ({
    top: 0,
    left: 0,
    offsetTop: 0,
    offsetLeft: 0,
    width: 0,
    height: 0,
  }));
  const [isTabletViewer, setIsTabletViewer] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 768px) and (max-width: 1180px)").matches
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const tabletQuery = window.matchMedia("(min-width: 768px) and (max-width: 1180px)");
    const updateTabletViewer = () => setIsTabletViewer(tabletQuery.matches);

    updateTabletViewer();
    tabletQuery.addEventListener?.("change", updateTabletViewer);

    return () => tabletQuery.removeEventListener?.("change", updateTabletViewer);
  }, []);

  useEffect(() => {
    if (!viewer || typeof window === "undefined") return;

    const updateVisualViewportBox = () => {
      const viewport = window.visualViewport;
      setVisualViewportBox({
        // Document coordinates are retained for the existing desktop/mobile
        // implementation. Tablet uses only the visual viewport offsets below.
        top: window.scrollY + (viewport?.offsetTop || 0),
        left: window.scrollX + (viewport?.offsetLeft || 0),
        offsetTop: viewport?.offsetTop || 0,
        offsetLeft: viewport?.offsetLeft || 0,
        width: viewport?.width || window.innerWidth,
        height: viewport?.height || window.innerHeight,
      });
    };

    updateVisualViewportBox();
    window.addEventListener("resize", updateVisualViewportBox);
    window.addEventListener("orientationchange", updateVisualViewportBox);
    window.visualViewport?.addEventListener("resize", updateVisualViewportBox);
    window.visualViewport?.addEventListener("scroll", updateVisualViewportBox);

    return () => {
      window.removeEventListener("resize", updateVisualViewportBox);
      window.removeEventListener("orientationchange", updateVisualViewportBox);
      window.visualViewport?.removeEventListener("resize", updateVisualViewportBox);
      window.visualViewport?.removeEventListener("scroll", updateVisualViewportBox);
    };
  }, [viewer]);

  useEffect(() => {
    if (!viewer || typeof window === "undefined") return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const bodyStyle = document.body.style;
    const htmlStyle = document.documentElement.style;
    const previousBodyOverflow = bodyStyle.overflow;
    const previousBodyOverscrollBehavior = bodyStyle.overscrollBehavior;
    const previousHtmlOverflow = htmlStyle.overflow;
    const previousHtmlOverscrollBehavior = htmlStyle.overscrollBehavior;

    // iPad Safari shifts fixed elements to the layout viewport when html/body
    // overflow is changed. Keep the tablet document in place and let the
    // full-screen overlay block touch gestures instead. Desktop/mobile retain
    // their existing scroll lock behavior.
    if (!isTabletViewer) {
      bodyStyle.overflow = "hidden";
      htmlStyle.overflow = "hidden";
    }
    bodyStyle.overscrollBehavior = "none";
    htmlStyle.overscrollBehavior = "none";

    // iPad Safari does not consistently honor touch-action on a fixed portal.
    // Block document touch movement with a non-passive listener while leaving
    // body/html positioning untouched, so the page does not jump or freeze.
    const preventTabletTouchMove = (event: TouchEvent) => {
      if (isTabletViewer) event.preventDefault();
    };

    if (isTabletViewer) {
      document.addEventListener("touchmove", preventTabletTouchMove, { passive: false });
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      bodyStyle.overflow = previousBodyOverflow;
      bodyStyle.overscrollBehavior = previousBodyOverscrollBehavior;
      htmlStyle.overflow = previousHtmlOverflow;
      htmlStyle.overscrollBehavior = previousHtmlOverscrollBehavior;
      document.removeEventListener("touchmove", preventTabletTouchMove);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [viewer, onClose, isTabletViewer]);

  if (!viewer || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Post image viewer"
      onClick={onClose}
      style={{
        // Tablet-only correction: keep the portal attached to the visible
        // browser viewport. Do not add scrollY/visualViewport offsets here;
        // those offsets move the lightbox into document space and reveal the
        // original post underneath on iPad Safari.
        position: isTabletViewer ? "fixed" : "absolute",
        // On iPad, fixed positioning is relative to the layout viewport while
        // Safari's toolbar changes the visual viewport. Use visualViewport
        // offsets only (never scrollY) so the viewer remains over the tapped
        // post without drifting sideways or upward.
        top: isTabletViewer ? visualViewportBox.offsetTop : visualViewportBox.top,
        left: isTabletViewer ? visualViewportBox.offsetLeft : visualViewportBox.left,
        width: isTabletViewer
          ? visualViewportBox.width || "100vw"
          : visualViewportBox.width || "100vw",
        height: isTabletViewer
          ? visualViewportBox.height || "100dvh"
          : visualViewportBox.height || "100dvh",
        minHeight: isTabletViewer
          ? visualViewportBox.height || "100dvh"
          : visualViewportBox.height || "100dvh",
        zIndex: 2147483647,
        overflow: "hidden",
        isolation: "isolate",
        display: "grid",
        placeItems: "center",
        padding: isTabletViewer
          ? "72px max(16px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))"
          : "72px max(16px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
        background: isTabletViewer ? "#03050a" : "rgba(3,5,10,0.96)",
        backdropFilter: isTabletViewer ? "none" : "blur(16px)",
        WebkitBackdropFilter: isTabletViewer ? "none" : "blur(16px)",
        touchAction: isTabletViewer ? "none" : "auto",
      }}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label="Close image viewer"
        style={{
          position: "absolute",
          top: isTabletViewer ? "max(18px, env(safe-area-inset-top))" : "max(16px, env(safe-area-inset-top))",
          right: "max(16px, env(safe-area-inset-right))",
          width: 48,
          height: 48,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.24)",
          background: "rgba(8,10,16,0.94)",
          color: "#ffffff",
          display: "grid",
          placeItems: "center",
          fontSize: 30,
          lineHeight: 1,
          fontWeight: 800,
          cursor: "pointer",
          boxShadow: "0 18px 44px rgba(0,0,0,0.52)",
          zIndex: 20,
          touchAction: "manipulation",
        }}
      >
        ×
      </button>

      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          height: "100%",
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img
          src={viewer.url}
          alt={viewer.alt}
          style={{
            maxWidth: isTabletViewer
              ? visualViewportBox.width
                ? Math.max(240, visualViewportBox.width - 32)
                : "calc(100vw - 32px)"
              : "min(96vw, 1320px)",
            maxHeight: isTabletViewer
              ? visualViewportBox.height
                ? Math.max(240, visualViewportBox.height - 104)
                : "calc(100dvh - 104px)"
              : visualViewportBox.height
                ? Math.max(240, visualViewportBox.height - 104)
                : "calc(100dvh - 104px)",
            width: "auto",
            height: "auto",
            objectFit: "contain",
            display: "block",
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "#05070d",
            boxShadow: "0 30px 90px rgba(0,0,0,0.62)",
          }}
        />
      </div>
    </div>,
    document.body
  );
}

function PostImageGrid({
  imageUrls,
  alt,
  onOpenImage,
}: {
  imageUrls: string[];
  alt: string;
  onOpenImage?: (url: string, alt: string) => void;
}) {
  const safeUrls = imageUrls.filter(Boolean).slice(0, MAX_POST_IMAGES);
  if (safeUrls.length === 0) return null;

  const renderMedia = (url: string, index: number) => {
    const isVideo = isVideoMediaUrl(url);

    if (isVideo) {
      return (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={primeVideoPreview}
          onLoadedData={primeVideoPreview}
          className="dashboard-post-media-item"
          style={postImageGridImageStyle}
          aria-label={`${alt} video ${index + 1}`}
        />
      );
    }

    const imageAlt = `${alt} ${index + 1}`;

    return (
      <img
        src={url}
        alt={imageAlt}
        loading="lazy"
        className="dashboard-post-media-item"
        role={onOpenImage ? "button" : undefined}
        tabIndex={onOpenImage ? 0 : undefined}
        onClick={onOpenImage ? () => onOpenImage(url, imageAlt) : undefined}
        onKeyDown={
          onOpenImage
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenImage(url, imageAlt);
                }
              }
            : undefined
        }
        style={{
          ...postImageGridImageStyle,
          cursor: onOpenImage ? "zoom-in" : postImageGridImageStyle.cursor,
        }}
      />
    );
  };

  if (safeUrls.length === 1) {
    const isVideo = isVideoMediaUrl(safeUrls[0]);

    return isVideo ? (
      <video
        src={safeUrls[0]}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={primeVideoPreview}
        onLoadedData={primeVideoPreview}
        className="dashboard-post-single-media"
        style={postImageStyle}
        aria-label={`${alt} video`}
      />
    ) : (
      <img
        src={safeUrls[0]}
        alt={alt}
        loading="lazy"
        className="dashboard-post-single-media"
        role={onOpenImage ? "button" : undefined}
        tabIndex={onOpenImage ? 0 : undefined}
        onClick={onOpenImage ? () => onOpenImage(safeUrls[0], alt) : undefined}
        onKeyDown={
          onOpenImage
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenImage(safeUrls[0], alt);
                }
              }
            : undefined
        }
        style={{
          ...postImageStyle,
          cursor: onOpenImage ? "zoom-in" : postImageStyle.cursor,
        }}
      />
    );
  }

  const visibleUrls = safeUrls.slice(0, 4);
  const extraCount = safeUrls.length - visibleUrls.length;

  return (
    <div className="dashboard-post-media-grid" style={postImageGridStyle}>
      {visibleUrls.map((url, index) => {
        const isFirstInThreeGrid = safeUrls.length === 3 && index === 0;
        const showOverlay = index === 3 && extraCount > 0;

        return (
          <div
            key={`${url}-${index}`}
            className="dashboard-post-media-tile"
            style={{
              ...postImageGridTileStyle,
              ...(isFirstInThreeGrid ? postImageGridLargeTileStyle : {}),
            }}
          >
            {renderMedia(url, index)}
            {isVideoMediaUrl(url) ? <div style={postVideoBadgeStyle}>Video</div> : null}
            {showOverlay ? <div style={postImageGridOverlayStyle}>+{extraCount}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function getInitial(name?: string | null, username?: string | null) {
  const value = name || username || "P";
  return value.charAt(0).toUpperCase();
}

function getDashboardFeedSortTime(value?: string | null) {
  if (!value) return 0;

  const rawValue = String(value).trim();
  if (!rawValue) return 0;

  // Supabase tables can return a mix of timezone-aware and timezone-less
  // timestamps. JavaScript treats timezone-less values as local time, which
  // can incorrectly place older posts above a newly shared Reel.
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(rawValue);
  const normalizedValue = hasTimezone
    ? rawValue
    : `${rawValue.replace(" ", "T")}Z`;

  const timestamp = new Date(normalizedValue).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatRelativeTime(value?: string | null) {
  if (!value) return "just now";

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "just now";

  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
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

function hasCompletedDiscoveryProfile(profile: ProfilePreview) {
  const hasName = Boolean((profile.full_name || profile.username || "").trim());
  const hasBio = Boolean((profile.bio || "").trim());
  return hasName && hasBio;
}

function getDiscoverySortTime(profile: ProfilePreview) {
  const value = profile.updated_at || profile.created_at || "";
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function buildDashboardBlockedUserIds(
  rows: BlockedUserRow[] | null | undefined,
  viewerId: string
) {
  const blockedIds = new Set<string>();

  for (const row of rows || []) {
    const otherId =
      row.blocker_id === viewerId
        ? row.blocked_id
        : row.blocked_id === viewerId
          ? row.blocker_id
          : "";

    if (otherId) blockedIds.add(otherId);
  }

  return Array.from(blockedIds);
}


const TREND_STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "because",
  "been",
  "before",
  "being",
  "could",
  "every",
  "from",
  "have",
  "here",
  "into",
  "just",
  "like",
  "more",
  "most",
  "only",
  "over",
  "post",
  "posts",
  "reel",
  "reels",
  "share",
  "shared",
  "showcase",
  "showcases",
  "some",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "with",
  "your",
  "parapost",
  "network",
]);

function formatTrendTitle(value: string) {
  return value
    .replace(/^#+/, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function addTrendCandidate(
  map: Map<string, { title: string; count: number; latestTime: number; source: "hashtag" | "keyword" }>,
  rawValue: string,
  latestTime: number,
  source: "hashtag" | "keyword"
) {
  const cleaned = rawValue.replace(/^#+/, "").replace(/[^a-zA-Z0-9_ -]/g, "").trim();
  const key = cleaned.toLowerCase();

  if (!key || key.length < 4 || TREND_STOP_WORDS.has(key)) return;
  if (/^\d+$/.test(key)) return;

  const existing = map.get(key);
  const title = formatTrendTitle(cleaned);

  if (existing) {
    existing.count += source === "hashtag" ? 3 : 1;
    existing.latestTime = Math.max(existing.latestTime, latestTime);
    if (source === "hashtag") existing.source = "hashtag";
    return;
  }

  map.set(key, {
    title,
    count: source === "hashtag" ? 3 : 1,
    latestTime,
    source,
  });
}

function buildDashboardTrendingTopics(items: MixedFeedItem[]) {
  const trendMap = new Map<string, { title: string; count: number; latestTime: number; source: "hashtag" | "keyword" }>();

  items.forEach((item) => {
    const createdAt = item.created_at ? new Date(item.created_at).getTime() : 0;
    const latestTime = Number.isNaN(createdAt) ? 0 : createdAt;
    const text =
      item.type === "post"
        ? item.post.content || ""
        : item.type === "shared_post"
          ? [item.sharedPost.caption, item.sharedPost.original_post.content].filter(Boolean).join(" ")
          : item.type === "reel_share"
            ? [item.share.caption, item.share.reel_title, item.share.reel_caption].filter(Boolean).join(" ")
            : [item.liveStream.title, item.liveStream.description].filter(Boolean).join(" ");

    const hashtags = text.match(/#[a-zA-Z0-9_]{3,}/g) || [];
    hashtags.forEach((tag) => addTrendCandidate(trendMap, tag, latestTime, "hashtag"));

    const words = text.match(/[a-zA-Z][a-zA-Z0-9'-]{3,}/g) || [];
    words.slice(0, 30).forEach((word) => addTrendCandidate(trendMap, word, latestTime, "keyword"));
  });

  const dynamicTopics = Array.from(trendMap.values())
    .sort((a, b) => b.count - a.count || b.latestTime - a.latestTime)
    .slice(0, 5)
    .map((topic) => ({
      title: topic.title,
      meta: topic.source === "hashtag" ? "Trending hashtag" : "Active topic",
    }));

  if (dynamicTopics.length >= 5) return dynamicTopics;

  const fallbackTopics = [
    { title: "New Posts", meta: "Fresh community updates" },
    { title: "Creator Moments", meta: "Photos, videos, and stories" },
    { title: "Parapost Reels", meta: "Short videos and clips" },
    { title: "Community Highlights", meta: "What members are sharing" },
    { title: "Shared Experiences", meta: "New conversations" },
  ];

  const existingTitles = new Set(dynamicTopics.map((topic) => topic.title.toLowerCase()));
  const filledTopics = [...dynamicTopics];

  for (const topic of fallbackTopics) {
    if (filledTopics.length >= 5) break;
    if (existingTitles.has(topic.title.toLowerCase())) continue;
    filledTopics.push(topic);
  }

  return filledTopics;
}

function getAvatarShellStyle(size: number, isOnline?: boolean | null): CSSProperties {
  return {
    width: `${size}px`,
    height: `${size}px`,
    minWidth: `${size}px`,
    borderRadius: "999px",
    padding: "3px",
    display: "grid",
    placeItems: "center",
    position: "relative",
    overflow: "visible",
    isolation: "isolate",
    textDecoration: "none",
    background: isOnline
      ? "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))"
      : "linear-gradient(135deg, var(--parapost-accent-soft), rgba(15,23,42,0.98))",
    boxShadow: isOnline
      ? "0 0 0 1px rgba(255,255,255,0.10), 0 0 22px var(--parapost-accent-glow)"
      : "0 0 0 1px rgba(255,255,255,0.08), 0 12px 24px rgba(0,0,0,0.28)",
  };
}

function Avatar({
  profile,
  size = 44,
  href,
}: {
  profile?: ProfilePreview | null;
  size?: number;
  href?: string;
}) {
  const innerSize = Math.max(1, size - 6);

  const cropStyle: CSSProperties = {
    width: `${innerSize}px`,
    height: `${innerSize}px`,
    borderRadius: "999px",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    position: "relative",
    zIndex: 1,
    border: "2px solid #07090d",
    background: "rgba(7,9,13,0.96)",
    flexShrink: 0,
  };

  const isActuallyOnline = isProfileActuallyOnline(profile);

  const avatar = (
    <div style={getAvatarShellStyle(size, isActuallyOnline)}>
      <div style={cropStyle}>
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.full_name || profile.username || "Profile"}
            style={{
              width: "100%",
              height: "100%",
              minWidth: "100%",
              minHeight: "100%",
              borderRadius: "999px",
              objectFit: "cover",
              objectPosition: "center",
              display: "block",
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "999px",
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(135deg, var(--parapost-accent-1), #111827)",
              color: "white",
              fontWeight: 950,
              fontSize: `${Math.max(12, Math.round(size * 0.34))}px`,
            }}
          >
            {getInitial(profile?.full_name, profile?.username)}
          </div>
        )}
      </div>
      {isActuallyOnline ? <span style={onlineDotStyle} /> : null}
    </div>
  );

  if (!href) return avatar;
  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        display: "inline-flex",
        overflow: "visible",
        flexShrink: 0,
      }}
    >
      {avatar}
    </Link>
  );
}

function ParaGhostLogoIcon({ size = 34 }: { size?: number }) {
  return (
    <img
      src="/parapost-icon-white.png"
      alt=""
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        display: "block",
        objectFit: "contain",
        filter: "drop-shadow(0 0 10px color-mix(in srgb, var(--parapost-accent-2) 42%, transparent))",
      }}
    />
  );
}

function NewShowcaseIcon() {
  return (
    <div style={newShowcaseIconStyle}>
      <span style={newShowcasePlusInnerStyle}>+</span>
    </div>
  );
}

function getShowcaseFontOption(fontKey?: string | null) {
  return SHOWCASE_FONT_OPTIONS.find((font) => font.value === fontKey) || SHOWCASE_FONT_OPTIONS[0];
}

function getDashboardShowcaseFontFamily(fontKey?: string | null) {
  return getShowcaseFontOption(fontKey).family;
}

function clampShowcaseOverlayFontSize(value: number) {
  if (!Number.isFinite(value)) return SHOWCASE_OVERLAY_DEFAULT_FONT_SIZE;
  return Math.max(SHOWCASE_OVERLAY_MIN_FONT_SIZE, Math.min(SHOWCASE_OVERLAY_MAX_FONT_SIZE, Math.round(value)));
}

function getShowcaseOverlayDisplayFontSize(text: string, requestedSize: number) {
  const clean = text.trim();
  const base = clampShowcaseOverlayFontSize(requestedSize);
  if (clean.length > 70) return Math.max(16, Math.round(base * 0.64));
  if (clean.length > 42) return Math.max(17, Math.round(base * 0.76));
  if (clean.length > 24) return Math.max(19, Math.round(base * 0.88));
  return base;
}

function getShowcaseOverlayTextWidth(text: string) {
  const clean = text.trim();
  if (clean.length > 75) return "86%";
  if (clean.length > 42) return "78%";
  if (clean.length > 18) return "68%";
  return "58%";
}

function clampDashboardShowcaseFontSize(value?: number | null) {
  if (!value || Number.isNaN(Number(value))) return 10;
  return Math.max(8, Math.min(14, Math.round(Number(value) * 0.45)));
}

function getDashboardShowcaseLabel(showcase: DashboardShowcaseItem) {
  return (
    showcase.title ||
    showcase.cover_text ||
    showcase.profile?.full_name?.split(" ")[0] ||
    showcase.profile?.username ||
    "Showcase"
  );
}


function normalizeDashboardShowcaseComparableText(value?: string | null) {
  return (value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function getDashboardShowcaseOverlayText(showcase: Pick<DashboardShowcaseItem, "cover_text" | "title">) {
  const coverText = (showcase.cover_text || "").trim();
  const titleText = (showcase.title || "").trim();

  if (!coverText) return "";

  // A Showcase name belongs in the header/footer only.
  // Middle overlay text should only appear when the creator added separate cover text.
  if (
    titleText &&
    normalizeDashboardShowcaseComparableText(coverText) === normalizeDashboardShowcaseComparableText(titleText)
  ) {
    return "";
  }

  return coverText;
}


function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10.8 18.1C14.8317 18.1 18.1 14.8317 18.1 10.8C18.1 6.76832 14.8317 3.5 10.8 3.5C6.76832 3.5 3.5 6.76832 3.5 10.8C3.5 14.8317 6.76832 18.1 10.8 18.1Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M16.2 16.2L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 18H9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path
        d="M18 16V11C18 7.686 15.314 5 12 5S6 7.686 6 11V16L4 18H20L18 16Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 17L4 20V6C4 4.895 4.895 4 6 4H18C19.105 4 20 4.895 20 6V15C20 16.105 19.105 17 18 17H7Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path d="M8 9H16M8 13H13" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function FeelingActivityMiniIcon({ icon }: { icon: FeelingActivityIconKey }) {
  const common = {
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (icon) {
    case "smile":
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8" {...common} />
          <path d="M8.8 14.2c1.6 1.6 4.8 1.6 6.4 0" {...common} />
          <path d="M9 9.4h.01M15 9.4h.01" {...common} />
        </svg>
      );
    case "heart":
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z" {...common} />
        </svg>
      );
    case "spark":
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3l1.7 5.2L19 10l-5.3 1.8L12 17l-1.7-5.2L5 10l5.3-1.8L12 3Z" {...common} />
          <path d="M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8L18 16Z" {...common} />
        </svg>
      );
    case "wave":
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 14c2.6-4 5.4-4 8 0s5.4 4 8 0" {...common} />
          <path d="M4 18c2.6-3 5.4-3 8 0s5.4 3 8 0" {...common} />
        </svg>
      );
    case "target":
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8" {...common} />
          <circle cx="12" cy="12" r="3" {...common} />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" {...common} />
        </svg>
      );
    case "brush":
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M14 4l6 6-8.5 8.5a3 3 0 0 1-4.2-4.2L14 4Z" {...common} />
          <path d="M5 19c-1.2.8-2.2 1-3 1 0 0 .5-2.2 2-3.2" {...common} />
        </svg>
      );
    case "briefcase":
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 7V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" {...common} />
          <rect x="4" y="7" width="16" height="12" rx="3" {...common} />
          <path d="M4 12h16" {...common} />
        </svg>
      );
    case "screen":
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="5" width="16" height="12" rx="2.5" {...common} />
          <path d="M10 20h4M12 17v3M10 9l5 3-5 3V9Z" {...common} />
        </svg>
      );
    case "music":
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 18V6l10-2v12" {...common} />
          <circle cx="7" cy="18" r="2" {...common} />
          <circle cx="17" cy="16" r="2" {...common} />
        </svg>
      );
    case "location":
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z" {...common} />
          <circle cx="12" cy="10" r="2.4" {...common} />
        </svg>
      );
    case "compass":
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8" {...common} />
          <path d="M15.5 8.5l-2 5-5 2 2-5 5-2Z" {...common} />
        </svg>
      );
    case "star":
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 4l2.3 4.7 5.2.8-3.8 3.7.9 5.2L12 16l-4.6 2.4.9-5.2-3.8-3.7 5.2-.8L12 4Z" {...common} />
        </svg>
      );
    default:
      return null;
  }
}

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="18" cy="12" r="1.8" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 7H19.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M4.5 12H19.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M4.5 17H19.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} aria-hidden="true">
      <path
        d="M12 20.5C12 20.5 4 15.2 4 9.5C4 6.462 6.462 4 9.5 4C11.243 4 12.798 4.811 13.8 6.076C14.802 4.811 16.357 4 18.1 4C21.138 4 23.6 6.462 23.6 9.5C23.6 15.2 15.6 20.5 15.6 20.5H12Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 17L4 20V6C4 4.895 4.895 4 6 4H18C19.105 4 20 4.895 20 6V15C20 16.105 19.105 17 18 17H7Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 4.75L3.85 11.95C3.05 12.29 3.07 13.45 3.88 13.76L10.05 16.05L12.34 22.12C12.65 22.93 13.81 22.95 14.15 22.15L21 4.75Z"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 4.75C7 3.784 7.784 3 8.75 3H15.25C16.216 3 17 3.784 17 4.75V20.25L12 17.25L7 20.25V4.75Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3.4L3.5 10.6V20.2H9V14H15V20.2H20.5V10.6L12 3.4Z" />
    </svg>
  );
}

function ReelsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 5L10 10M14 5L16 10M4 10H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function buildPostContentWithFeelingActivity(content: string, feelingActivity: FeelingActivityOption | null) {
  const cleanContent = content.trim();
  const activityLine = feelingActivity ? feelingActivity.label : "";
  const combined = [activityLine, cleanContent].filter(Boolean).join("\n\n");
  return combined.slice(0, POST_CHARACTER_LIMIT);
}

function getPostFeelingActivityHeaderText(label: string) {
  const cleanLabel = label.trim();
  if (!cleanLabel) return "";

  const matchedOption = FEELING_ACTIVITY_OPTIONS.find(
    (option) => option.label.toLowerCase() === cleanLabel.toLowerCase()
  );

  if (!matchedOption) return "";

  if (matchedOption.category === "Feeling") {
    return `is ${matchedOption.label.toLowerCase()}`;
  }

  return `is ${matchedOption.label.toLowerCase()}`;
}

function splitPostFeelingActivityContent(content: string) {
  const lines = content.split(/\r?\n/);
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);

  if (firstContentIndex === -1) {
    return { headerActivityText: "", bodyContent: "" };
  }

  const firstContentLine = lines[firstContentIndex].trim();
  const headerActivityText = getPostFeelingActivityHeaderText(firstContentLine);

  if (!headerActivityText) {
    return { headerActivityText: "", bodyContent: content };
  }

  const bodyLines = lines.slice(firstContentIndex + 1);

  while (bodyLines.length > 0 && bodyLines[0].trim().length === 0) {
    bodyLines.shift();
  }

  return {
    headerActivityText,
    bodyContent: bodyLines.join("\n").trimStart(),
  };
}



function TwoLineExpandableComment({
  text,
  expanded,
  onToggle,
  style,
}: {
  text: string;
  expanded: boolean;
  onToggle: () => void;
  style?: CSSProperties;
}) {
  const cleanText = text || "";
  const shouldOfferToggle = cleanText.length > 120 || cleanText.includes("\n");

  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          ...style,
          ...(!expanded
            ? {
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
            : {}),
        }}
      >
        {renderLinkedText(cleanText)}
      </div>
      {shouldOfferToggle ? (
        <button
          type="button"
          onClick={onToggle}
          style={{
            marginTop: 3,
            padding: 0,
            border: "none",
            background: "transparent",
            color: "var(--parapost-accent-text, #d8b4fe)",
            fontSize: 11.5,
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          {expanded ? "Less" : "More"}
        </button>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  const [content, setContent] = useState("");
  const [postImages, setPostImages] = useState<File[]>([]);
  const [postImagePreviewUrls, setPostImagePreviewUrls] = useState<string[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [sharedPostItems, setSharedPostItems] = useState<SharedPostItem[]>([]);
  const [sharedReelItems, setSharedReelItems] = useState<SharedReelItem[]>([]);
  const [liveFeedStreams, setLiveFeedStreams] = useState<DashboardLiveStreamItem[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, ProfilePreview>>({});
  const [currentProfile, setCurrentProfile] = useState<ProfilePreview | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingPosts, setFetchingPosts] = useState(true);
  const [feedMode, setFeedMode] = useState<FeedMode>("for_you");
  const [followedUserIds, setFollowedUserIds] = useState<string[]>([]);
  const [acceptedFriendUserIds, setAcceptedFriendUserIds] = useState<string[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [followingMap, setFollowingMap] = useState<FollowMap>({});
  const [likeCounts, setLikeCounts] = useState<CountMap>({});
  const [commentCounts, setCommentCounts] = useState<CountMap>({});
  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(null);
  const [commentsByPostId, setCommentsByPostId] = useState<Record<string, DashboardComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentsLoadingPostId, setCommentsLoadingPostId] = useState<string | null>(null);
  const [postingCommentPostId, setPostingCommentPostId] = useState<string | null>(null);
  const [dashboardCommentLikeCounts, setDashboardCommentLikeCounts] = useState<CountMap>({});
  const [dashboardCommentUserLikes, setDashboardCommentUserLikes] = useState<ToggleMap>({});
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [shareCounts, setShareCounts] = useState<CountMap>({});
  const [userLikes, setUserLikes] = useState<ToggleMap>({});
  const [openPostMenuId, setOpenPostMenuId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostContent, setEditingPostContent] = useState("");
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [parachatUnreadCount, setParachatUnreadCount] = useState(0);
  const [pendingFriendRequestCount, setPendingFriendRequestCount] = useState(0);
  const [recentlyViewed, setRecentlyViewed] = useState<ProfilePreview[]>([]);
  const [discoverProfiles, setDiscoverProfiles] = useState<ProfilePreview[]>([]);
  const [friendShowcases, setFriendShowcases] = useState<DashboardShowcaseItem[]>([]);
  const [selectedDashboardShowcase, setSelectedDashboardShowcase] = useState<DashboardShowcaseItem | null>(null);
  const [showcaseComposerOpen, setShowcaseComposerOpen] = useState(false);
  const [dashboardShowcaseTitle, setDashboardShowcaseTitle] = useState("");
  const [dashboardShowcaseCoverText, setDashboardShowcaseCoverText] = useState("");
  const [dashboardShowcaseDuration, setDashboardShowcaseDuration] = useState<ShowcaseDuration>("24h");
  const [dashboardShowcaseVisibility, setDashboardShowcaseVisibility] = useState<ShowcaseVisibility>("friends");
  const [dashboardShowcaseMediaFile, setDashboardShowcaseMediaFile] = useState<File | null>(null);
  const [dashboardShowcaseMediaPreviewUrl, setDashboardShowcaseMediaPreviewUrl] = useState("");
  const [dashboardShowcaseMediaType, setDashboardShowcaseMediaType] = useState<ShowcaseMediaType>("text");
  const [dashboardShowcaseMediaFileName, setDashboardShowcaseMediaFileName] = useState("");
  const [dashboardShowcaseFontKey, setDashboardShowcaseFontKey] = useState<ShowcaseFontValue>("inter");
  const [dashboardShowcaseOverlayFontSize, setDashboardShowcaseOverlayFontSize] = useState(SHOWCASE_OVERLAY_DEFAULT_FONT_SIZE);
  const [dashboardShowcaseTextPosition, setDashboardShowcaseTextPosition] = useState({ x: 50, y: 50 });
  const [dashboardShowcaseCustomizeOpen, setDashboardShowcaseCustomizeOpen] = useState(false);
  const [dashboardShowcasePreviewExpanded, setDashboardShowcasePreviewExpanded] = useState(false);
  const [dashboardShowcaseMediaDragActive, setDashboardShowcaseMediaDragActive] = useState(false);
  const [dashboardShowcaseError, setDashboardShowcaseError] = useState("");
  const [dashboardShowcaseSaving, setDashboardShowcaseSaving] = useState(false);
  const [feelingActivityOpen, setFeelingActivityOpen] = useState(false);
  const [selectedFeelingActivity, setSelectedFeelingActivity] = useState<FeelingActivityOption | null>(null);
  const [visibleFeedLimit, setVisibleFeedLimit] = useState(FEED_INITIAL_BATCH_SIZE);
  const [dashboardPostImageViewer, setDashboardPostImageViewer] = useState<DashboardPostImageViewer | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProfilePreview[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMenuInitialSection, setMobileMenuInitialSection] =
    useState<DashboardMobileMenuSection>("main");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dashboardShowcaseInputRef = useRef<HTMLInputElement | null>(null);
  const mainComposerRef = useRef<HTMLElement | null>(null);
  const feedLoadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedDashboardOnceRef = useRef(false);
  const dashboardRefreshInFlightRef = useRef(false);
  const removedSharedPostShareIdsRef = useRef<Set<string>>(new Set());
  const removedSharedPostKeysRef = useRef<Set<string>>(new Set());
  const removedReelShareIdsRef = useRef<Set<string>>(new Set());
  const removedReelShareKeysRef = useRef<Set<string>>(new Set());
  const targetedPostScrollRef = useRef("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const searchParams = new URLSearchParams(window.location.search);
    const requestedMenu = searchParams.get("menu");

    if (
     requestedMenu !== "main" &&
     requestedMenu !== "ads" &&
     requestedMenu !== "settingsAccount"
   ) return;

    const isMobileOrTablet = window.matchMedia("(max-width: 1180px)").matches;
    if (!isMobileOrTablet) return;

    setMobileMenuInitialSection(requestedMenu);
    setMobileMenuOpen(true);

    searchParams.delete("menu");
    const cleanSearch = searchParams.toString();
    const cleanUrl = `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", cleanUrl);
  }, []);

  const currentName = currentProfile?.full_name || currentProfile?.username || "there";
  const firstName = currentName.split(" ")[0] || "there";

  const openDashboardPostImageViewer = useCallback((url: string, alt: string) => {
    if (!url) return;
    setDashboardPostImageViewer({ url, alt: alt || "Post image" });
  }, []);

  const closeDashboardPostImageViewer = useCallback(() => {
    setDashboardPostImageViewer(null);
  }, []);

  const getDashboardPostForAction = useCallback(
    (postId: string) => {
      if (!postId) return null;

      const directPost = posts.find((post) => post.id === postId);
      if (directPost) return directPost;

      const sharedPost = sharedPostItems.find((item) => item.post_id === postId);
      return sharedPost?.original_post || null;
    },
    [posts, sharedPostItems]
  );

  const insertDashboardNotification = useCallback(
    async ({
      userId,
      actorId,
      type,
      postId,
      commentId = null,
      message,
    }: {
      userId?: string | null;
      actorId?: string | null;
      type: "post_share" | "comment_like";
      postId?: string | null;
      commentId?: string | null;
      message: string;
    }) => {
      if (!userId || !actorId || !type || userId === actorId) return;

      const { error } = await supabase.from("notifications").insert([
        {
          user_id: userId,
          actor_id: actorId,
          type,
          post_id: postId || null,
          comment_id: commentId || null,
          friend_request_id: null,
          message,
          is_read: false,
        },
      ]);

      if (error) {
        console.warn("Dashboard notification skipped:", error.message);
      }
    },
    []
  );

  const mixedFeedItems = useMemo<MixedFeedItem[]>(() => {
    const visiblePostsForViewer = posts.filter((post) => !blockedUserIds.includes(post.user_id));
    const visibleSharedPostItemsForViewer = sharedPostItems.filter(
      (sharedPost) =>
        !blockedUserIds.includes(sharedPost.user_id) &&
        !blockedUserIds.includes(sharedPost.original_post.user_id)
    );
    const visibleSharedReelItemsForViewer = sharedReelItems.filter(
      (share) =>
        !blockedUserIds.includes(share.user_id) &&
        !blockedUserIds.includes(share.reel_user_id) &&
        !blockedUserIds.includes(share.creator_profile_id || "")
    );
    const visibleLiveStreamItemsForViewer = liveFeedStreams.filter(
      (stream) =>
        !blockedUserIds.includes(stream.user_id) &&
        stream.visibility === "public" &&
        !stream.is_hidden &&
        (stream.status === "upcoming" || stream.status === "live" || stream.status === "ended")
    );

    const postItems = visiblePostsForViewer.map((post) => ({
      type: "post" as const,
      id: post.id,
      created_at: post.created_at,
      post,
    }));

    const sharedPostFeedItems = visibleSharedPostItemsForViewer.map((sharedPost) => ({
      type: "shared_post" as const,
      id: sharedPost.id,
      created_at: sharedPost.created_at,
      sharedPost,
    }));

    const reelShareItems = visibleSharedReelItemsForViewer.map((share) => ({
      type: "reel_share" as const,
      id: share.id,
      created_at: share.created_at,
      share,
    }));

    const liveStreamItems = visibleLiveStreamItemsForViewer.map((liveStream) => ({
      type: "live_stream" as const,
      id: liveStream.id,
      created_at: getDashboardLiveTimestamp(liveStream),
      liveStream,
    }));

    return [...postItems, ...sharedPostFeedItems, ...reelShareItems, ...liveStreamItems].sort(
      (a, b) => {
        const timeDifference =
          getDashboardFeedSortTime(b.created_at) -
          getDashboardFeedSortTime(a.created_at);

        if (timeDifference !== 0) return timeDifference;

        // If two activities have the exact same timestamp, keep fresh shares
        // ahead of ordinary posts so the action the user just completed is visible.
        const feedPriority: Record<MixedFeedItem["type"], number> = {
          reel_share: 4,
          shared_post: 3,
          live_stream: 2,
          post: 1,
        };

        return feedPriority[b.type] - feedPriority[a.type];
      }
    );
  }, [blockedUserIds, liveFeedStreams, posts, sharedPostItems, sharedReelItems]);

  const filteredFeedItems = useMemo(() => {
    if (feedMode === "friends" && currentUserId) {
      return mixedFeedItems.filter((item) => {
        const authorId =
          item.type === "post"
            ? item.post.user_id
            : item.type === "shared_post"
              ? item.sharedPost.user_id
              : item.type === "reel_share"
                ? item.share.user_id
                : item.liveStream.user_id;
        return acceptedFriendUserIds.includes(authorId);
      });
    }

    if (feedMode === "following" && currentUserId) {
      return mixedFeedItems.filter((item) => {
        const authorId =
          item.type === "post"
            ? item.post.user_id
            : item.type === "shared_post"
              ? item.sharedPost.user_id
              : item.type === "reel_share"
                ? item.share.user_id
                : item.liveStream.user_id;
        return followedUserIds.includes(authorId);
      });
    }

    return mixedFeedItems;
  }, [acceptedFriendUserIds, currentUserId, feedMode, followedUserIds, mixedFeedItems]);

  const visibleFeedItems = useMemo(() => {
    return filteredFeedItems.slice(0, visibleFeedLimit);
  }, [filteredFeedItems, visibleFeedLimit]);

  const hasMoreFeedItems = visibleFeedLimit < filteredFeedItems.length;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const hashPostId = window.location.hash.startsWith("#post-")
      ? window.location.hash.replace("#post-", "")
      : "";
    const targetPostId = params.get("post") || hashPostId;

    if (!targetPostId) return;

    const targetIndex = filteredFeedItems.findIndex((item) => {
      if (item.type === "post") return item.post.id === targetPostId;
      if (item.type === "shared_post") return item.sharedPost.post_id === targetPostId;
      return false;
    });

    if (targetIndex >= 0 && targetIndex >= visibleFeedLimit) {
      setVisibleFeedLimit(Math.min(targetIndex + 3, filteredFeedItems.length));
      return;
    }

    if (targetedPostScrollRef.current === targetPostId) return;

    let attempts = 0;
    const scrollToTargetPost = () => {
      attempts += 1;
      const target = document.getElementById(`post-${targetPostId}`);

      if (!target) {
        if (attempts < 12) {
          window.setTimeout(scrollToTargetPost, 180);
        }
        return;
      }

      targetedPostScrollRef.current = targetPostId;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    window.setTimeout(scrollToTargetPost, 160);
  }, [filteredFeedItems, visibleFeedLimit]);

  useEffect(() => {
    const handleDashboardEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      if (selectedDashboardShowcase) {
        setSelectedDashboardShowcase(null);
        return;
      }

      if (showcaseComposerOpen) {
        setShowcaseComposerOpen(false);
        setDashboardShowcaseError("");
        return;
      }

      if (feelingActivityOpen) {
        setFeelingActivityOpen(false);
        return;
      }

      if (mobileMenuOpen) {
        setMobileMenuOpen(false);
        return;
      }

      if (searchOpen) {
        setSearchOpen(false);
        setSearchQuery("");
        return;
      }

      if (openPostMenuId) {
        setOpenPostMenuId(null);
        return;
      }

      if (openCommentsPostId) {
        setOpenCommentsPostId(null);
      }
    };

    window.addEventListener("keydown", handleDashboardEscape);

    return () => {
      window.removeEventListener("keydown", handleDashboardEscape);
    };
  }, [
    feelingActivityOpen,
    mobileMenuOpen,
    openCommentsPostId,
    openPostMenuId,
    searchOpen,
    selectedDashboardShowcase,
    showcaseComposerOpen,
  ]);

  const totalLikes = useMemo(() => {
    return Object.values(likeCounts).reduce((sum, count) => sum + count, 0);
  }, [likeCounts]);

  const totalComments = useMemo(() => {
    return Object.values(commentCounts).reduce((sum, count) => sum + count, 0);
  }, [commentCounts]);

  const totalShares = useMemo(() => {
    return Object.values(shareCounts).reduce((sum, count) => sum + count, 0);
  }, [shareCounts]);

  const peopleToDiscover = useMemo(() => {
    return discoverProfiles
      .filter((profile) => profile.id && !blockedUserIds.includes(profile.id))
      .slice(0, 4);
  }, [blockedUserIds, discoverProfiles]);

  const visibleRecentlyViewed = useMemo(() => {
    return recentlyViewed.filter((profile) => profile.id && !blockedUserIds.includes(profile.id));
  }, [blockedUserIds, recentlyViewed]);

  const trendingTopics = useMemo(() => {
    return buildDashboardTrendingTopics(mixedFeedItems);
  }, [mixedFeedItems]);

  const fetchPeopleToDiscover = useCallback(async (userId?: string, blockedIds: string[] = []) => {
    if (!userId) {
      setDiscoverProfiles([]);
      return;
    }

    const [{ data: friendshipRows }, { data: followingRows }] = await Promise.all([
      supabase
        .from("friend_requests")
        .select("sender_id, receiver_id, status")
        .eq("status", "accepted")
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`),
      supabase
        .from("followers")
        .select("following_id")
        .eq("follower_id", userId),
    ]);

    const friendIds = new Set(
      (friendshipRows || [])
        .map((row) => (row.sender_id === userId ? row.receiver_id : row.sender_id))
        .filter(Boolean) as string[]
    );

    const followingIds = new Set(
      (followingRows || []).map((row) => row.following_id).filter(Boolean) as string[]
    );

    const hiddenIds = new Set<string>([
      userId,
      ...Array.from(friendIds),
      ...Array.from(followingIds),
      ...blockedIds,
    ]);

    const selectWithDates =
      "id, username, full_name, avatar_url, bio, location, is_online, last_seen_at, created_at, updated_at";

    let profilesData: ProfilePreview[] = [];

    const { data, error } = await supabase
      .from("profiles")
      .select(selectWithDates)
      .limit(160);

    if (error) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, bio, location, is_online, last_seen_at")
        .limit(80);

      if (fallbackError) {
        console.error("Error fetching People to Discover:", fallbackError.message);
        setDiscoverProfiles([]);
        return;
      }

      profilesData = (fallbackData || []) as ProfilePreview[];
    } else {
      profilesData = (data || []) as ProfilePreview[];
    }

    const nextProfiles = profilesData
      .filter((profile) => profile.id && !hiddenIds.has(profile.id))
      .filter(hasCompletedDiscoveryProfile)
      .sort((a, b) => getDiscoverySortTime(b) - getDiscoverySortTime(a))
      .slice(0, 12);

    setDiscoverProfiles(nextProfiles);
  }, []);

  const fetchProfileMap = useCallback(async (userIds: string[], blockedIds: string[] = []) => {
    const uniqueIds = [...new Set(userIds.filter((id) => Boolean(id) && !blockedIds.includes(id)))];
    if (uniqueIds.length === 0) {
      setProfilesMap({});
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, bio, location, is_online, last_seen_at")
      .in("id", uniqueIds);

    if (error) {
      console.error("Error fetching profiles:", error.message);
      return;
    }

    const nextMap: Record<string, ProfilePreview> = {};
    for (const profile of data || []) {
      nextMap[profile.id] = profile as ProfilePreview;
    }

    setProfilesMap((prev) => ({
      ...prev,
      ...nextMap,
    }));
  }, []);

  const updateDashboardCommentLikeState = useCallback(
    async (commentIds: string[], userId?: string | null) => {
      const safeCommentIds = [...new Set(commentIds.filter(Boolean))];

      if (safeCommentIds.length === 0) return;

      const { data, error } = await supabase
        .from("comment_likes")
        .select("comment_id, user_id")
        .in("comment_id", safeCommentIds);

      if (error) {
        console.warn("Could not load dashboard comment likes:", error.message);
        return;
      }

      const nextLikeCounts: CountMap = {};
      const nextUserLikes: ToggleMap = {};

      safeCommentIds.forEach((commentId) => {
        nextLikeCounts[commentId] = 0;
        nextUserLikes[commentId] = false;
      });

      for (const like of data || []) {
        const commentId = String(like.comment_id || "");
        if (!commentId) continue;

        nextLikeCounts[commentId] = (nextLikeCounts[commentId] || 0) + 1;

        if (userId && like.user_id === userId) {
          nextUserLikes[commentId] = true;
        }
      }

      setDashboardCommentLikeCounts((prev) => ({
        ...prev,
        ...nextLikeCounts,
      }));

      setDashboardCommentUserLikes((prev) => ({
        ...prev,
        ...nextUserLikes,
      }));
    },
    []
  );

  const handleToggleDashboardCommentLike = useCallback(
    async (commentId: string) => {
      if (!commentId) return;

      if (!currentUserId) {
        alert("You must be logged in to like a comment.");
        return;
      }

      const alreadyLiked = !!dashboardCommentUserLikes[commentId];

      setDashboardCommentUserLikes((prev) => ({
        ...prev,
        [commentId]: !alreadyLiked,
      }));

      setDashboardCommentLikeCounts((prev) => ({
        ...prev,
        [commentId]: alreadyLiked
          ? Math.max((prev[commentId] || 1) - 1, 0)
          : (prev[commentId] || 0) + 1,
      }));

      if (alreadyLiked) {
        const { error } = await supabase
          .from("comment_likes")
          .delete()
          .eq("user_id", currentUserId)
          .eq("comment_id", commentId);

        if (error) {
          setDashboardCommentUserLikes((prev) => ({
            ...prev,
            [commentId]: true,
          }));

          setDashboardCommentLikeCounts((prev) => ({
            ...prev,
            [commentId]: (prev[commentId] || 0) + 1,
          }));

          alert(`Unlike comment error: ${error.message}`);
        }

        return;
      }

      const { error } = await supabase.from("comment_likes").insert([
        {
          user_id: currentUserId,
          comment_id: commentId,
        },
      ]);

      if (error) {
        setDashboardCommentUserLikes((prev) => ({
          ...prev,
          [commentId]: false,
        }));

        setDashboardCommentLikeCounts((prev) => ({
          ...prev,
          [commentId]: Math.max((prev[commentId] || 1) - 1, 0),
        }));

        alert(`Like comment error: ${error.message}`);
        return;
      }

      const likedComment = Object.values(commentsByPostId)
        .flat()
        .find((comment) => comment.id === commentId);

      if (likedComment?.user_id && likedComment.user_id !== currentUserId) {
        await insertDashboardNotification({
          userId: likedComment.user_id,
          actorId: currentUserId,
          type: "comment_like",
          postId: likedComment.post_id,
          commentId,
          message: "liked your comment.",
        });
      }
    },
    [commentsByPostId, currentUserId, dashboardCommentUserLikes, insertDashboardNotification]
  );

  const fetchCounts = useCallback(async (userId: string | undefined, visiblePostIds: string[]) => {
    const safePostIds = visiblePostIds.length ? visiblePostIds : [EMPTY_UUID];

    const [{ data: likesData }, { data: commentsData }, { data: sharesData }] = await Promise.all([
      supabase.from("likes").select("post_id, user_id").in("post_id", safePostIds),
      supabase
        .from("comments")
        .select("id, post_id, user_id, content, created_at, is_hidden, parent_comment_id, reply_to_user_id")
        .in("post_id", safePostIds)
        .order("created_at", { ascending: true }),
      supabase.from("shares").select("post_id, share_destination, deleted_at").in("post_id", safePostIds),
    ]);

    const nextLikes: CountMap = {};
    const nextUserLikes: ToggleMap = {};
    for (const like of likesData || []) {
      if (!like.post_id) continue;
      nextLikes[like.post_id] = (nextLikes[like.post_id] || 0) + 1;
      if (userId && like.user_id === userId) nextUserLikes[like.post_id] = true;
    }

    const visibleComments = ((commentsData || []) as DashboardComment[]).filter(
      (comment) =>
        comment.post_id &&
        !comment.is_hidden &&
        !blockedUserIds.includes(comment.user_id)
    );

    const visibleCommentIds = visibleComments.map((comment) => comment.id).filter(Boolean);

    await updateDashboardCommentLikeState(visibleCommentIds, userId);

    const nextComments: CountMap = {};
    const nextCommentPreviews: Record<string, DashboardComment[]> = {};

    for (const comment of visibleComments) {
      if (!comment.post_id) continue;

      nextComments[comment.post_id] = (nextComments[comment.post_id] || 0) + 1;

      if (!nextCommentPreviews[comment.post_id]) {
        nextCommentPreviews[comment.post_id] = [];
      }

      nextCommentPreviews[comment.post_id].push(comment);
    }

    Object.keys(nextCommentPreviews).forEach((postId) => {
      nextCommentPreviews[postId] = nextCommentPreviews[postId].slice(-DASHBOARD_COMMENT_PREVIEW_LIMIT);
    });

    const commenterIds = [
      ...new Set(visibleComments.map((comment) => comment.user_id).filter(Boolean)),
    ];

    if (commenterIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, bio, location, is_online, last_seen_at")
        .in("id", commenterIds);

      if (!profileError && profileRows) {
        const nextProfiles: Record<string, ProfilePreview> = {};

        for (const profile of profileRows as ProfilePreview[]) {
          if (profile.id) nextProfiles[profile.id] = profile;
        }

        setProfilesMap((prev) => ({
          ...prev,
          ...nextProfiles,
        }));
      }
    }

    const nextShares: CountMap = {};
    for (const share of sharesData || []) {
      if (!share.post_id) continue;
      if (share.deleted_at) continue;
      if (share.share_destination && share.share_destination !== "feed") continue;
      nextShares[share.post_id] = (nextShares[share.post_id] || 0) + 1;
    }

    setLikeCounts(nextLikes);
    setUserLikes(nextUserLikes);
    setCommentCounts(nextComments);
    setShareCounts(nextShares);
    setCommentsByPostId((prev) => {
      const next = { ...prev };

      safePostIds.forEach((postId) => {
        if (!postId || postId === EMPTY_UUID) return;

        const previewComments = nextCommentPreviews[postId] || [];
        const currentComments = next[postId] || [];

        if (currentComments.length > previewComments.length) return;

        next[postId] = previewComments;
      });

      return next;
    });
  }, [blockedUserIds, updateDashboardCommentLikeState]);

  const fetchFollowData = useCallback(async (userId?: string) => {
    if (!userId) {
      setFollowedUserIds([]);
      setFollowingMap({});
      return [] as string[];
    }

    const { data, error } = await supabase
      .from("followers")
      .select("following_id")
      .eq("follower_id", userId);

    if (error) {
      console.error("Error fetching following list:", error.message);
      setFollowedUserIds([]);
      setFollowingMap({});
      return [] as string[];
    }

    const ids = (data || []).map((row) => row.following_id).filter(Boolean) as string[];
    const nextMap: FollowMap = {};
    ids.forEach((id) => {
      nextMap[id] = true;
    });

    setFollowedUserIds(ids);
    setFollowingMap(nextMap);
    return ids;
  }, []);

  const fetchNotifications = useCallback(async (userId?: string) => {
    if (!userId) {
      setNotificationsCount(0);
      setParachatUnreadCount(0);
      setPendingFriendRequestCount(0);
      return;
    }

    const [
      { count: unreadCount, error: unreadError },
      { count: parachatCount, error: parachatError },
      { count: requestCount, error: requestError },
    ] = await Promise.all([
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false)
        .in("type", ["parachat_message", "parachat_photo"]),
      supabase
        .from("friend_requests")
        .select("*", { count: "exact", head: true })
        .eq("receiver_id", userId)
        .eq("status", "pending"),
    ]);

    if (unreadError) {
      logDashboardNetworkIssue("Dashboard notification badge refresh skipped", unreadError);
    } else {
      setNotificationsCount(unreadCount || 0);
    }

    if (parachatError) {
      logDashboardNetworkIssue("Dashboard Parachat badge refresh skipped", parachatError);
    } else {
      setParachatUnreadCount(parachatCount || 0);
    }

    if (requestError) {
      logDashboardNetworkIssue("Dashboard friend-request badge refresh skipped", requestError);
    } else {
      setPendingFriendRequestCount(requestCount || 0);
    }
  }, []);

  const fetchFriendShowcases = useCallback(async (userId?: string, blockedIds: string[] = []) => {
    if (!userId) {
      setAcceptedFriendUserIds([]);
      setFriendShowcases([]);
      return [] as DashboardShowcaseItem[];
    }

    const { data: friendshipRows, error: friendshipError } = await supabase
      .from("friend_requests")
      .select("sender_id, receiver_id, status")
      .eq("status", "accepted")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

    if (friendshipError) {
      console.error("Error fetching dashboard friend showcase relationships:", friendshipError.message);
      setAcceptedFriendUserIds([]);
      setFriendShowcases([]);
      return [] as DashboardShowcaseItem[];
    }

    const friendIds = [
      ...new Set(
        (friendshipRows || [])
          .map((row) => (row.sender_id === userId ? row.receiver_id : row.sender_id))
          .filter((id) => Boolean(id) && !blockedIds.includes(String(id)))
      ),
    ] as string[];

    setAcceptedFriendUserIds(friendIds);
    setFriendShowcases([]);

    // Showcases are paused for launch. Keep friend IDs for the Friends feed,
    // but do not query profile_showcases until this feature is released again.
    return [] as DashboardShowcaseItem[];

    // Keep the same visibility rules, but do not make Showcase bubbles wait for profile lookups.
    const showcaseUserIds = [
      ...new Set([userId, ...friendIds].filter((id) => Boolean(id) && !blockedIds.includes(String(id)))),
    ] as string[];

    if (showcaseUserIds.length === 0) {
      setFriendShowcases([]);
      return [] as DashboardShowcaseItem[];
    }

    const { data: showcaseData, error: showcaseError } = await supabase
      .from("profile_showcases")
      .select("id, user_id, title, cover_text, media_url, media_type, media_filename, font_key, text_position_x, text_position_y, overlay_font_size, duration, visibility, expires_at, created_at")
      .in("user_id", showcaseUserIds)
      .order("created_at", { ascending: false })
      .limit(24);

    if (showcaseError) {
      console.error("Error fetching dashboard friend showcases:", getDashboardErrorMessage(showcaseError));
      setFriendShowcases([]);
      return [] as DashboardShowcaseItem[];
    }

    const now = Date.now();
    const nextItems = ((showcaseData || []) as Array<{
      id: string;
      user_id: string;
      title: string | null;
      cover_text: string | null;
      media_url: string | null;
      media_type: string | null;
      media_filename?: string | null;
      font_key?: string | null;
      text_position_x?: number | string | null;
      text_position_y?: number | string | null;
      overlay_font_size?: number | null;
      duration?: string | null;
      visibility: string | null;
      expires_at: string | null;
      created_at: string | null;
    }>)
      .filter((item) => item.user_id && showcaseUserIds.includes(item.user_id))
      .filter((item) => !blockedIds.includes(item.user_id))
      .filter((item) => item.user_id === userId || item.visibility !== "private")
      .filter((item) => !item.expires_at || new Date(item.expires_at).getTime() > now)
      .map((item) => ({
        ...item,
        profile: null,
      })) as DashboardShowcaseItem[];

    // First paint: show the Showcase row as soon as Showcase rows arrive.
    setFriendShowcases(nextItems);

    const profileIds = [...new Set(nextItems.map((item) => item.user_id).filter(Boolean))].slice(0, 24);

    if (profileIds.length > 0) {
      void (async () => {
        try {
          const { data: profilesData, error: profilesError } = await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url, bio, location, is_online, last_seen_at")
            .in("id", profileIds)
            .limit(24);

          if (profilesError) {
            logDashboardNetworkIssue("Dashboard showcase profile enrichment skipped", profilesError);
            return;
          }

          const profileMap = new Map<string, ProfilePreview>();
          for (const profile of (profilesData || []) as ProfilePreview[]) {
            profileMap.set(profile.id, profile);
          }

          setFriendShowcases((currentItems) =>
            currentItems.map((item) => ({
              ...item,
              profile: profileMap.get(item.user_id) || item.profile || null,
            }))
          );

          setSelectedDashboardShowcase((currentShowcase) => {
            if (!currentShowcase) return currentShowcase;
            const enrichedProfile = profileMap.get(currentShowcase.user_id);
            return enrichedProfile ? { ...currentShowcase, profile: enrichedProfile } : currentShowcase;
          });
        } catch (error) {
          logDashboardNetworkIssue("Dashboard showcase profile enrichment skipped", error);
        }
      })();
    }

    return nextItems;
  }, []);

  const fetchRecentlyViewed = useCallback(async (userId?: string, blockedIds: string[] = []) => {
    if (!userId) {
      setRecentlyViewed([]);
      return;
    }

    const { data, error } = await supabase
      .from("recently_viewed_profiles")
      .select("profile_id, viewed_at, profiles:profile_id(id, username, full_name, avatar_url, bio, location, is_online, last_seen_at)")
      .eq("viewer_id", userId)
      .order("viewed_at", { ascending: false })
      .limit(6);

    if (error) {
      console.error("Error fetching recently viewed:", error.message);
      setRecentlyViewed([]);
      return;
    }

    const rows = (data || []) as Array<{ profiles?: ProfilePreview | ProfilePreview[] | null }>;
    const profiles = rows
      .map((row) => (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles))
      .filter(Boolean)
      .filter((profile) => !blockedIds.includes((profile as ProfilePreview).id)) as ProfilePreview[];

    setRecentlyViewed(profiles);
  }, []);

  const fetchSharedPosts = useCallback(async (blockedIds: string[] = []) => {
    const { data: shareRows, error: shareError } = await supabase
      .from("shares")
      .select("id, post_id, user_id, caption, created_at, share_destination, deleted_at")
      .eq("share_destination", "feed")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(120);

    if (shareError) {
      console.error("Error fetching shared posts:", shareError.message);
      setSharedPostItems([]);
      return [] as SharedPostItem[];
    }

    const visibleShareRows = ((shareRows || []) as Array<{
      id: string;
      post_id: string | null;
      user_id: string | null;
      caption: string | null;
      created_at: string | null;
    }>)
      .filter((share) => Boolean(share.post_id && share.user_id && share.created_at))
      .filter((share) => !removedSharedPostShareIdsRef.current.has(String(share.id)))
      .filter((share) => !removedSharedPostKeysRef.current.has(`${share.user_id}:${share.post_id}`))
      .filter((share) => !blockedIds.includes(String(share.user_id)));

    const postIds = [...new Set(visibleShareRows.map((share) => String(share.post_id)).filter(Boolean))];

    if (postIds.length === 0) {
      setSharedPostItems([]);
      return [] as SharedPostItem[];
    }

    const { data: postRows, error: postsError } = await supabase
      .from("posts")
      .select("id, content, image_url, created_at, user_id")
      .in("id", postIds);

    if (postsError) {
      console.error("Error fetching shared post originals:", postsError.message);
      setSharedPostItems([]);
      return [] as SharedPostItem[];
    }

    const sharedPostImagesMap = await fetchPostImagesMap(((postRows || []) as Post[]).map((post) => post.id));
    const postMap = new Map<string, Post>();
    for (const post of (postRows || []) as Post[]) {
      if (!post?.id || blockedIds.includes(post.user_id)) continue;
      postMap.set(post.id, {
        ...post,
        images: sharedPostImagesMap[post.id] || [],
      });
    }

    const nextSharedPosts = visibleShareRows
      .map((share) => {
        const originalPost = postMap.get(String(share.post_id));
        if (!originalPost) return null;

        return {
          id: share.id,
          post_id: String(share.post_id),
          user_id: String(share.user_id),
          caption: share.caption || null,
          created_at: String(share.created_at),
          original_post: originalPost,
        } satisfies SharedPostItem;
      })
      .filter(Boolean) as SharedPostItem[];

    setSharedPostItems(nextSharedPosts);
    return nextSharedPosts;
  }, []);

  const fetchSharedReels = useCallback(async (blockedIds: string[] = []) => {
    const { data: shareRows, error: shareError } = await supabase
      .from("reel_shares")
      .select("id, reel_id, user_id, caption, created_at")
      .order("created_at", { ascending: false })
      .limit(60);

    if (shareError) {
      console.error("Error fetching reel shares:", shareError.message);
      setSharedReelItems([]);
      return [] as SharedReelItem[];
    }

    const visibleShareRows = (shareRows || [])
      .filter((share) => !removedReelShareIdsRef.current.has(String(share.id)))
      .filter((share) => !removedReelShareKeysRef.current.has(`${share.user_id}:${share.reel_id}`))
      .filter((share) => !blockedIds.includes(share.user_id));
    const reelIds = [...new Set(visibleShareRows.map((share) => share.reel_id).filter(Boolean))];

    if (reelIds.length === 0) {
      setSharedReelItems([]);
      return [] as SharedReelItem[];
    }

    const { data: reelRows, error: reelsError } = await supabase
      .from("reels")
      .select("id, user_id, creator_profile_id, title, caption, video_url, poster_url")
      .in("id", reelIds);

    if (reelsError) {
      console.error("Error fetching shared reels:", reelsError.message);
      setSharedReelItems([]);
      return [] as SharedReelItem[];
    }

    const reelMap = new Map<string, any>();
    for (const reel of reelRows || []) reelMap.set(reel.id, reel);

    const nextShared = visibleShareRows
      .map((share) => {
        const reel = reelMap.get(share.reel_id);
        if (!reel || !reel.video_url || !reel.user_id) return null;
        if (blockedIds.includes(reel.user_id)) return null;

        return {
          id: share.id,
          reel_id: share.reel_id,
          user_id: share.user_id,
          caption: share.caption || null,
          created_at: share.created_at,
          reel_title: reel.title || "Untitled Reel",
          reel_caption: reel.caption || null,
          reel_video_url: reel.video_url,
          reel_poster_url: reel.poster_url || null,
          reel_user_id: reel.user_id,
          creator_profile_id: reel.creator_profile_id || null,
        } satisfies SharedReelItem;
      })
      .filter(Boolean) as SharedReelItem[];

    setSharedReelItems(nextShared);
    return nextShared;
  }, []);

  const fetchLiveFeedStreams = useCallback(async (blockedIds: string[] = []) => {
    const { data, error } = await supabase
      .from("live_streams")
      .select(DASHBOARD_LIVE_SELECT)
      .eq("visibility", "public")
      .eq("is_hidden", false)
      .in("status", ["upcoming", "live", "ended"])
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) {
      console.error("Error fetching live feed streams:", error.message);
      setLiveFeedStreams([]);
      return [] as DashboardLiveStreamItem[];
    }

    const streamRows = ((data || []) as Omit<DashboardLiveStreamItem, "profile">[])
      .filter((stream) => Boolean(stream.id && stream.user_id))
      .filter((stream) => !blockedIds.includes(stream.user_id))
      .filter((stream) => stream.status === "upcoming" || stream.status === "live" || stream.status === "ended");

    const liveProfileIds = [...new Set(streamRows.map((stream) => stream.user_id).filter(Boolean))];

    let liveProfiles: ProfilePreview[] = [];

    if (liveProfileIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, bio, location, is_online, last_seen_at")
        .in("id", liveProfileIds);

      if (!profileError) {
        liveProfiles = (profileRows as ProfilePreview[]) || [];
      }
    }

    const liveProfileMap = new Map(liveProfiles.map((profile) => [profile.id, profile]));

    const nextStreams = streamRows.map((stream) => ({
      ...stream,
      profile: liveProfileMap.get(stream.user_id) || null,
    })) as DashboardLiveStreamItem[];

    setLiveFeedStreams(nextStreams);
    return nextStreams;
  }, []);

  const fetchDashboardData = useCallback(async (showFeedLoading = false) => {
    if (dashboardRefreshInFlightRef.current) return;

    dashboardRefreshInFlightRef.current = true;

    const shouldShowFeedLoading = showFeedLoading || !hasLoadedDashboardOnceRef.current;
    if (shouldShowFeedLoading) setFetchingPosts(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      let userId = "";
      let blockedIds: string[] = [];

      if (!userError && user) {
        userId = user.id;
        setCurrentUserId(user.id);
        setUserEmail(user.email || "");

        // Presence is useful, but it should never block the feed from appearing.
        void supabase
          .from("profiles")
          .update({ is_online: true, last_seen_at: new Date().toISOString() })
          .eq("id", user.id)
          .then(({ error }) => {
            if (error) logDashboardNetworkIssue("Dashboard presence update skipped", error);
          });

        const [{ data: profileData }, { data: blocksData, error: blocksError }] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url, bio, location, is_online, last_seen_at")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("blocked_users")
            .select("blocker_id, blocked_id")
            .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
        ]);

        setCurrentProfile((profileData as ProfilePreview | null) || null);

        if (blocksError) {
          logDashboardNetworkIssue("Dashboard blocked users skipped", blocksError);
          blockedIds = [];
        } else {
          blockedIds = buildDashboardBlockedUserIds((blocksData as BlockedUserRow[]) || [], user.id);
        }

        setBlockedUserIds(blockedIds);

        // Start these immediately, but do not make the timeline wait for them.
        void fetchFollowData(user.id).catch((error) => logDashboardNetworkIssue("Dashboard following skipped", error));
        void fetchNotifications(user.id).catch((error) => logDashboardNetworkIssue("Dashboard notifications skipped", error));
        void fetchRecentlyViewed(user.id, blockedIds).catch((error) => logDashboardNetworkIssue("Dashboard recently viewed skipped", error));
        void fetchPeopleToDiscover(user.id, blockedIds).catch((error) => logDashboardNetworkIssue("Dashboard discover skipped", error));
        void fetchFriendShowcases(user.id, blockedIds).catch((error) => logDashboardNetworkIssue("Dashboard showcases skipped", error));
      } else {
        setCurrentUserId("");
        setUserEmail("");
        setCurrentProfile(null);
        setBlockedUserIds([]);
        setFollowedUserIds([]);
        setFollowingMap({});
        setNotificationsCount(0);
        setParachatUnreadCount(0);
        setPendingFriendRequestCount(0);
        setRecentlyViewed([]);
        setFriendShowcases([]);
        setDiscoverProfiles([]);
      }

      const { data: postsData, error: postsError } = await supabase
        .from("posts")
        .select("id, content, image_url, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(80);

      if (postsError) {
        console.error("Error fetching posts:", postsError.message);
        if (!hasLoadedDashboardOnceRef.current) setPosts([]);
        return;
      }

      const visiblePostsBase = ((postsData || []) as Post[]).filter((post) => !blockedIds.includes(post.user_id));
      const firstVisiblePostIds = visiblePostsBase.slice(0, FEED_INITIAL_BATCH_SIZE).map((post) => post.id);
      const firstVisibleProfileIds = [
        userId,
        ...visiblePostsBase.slice(0, FEED_INITIAL_BATCH_SIZE).map((post) => post.user_id),
      ];

      // First paint: show the timeline as soon as the post rows arrive.
      // Images, shared posts, live cards, profile maps, and counts continue below.
      setPosts(visiblePostsBase.map((post) => ({ ...post, images: [] })));
      hasLoadedDashboardOnceRef.current = true;
      setFetchingPosts(false);

      void fetchProfileMap(firstVisibleProfileIds, blockedIds).catch((error) =>
        logDashboardNetworkIssue("Dashboard first profile map skipped", error)
      );
      void fetchCounts(userId || undefined, firstVisiblePostIds).catch((error) =>
        logDashboardNetworkIssue("Dashboard first counts skipped", error)
      );

      const postImagesTask = fetchPostImagesMap(visiblePostsBase.map((post) => post.id))
        .then((postImagesMap) => {
          setPosts((currentPosts) =>
            currentPosts.map((post) => ({
              ...post,
              images: postImagesMap[post.id] || post.images || [],
            }))
          );
        })
        .catch((error) => logDashboardNetworkIssue("Dashboard post images skipped", error));

      const feedExtrasTask = Promise.all([
        fetchSharedPosts(blockedIds),
        fetchSharedReels(blockedIds),
        fetchLiveFeedStreams(blockedIds),
      ])
        .then(([visibleSharedPosts, visibleShared, visibleLiveStreams]) => {
          const profileIds = [
            userId,
            ...visiblePostsBase.map((post) => post.user_id),
            ...visibleSharedPosts.map((share) => share.user_id),
            ...visibleSharedPosts.map((share) => share.original_post.user_id),
            ...visibleShared.map((share) => share.user_id),
            ...visibleShared.map((share) => share.reel_user_id),
            ...visibleShared.map((share) => share.creator_profile_id || ""),
            ...visibleLiveStreams.map((stream) => stream.user_id),
          ];

          const countPostIds = [
            ...new Set([
              ...visiblePostsBase.map((post) => post.id),
              ...visibleSharedPosts.map((share) => share.post_id),
            ]),
          ];

          return Promise.all([
            fetchProfileMap(profileIds, blockedIds),
            fetchCounts(userId || undefined, countPostIds),
          ]);
        })
        .catch((error) => logDashboardNetworkIssue("Dashboard feed extras skipped", error));

      await Promise.allSettled([postImagesTask, feedExtrasTask]);
    } catch (error) {
      // Supabase/network hiccups can throw TypeError: Failed to fetch.
      // Keep the current timeline on screen and avoid logging raw TypeError objects.
      logDashboardNetworkIssue("Dashboard refresh skipped", error);
    } finally {
      hasLoadedDashboardOnceRef.current = true;
      dashboardRefreshInFlightRef.current = false;
      setFetchingPosts(false);
    }
  }, [fetchCounts, fetchFollowData, fetchFriendShowcases, fetchLiveFeedStreams, fetchNotifications, fetchPeopleToDiscover, fetchProfileMap, fetchRecentlyViewed, fetchSharedPosts, fetchSharedReels]);

  useEffect(() => {
    void fetchDashboardData(true);
  }, [fetchDashboardData]);

  useEffect(() => {
    if (!currentUserId || typeof window === "undefined") return;

    let cancelled = false;

    const updatePresence = async (isOnline: boolean) => {
      if (cancelled || !currentUserId) return;

      try {
        await supabase
          .from("profiles")
          .update({ is_online: isOnline, last_seen_at: new Date().toISOString() })
          .eq("id", currentUserId);
      } catch {
        // Presence updates should never interrupt the dashboard.
      }
    };

    const markOnlineIfVisible = () => {
      if (!shouldRunDashboardNetworkRefresh()) return;
      void updatePresence(true);
    };

    void updatePresence(true);

    const heartbeatId = window.setInterval(markOnlineIfVisible, 45000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        markOnlineIfVisible();
        return;
      }

      void updatePresence(false);
    };

    const handlePageHide = () => {
      void updatePresence(false);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [currentUserId]);


  useEffect(() => {
    setVisibleFeedLimit(FEED_INITIAL_BATCH_SIZE);
  }, [feedMode]);

  useEffect(() => {
    if (!hasMoreFeedItems) return;

    const target = feedLoadMoreSentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (!firstEntry?.isIntersecting) return;

        setVisibleFeedLimit((currentLimit) =>
          Math.min(currentLimit + FEED_BATCH_INCREMENT, filteredFeedItems.length)
        );
      },
      {
        root: null,
        rootMargin: "900px 0px 900px 0px",
        threshold: 0,
      }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [filteredFeedItems.length, hasMoreFeedItems]);

  useEffect(() => {
    if (!currentUserId) return;

    let refreshTimer: number | null = null;

    const requestDashboardRefresh = () => {
      if (!shouldRunDashboardNetworkRefresh()) return;
      if (dashboardRefreshInFlightRef.current) return;
      void fetchDashboardData(false);
    };

    const schedulePulseRefresh = () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }

      refreshTimer = window.setTimeout(
        requestDashboardRefresh,
        DASHBOARD_REALTIME_REFRESH_DELAY_MS
      );
    };

    const channel = supabase
      .channel(`dashboard-network-pulse-${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, schedulePulseRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "shares" }, schedulePulseRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, schedulePulseRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, schedulePulseRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "followers" }, schedulePulseRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, schedulePulseRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${currentUserId}` }, schedulePulseRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, schedulePulseRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "reel_shares" }, schedulePulseRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_streams" }, schedulePulseRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "recently_viewed_profiles" }, schedulePulseRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "blocked_users" }, schedulePulseRefresh)
      .subscribe();

    const intervalId = window.setInterval(requestDashboardRefresh, DASHBOARD_BACKGROUND_REFRESH_MS);

    const handleFocusRefresh = () => {
      schedulePulseRefresh();
    };

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === "visible") {
        schedulePulseRefresh();
      }
    };

    window.addEventListener("focus", handleFocusRefresh);
    document.addEventListener("visibilitychange", handleVisibilityRefresh);

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocusRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, fetchDashboardData]);

  useEffect(() => {
    if (!currentUserId || typeof window === "undefined") return;

    let badgeRefreshTimer: number | null = null;

    const refreshNotificationBadges = () => {
      if (!shouldRunDashboardNetworkRefresh()) return;
      void fetchNotifications(currentUserId);
    };

    const scheduleNotificationBadgeRefresh = () => {
      if (badgeRefreshTimer) {
        window.clearTimeout(badgeRefreshTimer);
      }

      badgeRefreshTimer = window.setTimeout(refreshNotificationBadges, 180);
    };

    const notificationBadgeChannel = supabase
      .channel(`dashboard-notification-badges-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${currentUserId}`,
        },
        scheduleNotificationBadgeRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friend_requests",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        scheduleNotificationBadgeRefresh
      )
      .subscribe();

    const badgeIntervalId = window.setInterval(refreshNotificationBadges, 8000);

    const handleBadgeFocusRefresh = () => {
      refreshNotificationBadges();
    };

    const handleBadgeVisibilityRefresh = () => {
      if (document.visibilityState === "visible") {
        refreshNotificationBadges();
      }
    };

    refreshNotificationBadges();

    window.addEventListener("focus", handleBadgeFocusRefresh);
    document.addEventListener("visibilitychange", handleBadgeVisibilityRefresh);

    return () => {
      if (badgeRefreshTimer) window.clearTimeout(badgeRefreshTimer);
      window.clearInterval(badgeIntervalId);
      window.removeEventListener("focus", handleBadgeFocusRefresh);
      document.removeEventListener("visibilitychange", handleBadgeVisibilityRefresh);
      void supabase.removeChannel(notificationBadgeChannel);
    };
  }, [currentUserId, fetchNotifications]);

  useEffect(() => {
    if (postImages.length === 0) {
      setPostImagePreviewUrls([]);
      return;
    }

    const objectUrls = postImages.map((file) => URL.createObjectURL(file));
    setPostImagePreviewUrls(objectUrls);

    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [postImages]);

  useEffect(() => {
    if (!dashboardShowcaseMediaFile) {
      setDashboardShowcaseMediaPreviewUrl("");
      setDashboardShowcaseMediaFileName("");
      setDashboardShowcaseMediaType("text");
      return;
    }

    let cancelled = false;
    const reader = new FileReader();

    reader.onload = () => {
      if (cancelled) return;
      const result = typeof reader.result === "string" ? reader.result : "";
      setDashboardShowcaseMediaPreviewUrl(result);
      setDashboardShowcaseMediaFileName(dashboardShowcaseMediaFile.name);
      setDashboardShowcaseMediaType(
        dashboardShowcaseMediaFile.type.startsWith("video/") ? "video" : "image"
      );
    };

    reader.onerror = () => {
      if (cancelled) return;
      setDashboardShowcaseError("Could not preview this Showcase media. Try another file.");
    };

    reader.readAsDataURL(dashboardShowcaseMediaFile);

    return () => {
      cancelled = true;
    };
  }, [dashboardShowcaseMediaFile]);

  useEffect(() => {
    const handleGlobalClick = () => setOpenPostMenuId(null);
    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("scroll", handleGlobalClick);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("scroll", handleGlobalClick);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSearchOpen(false);
      setFeelingActivityOpen(false);
      setOpenPostMenuId(null);
      setOpenCommentsPostId(null);
      setMobileMenuOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();

    if (query.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setSearchLoading(true);
      const safeQuery = query.replace(/[,%]/g, "").slice(0, 40);

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url, bio, location, is_online, last_seen_at")
          .or(`username.ilike.%${safeQuery}%,full_name.ilike.%${safeQuery}%`)
          .limit(8);

        if (error) {
          logDashboardNetworkIssue("Dashboard search skipped", error);
          setSearchResults([]);
          return;
        }

        const nextResults = ((data || []) as ProfilePreview[]).filter(
          (profile) =>
            profile.id &&
            profile.id !== currentUserId &&
            !blockedUserIds.includes(profile.id)
        );

        setSearchResults(nextResults);
      } catch (error) {
        logDashboardNetworkIssue("Dashboard search skipped", error);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 240);

    return () => window.clearTimeout(timeout);
  }, [blockedUserIds, currentUserId, searchQuery]);

  const getActiveDashboardUserId = useCallback(async () => {
    if (currentUserId) return currentUserId;

    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) return "";

      setCurrentUserId(user.id);
      setUserEmail(user.email || "");

      if (!currentProfile) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url, bio, location, is_online, last_seen_at")
          .eq("id", user.id)
          .maybeSingle();

        setCurrentProfile((profileData as ProfilePreview | null) || null);
      }

      return user.id;
    } catch (error) {
      logDashboardNetworkIssue("Dashboard auth check skipped", error);
      return "";
    }
  }, [currentProfile, currentUserId]);

  const handleOpenDashboardShowcaseComposer = async () => {
    alert("Showcases are coming soon. We are improving this feature before release.");
    setShowcaseComposerOpen(false);
    setDashboardShowcaseError("");
  };

  const handleCloseDashboardShowcaseComposer = () => {
    if (dashboardShowcaseSaving) return;

    setShowcaseComposerOpen(false);
    setDashboardShowcaseTitle("");
    setDashboardShowcaseCoverText("");
    setDashboardShowcaseDuration("24h");
    setDashboardShowcaseVisibility("friends");
    setDashboardShowcaseMediaFile(null);
    setDashboardShowcaseMediaPreviewUrl("");
    setDashboardShowcaseMediaType("text");
    setDashboardShowcaseMediaFileName("");
    setDashboardShowcaseFontKey("inter");
    setDashboardShowcaseOverlayFontSize(SHOWCASE_OVERLAY_DEFAULT_FONT_SIZE);
    setDashboardShowcaseTextPosition({ x: 50, y: 50 });
    setDashboardShowcaseCustomizeOpen(false);
    setDashboardShowcasePreviewExpanded(false);
    setDashboardShowcaseMediaDragActive(false);
    setDashboardShowcaseError("");

    if (dashboardShowcaseInputRef.current) {
      dashboardShowcaseInputRef.current.value = "";
    }
  };

  const setDashboardShowcaseMediaFromFile = (file: File | null) => {
    setDashboardShowcaseError("");
    setDashboardShowcaseMediaDragActive(false);
    setDashboardShowcaseMediaFile(file);
  };

  const handleDashboardShowcaseMediaChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setDashboardShowcaseMediaFromFile(file);
  };

  const handleDashboardShowcaseMediaDrop = (event: ReactDragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer.files?.[0] || null;
    setDashboardShowcaseMediaFromFile(file);
  };

  const handleDashboardShowcaseMediaDragOver = (event: ReactDragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDashboardShowcaseMediaDragActive(true);
  };

  const handleDashboardShowcaseMediaDragLeave = (event: ReactDragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDashboardShowcaseMediaDragActive(false);
  };

  const handleClearDashboardShowcaseMedia = () => {
    setDashboardShowcaseMediaFile(null);
    setDashboardShowcaseMediaPreviewUrl("");
    setDashboardShowcaseMediaType("text");
    setDashboardShowcaseMediaFileName("");
    setDashboardShowcaseMediaDragActive(false);
    if (dashboardShowcaseInputRef.current) {
      dashboardShowcaseInputRef.current.value = "";
    }
  };

  const handleCreateDashboardShowcase = async () => {
    setDashboardShowcaseError("Showcases are coming soon. We are improving this feature before release.");
    setShowcaseComposerOpen(false);
    return;

    const activeUserId = await getActiveDashboardUserId();

    if (!activeUserId) {
      setDashboardShowcaseError("Please sign in to create a Showcase.");
      return;
    }

    const cleanTitle = dashboardShowcaseTitle.trim();
    const cleanCoverText = dashboardShowcaseCoverText.trim();
    const savedTitle = cleanTitle || "Showcase";
    const safeCoverText =
      cleanCoverText &&
      normalizeDashboardShowcaseComparableText(cleanCoverText) !== normalizeDashboardShowcaseComparableText(savedTitle)
        ? cleanCoverText
        : "";

    if (!cleanTitle && !cleanCoverText && !dashboardShowcaseMediaPreviewUrl) {
      setDashboardShowcaseError("Add a title, text, photo, or video first.");
      return;
    }

    setDashboardShowcaseSaving(true);
    setDashboardShowcaseError("");

    try {
      const now = Date.now();
      const expiresAt =
        dashboardShowcaseDuration === "24h"
          ? new Date(now + 24 * 60 * 60 * 1000).toISOString()
          : dashboardShowcaseDuration === "30d"
            ? new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString()
            : null;

      const insertPayload = {
        user_id: activeUserId,
        title: savedTitle,
        cover_text: safeCoverText || null,
        media_url: dashboardShowcaseMediaPreviewUrl || null,
        media_type: dashboardShowcaseMediaPreviewUrl ? dashboardShowcaseMediaType : "text",
        media_filename: dashboardShowcaseMediaFileName || null,
        font_key: dashboardShowcaseFontKey,
        text_position_x: dashboardShowcaseTextPosition.x,
        text_position_y: dashboardShowcaseTextPosition.y,
        overlay_font_size: clampShowcaseOverlayFontSize(dashboardShowcaseOverlayFontSize),
        duration: dashboardShowcaseDuration,
        visibility: dashboardShowcaseVisibility,
        expires_at: expiresAt,
      };

      const { data, error } = await supabase
        .from("profile_showcases")
        .insert(insertPayload)
        .select(
          "id,user_id,title,cover_text,media_url,media_type,media_filename,font_key,text_position_x,text_position_y,overlay_font_size,duration,visibility,expires_at,created_at"
        )
        .single();

      if (error || !data) {
        console.error("Could not create dashboard Showcase:", error);
        setDashboardShowcaseError(
          `Could not create Showcase: ${error?.message || "No data returned."}`
        );
        return;
      }

      const createdShowcase: DashboardShowcaseItem = {
        ...(data as Omit<DashboardShowcaseItem, "profile">),
        profile: currentProfile,
      };

      setFriendShowcases((prev) => [
        createdShowcase,
        ...prev.filter((item) => item.id !== createdShowcase.id),
      ]);

      void fetchFriendShowcases(activeUserId);

      handleCloseDashboardShowcaseComposer();
    } catch (error: unknown) {
      const message = getDashboardErrorMessage(error);
      console.error("Could not create dashboard Showcase:", message);
      setDashboardShowcaseError(`Could not create Showcase: ${message}`);
    } finally {
      setDashboardShowcaseSaving(false);
    }
  };

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const incomingFiles = Array.from(event.target.files || []);
    const selectedFiles = incomingFiles.filter(
      (file) => file.type.startsWith("image/") || file.type.startsWith("video/")
    );

    const rejectedFiles = incomingFiles.length - selectedFiles.length;

    if (selectedFiles.length === 0) {
      if (rejectedFiles > 0) alert("Please choose photo or video files only.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const oversizedFile = selectedFiles.find((file) => {
      const isVideo = file.type.startsWith("video/");
      const maxMb = isVideo ? MAX_POST_VIDEO_MB : MAX_POST_IMAGE_MB;
      return file.size > maxMb * 1024 * 1024;
    });

    if (oversizedFile) {
      const isVideo = oversizedFile.type.startsWith("video/");
      alert(
        `Please choose ${isVideo ? "videos" : "photos"} under ${
          isVideo ? MAX_POST_VIDEO_MB : MAX_POST_IMAGE_MB
        }MB for dashboard posts.`
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const selectedVideoFiles = selectedFiles.filter((file) => file.type.startsWith("video/"));

    if (selectedVideoFiles.length > 0) {
      for (const videoFile of selectedVideoFiles) {
        const durationSeconds = await getVideoDurationFromFile(videoFile);

        if (durationSeconds > MAX_POST_VIDEO_SECONDS + 0.25) {
          alert(
            `Dashboard post videos can be up to ${MAX_POST_VIDEO_SECONDS} seconds for launch. Please trim this video and try again.`
          );
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }
      }
    }

    setPostImages((prev) => {
      const existingVideo = prev.some((file) => file.type.startsWith("video/"));
      const remainingSlots = Math.max(MAX_POST_IMAGES - prev.length, 0);

      if (remainingSlots <= 0) {
        alert(`You can add up to ${MAX_POST_IMAGES} photos/videos in one post.`);
        return prev;
      }

      let acceptedFiles = selectedFiles.slice(0, remainingSlots);
      const selectedHasVideo = selectedVideoFiles.length > 0;

      if (existingVideo || selectedHasVideo) {
        const videoFiles = acceptedFiles.filter((file) => file.type.startsWith("video/"));
        const imageFiles = acceptedFiles.filter((file) => file.type.startsWith("image/"));

        if (existingVideo) {
          acceptedFiles = imageFiles;
        } else if (videoFiles.length > 0) {
          acceptedFiles = [videoFiles[0], ...imageFiles].slice(0, MAX_POST_IMAGES);
        }

        if (videoFiles.length > 1 || (existingVideo && videoFiles.length > 0)) {
          alert(
            `You can add one video per dashboard post for launch. You can still add photos with it, up to ${MAX_POST_IMAGES} total media items.`
          );
        }
      }

      if (selectedFiles.length > remainingSlots) {
        alert(`You can add up to ${MAX_POST_IMAGES} photos/videos in one post.`);
      }

      if (rejectedFiles > 0) {
        alert("Some files were skipped because they were not photos or videos.");
      }

      if (acceptedFiles.length === 0) return prev;
      return [...prev, ...acceptedFiles];
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveImage = (index?: number) => {
    if (typeof index === "number") {
      setPostImages((prev) => prev.filter((_, imageIndex) => imageIndex !== index));
    } else {
      setPostImages([]);
      setPostImagePreviewUrls([]);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePost = async () => {
    if (!content.trim() && postImages.length === 0 && !selectedFeelingActivity) {
      alert("Please add text, choose photos/videos, or select a Feeling / Activity.");
      return;
    }

    if (postImages.length > MAX_POST_IMAGES) {
      alert(`You can add up to ${MAX_POST_IMAGES} photos/videos in one post.`);
      return;
    }

    const postVideos = postImages.filter((file) => file.type.startsWith("video/"));
    if (postVideos.length > 1) {
      alert("You can add one video per dashboard post for launch.");
      return;
    }

    for (const videoFile of postVideos) {
      const durationSeconds = await getVideoDurationFromFile(videoFile);
      if (durationSeconds > MAX_POST_VIDEO_SECONDS + 0.25) {
        alert(`Dashboard post videos can be up to ${MAX_POST_VIDEO_SECONDS} seconds for launch.`);
        return;
      }
    }

    setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      alert("You must be logged in to post.");
      setLoading(false);
      return;
    }

    const uploadedImages: Array<{ image_url: string; storage_path: string; display_order: number }> = [];

    for (const [index, imageFile] of postImages.entries()) {
      const fileExt = imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const safeExt = fileExt.replace(/[^a-z0-9]/g, "") || "jpg";
      const fileName = `${user.id}/${Date.now()}-${index}-${Math.random().toString(36).slice(2)}.${safeExt}`;

      const { error: uploadError } = await supabase.storage.from("post-images").upload(fileName, imageFile, {
        cacheControl: "604800",
        upsert: false,
      });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        alert(`Upload error: ${uploadError.message}`);
        setLoading(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage.from("post-images").getPublicUrl(fileName);
      uploadedImages.push({
        image_url: publicUrlData.publicUrl,
        storage_path: fileName,
        display_order: index,
      });
    }

    const finalContent = buildPostContentWithFeelingActivity(content, selectedFeelingActivity);
    const primaryImageUrl = uploadedImages[0]?.image_url || null;

    const { data: insertedPost, error: insertError } = await supabase
      .from("posts")
      .insert([
        {
          content: finalContent,
          user_id: user.id,
          image_url: primaryImageUrl,
        },
      ])
      .select("id, content, image_url, created_at, user_id")
      .single();

    if (insertError || !insertedPost) {
      alert(`Post error: ${insertError?.message || "Post could not be created."}`);
      setLoading(false);
      return;
    }

    if (uploadedImages.length > 0) {
      const { error: imageRowsError } = await supabase.from("post_images").insert(
        uploadedImages.map((uploadedImage) => ({
          post_id: insertedPost.id,
          user_id: user.id,
          image_url: uploadedImage.image_url,
          storage_path: uploadedImage.storage_path,
          display_order: uploadedImage.display_order,
        }))
      );

      if (imageRowsError) {
        alert(`Post image save error: ${imageRowsError.message}`);
        setLoading(false);
        return;
      }
    }

    const optimisticImages = uploadedImages.map((uploadedImage, index) => ({
      id: `optimistic-${insertedPost.id}-${index}`,
      post_id: insertedPost.id,
      user_id: user.id,
      image_url: uploadedImage.image_url,
      storage_path: uploadedImage.storage_path,
      display_order: uploadedImage.display_order,
      created_at: insertedPost.created_at,
    })) as PostImage[];

    const nextPost = {
      ...(insertedPost as Post),
      images: optimisticImages,
    };

    setPosts((prev) => [nextPost, ...prev.filter((post) => post.id !== nextPost.id)]);
    setProfilesMap((prev) => ({
      ...prev,
      ...(currentProfile ? { [user.id]: currentProfile } : {}),
    }));
    setLikeCounts((prev) => ({ ...prev, [nextPost.id]: 0 }));
    setCommentCounts((prev) => ({ ...prev, [nextPost.id]: 0 }));
    setShareCounts((prev) => ({ ...prev, [nextPost.id]: 0 }));
    setUserLikes((prev) => ({ ...prev, [nextPost.id]: false }));
    setVisibleFeedLimit((currentLimit) => Math.max(currentLimit, FEED_INITIAL_BATCH_SIZE));

    setContent("");
    setSelectedFeelingActivity(null);
    setFeelingActivityOpen(false);
    handleRemoveImage();
    void fetchDashboardData(false);
    setLoading(false);
  };

  const handleLikeToggle = async (postId: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("You must be logged in to like a post.");
      return;
    }

    const alreadyLiked = !!userLikes[postId];

    if (alreadyLiked) {
      const { error } = await supabase.from("likes").delete().eq("user_id", user.id).eq("post_id", postId);
      if (error) {
        alert(`Unlike error: ${error.message}`);
        return;
      }
      setUserLikes((prev) => ({ ...prev, [postId]: false }));
      setLikeCounts((prev) => ({ ...prev, [postId]: Math.max((prev[postId] || 1) - 1, 0) }));
    } else {
      const { error } = await supabase.from("likes").insert([{ user_id: user.id, post_id: postId }]);
      if (error) {
        alert(`Like error: ${error.message}`);
        return;
      }
      setUserLikes((prev) => ({ ...prev, [postId]: true }));
      setLikeCounts((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
    }
  };

  const handleShare = async (postId: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("Please log in to share posts.");
      return;
    }

    const confirmed = window.confirm(
      "Share this post to your Parapost feed? It will appear on the dashboard timeline and on your profile."
    );

    if (!confirmed) {
      return;
    }

    const caption = window.prompt("Add a caption for your share, or leave blank:", "") || "";
    const trimmedCaption = caption.trim();

    const { data: insertedShare, error } = await supabase
      .from("shares")
      .insert([
        {
          post_id: postId,
          user_id: user.id,
          caption: trimmedCaption || null,
          share_destination: "feed",
        },
      ])
      .select("id, post_id, user_id, caption, created_at, share_destination, deleted_at")
      .single();

    if (error) {
      alert(`Share error: ${error.message}`);
      return;
    }

    const originalPost = getDashboardPostForAction(postId);
    const shareCreatedAt = insertedShare?.created_at || new Date().toISOString();

    if (originalPost && insertedShare?.id) {
      setSharedPostItems((prev) => [
        {
          id: insertedShare.id,
          post_id: postId,
          user_id: user.id,
          caption: trimmedCaption || null,
          created_at: shareCreatedAt,
          original_post: originalPost,
        },
        ...prev.filter((item) => item.id !== insertedShare.id),
      ]);
      setVisibleFeedLimit((currentLimit) => Math.max(currentLimit, FEED_INITIAL_BATCH_SIZE));
    }

    setShareCounts((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));

    if (originalPost?.user_id && originalPost.user_id !== user.id) {
      await insertDashboardNotification({
        userId: originalPost.user_id,
        actorId: user.id,
        type: "post_share",
        postId,
        message: "shared your post.",
      });
    }

    void fetchDashboardData(false);
    alert("Shared to your feed and profile.");
  };

  const handleReportPost = async (postId: string, postOwnerId?: string | null) => {
    if (!currentUserId) {
      alert("Please log in to report posts.");
      return;
    }

    if (!postId) return;

    if (postOwnerId && postOwnerId === currentUserId) {
      alert("You cannot report your own post from here.");
      return;
    }

    const reason = window.prompt(
      "Report this post to Parapost moderation. Please add a short reason:",
      ""
    );

    const trimmedReason = (reason || "").trim();

    if (!trimmedReason) {
      return;
    }

    const { error } = await supabase.from("reports").insert({
      reporter_id: currentUserId,
      reported_user_id: postOwnerId || null,
      target_type: "post",
      target_id: postId,
      reason: trimmedReason.slice(0, 160),
      details: trimmedReason.length > 160 ? trimmedReason : null,
      status: "open",
    });

    if (error) {
      alert(`Could not report this post: ${error.message}`);
      return;
    }

    setOpenPostMenuId(null);
    alert("Thanks. This post has been sent to Parapost moderation.");
  };


  const fetchDashboardComments = useCallback(
    async (postId: string) => {
      if (!postId) return;

      setCommentsLoadingPostId(postId);

      try {
        const { data, error } = await supabase
          .from("comments")
          .select("id, post_id, user_id, content, created_at, is_hidden, parent_comment_id, reply_to_user_id")
          .eq("post_id", postId)
          .order("created_at", { ascending: true })
          .limit(80);

        if (error) {
          console.error("Dashboard comments fetch error:", error.message);
          alert(error.message || "Could not load comments for this post.");
          return;
        }

        const nextComments = ((data || []) as DashboardComment[]).filter(
          (comment) => !comment.is_hidden && !blockedUserIds.includes(comment.user_id)
        );

        await updateDashboardCommentLikeState(
          nextComments.map((comment) => comment.id).filter(Boolean),
          currentUserId
        );

        setCommentsByPostId((prev) => ({
          ...prev,
          [postId]: nextComments,
        }));

        const commenterIds = [
          ...new Set(nextComments.map((comment) => comment.user_id).filter(Boolean)),
        ];

        if (commenterIds.length > 0) {
          const { data: profileRows, error: profilesError } = await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url, bio, location, is_online, last_seen_at")
            .in("id", commenterIds);

          if (!profilesError && profileRows) {
            const nextProfiles: Record<string, ProfilePreview> = {};
            for (const profile of profileRows as ProfilePreview[]) {
              if (profile.id) nextProfiles[profile.id] = profile;
            }

            setProfilesMap((prev) => ({
              ...prev,
              ...nextProfiles,
            }));
          }
        }
      } finally {
        setCommentsLoadingPostId((current) => (current === postId ? null : current));
      }
    },
    [blockedUserIds, currentUserId, updateDashboardCommentLikeState]
  );

  const handleToggleDashboardComments = useCallback(
    async (postId: string) => {
      if (!postId) return;

      setOpenPostMenuId(null);

      if (openCommentsPostId === postId) {
        setOpenCommentsPostId(null);
        return;
      }

      setOpenCommentsPostId(postId);
      await fetchDashboardComments(postId);
    },
    [fetchDashboardComments, openCommentsPostId]
  );

  const handleDashboardCommentDraftChange = (postId: string, value: string) => {
    setCommentDrafts((prev) => ({
      ...prev,
      [postId]: value,
    }));
  };

  const handleAddDashboardComment = async (postId: string, postOwnerId?: string | null) => {
    const trimmed = (commentDrafts[postId] || "").trim();

    if (!trimmed) return;

    if (!currentUserId) {
      alert("You must be logged in to comment.");
      return;
    }

    setPostingCommentPostId(postId);

    try {
      const { data, error } = await supabase
        .from("comments")
        .insert([
          {
            post_id: postId,
            user_id: currentUserId,
            content: trimmed,
            parent_comment_id: null,
            reply_to_user_id: null,
          },
        ])
        .select("id, post_id, user_id, content, created_at, is_hidden, parent_comment_id, reply_to_user_id")
        .single();

      if (error) {
        alert(`Comment error: ${error.message}`);
        return;
      }

      const savedComment = data as DashboardComment;

      setCommentDrafts((prev) => ({
        ...prev,
        [postId]: "",
      }));

      setCommentsByPostId((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] || []), savedComment],
      }));

      setDashboardCommentLikeCounts((prev) => ({
        ...prev,
        [savedComment.id]: 0,
      }));

      setDashboardCommentUserLikes((prev) => ({
        ...prev,
        [savedComment.id]: false,
      }));

      setCommentCounts((prev) => ({
        ...prev,
        [postId]: (prev[postId] || 0) + 1,
      }));

      if (currentProfile) {
        setProfilesMap((prev) => ({
          ...prev,
          [currentUserId]: currentProfile,
        }));
      }

      if (postOwnerId && postOwnerId !== currentUserId) {
        await supabase.from("notifications").insert([
          {
            user_id: postOwnerId,
            actor_id: currentUserId,
            type: "post_comment",
            post_id: postId,
            comment_id: savedComment.id,
            friend_request_id: null,
            message: "commented on your post.",
            is_read: false,
          },
        ]);
      }

      // After posting, close the full comment composer and leave the newest
      // comment visible in the automatic preview under the post.
      setOpenCommentsPostId((current) => (current === postId ? null : current));
    } finally {
      setPostingCommentPostId((current) => (current === postId ? null : current));
    }
  };

  const handleStartEditDashboardComment = (comment: DashboardComment) => {
    if (!currentUserId || comment.user_id !== currentUserId) return;

    setEditingCommentId(comment.id);
    setEditingCommentText(comment.content || "");
    setOpenPostMenuId(null);
  };

  const handleCancelEditDashboardComment = () => {
    setEditingCommentId(null);
    setEditingCommentText("");
    setSavingCommentId(null);
  };

  const handleSaveDashboardComment = async (postId: string, comment: DashboardComment) => {
    const trimmed = editingCommentText.trim();

    if (!currentUserId || comment.user_id !== currentUserId) return;

    if (!trimmed) {
      alert("A comment needs some text. Delete the comment instead if you want to remove it.");
      return;
    }

    setSavingCommentId(comment.id);

    try {
      const { data, error } = await supabase
        .from("comments")
        .update({ content: trimmed })
        .eq("id", comment.id)
        .eq("user_id", currentUserId)
        .select("id, post_id, user_id, content, created_at, is_hidden, parent_comment_id, reply_to_user_id")
        .single();

      if (error) {
        alert(`Edit comment error: ${error.message}`);
        return;
      }

      const updatedComment = data as DashboardComment;

      setCommentsByPostId((prev) => ({
        ...prev,
        [postId]: (prev[postId] || []).map((item) =>
          item.id === updatedComment.id ? updatedComment : item
        ),
      }));

      setEditingCommentId(null);
      setEditingCommentText("");
    } finally {
      setSavingCommentId((current) => (current === comment.id ? null : current));
    }
  };

  const handleDeleteDashboardComment = async (postId: string, commentId: string) => {
    if (!currentUserId) return;
    if (!window.confirm("Delete this comment?")) return;

    await supabase.from("comment_likes").delete().eq("comment_id", commentId);

    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", currentUserId);

    if (error) {
      alert(`Delete comment error: ${error.message}`);
      return;
    }

    setCommentsByPostId((prev) => ({
      ...prev,
      [postId]: (prev[postId] || []).filter((comment) => comment.id !== commentId),
    }));

    setCommentCounts((prev) => ({
      ...prev,
      [postId]: Math.max((prev[postId] || 1) - 1, 0),
    }));

    setDashboardCommentLikeCounts((prev) => {
      const next = { ...prev };
      delete next[commentId];
      return next;
    });

    setDashboardCommentUserLikes((prev) => {
      const next = { ...prev };
      delete next[commentId];
      return next;
    });

    if (editingCommentId === commentId) {
      setEditingCommentId(null);
      setEditingCommentText("");
      setSavingCommentId(null);
    }
  };

  const handleReportDashboardComment = async (
    commentId: string,
    commentOwnerId?: string | null
  ) => {
    if (!currentUserId) {
      alert("Please log in to report comments.");
      return;
    }

    if (!commentId) return;

    if (commentOwnerId && commentOwnerId === currentUserId) {
      alert("You cannot report your own comment from here.");
      return;
    }

    const reason = window.prompt(
      "Report this comment to Parapost moderation. Please add a short reason:",
      ""
    );

    const trimmedReason = (reason || "").trim();

    if (!trimmedReason) return;

    const { error } = await supabase.from("reports").insert({
      reporter_id: currentUserId,
      reported_user_id: commentOwnerId || null,
      target_type: "comment",
      target_id: commentId,
      reason: trimmedReason.slice(0, 160),
      details: trimmedReason.length > 160 ? trimmedReason : null,
      status: "open",
    });

    if (error) {
      alert(`Could not report this comment: ${error.message}`);
      return;
    }

    alert("Thanks. This comment has been sent to Parapost moderation.");
  };

  const handleStartEditPost = (post: Post) => {
    setEditingPostId(post.id);
    setEditingPostContent(post.content || "");
    setOpenPostMenuId(null);
  };

  const handleSavePostEdit = async (postId: string) => {
    const trimmed = editingPostContent.trim();

    const { error } = await supabase
      .from("posts")
      .update({ content: trimmed })
      .eq("id", postId)
      .eq("user_id", currentUserId);

    if (error) {
      alert(`Edit post error: ${error.message}`);
      return;
    }

    setPosts((prev) => prev.map((post) => (post.id === postId ? { ...post, content: trimmed } : post)));
    setSharedPostItems((prev) =>
      prev.map((item) =>
        item.original_post.id === postId
          ? { ...item, original_post: { ...item.original_post, content: trimmed } }
          : item
      )
    );
    setEditingPostId(null);
    setEditingPostContent("");
  };

  const handleDeletePost = async (postId: string) => {
    if (!window.confirm("Delete this post?")) return;

    const { data: commentRows } = await supabase
      .from("comments")
      .select("id")
      .eq("post_id", postId);

    const commentIds = (commentRows || []).map((comment) => comment.id).filter(Boolean);

    if (commentIds.length > 0) {
      await supabase.from("comment_likes").delete().in("comment_id", commentIds);
      await supabase.from("comment_reports").delete().in("comment_id", commentIds);
    }

    await supabase.from("likes").delete().eq("post_id", postId);
    await supabase.from("shares").delete().eq("post_id", postId);
    await supabase.from("reposts").delete().eq("post_id", postId);
    await supabase.from("comments").delete().eq("post_id", postId);

    const { error } = await supabase.from("posts").delete().eq("id", postId).eq("user_id", currentUserId);
    if (error) {
      alert(`Delete post error: ${error.message}`);
      return;
    }

    setPosts((prev) => prev.filter((post) => post.id !== postId));
    setSharedPostItems((prev) =>
      prev.filter((item) => item.post_id !== postId && item.original_post.id !== postId)
    );
    setOpenPostMenuId(null);
  };

  const handleDeleteSharedPostShare = async (shareId: string, postId: string) => {
    if (!currentUserId) return;
    if (!window.confirm("Remove this shared post from your feed?")) return;

    const duplicateShareIds = sharedPostItems
      .filter((item) => item.user_id === currentUserId && item.post_id === postId)
      .map((item) => item.id);

    const shareIdsToRemove = [...new Set([shareId, ...duplicateShareIds].filter(Boolean))];
    const removedShareKey = `${currentUserId}:${postId}`;

    shareIdsToRemove.forEach((id) => removedSharedPostShareIdsRef.current.add(id));
    removedSharedPostKeysRef.current.add(removedShareKey);

    setSharedPostItems((prev) =>
      prev.filter(
        (item) =>
          !shareIdsToRemove.includes(item.id) &&
          !(item.user_id === currentUserId && item.post_id === postId)
      )
    );

    setShareCounts((prev) => ({
      ...prev,
      [postId]: Math.max((prev[postId] || shareIdsToRemove.length || 1) - Math.max(shareIdsToRemove.length, 1), 0),
    }));

    setOpenPostMenuId(null);

    const { error: hardDeleteError } = await supabase
      .from("shares")
      .delete()
      .eq("user_id", currentUserId)
      .eq("post_id", postId);

    if (hardDeleteError) {
      const deletedAt = new Date().toISOString();

      const { error: softDeleteError } = await supabase
        .from("shares")
        .update({ deleted_at: deletedAt })
        .eq("user_id", currentUserId)
        .eq("post_id", postId);

      if (softDeleteError) {
        shareIdsToRemove.forEach((id) => removedSharedPostShareIdsRef.current.delete(id));
        removedSharedPostKeysRef.current.delete(removedShareKey);
        alert(`Remove shared post error: ${softDeleteError.message}`);
        await fetchSharedPosts();
      }
    }
  };


  const handleDeleteReelShare = async (shareId: string) => {
    if (!currentUserId) return;
    if (!window.confirm("Remove this shared reel from your feed?")) return;

    const targetShare = sharedReelItems.find((item) => item.id === shareId);
    const reelId = targetShare?.reel_id || "";

    const duplicateShareIds = sharedReelItems
      .filter((item) => item.user_id === currentUserId && (!reelId || item.reel_id === reelId))
      .map((item) => item.id);

    const shareIdsToRemove = [...new Set([shareId, ...duplicateShareIds].filter(Boolean))];
    const removedShareKey = reelId ? `${currentUserId}:${reelId}` : "";

    shareIdsToRemove.forEach((id) => removedReelShareIdsRef.current.add(id));
    if (removedShareKey) removedReelShareKeysRef.current.add(removedShareKey);

    setSharedReelItems((prev) =>
      prev.filter(
        (item) =>
          !shareIdsToRemove.includes(item.id) &&
          !(item.user_id === currentUserId && reelId && item.reel_id === reelId)
      )
    );

    const deleteQuery = supabase.from("reel_shares").delete().eq("user_id", currentUserId);
    const { error } = reelId
      ? await deleteQuery.eq("reel_id", reelId)
      : await deleteQuery.eq("id", shareId);

    if (error) {
      shareIdsToRemove.forEach((id) => removedReelShareIdsRef.current.delete(id));
      if (removedShareKey) removedReelShareKeysRef.current.delete(removedShareKey);
      alert(`Remove shared reel error: ${error.message}`);
      await fetchSharedReels();
    }
  };


  const handleFollowToggle = async (targetUserId: string) => {
    if (!currentUserId || !targetUserId || targetUserId === currentUserId) return;

    const alreadyFollowing = !!followingMap[targetUserId];

    if (alreadyFollowing) {
      const { error } = await supabase
        .from("followers")
        .delete()
        .eq("follower_id", currentUserId)
        .eq("following_id", targetUserId);

      if (error) {
        alert(`Unfollow error: ${error.message}`);
        return;
      }

      setFollowingMap((prev) => ({ ...prev, [targetUserId]: false }));
      setFollowedUserIds((prev) => prev.filter((id) => id !== targetUserId));
    } else {
      const { error } = await supabase
        .from("followers")
        .insert([{ follower_id: currentUserId, following_id: targetUserId }]);

      if (error) {
        alert(`Follow error: ${error.message}`);
        return;
      }

      setFollowingMap((prev) => ({ ...prev, [targetUserId]: true }));
      setFollowedUserIds((prev) => [...new Set([...prev, targetUserId])]);
    }
  };

  const scrollToComposer = useCallback(() => {
    const composer = mainComposerRef.current || document.getElementById("dashboard-create-post");
    if (!composer) return;

    composer.scrollIntoView({ behavior: "smooth", block: "start" });

    window.setTimeout(() => {
      const composerInput = document.getElementById("dashboard-create-post-input") as HTMLTextAreaElement | null;
      composerInput?.focus();
    }, 380);
  }, []);

  const openSearch = () => {
    setSearchOpen(true);
    window.setTimeout(() => {
      const input = document.getElementById("dashboard-search-modal-input") as HTMLInputElement | null;
      input?.focus();
    }, 50);
  };

  const searchBox = (
    <div className="dashboard-search-parapost" style={searchWrapStyle}>
      <SearchIcon size={18} />
      <input
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        onFocus={() => setSearchOpen(true)}
        placeholder="Search Parapost"
        style={searchInputStyle}
      />
      {searchOpen && searchQuery.trim().length >= 2 ? (
        <div style={searchDropdownStyle}>
          <SearchResults
            searchLoading={searchLoading}
            searchResults={searchResults}
            onClose={() => setSearchOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );

  return (
    <div style={dashboardRootStyle}>
      <div style={backgroundGlowStyle} />
      <div className="dashboard-shell-pad" style={dashboardShellStyle}>
        <MobileDashboardHeader
          currentProfile={currentProfile}
          notificationsCount={notificationsCount}
          parachatUnreadCount={parachatUnreadCount}
          onOpenSearch={openSearch}
          onOpenMenu={() => {
            setMobileMenuInitialSection("main");
            setMobileMenuOpen(true);
          }}
        />

        <div className="dashboard-grid-desktop-safe" style={dashboardGridStyle}>
          <aside className="dashboard-desktop-left" style={leftSidebarStyle}>
            <SidebarLogo />
            <nav style={sidebarNavStyle}>
              <SidebarLink href="/dashboard" active icon={<HomeIcon />} label="Home" />
              <SidebarLink href="/reels" icon={<SidebarParapostReelIcon />} label="Explore Reels" />
              <SidebarLink href="/live" label="Live" />
              <SidebarLink href="/friends" label="Friends" badge={pendingFriendRequestCount || undefined} />
              <SidebarLink href={currentUserId ? `/profile/${currentUserId}/followers` : "/dashboard"} label="Followers" />
              <SidebarLink href={currentUserId ? `/profile/${currentUserId}/following` : "/dashboard"} label="Following" />
              <SidebarButton label="Groups" muted />
              <SidebarLink href="/messages" label="Parachat" badge={parachatUnreadCount || undefined} />
              <SidebarLink href="/notifications" label="Notifications" badge={notificationsCount || undefined} />
              <SidebarButton label="Bookmarks" muted />
              <SidebarButton label="Explore" muted />
              <SidebarButton label="Events" muted />
              <SidebarLink href="/settings" label="Settings" />
            </nav>

            <div style={sidebarDividerStyle} />
            <div style={sidebarSectionHeaderRowStyle}>
              <div style={{ ...sidebarSectionLabelStyle, marginBottom: 0 }}>Parapost Hub</div>
              <span style={sidebarSectionSoonBadgeStyle}>Soon</span>
            </div>
            <div style={paranormalHubIntroStyle}>
              Investigation tools, evidence collections, case files, and field reports are coming soon.
            </div>
            <nav style={sidebarNavStyle}>
              <SidebarButton label="Investigations" badge="Soon" muted />
              <SidebarButton label="Evidence Vault" badge="Soon" muted />
              <SidebarButton label="Podcasts" badge="Soon" muted />
              <SidebarButton label="Events" badge="Soon" muted />
            </nav>

            <div style={{ ...sidebarDividerStyle, margin: "12px 0 10px" }} />
            <div style={sidebarSectionHeaderRowStyle}>
              <div style={{ ...sidebarSectionLabelStyle, marginBottom: 0 }}>Live Tools</div>
            </div>

            <Link
              href="/live"
              style={{ ...goLiveCardStyle, textDecoration: "none" }}
              aria-label="Open Parapost Live"
            >
              <span style={goLiveIconStyle}>+</span>
              <span style={{ minWidth: 0 }}>
               <strong style={{ display: "block", color: "#fff" }}>Parapost Live</strong>
               <span style={{ color: "var(--parapost-accent-readable-text)", fontSize: 12 }}>
                 Live hub
               </span>
              </span>
              <span style={goLiveSoonBadgeStyle}>Open</span>
            </Link>

            <div style={{ ...sidebarDividerStyle, margin: "12px 0 10px" }} />
            <div style={{ ...sidebarSectionLabelStyle, marginBottom: 8 }}>Profile</div>

            <Link href={currentUserId ? `/profile/${currentUserId}` : "/dashboard"} style={sidebarProfileStyle}>
              <Avatar profile={currentProfile} size={38} />
              <span style={{ minWidth: 0 }}>
                <strong style={{ display: "block", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {currentProfile?.full_name || currentProfile?.username || "My Profile"}
                </strong>
                <span style={{ color: "#9ca3af", fontSize: 12 }}>View Profile</span>
              </span>
            </Link>
          </aside>

          <main className="dashboard-main-column" style={mainColumnStyle}>
            <div className="dashboard-desktop-topbar" style={desktopTopBarStyle}>
              {searchBox}
              <div className="dashboard-top-icons" style={topActionRowStyle}>
                <Link href="/notifications" style={topIconButtonStyle} aria-label="Notifications">
                  <BellIcon />
                  {notificationsCount > 0 ? <span style={topBadgeStyle}>{notificationsCount > 99 ? "99+" : notificationsCount}</span> : null}
                </Link>
                <Link href="/messages" style={topIconButtonStyle} aria-label="Parachat">
                  <ChatIcon />
                  {parachatUnreadCount > 0 ? <span style={topBadgeStyle}>{parachatUnreadCount > 99 ? "99+" : parachatUnreadCount}</span> : null}
                </Link>
                <button
                  type="button"
                  className="dashboard-tablet-menu-button"
                  onClick={() => {
                    setMobileMenuInitialSection("main");
                    setMobileMenuOpen(true);
                  }}
                  style={topIconButtonStyle}
                  aria-label="Open dashboard menu"
                >
                  <MenuIcon />
                </button>
                <Link
                  href={currentUserId ? `/profile/${currentUserId}` : "/dashboard"}
                  style={topProfileButtonStyle}
                  aria-label="My profile"
                >
                  <Avatar profile={currentProfile} size={36} />
                </Link>
              </div>
            </div>

            <ShowcaseQuickActions
              currentProfile={currentProfile}
              currentUserId={currentUserId}
              friendShowcases={friendShowcases}
              onCreateShowcase={handleOpenDashboardShowcaseComposer}
              onOpenShowcase={setSelectedDashboardShowcase}
            />

            <ComposerCard
              composerRef={mainComposerRef}
              currentProfile={currentProfile}
              firstName={firstName}
              content={content}
              setContent={setContent}
              images={postImages}
              imagePreviewUrls={postImagePreviewUrls}
              loading={loading}
              selectedFeelingActivity={selectedFeelingActivity}
              fileInputRef={fileInputRef}
              onImageChange={handleImageChange}
              onRemoveImage={handleRemoveImage}
              onOpenFeelingActivity={() => setFeelingActivityOpen(true)}
              onClearFeelingActivity={() => setSelectedFeelingActivity(null)}
              onPost={handlePost}
            />

            <DashboardReelsSection />

            <FeedTabs feedMode={feedMode} setFeedMode={setFeedMode} />

            <FeedPulseStrip
              itemCount={filteredFeedItems.length}
              totalLikes={totalLikes}
              totalComments={totalComments}
              totalShares={totalShares}
            />

            <section style={feedStackStyle}>
              {fetchingPosts ? (
                <DashboardEmptyState title="Loading your feed" text="Parapost Network is pulling in posts, shared reels, and profile activity." />
              ) : filteredFeedItems.length === 0 ? (
                <DashboardEmptyState
                  title={
                    feedMode === "friends"
                      ? "No friend posts yet"
                      : feedMode === "following"
                        ? "No followed posts yet"
                        : "No posts yet"
                  }
                  text={
                    feedMode === "friends"
                      ? "Posts from accepted friends will appear here automatically."
                      : feedMode === "following"
                        ? "Follow more members to build your personal feed."
                        : "Be the first to share an update, photo, video, thought, or Parapost Reel."
                  }
                />
              ) : (
                <>
                  {visibleFeedItems.map((item, index) => {
                    const shouldShowMobileSponsor = (index + 1) % 20 === 0;

                    return (
                      <div key={`feed-item-${item.type}-${item.id}`} style={{ display: "contents" }}>
                        {item.type === "live_stream" ? (
                          <DashboardLiveStreamCard stream={item.liveStream} currentUserId={currentUserId} />
                        ) : item.type === "post" ? (
                          <PostCard
                            post={item.post}
                            profile={profilesMap[item.post.user_id]}
                            currentUserId={currentUserId}
                            profilesMap={profilesMap}
                            isLiked={!!userLikes[item.post.id]}
                            likeCount={likeCounts[item.post.id] || 0}
                            commentCount={commentCounts[item.post.id] || 0}
                            shareCount={shareCounts[item.post.id] || 0}
                            isFollowing={!!followingMap[item.post.user_id]}
                            isFriend={acceptedFriendUserIds.includes(item.post.user_id)}
                            openPostMenuId={openPostMenuId}
                            editingPostId={editingPostId}
                            editingPostContent={editingPostContent}
                            setEditingPostContent={setEditingPostContent}
                            setOpenPostMenuId={setOpenPostMenuId}
                            commentsOpen={openCommentsPostId === item.post.id}
                            comments={commentsByPostId[item.post.id] || []}
                            commentsLoading={commentsLoadingPostId === item.post.id}
                            commentDraft={commentDrafts[item.post.id] || ""}
                            postingComment={postingCommentPostId === item.post.id}
                            editingCommentId={editingCommentId}
                            editingCommentText={editingCommentText}
                            savingCommentId={savingCommentId}
                            commentLikeCounts={dashboardCommentLikeCounts}
                            commentUserLikes={dashboardCommentUserLikes}
                            setEditingCommentText={setEditingCommentText}
                            onToggleCommentLike={handleToggleDashboardCommentLike}
                            onStartEditComment={handleStartEditDashboardComment}
                            onSaveEditComment={(comment) => handleSaveDashboardComment(item.post.id, comment)}
                            onCancelEditComment={handleCancelEditDashboardComment}
                            onLike={() => handleLikeToggle(item.post.id)}
                            onToggleComments={() => handleToggleDashboardComments(item.post.id)}
                            onCommentDraftChange={(value) => handleDashboardCommentDraftChange(item.post.id, value)}
                            onAddComment={() => handleAddDashboardComment(item.post.id, item.post.user_id)}
                            onDeleteComment={(commentId) => handleDeleteDashboardComment(item.post.id, commentId)}
                            onReportComment={(commentId, commentOwnerId) => handleReportDashboardComment(commentId, commentOwnerId)}
                            onShare={() => handleShare(item.post.id)}
                            onStartEdit={() => handleStartEditPost(item.post)}
                            onSaveEdit={() => handleSavePostEdit(item.post.id)}
                            onCancelEdit={() => {
                              setEditingPostId(null);
                              setEditingPostContent("");
                            }}
                            onDelete={() => handleDeletePost(item.post.id)}
                            onReport={() => handleReportPost(item.post.id, item.post.user_id)}
                            onOpenImage={openDashboardPostImageViewer}
                          />
                        ) : item.type === "shared_post" ? (
                          <SharedPostCard
                            sharedPost={item.sharedPost}
                            sharerProfile={profilesMap[item.sharedPost.user_id]}
                            originalProfile={profilesMap[item.sharedPost.original_post.user_id]}
                            currentUserId={currentUserId}
                            profilesMap={profilesMap}
                            isLiked={!!userLikes[item.sharedPost.post_id]}
                            likeCount={likeCounts[item.sharedPost.post_id] || 0}
                            commentCount={commentCounts[item.sharedPost.post_id] || 0}
                            shareCount={shareCounts[item.sharedPost.post_id] || 0}
                            openPostMenuId={openPostMenuId}
                            editingPostId={editingPostId}
                            editingPostContent={editingPostContent}
                            setEditingPostContent={setEditingPostContent}
                            setOpenPostMenuId={setOpenPostMenuId}
                            commentsOpen={openCommentsPostId === item.sharedPost.post_id}
                            comments={commentsByPostId[item.sharedPost.post_id] || []}
                            commentsLoading={commentsLoadingPostId === item.sharedPost.post_id}
                            commentDraft={commentDrafts[item.sharedPost.post_id] || ""}
                            postingComment={postingCommentPostId === item.sharedPost.post_id}
                            editingCommentId={editingCommentId}
                            editingCommentText={editingCommentText}
                            savingCommentId={savingCommentId}
                            commentLikeCounts={dashboardCommentLikeCounts}
                            commentUserLikes={dashboardCommentUserLikes}
                            setEditingCommentText={setEditingCommentText}
                            onToggleCommentLike={handleToggleDashboardCommentLike}
                            onStartEditComment={handleStartEditDashboardComment}
                            onSaveEditComment={(comment) => handleSaveDashboardComment(item.sharedPost.post_id, comment)}
                            onCancelEditComment={handleCancelEditDashboardComment}
                            onLikeOriginal={() => handleLikeToggle(item.sharedPost.post_id)}
                            onToggleComments={() => handleToggleDashboardComments(item.sharedPost.post_id)}
                            onCommentDraftChange={(value) => handleDashboardCommentDraftChange(item.sharedPost.post_id, value)}
                            onAddComment={() => handleAddDashboardComment(item.sharedPost.post_id, item.sharedPost.original_post.user_id)}
                            onDeleteComment={(commentId) => handleDeleteDashboardComment(item.sharedPost.post_id, commentId)}
                            onReportComment={(commentId, commentOwnerId) => handleReportDashboardComment(commentId, commentOwnerId)}
                            onShareOriginal={() => handleShare(item.sharedPost.post_id)}
                            onStartEditOriginal={() => handleStartEditPost(item.sharedPost.original_post)}
                            onSaveEditOriginal={() => handleSavePostEdit(item.sharedPost.original_post.id)}
                            onCancelEditOriginal={() => {
                              setEditingPostId(null);
                              setEditingPostContent("");
                            }}
                            onDeleteOriginal={() => handleDeletePost(item.sharedPost.original_post.id)}
                            onRemoveShare={() => handleDeleteSharedPostShare(item.sharedPost.id, item.sharedPost.post_id)}
                            onReportOriginal={() => handleReportPost(item.sharedPost.original_post.id, item.sharedPost.original_post.user_id)}
                            onOpenImage={openDashboardPostImageViewer}
                          />
                        ) : (
                          <SharedReelCard
                            shared={item.share}
                            sharerProfile={profilesMap[item.share.user_id]}
                            creatorProfile={profilesMap[item.share.creator_profile_id || ""] || profilesMap[item.share.reel_user_id]}
                            currentUserId={currentUserId}
                            onDelete={() => handleDeleteReelShare(item.share.id)}
                          />
                        )}

                        {shouldShowMobileSponsor ? (
                          <MobileTimelineSponsorCard slotNumber={Math.floor((index + 1) / 20)} />
                        ) : null}
                      </div>
                    );
                  })}

                  {hasMoreFeedItems ? <div ref={feedLoadMoreSentinelRef} style={feedLoadMoreSentinelStyle} /> : null}
                </>
              )}
            </section>
          </main>

          <aside className="dashboard-right-rail" style={rightRailStyle}>
            {currentUserId ? (
              <RightRailCard title="Network Pulse" action="Active">
                <RailHeroProfile
                  profile={currentProfile}
                  currentUserId={currentUserId}
                  userEmail={userEmail}
                />

                <div style={railStatGridStyle}>
                  <RailStatTile label="Following" value={followedUserIds.length.toString()} />
                  <RailStatTile label="Feed Items" value={mixedFeedItems.length.toString()} />
                  <RailStatTile label="Likes" value={totalLikes.toString()} />
                  <RailStatTile label="Comments" value={totalComments.toString()} />
                </div>
              </RightRailCard>
            ) : null}

            <RightRailCard title="People to Discover" action="Fresh">
              {peopleToDiscover.length === 0 ? (
                <p style={mutedTextStyle}>New members with completed bios will appear here automatically.</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {peopleToDiscover.map((profile) => (
                    <Link key={profile.id} href={`/profile/${profile.id}`} style={discoverProfileRowStyle}>
                      <Avatar profile={profile} size={38} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <strong style={railNameStyle}>{profile.full_name || profile.username || "Parapost user"}</strong>
                        <span style={railMetaStyle}>@{profile.username || "member"}</span>
                      </span>
                      <span style={miniArrowStyle}>›</span>
                    </Link>
                  ))}
                </div>
              )}
            </RightRailCard>

            <RightRailCard title="Recently Viewed" action="Private">
              <div style={privacyNoticeStyle}>Only you can see the profiles you recently viewed.</div>
              {visibleRecentlyViewed.length === 0 ? (
                <p style={mutedTextStyle}>Profiles you view will appear here privately.</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {visibleRecentlyViewed.slice(0, 5).map((profile) => (
                    <Link key={profile.id} href={`/profile/${profile.id}`} style={recentProfileRowStyle}>
                      <Avatar profile={profile} size={34} />
                      <span style={{ minWidth: 0 }}>
                        <strong style={railNameStyle}>{profile.full_name || profile.username || "Parapost user"}</strong>
                        <span style={railMetaStyle}>@{profile.username || "member"}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </RightRailCard>

            <RightRailCard title="Explore Reels" action="Public">
              <div style={reelsRailFeatureStyle}>
                <div style={reelsRailIconStyle}>▶</div>
                <div style={{ minWidth: 0 }}>
                  <strong style={railNameStyle}>Discover public Parapost Reels</strong>
                  <span style={railMetaStyle}>Short videos, creator moments, and public reels from across the platform.</span>
                </div>
              </div>
              <Link href="/reels" style={railPrimaryLinkStyle}>Open Explore Reels</Link>
            </RightRailCard>

            <RightRailCard title="Trending in Parapost" action="Updated">
              {trendingTopics.map((topic, index) => (
                <TrendingItem
                  key={`${topic.title}-${index}`}
                  rank={(index + 1).toString()}
                  title={topic.title}
                  meta={topic.meta}
                />
              ))}
            </RightRailCard>

            <RightRailCard title="Sponsor / Advertising" action="Coming soon">
              <div style={sponsorCardStyle}>
                <div style={sponsorIconStyle}>★</div>
                <div>
                  <strong style={railNameStyle}>Advertise with Parapost Network</strong>
                  <span style={railMetaStyle}>Promote your brand, event, product, or creator campaign to the Parapost community. Sponsorship and advertising tools are coming soon.</span>
                </div>
              </div>
            </RightRailCard>
          </aside>
        </div>
      </div>

      {showcaseComposerOpen ? (
        <DashboardShowcaseComposerModal
          currentProfile={currentProfile}
          title={dashboardShowcaseTitle}
          coverText={dashboardShowcaseCoverText}
          duration={dashboardShowcaseDuration}
          visibility={dashboardShowcaseVisibility}
          mediaPreviewUrl={dashboardShowcaseMediaPreviewUrl}
          mediaType={dashboardShowcaseMediaType}
          mediaFileName={dashboardShowcaseMediaFileName}
          fontKey={dashboardShowcaseFontKey}
          overlayFontSize={dashboardShowcaseOverlayFontSize}
          textPosition={dashboardShowcaseTextPosition}
          customizeOpen={dashboardShowcaseCustomizeOpen}
          previewExpanded={dashboardShowcasePreviewExpanded}
          mediaDragActive={dashboardShowcaseMediaDragActive}
          error={dashboardShowcaseError}
          saving={dashboardShowcaseSaving}
          mediaInputRef={dashboardShowcaseInputRef}
          setTitle={setDashboardShowcaseTitle}
          setCoverText={setDashboardShowcaseCoverText}
          setDuration={setDashboardShowcaseDuration}
          setVisibility={setDashboardShowcaseVisibility}
          setFontKey={setDashboardShowcaseFontKey}
          setOverlayFontSize={setDashboardShowcaseOverlayFontSize}
          setTextPosition={setDashboardShowcaseTextPosition}
          setCustomizeOpen={setDashboardShowcaseCustomizeOpen}
          setPreviewExpanded={setDashboardShowcasePreviewExpanded}
          onMediaChange={handleDashboardShowcaseMediaChange}
          onMediaDrop={handleDashboardShowcaseMediaDrop}
          onMediaDragOver={handleDashboardShowcaseMediaDragOver}
          onMediaDragLeave={handleDashboardShowcaseMediaDragLeave}
          onClearMedia={handleClearDashboardShowcaseMedia}
          onClose={handleCloseDashboardShowcaseComposer}
          onCreate={handleCreateDashboardShowcase}
        />
      ) : null}

      {selectedDashboardShowcase ? (
        <DashboardShowcaseViewerModal
          showcase={selectedDashboardShowcase}
          showcases={friendShowcases}
          onSelectShowcase={setSelectedDashboardShowcase}
          onClose={() => setSelectedDashboardShowcase(null)}
        />
      ) : null}

      <MobileDashboardMenuDrawer
        isOpen={mobileMenuOpen}
        initialSection={mobileMenuInitialSection}
        currentProfile={currentProfile}
        currentUserId={currentUserId}
        notificationsCount={notificationsCount}
        parachatUnreadCount={parachatUnreadCount}
        pendingFriendRequestCount={pendingFriendRequestCount}
        recentlyViewed={visibleRecentlyViewed}
        peopleToDiscover={peopleToDiscover}
        trendingTopics={trendingTopics}
        followedCount={followedUserIds.length}
        feedItems={mixedFeedItems.length}
        totalLikes={totalLikes}
        totalComments={totalComments}
        totalShares={totalShares}
        onClose={() => setMobileMenuOpen(false)}
        onCreatePost={() => {
          setMobileMenuOpen(false);
          scrollToComposer();
        }}
      />

      <MobileBottomNav currentUserId={currentUserId} avatarUrl={currentProfile?.avatar_url || ""} parachatUnreadCount={parachatUnreadCount} onCreatePost={scrollToComposer} />

      <DashboardPostImageViewerModal viewer={dashboardPostImageViewer} onClose={closeDashboardPostImageViewer} />

      {feelingActivityOpen ? (
        <FeelingActivityModal
          selectedFeelingActivity={selectedFeelingActivity}
          onSelect={(option) => {
            setSelectedFeelingActivity(option);
            setFeelingActivityOpen(false);
          }}
          onClear={() => {
            setSelectedFeelingActivity(null);
            setFeelingActivityOpen(false);
          }}
          onClose={() => setFeelingActivityOpen(false)}
        />
      ) : null}

      {searchOpen ? (
        <SearchModal
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchLoading={searchLoading}
          searchResults={searchResults}
          onClose={() => setSearchOpen(false)}
        />
      ) : null}

      <style dangerouslySetInnerHTML={{ __html: `
        html {
          scroll-behavior: smooth;
        }

        .profile-showcase-modal-header,
        .profile-showcase-studio-layout,
        .profile-showcase-modal-actions {
          direction: ltr;
        }

        /* Dashboard Showcase modal scrollbar: visible right-side scroll, matching profile behavior. */
        .profile-showcase-modal-shell {
          direction: ltr !important;
          scrollbar-width: auto !important;
          scrollbar-color: rgba(255,255,255,0.82) rgba(255,255,255,0.12) !important;
          -ms-overflow-style: auto !important;
        }

        .profile-showcase-modal-shell::-webkit-scrollbar {
          display: block !important;
          width: 12px !important;
          height: 12px !important;
        }

        .profile-showcase-modal-shell::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.10) !important;
          border-radius: 999px !important;
          margin: 16px 0 !important;
        }

        .profile-showcase-modal-shell::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.78) !important;
          border-radius: 999px !important;
          border: 2px solid rgba(8,10,16,0.95) !important;
        }

        .profile-showcase-modal-shell::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.92) !important;
        }

        .profile-showcase-font-select {
          color-scheme: dark !important;
          background: rgba(7,10,16,0.98) !important;
          color: #ffffff !important;
          border: 1px solid rgba(255,255,255,0.16) !important;
          border-radius: 12px !important;
          outline: none !important;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.04) !important;
        }

        .profile-showcase-font-select:focus {
          border-color: color-mix(in srgb, var(--parapost-accent-2) 62%, rgba(255,255,255,0.16)) !important;
          box-shadow:
            0 0 0 1px color-mix(in srgb, var(--parapost-accent-2) 22%, transparent),
            0 0 20px color-mix(in srgb, var(--parapost-accent-2) 16%, transparent) !important;
        }

        .profile-showcase-font-select option {
          background: #080b12 !important;
          color: #ffffff !important;
        }

        .profile-showcase-modal-shell {
          direction: ltr;
          scrollbar-width: auto;
          -ms-overflow-style: auto;
        }

        .profile-showcase-modal-shell::-webkit-scrollbar {
          width: auto;
          height: auto;
        }

        .profile-showcase-modal-shell::-webkit-scrollbar-track {
          background: initial;
          border-radius: initial;
          margin: initial;
        }

        .profile-showcase-modal-shell::-webkit-scrollbar-thumb {
          background: initial;
          border-radius: initial;
          border: initial;
        }



        .profile-showcase-visibility-symbol {
          position: relative;
          width: 19px;
          height: 19px;
          display: block;
        }

        .profile-showcase-visibility-symbol-public::before {
          content: "";
          position: absolute;
          inset: 2px;
          border: 2px solid rgba(255,255,255,0.90);
          border-radius: 999px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.18);
        }

        .profile-showcase-visibility-symbol-public::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 2px;
          bottom: 2px;
          width: 2px;
          transform: translateX(-50%);
          background: rgba(255,255,255,0.86);
          box-shadow: -5px 0 0 -1px rgba(255,255,255,0.72), 5px 0 0 -1px rgba(255,255,255,0.72);
          border-radius: 999px;
        }

        .profile-showcase-visibility-symbol-friends::before,
        .profile-showcase-visibility-symbol-friends::after {
          content: "";
          position: absolute;
          border-radius: 999px;
          background: rgba(255,255,255,0.92);
        }

        .profile-showcase-visibility-symbol-friends::before {
          width: 8px;
          height: 8px;
          left: 2px;
          top: 3px;
          box-shadow: 7px 0 0 rgba(255,255,255,0.78);
        }

        .profile-showcase-visibility-symbol-friends::after {
          left: 0;
          right: 0;
          bottom: 2px;
          height: 8px;
          border-radius: 9px 9px 6px 6px;
        }

        .profile-showcase-visibility-symbol-private::before {
          content: "";
          position: absolute;
          left: 3px;
          right: 3px;
          bottom: 2px;
          height: 10px;
          border-radius: 4px;
          background: rgba(255,255,255,0.92);
        }

        .profile-showcase-visibility-symbol-private::after {
          content: "";
          position: absolute;
          left: 5px;
          top: 1px;
          width: 9px;
          height: 9px;
          border: 2px solid rgba(255,255,255,0.92);
          border-bottom: 0;
          border-radius: 9px 9px 0 0;
        }


        @media (max-width: 1180px) {
          .dashboard-desktop-left,
          .dashboard-right-rail {
            display: none !important;
          }

          .dashboard-mobile-insights {
            display: grid !important;
          }
        }

        @media (min-width: 1181px) {
          .dashboard-mobile-insights {
            display: none !important;
          }
        }

        @media (min-width: 761px) and (max-width: 1180px) {
          .dashboard-shell-pad {
            padding: 24px 18px 48px !important;
          }

          .dashboard-main-column {
            width: min(920px, 100%) !important;
            max-width: 920px !important;
            margin: 0 auto !important;
          }

          .dashboard-desktop-topbar {
            position: sticky !important;
            top: 12px !important;
            z-index: 50 !important;
            padding: 10px !important;
            border-radius: 26px !important;
            background: rgba(5, 7, 13, 0.82) !important;
            backdrop-filter: blur(18px) !important;
            border: 1px solid rgba(255,255,255,0.08) !important;
          }

          .dashboard-composer-card,
          .dashboard-feed-card {
            border-radius: 28px !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-desktop-topbar {
            display: none !important;
          }

          .dashboard-composer-card {
            padding: 14px !important;
          }

          .dashboard-composer-top-row {
            grid-template-columns: auto minmax(0, 1fr) !important;
          }

          .dashboard-composer-top-row > button {
            display: none !important;
          }

          .dashboard-composer-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .dashboard-composer-footer {
            align-items: stretch !important;
          }

          .dashboard-composer-footer > button {
            width: 100% !important;
            margin-left: 0 !important;
          }

          .dashboard-shell-pad {
            padding: 0 0 96px !important;
          }

          .dashboard-main-column {
            max-width: 100% !important;
            padding: 0 14px 0 !important;
          }

          .dashboard-card {
            border-radius: 24px !important;
          }

          .dashboard-feed-pulse {
            grid-template-columns: 1fr !important;
          }

          .dashboard-feed-pulse-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .dashboard-post-header {
            align-items: flex-start !important;
          }

          .dashboard-post-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .dashboard-shared-reel-frame {
            grid-template-columns: 1fr !important;
          }

          .dashboard-mobile-header {
            display: flex !important;
          }

          .dashboard-bottom-nav {
            display: grid !important;
          }
        }

        /* === Phase 6 dashboard responsive safety polish === */
        body {
          overflow-x: hidden;
          background: #07090d;
        }

        .dashboard-main-column,
        .dashboard-feed-card,
        .dashboard-card {
          min-width: 0;
        }

        .dashboard-card {
          overflow-wrap: anywhere;
        }

        .dashboard-card img,
        .dashboard-card video {
          max-width: 100%;
        }

        @media (max-width: 1180px) {
          .dashboard-desktop-topbar {
            max-width: 920px;
            margin-left: auto !important;
            margin-right: auto !important;
          }
        }

        @media (max-width: 920px) {
          .dashboard-composer-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-mobile-header {
            padding-top: max(14px, env(safe-area-inset-top)) !important;
          }

          .dashboard-bottom-nav {
            bottom: max(10px, env(safe-area-inset-bottom)) !important;
          }

          .dashboard-card {
            box-shadow: 0 12px 34px rgba(0,0,0,0.26) !important;
          }

          .dashboard-feed-card {
            padding: 14px !important;
          }

          .dashboard-post-actions button {
            min-height: 38px !important;
            font-size: 12px !important;
          }
        }

        /* === Phase 7 dashboard search + header polish === */
        .dashboard-search-parapost {
          transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease, transform 180ms ease;
        }

        .dashboard-search-parapost:focus-within {
          border-color: color-mix(in srgb, var(--parapost-accent-text) 62%, transparent) !important;
          background: rgba(255,255,255,0.075) !important;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 4px color-mix(in srgb, var(--parapost-accent-2) 11%, transparent), 0 18px 42px rgba(0,0,0,0.26) !important;
        }

        .dashboard-search-parapost input::placeholder {
          color: rgba(209,213,219,0.78);
        }

        .dashboard-desktop-topbar {
          min-width: 0;
        }

        .dashboard-desktop-topbar > div:first-child {
          min-width: 0;
        }

        @media (min-width: 1181px) {
          .dashboard-desktop-topbar {
            position: sticky !important;
            top: 16px !important;
            z-index: 45 !important;
            padding: 10px !important;
            margin: -10px -10px 18px !important;
            border-radius: 28px !important;
            background: linear-gradient(180deg, rgba(5,7,13,0.76), rgba(5,7,13,0.48)) !important;
            backdrop-filter: blur(18px) !important;
            border: 1px solid rgba(255,255,255,0.07) !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-search-modal-bar {
            height: 48px !important;
            border-radius: 18px !important;
          }

          .dashboard-mobile-header {
            box-shadow: 0 14px 32px rgba(0,0,0,0.22) !important;
          }

          .dashboard-mobile-header a:first-child {
            min-width: 0 !important;
          }

          .dashboard-mobile-header a:first-child > div:last-child {
            min-width: 0 !important;
          }
        }

        @media (max-width: 430px) {
          .dashboard-mobile-header {
            gap: 8px !important;
            padding-left: 12px !important;
            padding-right: 12px !important;
          }

          .dashboard-mobile-header a:first-child > div:first-child {
            width: 46px !important;
            height: 46px !important;
          }

          .dashboard-mobile-header a:first-child > div:last-child > div:first-child {
            font-size: 21px !important;
          }

          .dashboard-mobile-header a:first-child > div:last-child > div:last-child {
            font-size: 10px !important;
            letter-spacing: 0.32em !important;
          }

          .dashboard-mobile-header button,
          .dashboard-mobile-header a[aria-label="Notifications"],
          .dashboard-mobile-header a[aria-label="Parachat"] {
            width: 38px !important;
            height: 38px !important;
            border-radius: 13px !important;
          }
        }


        /* === Phase 8 dashboard showcase + quick actions polish === */
        .dashboard-showcase-quick-card {
          overflow: hidden;
        }

        .dashboard-showcase-scroll {
          scrollbar-width: thin;
          scrollbar-color: color-mix(in srgb, var(--parapost-accent-2) 45%, transparent) rgba(255,255,255,0.04);
        }

        .dashboard-showcase-scroll::-webkit-scrollbar {
          height: 6px;
        }

        .dashboard-showcase-scroll::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, var(--parapost-accent-2) 44%, transparent);
          border-radius: 999px;
        }

        @media (max-width: 920px) {
          .dashboard-showcase-quick-grid {
            grid-template-columns: 1fr !important;
          }

          .dashboard-quick-actions-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 520px) {
          .dashboard-showcase-quick-card {
            padding: 13px !important;
          }

          .dashboard-quick-actions-grid {
            grid-template-columns: 1fr !important;
          }
        }



        /* === Phase 10 dashboard mobile/tablet template alignment === */
        /* Keeps Phase 10 mobile/tablet safety polish, but leaves the Showcase/Quick Actions section at the Phase 9 layout. */
        .dashboard-shell-pad,
        .dashboard-main-column,
        .dashboard-card,
        .dashboard-feed-card,
        .dashboard-mobile-insights,
        .dashboard-right-card {
          box-sizing: border-box;
        }

        .dashboard-main-column {
          isolation: isolate;
        }

        .dashboard-card,
        .dashboard-feed-card,
        .dashboard-right-card {
          transform: translateZ(0);
        }

        @media (min-width: 1181px) {
          .dashboard-grid-desktop-safe {
            align-items: start;
          }

          .dashboard-main-column {
            gap: 18px !important;
          }
        }

        @media (min-width: 761px) and (max-width: 1180px) {
          .dashboard-shell-pad {
            padding: 18px 18px 74px !important;
          }

          .dashboard-main-column {
            width: min(940px, 100%) !important;
            max-width: 940px !important;
            margin: 0 auto !important;
            gap: 18px !important;
          }

          .dashboard-desktop-topbar {
            display: flex !important;
            min-height: 68px !important;
          }

          .dashboard-search-parapost {
            max-width: min(560px, 58vw) !important;
          }

          .dashboard-composer-card,
          .dashboard-feed-card,
          .dashboard-mobile-insights {
            border-radius: 30px !important;
          }

          .dashboard-mobile-insights {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            align-items: start !important;
          }

          .dashboard-mobile-insights > div:first-child,
          .dashboard-mobile-insights > div:nth-child(2),
          .dashboard-mobile-insights > div:nth-child(3),
          .dashboard-mobile-insights > div:nth-child(4) {
            grid-column: 1 / -1;
          }

          .dashboard-mobile-insights > div:nth-child(5),
          .dashboard-mobile-insights > div:nth-child(6) {
            min-height: 128px;
          }

          .dashboard-composer-actions {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }

          .dashboard-post-actions {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-shell-pad {
            padding: 0 0 calc(112px + env(safe-area-inset-bottom)) !important;
          }

          .dashboard-mobile-header {
            min-height: 70px !important;
            padding: max(12px, env(safe-area-inset-top)) 12px 10px !important;
          }

          .dashboard-mobile-header a:first-child {
            flex: 1 1 auto !important;
            min-width: 0 !important;
            gap: 9px !important;
          }

          .dashboard-mobile-header a:first-child > div:first-child {
            width: 46px !important;
            height: 46px !important;
            min-width: 46px !important;
          }

          .dashboard-mobile-header a:first-child > div:last-child {
            min-width: 0 !important;
            overflow: hidden !important;
          }

          .dashboard-mobile-header a:first-child > div:last-child > div:first-child {
            font-size: clamp(19px, 6vw, 24px) !important;
            line-height: 0.96 !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }

          .dashboard-mobile-header a:first-child > div:last-child > div:last-child {
            font-size: clamp(9px, 2.8vw, 12px) !important;
            letter-spacing: clamp(0.22em, 4vw, 0.38em) !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }

          .dashboard-mobile-header button,
          .dashboard-mobile-header a[aria-label="Notifications"],
          .dashboard-mobile-header a[aria-label="Parachat"] {
            width: 40px !important;
            height: 40px !important;
            min-width: 40px !important;
            border-radius: 14px !important;
          }

          .dashboard-main-column {
            padding: 0 12px !important;
            gap: 14px !important;
          }

          .dashboard-composer-card {
            padding: 13px !important;
            border-radius: 24px !important;
          }

          .dashboard-composer-top-row {
            gap: 7px !important;
          }

          .dashboard-composer-top-row textarea {
            min-height: 78px !important;
            border-radius: 20px !important;
          }

          .dashboard-composer-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }

          .dashboard-composer-actions a,
          .dashboard-composer-actions button {
            min-height: 42px !important;
            padding: 8px 10px !important;
            font-size: 12px !important;
          }

          .dashboard-composer-footer {
            gap: 7px !important;
          }

          .dashboard-feed-pulse {
            border-radius: 22px !important;
            padding: 13px !important;
          }

          .dashboard-feed-card {
            border-radius: 23px !important;
            padding: 14px !important;
          }

          .dashboard-post-header {
            gap: 7px !important;
          }

          .dashboard-post-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 7px !important;
          }

          .dashboard-post-actions button {
            min-height: 39px !important;
            border-radius: 13px !important;
          }

          .dashboard-shared-reel-frame {
            grid-template-columns: 1fr !important;
            padding: 11px !important;
          }

          .dashboard-shared-reel-frame a:first-child {
            width: min(210px, 68vw) !important;
            margin: 0 auto !important;
          }

          .dashboard-mobile-insights {
            margin-top: 0 !important;
            padding: 13px !important;
            border-radius: 24px !important;
            gap: 9px !important;
          }

          .dashboard-mobile-insights > div {
            min-width: 0 !important;
          }

          .dashboard-bottom-nav {
            width: min(calc(100vw - 22px), 520px) !important;
            min-height: 78px !important;
            padding: 8px 8px 10px !important;
            border-radius: 28px !important;
          }

          .dashboard-bottom-nav a span:last-child {
            font-size: 10.5px !important;
          }
        }

        @media (max-width: 420px) {
          .dashboard-main-column {
            padding-left: 10px !important;
            padding-right: 10px !important;
          }

          .dashboard-composer-actions {
            grid-template-columns: 1fr 1fr !important;
          }

          .dashboard-post-actions {
            grid-template-columns: 1fr 1fr !important;
          }

          .dashboard-bottom-nav {
            width: min(calc(100vw - 18px), 520px) !important;
          }
        }

        @media (max-width: 360px) {
          .dashboard-mobile-header a:first-child > div:last-child > div:first-child {
            font-size: 18px !important;
          }

          .dashboard-mobile-header button,
          .dashboard-mobile-header a[aria-label="Notifications"],
          .dashboard-mobile-header a[aria-label="Parachat"] {
            width: 36px !important;
            height: 36px !important;
            min-width: 36px !important;
          }

          .dashboard-bottom-nav a span:last-child {
            font-size: 9.5px !important;
          }
        }


        /* === Dashboard mobile template hard fix: stop horizontal overflow and match uploaded mobile mockup === */
        html,
        body {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow-x: hidden !important;
          background: #05070d !important;
        }

        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }

        @media (max-width: 1180px) {
          .dashboard-grid-desktop-safe {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            grid-template-columns: 1fr !important;
            gap: 0 !important;
            overflow-x: hidden !important;
            overflow-y: visible !important;
            height: auto !important;
            min-height: auto !important;
          }

          .dashboard-main-column {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            margin-left: auto !important;
            margin-right: auto !important;
            overflow-x: hidden !important;
            overflow-y: visible !important;
            height: auto !important;
            min-height: auto !important;
          }

          .dashboard-card,
          .dashboard-feed-card,
          .dashboard-composer-card,
          .dashboard-mobile-insights {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-shell-pad {
            width: 100% !important;
            max-width: 100vw !important;
            overflow-x: hidden !important;
            overflow-y: visible !important;
            height: auto !important;
            min-height: auto !important;
            -webkit-overflow-scrolling: touch !important;
          }

          .dashboard-main-column {
            padding-left: 14px !important;
            padding-right: 14px !important;
          }

          .dashboard-showcase-row {
            padding: 12px !important;
            margin-bottom: 14px !important;
            border-radius: 24px !important;
            overflow: hidden !important;
          }

          .dashboard-showcase-scroller {
            display: flex !important;
            gap: 14px !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            max-width: 100% !important;
            padding: 0 0 8px !important;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
          }

          .dashboard-showcase-scroller::-webkit-scrollbar {
            display: none;
          }

          .dashboard-showcase-scroller > a,
          .dashboard-showcase-scroller > div {
            flex: 0 0 auto !important;
          }

          .dashboard-composer-card {
            overflow: hidden !important;
          }

          .dashboard-composer-card textarea,
          .dashboard-composer-card input,
          .dashboard-composer-card button,
          .dashboard-composer-card a {
            max-width: 100% !important;
          }

          .dashboard-composer-top-row {
            grid-template-columns: 42px minmax(0, 1fr) !important;
            align-items: start !important;
          }

          .dashboard-composer-top-row textarea {
            min-width: 0 !important;
            width: 100% !important;
          }

          .dashboard-composer-actions > * {
            min-width: 0 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
          }

          .dashboard-feed-card {
            overflow: hidden !important;
          }

          .dashboard-post-header,
          .dashboard-post-header > div:first-child {
            min-width: 0 !important;
          }

          .dashboard-post-header button {
            white-space: nowrap !important;
            min-width: fit-content !important;
            flex-shrink: 0 !important;
          }

          .dashboard-post-actions > button {
            min-width: 0 !important;
            white-space: nowrap !important;
          }

          .dashboard-feed-pulse-stats,
          .dashboard-mobile-insights,
          .dashboard-mobile-insights * {
            min-width: 0 !important;
          }
        }


        .dashboard-mobile-menu-drawer {
          touch-action: pan-y !important;
          overscroll-behavior: contain !important;
        }

        .dashboard-mobile-menu-drawer * {
          overscroll-behavior: contain;
        }

        .dashboard-mobile-menu-scroll-area {
          height: calc(100vh - 78px) !important;
          max-height: calc(100vh - 78px) !important;
          overflow-y: scroll !important;
          overflow-x: hidden !important;
          -webkit-overflow-scrolling: touch !important;
          overscroll-behavior-y: contain !important;
          touch-action: pan-y !important;
        }

        @supports (height: 100dvh) {
          .dashboard-mobile-menu-scroll-area {
            height: calc(100dvh - 78px) !important;
            max-height: calc(100dvh - 78px) !important;
          }
        }

        /* === Dashboard mobile vertical scroll fix === */
        html,
        body {
          min-height: 100% !important;
          height: auto !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch !important;
          overscroll-behavior-y: auto !important;
        }

        body {
          position: static !important;
          touch-action: pan-y manipulation !important;
        }

        @media (max-width: 1180px) {
          #__next,
          [data-nextjs-scroll-focus-boundary],
          .dashboard-shell-pad,
          .dashboard-grid-desktop-safe,
          .dashboard-main-column {
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            overflow-y: visible !important;
            overscroll-behavior-y: auto !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-shell-pad {
            padding-bottom: calc(142px + env(safe-area-inset-bottom)) !important;
          }

          .dashboard-main-column {
            padding-bottom: 36px !important;
          }

          .dashboard-bottom-nav {
            pointer-events: auto !important;
          }
        }


        .dashboard-showcase-row {
          overflow: hidden !important;
        }

        .dashboard-showcase-scroller {
          -webkit-overflow-scrolling: touch !important;
          scrollbar-width: none !important;
        }

        .dashboard-showcase-scroller::-webkit-scrollbar {
          display: none !important;
        }

        @media (max-width: 760px) {
          .dashboard-showcase-row {
            padding: 11px !important;
            border-radius: 22px !important;
          }
        }


        .dashboard-showcase-scroller::-webkit-scrollbar {
          height: 6px;
        }

        .dashboard-showcase-scroller::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, var(--parapost-accent-2) 42%, transparent);
          border-radius: 999px;
        }

        @media (max-width: 760px) {
          .dashboard-showcase-row {
            border-radius: 22px !important;
            padding-top: 9px !important;
            padding-bottom: 14px !important;
          }
        }

        @media (max-width: 720px) {
          [aria-label="Create Showcase"] > div {
            grid-template-columns: 1fr !important;
          }
        }


        @media (max-width: 920px) {
          .profile-showcase-studio-layout {
            grid-template-columns: 1fr !important;
          }

          .profile-showcase-preview-column {
            order: -1 !important;
            border-left: 0 !important;
            padding-left: 0 !important;
            padding-bottom: 4px !important;
          }

          .profile-showcase-simple-controls {
            order: 1 !important;
          }

          .profile-showcase-preview-header {
            padding: 2px 2px 0 !important;
          }
        }

        @media (max-width: 760px) {
          .profile-showcase-modal-overlay {
            padding: 10px !important;
            align-items: stretch !important;
          }

          .profile-showcase-modal-shell {
            width: 100% !important;
            height: calc(100dvh - 20px) !important;
            max-height: calc(100dvh - 20px) !important;
            border-radius: 24px !important;
            padding: 14px !important;
          }

          .profile-showcase-modal-header {
            gap: 7px !important;
            margin-bottom: 12px !important;
          }

          .profile-showcase-upload-card {
            grid-template-columns: 48px minmax(0, 1fr) !important;
            min-height: 118px !important;
            padding: 16px !important;
            border-radius: 20px !important;
          }

          .profile-showcase-duration-options {
            grid-template-columns: 1fr !important;
          }

          .profile-showcase-preview-phone {
            min-height: 280px !important;
            height: 310px !important;
            border-radius: 24px !important;
          }

          .profile-showcase-modal-actions {
            position: sticky !important;
            bottom: -14px !important;
            z-index: 5 !important;
            margin: 10px -2px -2px !important;
            padding-top: 12px !important;
            background: linear-gradient(180deg, rgba(7,10,18,0.12), rgba(7,10,18,0.96) 44%, rgba(7,10,18,0.99)) !important;
            backdrop-filter: blur(12px) !important;
          }
        }



        /* === Phase 11 dashboard mobile/tablet layout polish === */
        /* Controlled responsive pass only: tighter spacing, safer scrolling, cleaner tablet/mobile card flow. */
        .dashboard-card,
        .dashboard-feed-card,
        .dashboard-mobile-insights,
        .dashboard-feed-pulse {
          box-sizing: border-box;
        }

        .dashboard-main-column > * {
          max-width: 100%;
        }

        .dashboard-showcase-scroller,
        .dashboard-mobile-insights,
        .dashboard-mobile-insights * {
          -webkit-tap-highlight-color: transparent;
        }

        @media (min-width: 761px) and (max-width: 1180px) {
          .dashboard-shell-pad {
            padding: 20px clamp(18px, 3vw, 28px) 86px !important;
          }

          .dashboard-grid-desktop-safe {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
          }

          .dashboard-main-column {
            width: min(940px, 100%) !important;
            max-width: 940px !important;
            margin: 0 auto !important;
            display: grid !important;
            gap: 18px !important;
            overflow: visible !important;
          }

          .dashboard-desktop-topbar {
            top: 12px !important;
            min-height: 66px !important;
            margin: 0 0 2px !important;
          }

          .dashboard-search-parapost {
            height: 52px !important;
            max-width: min(610px, 62vw) !important;
          }

          .dashboard-showcase-row {
            margin: 0 !important;
            padding: 14px 0 12px !important;
            border-radius: 28px !important;
          }

          .dashboard-showcase-scroller {
            gap: 15px !important;
            padding: 0 16px 9px !important;
            scroll-padding-left: 16px !important;
          }

          .dashboard-composer-card,
          .dashboard-feed-card,
          .dashboard-feed-pulse,
          .dashboard-mobile-insights,
          .dashboard-card:not(.dashboard-showcase-row) {
            border-radius: 28px !important;
          }

          .dashboard-composer-card {
            margin-bottom: 0 !important;
          }

          .dashboard-composer-actions {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }

          .dashboard-composer-actions a,
          .dashboard-composer-actions button {
            min-width: 0 !important;
          }

          .dashboard-feed-pulse {
            grid-template-columns: minmax(0, 0.9fr) minmax(360px, 1.1fr) !important;
            margin: 0 !important;
          }

          .dashboard-feed-pulse-stats {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }

          .dashboard-mobile-insights {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            align-items: stretch !important;
            gap: 14px !important;
            padding: 16px !important;
            margin: 0 !important;
          }

          .dashboard-mobile-insights > div {
            min-width: 0 !important;
          }

          .dashboard-mobile-insights > div:first-child,
          .dashboard-mobile-insights > div:nth-child(2),
          .dashboard-mobile-insights > div:nth-child(7) {
            grid-column: 1 / -1 !important;
          }

          .dashboard-mobile-insights > div:nth-child(3),
          .dashboard-mobile-insights > div:nth-child(4),
          .dashboard-mobile-insights > div:nth-child(5),
          .dashboard-mobile-insights > div:nth-child(6) {
            grid-column: auto !important;
          }

          .dashboard-mobile-insights > div:nth-child(3),
          .dashboard-mobile-insights > div:nth-child(4) {
            min-height: 136px !important;
          }

          .dashboard-post-actions {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }

          .dashboard-shared-reel-frame {
            grid-template-columns: minmax(160px, 210px) minmax(0, 1fr) !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-shell-pad {
            padding: 0 0 calc(152px + env(safe-area-inset-bottom)) !important;
          }

          .dashboard-grid-desktop-safe {
            padding: 0 !important;
          }

          .dashboard-main-column {
            display: grid !important;
            gap: 7px !important;
            padding: 0 clamp(10px, 3.6vw, 15px) 34px !important;
            width: 100% !important;
          }

          .dashboard-mobile-header {
            position: sticky !important;
            top: 0 !important;
            z-index: 130 !important;
            min-height: 68px !important;
            padding: max(10px, env(safe-area-inset-top)) clamp(10px, 3.3vw, 14px) 10px !important;
            gap: 8px !important;
            background: linear-gradient(180deg, rgba(5,7,13,0.99), rgba(5,7,13,0.90)) !important;
            border-bottom: 1px solid rgba(255,255,255,0.06) !important;
          }

          .dashboard-mobile-header a:first-child {
            gap: 8px !important;
            min-width: 0 !important;
          }

          .dashboard-mobile-header a:first-child > div:first-child {
            width: clamp(42px, 11.5vw, 48px) !important;
            height: clamp(42px, 11.5vw, 48px) !important;
            min-width: clamp(42px, 11.5vw, 48px) !important;
          }

          .dashboard-mobile-header a:first-child > div:last-child > div:first-child {
            font-size: clamp(18px, 6vw, 23px) !important;
            letter-spacing: -0.02em !important;
          }

          .dashboard-mobile-header a:first-child > div:last-child > div:last-child {
            font-size: clamp(9px, 2.7vw, 11px) !important;
            letter-spacing: clamp(0.20em, 3.7vw, 0.34em) !important;
          }

          .dashboard-mobile-header button,
          .dashboard-mobile-header a[aria-label="Notifications"],
          .dashboard-mobile-header a[aria-label="Parachat"] {
            width: clamp(36px, 10.5vw, 40px) !important;
            height: clamp(36px, 10.5vw, 40px) !important;
            min-width: clamp(36px, 10.5vw, 40px) !important;
            border-radius: 13px !important;
          }

          .dashboard-showcase-row {
            margin: 10px 0 0 !important;
            padding: 10px 0 12px !important;
            border-radius: 23px !important;
          }

          .dashboard-showcase-row h3 {
            font-size: 15px !important;
          }

          .dashboard-showcase-scroller {
            gap: 9px !important;
            min-height: 84px !important;
            padding: 0 12px 8px !important;
            scroll-padding-left: 12px !important;
          }

          .dashboard-showcase-scroller > button,
          .dashboard-showcase-scroller > a {
            width: 70px !important;
            min-width: 70px !important;
          }

          .dashboard-showcase-scroller > button > span:first-child,
          .dashboard-showcase-scroller > a > span:first-child {
            width: 56px !important;
            height: 56px !important;
          }

          .dashboard-composer-card {
            margin: 0 !important;
            padding: 13px !important;
            border-radius: 23px !important;
          }

          .dashboard-composer-top-row {
            grid-template-columns: 42px minmax(0, 1fr) !important;
            gap: 7px !important;
          }

          .dashboard-composer-top-row textarea {
            min-height: 76px !important;
            padding: 13px 14px !important;
            font-size: 16px !important;
            line-height: 1.42 !important;
            border-radius: 19px !important;
          }

          .dashboard-composer-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
            margin-top: 11px !important;
          }

          .dashboard-composer-actions a,
          .dashboard-composer-actions button {
            min-height: 41px !important;
            padding: 8px 9px !important;
            border-radius: 14px !important;
            font-size: 12px !important;
            justify-content: center !important;
          }

          .dashboard-composer-footer {
            margin-top: 11px !important;
          }

          .dashboard-composer-footer > button {
            min-height: 42px !important;
            border-radius: 15px !important;
          }

          .dashboard-card:not(.dashboard-showcase-row),
          .dashboard-feed-card,
          .dashboard-feed-pulse,
          .dashboard-mobile-insights {
            border-radius: 23px !important;
          }

          .dashboard-feed-pulse {
            margin: 0 !important;
            padding: 13px !important;
            gap: 9px !important;
          }

          .dashboard-feed-pulse-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }

          .dashboard-mobile-insights {
            margin: 0 !important;
            padding: 13px !important;
            gap: 11px !important;
          }

          .dashboard-mobile-insights > div:first-child {
            align-items: flex-start !important;
          }

          .dashboard-mobile-insights > div:nth-child(3),
          .dashboard-mobile-insights > div:nth-child(4) {
            grid-column: 1 / -1 !important;
          }

          .dashboard-mobile-insights a,
          .dashboard-mobile-insights button {
            min-height: 40px !important;
          }

          .dashboard-mobile-insights [style*="overflow-x: auto"] {
            scrollbar-width: none !important;
          }

          .dashboard-mobile-insights [style*="overflow-x: auto"]::-webkit-scrollbar {
            display: none !important;
          }

          .dashboard-post-header {
            gap: 7px !important;
            margin-bottom: 12px !important;
          }

          .dashboard-post-header > div:first-child {
            align-items: flex-start !important;
          }

          .dashboard-feed-card {
            padding: 14px !important;
          }

          .dashboard-feed-card p {
            font-size: 15px !important;
          }

          .dashboard-post-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 7px !important;
          }

          .dashboard-post-actions button {
            min-height: 39px !important;
            padding: 0 8px !important;
            border-radius: 13px !important;
            font-size: 12px !important;
          }

          .dashboard-shared-reel-frame {
            grid-template-columns: 1fr !important;
            gap: 9px !important;
            padding: 11px !important;
            border-radius: 20px !important;
          }

          .dashboard-shared-reel-frame a:first-child {
            width: min(188px, 62vw) !important;
            max-height: 334px !important;
            margin: 0 auto !important;
          }

          .dashboard-bottom-nav {
            left: clamp(8px, 2.8vw, 12px) !important;
            right: clamp(8px, 2.8vw, 12px) !important;
            bottom: max(9px, env(safe-area-inset-bottom)) !important;
            min-height: 72px !important;
            padding: 7px 8px !important;
            border-radius: 24px !important;
            z-index: 150 !important;
          }
        }

        @media (max-width: 420px) {
          .dashboard-main-column {
            gap: 9px !important;
            padding-left: 10px !important;
            padding-right: 10px !important;
          }

          .dashboard-composer-actions a,
          .dashboard-composer-actions button {
            font-size: 11.5px !important;
            gap: 6px !important;
          }

          .dashboard-feed-pulse-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 370px) {
          .dashboard-mobile-header {
            gap: 6px !important;
          }

          .dashboard-mobile-header a:first-child > div:last-child > div:last-child {
            display: none !important;
          }

          .dashboard-composer-actions a,
          .dashboard-composer-actions button {
            grid-template-columns: 1fr !important;
          }

          .dashboard-bottom-nav a span:last-child {
            font-size: 9.5px !important;
          }
        }

        .dashboard-tablet-menu-button {
          display: none !important;
        }

        @media (max-width: 1180px) {
          .dashboard-tablet-menu-button {
            display: grid !important;
          }
        }

        .dashboard-mobile-sponsored-placement {
          display: none;
        }

        @media (max-width: 1180px) {
          .dashboard-mobile-insights {
            display: none !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-mobile-sponsored-placement {
            display: grid !important;
            gap: 9px !important;
          }

          .dashboard-mobile-header a[aria-label="Parachat"],
          .dashboard-mobile-header button[aria-label="Open dashboard menu"],
          .dashboard-mobile-header button[aria-label="Search Parapost"],
          .dashboard-mobile-header a[aria-label="Notifications"] {
            flex-shrink: 0 !important;
          }
        }

        @media (max-width: 430px) {
          .dashboard-mobile-header button[aria-label="Open dashboard menu"] {
            display: grid !important;
          }

          .dashboard-mobile-header button,
          .dashboard-mobile-header a[aria-label="Notifications"],
          .dashboard-mobile-header a[aria-label="Parachat"] {
            width: 36px !important;
            height: 36px !important;
            min-width: 36px !important;
          }
        }

        @media (max-width: 370px) {
          .dashboard-mobile-header a:first-child > div:first-child {
            width: 38px !important;
            height: 38px !important;
            min-width: 38px !important;
          }

          .dashboard-mobile-header a:first-child > div:last-child > div:first-child {
            font-size: 17px !important;
          }

          .dashboard-mobile-header button,
          .dashboard-mobile-header a[aria-label="Notifications"],
          .dashboard-mobile-header a[aria-label="Parachat"] {
            width: 34px !important;
            height: 34px !important;
            min-width: 34px !important;
          }
        }

        /* === Phase 5 mobile bottom navigation hardening === */
        @media (max-width: 760px) {
          .dashboard-bottom-nav {
            display: grid !important;
            left: 50% !important;
            right: auto !important;
            width: min(calc(100vw - 22px), 520px) !important;
            transform: translateX(-50%) !important;
            grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
            justify-items: center !important;
            align-items: center !important;
          }

          .dashboard-bottom-nav a {
            min-width: 0 !important;
            width: 100% !important;
          }

          .dashboard-bottom-nav a span:last-child {
            display: block !important;
            max-width: 100% !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
          }
        }

        @media (min-width: 761px) {
          .dashboard-mobile-header,
          .dashboard-bottom-nav {
            display: none !important;
          }
        }


        /* === Phase 2 mobile/tablet dashboard shell polish === */
        /* Mobile and tablet now use a clean app-style dashboard instead of squeezed desktop columns. */
        @media (max-width: 1024px) {
          html,
          body {
            width: 100% !important;
            max-width: 100% !important;
            overflow-x: hidden !important;
          }

          .dashboard-shell-pad {
            padding: 10px max(10px, env(safe-area-inset-left)) calc(96px + env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-right)) !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }

          .dashboard-grid-desktop-safe {
            display: block !important;
            width: 100% !important;
            max-width: 820px !important;
            margin: 0 auto !important;
          }

          .dashboard-desktop-left,
          .dashboard-right-rail,
          .dashboard-desktop-topbar,
          .dashboard-tablet-menu-button {
            display: none !important;
          }

          .dashboard-mobile-header {
            display: flex !important;
            position: sticky !important;
            top: 0 !important;
            z-index: 120 !important;
            margin: -2px 0 12px !important;
            padding: 8px 8px !important;
            border: 1px solid rgba(255,255,255,0.08) !important;
            border-radius: 22px !important;
            background: linear-gradient(180deg, rgba(7,9,13,0.92), rgba(7,9,13,0.72)) !important;
            backdrop-filter: blur(18px) !important;
            box-shadow: 0 12px 34px rgba(0,0,0,0.28), 0 0 24px var(--parapost-accent-glow) !important;
          }

          .dashboard-main-column {
            width: 100% !important;
            max-width: 760px !important;
            margin: 0 auto !important;
            display: grid !important;
            gap: 9px !important;
          }

          .dashboard-card {
            max-width: 100% !important;
            box-sizing: border-box !important;
          }

          .dashboard-showcase-row {
            margin: 0 !important;
            padding: 13px 12px !important;
            border-radius: 24px !important;
          }

          .dashboard-showcase-scroller {
            gap: 9px !important;
            padding: 2px 2px 6px !important;
            overflow-x: auto !important;
            scrollbar-width: none !important;
          }

          .dashboard-showcase-scroller::-webkit-scrollbar {
            display: none !important;
          }

          .dashboard-composer-card {
            margin: 0 !important;
            padding: 13px !important;
            border-radius: 24px !important;
          }

          .dashboard-composer-top-row {
            grid-template-columns: auto minmax(0, 1fr) auto !important;
            gap: 7px !important;
            align-items: center !important;
          }

          .dashboard-composer-top-row textarea {
            min-height: 48px !important;
            padding: 12px 14px !important;
            border-radius: 18px !important;
            font-size: 14px !important;
          }

          .dashboard-composer-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }

          .dashboard-composer-actions a,
          .dashboard-composer-actions button {
            min-height: 42px !important;
            justify-content: flex-start !important;
            padding: 0 10px !important;
          }

          .dashboard-composer-footer {
            margin-top: 10px !important;
            justify-content: flex-end !important;
          }

          .dashboard-composer-footer button {
            width: 100% !important;
            min-height: 40px !important;
            border-radius: 16px !important;
          }

          .dashboard-feed-pulse {
            margin: 0 !important;
            border-radius: 22px !important;
            padding: 13px !important;
            grid-template-columns: 1fr !important;
          }

          .dashboard-feed-pulse-stats {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 7px !important;
          }

          .dashboard-feed-card {
            border-radius: 23px !important;
            padding: 14px !important;
            margin: 0 !important;
            box-shadow: 0 14px 34px rgba(0,0,0,0.26), 0 0 22px color-mix(in srgb, var(--parapost-accent-2) 10%, transparent) !important;
          }

          .dashboard-post-header {
            gap: 7px !important;
            align-items: flex-start !important;
          }

          .dashboard-post-actions {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }

          .dashboard-post-actions button {
            justify-content: center !important;
            min-width: 0 !important;
            padding-left: 9px !important;
            padding-right: 9px !important;
          }

          .dashboard-post-actions button:nth-child(4) {
            display: none !important;
          }

          .dashboard-mobile-sponsored-placement {
            display: grid !important;
            gap: 9px !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-shell-pad {
            padding-left: 8px !important;
            padding-right: 8px !important;
          }

          .dashboard-mobile-header {
            margin-bottom: 10px !important;
            border-radius: 20px !important;
          }

          .dashboard-mobile-header a:first-child > div:last-child > div:last-child {
            display: none !important;
          }

          .dashboard-main-column {
            max-width: 100% !important;
            gap: 7px !important;
          }

          .dashboard-feed-pulse {
            display: none !important;
          }

          .dashboard-composer-actions {
            grid-template-columns: 1fr 1fr !important;
          }

          .dashboard-composer-actions a,
          .dashboard-composer-actions button {
            font-size: 12px !important;
          }

          .dashboard-feed-card {
            padding: 13px !important;
            border-radius: 21px !important;
          }

          .dashboard-post-actions {
            border-radius: 18px !important;
            padding: 6px !important;
            background: rgba(255,255,255,0.025) !important;
          }
        }

        @media (min-width: 761px) and (max-width: 1024px) {
          .dashboard-mobile-header {
            max-width: 820px !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }

          .dashboard-bottom-nav {
            display: none !important;
          }

          .dashboard-feed-card,
          .dashboard-composer-card,
          .dashboard-showcase-row,
          .dashboard-feed-pulse {
            border-radius: 28px !important;
          }
        }

        @media (min-width: 761px) and (max-width: 900px) {
          .dashboard-bottom-nav {
            display: none !important;
          }
        }


        /* === Final mobile bottom nav override: keep Home/Reels/Create/Parachat/Profile aligned === */
        @media (max-width: 760px) {
          .dashboard-bottom-nav {
            display: grid !important;
            position: fixed !important;
            left: 50% !important;
            right: auto !important;
            bottom: max(10px, env(safe-area-inset-bottom)) !important;
            width: min(calc(100vw - 22px), 520px) !important;
            min-height: 78px !important;
            transform: translateX(-50%) !important;
            grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
            align-items: center !important;
            justify-items: center !important;
            gap: 2px !important;
            padding: 8px 8px 10px !important;
            border-radius: 28px !important;
          }

          .dashboard-bottom-nav a {
            display: grid !important;
            grid-template-rows: 26px auto !important;
            place-items: center !important;
            align-content: center !important;
            width: 100% !important;
            min-width: 0 !important;
            height: 58px !important;
            gap: 3px !important;
          }

          .dashboard-bottom-nav a span:last-child {
            display: block !important;
            max-width: 100% !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            font-size: 10.5px !important;
            line-height: 1.05 !important;
          }
        }


        /* === Launch-ready dashboard media/composer polish === */
        .dashboard-composer-media-preview-wrap,
        .dashboard-composer-media-preview-grid,
        .dashboard-composer-media-preview-tile,
        .dashboard-shared-reel-card,
        .dashboard-shared-reel-frame {
          box-sizing: border-box;
        }

        .dashboard-composer-media-preview-tile video,
        .dashboard-composer-media-preview-tile img {
          -webkit-user-drag: none;
        }

        @media (min-width: 761px) {
          .dashboard-composer-media-preview-counter {
            opacity: 0.92;
          }
        }

        @media (max-width: 760px) {
          .dashboard-showcase-row {
            padding: 10px 12px 11px !important;
            margin-bottom: 10px !important;
            border-radius: 22px !important;
          }

          .dashboard-showcase-row h3 {
            font-size: 14px !important;
            line-height: 1.1 !important;
          }

          .dashboard-showcase-scroller {
            gap: 9px !important;
            min-height: 76px !important;
            padding: 0 4px 6px !important;
          }

          .dashboard-composer-card {
            padding: 12px !important;
            border-radius: 22px !important;
            margin-bottom: 10px !important;
          }

          .dashboard-composer-top-row {
            align-items: start !important;
            gap: 9px !important;
          }

          .dashboard-composer-top-row textarea {
            min-height: 64px !important;
            padding: 13px 14px !important;
            font-size: 14px !important;
          }

          .dashboard-composer-actions {
            margin-top: 10px !important;
            gap: 8px !important;
          }

          .dashboard-composer-footer {
            margin-top: 10px !important;
          }

          .dashboard-composer-media-preview-wrap {
            width: 100% !important;
            margin: 10px 0 0 !important;
            border-radius: 22px !important;
            overflow: hidden !important;
          }

          .dashboard-composer-media-preview-grid {
            display: flex !important;
            grid-template-columns: none !important;
            gap: 7px !important;
            max-height: none !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            padding: 10px !important;
            scroll-snap-type: x mandatory !important;
            -webkit-overflow-scrolling: touch !important;
          }

          .dashboard-composer-media-preview-grid::-webkit-scrollbar {
            display: none !important;
          }

          .dashboard-composer-media-preview-tile {
            flex: 0 0 100% !important;
            width: 100% !important;
            height: min(64vw, 292px) !important;
            min-height: 220px !important;
            scroll-snap-align: center !important;
            border-radius: 18px !important;
          }

          .dashboard-composer-media-preview-grid-single .dashboard-composer-media-preview-tile {
            height: min(62vw, 285px) !important;
          }

          .dashboard-composer-media-preview-counter {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
          }

          .dashboard-shared-reel-card {
            overflow: hidden !important;
          }

          .dashboard-shared-reel-frame {
            grid-template-columns: 104px minmax(0, 1fr) !important;
            gap: 11px !important;
            align-items: stretch !important;
            padding: 10px !important;
            border-radius: 20px !important;
          }

          .dashboard-shared-reel-media {
            width: 104px !important;
            min-height: 184px !important;
            max-height: 210px !important;
            margin: 0 !important;
            border-radius: 16px !important;
          }

          .dashboard-shared-reel-copy {
            justify-content: center !important;
            gap: 7px !important;
          }

          .dashboard-shared-reel-copy h3 {
            font-size: 16px !important;
            line-height: 1.14 !important;
            margin: 0 !important;
          }

          .dashboard-shared-reel-copy p {
            font-size: 12px !important;
          }

          .dashboard-shared-reel-copy a {
            min-height: 34px !important;
            padding: 0 12px !important;
            font-size: 12px !important;
          }
        }

        @media (max-width: 390px) {
          .dashboard-shared-reel-frame {
            grid-template-columns: 92px minmax(0, 1fr) !important;
          }

          .dashboard-shared-reel-media {
            width: 92px !important;
            min-height: 164px !important;
          }
        }


        /* === Dashboard visual polish pass: mobile/tablet/desktop flow === */
        .dashboard-main-column {
          min-width: 0;
        }

        .dashboard-card {
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }

        .dashboard-feed-card {
          overflow: visible;
        }

        .dashboard-post-header {
          min-width: 0;
        }

        .dashboard-post-actions button {
          min-width: 0;
        }

        @media (min-width: 1181px) {
          .dashboard-main-column {
            gap: 14px !important;
          }

          .dashboard-showcase-row,
          .dashboard-composer-card,
          .dashboard-feed-pulse,
          .dashboard-feed-card {
            box-shadow:
              0 18px 48px rgba(0,0,0,0.28),
              inset 0 1px 0 rgba(255,255,255,0.045) !important;
          }

          .dashboard-composer-card {
            margin-bottom: 14px !important;
          }
        }

        @media (min-width: 761px) and (max-width: 1180px) {
          .dashboard-shell-pad {
            padding-left: 18px !important;
            padding-right: 18px !important;
          }

          .dashboard-grid-desktop-safe {
            gap: 16px !important;
          }

          .dashboard-main-column {
            max-width: 760px !important;
            margin-inline: auto !important;
          }

          .dashboard-showcase-row {
            padding: 12px 14px 12px !important;
            border-radius: 24px !important;
          }

          .dashboard-showcase-scroller {
            min-height: 82px !important;
            gap: 14px !important;
            padding-bottom: 6px !important;
          }

          .dashboard-composer-card {
            padding: 16px !important;
            border-radius: 24px !important;
          }

          .dashboard-composer-actions {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 9px !important;
          }

          .dashboard-feed-card {
            padding: 17px !important;
            border-radius: 24px !important;
          }

          .dashboard-shared-reel-frame {
            grid-template-columns: 150px minmax(0, 1fr) !important;
          }

          .dashboard-shared-reel-media {
            min-height: 240px !important;
            max-height: 300px !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-shell-pad {
            padding-top: 10px !important;
            padding-left: 10px !important;
            padding-right: 10px !important;
            padding-bottom: calc(104px + env(safe-area-inset-bottom)) !important;
          }

          .dashboard-mobile-header {
            margin-bottom: 10px !important;
          }

          .dashboard-main-column {
            gap: 7px !important;
          }

          .dashboard-showcase-row {
            padding: 10px 10px 9px !important;
            margin-bottom: 10px !important;
            border-radius: 22px !important;
          }

          .dashboard-showcase-row h3 {
            font-size: 13.5px !important;
            letter-spacing: -0.01em !important;
          }

          .dashboard-showcase-scroller {
            min-height: 72px !important;
            gap: 11px !important;
            padding: 0 2px 5px !important;
            scrollbar-width: none !important;
          }

          .dashboard-showcase-scroller::-webkit-scrollbar {
            display: none !important;
          }

          .dashboard-showcase-scroller button {
            min-width: 62px !important;
            width: 62px !important;
          }

          .dashboard-composer-card {
            padding: 11px !important;
            border-radius: 22px !important;
            margin-bottom: 10px !important;
          }

          .dashboard-composer-top-row {
            grid-template-columns: auto minmax(0, 1fr) !important;
            gap: 9px !important;
            align-items: start !important;
          }

          .dashboard-composer-top-row > button {
            display: none !important;
          }

          .dashboard-composer-top-row textarea {
            min-height: 58px !important;
            padding: 12px 13px !important;
            border-radius: 17px !important;
            font-size: 13.5px !important;
          }

          .dashboard-composer-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
            margin-top: 10px !important;
          }

          .dashboard-composer-actions a,
          .dashboard-composer-actions button {
            min-height: 40px !important;
            border-radius: 14px !important;
            font-size: 12px !important;
            justify-content: center !important;
          }

          .dashboard-composer-footer {
            margin-top: 9px !important;
          }

          .dashboard-composer-footer button {
            width: 100% !important;
            min-height: 41px !important;
            border-radius: 15px !important;
          }

          .dashboard-composer-media-preview-wrap {
            width: 100% !important;
            max-width: 100% !important;
            margin-top: 10px !important;
            border-radius: 20px !important;
            background: rgba(0,0,0,0.28) !important;
          }

          .dashboard-composer-media-preview-grid {
            padding: 9px !important;
            gap: 9px !important;
          }

          .dashboard-composer-media-preview-tile {
            min-height: 214px !important;
            height: min(62vw, 286px) !important;
            border-radius: 17px !important;
          }

          .dashboard-composer-media-preview-counter {
            right: 9px !important;
            top: 9px !important;
            font-size: 11.5px !important;
          }

          .dashboard-composer-media-preview-wrap button[aria-label^="Remove selected media"]::after {
            content: "Tap to remove";
            position: absolute;
            left: 9px;
            bottom: 9px;
            border-radius: 999px;
            padding: 5px 8px;
            background: rgba(0,0,0,0.66);
            border: 1px solid rgba(255,255,255,0.14);
            color: #fff;
            font-size: 11px;
            font-weight: 900;
          }

          .dashboard-feed-pulse {
            padding: 12px !important;
            border-radius: 20px !important;
          }

          .dashboard-feed-pulse-stats {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 7px !important;
          }

          .dashboard-feed-card {
            padding: 13px !important;
            border-radius: 22px !important;
          }

          .dashboard-post-header {
            align-items: flex-start !important;
            gap: 7px !important;
            margin-bottom: 11px !important;
          }

          .dashboard-post-actions {
            gap: 7px !important;
            margin-top: 10px !important;
          }

          .dashboard-post-actions button {
            min-height: 38px !important;
            border-radius: 14px !important;
            font-size: 12px !important;
            padding-left: 6px !important;
            padding-right: 6px !important;
          }

          .dashboard-feed-card p {
            font-size: 14.5px !important;
            line-height: 1.52 !important;
          }

          .dashboard-feed-card img,
          .dashboard-feed-card video {
            max-height: 470px !important;
          }

          .dashboard-shared-reel-card {
            padding: 12px !important;
          }

          .dashboard-shared-reel-frame {
            grid-template-columns: 98px minmax(0, 1fr) !important;
            gap: 7px !important;
            padding: 9px !important;
            border-radius: 18px !important;
          }

          .dashboard-shared-reel-media {
            width: 98px !important;
            min-height: 174px !important;
            max-height: 202px !important;
            border-radius: 15px !important;
          }

          .dashboard-shared-reel-copy h3 {
            font-size: 15.5px !important;
          }

          .dashboard-bottom-nav {
            left: 10px !important;
            right: 10px !important;
            width: auto !important;
            max-width: none !important;
            transform: none !important;
            bottom: calc(10px + env(safe-area-inset-bottom)) !important;
            border-radius: 24px !important;
          }
        }

        @media (max-width: 760px) {
          nav.dashboard-bottom-nav {
            left: 10px !important;
            right: 10px !important;
            width: auto !important;
            max-width: none !important;
            transform: none !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
          }
        }

        @media (max-width: 410px) {
          .dashboard-composer-actions {
            grid-template-columns: 1fr 1fr !important;
          }

          .dashboard-composer-actions a,
          .dashboard-composer-actions button {
            font-size: 11.5px !important;
            gap: 6px !important;
          }

          .dashboard-feed-pulse-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .dashboard-post-actions button {
            font-size: 11.5px !important;
          }

          .dashboard-shared-reel-frame {
            grid-template-columns: 88px minmax(0, 1fr) !important;
          }

          .dashboard-shared-reel-media {
            width: 88px !important;
            min-height: 158px !important;
          }
        }

        @media (max-width: 360px) {
          .dashboard-post-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 7px !important;
          }

          .dashboard-post-actions button {
            min-height: 32px !important;
            font-size: 11.2px !important;
            background: transparent !important;
            border: 0 !important;
            box-shadow: none !important;
          }
        }


        /* === Dashboard clean action row polish: no pill boxes === */
        .dashboard-post-actions {
          display: grid !important;
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          gap: 4px !important;
          margin-top: 11px !important;
          padding: 0 !important;
          background: transparent !important;
          border-radius: 0 !important;
          border: 0 !important;
          box-shadow: none !important;
        }

        .dashboard-post-actions button,
        .dashboard-post-actions button:nth-child(4) {
          display: inline-flex !important;
          min-width: 0 !important;
          min-height: 34px !important;
          border-radius: 0 !important;
          border: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          white-space: nowrap !important;
          color: #e5e7eb !important;
          padding-left: 4px !important;
          padding-right: 4px !important;
        }

        .dashboard-post-actions button:hover {
          transform: translateY(-1px);
          background: transparent !important;
          border-color: transparent !important;
          color: var(--parapost-accent-text) !important;
          text-shadow: 0 0 14px var(--parapost-accent-glow);
        }

        .dashboard-post-actions button svg {
          opacity: 0.92;
        }



        /* === Dashboard feed card polish pass === */
        .dashboard-feed-card {
          transition:
            border-color 180ms ease,
            background 180ms ease,
            box-shadow 180ms ease,
            transform 180ms ease;
        }

        .dashboard-feed-card:hover {
          border-color: color-mix(in srgb, var(--parapost-accent-2) 22%, rgba(255,255,255,0.12)) !important;
          background: linear-gradient(180deg, rgba(255,255,255,0.072), rgba(255,255,255,0.038)) !important;
        }

        .dashboard-link-preview-card {
          transition:
            transform 180ms ease,
            border-color 180ms ease,
            background 180ms ease,
            box-shadow 180ms ease;
        }

        .dashboard-link-preview-card:hover {
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--parapost-accent-2) 24%, rgba(255,255,255,0.12)) !important;
          background: linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(0,0,0,0.26)) !important;
        }

        .dashboard-post-media-grid,
        .dashboard-post-single-media {
          transition: border-color 180ms ease, box-shadow 180ms ease;
        }

        .dashboard-post-media-item {
          background: #05070d !important;
        }

        .dashboard-mobile-sponsored-placement {
          border-style: solid !important;
          border-color: color-mix(in srgb, var(--parapost-accent-2) 18%, rgba(255,255,255,0.10)) !important;
        }

        @media (min-width: 1181px) {
          .dashboard-feed-card {
            margin-bottom: 2px !important;
          }

          .dashboard-post-actions button:hover {
            background: transparent !important;
            border-color: transparent !important;
            color: var(--parapost-accent-text) !important;
          }

          .dashboard-post-media-grid {
            gap: 9px !important;
          }
        }

        @media (min-width: 761px) and (max-width: 1180px) {
          .dashboard-feed-card {
            padding: 16px !important;
          }

          .dashboard-post-actions {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }

          .dashboard-link-preview-card {
            border-radius: 19px !important;
          }

          .dashboard-post-media-grid {
            gap: 8px !important;
          }

          .dashboard-post-media-tile {
            min-height: 210px !important;
          }

          .dashboard-post-media-grid .dashboard-post-media-tile:first-child:nth-last-child(3) {
            min-height: 420px !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-feed-card {
            padding: 12px !important;
            margin-bottom: 10px !important;
            border-radius: 21px !important;
            box-shadow:
              0 16px 34px rgba(0,0,0,0.24),
              inset 0 1px 0 rgba(255,255,255,0.04) !important;
          }

          .dashboard-post-header {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto !important;
            align-items: start !important;
            gap: 7px !important;
          }

          .dashboard-post-header > div:first-child {
            min-width: 0 !important;
          }

          .dashboard-post-header a,
          .dashboard-post-header span {
            min-width: 0 !important;
          }

          .dashboard-feed-card p {
            margin-top: 9px !important;
          }

          .dashboard-link-preview-card {
            display: grid !important;
            grid-template-columns: 92px minmax(0, 1fr) !important;
            gap: 7px !important;
            padding: 9px !important;
            border-radius: 18px !important;
            margin-top: 11px !important;
          }

          .dashboard-link-preview-card > div:first-child {
            width: 92px !important;
            height: 64px !important;
            border-radius: 14px !important;
          }

          .dashboard-post-single-media {
            max-height: 510px !important;
            border-radius: 18px !important;
            margin-top: 11px !important;
          }

          .dashboard-post-media-grid {
            display: flex !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            scroll-snap-type: x mandatory !important;
            -webkit-overflow-scrolling: touch !important;
            gap: 9px !important;
            padding: 9px !important;
            border-radius: 19px !important;
            scrollbar-width: none !important;
          }

          .dashboard-post-media-grid::-webkit-scrollbar {
            display: none !important;
          }

          .dashboard-post-media-tile {
            flex: 0 0 100% !important;
            width: 100% !important;
            min-height: 270px !important;
            height: min(72vw, 360px) !important;
            border-radius: 16px !important;
            scroll-snap-align: center !important;
          }

          .dashboard-post-media-grid .dashboard-post-media-tile {
            grid-row: auto !important;
          }

          .dashboard-post-actions {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 4px !important;
            margin-top: 9px !important;
            padding: 0 !important;
            background: transparent !important;
            border: 0 !important;
            box-shadow: none !important;
          }

          .dashboard-post-actions button {
            min-height: 32px !important;
            border-radius: 0 !important;
            border: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            font-size: 11.5px !important;
            gap: 4px !important;
            padding-left: 2px !important;
            padding-right: 2px !important;
          }

          .dashboard-post-actions svg {
            width: 14px !important;
            height: 14px !important;
          }

          .dashboard-shared-reel-card {
            overflow: hidden !important;
          }

          .dashboard-shared-reel-frame {
            grid-template-columns: 104px minmax(0, 1fr) !important;
            gap: 7px !important;
            padding: 9px !important;
            border-radius: 18px !important;
          }

          .dashboard-shared-reel-media {
            width: 104px !important;
            min-height: 184px !important;
            max-height: 206px !important;
            border-radius: 15px !important;
          }

          .dashboard-shared-reel-copy {
            gap: 6px !important;
          }

          .dashboard-shared-reel-copy h3 {
            font-size: 15.5px !important;
            line-height: 1.12 !important;
          }

          .dashboard-shared-reel-copy p {
            font-size: 12px !important;
            line-height: 1.35 !important;
          }

          .dashboard-shared-reel-copy a {
            min-height: 33px !important;
            font-size: 12px !important;
            padding: 0 11px !important;
          }

          .dashboard-mobile-sponsored-placement {
            margin-block: 12px !important;
            border-radius: 20px !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-post-actions {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 4px !important;
            margin-top: 9px !important;
            padding: 0 !important;
            background: transparent !important;
            border: 0 !important;
            box-shadow: none !important;
          }

          .dashboard-post-actions button,
          .dashboard-post-actions button:nth-child(4) {
            display: inline-flex !important;
            min-height: 32px !important;
            border-radius: 0 !important;
            border: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            font-size: 11.5px !important;
            gap: 4px !important;
            padding-left: 2px !important;
            padding-right: 2px !important;
          }

          .dashboard-post-actions svg {
            width: 13px !important;
            height: 13px !important;
          }
        }

        @media (max-width: 410px) {
          .dashboard-link-preview-card {
            grid-template-columns: 82px minmax(0, 1fr) !important;
          }

          .dashboard-link-preview-card > div:first-child {
            width: 82px !important;
            height: 58px !important;
          }

          .dashboard-post-actions {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 2px !important;
          }

          .dashboard-post-actions button {
            min-height: 31px !important;
            font-size: 10.8px !important;
            background: transparent !important;
            border: 0 !important;
            box-shadow: none !important;
          }

          .dashboard-shared-reel-frame {
            grid-template-columns: 88px minmax(0, 1fr) !important;
          }

          .dashboard-shared-reel-media {
            width: 88px !important;
            min-height: 158px !important;
          }
        }



        /* Final hard override: action row stays text/icon only on every device */
        .dashboard-post-actions,
        .dashboard-post-actions * {
          box-sizing: border-box;
        }

        .dashboard-post-actions {
          background: transparent !important;
          border: 0 !important;
          box-shadow: none !important;
          border-radius: 0 !important;
        }

        .dashboard-post-actions button {
          background: transparent !important;
          border: 0 !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }



        /* === Dashboard final polish: original layout preserved, clean professional surfaces === */
        .dashboard-card,
        .dashboard-feed-card,
        .dashboard-composer-card,
        .dashboard-right-card,
        .dashboard-mobile-insights {
          border-color: rgba(255,255,255,0.105) !important;
          box-shadow: 0 15px 34px rgba(0,0,0,0.23), inset 0 1px 0 rgba(255,255,255,0.030) !important;
        }

        .dashboard-feed-card,
        .dashboard-composer-card,
        .dashboard-card {
          background: linear-gradient(180deg, rgba(255,255,255,0.058), rgba(255,255,255,0.030)) !important;
        }

        .dashboard-feed-card,
        .dashboard-composer-card {
          border-radius: 22px !important;
        }

        .dashboard-right-card {
          border-radius: 22px !important;
          background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.028)) !important;
        }

        .dashboard-post-actions button,
        .dashboard-composer-actions button,
        .dashboard-composer-actions a {
          border-radius: 13px !important;
          border-color: rgba(255,255,255,0.085) !important;
        }

        .dashboard-desktop-topbar {
          border-color: rgba(255,255,255,0.100) !important;
          box-shadow: 0 12px 28px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.030) !important;
        }

        .dashboard-search-parapost {
          border-color: rgba(255,255,255,0.105) !important;
          background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.032)) !important;
        }

        .dashboard-showcase-row {
          border-color: rgba(255,255,255,0.095) !important;
        }

        .dashboard-post-media-grid,
        .dashboard-post-single-media,
        .dashboard-link-preview-card {
          border-radius: 16px !important;
        }

        .dashboard-bottom-nav {
          border-color: rgba(255,255,255,0.105) !important;
        }

        @media (max-width: 760px) {
          .dashboard-feed-card,
          .dashboard-composer-card,
          .dashboard-card,
          .dashboard-right-card {
            border-radius: 19px !important;
          }

          .dashboard-feed-card,
          .dashboard-composer-card {
            padding: 14px !important;
          }

          .dashboard-post-actions {
            gap: 7px !important;
          }

          .dashboard-post-actions button {
            min-height: 38px !important;
          }
        }


        /* === Desktop/tablet top bar alignment polish === */
        @media (min-width: 761px) {
          .dashboard-desktop-topbar {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto !important;
            align-items: center !important;
            gap: 14px !important;
            width: 100% !important;
            margin-bottom: 18px !important;
          }

          .dashboard-search-parapost {
            width: 100% !important;
            max-width: none !important;
            min-width: 0 !important;
            height: 48px !important;
            box-sizing: border-box !important;
          }

          .dashboard-top-icons {
            display: flex !important;
            align-items: center !important;
            justify-content: flex-end !important;
            gap: 7px !important;
            height: 48px !important;
            flex-shrink: 0 !important;
          }

          .dashboard-top-icons a,
          .dashboard-top-icons button {
            width: 42px !important;
            height: 42px !important;
            flex: 0 0 42px !important;
          }
        }

        @media (min-width: 761px) and (max-width: 1180px) {
          .dashboard-desktop-topbar {
            gap: 9px !important;
          }

          .dashboard-top-icons {
            gap: 8px !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-desktop-topbar {
            display: none !important;
          }
        }


        /* === Feed pulse separation fix === */
        .dashboard-feed-pulse {
          margin-bottom: 16px !important;
          overflow: hidden !important;
          position: relative !important;
          z-index: 1 !important;
        }

        .dashboard-feed-pulse + section {
          margin-top: 0 !important;
          position: relative !important;
          z-index: 0 !important;
        }

        .dashboard-feed-card {
          position: relative !important;
          z-index: 0 !important;
        }

        @media (max-width: 760px) {
          .dashboard-feed-pulse {
            margin-bottom: 14px !important;
          }
        }


        /* === Mobile header single-row safety === */
        @media (max-width: 760px) {
          main .dashboard-desktop-topbar,
          .dashboard-main-column > .dashboard-desktop-topbar {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            pointer-events: none !important;
          }

          .dashboard-mobile-header {
            display: flex !important;
          }
        }


        /* === External link safety and clickability polish === */
        .dashboard-post-text-link,
        .dashboard-external-link-preview {
          position: relative !important;
          z-index: 6 !important;
          pointer-events: auto !important;
          cursor: pointer !important;
          touch-action: manipulation !important;
        }

        .dashboard-post-text-link:hover {
          color: #ffffff !important;
          text-decoration-color: var(--parapost-accent-text) !important;
        }

        .dashboard-feed-card p a,
        .dashboard-feed-card div a.dashboard-post-text-link {
          pointer-events: auto !important;
        }


        /* === Dashboard post interaction polish: clean actions, comments, and mobile spacing === */
        .dashboard-post-actions {
          display: grid !important;
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          gap: 6px !important;
          margin-top: 14px !important;
          padding-top: 10px !important;
          border-top: 1px solid rgba(255,255,255,0.070) !important;
        }

        .dashboard-post-actions button,
        .dashboard-post-actions a {
          border-radius: 12px !important;
          background: transparent !important;
          border: 1px solid transparent !important;
          color: #cbd5e1 !important;
          min-height: 40px !important;
          transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease !important;
        }

        .dashboard-post-actions button:hover,
        .dashboard-post-actions a:hover {
          background: rgba(255,255,255,0.045) !important;
          border-color: rgba(255,255,255,0.085) !important;
          color: #ffffff !important;
        }

        .dashboard-post-actions button:active,
        .dashboard-post-actions a:active {
          transform: translateY(1px) !important;
        }

        .dashboard-comments-panel,
        .dashboard-comments-wrap {
          border-top: 1px solid rgba(255,255,255,0.065) !important;
          margin-top: 12px !important;
          padding-top: 12px !important;
        }

        .dashboard-comment-composer textarea,
        .dashboard-comment-input {
          border-radius: 14px !important;
          border-color: rgba(255,255,255,0.095) !important;
          background: rgba(255,255,255,0.035) !important;
        }

        .dashboard-comment-item {
          border-bottom: 1px solid rgba(255,255,255,0.050) !important;
        }

        .dashboard-feed-load-more,
        .dashboard-load-more-button {
          border-radius: 14px !important;
          border-color: rgba(255,255,255,0.10) !important;
          background: rgba(255,255,255,0.040) !important;
          box-shadow: 0 12px 26px rgba(0,0,0,0.18) !important;
        }

        @media (max-width: 760px) {
          .dashboard-post-actions {
            gap: 4px !important;
            margin-top: 12px !important;
            padding-top: 9px !important;
          }

          .dashboard-post-actions button,
          .dashboard-post-actions a {
            min-height: 38px !important;
            font-size: 12px !important;
            gap: 5px !important;
            padding-left: 4px !important;
            padding-right: 4px !important;
          }

          .dashboard-post-actions svg {
            width: 17px !important;
            height: 17px !important;
          }

          .dashboard-comment-composer {
            gap: 8px !important;
          }
        }


        /* === Dashboard brand polish: restore Parapost Network purple identity === */
        .dashboard-brand-logo {
          transition: transform 160ms ease, filter 160ms ease;
        }

        .dashboard-brand-logo:hover {
          transform: translateY(-1px);
          filter: brightness(1.05);
        }

        .dashboard-brand-ghost-ring {
          transition: box-shadow 180ms ease, border-color 180ms ease, transform 180ms ease;
        }

        .dashboard-brand-logo:hover .dashboard-brand-ghost-ring {
          border-color: rgba(192,132,252,0.95) !important;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.075), 0 0 36px rgba(168,85,247,0.62) !important;
        }

        .dashboard-brand-network-text {
          color: #a855f7 !important;
          -webkit-text-fill-color: #a855f7 !important;
          text-shadow: 0 0 14px rgba(168,85,247,0.52) !important;
        }

        @media (max-width: 760px) {
          .dashboard-brand-logo:hover {
            transform: none;
          }
        }


        /* === Dashboard right rail polish: cleaner professional widgets === */
        .dashboard-right-rail a,
        .dashboard-right-rail button {
          -webkit-tap-highlight-color: transparent;
        }

        .dashboard-right-rail a:hover,
        .dashboard-right-rail button:hover {
          border-color: rgba(168,85,247,0.22) !important;
        }

        .dashboard-right-rail .dashboard-rail-row:hover,
        .dashboard-right-rail a[style*="grid"]:hover,
        .dashboard-right-rail a[style*="flex"]:hover {
          background: rgba(255,255,255,0.050) !important;
          border-color: rgba(168,85,247,0.18) !important;
          transform: translateY(-1px);
        }

        .dashboard-right-rail h3,
        .dashboard-right-rail h4 {
          letter-spacing: -0.025em;
        }

        @media (max-width: 1180px) {
          .dashboard-right-rail {
            display: none !important;
          }
        }


        /* === Dashboard left sidebar polish: cleaner navigation and launch-ready rail === */
        .dashboard-sidebar-item {
          -webkit-tap-highlight-color: transparent;
        }

        .dashboard-sidebar-item:not(.dashboard-sidebar-item-muted):hover {
          color: #ffffff !important;
          background: rgba(255,255,255,0.040) !important;
          border-color: rgba(168,85,247,0.16) !important;
          transform: translateX(1px);
        }

        .dashboard-sidebar-item-active:hover {
          background: linear-gradient(90deg, rgba(168,85,247,0.24), rgba(255,255,255,0.044)) !important;
          border-color: rgba(168,85,247,0.30) !important;
        }

        .dashboard-sidebar-item-muted {
          filter: saturate(0.82);
        }

        .dashboard-sidebar-item span {
          min-width: 0;
        }


        /* === No inner sidebar/rail scrollbars: page scroll only === */
        @media (min-width: 1181px) {
          .dashboard-desktop-left,
          .dashboard-right-rail {
            position: relative !important;
            top: auto !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            overscroll-behavior: auto !important;
            scrollbar-width: auto !important;
          }

          .dashboard-desktop-left::-webkit-scrollbar,
          .dashboard-right-rail::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .dashboard-sidebar-item,
          .dashboard-sidebar-profile {
            transition: none !important;
          }
        }


        /* === Dashboard Showcase creator cross-device polish === */
        .profile-showcase-modal-overlay {
          overflow: hidden !important;
        }

        .profile-showcase-modal-shell {
          overscroll-behavior: contain !important;
        }

        .profile-showcase-visibility-options,
        .profile-showcase-duration-options {
          min-width: 0 !important;
        }

        .profile-showcase-visibility-option,
        .profile-showcase-duration-option {
          min-width: 0 !important;
        }

        .profile-showcase-visibility-option strong,
        .profile-showcase-visibility-option small,
        .profile-showcase-duration-option span,
        .profile-showcase-duration-option small {
          overflow-wrap: anywhere !important;
          word-break: normal !important;
        }

        .profile-showcase-preview-phone {
          aspect-ratio: 9 / 16;
        }

        @media (min-width: 761px) and (max-width: 1120px) {
          .profile-showcase-studio-layout {
            grid-template-columns: minmax(300px, 0.92fr) minmax(340px, 1.08fr) !important;
            gap: 18px !important;
          }

          .profile-showcase-preview-column {
            padding-left: 18px !important;
          }

          .profile-showcase-visibility-options,
          .profile-showcase-duration-options {
            grid-template-columns: repeat(auto-fit, minmax(126px, 1fr)) !important;
          }
        }

        @media (max-width: 760px) {
          .profile-showcase-modal-overlay {
            padding: 0 !important;
            align-items: stretch !important;
            justify-content: stretch !important;
            background:
              radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--parapost-accent-2) 18%, transparent), transparent 42%),
              rgba(0,0,0,0.94) !important;
          }

          .profile-showcase-modal-shell {
            width: 100vw !important;
            max-width: 100vw !important;
            height: 100dvh !important;
            max-height: 100dvh !important;
            border-radius: 0 !important;
            border-left: none !important;
            border-right: none !important;
            border-top: none !important;
            padding: max(14px, env(safe-area-inset-top)) 14px calc(18px + env(safe-area-inset-bottom)) !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            -webkit-overflow-scrolling: touch !important;
          }

          .profile-showcase-modal-header {
            position: sticky !important;
            top: 0 !important;
            z-index: 30 !important;
            margin: calc(-1 * max(14px, env(safe-area-inset-top))) -14px 14px !important;
            padding: max(14px, env(safe-area-inset-top)) 14px 12px !important;
            background:
              linear-gradient(180deg, rgba(7,9,13,0.995), rgba(7,9,13,0.92)) !important;
            border-bottom: 1px solid rgba(255,255,255,0.075) !important;
            backdrop-filter: blur(14px) !important;
            -webkit-backdrop-filter: blur(14px) !important;
          }

          .profile-showcase-studio-layout {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }

          .profile-showcase-simple-controls {
            gap: 11px !important;
          }

          .profile-showcase-upload-card {
            min-height: 118px !important;
            border-radius: 19px !important;
            grid-template-columns: 50px minmax(0, 1fr) !important;
            gap: 9px !important;
            padding: 15px !important;
          }

          .profile-showcase-duration-options,
          .profile-showcase-visibility-options {
            grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)) !important;
            gap: 8px !important;
          }

          .profile-showcase-duration-option,
          .profile-showcase-visibility-option {
            min-height: 56px !important;
            border-radius: 14px !important;
            padding: 10px !important;
          }

          .profile-showcase-visibility-option {
            grid-template-columns: 34px minmax(0, 1fr) !important;
          }

          .profile-showcase-preview-column {
            border-left: none !important;
            padding-left: 0 !important;
            border-top: 1px solid rgba(255,255,255,0.075) !important;
            padding-top: 14px !important;
          }

          .profile-showcase-preview-header {
            align-items: flex-start !important;
          }

          .profile-showcase-preview-phone {
            width: min(100%, 390px) !important;
            max-width: 390px !important;
            height: clamp(360px, 58dvh, 570px) !important;
            min-height: 360px !important;
            max-height: 570px !important;
            justify-self: center !important;
            border-radius: 28px !important;
          }

          .profile-showcase-preview-phone img,
          .profile-showcase-preview-phone video {
            object-fit: contain !important;
            object-position: center center !important;
          }

          .profile-showcase-modal-actions {
            position: sticky !important;
            bottom: calc(72px + env(safe-area-inset-bottom)) !important;
            z-index: 35 !important;
            margin-left: -14px !important;
            margin-right: -14px !important;
            padding: 12px 14px calc(12px + env(safe-area-inset-bottom)) !important;
            background:
              linear-gradient(180deg, rgba(7,9,13,0.38), rgba(7,9,13,0.96) 54%, rgba(7,9,13,0.995)) !important;
            backdrop-filter: blur(12px) !important;
            -webkit-backdrop-filter: blur(12px) !important;
          }
        }

        @media (max-width: 430px) {
          .profile-showcase-duration-options,
          .profile-showcase-visibility-options {
            grid-template-columns: 1fr !important;
          }

          .profile-showcase-upload-copy small {
            font-size: 10px !important;
          }

          .profile-showcase-preview-phone {
            width: min(100%, 345px) !important;
            max-width: 345px !important;
            height: clamp(320px, 54dvh, 510px) !important;
            min-height: 320px !important;
            max-height: 510px !important;
            border-radius: 24px !important;
          }

          .profile-showcase-preview-phone [style*="rotate(-90deg)"] {
            width: 150px !important;
          }

          .profile-showcase-modal-actions {
            display: grid !important;
            grid-template-columns: 1fr !important;
          }

          .profile-showcase-modal-actions button {
            width: 100% !important;
          }
        }

        @media (max-height: 720px) and (max-width: 760px) {
          .profile-showcase-preview-phone {
            height: clamp(285px, 48dvh, 430px) !important;
            min-height: 285px !important;
          }

          .profile-showcase-modal-shell {
            padding-bottom: calc(12px + env(safe-area-inset-bottom)) !important;
          }
        }

        @media (orientation: landscape) and (max-width: 930px) and (max-height: 520px) {
          .profile-showcase-studio-layout {
            grid-template-columns: minmax(280px, 1fr) minmax(260px, 0.85fr) !important;
            align-items: start !important;
          }

          .profile-showcase-preview-column {
            border-top: none !important;
            border-left: 1px solid rgba(255,255,255,0.075) !important;
            padding-left: 14px !important;
            padding-top: 0 !important;
          }

          .profile-showcase-preview-phone {
            height: calc(100dvh - 170px) !important;
            min-height: 250px !important;
            max-height: 360px !important;
            max-width: 240px !important;
          }

          .profile-showcase-duration-options,
          .profile-showcase-visibility-options {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }
        }


        /* === Showcase creator sticky cleanup: no sticky notes/header/actions === */
        .profile-showcase-modal-header {
          position: relative !important;
          top: auto !important;
          z-index: 2 !important;
          margin: 0 0 14px !important;
          padding: 0 !important;
          background: transparent !important;
          border-bottom: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }

        .profile-showcase-modal-actions {
          position: relative !important;
          left: auto !important;
          right: auto !important;
          bottom: auto !important;
          z-index: 2 !important;
          margin: 16px 0 0 !important;
          padding: 12px 0 0 !important;
          background: transparent !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }

        @media (max-width: 760px) {
          .profile-showcase-modal-header {
            position: relative !important;
            top: auto !important;
            margin: 0 0 14px !important;
            padding: 0 !important;
            background: transparent !important;
            border-bottom: none !important;
          }

          .profile-showcase-modal-actions {
            position: relative !important;
            bottom: auto !important;
            margin: 16px 0 0 !important;
            padding: 12px 0 0 !important;
            background: transparent !important;
          }
        }

        @media (max-width: 430px) {
          .profile-showcase-modal-actions {
            display: grid !important;
            grid-template-columns: 1fr !important;
          }

          .profile-showcase-modal-actions button {
            width: 100% !important;
          }
        }


        /* === Dashboard flow polish: no layout changes, smoother page interactions === */
        html,
        body {
          max-width: 100%;
          overflow-x: hidden;
          background: #07090d;
          -webkit-text-size-adjust: 100%;
          text-size-adjust: 100%;
        }

        body {
          overscroll-behavior-x: none;
          -webkit-font-smoothing: antialiased;
          text-rendering: optimizeLegibility;
        }

        button,
        a,
        input,
        textarea,
        select {
          -webkit-tap-highlight-color: transparent;
        }

        input,
        textarea,
        select {
          font-size: 16px;
        }

        .dashboard-page,
        .dashboard-shell,
        .dashboard-main,
        .dashboard-main-column,
        .dashboard-feed-stack,
        .dashboard-card,
        .dashboard-feed-card,
        .dashboard-composer-card,
        .dashboard-left-sidebar,
        .dashboard-right-rail,
        .dashboard-mobile-header,
        .dashboard-desktop-topbar {
          box-sizing: border-box !important;
          min-width: 0 !important;
        }

        .dashboard-feed-card,
        .dashboard-composer-card,
        .dashboard-card {
          isolation: isolate;
        }

        .dashboard-post-text-link,
        .dashboard-link-preview-card,
        .dashboard-external-link-preview {
          pointer-events: auto !important;
          touch-action: manipulation !important;
        }

        .dashboard-post-text-link {
          position: relative !important;
          z-index: 8 !important;
          overflow-wrap: anywhere;
          word-break: normal;
        }

        .dashboard-feed-card,
        .dashboard-post-content,
        .dashboard-link-preview-card,
        .dashboard-external-link-preview {
          overflow-wrap: anywhere;
          word-break: normal;
        }

        .dashboard-post-single-media,
        .dashboard-post-media-item,
        .dashboard-post-media-grid img,
        .dashboard-post-media-grid video,
        .dashboard-link-preview-card img,
        .dashboard-showcase-card img,
        .dashboard-showcase-card video,
        .profile-showcase-preview-phone img,
        .profile-showcase-preview-phone video {
          max-width: 100% !important;
          backface-visibility: hidden;
        }

        .dashboard-post-single-media,
        .dashboard-post-media-item {
          background: #05060a;
        }

        .dashboard-mobile-menu-overlay,
        .profile-showcase-modal-overlay,
        .dashboard-search-overlay {
          width: 100vw !important;
          max-width: 100vw !important;
          overflow: hidden !important;
          isolation: isolate;
        }

        .dashboard-mobile-menu-sheet,
        .profile-showcase-modal-shell,
        .dashboard-search-sheet {
          min-width: 0 !important;
          max-width: 100vw !important;
          overscroll-behavior: contain !important;
          -webkit-overflow-scrolling: touch !important;
        }

        .dashboard-link-preview-card:focus-visible,
        .dashboard-external-link-preview:focus-visible,
        .dashboard-post-text-link:focus-visible,
        .dashboard-sidebar-item:focus-visible,
        .dashboard-top-icon-button:focus-visible,
        .dashboard-mobile-header button:focus-visible,
        .profile-showcase-modal-shell button:focus-visible,
        .dashboard-post-actions button:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--parapost-accent-2) 74%, #ffffff);
          outline-offset: 3px;
        }

        .dashboard-post-actions button,
        .dashboard-post-actions a,
        .dashboard-sidebar-item,
        .dashboard-right-rail a,
        .dashboard-right-rail button {
          touch-action: manipulation;
        }

        .dashboard-post-actions button,
        .dashboard-post-actions a {
          min-width: 0 !important;
        }

        .dashboard-bottom-nav,
        .bottom-nav,
        nav[aria-label="Mobile navigation"] {
          transform: translateZ(0);
          padding-bottom: max(8px, env(safe-area-inset-bottom)) !important;
        }

        /* Keep Showcase creator natural/in-flow. No sticky-note panels. */
        .profile-showcase-modal-header {
          position: relative !important;
          top: auto !important;
          z-index: 2 !important;
          margin: 0 0 14px !important;
          padding: 0 !important;
          background: transparent !important;
          border-bottom: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }

        .profile-showcase-modal-actions {
          position: relative !important;
          left: auto !important;
          right: auto !important;
          bottom: auto !important;
          z-index: 2 !important;
          margin: 16px 0 0 !important;
          padding: 12px 0 0 !important;
          background: transparent !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }

        @media (hover: none), (pointer: coarse) {
          .dashboard-post-actions button,
          .dashboard-post-actions a,
          .dashboard-sidebar-item,
          .dashboard-right-rail a,
          .dashboard-right-rail button,
          .dashboard-brand-logo,
          .dashboard-brand-ghost-ring {
            will-change: auto !important;
            transition-duration: 120ms !important;
          }

          .dashboard-post-actions button:hover,
          .dashboard-post-actions a:hover,
          .dashboard-sidebar-item:hover,
          .dashboard-right-rail a:hover,
          .dashboard-right-rail button:hover,
          .dashboard-brand-logo:hover {
            transform: none !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-page,
          .dashboard-shell,
          .dashboard-main,
          .dashboard-main-column {
            width: 100% !important;
            max-width: 100% !important;
            overflow-x: hidden !important;
          }

          .dashboard-desktop-topbar,
          .dashboard-left-sidebar,
          .dashboard-right-rail {
            display: none !important;
          }

          .dashboard-mobile-header {
            padding-top: max(10px, env(safe-area-inset-top)) !important;
            transform: translateZ(0);
          }

          .dashboard-card,
          .dashboard-feed-card,
          .dashboard-composer-card {
            border-radius: 18px !important;
          }

          .dashboard-post-single-media {
            max-height: 72dvh !important;
            object-fit: contain !important;
          }

          .dashboard-post-media-grid {
            max-width: 100% !important;
            overflow: hidden !important;
          }

          .dashboard-post-actions {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }

          .dashboard-post-actions button,
          .dashboard-post-actions a {
            min-height: 38px !important;
            white-space: nowrap !important;
          }

          .dashboard-post-actions span {
            min-width: 0 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }

          .dashboard-action-label {
            display: none !important;
          }

          .dashboard-post-actions {
            gap: 8px !important;
          }

          .dashboard-post-actions button {
            min-height: 42px !important;
            padding-inline: 6px !important;
          }

          .dashboard-post-actions svg {
            width: 22px !important;
            height: 22px !important;
          }

          .dashboard-comment-composer {
            align-items: stretch !important;
          }

          .dashboard-comment-composer textarea,
          .dashboard-comment-input {
            font-size: 16px !important;
            min-height: 42px !important;
          }

          .profile-showcase-preview-phone {
            max-width: min(100%, 390px) !important;
          }
        }

        @media (max-width: 390px) {
          .dashboard-card,
          .dashboard-feed-card,
          .dashboard-composer-card {
            border-radius: 16px !important;
          }

          .dashboard-post-actions button,
          .dashboard-post-actions a {
            font-size: 11px !important;
            gap: 4px !important;
            padding-left: 3px !important;
            padding-right: 3px !important;
          }

          .dashboard-post-actions svg {
            width: 16px !important;
            height: 16px !important;
          }

          .profile-showcase-duration-options,
          .profile-showcase-visibility-options {
            grid-template-columns: 1fr !important;
          }
        }

        @media (orientation: landscape) and (max-width: 930px) and (max-height: 520px) {
          .dashboard-mobile-header {
            position: sticky !important;
            top: 0 !important;
            z-index: 80 !important;
          }

          .dashboard-bottom-nav,
          .bottom-nav,
          nav[aria-label="Mobile navigation"] {
            transform: translateZ(0) scale(0.96);
            transform-origin: bottom center;
          }
        }


        /* === Compact shared Reel card only: Dashboard desktop, tablet, and mobile === */
        .dashboard-shared-reel-card {
          overflow: hidden !important;
        }

        .dashboard-shared-reel-frame,
        .dashboard-shared-reel-frame * {
          box-sizing: border-box !important;
        }

        .dashboard-shared-reel-frame {
          display: grid !important;
          grid-template-columns: minmax(118px, 36%) minmax(0, 1fr) !important;
          gap: 0 !important;
          align-items: stretch !important;
          padding: 0 !important;
          overflow: hidden !important;
        }

        .dashboard-shared-reel-media {
          width: 100% !important;
          min-width: 0 !important;
          min-height: 150px !important;
          height: 100% !important;
          max-height: 230px !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }

        .dashboard-shared-reel-media img,
        .dashboard-shared-reel-media video {
          width: 100% !important;
          height: 100% !important;
          min-height: 150px !important;
          object-fit: cover !important;
        }

        .dashboard-shared-reel-copy {
          min-width: 0 !important;
          overflow: hidden !important;
          padding: 14px 15px !important;
          justify-content: center !important;
        }

        .dashboard-shared-reel-title,
        .dashboard-shared-reel-copy p,
        .dashboard-shared-reel-user-caption {
          overflow-wrap: anywhere !important;
        }

        @media (min-width: 1181px) {
          .dashboard-shared-reel-frame {
            grid-template-columns: minmax(150px, 31%) minmax(0, 1fr) !important;
          }

          .dashboard-shared-reel-media {
            min-height: 180px !important;
            max-height: 230px !important;
          }
        }

        @media (min-width: 761px) and (max-width: 1180px) {
          .dashboard-shared-reel-frame {
            grid-template-columns: minmax(138px, 34%) minmax(0, 1fr) !important;
          }

          .dashboard-shared-reel-media {
            min-height: 170px !important;
            max-height: 220px !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-shared-reel-card {
            padding: 13px !important;
          }

          .dashboard-shared-reel-frame {
            grid-template-columns: 118px minmax(0, 1fr) !important;
            margin-top: 10px !important;
            border-radius: 17px !important;
          }

          .dashboard-shared-reel-media {
            min-height: 150px !important;
            max-height: 176px !important;
          }

          .dashboard-shared-reel-copy {
            gap: 5px !important;
            padding: 10px 11px !important;
          }

          .dashboard-shared-reel-copy h3 {
            font-size: 14px !important;
            line-height: 1.15 !important;
            margin: 0 !important;
            -webkit-line-clamp: 2 !important;
          }

          .dashboard-shared-reel-copy p {
            font-size: 11px !important;
            line-height: 1.28 !important;
          }

          .dashboard-shared-reel-caption {
            -webkit-line-clamp: 2 !important;
          }

          .dashboard-shared-reel-watch-button {
            min-height: 30px !important;
            padding: 0 10px !important;
            font-size: 11px !important;
          }
        }

        @media (max-width: 410px) {
          .dashboard-shared-reel-frame {
            grid-template-columns: 104px minmax(0, 1fr) !important;
          }

          .dashboard-shared-reel-media {
            min-height: 138px !important;
            max-height: 160px !important;
          }

          .dashboard-shared-reel-copy {
            padding: 9px !important;
          }

          .dashboard-shared-reel-media-badge {
            display: none !important;
          }
        }


        /* === Parapost responsive foundation pass: dashboard phone/tablet/notebook polish === */
        .dashboard-shell-pad,
        .dashboard-grid-desktop-safe,
        .dashboard-main-column,
        .dashboard-card,
        .dashboard-feed-card,
        .dashboard-composer-card,
        .dashboard-mobile-header,
        .dashboard-bottom-nav {
          min-width: 0 !important;
          box-sizing: border-box !important;
        }

        @media (max-width: 1180px) {
          .dashboard-desktop-left,
          .dashboard-right-rail {
            display: none !important;
          }

          .dashboard-shell-pad {
            width: 100% !important;
            max-width: 100vw !important;
            overflow-x: hidden !important;
          }

          .dashboard-grid-desktop-safe {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
          }

          .dashboard-main-column {
            width: 100% !important;
            margin: 0 auto !important;
          }
        }

        @media (min-width: 1181px) and (max-width: 1420px) {
          .dashboard-shell-pad {
            max-width: 1420px !important;
            padding-left: 16px !important;
            padding-right: 16px !important;
          }

          .dashboard-grid-desktop-safe {
            grid-template-columns: minmax(230px, 270px) minmax(0, 1fr) minmax(270px, 320px) !important;
            gap: 18px !important;
          }

          .dashboard-main-column {
            max-width: 860px !important;
          }
        }

        @media (min-width: 901px) and (max-width: 1180px) {
          .dashboard-shell-pad {
            padding: 18px clamp(18px, 3vw, 30px) 72px !important;
          }

          .dashboard-main-column,
          .dashboard-desktop-topbar,
          .dashboard-mobile-header {
            max-width: 900px !important;
          }

          .dashboard-desktop-topbar,
          .dashboard-mobile-header {
            margin-left: auto !important;
            margin-right: auto !important;
          }

          .dashboard-main-column {
            gap: 16px !important;
          }

          .dashboard-composer-actions {
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          }

          .dashboard-bottom-nav {
            display: none !important;
          }
        }

        @media (min-width: 761px) and (max-width: 900px) {
          .dashboard-shell-pad {
            padding: 14px clamp(14px, 2.4vw, 22px) calc(112px + env(safe-area-inset-bottom)) !important;
          }

          .dashboard-main-column,
          .dashboard-desktop-topbar,
          .dashboard-mobile-header {
            max-width: 760px !important;
          }

          .dashboard-main-column,
          .dashboard-desktop-topbar,
          .dashboard-mobile-header {
            margin-left: auto !important;
            margin-right: auto !important;
          }

          .dashboard-main-column {
            gap: 14px !important;
          }

          .dashboard-composer-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .dashboard-composer-actions a,
          .dashboard-composer-actions button {
            min-height: 42px !important;
            justify-content: center !important;
          }

          .dashboard-bottom-nav {
            width: min(calc(100vw - 34px), 520px) !important;
            left: 50% !important;
            right: auto !important;
            transform: translateX(-50%) !important;
            bottom: calc(12px + env(safe-area-inset-bottom)) !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-shell-pad {
            padding: 10px clamp(8px, 3vw, 14px) calc(118px + env(safe-area-inset-bottom)) !important;
          }

          .dashboard-main-column {
            max-width: 520px !important;
            margin-left: auto !important;
            margin-right: auto !important;
            gap: 7px !important;
          }

          .dashboard-mobile-header {
            position: sticky !important;
            top: 0 !important;
            z-index: 120 !important;
            min-height: 58px !important;
            padding: max(8px, env(safe-area-inset-top)) 8px 8px !important;
            margin: 0 auto 10px !important;
            max-width: 520px !important;
            border-radius: 19px !important;
          }

          .dashboard-mobile-header a:first-child,
          .dashboard-mobile-header > div:last-child {
            min-width: 0 !important;
          }

          .dashboard-mobile-header a:first-child > div:first-child {
            width: 40px !important;
            height: 40px !important;
            min-width: 40px !important;
          }

          .dashboard-mobile-header button,
          .dashboard-mobile-header a[aria-label="Notifications"],
          .dashboard-mobile-header a[aria-label="Parachat"] {
            width: 38px !important;
            height: 38px !important;
            min-width: 38px !important;
            border-radius: 13px !important;
          }

          .dashboard-showcase-row,
          .dashboard-composer-card,
          .dashboard-feed-card,
          .dashboard-feed-pulse,
          .dashboard-mobile-sponsored-placement {
            border-radius: 20px !important;
          }

          .dashboard-composer-card {
            padding: 11px !important;
          }

          .dashboard-composer-top-row {
            grid-template-columns: 40px minmax(0, 1fr) !important;
            gap: 8px !important;
          }

          .dashboard-composer-top-row textarea {
            min-height: 58px !important;
            font-size: 16px !important;
            line-height: 1.35 !important;
          }

          .dashboard-composer-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 7px !important;
          }

          .dashboard-composer-actions a,
          .dashboard-composer-actions button {
            min-height: 38px !important;
            padding: 7px 8px !important;
            font-size: 11.5px !important;
            justify-content: center !important;
          }

          .dashboard-composer-actions a > span,
          .dashboard-composer-actions button > span {
            min-width: 0 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
          }

          .dashboard-feed-card {
            padding: 12px !important;
          }

          .dashboard-post-actions {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 6px !important;
          }

          .dashboard-post-actions button,
          .dashboard-post-actions a {
            min-height: 38px !important;
            justify-content: center !important;
          }

          .dashboard-post-actions .dashboard-action-label {
            display: none !important;
          }

          .dashboard-bottom-nav {
            display: grid !important;
            position: fixed !important;
            left: 50% !important;
            right: auto !important;
            bottom: calc(10px + env(safe-area-inset-bottom)) !important;
            width: min(calc(100vw - 18px), 430px) !important;
            min-height: 72px !important;
            transform: translateX(-50%) !important;
            grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
            gap: 2px !important;
            padding: 7px 7px 9px !important;
            border-radius: 24px !important;
          }

          .dashboard-bottom-nav a {
            height: 54px !important;
            grid-template-rows: 25px auto !important;
            gap: 2px !important;
            min-width: 0 !important;
          }

          .dashboard-bottom-nav > button {
            width: 54px !important;
            height: 54px !important;
            transform: translateY(-14px) !important;
          }

          .dashboard-bottom-nav a span:last-child {
            font-size: 10px !important;
            line-height: 1.05 !important;
          }

          .dashboard-bottom-nav a[aria-label="Parachat"] span:last-child {
            font-size: 0 !important;
          }

          .dashboard-bottom-nav a[aria-label="Parachat"] span:last-child::after {
            content: "Parachat";
            font-size: 10px !important;
          }
        }

        @media (max-width: 380px) {
          .dashboard-shell-pad {
            padding-left: 8px !important;
            padding-right: 8px !important;
            padding-bottom: calc(104px + env(safe-area-inset-bottom)) !important;
          }

          .dashboard-mobile-header {
            gap: 6px !important;
            min-height: 52px !important;
            padding-left: 7px !important;
            padding-right: 7px !important;
            border-radius: 17px !important;
          }

          .dashboard-mobile-header a:first-child > div:first-child {
            width: 36px !important;
            height: 36px !important;
            min-width: 36px !important;
          }

          .dashboard-mobile-header button,
          .dashboard-mobile-header a[aria-label="Notifications"],
          .dashboard-mobile-header a[aria-label="Parachat"] {
            width: 34px !important;
            height: 34px !important;
            min-width: 34px !important;
          }

          .dashboard-composer-actions a,
          .dashboard-composer-actions button {
            min-height: 36px !important;
            font-size: 10.5px !important;
            padding-left: 6px !important;
            padding-right: 6px !important;
          }

          .dashboard-bottom-nav {
            width: min(calc(100vw - 14px), 380px) !important;
            min-height: 66px !important;
            padding: 6px 6px 8px !important;
            border-radius: 21px !important;
          }

          .dashboard-bottom-nav a {
            height: 48px !important;
            grid-template-rows: 22px auto !important;
          }

          .dashboard-bottom-nav > button {
            width: 50px !important;
            height: 50px !important;
            transform: translateY(-12px) !important;
          }

          .dashboard-bottom-nav a span:last-child {
            font-size: 9px !important;
          }

          .dashboard-bottom-nav a[aria-label="Profile"] span:last-child {
            font-size: 0 !important;
          }

          .dashboard-bottom-nav a[aria-label="Profile"] span:last-child::after {
            content: "Me";
            font-size: 9px !important;
          }
        }

        @media (max-width: 300px) {
          .dashboard-shell-pad {
            padding-left: 6px !important;
            padding-right: 6px !important;
            padding-bottom: calc(84px + env(safe-area-inset-bottom)) !important;
          }

          .dashboard-mobile-header button,
          .dashboard-mobile-header a[aria-label="Notifications"],
          .dashboard-mobile-header a[aria-label="Parachat"] {
            width: 30px !important;
            height: 30px !important;
            min-width: 30px !important;
          }

          .dashboard-composer-top-row {
            grid-template-columns: 34px minmax(0, 1fr) !important;
          }

          .dashboard-composer-actions a,
          .dashboard-composer-actions button {
            min-height: 34px !important;
            font-size: 0 !important;
          }

          .dashboard-composer-actions a svg,
          .dashboard-composer-actions button svg {
            width: 17px !important;
            height: 17px !important;
          }

          .dashboard-bottom-nav {
            min-height: 58px !important;
            padding: 5px !important;
            border-radius: 18px !important;
          }

          .dashboard-bottom-nav a {
            height: 42px !important;
            grid-template-rows: 1fr !important;
          }

          .dashboard-bottom-nav a span:last-child {
            display: none !important;
          }

          .dashboard-bottom-nav > button {
            width: 44px !important;
            height: 44px !important;
            transform: translateY(-8px) !important;
          }
        }

        @media (orientation: landscape) and (max-width: 930px) and (max-height: 540px) {
          .dashboard-shell-pad {
            padding-top: 8px !important;
            padding-bottom: calc(78px + env(safe-area-inset-bottom)) !important;
          }

          .dashboard-mobile-header {
            min-height: 48px !important;
            padding: 6px 8px !important;
            margin-bottom: 8px !important;
          }

          .dashboard-showcase-row {
            min-height: 0 !important;
            padding-top: 9px !important;
            padding-bottom: 9px !important;
          }

          .dashboard-composer-card {
            padding: 10px !important;
          }

          .dashboard-composer-top-row textarea {
            min-height: 46px !important;
          }

          .dashboard-bottom-nav {
            min-height: 56px !important;
            width: min(calc(100vw - 22px), 420px) !important;
            padding: 5px 7px !important;
            bottom: calc(6px + env(safe-area-inset-bottom)) !important;
          }

          .dashboard-bottom-nav a {
            height: 42px !important;
            grid-template-rows: 1fr !important;
            gap: 0 !important;
          }

          .dashboard-bottom-nav a span:last-child {
            display: none !important;
          }

          .dashboard-bottom-nav > button {
            width: 44px !important;
            height: 44px !important;
            transform: translateY(-7px) !important;
          }
        }


        /* === Phase 12 controlled dashboard polish pass === */
        /* Safe override layer only: keeps existing dashboard logic intact while tightening desktop, tablet, and mobile flow. */
        .dashboard-grid-desktop-safe,
        .dashboard-main-column,
        .dashboard-feed-card,
        .dashboard-composer-card,
        .dashboard-showcase-row,
        .dashboard-feed-pulse,
        .dashboard-link-preview-card,
        .dashboard-post-media-grid,
        .dashboard-post-media-tile,
        .dashboard-post-single-media,
        .dashboard-shared-reel-card,
        .dashboard-shared-reel-frame,
        .dashboard-composer-media-preview-wrap,
        .dashboard-composer-media-preview-grid,
        .dashboard-composer-media-preview-tile {
          box-sizing: border-box !important;
          min-width: 0 !important;
        }

        .dashboard-main-column {
          isolation: isolate !important;
        }

        .dashboard-feed-card,
        .dashboard-composer-card,
        .dashboard-feed-pulse,
        .dashboard-showcase-row {
          border-color: rgba(255,255,255,0.105) !important;
        }

        .dashboard-post-header,
        .dashboard-post-header > div:first-child,
        .dashboard-post-header > div:first-child > div:last-child,
        .dashboard-shared-reel-copy,
        .dashboard-link-preview-card > div:last-child {
          min-width: 0 !important;
        }

        .dashboard-post-header a,
        .dashboard-post-header span,
        .dashboard-shared-reel-title,
        .dashboard-link-preview-card,
        .dashboard-link-preview-card * {
          overflow-wrap: anywhere !important;
        }

        .dashboard-post-text-link {
          word-break: break-word !important;
        }

        .dashboard-feed-card p {
          max-width: 100% !important;
        }

        @media (min-width: 1181px) {
          .dashboard-desktop-left,
          .dashboard-right-rail {
            position: relative !important;
            top: auto !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            overscroll-behavior: auto !important;
            scrollbar-width: auto !important;
            scrollbar-gutter: auto !important;
          }

          .dashboard-desktop-left::-webkit-scrollbar,
          .dashboard-right-rail::-webkit-scrollbar {
            display: none !important;
          }

          .dashboard-grid-desktop-safe {
            align-items: start !important;
          }


          .dashboard-desktop-left .dashboard-sidebar-item {
            min-height: 39px !important;
          }

          .dashboard-desktop-left nav {
            gap: 5px !important;
          }

          .dashboard-right-card {
            border-radius: 18px !important;
            padding: 13px !important;
          }

          .dashboard-main-column {
            max-width: 980px !important;
          }

          .dashboard-feed-card,
          .dashboard-composer-card {
            padding: 18px !important;
          }
        }

        @media (min-width: 761px) and (max-width: 1180px) {
          .dashboard-main-column {
            max-width: 900px !important;
            gap: 16px !important;
          }

          .dashboard-desktop-topbar {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto !important;
          }

          .dashboard-top-icons {
            min-width: max-content !important;
          }

          .dashboard-feed-card,
          .dashboard-composer-card {
            padding: 16px !important;
          }

          .dashboard-post-media-tile {
            min-height: 220px !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-shell-pad {
            padding-top: 8px !important;
            padding-left: clamp(8px, 2.8vw, 12px) !important;
            padding-right: clamp(8px, 2.8vw, 12px) !important;
            padding-bottom: calc(126px + env(safe-area-inset-bottom)) !important;
          }

          .dashboard-main-column {
            width: 100% !important;
            max-width: 520px !important;
            gap: 11px !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
          }

          .dashboard-mobile-header {
            width: 100% !important;
            max-width: 520px !important;
            margin: 0 auto 10px !important;
            box-shadow: 0 12px 28px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.035) !important;
          }

          .dashboard-showcase-row {
            margin-top: 0 !important;
          }

          .dashboard-showcase-scroller {
            padding-bottom: 6px !important;
          }

          .dashboard-composer-card,
          .dashboard-feed-card,
          .dashboard-feed-pulse,
          .dashboard-mobile-sponsored-placement {
            width: 100% !important;
            border-radius: 20px !important;
          }

          .dashboard-composer-card,
          .dashboard-feed-card {
            padding: 13px !important;
          }

          .dashboard-composer-media-preview-wrap {
            width: 100% !important;
            max-width: 100% !important;
            margin-top: 11px !important;
            border-radius: 18px !important;
            overflow: hidden !important;
          }

          .dashboard-composer-media-preview-grid {
            display: flex !important;
            grid-template-columns: none !important;
            gap: 8px !important;
            max-height: none !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            scroll-snap-type: x mandatory !important;
            -webkit-overflow-scrolling: touch !important;
            scrollbar-width: none !important;
            padding: 8px !important;
          }

          .dashboard-composer-media-preview-grid::-webkit-scrollbar {
            display: none !important;
          }

          .dashboard-composer-media-preview-tile {
            flex: 0 0 100% !important;
            width: 100% !important;
            height: min(68vw, 330px) !important;
            min-height: 220px !important;
            scroll-snap-align: center !important;
          }

          .dashboard-composer-media-preview-grid-single .dashboard-composer-media-preview-tile {
            height: min(68vw, 330px) !important;
          }

          .dashboard-post-media-grid {
            display: flex !important;
            grid-template-columns: none !important;
            max-width: 100% !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            scroll-snap-type: x mandatory !important;
            -webkit-overflow-scrolling: touch !important;
            scrollbar-width: none !important;
            gap: 8px !important;
            padding: 8px !important;
          }

          .dashboard-post-media-grid::-webkit-scrollbar {
            display: none !important;
          }

          .dashboard-post-media-tile {
            flex: 0 0 100% !important;
            width: 100% !important;
            min-height: 260px !important;
            height: min(70vw, 360px) !important;
            scroll-snap-align: center !important;
          }

          .dashboard-post-single-media {
            width: 100% !important;
            max-height: 72dvh !important;
            object-fit: contain !important;
            background: #05070d !important;
          }

          .dashboard-link-preview-card {
            grid-template-columns: 86px minmax(0, 1fr) !important;
            align-items: center !important;
          }

          .dashboard-link-preview-card > div:first-child {
            width: 86px !important;
            height: 60px !important;
          }

          .dashboard-post-actions {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 6px !important;
            margin-top: 10px !important;
          }

          .dashboard-post-actions button,
          .dashboard-post-actions a {
            min-height: 40px !important;
            padding-inline: 4px !important;
          }

          .dashboard-post-actions svg {
            width: 18px !important;
            height: 18px !important;
          }

          .dashboard-comment-composer {
            grid-template-columns: 1fr !important;
            gap: 8px !important;
          }

          .dashboard-comment-composer button {
            width: 100% !important;
          }

          .dashboard-bottom-nav {
            width: min(calc(100vw - 18px), 430px) !important;
          }
        }

        @media (max-width: 410px) {
          .dashboard-shell-pad {
            padding-left: 7px !important;
            padding-right: 7px !important;
          }

          .dashboard-composer-actions a,
          .dashboard-composer-actions button {
            font-size: 10.75px !important;
          }

          .dashboard-post-actions {
            gap: 4px !important;
          }

          .dashboard-post-actions button,
          .dashboard-post-actions a {
            min-height: 38px !important;
          }

          .dashboard-post-actions svg {
            width: 16px !important;
            height: 16px !important;
          }

          .dashboard-shared-reel-frame {
            grid-template-columns: 92px minmax(0, 1fr) !important;
          }

          .dashboard-shared-reel-media {
            width: 92px !important;
            min-height: 164px !important;
            max-height: 186px !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0.001ms !important;
          }
        }

        @media (prefers-reduced-data: reduce) {
          .dashboard-loading-shimmer {
            animation: none !important;
          }
        }

        /* === Dashboard performance and hover responsiveness pass === */
        .dashboard-feed-card,
        .dashboard-link-preview-card,
        .dashboard-sidebar-item,
        .dashboard-right-rail .dashboard-rail-row,
        .dashboard-mobile-menu-row,
        .dashboard-mobile-menu-list-row,
        .dashboard-composer-action-pill,
        .dashboard-top-icons a,
        .dashboard-top-icons button {
          transition-property: background-color, border-color, color, opacity, transform, box-shadow !important;
          transition-duration: 140ms !important;
          transition-timing-function: ease !important;
        }

        .dashboard-feed-card:hover,
        .dashboard-link-preview-card:hover,
        .dashboard-sidebar-item:not(.dashboard-sidebar-item-muted):hover,
        .dashboard-right-rail .dashboard-rail-row:hover {
          will-change: transform;
        }

        .dashboard-post-single-media,
        .dashboard-post-media-item,
        .dashboard-composer-media-preview-tile img,
        .dashboard-composer-media-preview-tile video {
          backface-visibility: hidden;
          transform: translateZ(0);
        }

        @media (hover: none), (pointer: coarse) {
          .dashboard-feed-card:hover,
          .dashboard-link-preview-card:hover,
          .dashboard-sidebar-item:hover,
          .dashboard-right-rail .dashboard-rail-row:hover,
          .dashboard-brand-logo:hover,
          .dashboard-post-media-tile:hover,
          .dashboard-composer-media-preview-tile:hover {
            transform: none !important;
            filter: none !important;
            box-shadow: inherit;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .dashboard-feed-card,
          .dashboard-link-preview-card,
          .dashboard-sidebar-item,
          .dashboard-right-rail .dashboard-rail-row,
          .dashboard-mobile-menu-row,
          .dashboard-mobile-menu-list-row,
          .dashboard-composer-action-pill,
          .dashboard-post-single-media,
          .dashboard-post-media-item {
            transition: none !important;
            animation: none !important;
          }
        }


        /* === Dashboard clean-lines polish: no redesign, smoother overall feel === */
        .dashboard-grid-desktop-safe,
        .dashboard-main-column,
        .dashboard-desktop-left,
        .dashboard-right-rail {
          min-width: 0 !important;
        }

        .dashboard-card,
        .dashboard-right-card,
        .dashboard-composer-card,
        .dashboard-feed-card,
        .dashboard-showcase-row,
        .dashboard-feed-pulse,
        .dashboard-mobile-sponsored-placement {
          border-color: rgba(255,255,255,0.085) !important;
          box-shadow: 0 14px 34px rgba(0,0,0,0.22) !important;
          background-clip: padding-box !important;
        }

        .dashboard-card::before,
        .dashboard-right-card::before,
        .dashboard-feed-card::before,
        .dashboard-composer-card::before,
        .dashboard-showcase-row::before {
          pointer-events: none !important;
        }

        .dashboard-card:hover,
        .dashboard-feed-card:hover,
        .dashboard-right-card:hover,
        .dashboard-showcase-row:hover {
          border-color: rgba(168,85,247,0.16) !important;
        }

        .dashboard-feed-card {
          overflow: hidden !important;
        }

        .dashboard-post-header {
          min-width: 0 !important;
        }

        .dashboard-post-header a,
        .dashboard-post-header strong,
        .dashboard-post-header span {
          min-width: 0 !important;
        }

        .dashboard-post-actions {
          border-top-color: rgba(255,255,255,0.055) !important;
        }

        .dashboard-post-actions button,
        .dashboard-post-actions a,
        .dashboard-composer-actions button,
        .dashboard-composer-action-pill,
        .dashboard-top-icons a,
        .dashboard-top-icons button,
        .dashboard-search-parapost,
        .dashboard-sidebar-item,
        .dashboard-right-rail a,
        .dashboard-right-rail button {
          transition:
            background-color 120ms ease,
            border-color 120ms ease,
            color 120ms ease,
            opacity 120ms ease !important;
        }

        .dashboard-post-actions button:hover,
        .dashboard-post-actions a:hover,
        .dashboard-composer-actions button:hover,
        .dashboard-composer-action-pill:hover,
        .dashboard-top-icons a:hover,
        .dashboard-top-icons button:hover,
        .dashboard-search-parapost:hover,
        .dashboard-right-rail a:hover,
        .dashboard-right-rail button:hover {
          transform: none !important;
        }

        .dashboard-sidebar-item:not(.dashboard-sidebar-item-muted):hover {
          transform: none !important;
        }

        .dashboard-post-single-media,
        .dashboard-post-media-item,
        .dashboard-shared-reel-media,
        .dashboard-composer-media-preview-tile img,
        .dashboard-composer-media-preview-tile video {
          background: rgba(0,0,0,0.34) !important;
        }

        .dashboard-post-single-media,
        .dashboard-post-media-grid,
        .dashboard-shared-reel-frame,
        .dashboard-link-preview-card {
          border-color: rgba(255,255,255,0.075) !important;
        }

        .dashboard-showcase-scroller,
        .dashboard-composer-media-preview-wrap {
          scrollbar-width: none !important;
        }

        .dashboard-showcase-scroller::-webkit-scrollbar,
        .dashboard-composer-media-preview-wrap::-webkit-scrollbar {
          display: none !important;
        }

        .dashboard-right-rail {
          gap: 14px !important;
        }

        .dashboard-right-card {
          overflow: hidden !important;
        }

        .dashboard-right-rail .dashboard-rail-row,
        .dashboard-right-rail a[style*="grid"],
        .dashboard-right-rail a[style*="flex"] {
          transition:
            background-color 120ms ease,
            border-color 120ms ease,
            opacity 120ms ease !important;
        }

        .dashboard-right-rail .dashboard-rail-row:hover,
        .dashboard-right-rail a[style*="grid"]:hover,
        .dashboard-right-rail a[style*="flex"]:hover {
          transform: none !important;
        }

        .dashboard-mobile-insights {
          border-color: rgba(255,255,255,0.085) !important;
        }

        .dashboard-bottom-nav {
          border-color: rgba(255,255,255,0.10) !important;
        }

        @media (max-width: 760px) {
          .dashboard-card,
          .dashboard-right-card,
          .dashboard-composer-card,
          .dashboard-feed-card,
          .dashboard-showcase-row,
          .dashboard-mobile-sponsored-placement {
            box-shadow: 0 10px 22px rgba(0,0,0,0.18) !important;
          }

          .dashboard-post-actions button,
          .dashboard-post-actions a,
          .dashboard-composer-action-pill {
            transition: background-color 100ms ease, border-color 100ms ease, color 100ms ease !important;
          }
        }

        @media (hover: hover) and (pointer: fine) {
          .dashboard-feed-card:hover,
          .dashboard-card:hover,
          .dashboard-right-card:hover {
            box-shadow: 0 16px 38px rgba(0,0,0,0.24) !important;
          }
        }



        /* FINAL Facebook-style compact shared Reel preview: tablet and mobile only */
        @media (max-width: 1180px) {
          .dashboard-shared-reel-frame {
            display: grid !important;
            grid-template-columns: 42% minmax(0, 1fr) !important;
            grid-template-rows: 180px !important;
            height: 180px !important;
            min-height: 180px !important;
            max-height: 180px !important;
            gap: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            align-items: stretch !important;
          }

          .dashboard-shared-reel-media {
            width: 100% !important;
            height: 180px !important;
            min-height: 180px !important;
            max-height: 180px !important;
            aspect-ratio: auto !important;
            border-radius: 0 !important;
            overflow: hidden !important;
            box-shadow: none !important;
          }

          .dashboard-shared-reel-media img,
          .dashboard-shared-reel-media video,
          .dashboard-shared-reel-media > div:first-child {
            width: 100% !important;
            height: 180px !important;
            min-height: 180px !important;
            max-height: 180px !important;
            aspect-ratio: auto !important;
            object-fit: cover !important;
            object-position: center !important;
            display: block !important;
          }

          .dashboard-shared-reel-copy {
            height: 180px !important;
            min-height: 0 !important;
            max-height: 180px !important;
            padding: 13px 14px !important;
            gap: 6px !important;
            justify-content: center !important;
            overflow: hidden !important;
          }

          .dashboard-shared-reel-small-meta {
            display: none !important;
          }

          .dashboard-shared-reel-title {
            font-size: 15px !important;
            line-height: 1.18 !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
          }

          .dashboard-shared-reel-caption {
            font-size: 11.5px !important;
            line-height: 1.28 !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 1 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
          }

          .dashboard-shared-reel-watch-button {
            min-height: 31px !important;
            padding: 0 11px !important;
            font-size: 11.5px !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-shared-reel-frame {
            grid-template-rows: 168px !important;
            height: 168px !important;
            min-height: 168px !important;
            max-height: 168px !important;
          }

          .dashboard-shared-reel-media,
          .dashboard-shared-reel-media img,
          .dashboard-shared-reel-media video,
          .dashboard-shared-reel-media > div:first-child {
            height: 168px !important;
            min-height: 168px !important;
            max-height: 168px !important;
          }

          .dashboard-shared-reel-copy {
            height: 168px !important;
            max-height: 168px !important;
            padding: 11px 12px !important;
          }

          .dashboard-shared-reel-media-badge {
            display: none !important;
          }
        }

        @media (max-width: 410px) {
          .dashboard-shared-reel-frame {
            grid-template-columns: 40% minmax(0, 1fr) !important;
            grid-template-rows: 154px !important;
            height: 154px !important;
            min-height: 154px !important;
            max-height: 154px !important;
          }

          .dashboard-shared-reel-media,
          .dashboard-shared-reel-media img,
          .dashboard-shared-reel-media video,
          .dashboard-shared-reel-media > div:first-child {
            height: 154px !important;
            min-height: 154px !important;
            max-height: 154px !important;
          }

          .dashboard-shared-reel-copy {
            height: 154px !important;
            max-height: 154px !important;
            padding: 9px 10px !important;
          }
        }


        /* FINAL overlap correction: shared Reel card mobile/tablet only */
        @media (max-width: 1180px) {
          .dashboard-shared-reel-frame {
            display: flex !important;
            flex-direction: row !important;
            align-items: stretch !important;
            width: 100% !important;
            height: 180px !important;
            min-height: 180px !important;
            max-height: 180px !important;
            grid-template-columns: none !important;
            grid-template-rows: none !important;
            gap: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
          }

          .dashboard-shared-reel-media {
            flex: 0 0 38% !important;
            width: 38% !important;
            min-width: 0 !important;
            max-width: 38% !important;
            height: 180px !important;
            min-height: 180px !important;
            max-height: 180px !important;
            position: relative !important;
            z-index: 1 !important;
            overflow: hidden !important;
          }

          .dashboard-shared-reel-copy {
            flex: 1 1 62% !important;
            width: 62% !important;
            min-width: 0 !important;
            max-width: 62% !important;
            height: 180px !important;
            min-height: 0 !important;
            max-height: 180px !important;
            position: relative !important;
            z-index: 2 !important;
            margin: 0 !important;
            padding: 13px 14px !important;
            overflow: hidden !important;
            background: transparent !important;
          }

          .dashboard-shared-reel-top-line,
          .dashboard-shared-reel-title,
          .dashboard-shared-reel-caption,
          .dashboard-shared-reel-copy > div,
          .dashboard-shared-reel-copy > p,
          .dashboard-shared-reel-copy > a {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            margin-left: 0 !important;
            transform: none !important;
          }

          .dashboard-shared-reel-copy a,
          .dashboard-shared-reel-copy span,
          .dashboard-shared-reel-copy h3,
          .dashboard-shared-reel-copy p {
            position: relative !important;
            left: 0 !important;
            right: auto !important;
          }

          .dashboard-shared-reel-small-meta {
            display: none !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-shared-reel-frame {
            height: 168px !important;
            min-height: 168px !important;
            max-height: 168px !important;
          }

          .dashboard-shared-reel-media {
            flex-basis: 37% !important;
            width: 37% !important;
            max-width: 37% !important;
            height: 168px !important;
            min-height: 168px !important;
            max-height: 168px !important;
          }

          .dashboard-shared-reel-copy {
            flex-basis: 63% !important;
            width: 63% !important;
            max-width: 63% !important;
            height: 168px !important;
            max-height: 168px !important;
            padding: 11px 12px !important;
          }
        }

        @media (max-width: 410px) {
          .dashboard-shared-reel-frame {
            height: 154px !important;
            min-height: 154px !important;
            max-height: 154px !important;
          }

          .dashboard-shared-reel-media {
            flex-basis: 36% !important;
            width: 36% !important;
            max-width: 36% !important;
            height: 154px !important;
            min-height: 154px !important;
            max-height: 154px !important;
          }

          .dashboard-shared-reel-copy {
            flex-basis: 64% !important;
            width: 64% !important;
            max-width: 64% !important;
            height: 154px !important;
            max-height: 154px !important;
            padding: 9px 10px !important;
          }
        }


        /* === FINAL FIRST-IMPRESSION FEED POLISH v1 === */
        .parapost-expandable-post-text {
          display: grid;
          gap: 5px;
          min-width: 0;
          margin-top: 11px;
        }

        .parapost-expandable-post-copy {
          min-width: 0;
          max-width: 100%;
          margin: 0 !important;
          overflow: hidden;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .parapost-expandable-post-text:not(.parapost-expandable-post-text-open)
        .parapost-expandable-post-copy {
          display: -webkit-box;
          -webkit-box-orient: vertical;
        }

        .parapost-expandable-post-text-media:not(.parapost-expandable-post-text-open)
        .parapost-expandable-post-copy {
          -webkit-line-clamp: 3;
        }

        .parapost-expandable-post-text-only:not(.parapost-expandable-post-text-open)
        .parapost-expandable-post-copy {
          -webkit-line-clamp: 5;
        }

        .parapost-expandable-post-toggle {
          width: max-content;
          min-height: 27px;
          margin: 0;
          padding: 0 2px;
          border: 0;
          background: transparent;
          color: #c4b5fd;
          font: inherit;
          font-size: 13px;
          line-height: 1.2;
          font-weight: 900;
          cursor: pointer;
          text-align: left;
        }

        .parapost-expandable-post-toggle:hover {
          color: #e9d5ff;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .dashboard-shared-post-frame,
        .profile-shared-post-frame {
          min-width: 0 !important;
          box-sizing: border-box !important;
        }

        @media (min-width: 1181px) {
          .dashboard-feed-card,
          .profile-feed-card {
            padding: 16px !important;
          }

          .dashboard-main-column,
          .profile-feed-list {
            gap: 7px !important;
          }

          .dashboard-post-single-media,
          .profile-post-image,
          .dashboard-post-media-grid,
          .profile-post-image-grid {
            margin-top: 12px !important;
          }

          .dashboard-shared-post-frame,
          .profile-shared-post-frame {
            padding: 14px !important;
          }
        }

        @media (min-width: 761px) and (max-width: 1180px) {
          .dashboard-feed-card,
          .profile-feed-card {
            padding: 14px !important;
            border-radius: 24px !important;
          }

          .dashboard-main-column,
          .profile-feed-list {
            gap: 9px !important;
          }

          .dashboard-post-header,
          .profile-post-header {
            margin-bottom: 0 !important;
          }

          .parapost-expandable-post-text {
            margin-top: 9px;
          }

          .parapost-expandable-post-text-media:not(.parapost-expandable-post-text-open)
          .parapost-expandable-post-copy {
            -webkit-line-clamp: 3;
          }

          .parapost-expandable-post-text-only:not(.parapost-expandable-post-text-open)
          .parapost-expandable-post-copy {
            -webkit-line-clamp: 5;
          }

          .dashboard-post-single-media,
          .profile-post-image,
          .dashboard-post-media-grid,
          .profile-post-image-grid {
            width: calc(100% + 12px) !important;
            max-width: calc(100% + 12px) !important;
            margin-left: -6px !important;
            margin-right: -6px !important;
            margin-top: 11px !important;
          }

          .dashboard-post-single-media,
          .profile-post-image {
            height: auto !important;
            max-height: none !important;
            object-fit: contain !important;
            background: #05060a !important;
            border-radius: 17px !important;
          }

          .dashboard-shared-post-frame,
          .profile-shared-post-frame {
            padding: 12px !important;
          }

          .dashboard-comments-panel,
          .profile-comments-panel {
            padding: 11px !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-feed-card,
          .profile-feed-card {
            padding: 12px !important;
            border-radius: 22px !important;
          }

          .dashboard-main-column,
          .profile-feed-list {
            gap: 7px !important;
          }

          .dashboard-post-header,
          .profile-post-header {
            gap: 7px !important;
            margin-bottom: 0 !important;
          }

          .parapost-expandable-post-text {
            gap: 3px;
            margin-top: 8px;
          }

          .parapost-expandable-post-text-media:not(.parapost-expandable-post-text-open)
          .parapost-expandable-post-copy {
            -webkit-line-clamp: 2;
          }

          .parapost-expandable-post-text-only:not(.parapost-expandable-post-text-open)
          .parapost-expandable-post-copy {
            -webkit-line-clamp: 4;
          }

          .parapost-expandable-post-toggle {
            min-height: 25px;
            font-size: 12.5px;
          }

          .dashboard-post-single-media,
          .profile-post-image,
          .dashboard-post-media-grid,
          .profile-post-image-grid {
            width: calc(100% + 24px) !important;
            max-width: calc(100% + 24px) !important;
            margin-left: -12px !important;
            margin-right: -12px !important;
            margin-top: 9px !important;
          }

          .dashboard-post-single-media,
          .profile-post-image {
            height: auto !important;
            max-height: none !important;
            aspect-ratio: auto !important;
            object-fit: contain !important;
            object-position: center !important;
            background: #05060a !important;
            border-radius: 0 !important;
            border-left: 0 !important;
            border-right: 0 !important;
          }

          .dashboard-post-media-grid,
          .profile-post-image-grid {
            border-radius: 0 !important;
            overflow: hidden !important;
          }

          .dashboard-shared-post-frame,
          .profile-shared-post-frame {
            padding: 10px !important;
            border-radius: 18px !important;
          }

          .dashboard-post-actions,
          .profile-post-actions {
            min-height: 46px !important;
            margin-top: 9px !important;
            padding-top: 7px !important;
          }

          .dashboard-comment-row,
          .profile-comment-row {
            gap: 8px !important;
          }

          .dashboard-comment-bubble,
          .profile-comment-bubble {
            padding: 10px 11px !important;
            border-radius: 16px !important;
          }
        }

        @media (max-width: 410px) {
          .dashboard-feed-card,
          .profile-feed-card {
            padding: 11px !important;
          }

          .dashboard-post-single-media,
          .profile-post-image,
          .dashboard-post-media-grid,
          .profile-post-image-grid {
            width: calc(100% + 22px) !important;
            max-width: calc(100% + 22px) !important;
            margin-left: -11px !important;
            margin-right: -11px !important;
          }
        }


        /* === FINAL FEED SPACING TIGHTENING v2 === */
        @media (min-width: 1181px) {
          .dashboard-feed-card,
          .profile-feed-card {
            margin-bottom: 0 !important;
          }

          .dashboard-main-column,
          .profile-feed-list {
            row-gap: 10px !important;
          }
        }

        @media (min-width: 761px) and (max-width: 1180px) {
          .dashboard-feed-card,
          .profile-feed-card {
            margin-bottom: 0 !important;
          }

          .dashboard-main-column,
          .profile-feed-list {
            row-gap: 9px !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-feed-card,
          .profile-feed-card {
            margin-bottom: 0 !important;
          }

          .dashboard-main-column,
          .profile-feed-list {
            row-gap: 7px !important;
          }
        }

      


        /* === Final tablet header override ===
           Keep the compact tablet header and suppress the duplicate desktop
           search/notification/Parachat/avatar bar. This rule is intentionally
           last because earlier tablet rules re-enable that desktop bar. */
        @media (min-width: 761px) and (max-width: 1180px) {
          main .dashboard-desktop-topbar,
          .dashboard-main-column > .dashboard-desktop-topbar,
          .dashboard-desktop-topbar {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            pointer-events: none !important;
          }

          .dashboard-mobile-header {
            display: flex !important;
          }
        }


        /* Tablet navigation: fixed full-width wrapper, no transforms on the fixed layer. */
        @media (min-width: 761px) and (max-width: 1180px) {
          html body .dashboard-tablet-nav-fixed-layer {
            position: fixed !important;
            left: 0 !important;
            right: 0 !important;
            top: auto !important;
            bottom: 0 !important;
            z-index: 2147483000 !important;
            display: flex !important;
            justify-content: center !important;
            align-items: flex-end !important;
            width: 100% !important;
            padding: 0 12px env(safe-area-inset-bottom) !important;
            margin: 0 !important;
            pointer-events: none !important;
            transform: none !important;
            -webkit-transform: none !important;
            overflow: visible !important;
          }

          html body .dashboard-tablet-nav-fixed-layer > .dashboard-bottom-nav {
            display: grid !important;
            position: relative !important;
            left: auto !important;
            right: auto !important;
            top: auto !important;
            bottom: auto !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            transform: none !important;
            -webkit-transform: none !important;
            will-change: auto !important;
            backface-visibility: visible !important;
            -webkit-backface-visibility: visible !important;
            contain: none !important;
            overflow: visible !important;
            isolation: isolate !important;
            pointer-events: auto !important;
          }

          html body .dashboard-tablet-nav-fixed-layer > .dashboard-bottom-nav > button {
            z-index: 3 !important;
          }

          .dashboard-shell-pad {
            padding-bottom: calc(118px + env(safe-area-inset-bottom)) !important;
          }
        }

        ` }} />
    </div>
  );
}

function SidebarLogo() {
  return (
    <Link href="/dashboard" className="dashboard-brand-logo" style={sidebarLogoStyle}>
      <div className="dashboard-brand-ghost-ring" style={logoGhostCircleStyle}><ParaGhostLogoIcon size={42} /></div>
      <div>
        <div style={logoWordStyle}>PARAPOST</div>
        <div className="dashboard-brand-network-text" style={logoNetworkStyle}>NETWORK</div>
      </div>
    </Link>
  );
}

function SidebarLink({
  href,
  label,
  icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
  badge?: number | string;
}) {
  return (
    <Link
      href={href}
      className={active ? "dashboard-sidebar-item dashboard-sidebar-item-active" : "dashboard-sidebar-item"}
      style={active ? activeSidebarItemStyle : sidebarItemStyle}
    >
      <span style={sidebarIconWrapStyle}>{icon || <span style={dotIconStyle} />}</span>
      <span>{label}</span>
      {badge ? <span style={sidebarBadgeStyle}>{badge}</span> : null}
    </Link>
  );
}

function SidebarParapostReelIcon() {
  return (
    <span style={sidebarComposerReelIconStyle} aria-hidden="true">
      <span style={{ transform: "translateX(1px)", lineHeight: 1 }}>▶</span>
    </span>
  );
}

function SidebarButton({
  label,
  badge,
  icon,
  muted = false,
}: {
  label: string;
  badge?: number | string;
  icon?: ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={muted ? "dashboard-sidebar-item dashboard-sidebar-item-muted" : "dashboard-sidebar-item"}
      style={muted ? mutedSidebarItemStyle : sidebarItemStyle}
      aria-disabled={muted ? "true" : undefined}
      title={muted ? `${label} is planned for a future Parapost Network upgrade.` : undefined}
    >
      <span style={sidebarIconWrapStyle}>{icon || <span style={muted ? mutedDotIconStyle : dotIconStyle} />}</span>
      <span>{label}</span>
      {badge ? <span style={muted ? mutedSidebarBadgeStyle : sidebarBadgeStyle}>{badge}</span> : null}
    </div>
  );
}

function MobileDashboardHeader({
  currentProfile,
  notificationsCount,
  parachatUnreadCount,
  onOpenSearch,
  onOpenMenu,
}: {
  currentProfile: ProfilePreview | null;
  notificationsCount: number;
  parachatUnreadCount: number;
  onOpenSearch: () => void;
  onOpenMenu: () => void;
}) {
  return (
    <header className="dashboard-mobile-header" style={mobileHeaderStyle}>
      <Link href="/dashboard" style={mobileLogoStyle} aria-label="Parapost Network home">
        <div style={mobileLogoCircleStyle}><ParaGhostLogoIcon size={36} /></div>
      </Link>

      <div style={mobileHeaderActionsStyle}>
        <button onClick={onOpenSearch} style={mobileTopIconButtonStyle} aria-label="Search Parapost">
          <SearchIcon size={24} />
        </button>
        <Link href="/notifications" style={mobileTopIconButtonStyle} aria-label="Notifications">
          <BellIcon />
          {notificationsCount > 0 ? <span style={topBadgeStyle}>{notificationsCount > 99 ? "99+" : notificationsCount}</span> : null}
        </Link>
        <Link href="/messages" style={mobileTopIconButtonStyle} aria-label="Parachat">
          <ChatIcon />
          {parachatUnreadCount > 0 ? <span style={topBadgeStyle}>{parachatUnreadCount > 99 ? "99+" : parachatUnreadCount}</span> : null}
        </Link>
        <button type="button" onClick={onOpenMenu} style={mobileTopIconButtonStyle} aria-label="Open dashboard menu">
          <MenuIcon />
        </button>
        <Link href={currentProfile?.id ? `/profile/${currentProfile.id}` : "/dashboard"} style={{ display: "none" }} aria-label="Profile" />
      </div>
    </header>
  );
}

function ShowcaseQuickActions({
  friendShowcases,
  onCreateShowcase,
  onOpenShowcase,
}: {
  currentProfile: ProfilePreview | null;
  currentUserId: string;
  friendShowcases: DashboardShowcaseItem[];
  onCreateShowcase: () => void;
  onOpenShowcase: (showcase: DashboardShowcaseItem) => void;
}) {
  void friendShowcases;
  void onCreateShowcase;
  void onOpenShowcase;

  return (
    <section className="dashboard-card dashboard-showcase-row" style={dashboardProfileShowcasesPanelStyle}>
      <div style={dashboardShowcasesHeaderStyle}>
        <h3 style={dashboardShowcasesTitleStyle}>Showcases</h3>
      </div>

      <div
        className="dashboard-showcase-scroller"
        style={{
          ...dashboardProfileShowcasesRowStyle,
          justifyContent: "center",
          overflowX: "hidden",
          minHeight: 92,
        }}
      >
        <div
          style={{
            width: "100%",
            borderRadius: 22,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "linear-gradient(135deg, rgba(15,23,42,0.92), rgba(7,9,13,0.96))",
            padding: "16px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 950, fontSize: 15, marginBottom: 4 }}>Showcases Coming Soon</div>
            <div style={{ color: "#9ca3af", fontSize: 13, lineHeight: 1.45 }}>
              A new way to share your moments with the Parapost community is coming soon.
            </div>
          </div>
          <span
            style={{
              minWidth: 42,
              width: 42,
              height: 42,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2))",
              color: "#fff",
              fontWeight: 950,
              boxShadow: "0 0 22px var(--parapost-accent-glow)",
            }}
            aria-hidden="true"
          >
            ✦
          </span>
        </div>
      </div>
    </section>
  );
}
function DashboardShowcaseViewerModal({
  showcase,
  showcases,
  onSelectShowcase,
  onClose,
}: {
  showcase: DashboardShowcaseItem;
  showcases: DashboardShowcaseItem[];
  onSelectShowcase: (showcase: DashboardShowcaseItem) => void;
  onClose: () => void;
}) {
  const visibleShowcases = showcases.slice(0, 18);
  const activeIndex = Math.max(0, visibleShowcases.findIndex((item) => item.id === showcase.id));
  const hasMultipleShowcases = visibleShowcases.length > 1;

  const previousShowcase = hasMultipleShowcases
    ? visibleShowcases[(activeIndex - 1 + visibleShowcases.length) % visibleShowcases.length]
    : null;

  const nextShowcase = hasMultipleShowcases
    ? visibleShowcases[(activeIndex + 1) % visibleShowcases.length]
    : null;

  const coverText = getDashboardShowcaseOverlayText(showcase);
  const x = Number(showcase.text_position_x ?? 50);
  const y = Number(showcase.text_position_y ?? 50);
  const mediaType = showcase.media_type === "image" || showcase.media_type === "video" ? showcase.media_type : "text";

  const profileName = showcase.profile?.full_name || showcase.profile?.username || "Parapost member";
  const profileHandle = showcase.profile?.username ? `@${showcase.profile.username}` : "Showcase";

  const handlePrevious = useCallback(() => {
    if (previousShowcase) onSelectShowcase(previousShowcase);
  }, [onSelectShowcase, previousShowcase]);

  const handleNext = useCallback(() => {
    if (nextShowcase) onSelectShowcase(nextShowcase);
  }, [nextShowcase, onSelectShowcase]);

  useEffect(() => {
    const handleViewerKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "ArrowLeft") {
        handlePrevious();
        return;
      }

      if (event.key === "ArrowRight") {
        handleNext();
      }
    };

    window.addEventListener("keydown", handleViewerKeyDown);
    return () => window.removeEventListener("keydown", handleViewerKeyDown);
  }, [handleNext, handlePrevious, onClose]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${getDashboardShowcaseLabel(showcase)} Showcase viewer`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "18px",
        background:
          "radial-gradient(circle at 50% 0%, var(--parapost-accent-active-border), transparent 42%), rgba(0,0,0,0.90)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(760px, calc(100vw - 32px))",
          height: "min(900px, calc(100dvh - 32px))",
          maxHeight: "calc(100dvh - 32px)",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          borderRadius: "30px",
          border: "1px solid rgba(255,255,255,0.14)",
          background:
            "radial-gradient(circle at 16% 0%, var(--parapost-accent-active-border), transparent 34%), radial-gradient(circle at 96% 10%, rgba(34,211,238,0.11), transparent 30%), linear-gradient(180deg, rgba(17,19,28,0.996), rgba(5,7,12,0.998))",
          boxShadow: "0 42px 120px rgba(0,0,0,0.72), 0 0 0 1px rgba(255,255,255,0.035)",
          padding: "16px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flex: "0 0 auto",
            paddingBottom: "12px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "42px minmax(0, 1fr)",
              gap: "12px",
              alignItems: "center",
              minWidth: 0,
            }}
          >
            <span
              style={{
                width: "42px",
                height: "42px",
                display: "grid",
                placeItems: "center",
                borderRadius: "15px",
                background:
                  "linear-gradient(135deg, var(--parapost-accent-2), var(--parapost-accent-1) 60%, var(--parapost-accent-3))",
                boxShadow: "0 16px 34px var(--parapost-accent-strong-glow)",
                overflow: "hidden",
              }}
            >
              <img
                src="/parapost-icon-white.png"
                alt=""
                aria-hidden="true"
                style={{
                  width: "26px",
                  height: "26px",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </span>

            <span style={{ minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  color: "var(--parapost-accent-text)",
                  fontSize: "11px",
                  fontWeight: 950,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Parapost Showcase
              </p>

              <h3
                style={{
                  margin: "3px 0 0",
                  color: "#ffffff",
                  fontSize: "20px",
                  fontWeight: 950,
                  letterSpacing: "-0.035em",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {getDashboardShowcaseLabel(showcase)}
              </h3>

              <p
                style={{
                  margin: "5px 0 0",
                  color: "#9ca3af",
                  fontSize: "12px",
                  fontWeight: 850,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {profileName} · {profileHandle}
              </p>
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Showcase viewer"
            style={{
              width: "44px",
              height: "44px",
              flexShrink: 0,
              borderRadius: "16px",
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.08)",
              color: "#ffffff",
              fontSize: "28px",
              lineHeight: 1,
              cursor: "pointer",
              fontWeight: 900,
              fontFamily: "inherit",
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            position: "relative",
            flex: "1 1 auto",
            minHeight: "420px",
            borderRadius: "28px",
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.14)",
            background:
              "radial-gradient(circle at 20% 0%, rgba(34,211,238,0.30), transparent 34%), linear-gradient(135deg, rgba(20,184,166,0.78), var(--parapost-accent-2) 52%, var(--parapost-accent-2))",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 30px 80px rgba(0,0,0,0.46)",
          }}
        >
          {showcase.media_url && mediaType === "image" ? (
            <img
              src={showcase.media_url}
              alt=""
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                objectPosition: "center center",
                display: "block",
                backgroundColor: "#05060a",
              }}
            />
          ) : showcase.media_url && mediaType === "video" ? (
            <video
              key={showcase.id}
              src={showcase.media_url}
              controls
              autoPlay
              playsInline
              preload="metadata"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                objectPosition: "center center",
                display: "block",
                backgroundColor: "#05060a",
              }}
            />
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(circle at 22% 0%, rgba(34,211,238,0.30), transparent 34%), linear-gradient(135deg, rgba(20,184,166,0.82), var(--parapost-accent-strong-glow) 45%, var(--parapost-accent-2))",
              }}
            />
          )}

          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.08) 42%, rgba(0,0,0,0.48))",
              pointerEvents: "none",
            }}
          />

                    {coverText ? (
                      <span
                        style={{
                        position: "absolute",
                        zIndex: 3,
                        left: `${Number.isFinite(x) ? x : 50}%`,
                        top: `${Number.isFinite(y) ? y : 50}%`,
                        transform: "translate(-50%, -50%)",
                        width: getShowcaseOverlayTextWidth(coverText),
                        maxWidth: getShowcaseOverlayTextWidth(coverText),
                        maxHeight: "74%",
                        color: "#ffffff",
                        fontWeight: 950,
                        lineHeight: 1.05,
                        letterSpacing: "-0.035em",
                        textAlign: "center",
                        textShadow: "0 4px 24px rgba(0,0,0,0.55)",
                        pointerEvents: "none",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        overflowWrap: "anywhere",
                        overflow: "hidden",
                        boxSizing: "border-box",
                        fontFamily: getDashboardShowcaseFontFamily(showcase.font_key),
                        fontSize: `${Math.min(
                          48,
                          Math.max(
                            16,
                            getShowcaseOverlayDisplayFontSize(
                              coverText,
                              showcase.overlay_font_size || SHOWCASE_OVERLAY_DEFAULT_FONT_SIZE
                            )
                          )
                        )}px`,
                      }}
                    >
                      {coverText}
                    </span>
                  ) : null}

          {hasMultipleShowcases && previousShowcase ? (
            <button
              type="button"
              onClick={handlePrevious}
              aria-label="Previous Showcase"
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 7,
                width: 42,
                height: 42,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(0,0,0,0.36)",
                color: "white",
                fontSize: 24,
                cursor: "pointer",
                backdropFilter: "blur(10px)",
              }}
            >
              ‹
            </button>
          ) : null}

          {hasMultipleShowcases && nextShowcase ? (
            <button
              type="button"
              onClick={handleNext}
              aria-label="Next Showcase"
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 7,
                width: 42,
                height: 42,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(0,0,0,0.36)",
                color: "white",
                fontSize: 24,
                cursor: "pointer",
                backdropFilter: "blur(10px)",
              }}
            >
              ›
            </button>
          ) : null}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            alignItems: "center",
            gap: "12px",
            flex: "0 0 auto",
            paddingTop: "2px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <strong
              style={{
                display: "block",
                color: "#ffffff",
                fontSize: "15px",
                fontWeight: 950,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {getDashboardShowcaseLabel(showcase)}
            </strong>

            <p
              style={{
                margin: "4px 0 0",
                color: "#9ca3af",
                fontSize: "12px",
                fontWeight: 800,
              }}
            >
              Visibility: {showcase.visibility || "public"} ·{" "}
              {showcase.duration === "permanent" ? "Stays until removed" : showcase.duration || "Showcase"}
            </p>
          </div>

          <Link
            href={`/profile/${showcase.user_id}`}
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 38,
              padding: "0 14px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(255,255,255,0.08)",
              color: "white",
              textDecoration: "none",
              fontSize: 12,
              fontWeight: 950,
            }}
          >
            View Profile
          </Link>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ComposerCard({
  composerRef,
  currentProfile,
  firstName,
  content,
  setContent,
  images,
  imagePreviewUrls,
  loading,
  selectedFeelingActivity,
  fileInputRef,
  onImageChange,
  onRemoveImage,
  onOpenFeelingActivity,
  onClearFeelingActivity,
  onPost,
}: {
  composerRef: RefObject<HTMLElement | null>;
  currentProfile: ProfilePreview | null;
  firstName: string;
  content: string;
  setContent: (value: string) => void;
  images: File[];
  imagePreviewUrls: string[];
  loading: boolean;
  selectedFeelingActivity: FeelingActivityOption | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onImageChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (index?: number) => void;
  onOpenFeelingActivity: () => void;
  onClearFeelingActivity: () => void;
  onPost: () => void;
}) {
  const canPublish = content.trim().length > 0 || images.length > 0 || !!selectedFeelingActivity;

  return (
    <section id="dashboard-create-post" ref={composerRef} className="dashboard-card dashboard-composer-card" style={composerCardStyle}>
      <div className="dashboard-composer-top-row" style={composerTopRowStyle}>
        <Avatar profile={currentProfile} size={48} />
        <textarea
          id="dashboard-create-post-input"
          value={content}
          onChange={(event) => setContent(event.target.value.slice(0, POST_CHARACTER_LIMIT))}
          placeholder={`What's on your mind, ${firstName}?`}
          rows={2}
          maxLength={POST_CHARACTER_LIMIT}
          style={composerInputStyle}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()} style={composerImageButtonStyle} aria-label="Upload photo or video">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 17L8.5 12.5L11 15L15.5 10.5L20 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="3" y="5" width="18" height="15" rx="3" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={onImageChange} style={{ display: "none" }} />

      {imagePreviewUrls.length > 0 ? (
        <div className="dashboard-composer-media-preview-wrap" style={imagePreviewWrapStyle}>
          <div
            className={`dashboard-composer-media-preview-grid ${imagePreviewUrls.length === 1 ? "dashboard-composer-media-preview-grid-single" : ""}`}
            style={{
              ...composerPreviewGridStyle,
              ...(imagePreviewUrls.length === 1 ? composerPreviewSingleGridStyle : null),
            }}
          >
            {imagePreviewUrls.slice(0, MAX_POST_IMAGES).map((previewUrl, index) => {
              const selectedFile = images[index];
              const isVideo = selectedFile?.type.startsWith("video/") || isVideoMediaUrl(previewUrl);

              return (
                <button
                  key={`${previewUrl}-${index}`}
                  type="button"
                  onClick={() => onRemoveImage(index)}
                  className="dashboard-composer-media-preview-tile"
                  style={{
                    ...composerPreviewTileStyle,
                    ...(imagePreviewUrls.length === 1 ? composerPreviewSingleTileStyle : null),
                  }}
                  aria-label={`Remove selected media ${index + 1}`}
                >
                  {isVideo ? (
                    <video
                        src={previewUrl}
                        muted
                        playsInline
                        preload="metadata"
                        onLoadedMetadata={primeVideoPreview}
                        onLoadedData={primeVideoPreview}
                        style={composerPreviewImageStyle}
                      />
                  ) : (
                    <img src={previewUrl} alt={`Selected preview ${index + 1}`} style={composerPreviewImageStyle} />
                  )}
                  <span className="dashboard-composer-media-preview-counter" style={composerPreviewCounterStyle}>
                    {index + 1} of {imagePreviewUrls.length}
                  </span>
                  {isVideo ? <span style={composerPreviewTypeBadgeStyle}>Video</span> : null}
                </button>
              );
            })}
          </div>
          <div style={imagePreviewMetaRowStyle}>
            <span style={selectedImageNameStyle}>
              {images.length} file{images.length === 1 ? "" : "s"} selected · up to {MAX_POST_IMAGES} · 1 video max · {MAX_POST_VIDEO_SECONDS}s video limit
            </span>
            <button type="button" onClick={() => onRemoveImage()} style={removeImageButtonStyle}>Remove media</button>
          </div>
        </div>
      ) : null}

      {selectedFeelingActivity ? (
        <div style={selectedFeelingActivityStyle}>
          <span style={selectedFeelingCategoryStyle}>{selectedFeelingActivity.category}</span>
          <strong style={selectedFeelingLabelStyle}>{selectedFeelingActivity.label}</strong>
          <button type="button" onClick={onClearFeelingActivity} style={selectedFeelingRemoveStyle}>Remove</button>
        </div>
      ) : null}

      <div className="dashboard-composer-actions" style={composerActionGridStyle}>
        <ComposerActionPill label="Photo / Video" icon="▣" tone="green" onClick={() => fileInputRef.current?.click()} />
        <ComposerActionPill label="Parapost Reel" icon="▶" tone="pink" href="/reels?create=1" />
        <ComposerActionPill label="Live Stream" icon="◎" tone="red" href="/live" />
        <ComposerActionPill label="Feeling / Activity" icon="●" tone="gold" active={!!selectedFeelingActivity} onClick={onOpenFeelingActivity} />
      </div>

      <div className="dashboard-composer-footer" style={composerFooterStyle}>
        <span aria-hidden="true" style={{ display: "none" }} />
        <button
          type="button"
          disabled={!canPublish || loading}
          onClick={onPost}
          style={{
            ...publishButtonStyle,
            opacity: !canPublish || loading ? 0.58 : 1,
            cursor: !canPublish || loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Publishing..." : "Publish post"}
        </button>
      </div>
    </section>
  );
}

function ComposerActionPill({
  label,
  icon,
  tone,
  href,
  onClick,
  disabled = false,
  active = false,
  note,
}: {
  label: string;
  icon: string;
  tone: "green" | "pink" | "red" | "gold";
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  note?: string;
}) {
  const toneStyle = composerActionToneStyles[tone];
  const content = (
    <>
      <span style={{ ...composerActionIconStyle, ...toneStyle }}>{icon}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {note ? <span style={composerActionNoteStyle}>{note}</span> : null}
      </span>
    </>
  );

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        title="Live Stream is coming soon."
        style={{ ...composerActionPillStyle, ...composerActionDisabledStyle }}
      >
        {content}
      </button>
    );
  }

  if (href) {
    return (
      <Link href={href} style={active ? { ...composerActionPillStyle, ...composerActionPillActiveStyle } : composerActionPillStyle}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} style={active ? { ...composerActionPillStyle, ...composerActionPillActiveStyle } : composerActionPillStyle}>
      {content}
    </button>
  );
}

function FeedTabs({ feedMode, setFeedMode }: { feedMode: FeedMode; setFeedMode: (mode: FeedMode) => void }) {
  return (
    <div className="dashboard-card" style={feedTabsStyle}>
      <FeedTab label="For You" active={feedMode === "for_you"} onClick={() => setFeedMode("for_you")} />
      <FeedTab label="Friends" active={feedMode === "friends"} onClick={() => setFeedMode("friends")} />
      <FeedTab label="Following" active={feedMode === "following"} onClick={() => setFeedMode("following")} />
      <FeedTab label="Live" href="/live" />
    </div>
  );
}

function FeedTab({
  label,
  active = false,
  disabled = false,
  href,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const style = disabled ? disabledFeedTabStyle : active ? activeFeedTabStyle : feedTabStyle;

  if (href && !disabled) {
    return (
      <Link href={href} style={{ ...style, textDecoration: "none" }}>
        {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      style={style}
    >
      {label}
    </button>
  );
}

function DashboardEmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="dashboard-card" style={emptyStateStyle}>
      <h3 style={{ margin: "0 0 8px", fontSize: 20 }}>{title}</h3>
      <p style={{ margin: 0, color: "#9ca3af", lineHeight: 1.55 }}>{text}</p>
    </div>
  );
}

function FeedPulseStrip({ itemCount, totalLikes, totalComments, totalShares }: { itemCount: number; totalLikes: number; totalComments: number; totalShares: number }) {
  return (
    <section className="dashboard-card dashboard-feed-pulse" style={feedPulseStyle}>
      <div>
        <div style={feedPulseEyebrowStyle}>Live dashboard feed</div>
        <h2 style={feedPulseTitleStyle}>What’s happening on Parapost Network</h2>
      </div>
      <div className="dashboard-feed-pulse-stats" style={feedPulseStatsStyle}>
        <MiniFeedStat label="Feed items" value={itemCount} />
        <MiniFeedStat label="Likes" value={totalLikes} />
        <MiniFeedStat label="Comments" value={totalComments} />
        <MiniFeedStat label="Shares" value={totalShares} />
      </div>
    </section>
  );
}

function MiniFeedStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={miniFeedStatStyle}>
      <strong style={miniFeedStatValueStyle}>{value}</strong>
      <span style={miniFeedStatLabelStyle}>{label}</span>
    </div>
  );
}


function LiveStreamViewCount({
  streamId,
  initialViews = 0,
  shouldCount = true,
  playerElementId,
}: {
  streamId: string;
  initialViews?: number | null;
  shouldCount?: boolean;
  playerElementId: string;
}) {
  const [viewCount, setViewCount] = useState(Math.max(0, Number(initialViews || 0)));
  const countedRef = useRef(false);

  useEffect(() => {
    if (!streamId || !shouldCount || !playerElementId || countedRef.current) return;

    const countView = async () => {
      if (countedRef.current) return;
      countedRef.current = true;

      const { data, error } = await supabase.rpc("increment_live_stream_views", {
        target_stream_id: streamId,
      });

      if (error) {
        countedRef.current = false;
        console.warn("Live view count update skipped:", error.message);
        return;
      }

      const nextCount =
        typeof data === "number"
          ? data
          : Array.isArray(data) && typeof data[0] === "number"
            ? data[0]
            : Number(data);

      if (Number.isFinite(nextCount)) {
        setViewCount(Math.max(0, nextCount));
      }
    };

    const handleWindowBlur = () => {
      window.setTimeout(() => {
        const activeElement = document.activeElement;
        if (!(activeElement instanceof HTMLIFrameElement)) return;
        if (activeElement.id !== playerElementId) return;
        void countView();
      }, 0);
    };

    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [playerElementId, shouldCount, streamId]);

  const label = viewCount === 1 ? "View" : "Views";

  return <span>{viewCount.toLocaleString()} {label}</span>;
}

function DashboardLiveStreamCard({
  stream,
  currentUserId,
}: {
  stream: DashboardLiveStreamItem;
  currentUserId: string;
}) {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [showReplayDiscussion, setShowReplayDiscussion] = useState(false);

  const creatorProfile = stream.profile;
  const creatorName = creatorProfile?.full_name || creatorProfile?.username || "Parapost creator";
  const creatorHandle = creatorProfile?.username || "member";
  const effectiveStatus = getDashboardEffectiveLiveStatus(stream);
  const isLive = effectiveStatus === "live";
  const isReplay = effectiveStatus === "ended";
  const isPlayable = (isLive || isReplay) && Boolean(stream.embed_url);
  const chatStatus = getDashboardLiveChatStatus(effectiveStatus);
  const hasLongDescription = Boolean(stream.description && stream.description.length > 150);
  const scheduleLabel = isLive
    ? "Live Now"
    : isReplay
      ? `Replay from ${formatDashboardLiveDate(stream.ended_at || stream.started_at || stream.updated_at || stream.created_at)}`
      : `Scheduled ${formatDashboardLiveDate(stream.scheduled_at)}`;
  const providerLabel = stream.provider
    ? stream.provider.charAt(0).toUpperCase() + stream.provider.slice(1)
    : "Live stream";

  return (
    <article
      className={`dashboard-live-feed-card ${isLive ? "dashboard-live-feed-card-live" : isReplay ? "dashboard-live-feed-card-replay" : "dashboard-live-feed-card-upcoming"}`}
      style={{
        ...postCardStyle,
        position: "relative",
        overflow: "hidden",
        borderColor: isLive
          ? "rgba(74,222,128,0.38)"
          : isReplay
            ? "rgba(148,163,184,0.22)"
            : "rgba(251,191,36,0.26)",
        boxShadow: isLive
          ? "0 20px 58px rgba(0,0,0,0.34), 0 0 34px rgba(34,197,94,0.12)"
          : "0 18px 46px rgba(0,0,0,0.30)",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: isLive
            ? "radial-gradient(circle at 18% 0%, rgba(34,197,94,0.18), transparent 34%), radial-gradient(circle at 92% 10%, color-mix(in srgb, var(--parapost-accent, #a855f7) 16%, transparent), transparent 34%)"
            : isReplay
              ? "radial-gradient(circle at 18% 0%, rgba(148,163,184,0.12), transparent 34%), radial-gradient(circle at 92% 10%, color-mix(in srgb, var(--parapost-accent, #a855f7) 12%, transparent), transparent 34%)"
              : "radial-gradient(circle at 18% 0%, rgba(245,158,11,0.16), transparent 34%), radial-gradient(circle at 92% 10%, color-mix(in srgb, var(--parapost-accent, #a855f7) 14%, transparent), transparent 34%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        <header style={{ ...postHeaderStyle, alignItems: "flex-start" }}>
          <Avatar profile={creatorProfile} size={48} href={`/profile/${stream.user_id}`} />

          <div style={{ minWidth: 0, flex: "1 1 auto" }}>
            <Link href={`/profile/${stream.user_id}`} style={postAuthorNameStyle}>
              {creatorName}
            </Link>
            <span style={postMetaStyle}>
              @{creatorHandle} · {isLive ? "is live now" : isReplay ? "shared a replay" : "scheduled a live show"}
            </span>
          </div>

          {!isReplay ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "7px 10px",
                borderRadius: 999,
                color: isLive ? "#dcfce7" : "#fef3c7",
                background: isLive ? "rgba(34,197,94,0.18)" : "rgba(245,158,11,0.16)",
                border: isLive ? "1px solid rgba(74,222,128,0.30)" : "1px solid rgba(251,191,36,0.26)",
                fontSize: 12,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                whiteSpace: "nowrap",
              }}
            >
              {isLive ? "●" : "◎"} {getDashboardLiveStatusLabel(stream)}
            </span>
          ) : null}
        </header>

        <div
          className="dashboard-live-media-frame"
          style={{
            marginTop: 14,
            borderRadius: 20,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "#05070a",
            maxWidth: 760,
            marginLeft: "auto",
            marginRight: "auto",
            width: "100%",
            aspectRatio: "16 / 9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isPlayable ? (
            <iframe
              id={`dashboard-live-player-${stream.id}`}
              src={stream.embed_url || ""}
              title={stream.title || "Parapost Live Show"}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              style={{
                width: "100%",
                height: "100%",
                minHeight: 0,
                border: 0,
                display: "block",
                background: "#05070a",
              }}
            />
          ) : stream.thumbnail_url ? (
            <div
              className="dashboard-live-thumbnail-wrap"
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#05070a",
              }}
            >
              <img
                className="dashboard-live-thumbnail-image"
                src={stream.thumbnail_url}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  objectPosition: "center center",
                  display: "block",
                  background: "#05070a",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "flex-end",
                  padding: 18,
                  background:
                    "linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.68))",
                }}
              >
                <strong style={{ color: "#ffffff", fontSize: 18 }}>
                  Scheduled Live Show
                </strong>
              </div>
            </div>
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                minHeight: 180,
                display: "grid",
                placeItems: "center",
                textAlign: "center",
                padding: 24,
                background:
                  "linear-gradient(135deg, color-mix(in srgb, var(--parapost-accent, #a855f7) 20%, rgba(255,255,255,0.05)), rgba(0,0,0,0.48))",
              }}
            >
              <div>
                <div style={{ fontSize: 42, marginBottom: 8 }}>LIVE</div>
                <div style={{ color: "#d1d5db", fontSize: 13, fontWeight: 800 }}>{providerLabel}</div>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <div
            style={{
              color: isLive ? "#bbf7d0" : isReplay ? "#cbd5e1" : "#fde68a",
              fontSize: 12,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 7,
            }}
          >
            {scheduleLabel}
            {(isLive || isReplay) && stream.id ? (
              <>
                {" · "}
                <LiveStreamViewCount
                  streamId={stream.id}
                  initialViews={stream.views}
                  shouldCount={isPlayable}
                  playerElementId={`dashboard-live-player-${stream.id}`}
                />
              </>
            ) : null}
          </div>

          <h3 style={{ margin: 0, color: "#ffffff", fontSize: "1.18rem", lineHeight: 1.18, letterSpacing: "-0.035em" }}>
            {stream.title || "Parapost Live Show"}
          </h3>

          {stream.description ? (
            <>
              <p
                style={{
                  ...postContentStyle,
                  marginTop: 10,
                  display: descriptionExpanded ? "block" : "-webkit-box",
                  WebkitLineClamp: descriptionExpanded ? "unset" : 2,
                  WebkitBoxOrient: "vertical",
                  overflow: descriptionExpanded ? "visible" : "hidden",
                }}
              >
                {stream.description}
              </p>

              {hasLongDescription ? (
                <button
                  type="button"
                  onClick={() => setDescriptionExpanded((value) => !value)}
                  style={{
                    border: 0,
                    background: "transparent",
                    color: "#c4b5fd",
                    padding: "4px 0 0",
                    fontSize: 13,
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  {descriptionExpanded ? "Show less" : "More"}
                </button>
              ) : null}
            </>
          ) : null}

          {!isReplay ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: 34,
                  borderRadius: 999,
                  padding: "7px 12px",
                  color: isLive ? "#dcfce7" : "#fef3c7",
                  background: isLive ? "rgba(34,197,94,0.14)" : "rgba(245,158,11,0.14)",
                  border: isLive ? "1px solid rgba(74,222,128,0.26)" : "1px solid rgba(251,191,36,0.24)",
                  fontSize: 12.5,
                  fontWeight: 850,
                }}
              >
                {isLive
                  ? "Watch and comment here on Parapost."
                  : "This becomes the live player when the show starts."}
              </span>
            </div>
          ) : null}

          {isLive && stream.id ? (
            <LiveChatPanel
              liveStreamId={stream.id}
              creatorUserId={stream.user_id}
              currentUserId={currentUserId}
              status={chatStatus}
              compact
              maxVisibleMessages={4}
            />
          ) : null}

          {isReplay && stream.id ? (
            <div style={replayDiscussionWrapStyle}>
              {!showReplayDiscussion ? (
                <button
                  type="button"
                  onClick={() => setShowReplayDiscussion(true)}
                  style={replayDiscussionButtonStyle}
                >
                  View replay discussion / add comment
                </button>
              ) : (
                <>
                  <div style={replayDiscussionHeaderStyle}>
                    <strong>Replay discussion</strong>
                    <button
                      type="button"
                      onClick={() => setShowReplayDiscussion(false)}
                      style={replayDiscussionCloseButtonStyle}
                    >
                      Hide discussion
                    </button>
                  </div>

                  <LiveChatPanel
                    liveStreamId={stream.id}
                    creatorUserId={stream.user_id}
                    currentUserId={currentUserId}
                    status={chatStatus}
                    compact
                    maxVisibleMessages={4}
                  />
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}


const replayDiscussionWrapStyle: CSSProperties = {
  marginTop: 14,
};

const replayDiscussionButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 42,
  borderRadius: 999,
  border: "1px solid rgba(216,180,254,0.22)",
  background:
    "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(124,58,237,0.12))",
  color: "#f5f3ff",
  padding: "0 14px",
  fontSize: 13,
  fontWeight: 950,
  cursor: "pointer",
};

const replayDiscussionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 8,
  color: "#f5f3ff",
  fontSize: 13,
};

const replayDiscussionCloseButtonStyle: CSSProperties = {
  border: 0,
  background: "transparent",
  color: "#c4b5fd",
  padding: 0,
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};


function PostCard({
  post,
  profile,
  currentUserId,
  profilesMap,
  isLiked,
  likeCount,
  commentCount,
  shareCount,
  isFollowing,
  isFriend,
  openPostMenuId,
  editingPostId,
  editingPostContent,
  setEditingPostContent,
  setOpenPostMenuId,
  commentsOpen,
  comments,
  commentsLoading,
  commentDraft,
  postingComment,
  editingCommentId,
  editingCommentText,
  savingCommentId,
  commentLikeCounts,
  commentUserLikes,
  setEditingCommentText,
  onToggleCommentLike,
  onStartEditComment,
  onSaveEditComment,
  onCancelEditComment,
  onLike,
  onToggleComments,
  onCommentDraftChange,
  onAddComment,
  onDeleteComment,
  onReportComment,
  onShare,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onReport,
  onOpenImage,
}: {
  post: Post;
  profile?: ProfilePreview | null;
  currentUserId: string;
  profilesMap: Record<string, ProfilePreview>;
  isLiked: boolean;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  isFollowing: boolean;
  isFriend: boolean;
  openPostMenuId: string | null;
  editingPostId: string | null;
  editingPostContent: string;
  setEditingPostContent: (value: string) => void;
  setOpenPostMenuId: (value: string | null | ((prev: string | null) => string | null)) => void;
  commentsOpen: boolean;
  comments: DashboardComment[];
  commentsLoading: boolean;
  commentDraft: string;
  postingComment: boolean;
  editingCommentId: string | null;
  editingCommentText: string;
  savingCommentId: string | null;
  commentLikeCounts: CountMap;
  commentUserLikes: ToggleMap;
  setEditingCommentText: (value: string) => void;
  onToggleCommentLike: (commentId: string) => void;
  onStartEditComment: (comment: DashboardComment) => void;
  onSaveEditComment: (comment: DashboardComment) => void;
  onCancelEditComment: () => void;
  onLike: () => void;
  onToggleComments: () => void;
  onCommentDraftChange: (value: string) => void;
  onAddComment: () => void;
  onDeleteComment: (commentId: string) => void;
  onReportComment: (commentId: string, commentOwnerId: string) => void;
  onShare: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
  onOpenImage?: (url: string, alt: string) => void;
}) {
  const isPostOwner = currentUserId === post.user_id;
  const isEditing = editingPostId === post.id;
  const displayName = profile?.full_name || profile?.username || "Parapost user";
  const profileHref = `/profile/${post.user_id}`;
  const relationshipLabel = isPostOwner ? "Profile" : isFriend ? "Friends" : isFollowing ? "Following" : "Profile";
  const { headerActivityText, bodyContent } = splitPostFeelingActivityContent(post.content || "");

  return (
    <article id={`post-${post.id}`} className="dashboard-card dashboard-feed-card" style={postCardStyle} onClick={(event) => event.stopPropagation()}>
      <div className="dashboard-post-header" style={postHeaderStyle}>
        <div style={postAuthorStyle}>
          <Avatar profile={profile} size={54} href={profileHref} />
          <div style={{ minWidth: 0 }}>
            <div style={postAuthorNameLineStyle}>
              <Link href={profileHref} style={{ ...postAuthorNameStyle, display: "inline" }}>{displayName}</Link>
              {headerActivityText ? <span style={postAuthorActivityTextStyle}>{headerActivityText}</span> : null}
            </div>
            <div style={postMetaStyle}>
              @{profile?.username || "member"} · {formatRelativeTime(post.created_at)} · {" "}
              <Link href={profileHref} style={postStatusLinkStyle}>{relationshipLabel}</Link>
            </div>
          </div>
        </div>

        {currentUserId ? (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setOpenPostMenuId((prev) => (prev === post.id ? null : post.id));
              }}
              style={dotsButtonStyle}
              aria-label="Post options"
            >
              <DotsIcon />
            </button>
            {openPostMenuId === post.id ? (
              <div style={postMenuStyle} onClick={(event) => event.stopPropagation()}>
                {isPostOwner ? (
                  <>
                    <button type="button" style={menuItemStyle} onClick={onStartEdit}>Edit post</button>
                    <button type="button" style={{ ...menuItemStyle, color: "#fca5a5" }} onClick={onDelete}>Delete post</button>
                  </>
                ) : (
                  <button
                    type="button"
                    style={{ ...menuItemStyle, color: "#fca5a5", borderBottomColor: "transparent" }}
                    onClick={onReport}
                  >
                    Report post
                  </button>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {isEditing ? (
        <div style={{ marginTop: 14 }}>
          <textarea value={editingPostContent} onChange={(event) => setEditingPostContent(event.target.value)} rows={4} style={editTextareaStyle} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <button type="button" onClick={onSaveEdit} style={publishButtonStyle}>Save</button>
            <button type="button" onClick={onCancelEdit} style={softButtonStyle}>Cancel</button>
          </div>
        </div>
      ) : bodyContent ? (
        <>
          <ExpandableFeedText
            text={bodyContent}
            hasMedia={getPostImageUrls(post).length > 0 || Boolean(getFirstSafeLinkPreview(bodyContent))}
            style={postContentStyle}
          />
          <LinkPreviewCard text={bodyContent} />
        </>
      ) : null}

      <PostImageGrid imageUrls={getPostImageUrls(post)} alt="Post image" onOpenImage={onOpenImage} />

      {likeCount > 0 || commentCount > 0 || shareCount > 0 ? (
        <div style={postStatsSummaryStyle}>
          {likeCount > 0 ? <span>{likeCount} {likeCount === 1 ? "Like" : "Likes"}</span> : null}
          {likeCount > 0 && (commentCount > 0 || shareCount > 0) ? <span>·</span> : null}
          {commentCount > 0 ? <span>{commentCount} {commentCount === 1 ? "Comment" : "Comments"}</span> : null}
          {commentCount > 0 && shareCount > 0 ? <span>·</span> : null}
          {shareCount > 0 ? <span>{shareCount} {shareCount === 1 ? "Share" : "Shares"}</span> : null}
        </div>
      ) : null}

      <div className="dashboard-post-actions" style={postActionsStyle}>
        <ActionButton label="Like" onClick={onLike} active={isLiked}>
          <HeartIcon filled={isLiked} />
          <span className="dashboard-action-label">Like</span>
        </ActionButton>
        <ActionButton label="Comment" onClick={onToggleComments} active={commentsOpen}>
          <CommentIcon />
          <span className="dashboard-action-label">Comment</span>
        </ActionButton>
        <ActionButton label="Share" onClick={onShare}>
          <ShareIcon />
          <span className="dashboard-action-label">Share</span>
        </ActionButton>
      </div>

      {!commentsOpen && comments.length > 0 ? (
        <DashboardCommentsPreview
          postId={post.id}
          comments={comments}
          commentCount={commentCount}
          profilesMap={profilesMap}
          currentUserId={currentUserId}
          onToggleComments={onToggleComments}
          editingCommentId={editingCommentId}
          editingCommentText={editingCommentText}
          savingCommentId={savingCommentId}
          commentLikeCounts={commentLikeCounts}
          commentUserLikes={commentUserLikes}
          setEditingCommentText={setEditingCommentText}
          onToggleCommentLike={onToggleCommentLike}
          onStartEditComment={onStartEditComment}
          onSaveEditComment={onSaveEditComment}
          onCancelEditComment={onCancelEditComment}
          onDeleteComment={onDeleteComment}
          onReportComment={onReportComment}
        />
      ) : null}

      {commentsOpen ? (
        <DashboardCommentsPanel
          postId={post.id}
          postOwnerId={post.user_id}
          comments={comments}
          profilesMap={profilesMap}
          currentUserId={currentUserId}
          loading={commentsLoading}
          draft={commentDraft}
          posting={postingComment}
          onDraftChange={onCommentDraftChange}
          onAddComment={onAddComment}
          editingCommentId={editingCommentId}
          editingCommentText={editingCommentText}
          savingCommentId={savingCommentId}
          commentLikeCounts={commentLikeCounts}
          commentUserLikes={commentUserLikes}
          setEditingCommentText={setEditingCommentText}
          onToggleCommentLike={onToggleCommentLike}
          onStartEditComment={onStartEditComment}
          onSaveEditComment={onSaveEditComment}
          onCancelEditComment={onCancelEditComment}
          onDeleteComment={onDeleteComment}
          onReportComment={onReportComment}
          onCloseComments={onToggleComments}
        />
      ) : null}
    </article>
  );
}


function DashboardCommentsPreview({
  postId,
  comments,
  commentCount,
  profilesMap,
  currentUserId,
  onToggleComments,
  editingCommentId,
  editingCommentText,
  savingCommentId,
  commentLikeCounts,
  commentUserLikes,
  setEditingCommentText,
  onToggleCommentLike,
  onStartEditComment,
  onSaveEditComment,
  onCancelEditComment,
  onDeleteComment,
  onReportComment,
}: {
  postId: string;
  postOwnerId?: string | null;
  comments: DashboardComment[];
  commentCount: number;
  profilesMap: Record<string, ProfilePreview>;
  currentUserId: string;
  onToggleComments: () => void;
  editingCommentId: string | null;
  editingCommentText: string;
  savingCommentId: string | null;
  commentLikeCounts: CountMap;
  commentUserLikes: ToggleMap;
  setEditingCommentText: (value: string) => void;
  onToggleCommentLike: (commentId: string) => void;
  onStartEditComment: (comment: DashboardComment) => void;
  onSaveEditComment: (comment: DashboardComment) => void;
  onCancelEditComment: () => void;
  onDeleteComment: (commentId: string) => void;
  onReportComment: (commentId: string, commentOwnerId: string) => void;
}) {
  const previewComments = comments.filter((comment) => !comment.parent_comment_id).slice(-DASHBOARD_COMMENT_PREVIEW_LIMIT);
  const hiddenCommentCount = Math.max(commentCount - previewComments.length, 0);

  if (previewComments.length === 0) return null;

  return (
    <section
      style={{
        ...dashboardCommentsPanelStyle,
        marginTop: 12,
        paddingTop: 12,
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div style={dashboardCommentsListStyle}>
        {previewComments.map((comment) => {
          const author = profilesMap[comment.user_id];
          const authorName = author?.full_name || author?.username || "Parapost member";
          const canManage = !!currentUserId && comment.user_id === currentUserId;
          const isEditingComment = editingCommentId === comment.id;
          const isSavingComment = savingCommentId === comment.id;
          const commentLikeCount = commentLikeCounts[comment.id] || 0;
          const commentLiked = !!commentUserLikes[comment.id];

          return (
            <div key={`preview-${postId}-${comment.id}`} style={dashboardCommentRowStyle}>
              <Avatar profile={author} size={34} href={comment.user_id ? `/profile/${comment.user_id}` : undefined} />
              <div style={dashboardCommentBubbleStyle}>
                <div style={dashboardCommentTopLineStyle}>
                  <Link href={comment.user_id ? `/profile/${comment.user_id}` : "#"} style={dashboardCommentAuthorStyle}>
                    {authorName}
                  </Link>
                  <span style={dashboardCommentTimeStyle}>{formatRelativeTime(comment.created_at)}</span>
                </div>

                {isEditingComment ? (
                  <div style={dashboardCommentEditWrapStyle}>
                    <textarea
                      value={editingCommentText}
                      onChange={(event) => setEditingCommentText(event.target.value)}
                      rows={2}
                      maxLength={1200}
                      style={dashboardCommentEditTextareaStyle}
                      autoFocus
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          onCancelEditComment();
                        }

                        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                          event.preventDefault();
                          onSaveEditComment(comment);
                        }
                      }}
                    />
                    <div style={dashboardCommentEditActionsStyle}>
                      <button
                        type="button"
                        onClick={() => onSaveEditComment(comment)}
                        disabled={!editingCommentText.trim() || isSavingComment}
                        style={{
                          ...dashboardCommentEditPrimaryButtonStyle,
                          opacity: editingCommentText.trim() && !isSavingComment ? 1 : 0.55,
                          cursor: editingCommentText.trim() && !isSavingComment ? "pointer" : "not-allowed",
                        }}
                      >
                        {isSavingComment ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={onCancelEditComment}
                        disabled={isSavingComment}
                        style={dashboardCommentEditSecondaryButtonStyle}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <TwoLineExpandableComment text={comment.content || ""} expanded={false} onToggle={onToggleComments} style={dashboardCommentTextStyle} />
                )}

                {!isEditingComment ? (
                  <div style={dashboardCommentActionRowStyle}>
                    {currentUserId ? (
                      <button
                        type="button"
                        onClick={() => onToggleCommentLike(comment.id)}
                        style={{
                          ...dashboardCommentEditActionButtonStyle,
                          color: "#ffffff",
                        }}
                      >
                        {commentLiked ? "Liked" : "Like"}
                      </button>
                    ) : null}

                    {commentLikeCount > 0 ? (
                      <span style={dashboardCommentLikeCountStyle}>
                        {commentLikeCount} {commentLikeCount === 1 ? "like" : "likes"}
                      </span>
                    ) : null}

                    {currentUserId ? (
                      <button
                        type="button"
                        onClick={onToggleComments}
                        style={dashboardCommentEditActionButtonStyle}
                      >
                        Reply
                      </button>
                    ) : null}

                    {canManage ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onStartEditComment(comment)}
                          style={dashboardCommentEditActionButtonStyle}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteComment(comment.id)}
                          style={dashboardCommentDeleteButtonStyle}
                        >
                          Delete
                        </button>
                      </>
                    ) : currentUserId ? (
                      <button
                        type="button"
                        onClick={() => onReportComment(comment.id, comment.user_id)}
                        style={dashboardCommentDeleteButtonStyle}
                      >
                        Report
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {hiddenCommentCount > 0 ? (
        <button
          type="button"
          onClick={onToggleComments}
          style={{
            ...softButtonStyle,
            marginTop: 10,
            minHeight: 36,
            padding: "0 12px",
            fontSize: 13,
          }}
        >
          View all {commentCount} comments
        </button>
      ) : null}
    </section>
  );
}


function DashboardCommentsPanel({
  postId,
  postOwnerId,
  comments,
  profilesMap,
  currentUserId,
  loading,
  draft,
  posting,
  onDraftChange,
  onAddComment,
  editingCommentId,
  editingCommentText,
  savingCommentId,
  commentLikeCounts,
  commentUserLikes,
  setEditingCommentText,
  onToggleCommentLike,
  onStartEditComment,
  onSaveEditComment,
  onCancelEditComment,
  onDeleteComment,
  onReportComment,
  onCloseComments,
}: {
  postId: string;
  postOwnerId: string;
  comments: DashboardComment[];
  profilesMap: Record<string, ProfilePreview>;
  currentUserId: string;
  loading: boolean;
  draft: string;
  posting: boolean;
  onDraftChange: (value: string) => void;
  onAddComment: () => void;
  editingCommentId: string | null;
  editingCommentText: string;
  savingCommentId: string | null;
  commentLikeCounts: CountMap;
  commentUserLikes: ToggleMap;
  setEditingCommentText: (value: string) => void;
  onToggleCommentLike: (commentId: string) => void;
  onStartEditComment: (comment: DashboardComment) => void;
  onSaveEditComment: (comment: DashboardComment) => void;
  onCancelEditComment: () => void;
  onDeleteComment: (commentId: string) => void;
  onReportComment: (commentId: string, commentOwnerId: string) => void;
  onCloseComments: () => void;
}) {
  const [threadComments, setThreadComments] = useState<DashboardComment[]>(comments);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [postingReply, setPostingReply] = useState(false);
  const [expandedTextMap, setExpandedTextMap] = useState<Record<string, boolean>>({});
  const [expandedThreadsMap, setExpandedThreadsMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setThreadComments(comments);
  }, [comments]);

  const topLevelComments = threadComments.filter((comment) => !comment.parent_comment_id);
  const repliesFor = (commentId: string) =>
    threadComments.filter((comment) => comment.parent_comment_id === commentId);

  const submitReply = async (parentComment: DashboardComment, replyToComment: DashboardComment) => {
    const trimmed = replyDraft.trim();
    if (!trimmed || !currentUserId || postingReply) return;

    setPostingReply(true);
    try {
      const rootParentId = parentComment.parent_comment_id || parentComment.id;
      const { data, error } = await supabase
        .from("comments")
        .insert([{
          post_id: postId,
          user_id: currentUserId,
          content: trimmed,
          parent_comment_id: rootParentId,
          reply_to_user_id: replyToComment.user_id,
        }])
        .select("id, post_id, user_id, content, created_at, is_hidden, parent_comment_id, reply_to_user_id")
        .single();

      if (error) {
        alert(`Reply error: ${error.message}`);
        return;
      }

      const savedReply = data as DashboardComment;
      setThreadComments((current) => [...current, savedReply]);
      setExpandedThreadsMap((current) => ({ ...current, [rootParentId]: true }));
      setReplyingToId(null);
      setReplyDraft("");

      const recipients = new Set<string>();
      if (replyToComment.user_id && replyToComment.user_id !== currentUserId) {
        recipients.add(replyToComment.user_id);
      }
      if (postOwnerId && postOwnerId !== currentUserId) {
        recipients.add(postOwnerId);
      }

      if (recipients.size > 0) {
        await supabase.from("notifications").insert(
          Array.from(recipients).map((recipientId) => ({
            user_id: recipientId,
            actor_id: currentUserId,
            type: "comment_reply",
            post_id: postId,
            comment_id: savedReply.id,
            friend_request_id: null,
            message:
              recipientId === replyToComment.user_id
                ? "replied to your comment."
                : "replied in a comment thread on your post.",
            is_read: false,
          }))
        );
      }
    } finally {
      setPostingReply(false);
    }
  };

  const renderThreadComment = (
    comment: DashboardComment,
    rootComment: DashboardComment,
    isReply = false,
  ) => {
    const author = profilesMap[comment.user_id];
    const authorName = author?.full_name || author?.username || "Parapost member";
    const canManage = !!currentUserId && comment.user_id === currentUserId;
    const isEditingComment = editingCommentId === comment.id;
    const isSavingComment = savingCommentId === comment.id;
    const commentLikeCount = commentLikeCounts[comment.id] || 0;
    const commentLiked = !!commentUserLikes[comment.id];

    return (
      <div
        key={`${postId}-${comment.id}`}
        style={{
          ...dashboardCommentRowStyle,
          ...(isReply
            ? {
                marginLeft: 38,
                paddingLeft: 10,
                borderLeft: "2px solid rgba(255,255,255,0.08)",
              }
            : {}),
        }}
      >
        <Avatar profile={author} size={isReply ? 30 : 34} href={comment.user_id ? `/profile/${comment.user_id}` : undefined} />
        <div style={dashboardCommentBubbleStyle}>
          <div style={dashboardCommentTopLineStyle}>
            <Link href={comment.user_id ? `/profile/${comment.user_id}` : "#"} style={dashboardCommentAuthorStyle}>
              {authorName}
            </Link>
            <span style={dashboardCommentTimeStyle}>{formatRelativeTime(comment.created_at)}</span>
          </div>

          {isEditingComment ? (
            <div style={dashboardCommentEditWrapStyle}>
              <textarea
                value={editingCommentText}
                onChange={(event) => setEditingCommentText(event.target.value)}
                rows={2}
                maxLength={1200}
                style={dashboardCommentEditTextareaStyle}
                autoFocus
              />
              <div style={dashboardCommentEditActionsStyle}>
                <button type="button" onClick={() => onSaveEditComment(comment)} disabled={!editingCommentText.trim() || isSavingComment} style={dashboardCommentEditPrimaryButtonStyle}>
                  {isSavingComment ? "Saving..." : "Save"}
                </button>
                <button type="button" onClick={onCancelEditComment} disabled={isSavingComment} style={dashboardCommentEditSecondaryButtonStyle}>Cancel</button>
              </div>
            </div>
          ) : (
            <TwoLineExpandableComment
              text={comment.content || ""}
              expanded={!!expandedTextMap[comment.id]}
              onToggle={() => setExpandedTextMap((current) => ({ ...current, [comment.id]: !current[comment.id] }))}
              style={dashboardCommentTextStyle}
            />
          )}

          {!isEditingComment ? (
            <div style={dashboardCommentActionRowStyle}>
              {currentUserId ? (
                <>
                  <button type="button" onClick={() => onToggleCommentLike(comment.id)} style={{ ...dashboardCommentEditActionButtonStyle, color: "#ffffff" }}>
                    {commentLiked ? "Liked" : "Like"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyingToId((current) => (current === comment.id ? null : comment.id));
                      setReplyDraft("");
                    }}
                    style={dashboardCommentEditActionButtonStyle}
                  >
                    Reply
                  </button>
                </>
              ) : null}
              {commentLikeCount > 0 ? <span style={dashboardCommentLikeCountStyle}>{commentLikeCount} {commentLikeCount === 1 ? "like" : "likes"}</span> : null}
              {canManage ? (
                <>
                  <button type="button" onClick={() => onStartEditComment(comment)} style={dashboardCommentEditActionButtonStyle}>Edit</button>
                  <button type="button" onClick={() => onDeleteComment(comment.id)} style={dashboardCommentDeleteButtonStyle}>Delete</button>
                </>
              ) : currentUserId ? (
                <button type="button" onClick={() => onReportComment(comment.id, comment.user_id)} style={dashboardCommentDeleteButtonStyle}>Report</button>
              ) : null}
            </div>
          ) : null}

          {replyingToId === comment.id ? (
            <div style={{ marginTop: 8, display: "grid", gap: 7 }}>
              <textarea
                value={replyDraft}
                onChange={(event) => setReplyDraft(event.target.value)}
                placeholder={`Reply to ${authorName}...`}
                rows={2}
                maxLength={1200}
                style={dashboardCommentEditTextareaStyle}
                autoFocus
              />
              <div style={dashboardCommentEditActionsStyle}>
                <button type="button" onClick={() => submitReply(rootComment, comment)} disabled={!replyDraft.trim() || postingReply} style={dashboardCommentEditPrimaryButtonStyle}>
                  {postingReply ? "Replying..." : "Reply"}
                </button>
                <button type="button" onClick={() => { setReplyingToId(null); setReplyDraft(""); }} style={dashboardCommentEditSecondaryButtonStyle}>Cancel</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <section style={dashboardCommentsPanelStyle} onClick={(event) => event.stopPropagation()}>
      <div style={dashboardCommentsHeaderStyle}>
        <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
          <strong style={{ color: "#f8fafc" }}>Comments</strong>
          <span style={dashboardCommentsCountStyle}>
            {loading ? "Loading..." : `${comments.length} ${comments.length === 1 ? "comment" : "comments"}`}
          </span>
        </div>

        <button
          type="button"
          onClick={onCloseComments}
          style={dashboardCommentsCloseButtonStyle}
          aria-label="Close comments"
        >
          Close comments
        </button>
      </div>

      <div style={dashboardCommentComposerStyle}>
        <textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Write a comment..."
          rows={2}
          maxLength={1200}
          style={dashboardCommentTextareaStyle}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              onAddComment();
            }
          }}
        />
        <button
          type="button"
          onClick={onAddComment}
          disabled={!draft.trim() || posting}
          style={{
            ...dashboardCommentSubmitButtonStyle,
            opacity: draft.trim() && !posting ? 1 : 0.55,
            cursor: draft.trim() && !posting ? "pointer" : "not-allowed",
          }}
        >
          {posting ? "Posting..." : "Post"}
        </button>
      </div>

      {loading ? (
        <div style={dashboardCommentsEmptyStyle}>Loading comments...</div>
      ) : comments.length === 0 ? (
        <div style={dashboardCommentsEmptyStyle}>No comments yet. Be the first to reply.</div>
      ) : (
        <div style={dashboardCommentsListStyle}>
          {topLevelComments.map((comment) => {
            const replies = repliesFor(comment.id);
            const repliesExpanded = !!expandedThreadsMap[comment.id];

            return (
              <div key={`thread-${postId}-${comment.id}`} style={{ display: "grid", gap: 8 }}>
                {renderThreadComment(comment, comment, false)}

                {replies.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setExpandedThreadsMap((current) => ({ ...current, [comment.id]: !current[comment.id] }))}
                    style={{
                      justifySelf: "start",
                      marginLeft: 72,
                      border: "none",
                      background: "transparent",
                      color: "var(--parapost-accent-text, #d8b4fe)",
                      fontSize: 11.5,
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    {repliesExpanded ? "Hide replies" : `View ${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
                  </button>
                ) : null}

                {repliesExpanded ? replies.map((reply) => renderThreadComment(reply, comment, true)) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SharedPostCard({
  sharedPost,
  sharerProfile,
  originalProfile,
  currentUserId,
  profilesMap,
  isLiked,
  likeCount,
  commentCount,
  shareCount,
  openPostMenuId,
  editingPostId,
  editingPostContent,
  setEditingPostContent,
  setOpenPostMenuId,
  commentsOpen,
  comments,
  commentsLoading,
  commentDraft,
  postingComment,
  editingCommentId,
  editingCommentText,
  savingCommentId,
  commentLikeCounts,
  commentUserLikes,
  setEditingCommentText,
  onToggleCommentLike,
  onStartEditComment,
  onSaveEditComment,
  onCancelEditComment,
  onLikeOriginal,
  onToggleComments,
  onCommentDraftChange,
  onAddComment,
  onDeleteComment,
  onReportComment,
  onShareOriginal,
  onStartEditOriginal,
  onSaveEditOriginal,
  onCancelEditOriginal,
  onDeleteOriginal,
  onRemoveShare,
  onReportOriginal,
  onOpenImage,
}: {
  sharedPost: SharedPostItem;
  sharerProfile?: ProfilePreview | null;
  originalProfile?: ProfilePreview | null;
  currentUserId: string;
  profilesMap: Record<string, ProfilePreview>;
  isLiked: boolean;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  openPostMenuId: string | null;
  editingPostId: string | null;
  editingPostContent: string;
  setEditingPostContent: (value: string) => void;
  setOpenPostMenuId: (value: string | null | ((prev: string | null) => string | null)) => void;
  commentsOpen: boolean;
  comments: DashboardComment[];
  commentsLoading: boolean;
  commentDraft: string;
  postingComment: boolean;
  editingCommentId: string | null;
  editingCommentText: string;
  savingCommentId: string | null;
  commentLikeCounts: CountMap;
  commentUserLikes: ToggleMap;
  setEditingCommentText: (value: string) => void;
  onToggleCommentLike: (commentId: string) => void;
  onStartEditComment: (comment: DashboardComment) => void;
  onSaveEditComment: (comment: DashboardComment) => void;
  onCancelEditComment: () => void;
  onLikeOriginal: () => void;
  onToggleComments: () => void;
  onCommentDraftChange: (value: string) => void;
  onAddComment: () => void;
  onDeleteComment: (commentId: string) => void;
  onReportComment: (commentId: string, commentOwnerId: string) => void;
  onShareOriginal: () => void;
  onStartEditOriginal: () => void;
  onSaveEditOriginal: () => void;
  onCancelEditOriginal: () => void;
  onDeleteOriginal: () => void;
  onRemoveShare: () => void;
  onReportOriginal: () => void;
  onOpenImage?: (url: string, alt: string) => void;
}) {
  const originalPost = sharedPost.original_post;
  const sharerName = sharerProfile?.full_name || sharerProfile?.username || "Parapost user";
  const originalName = originalProfile?.full_name || originalProfile?.username || "Parapost member";
  const originalHref = `/profile/${originalPost.user_id}`;
  const sharerHref = `/profile/${sharedPost.user_id}`;
  const menuId = `shared-post-menu-${sharedPost.id}`;
  const isShareOwner = !!currentUserId && sharedPost.user_id === currentUserId;
  const isOriginalPostOwner = !!currentUserId && originalPost.user_id === currentUserId;
  const showPostMenu = Boolean(currentUserId);
  const isEditingOriginalPost = editingPostId === originalPost.id;

  return (
    <article
      id={`share-${sharedPost.id}`}
      className="dashboard-card dashboard-feed-card"
      style={postCardStyle}
      onClick={(event) => event.stopPropagation()}
    >
      <div style={postHeaderStyle}>
        <div style={postAuthorStyle}>
          <Avatar profile={sharerProfile} size={54} href={sharerHref} />
          <div style={{ minWidth: 0 }}>
            <Link href={sharerHref} style={postAuthorNameStyle}>
              {sharerName}
            </Link>
            <div style={postMetaStyle}>
              shared {originalName}&apos;s post · {formatRelativeTime(sharedPost.created_at)}
            </div>
          </div>
        </div>

        {showPostMenu ? (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setOpenPostMenuId((prev) => (prev === menuId ? null : menuId));
              }}
              style={dotsButtonStyle}
              aria-label="Shared post options"
            >
              <DotsIcon />
            </button>

            {openPostMenuId === menuId ? (
              <div style={postMenuStyle} onClick={(event) => event.stopPropagation()}>
                {isOriginalPostOwner ? (
                  <>
                    <button type="button" style={menuItemStyle} onClick={onStartEditOriginal}>
                      Edit original post
                    </button>
                    <button
                      type="button"
                      style={{ ...menuItemStyle, color: "#fca5a5" }}
                      onClick={onDeleteOriginal}
                    >
                      Delete original post
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    style={{ ...menuItemStyle, color: "#fca5a5" }}
                    onClick={onReportOriginal}
                  >
                    Report original post
                  </button>
                )}

                {isShareOwner ? (
                  <button
                    type="button"
                    style={{
                      ...menuItemStyle,
                      color: isOriginalPostOwner ? "#d8b4fe" : "#fca5a5",
                      borderBottomColor: "transparent",
                    }}
                    onClick={onRemoveShare}
                  >
                    Remove shared post
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {sharedPost.caption ? (
        <ExpandableFeedText
          text={sharedPost.caption}
          hasMedia
          style={postContentStyle}
        />
      ) : null}

      <div className="dashboard-shared-post-frame" style={sharedPostFrameStyle}>
        <div style={sharedPostOriginalHeaderStyle}>
          <Avatar profile={originalProfile} size={42} href={originalHref} />
          <div style={{ minWidth: 0 }}>
            <Link href={originalHref} style={postAuthorNameStyle}>
              {originalName}
            </Link>
            <div style={postMetaStyle}>
              @{originalProfile?.username || "member"} · {formatRelativeTime(originalPost.created_at)}
            </div>
          </div>
        </div>

        {isEditingOriginalPost ? (
          <div style={{ marginTop: 14 }}>
            <textarea
              value={editingPostContent}
              onChange={(event) => setEditingPostContent(event.target.value)}
              rows={4}
              style={editTextareaStyle}
            />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <button type="button" onClick={onSaveEditOriginal} style={publishButtonStyle}>
                Save
              </button>
              <button type="button" onClick={onCancelEditOriginal} style={softButtonStyle}>
                Cancel
              </button>
            </div>
          </div>
        ) : originalPost.content ? (
          <>
            <ExpandableFeedText
              text={originalPost.content}
              hasMedia={getPostImageUrls(originalPost).length > 0 || Boolean(getFirstSafeLinkPreview(originalPost.content))}
              style={sharedPostOriginalContentStyle}
            />
            <LinkPreviewCard text={originalPost.content} />
          </>
        ) : null}

        <PostImageGrid imageUrls={getPostImageUrls(originalPost)} alt="Shared post image" onOpenImage={onOpenImage} />

      </div>

      {likeCount > 0 || commentCount > 0 || shareCount > 0 ? (
        <div style={postStatsSummaryStyle}>
          <span>{likeCount} Likes</span>
          <span>·</span>
          <span>{commentCount} Comments</span>
          <span>·</span>
          <span>{shareCount} Shares</span>
        </div>
      ) : null}

      <div className="dashboard-post-actions" style={postActionsStyle}>
        <ActionButton label="Like" onClick={onLikeOriginal} active={isLiked}>
          <HeartIcon filled={isLiked} />
          <span className="dashboard-action-label">Like</span>
        </ActionButton>
        <ActionButton label="Comment" onClick={onToggleComments} active={commentsOpen}>
          <CommentIcon />
          <span className="dashboard-action-label">Comment</span>
        </ActionButton>
        <ActionButton label="Share" onClick={onShareOriginal}>
          <ShareIcon />
          <span className="dashboard-action-label">Share</span>
        </ActionButton>
      </div>

      {!commentsOpen && comments.length > 0 ? (
        <DashboardCommentsPreview
          postId={originalPost.id}
          comments={comments}
          commentCount={commentCount}
          profilesMap={profilesMap}
          currentUserId={currentUserId}
          onToggleComments={onToggleComments}
          editingCommentId={editingCommentId}
          editingCommentText={editingCommentText}
          savingCommentId={savingCommentId}
          commentLikeCounts={commentLikeCounts}
          commentUserLikes={commentUserLikes}
          setEditingCommentText={setEditingCommentText}
          onToggleCommentLike={onToggleCommentLike}
          onStartEditComment={onStartEditComment}
          onSaveEditComment={onSaveEditComment}
          onCancelEditComment={onCancelEditComment}
          onDeleteComment={onDeleteComment}
          onReportComment={onReportComment}
        />
      ) : null}

      {commentsOpen ? (
        <DashboardCommentsPanel
          postId={originalPost.id}
          postOwnerId={originalPost.user_id}
          comments={comments}
          profilesMap={profilesMap}
          currentUserId={currentUserId}
          loading={commentsLoading}
          draft={commentDraft}
          posting={postingComment}
          onDraftChange={onCommentDraftChange}
          onAddComment={onAddComment}
          editingCommentId={editingCommentId}
          editingCommentText={editingCommentText}
          savingCommentId={savingCommentId}
          commentLikeCounts={commentLikeCounts}
          commentUserLikes={commentUserLikes}
          setEditingCommentText={setEditingCommentText}
          onToggleCommentLike={onToggleCommentLike}
          onStartEditComment={onStartEditComment}
          onSaveEditComment={onSaveEditComment}
          onCancelEditComment={onCancelEditComment}
          onDeleteComment={onDeleteComment}
          onReportComment={onReportComment}
          onCloseComments={onToggleComments}
        />
      ) : null}
    </article>
  );
}


function SharedReelCard({
  shared,
  sharerProfile,
  creatorProfile,
  currentUserId,
  onDelete,
}: {
  shared: SharedReelItem;
  sharerProfile?: ProfilePreview | null;
  creatorProfile?: ProfilePreview | null;
  currentUserId: string;
  onDelete: () => void;
}) {
  const sharerName = sharerProfile?.full_name || sharerProfile?.username || "Parapost user";
  const creatorName = creatorProfile?.full_name || creatorProfile?.username || "Parapost creator";
  const creatorProfileId = shared.creator_profile_id || shared.reel_user_id;
  const reelTitle = shared.reel_title?.trim() || "Untitled Reel";
  const reelCaption = shared.reel_caption?.trim() || "";
  const shareCaption = shared.caption?.trim() || "";
  const reelHref = `/reels?reel=${shared.reel_id}`;

  return (
    <article className="dashboard-card dashboard-feed-card dashboard-shared-reel-card" style={postCardStyle}>
      <div style={postHeaderStyle}>
        <div style={postAuthorStyle}>
          <Avatar profile={sharerProfile} size={54} href={`/profile/${shared.user_id}`} />
          <div style={{ minWidth: 0 }}>
            <Link href={`/profile/${shared.user_id}`} style={postAuthorNameStyle}>
              {sharerName}
            </Link>
            <div style={postMetaStyle}>shared a Parapost Reel · {formatRelativeTime(shared.created_at)}</div>
          </div>
        </div>

        {shared.user_id === currentUserId ? (
          <button type="button" onClick={onDelete} style={softDangerButtonStyle}>
            Remove
          </button>
        ) : null}
      </div>

      {shareCaption ? (
        <p className="dashboard-shared-reel-user-caption" style={postContentStyle}>
          {renderLinkedText(shareCaption)}
        </p>
      ) : null}

      <Link
        href={reelHref}
        className="dashboard-shared-reel-frame"
        style={sharedReelFrameStyle}
        aria-label={`Watch ${reelTitle} on Parapost Reels`}
      >
        <div className="dashboard-shared-reel-media" style={sharedReelVideoStyle}>
          {shared.reel_poster_url ? (
            <img
              src={shared.reel_poster_url || undefined}
              alt="Shared Parapost Reel preview"
              loading="lazy"
              decoding="async"
              style={sharedReelInlineVideoStyle}
            />
          ) : (
            <div style={sharedReelInlineVideoStyle} />
          )}
          <div style={sharedReelOverlayStyle}>
            <span style={sharedReelPlayButtonStyle}>▶</span>
          </div>
        </div>

        <div className="dashboard-shared-reel-copy" style={sharedReelCopyStyle}>
          <span className="dashboard-shared-reel-network" style={sharedReelNetworkLabelStyle}>
            Parapost Network
          </span>

          <h3 className="dashboard-shared-reel-title" style={sharedReelTitleStyle}>
            {reelTitle}
          </h3>
        </div>
      </Link>
    </article>
  );
}

type DashboardMobileMenuSection =
  | "main"
  | "discover"
  | "discoverRecentlyViewed"
  | "discoverPeople"
  | "discoverTrending"
  | "discoverActivity"
  | "settings"
  | "settingsAccount"
  | "settingsPrivacy"
  | "settingsHelp"
  | "creator"
  | "ads"
  | "hub";

function MobileDashboardMenuDrawer({
  isOpen,
  initialSection,
  currentProfile,
  currentUserId,
  notificationsCount,
  parachatUnreadCount,
  pendingFriendRequestCount,
  recentlyViewed,
  peopleToDiscover,
  trendingTopics,
  followedCount,
  feedItems,
  totalLikes,
  totalComments,
  totalShares,
  onClose,
  onCreatePost,
}: {
  isOpen: boolean;
  initialSection: DashboardMobileMenuSection;
  currentProfile: ProfilePreview | null;
  currentUserId: string;
  notificationsCount: number;
  parachatUnreadCount: number;
  pendingFriendRequestCount: number;
  recentlyViewed: ProfilePreview[];
  peopleToDiscover: ProfilePreview[];
  trendingTopics: Array<{ title: string; meta: string }>;
  followedCount: number;
  feedItems: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  onClose: () => void;
  onCreatePost: () => void;
}) {
  const [activeSection, setActiveSection] =
    useState<DashboardMobileMenuSection>(initialSection);
  const menuScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) setActiveSection(initialSection);
  }, [isOpen, initialSection]);

  useEffect(() => {
    if (!isOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    menuScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeSection]);

  if (!isOpen) return null;

  void currentProfile;

  const parentSectionMap: Partial<Record<DashboardMobileMenuSection, DashboardMobileMenuSection>> = {
    discoverRecentlyViewed: "discover",
    discoverPeople: "discover",
    discoverTrending: "discover",
    discoverActivity: "discover",
    settingsAccount: "settings",
    settingsPrivacy: "settings",
    settingsHelp: "settings",
  };

  const goBack = () => {
    const parent = parentSectionMap[activeSection];
    if (parent) {
      setActiveSection(parent);
      return;
    }

    if (activeSection !== "main") {
      setActiveSection("main");
      return;
    }

    onClose();
  };

  const handleLogout = async () => {
    try {
      if (currentUserId) {
        await supabase
          .from("profiles")
          .update({ is_online: false, last_seen_at: new Date().toISOString() })
          .eq("id", currentUserId);
      }
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/";
    }
  };

  const sectionTitle =
    activeSection === "main"
      ? "Menu"
      : activeSection === "discover"
        ? "Discover"
        : activeSection === "discoverRecentlyViewed"
          ? "Recently Viewed"
          : activeSection === "discoverPeople"
            ? "People to Discover"
            : activeSection === "discoverTrending"
              ? "Trending in Parapost"
              : activeSection === "discoverActivity"
                ? "Timeline Activity"
                : activeSection === "creator"
                  ? "Creator Tools"
                  : activeSection === "ads"
                    ? "Ads & Sponsors"
                    : activeSection === "hub"
                      ? "Parapost Hub"
                      : activeSection === "settingsAccount"
                        ? "Your Account"
                        : activeSection === "settingsPrivacy"
                          ? "Privacy & Safety"
                          : activeSection === "settingsHelp"
                            ? "Help & Legal"
                            : "Settings & Support";

  return (
    <>
      <div className="dashboard-mobile-menu-backdrop" style={mobileMenuBackdropStyle} onClick={onClose} />
      <aside className="dashboard-mobile-menu-drawer" style={mobileMenuDrawerStyle} role="dialog" aria-modal="true" aria-label="Dashboard menu">
        <div style={mobileMenuTopBarStyle}>
          <button type="button" onClick={goBack} style={mobileMenuBackButtonStyle} aria-label={activeSection === "main" ? "Close dashboard menu" : "Back to previous menu"}>
            {activeSection === "main" ? (
              <span style={mobileMenuBackTextStyle}>Close</span>
            ) : (
              <>
                <span style={mobileMenuBackArrowStyle}>‹</span>
                <span style={mobileMenuBackTextStyle}>Back</span>
              </>
            )}
          </button>
          <h2 style={mobileMenuTitleStyle}>{sectionTitle}</h2>
          <button type="button" onClick={onClose} style={mobileMenuCloseButtonStyle} aria-label="Close dashboard menu">×</button>
        </div>

        <div ref={menuScrollRef} className="dashboard-mobile-menu-scroll-area" style={mobileMenuScrollAreaStyle}>
        {activeSection === "main" ? (
          <div style={mobileMenuListWrapStyle}>
            <div style={mobileMenuSectionHeadingStyle}>Dashboard Extras</div>
            <MobileMenuLink href="/friends" label="Friends" badge={pendingFriendRequestCount || undefined} />
            <MobileMenuLink href={currentUserId ? `/profile/${currentUserId}/followers` : "/dashboard"} label="Followers" />
            <MobileMenuLink href={currentUserId ? `/profile/${currentUserId}/following` : "/dashboard"} label="Following" />
            <MobileMenuButton label="Discover" onClick={() => setActiveSection("discover")} />
            <MobileMenuButton label="Parapost Hub" onClick={() => setActiveSection("hub")} />
            <MobileMenuButton label="Creator Tools" onClick={() => setActiveSection("creator")} />
            <MobileMenuButton label="Ads & Sponsors" onClick={() => setActiveSection("ads")} />
            <MobileMenuButton label="Settings & Support" onClick={() => setActiveSection("settings")} />
            <MobileMenuInfoCardText text="Quick access to extra dashboard areas without crowding the main mobile feed." />
            <div style={mobileMenuDividerStyle} />
            <MobileMenuLogoutButton label="Log out" onClick={handleLogout} />
          </div>
        ) : null}

        {activeSection === "discover" ? (
          <div style={mobileMenuListWrapStyle}>
            <div style={mobileMenuSectionHeadingStyle}>Private & Suggested</div>
            <MobileMenuButton label={`Recently viewed${recentlyViewed.length ? ` (${recentlyViewed.length})` : ""}`} onClick={() => setActiveSection("discoverRecentlyViewed")} />
            <MobileMenuButton label={`People to discover${peopleToDiscover.length ? ` (${Math.min(peopleToDiscover.length, 4)})` : ""}`} onClick={() => setActiveSection("discoverPeople")} />
            <MobileMenuButton label="Trending in Parapost" onClick={() => setActiveSection("discoverTrending")} />

            <div style={mobileMenuDividerStyle} />
            <div style={mobileMenuSectionHeadingStyle}>Timeline</div>
            <MobileMenuButton label="Timeline activity" onClick={() => setActiveSection("discoverActivity")} />
          </div>
        ) : null}

        {activeSection === "discoverRecentlyViewed" ? (
          <div style={mobileMenuListWrapStyle}>
            <div style={mobileMenuSectionHeadingStyle}>Recently Viewed Profiles</div>
            {recentlyViewed.length > 0 ? (
              recentlyViewed.map((profile) => <MobileMenuProfileLinkRow key={profile.id} profile={profile} />)
            ) : (
              <div style={mobileMenuInfoCardStyle}>Profiles you recently viewed will appear here privately.</div>
            )}
          </div>
        ) : null}

        {activeSection === "discoverPeople" ? (
          <div style={mobileMenuListWrapStyle}>
            <div style={mobileMenuSectionHeadingStyle}>People to Discover</div>
            {peopleToDiscover.length > 0 ? (
              peopleToDiscover.map((profile) => <MobileMenuProfileLinkRow key={profile.id} profile={profile} />)
            ) : (
              <div style={mobileMenuInfoCardStyle}>New people to discover will appear here as more completed profiles are found.</div>
            )}
          </div>
        ) : null}

        {activeSection === "discoverTrending" ? (
          <div style={mobileMenuListWrapStyle}>
            <div style={mobileMenuSectionHeadingStyle}>Active Topics</div>
            {trendingTopics.map((topic) => (
              <MobileMenuTrendDetailRow key={`${topic.title}-${topic.meta}`} title={topic.title} meta={topic.meta} />
            ))}
          </div>
        ) : null}

        {activeSection === "discoverActivity" ? (
          <div style={mobileMenuListWrapStyle}>
            <div style={mobileMenuSectionHeadingStyle}>Timeline Activity</div>
            <MobileMenuStatRow label="Following" value={followedCount} />
            <MobileMenuStatRow label="Feed items" value={feedItems} />
            <MobileMenuStatRow label="Likes" value={totalLikes} />
            <MobileMenuStatRow label="Comments" value={totalComments} />
            <MobileMenuStatRow label="Shares" value={totalShares} />
          </div>
        ) : null}

        {activeSection === "creator" ? (
          <div style={mobileMenuListWrapStyle}>
            <div style={mobileMenuSectionHeadingStyle}>Creator tools</div>
            <MobileMenuMutedRow label="Creator Studio" />
            <MobileMenuMutedRow label="Post insights" />
            <MobileMenuMutedRow label="Reel insights" />
            <MobileMenuMutedRow label="Saved replies" />
            <MobileMenuMutedRow label="Audience insights" />

            <div style={mobileMenuInfoCardStyle}>
              Creator tools will support profile growth, performance insights, sponsor opportunities, and future business features.
            </div>
          </div>
        ) : null}

        {activeSection === "ads" ? (
          <div style={mobileMenuListWrapStyle}>
            <div style={mobileMenuSectionHeadingStyle}>Ads & Sponsors</div>
            <MobileMenuLink href="/settings/payments" label="Payments & Promotions" />
            <MobileMenuLink href="/settings/payments" label="Sponsor Placements" />
            <MobileMenuLink href="/settings/payments" label="Advertise with Parapost Network" />
            <MobileMenuMutedRow label="Boosted Posts" />
            <MobileMenuMutedRow label="Sponsored Reels" />

            <div style={mobileMenuInfoCardStyle}>
              Payment tools are coming soon. Sponsor and ad placements will stay organized here and can also appear naturally inside the timeline later.
            </div>
          </div>
        ) : null}

        {activeSection === "hub" ? (
          <div style={mobileMenuListWrapStyle}>
            <div style={mobileMenuSectionHeadingStyle}>Parapost Hub</div>
            <MobileMenuMutedRow label="Ghost Hunts" />
            <MobileMenuMutedRow label="Investigations" />
            <MobileMenuMutedRow label="Evidence Collections" />
            <MobileMenuMutedRow label="Case Files" />
            <MobileMenuMutedRow label="Events" />
            <MobileMenuMutedRow label="Groups" />

            <div style={mobileMenuInfoCardStyle}>
              Future community areas will live here so the mobile dashboard stays clean and focused.
            </div>
          </div>
        ) : null}

        {activeSection === "settings" ? (
          <div style={mobileMenuListWrapStyle}>
            <div style={mobileMenuSectionHeadingStyle}>Settings & Support</div>
            <MobileMenuButton label="Your Account" onClick={() => setActiveSection("settingsAccount")} />
            <MobileMenuButton label="Privacy & Safety" onClick={() => setActiveSection("settingsPrivacy")} />
            <MobileMenuButton label="Help & Legal" onClick={() => setActiveSection("settingsHelp")} />
          </div>
        ) : null}

        {activeSection === "settingsAccount" ? (
          <div style={mobileMenuListWrapStyle}>
            <div style={mobileMenuSectionHeadingStyle}>Your Account</div>
            <MobileMenuLink href="/settings" label="Settings Home" />
            <MobileMenuLink href="/settings/profile" label="Profile Settings" />
            <MobileMenuLink href="/settings/account" label="Account & Security" />
            <MobileMenuLink href="/settings/personalization" label="Personalization" />
            <MobileMenuLink href="/settings/data" label="Data & Account Files" />
            <MobileMenuLink href="/settings/payments" label="Payments" />
            <MobileMenuInfoCardText text="Manage your profile, sign-in security, personalization, account files, and future payment settings from one clean area." />
          </div>
        ) : null}

        {activeSection === "settingsPrivacy" ? (
          <div style={mobileMenuListWrapStyle}>
            <div style={mobileMenuSectionHeadingStyle}>Privacy & Safety</div>
            <MobileMenuLink href="/settings/profile-visibility" label="Profile Visibility" />
            <MobileMenuLink href="/settings/privacy-safety" label="Privacy & Safety Center" />
            <MobileMenuLink href="/settings/blocked-users" label="Blocked Users" />
            <MobileMenuLink href="/settings/notifications" label="Notifications" badge={notificationsCount || undefined} />
            <MobileMenuLink href="/settings/content-feed" label="Posts, Comments & Feed" />
            <MobileMenuLink href="/settings/content-feed" label="Reels Preferences" />
            <MobileMenuLink href="/settings/privacy-safety" label="Message Requests" />
            <MobileMenuLink href="/settings/privacy-safety" label="Reporting & Moderation" />
            <MobileMenuInfoCardText text="Control visibility, blocked accounts, notifications, reports, feed preferences, and who can interact with you." />
          </div>
        ) : null}

        {activeSection === "settingsHelp" ? (
          <div style={mobileMenuListWrapStyle}>
            <div style={mobileMenuSectionHeadingStyle}>Help & Legal</div>
            <MobileMenuLink href="/settings/help-support" label="Contact Parapost Network" />
            <MobileMenuLink href="/settings/help-support" label="Report a Problem" />
            <MobileMenuLink href="/settings/help-support" label="Account Help" />
            <MobileMenuLink href="/settings/help-support" label="Safety Resources" />
            <MobileMenuLink href="/settings/legal" label="Legal Center" />
            <MobileMenuLink href="/settings/legal" label="Terms of Service" />
            <MobileMenuLink href="/settings/legal" label="Privacy Policy" />
            <MobileMenuLink href="/settings/legal" label="Community Guidelines" />
            {pendingFriendRequestCount > 0 ? <MobileMenuInfoCardText text={`${pendingFriendRequestCount} pending friend request${pendingFriendRequestCount === 1 ? "" : "s"} may need your attention.`} /> : null}
          </div>
        ) : null}
        </div>
      </aside>
    </>
  );
}

function MobileMenuLink({
  href,
  label,
  badge,
}: {
  href: string;
  label: string;
  badge?: number | string;
}) {
  return (
    <Link href={href} style={mobileMenuListRowStyle}>
      <span style={mobileMenuRowLabelStyle}>{label}</span>
      <span style={mobileMenuRowRightStyle}>
        {badge ? <span style={mobileMenuBadgeStyle}>{badge}</span> : null}
        <span style={mobileMenuArrowStyle}>›</span>
      </span>
    </Link>
  );
}

function MobileMenuButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={mobileMenuListRowButtonStyle}>
      <span style={mobileMenuRowLabelStyle}>{label}</span>
      <span style={mobileMenuArrowStyle}>›</span>
    </button>
  );
}

function MobileMenuLogoutButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={mobileMenuLogoutButtonStyle}>
      <span style={mobileMenuRowLabelStyle}>{label}</span>
    </button>
  );
}

function MobileMenuMutedRow({ label }: { label: string }) {
  return (
    <div style={mobileMenuMutedRowStyle}>
      <span style={mobileMenuRowLabelStyle}>{label}</span>
      <span style={mobileMenuComingSoonStyle}>Soon</span>
    </div>
  );
}

function MobileMenuInfoCardText({ text }: { text: string }) {
  return <div style={mobileMenuInfoCardStyle}>{text}</div>;
}

function MobileMenuProfileLinkRow({ profile }: { profile: ProfilePreview }) {
  const displayName = profile.full_name || profile.username || "Parapost member";
  const subline = profile.username ? `@${profile.username}` : profile.location || "View profile";

  return (
    <Link href={`/profile/${profile.id}`} style={mobileMenuProfileLinkRowStyle}>
      <Avatar profile={profile} size={46} />
      <span style={mobileMenuProfileTextStyle}>
        <span style={mobileMenuProfileNameStyle}>{displayName}</span>
        <span style={mobileMenuProfileMetaStyle}>{subline}</span>
      </span>
      <span style={mobileMenuArrowStyle}>›</span>
    </Link>
  );
}

function MobileMenuTrendDetailRow({ title, meta }: { title: string; meta: string }) {
  return (
    <div style={mobileMenuDetailRowStyle}>
      <span style={mobileMenuRowLabelStyle}>{title}</span>
      <span style={mobileMenuDetailMetaStyle}>{meta}</span>
    </div>
  );
}

function MobileMenuStatRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={mobileMenuDetailRowStyle}>
      <span style={mobileMenuRowLabelStyle}>{label}</span>
      <span style={mobileMenuStatValueStyle}>{value}</span>
    </div>
  );
}

function MobileTimelineSponsorCard({ slotNumber }: { slotNumber: number }) {
  return (
    <article className="dashboard-mobile-sponsored-placement dashboard-feed-card" style={mobileTimelineSponsorStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={sponsorIconStyle}>★</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={miniEyebrowStyle}>Sponsored Placement</div>
          <strong style={{ display: "block", color: "#fff", fontSize: 15 }}>Advertise with Parapost Network</strong>
          <span style={{ ...railMetaStyle, marginTop: 3 }}>
            Mobile sponsor spot #{slotNumber}. Future paid placements can appear naturally in the feed without crowding the dashboard.
          </span>
        </div>
      </div>
      <Link href="/settings" style={railPrimaryLinkStyle}>Learn more</Link>
    </article>
  );
}


function MobileDashboardUtilityRail({
  currentProfile,
  currentUserId,
  recentlyViewed,
  peopleToDiscover,
  followedCount,
  feedItems,
  totalLikes,
  totalComments,
  totalShares,
  parachatUnreadCount = 0,
  onCreatePost,
}: {
  currentProfile: ProfilePreview | null;
  currentUserId: string;
  recentlyViewed: ProfilePreview[];
  peopleToDiscover: ProfilePreview[];
  followedCount: number;
  feedItems: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  parachatUnreadCount?: number;
  onCreatePost: () => void;
}) {
  return (
    <section className="dashboard-mobile-insights" style={mobileInsightsShellStyle}>
      <div style={mobileInsightsHeaderStyle}>
        <div>
          <div style={miniEyebrowStyle}>Network Pulse</div>
          <h3 style={{ margin: "3px 0 0", fontSize: 16 }}>Your Parapost hub</h3>
        </div>
        <span style={privatePillStyle}>Mobile tools</span>
      </div>

      <div style={mobileProfileSummaryStyle}>
        <Avatar profile={currentProfile} size={44} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <strong style={{ display: "block", color: "#fff", fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {currentProfile?.full_name || currentProfile?.username || "Your profile"}
          </strong>
          <span style={railMetaStyle}>Dashboard activity and quick tools</span>
        </div>
        <Link href={currentUserId ? `/profile/${currentUserId}` : "/dashboard"} style={mobileMiniProfileButtonStyle}>
          Profile
        </Link>
      </div>

      <div style={mobileInsightsStatsGridStyle}>
        <StatRow label="Following" value={followedCount.toString()} />
        <StatRow label="Feed items" value={feedItems.toString()} />
        <StatRow label="Likes" value={totalLikes.toString()} />
        <StatRow label="Comments" value={totalComments.toString()} />
        <StatRow label="Shares" value={totalShares.toString()} />
      </div>

      <div style={mobileQuickToolsGridStyle}>
        <button type="button" onClick={onCreatePost} style={mobileQuickToolButtonStyle}>Create Post</button>
        <Link href="/reels" style={mobileQuickToolLinkStyle}>Explore Reels</Link>
        <Link href="/messages" style={mobileQuickToolLinkStyle}>Parachat{parachatUnreadCount > 0 ? ` (${parachatUnreadCount > 99 ? "99+" : parachatUnreadCount})` : ""}</Link>
        <Link href="/notifications" style={mobileQuickToolLinkStyle}>Notifications</Link>
      </div>

      <div style={mobileRecentlyViewedBoxStyle}>
        <div style={mobileSubHeaderStyle}>
          <strong>Recently Viewed</strong>
          <span style={privateMiniTextStyle}>Only you can see this</span>
        </div>

        {recentlyViewed.length === 0 ? (
          <p style={{ ...mutedTextStyle, margin: 0 }}>Profiles you view will appear here privately.</p>
        ) : (
          <div style={mobileProfileRailStyle}>
            {recentlyViewed.slice(0, 5).map((profile) => (
              <Link key={profile.id} href={`/profile/${profile.id}`} style={mobileProfileBubbleStyle}>
                <Avatar profile={profile} size={46} />
                <span>{profile.full_name?.split(" ")[0] || profile.username || "User"}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div style={mobileRecentlyViewedBoxStyle}>
        <div style={mobileSubHeaderStyle}>
          <strong>People to Discover</strong>
          <span style={privateMiniTextStyle}>Fresh</span>
        </div>

        {peopleToDiscover.length === 0 ? (
          <p style={{ ...mutedTextStyle, margin: 0 }}>New members with completed bios will appear here automatically.</p>
        ) : (
          <div style={mobileProfileRailStyle}>
            {peopleToDiscover.slice(0, 5).map((profile) => (
              <Link key={profile.id} href={`/profile/${profile.id}`} style={mobileProfileBubbleStyle}>
                <Avatar profile={profile} size={46} />
                <span>{profile.full_name?.split(" ")[0] || profile.username || "User"}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div style={mobileSponsorPreviewStyle}>
        <div style={sponsorIconStyle}>★</div>
        <div style={{ minWidth: 0 }}>
          <strong style={railNameStyle}>Sponsor / Advertising</strong>
          <span style={railMetaStyle}>Reach the Parapost community with future sponsor spots, creator campaigns, and advertising options.</span>
        </div>
      </div>
    </section>
  );
}

function ActionButton({
  children,
  onClick,
  active,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={active ? activeActionButtonStyle : actionButtonStyle}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function RightRailCard({ title, action, children }: { title: string; action?: string; children: ReactNode }) {
  return (
    <section className="dashboard-right-card" style={railCardStyle}>
      <div style={railCardHeaderStyle}>
        <h3 style={{ margin: 0, fontSize: 17 }}>{title}</h3>
        {action ? <span style={railActionStyle}>{action}</span> : null}
      </div>
      <div style={{ display: "grid", gap: 10 }}>{children}</div>
    </section>
  );
}

function RailHeroProfile({
  profile,
  currentUserId,
  userEmail,
}: {
  profile: ProfilePreview | null;
  currentUserId: string;
  userEmail: string;
}) {
  return (
    <div style={railHeroProfileStyle}>
      <Avatar profile={profile} size={48} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <strong style={{ display: "block", color: "#fff", fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {profile?.full_name || profile?.username || "Your profile"}
        </strong>
        <span style={railMetaStyle}>@{profile?.username || "parapost"}</span>
        {userEmail ? <span style={{ ...railMetaStyle, wordBreak: "break-word" }}>{userEmail}</span> : null}
      </div>
      <Link href={currentUserId ? `/profile/${currentUserId}` : "/dashboard"} style={railProfileButtonStyle}>
        View
      </Link>
    </div>
  );
}

function RailStatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={railStatTileStyle}>
      <strong style={railStatValueStyle}>{value}</strong>
      <span style={railStatLabelStyle}>{label}</span>
    </div>
  );
}

function LiveNowItem({ title, host, viewers }: { title: string; host: string; viewers: string }) {
  return (
    <div style={liveRowStyle}>
      <div style={liveThumbStyle}><span style={liveBadgeStyle}>LIVE</span></div>
      <div style={{ minWidth: 0 }}>
        <strong style={railNameStyle}>{title}</strong>
        <span style={railMetaStyle}>{host}</span>
        <span style={railMetaStyle}>{viewers}</span>
      </div>
    </div>
  );
}

function TrendingItem({ rank, title, meta }: { rank: string; title: string; meta: string }) {
  return (
    <div style={trendingRowStyle}>
      <span style={trendingRankStyle}>{rank}</span>
      <div style={{ minWidth: 0 }}>
        <strong style={railNameStyle}>{title}</strong>
        <span style={railMetaStyle}>{meta}</span>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={statRowStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SearchResults({
  searchLoading,
  searchResults,
  onClose,
}: {
  searchLoading: boolean;
  searchResults: ProfilePreview[];
  onClose: () => void;
}) {
  if (searchLoading) return <p style={mutedTextStyle}>Searching Parapost Network...</p>;
  if (searchResults.length === 0) return <p style={mutedTextStyle}>No profiles found yet.</p>;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {searchResults.map((profile) => (
        <Link key={profile.id} href={`/profile/${profile.id}`} onClick={onClose} style={searchResultRowStyle}>
          <Avatar profile={profile} size={40} />
          <span style={{ minWidth: 0 }}>
            <strong style={{ display: "block", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {profile.full_name || profile.username || "Parapost user"}
            </strong>
            <span style={{ color: "#9ca3af", fontSize: 12 }}>@{profile.username || "member"}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function FeelingActivityModal({
  selectedFeelingActivity,
  onSelect,
  onClear,
  onClose,
}: {
  selectedFeelingActivity: FeelingActivityOption | null;
  onSelect: (option: FeelingActivityOption) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const feelingOptions = FEELING_ACTIVITY_OPTIONS.filter((option) => option.category === "Feeling");
  const activityOptions = FEELING_ACTIVITY_OPTIONS.filter((option) => option.category === "Activity");

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={feelingActivityModalStyle} onClick={(event) => event.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <div>
            <div style={modalEyebrowStyle}>Create a post</div>
            <h2 style={{ margin: 0, fontSize: 22 }}>Feeling / Activity</h2>
            <p style={feelingActivityIntroStyle}>Choose one to add context to your post. It will publish with your post and show on your profile timeline.</p>
          </div>
          <button type="button" onClick={onClose} style={modalCloseButtonStyle}>×</button>
        </div>

        {selectedFeelingActivity ? (
          <div style={feelingActivitySelectedPreviewStyle}>
            <span style={selectedFeelingCategoryStyle}>{selectedFeelingActivity.category}</span>
            <strong style={selectedFeelingLabelStyle}>{selectedFeelingActivity.label}</strong>
            <button type="button" onClick={onClear} style={selectedFeelingRemoveStyle}>Clear</button>
          </div>
        ) : null}

        <div style={feelingActivitySectionStyle}>
          <h3 style={feelingActivitySectionTitleStyle}>Feelings</h3>
          <div style={feelingActivityGridStyle}>
            {feelingOptions.map((option) => (
              <FeelingActivityOptionButton
                key={option.id}
                option={option}
                active={selectedFeelingActivity?.id === option.id}
                onSelect={() => onSelect(option)}
              />
            ))}
          </div>
        </div>

        <div style={feelingActivitySectionStyle}>
          <h3 style={feelingActivitySectionTitleStyle}>Activities</h3>
          <div style={feelingActivityGridStyle}>
            {activityOptions.map((option) => (
              <FeelingActivityOptionButton
                key={option.id}
                option={option}
                active={selectedFeelingActivity?.id === option.id}
                onSelect={() => onSelect(option)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeelingActivityOptionButton({
  option,
  active,
  onSelect,
}: {
  option: FeelingActivityOption;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={active ? { ...feelingActivityOptionStyle, ...feelingActivityOptionActiveStyle } : feelingActivityOptionStyle}
    >
      <span style={feelingActivityOptionIconStyle}>
        <FeelingActivityMiniIcon icon={option.icon} />
      </span>
      <span style={{ minWidth: 0 }}>
        <strong style={feelingActivityOptionLabelStyle}>{option.label}</strong>
        <span style={feelingActivityOptionHelperStyle}>{option.helper}</span>
      </span>
    </button>
  );
}

function SearchModal({
  searchQuery,
  setSearchQuery,
  searchLoading,
  searchResults,
  onClose,
}: {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  searchLoading: boolean;
  searchResults: ProfilePreview[];
  onClose: () => void;
}) {
  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={searchModalStyle} onClick={(event) => event.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <div>
            <div style={modalEyebrowStyle}>Parapost Network</div>
            <h2 style={{ margin: 0, fontSize: 22 }}>Search Parapost</h2>
          </div>
          <button type="button" onClick={onClose} style={modalCloseButtonStyle}>×</button>
        </div>
        <div className="dashboard-search-parapost dashboard-search-modal-bar" style={{ ...searchWrapStyle, maxWidth: "none", width: "100%" }}>
          <SearchIcon />
          <input
            id="dashboard-search-modal-input"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search Parapost"
            style={searchInputStyle}
          />
        </div>
        <div style={{ marginTop: 14 }}>
          <SearchResults searchLoading={searchLoading} searchResults={searchResults} onClose={onClose} />
        </div>
      </div>
    </div>
  );
}

function DashboardShowcaseComposerModal({
  title,
  coverText,
  duration,
  visibility,
  mediaPreviewUrl,
  mediaType,
  mediaFileName,
  fontKey,
  overlayFontSize,
  textPosition,
  customizeOpen,
  previewExpanded,
  mediaDragActive,
  error,
  saving,
  mediaInputRef,
  setTitle,
  setCoverText,
  setDuration,
  setVisibility,
  setFontKey,
  setOverlayFontSize,
  setTextPosition,
  setCustomizeOpen,
  setPreviewExpanded,
  onMediaChange,
  onMediaDrop,
  onMediaDragOver,
  onMediaDragLeave,
  onClearMedia,
  onClose,
  onCreate,
}: {
  currentProfile: ProfilePreview | null;
  title: string;
  coverText: string;
  duration: ShowcaseDuration;
  visibility: ShowcaseVisibility;
  mediaPreviewUrl: string;
  mediaType: ShowcaseMediaType;
  mediaFileName: string;
  fontKey: ShowcaseFontValue;
  overlayFontSize: number;
  textPosition: { x: number; y: number };
  customizeOpen: boolean;
  previewExpanded: boolean;
  mediaDragActive: boolean;
  error: string;
  saving: boolean;
  mediaInputRef: RefObject<HTMLInputElement | null>;
  setTitle: (value: string) => void;
  setCoverText: (value: string) => void;
  setDuration: (value: ShowcaseDuration) => void;
  setVisibility: (value: ShowcaseVisibility) => void;
  setFontKey: (value: ShowcaseFontValue) => void;
  setOverlayFontSize: (value: number) => void;
  setTextPosition: (value: { x: number; y: number }) => void;
  setCustomizeOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  setPreviewExpanded: (value: boolean | ((current: boolean) => boolean)) => void;
  onMediaChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onMediaDrop: (event: ReactDragEvent<HTMLButtonElement>) => void;
  onMediaDragOver: (event: ReactDragEvent<HTMLButtonElement>) => void;
  onMediaDragLeave: (event: ReactDragEvent<HTMLButtonElement>) => void;
  onClearMedia: () => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  const cleanCoverText = coverText.trim();
  const previewCopy = cleanCoverText;
  const hasOverlayText = previewCopy.length > 0;
  const fontOption = getShowcaseFontOption(fontKey);
  const displayFontSize = getShowcaseOverlayDisplayFontSize(previewCopy || "Preview", overlayFontSize);
  const overlayWidth = getShowcaseOverlayTextWidth(previewCopy || "Preview");
  const previewDragRef = useRef<HTMLDivElement | null>(null);
  const [overlayDragging, setOverlayDragging] = useState(false);
  const isHorizontallyCentered = Math.abs(textPosition.x - 50) <= 1.35;
  const isVerticallyCentered = Math.abs(textPosition.y - 50) <= 1.35;

  const updateOverlayPositionFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const previewElement = previewDragRef.current;
      if (!previewElement) return;

      const rect = previewElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const nextX = Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100));
      const nextY = Math.max(8, Math.min(92, ((clientY - rect.top) / rect.height) * 100));

      setTextPosition({
        x: Number(nextX.toFixed(1)),
        y: Number(nextY.toFixed(1)),
      });
    },
    [setTextPosition]
  );

  const handleOverlayPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!customizeOpen || !hasOverlayText) return;

    const target = event.target as HTMLElement;
    if (target.closest("input, button, select, textarea")) return;

    event.preventDefault();
    event.stopPropagation();
    setOverlayDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateOverlayPositionFromPointer(event.clientX, event.clientY);
  };

  const handleOverlayPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!overlayDragging || !customizeOpen || !hasOverlayText) return;

    event.preventDefault();
    updateOverlayPositionFromPointer(event.clientX, event.clientY);
  };

  const handleOverlayPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!overlayDragging) return;

    event.preventDefault();
    event.stopPropagation();
    setOverlayDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <div
      className={`profile-showcase-modal-overlay profile-showcase-mobile-open ${previewExpanded ? "profile-showcase-preview-expanded" : ""}`}
      style={profileShowcaseModalOverlayStyle}
      role="dialog"
      aria-modal="true"
      aria-label="Create Showcase"
    >
      <div className="profile-showcase-modal-shell" style={profileShowcaseModalStyle}>
        <div className="profile-showcase-modal-header" style={profileShowcaseModalHeaderStyle}>
          <div style={profileShowcaseModalBrandRowStyle}>
            <span style={profileShowcaseModalLogoStyle}>
              <img
                src="/parapost-icon-white.png"
                alt=""
                aria-hidden="true"
                style={profileShowcaseModalLogoImageStyle}
              />
            </span>
            <span>
              <p style={profileShowcaseModalEyebrowStyle}>Parapost Showcases</p>
              <h3 style={profileShowcaseModalTitleStyle}>Create Showcase</h3>
              <p style={profileShowcaseModalSubtitleStyle}>
                Add a photo or video, name it, choose a duration, and create.
              </p>
              <div style={profileShowcaseModalFlowPillsStyle}>
                <span style={profileShowcaseModalFlowPillStyle}>Simple first</span>
                <span style={profileShowcaseModalFlowPillStyle}>Customize optional</span>
              </div>
            </span>
          </div>
          <button type="button" onClick={onClose} style={profileShowcaseModalCloseStyle} aria-label="Close Showcase creator">
            ×
          </button>
        </div>

        <div className="profile-showcase-studio-layout" style={profileShowcaseSimpleStudioStyle}>
          <div className="profile-showcase-simple-controls" style={profileShowcaseSimpleControlsStyle}>
            <button
              className="profile-showcase-upload-card"
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              onDrop={onMediaDrop}
              onDragOver={onMediaDragOver}
              onDragLeave={onMediaDragLeave}
              style={
                mediaPreviewUrl
                  ? profileShowcaseSimpleUploadCardSelectedStyle
                  : mediaDragActive
                    ? profileShowcaseSimpleUploadCardActiveStyle
                    : profileShowcaseSimpleUploadCardStyle
              }
            >
              <span style={profileShowcaseSimpleUploadIconStyle}>{mediaPreviewUrl ? "✓" : "⇧"}</span>
              <span className="profile-showcase-upload-copy">
                <strong style={profileShowcaseUploadTitleTextStyle}>
                  {mediaPreviewUrl ? "Media selected" : "Upload Photo or Video"}
                </strong>
                <small style={profileShowcaseUploadHelpTextStyle}>
                  {mediaPreviewUrl ? "Tap to replace this Showcase media" : "Tap to choose from your device"}
                </small>
                <small style={profileShowcaseUploadHelpTextStyle}>{mediaFileName || "JPG, PNG, MP4"}</small>
              </span>
            </button>

            <input ref={mediaInputRef} type="file" accept="image/*,video/*" onChange={onMediaChange} style={{ display: "none" }} />

            {mediaFileName ? (
              <div style={profileShowcaseSelectedFileStyle}>
                <span>{mediaType === "video" ? "Video" : "Photo"} ready: {mediaFileName}</span>
                <button type="button" onClick={onClearMedia} style={profileShowcaseTinyButtonStyle}>
                  Remove
                </button>
              </div>
            ) : null}

            <label style={profileShowcaseFieldLabelStyle}>
              Showcase name
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Give your Showcase a name"
                style={profileShowcaseInputStyle}
                maxLength={24}
              />
            </label>

            <div style={profileShowcaseDurationGroupStyle}>
              <div>
                <strong style={profileShowcaseDurationTitleStyle}>Duration</strong>
                <p style={profileShowcaseDurationHelpStyle}>Choose how long this Showcase stays on your profile.</p>
              </div>

              <div className="profile-showcase-duration-options" style={profileShowcaseDurationOptionsStyle}>
                {[
                  { value: "24h" as const, label: "24 hours", help: "Quick update" },
                  { value: "30d" as const, label: "30 days", help: "Recent feature" },
                  { value: "permanent" as const, label: "Permanent", help: "Until removed" },
                ].map((option) => {
                  const selected = duration === option.value;
                  return (
                    <button
                      className="profile-showcase-duration-option"
                      key={option.value}
                      type="button"
                      onClick={() => setDuration(option.value)}
                      style={selected ? profileShowcaseDurationOptionActiveStyle : profileShowcaseDurationOptionStyle}
                      aria-pressed={selected}
                    >
                      <span style={profileShowcaseDurationOptionLabelTextStyle}>{option.label}</span>
                      <small style={profileShowcaseDurationOptionHelpTextStyle}>{option.help}</small>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={profileShowcaseAdvancedDividerStyle}>
              <span />
              <small>Advanced options</small>
              <span />
            </div>

            <button
              type="button"
              onClick={() => setCustomizeOpen((value) => !value)}
              style={customizeOpen ? profileShowcaseCustomizeButtonActiveStyle : profileShowcaseCustomizeButtonStyle}
              aria-expanded={customizeOpen}
            >
              ⚙ Customize
            </button>

            {customizeOpen ? (
              <div style={profileShowcaseCustomizePanelStyle}>
                <div style={profileShowcaseCustomizeIntroStyle}>
                  <strong>Customize Showcase</strong>
                  <small>Add cover text, choose a font, then adjust the preview.</small>
                </div>

                <label style={profileShowcaseFieldLabelStyle}>
                  Cover text <span style={profileShowcaseOptionalTextStyle}>Optional</span>
                  <textarea
                    value={coverText}
                    onChange={(event) => setCoverText(event.target.value)}
                    placeholder="Add text over your Showcase"
                    style={profileShowcaseTextareaStyle}
                    rows={3}
                    maxLength={80}
                  />
                </label>

                <div style={profileShowcaseFontGroupStyle}>
                  <strong style={profileShowcaseDurationTitleStyle}>Text overlay font</strong>
                  <p style={profileShowcaseDurationHelpStyle}>This changes the text shown over your photo, video, or text Showcase.</p>
                  <select
                    className="profile-showcase-font-select"
                    value={fontKey}
                    onChange={(event) => setFontKey(event.target.value as ShowcaseFontValue)}
                    style={profileShowcaseFontSelectStyle}
                    aria-label="Choose Showcase font"
                  >
                    {SHOWCASE_FONT_OPTIONS.map((font) => (
                      <option
                        key={font.value}
                        value={font.value}
                        style={{ background: "#080b12", color: "#ffffff" }}
                      >
                        {font.label}
                      </option>
                    ))}
                  </select>
                  <div style={{ ...profileShowcaseFontPreviewStyle, fontFamily: fontOption.family }}>
                    {cleanCoverText || "Preview optional overlay text"}
                  </div>
                </div>

                <div style={profileShowcaseDurationGroupStyle}>
                  <div>
                    <strong style={profileShowcaseDurationTitleStyle}>Visibility</strong>
                    <p style={profileShowcaseDurationHelpStyle}>Choose who can see this Showcase.</p>
                  </div>
                  <div className="profile-showcase-visibility-options" style={profileShowcaseVisibilityOptionsStyle}>
                    {[
                      { value: "public" as const, label: "Public", icon: "public", help: "Everyone" },
                      { value: "friends" as const, label: "Friends", icon: "friends", help: "Friends only" },
                      { value: "private" as const, label: "Only me", icon: "private", help: "Private" },
                    ].map((option) => {
                      const selected = visibility === option.value;
                      return (
                        <button
                          className="profile-showcase-visibility-option"
                          key={option.value}
                          type="button"
                          onClick={() => setVisibility(option.value)}
                          style={selected ? profileShowcaseVisibilityOptionActiveStyle : profileShowcaseVisibilityOptionStyle}
                          aria-pressed={selected}
                        >
                          <span style={profileShowcaseVisibilityIconStyle}>
                            <span
                              className={`profile-showcase-visibility-symbol profile-showcase-visibility-symbol-${option.icon}`}
                              aria-hidden="true"
                            />
                          </span>
                          <span style={profileShowcaseVisibilityTextStyle}>
                            <strong>{option.label}</strong>
                            <small>{option.help}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="profile-showcase-preview-column" style={profileShowcasePreviewColumnStyle}>
            <div className="profile-showcase-preview-header" style={profileShowcasePreviewHeaderStyle}>
              <strong className="profile-showcase-preview-title" style={profileShowcaseDurationTitleStyle}>Live preview</strong>
              {customizeOpen ? <small className="profile-showcase-preview-help">Preview your overlay</small> : null}
            </div>

            <div
              ref={previewDragRef}
              className="profile-showcase-preview-phone"
              style={{
                ...profileShowcasePreviewPhoneStyle,
                cursor: customizeOpen && hasOverlayText ? (overlayDragging ? "grabbing" : "grab") : profileShowcasePreviewPhoneStyle.cursor,
                touchAction: customizeOpen && hasOverlayText ? "none" : profileShowcasePreviewPhoneStyle.touchAction,
                userSelect: customizeOpen && hasOverlayText ? "none" : profileShowcasePreviewPhoneStyle.userSelect,
              }}
              role="button"
              tabIndex={0}
              aria-label={
                customizeOpen && hasOverlayText
                  ? "Drag Showcase text around the preview"
                  : previewExpanded
                    ? "Return Showcase preview to normal size"
                    : "Stretch Showcase preview"
              }
              onPointerDown={handleOverlayPointerDown}
              onPointerMove={handleOverlayPointerMove}
              onPointerUp={handleOverlayPointerEnd}
              onPointerCancel={handleOverlayPointerEnd}
              onClick={() => {
                if (!customizeOpen) setPreviewExpanded((value) => !value);
              }}
              onKeyDown={(event) => {
                if (!customizeOpen && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  setPreviewExpanded((value) => !value);
                }
              }}
            >
              {mediaPreviewUrl && mediaType === "image" ? (
                <img src={mediaPreviewUrl} alt="" style={profileShowcasePreviewMediaStyle} />
              ) : mediaPreviewUrl && mediaType === "video" ? (
                <video src={mediaPreviewUrl} muted playsInline controls style={profileShowcasePreviewMediaStyle} />
              ) : (
                <div style={profileShowcasePreviewCanvasStyle} />
              )}

              <div style={profileShowcasePreviewOverlayStyle}>
                {customizeOpen && cleanCoverText ? (
                  <div style={profileShowcaseVerticalSizeRailStyle}>
                    <input
                      className="profile-showcase-vertical-size-slider"
                      type="range"
                      min={SHOWCASE_OVERLAY_MIN_FONT_SIZE}
                      max={SHOWCASE_OVERLAY_MAX_FONT_SIZE}
                      step={1}
                      value={overlayFontSize}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setOverlayFontSize(clampShowcaseOverlayFontSize(Number(event.target.value)))}
                      style={profileShowcaseVerticalSizeSliderStyle}
                      aria-label="Showcase text size"
                    />
                  </div>
                ) : null}

                {customizeOpen && cleanCoverText && isHorizontallyCentered ? (
                  <span style={profileShowcaseCenterGuideVerticalStyle} />
                ) : null}

                {customizeOpen && cleanCoverText && isVerticallyCentered ? (
                  <span style={profileShowcaseCenterGuideHorizontalStyle} />
                ) : null}

                {hasOverlayText ? (
                  <span
                    style={{
                      ...profileShowcasePreviewTextStyle,
                      left: `${textPosition.x}%`,
                      top: `${textPosition.y}%`,
                      fontFamily: fontOption.family,
                      fontSize: `${displayFontSize}px`,
                      width: overlayWidth,
                      maxWidth: overlayWidth,
                      cursor: overlayDragging ? "grabbing" : "grab",
                      userSelect: "none",
                      touchAction: "none",
                    }}
                  >
                    {previewCopy}
                  </span>
                ) : null}

                {customizeOpen && cleanCoverText ? (
                  <small style={profileShowcaseDragHintStyle}>{overlayDragging ? "Move text" : "Drag text"}</small>
                ) : null}
              </div>
            </div>

            <div style={profileShowcasePreviewMetaStyle}>
              <span>
                {customizeOpen
                  ? "Move text, choose font, and set visibility."
                  : cleanCoverText
                    ? "This is how your Showcase will look."
                    : "Overlay text is optional. Use Customize if you want to add writing."}
              </span>
            </div>
          </div>
        </div>

        {error ? <p style={profileShowcaseErrorStyle}>{error}</p> : null}

        <div className="profile-showcase-modal-actions" style={profileShowcaseModalActionsStyle}>
          <button type="button" onClick={onClose} style={profileShowcaseCancelButtonStyle}>Cancel</button>
          <button type="button" onClick={onCreate} disabled={saving} style={{ ...profileShowcaseCreateButtonStyle, opacity: saving ? 0.66 : 1 }}>
            {saving ? "Creating..." : "✨ Create Showcase"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileBottomNav({
  currentUserId,
  avatarUrl,
  parachatUnreadCount,
  onCreatePost,
}: {
  currentUserId: string;
  avatarUrl: string;
  parachatUnreadCount: number;
  onCreatePost: () => void;
}) {
  const [useTabletPortal, setUseTabletPortal] = useState(false);

  useEffect(() => {
    const tabletQuery = window.matchMedia("(min-width: 761px) and (max-width: 1180px)");
    const syncTabletPortal = () => setUseTabletPortal(tabletQuery.matches);

    syncTabletPortal();
    tabletQuery.addEventListener?.("change", syncTabletPortal);
    return () => tabletQuery.removeEventListener?.("change", syncTabletPortal);
  }, []);


  const navigation = (
    <nav className="dashboard-bottom-nav" style={mobileBottomNavStyle} aria-label="Mobile dashboard navigation">
      <Link href="/dashboard" style={mobileNavItemActiveStyle} aria-label="Home">
        <span style={mobileNavIconSlotStyle}><HomeIcon /></span>
        <span style={mobileNavLabelStyle}>Home</span>
      </Link>

      <Link href="/reels" style={mobileNavItemStyle} aria-label="Explore Reels">
        <span style={mobileNavIconSlotStyle}><ReelsIcon /></span>
        <span style={mobileNavLabelStyle}>Reels</span>
      </Link>

      <button type="button" onClick={onCreatePost} style={mobileCenterPlusStyle} aria-label="Create post">
        <PlusIcon />
      </button>

      <Link href="/messages" style={mobileNavItemStyle} aria-label="Parachat">
        <span style={{ ...mobileNavIconSlotStyle, position: "relative", fontSize: 22, lineHeight: 1 }}>
          ☏
          {parachatUnreadCount > 0 ? <span style={mobileNavBadgeStyle}>{parachatUnreadCount > 9 ? "9+" : parachatUnreadCount}</span> : null}
        </span>
        <span style={mobileNavLabelStyle}>Parachat</span>
      </Link>

      <Link href={currentUserId ? `/profile/${currentUserId}` : "/dashboard"} style={mobileNavItemStyle} aria-label="Profile">
        <span style={mobileNavIconSlotStyle}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={mobileNavAvatarStyle} />
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
              <path d="M4.5 21C5.5 16.8 8.4 14.5 12 14.5C15.6 14.5 18.5 16.8 19.5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </span>
        <span style={mobileNavLabelStyle}>Profile</span>
      </Link>
    </nav>
  );

  return useTabletPortal && typeof document !== "undefined"
    ? createPortal(
        <div className="dashboard-tablet-nav-fixed-layer">
          {navigation}
        </div>,
        document.body
      )
    : navigation;
}



const mobileMenuTopBarStyle: CSSProperties = {
  flexShrink: 0,
  position: "relative",
  zIndex: 5,
  display: "grid",
  gridTemplateColumns: "96px minmax(0, 1fr) 42px",
  alignItems: "center",
  gap: 10,
  width: "calc(100% + 32px)",
  marginLeft: -16,
  marginRight: -16,
  padding: "max(12px, env(safe-area-inset-top)) 16px 14px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  background: "transparent",
  backdropFilter: "none",
};

const mobileMenuBackButtonStyle: CSSProperties = {
  minWidth: 88,
  height: 42,
  border: "none",
  background: "transparent",
  color: "#fff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 5,
  cursor: "pointer",
  padding: 0,
};
const mobileMenuBackArrowOnlyStyle: CSSProperties = {
  fontSize: 42,
  lineHeight: 0.7,
};

const mobileMenuBackArrowStyle: CSSProperties = {
  fontSize: 34,
  lineHeight: 0.8,
};

const mobileMenuBackTextStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 850,
  letterSpacing: "-0.02em",
};


const mobileMenuTitleStyle: CSSProperties = {
  margin: 0,
  color: "#fff",
  fontSize: 24,
  fontWeight: 950,
  letterSpacing: "-0.04em",
  textAlign: "left",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const mobileMenuListWrapStyle: CSSProperties = {
  display: "grid",
  gap: 0,
  paddingTop: 8,
  paddingBottom: "calc(180px + env(safe-area-inset-bottom))",
};

const mobileMenuScrollAreaStyle: CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  height: "auto",
  overflowY: "auto",
  overflowX: "hidden",
  paddingRight: 2,
  paddingBottom: "calc(96px + env(safe-area-inset-bottom))",
  WebkitOverflowScrolling: "touch",
  overscrollBehaviorY: "contain",
  overscrollBehaviorX: "none",
  touchAction: "pan-y",
};

const mobileMenuSectionHeadingStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: 15,
  fontWeight: 850,
  padding: "18px 0 10px",
};

const mobileMenuDividerStyle: CSSProperties = {
  height: 8,
  margin: "14px -16px 0",
  background: "rgba(255,255,255,0.06)",
  borderTop: "1px solid rgba(255,255,255,0.045)",
  borderBottom: "1px solid rgba(255,255,255,0.045)",
};

const mobileMenuListRowStyle: CSSProperties = {
  minHeight: 58,
  padding: "0 2px",
  border: "none",
  borderBottom: "1px solid rgba(255,255,255,0.060)",
  background: "transparent",
  color: "#fff",
  textDecoration: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  cursor: "pointer",
  overflow: "visible",
};

const mobileMenuListRowButtonStyle: CSSProperties = {
  ...mobileMenuListRowStyle,
  width: "100%",
  font: "inherit",
  textAlign: "left",
};

const mobileMenuLogoutButtonStyle: CSSProperties = {
  ...mobileMenuListRowButtonStyle,
  color: "#fca5a5",
  justifyContent: "flex-start",
};

const mobileMenuRowLabelStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 19,
  fontWeight: 630,
  letterSpacing: "-0.025em",
};

const mobileMenuRowRightStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  flexShrink: 0,
};

const mobileMenuBadgeStyle: CSSProperties = {
  minWidth: 24,
  height: 24,
  padding: "0 7px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--parapost-accent-2)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 950,
  boxShadow: "0 0 18px var(--parapost-accent-glow)",
};

const mobileMenuArrowStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: 33,
  lineHeight: 1,
  fontWeight: 350,
};

const mobileMenuInfoCardStyle: CSSProperties = {
  marginTop: 14,
  padding: "14px 4px",
  color: "#aeb7c8",
  fontSize: 14,
  lineHeight: 1.55,
};

const mobileMenuMutedRowStyle: CSSProperties = {
  ...mobileMenuListRowStyle,
  color: "#d1d5db",
};

const mobileMenuComingSoonStyle: CSSProperties = {
  color: "#8b93a3",
  fontSize: 14,
  fontWeight: 700,
};

const mobileMenuProfileLinkRowStyle: CSSProperties = {
  ...mobileMenuListRowStyle,
  minHeight: 82,
  justifyContent: "flex-start",
  alignItems: "center",
  padding: "12px 4px",
  overflow: "visible",
};

const mobileMenuProfileTextStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
  display: "grid",
  gap: 2,
};

const mobileMenuProfileNameStyle: CSSProperties = {
  color: "#fff",
  fontSize: 18,
  fontWeight: 850,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const mobileMenuProfileMetaStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: 13,
  fontWeight: 650,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const mobileMenuDetailRowStyle: CSSProperties = {
  minHeight: 58,
  padding: "10px 4px",
  borderBottom: "1px solid rgba(255,255,255,0.055)",
  color: "#fff",
  display: "grid",
  gap: 4,
};

const mobileMenuDetailMetaStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: 13,
  fontWeight: 650,
};

const mobileMenuStatValueStyle: CSSProperties = {
  color: "var(--parapost-accent-text)",
  fontSize: 18,
  fontWeight: 950,
};

const mobileMenuBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 210,
  background: "rgba(0,0,0,0.78)",
  backdropFilter: "blur(10px)",
};

const mobileMenuDrawerStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 220,
  width: "100vw",
  height: "100dvh",
  minHeight: "100dvh",
  maxHeight: "100dvh",
  background:
    "radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--parapost-accent-2) 22%, transparent), transparent 34%), linear-gradient(180deg, rgba(10,12,22,0.995), rgba(5,7,13,0.995))",
  border: "none",
  boxShadow: "none",
  padding: "0 16px",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  touchAction: "pan-y",
};

const mobileMenuHandleStyle: CSSProperties = {
  width: 42,
  height: 5,
  borderRadius: 999,
  background: "rgba(255,255,255,0.24)",
  justifySelf: "center",
  display: "none",
};

const mobileMenuHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "6px 0 4px",
};

const mobileMenuProfileRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  minWidth: 0,
  flex: 1,
};

const mobileMenuCloseButtonStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.065)",
  color: "#fff",
  fontSize: 26,
  lineHeight: 1,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  flexShrink: 0,
};

const mobileMenuStatsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const mobileMenuSectionStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 12,
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.09)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.052), rgba(255,255,255,0.030))",
};

const mobileMenuSectionTitleStyle: CSSProperties = {
  color: "#fff",
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: "0.02em",
};

const mobileMenuLinkGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const mobileMenuLinkStyle: CSSProperties = {
  minHeight: 42,
  borderRadius: 15,
  padding: "10px 12px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.045)",
  color: "#fff",
  textDecoration: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  fontSize: 13,
  fontWeight: 850,
};

const mobileMenuActionButtonStyle: CSSProperties = {
  ...mobileMenuLinkStyle,
  cursor: "pointer",
  textAlign: "left",
};

const mobileMenuSponsorCardStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  padding: 12,
  borderRadius: 18,
  border: "1px solid color-mix(in srgb, var(--parapost-accent-2) 26%, rgba(255,255,255,0.10))",
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--parapost-accent-2) 18%, transparent), rgba(255,255,255,0.035))",
};

const mobileMenuHorizontalProfilesStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  overflowX: "auto",
  overflowY: "visible",
  paddingTop: 4,
  paddingBottom: 8,
};

const mobileMenuPersonRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: 10,
  minHeight: 64,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.035)",
  textDecoration: "none",
  color: "#fff",
  overflow: "visible",
};

const mobileMenuTrendRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "30px minmax(0, 1fr)",
  gap: 9,
  alignItems: "start",
  padding: 9,
  borderRadius: 15,
  background: "rgba(255,255,255,0.035)",
  border: "1px solid rgba(255,255,255,0.07)",
};

const mobileMenuMutedFeatureStyle: CSSProperties = {
  minHeight: 40,
  borderRadius: 15,
  padding: "10px 12px",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.025)",
  color: "#9ca3af",
  fontSize: 13,
  fontWeight: 800,
};

const mobileTimelineSponsorStyle: CSSProperties = {
  display: "none",
  padding: 14,
  borderRadius: 23,
  border: "1px solid color-mix(in srgb, var(--parapost-accent-2) 25%, rgba(255,255,255,0.12))",
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--parapost-accent-2) 16%, transparent), rgba(255,255,255,0.045))",
  boxShadow: "0 16px 40px rgba(0,0,0,0.26)",
};

const selectedFeelingActivityStyle: CSSProperties = {
  marginTop: 12,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  maxWidth: "100%",
  borderRadius: 14,
  border: "1px solid var(--parapost-accent-border)",
  background: "linear-gradient(135deg, var(--parapost-accent-soft), color-mix(in srgb, var(--parapost-accent-2) 8%, transparent))",
  color: "#fff",
  padding: "8px 10px",
};

const selectedFeelingCategoryStyle: CSSProperties = {
  color: "var(--parapost-accent-readable-text)",
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const selectedFeelingLabelStyle: CSSProperties = {
  color: "#fff",
  fontSize: 13,
  fontWeight: 950,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const selectedFeelingRemoveStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 999,
  background: "rgba(255,255,255,0.055)",
  color: "#e5e7eb",
  padding: "5px 8px",
  fontSize: 11,
  fontWeight: 900,
  cursor: "pointer",
  marginLeft: "auto",
};

const feelingActivityModalStyle: CSSProperties = {
  width: "min(720px, 100%)",
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(8,10,18,0.98))",
  boxShadow: "0 28px 80px rgba(0,0,0,0.58)",
  padding: 18,
};

const feelingActivityIntroStyle: CSSProperties = {
  margin: "7px 0 0",
  color: "#9ca3af",
  fontSize: 13,
  lineHeight: 1.45,
};

const feelingActivitySelectedPreviewStyle: CSSProperties = {
  ...selectedFeelingActivityStyle,
  display: "flex",
  marginTop: 0,
  marginBottom: 14,
};

const feelingActivitySectionStyle: CSSProperties = {
  marginTop: 14,
};

const feelingActivitySectionTitleStyle: CSSProperties = {
  margin: "0 0 10px",
  color: "#f9fafb",
  fontSize: 14,
  fontWeight: 950,
};

const feelingActivityGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const feelingActivityOptionStyle: CSSProperties = {
  minHeight: 58,
  display: "flex",
  alignItems: "center",
  gap: 10,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.045)",
  color: "#fff",
  padding: "10px 12px",
  cursor: "pointer",
  textAlign: "left",
  width: "100%",
};

const feelingActivityOptionActiveStyle: CSSProperties = {
  border: "1px solid var(--parapost-accent-active-border)",
  background: "linear-gradient(135deg, var(--parapost-accent-soft), var(--parapost-accent-muted-bg))",
  boxShadow: "0 0 22px color-mix(in srgb, var(--parapost-accent-2) 18%, transparent)",
};

const feelingActivityOptionIconStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 13,
  flexShrink: 0,
  display: "grid",
  placeItems: "center",
  color: "#fff",
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--parapost-accent-1) 76%, rgba(255,255,255,0.10)), color-mix(in srgb, var(--parapost-accent-2) 66%, transparent))",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 10px 22px rgba(0,0,0,0.24), 0 0 14px color-mix(in srgb, var(--parapost-accent-2) 22%, transparent)",
};

const feelingActivityOptionLabelStyle: CSSProperties = {
  display: "block",
  color: "#fff",
  fontSize: 13,
  fontWeight: 950,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const feelingActivityOptionHelperStyle: CSSProperties = {
  display: "block",
  color: "#9ca3af",
  fontSize: 11,
  marginTop: 2,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const mobileInsightsShellStyle: CSSProperties = {
  display: "none",
  gap: 14,
  borderRadius: 24,
  border: "1px solid var(--parapost-accent-border)",
  background: "radial-gradient(circle at 14% 0%, var(--parapost-accent-soft), transparent 40%), linear-gradient(180deg, rgba(18,24,38,0.94), rgba(8,10,18,0.92))",
  boxShadow: "0 18px 48px rgba(0,0,0,0.30), 0 0 28px var(--parapost-accent-glow)",
  padding: 16,
};

const mobileInsightsHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const miniEyebrowStyle: CSSProperties = {
  color: "var(--parapost-accent-text)",
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

const privatePillStyle: CSSProperties = {
  borderRadius: 999,
  border: "1px solid color-mix(in srgb, var(--parapost-accent-text) 24%, transparent)",
  background: "color-mix(in srgb, var(--parapost-accent-2) 12%, transparent)",
  color: "var(--parapost-accent-readable-text)",
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const mobileInsightsStatsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const mobileRecentlyViewedBoxStyle: CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.09)",
  background: "rgba(255,255,255,0.035)",
  padding: 12,
};

const mobileSubHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
};

const privateMiniTextStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: 11,
  fontWeight: 800,
};

const mobileProfileRailStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  overflowX: "auto",
  paddingBottom: 2,
};

const mobileProfileBubbleStyle: CSSProperties = {
  minWidth: 68,
  minHeight: 70,
  display: "grid",
  justifyItems: "center",
  alignContent: "start",
  gap: 7,
  color: "#e5e7eb",
  textDecoration: "none",
  fontSize: 11,
  fontWeight: 850,
  textAlign: "center",
  overflow: "visible",
};

const mobileProfileSummaryStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  padding: 12,
};

const mobileMiniProfileButtonStyle: CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  textDecoration: "none",
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 900,
  flexShrink: 0,
};

const mobileQuickToolsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const mobileQuickToolButtonStyle: CSSProperties = {
  minHeight: 42,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const mobileQuickToolLinkStyle: CSSProperties = {
  ...mobileQuickToolButtonStyle,
  display: "grid",
  placeItems: "center",
  textDecoration: "none",
};

const mobileSponsorPreviewStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  borderRadius: 20,
  border: "1px solid color-mix(in srgb, var(--parapost-accent-2) 20%, transparent)",
  background: "linear-gradient(135deg, color-mix(in srgb, var(--parapost-accent-2) 12%, transparent), rgba(6,182,212,0.05))",
  padding: 12,
};

const railHeroProfileStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  borderRadius: 17,
  border: "1px solid rgba(255,255,255,0.095)",
  background:
    "linear-gradient(135deg, rgba(168,85,247,0.105), rgba(255,255,255,0.035))",
  padding: 12,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.030)",
};

const railProfileButtonStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.055)",
  color: "#fff",
  textDecoration: "none",
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 900,
  flexShrink: 0,
};

const railStatGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 6,
};

const railStatTileStyle: CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.085)",
  background: "rgba(255,255,255,0.034)",
  padding: "10px 10px",
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.022)",
};

const railStatValueStyle: CSSProperties = {
  color: "#fff",
  fontSize: 18,
  fontWeight: 950,
  lineHeight: 1,
  flexShrink: 0,
};

const railStatLabelStyle: CSSProperties = {
  color: "#d1d5db",
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const discoverProfileRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  color: "#fff",
  textDecoration: "none",
  borderRadius: 15,
  border: "1px solid rgba(255,255,255,0.080)",
  background: "rgba(255,255,255,0.032)",
  padding: 10,
  transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease",
};

const miniArrowStyle: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--parapost-accent-readable-text)",
  background: "color-mix(in srgb, var(--parapost-accent-2) 10%, transparent)",
  border: "1px solid color-mix(in srgb, var(--parapost-accent-2) 18%, transparent)",
  fontSize: 18,
  lineHeight: 1,
  fontWeight: 900,
  flexShrink: 0,
};

const privacyNoticeStyle: CSSProperties = {
  borderRadius: 14,
  border: "1px solid color-mix(in srgb, var(--parapost-accent-text) 18%, transparent)",
  background: "color-mix(in srgb, var(--parapost-accent-2) 8%, transparent)",
  color: "var(--parapost-accent-readable-text)",
  padding: "9px 10px",
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1.45,
};

const reelsRailFeatureStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  borderRadius: 16,
  border: "1px solid rgba(168,85,247,0.18)",
  background:
    "linear-gradient(135deg, rgba(168,85,247,0.12), rgba(255,255,255,0.034))",
  padding: 12,
};

const reelsRailIconStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 14,
  display: "grid",
  placeItems: "center",
  background: "#fff",
  color: "#111827",
  fontWeight: 950,
  flexShrink: 0,
  boxShadow: "0 12px 24px rgba(0,0,0,0.20)",
};

const railPrimaryLinkStyle: CSSProperties = {
  minHeight: 40,
  borderRadius: 13,
  display: "grid",
  placeItems: "center",
  background: "#fff",
  color: "#000",
  textDecoration: "none",
  fontWeight: 950,
  padding: "0 14px",
  boxShadow: "0 12px 24px rgba(0,0,0,0.18)",
};

const sponsorCardStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.095)",
  background:
    "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(255,255,255,0.030))",
  padding: 12,
};

const sponsorIconStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 14,
  display: "grid",
  placeItems: "center",
  color: "#fff",
  fontWeight: 950,
  background: "linear-gradient(135deg, #7c3aed, #ec4899)",
  boxShadow: "0 0 22px rgba(168,85,247,0.24)",
  flexShrink: 0,
};

// Phase 3.2B: dashboard now uses the global Parapost accent layer while keeping text readable.
const dashboardRootStyle: CSSProperties = {
  minHeight: "100vh",
  height: "auto",
  width: "100%",
  maxWidth: "100vw",
  position: "relative",
  overflowX: "hidden",
  overflowY: "visible",
  background:
    "radial-gradient(circle at 55% 0%, var(--parapost-accent-muted-bg), transparent 34%), radial-gradient(circle at 10% 10%, var(--parapost-accent-active-bg), transparent 30%), #05070d",
  color: "#f9fafb",
};

const backgroundGlowStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  pointerEvents: "none",
  background:
    "linear-gradient(90deg, rgba(0,0,0,0.7), rgba(0,0,0,0.1), rgba(0,0,0,0.64)), radial-gradient(circle at 75% 30%, color-mix(in srgb, var(--parapost-accent-2) 12%, transparent), transparent 28%)",
  zIndex: 0,
};

const dashboardShellStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  maxWidth: "1740px",
  margin: "0 auto",
  padding: "18px 16px 110px",
};

const dashboardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "280px minmax(0, 1fr) 330px",
  gap: "22px",
  alignItems: "start",
};

const leftSidebarStyle: CSSProperties = {
  position: "relative",
  top: "auto",
  alignSelf: "start",
  height: "auto",
  maxHeight: "none",
  overflowY: "visible",
  overflowX: "visible",
  overscrollBehavior: "auto",
  scrollbarWidth: "auto",
  borderRight: "1px solid rgba(255,255,255,0.075)",
  padding: "0 18px 18px 4px",
};

const mainColumnStyle: CSSProperties = {
  minWidth: 0,
  maxWidth: "1000px",
  margin: "0 auto",
  width: "100%",
};

const rightRailStyle: CSSProperties = {
  position: "relative",
  top: "auto",
  alignSelf: "start",
  maxHeight: "none",
  overflowY: "visible",
  overflowX: "visible",
  overscrollBehavior: "auto",
  scrollbarWidth: "auto",
  display: "grid",
  gap: "14px",
  paddingBottom: "18px",
  paddingRight: "0",
};

const feedLoadMoreSentinelStyle: CSSProperties = {
  width: "100%",
  height: "72px",
  display: "block",
  pointerEvents: "none",
};

const sidebarLogoStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "14px",
  color: "#fff",
  textDecoration: "none",
  marginBottom: "20px",
  userSelect: "none",
};

const logoGhostCircleStyle: CSSProperties = {
  width: 68,
  height: 68,
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background:
    "radial-gradient(circle at 50% 38%, rgba(255,255,255,0.13), transparent 34%), linear-gradient(135deg, rgba(168,85,247,0.24), rgba(236,72,153,0.08))",
  border: "2px solid rgba(168,85,247,0.82)",
  boxShadow: "0 0 0 1px rgba(255,255,255,0.065), 0 0 30px rgba(168,85,247,0.50)",
  color: "#fff",
  fontWeight: 950,
  fontSize: 24,
};

const logoWordStyle: CSSProperties = {
  fontSize: 32,
  fontWeight: 950,
  lineHeight: 0.95,
  letterSpacing: "0.02em",
  color: "#ffffff",
  textShadow: "0 1px 0 rgba(255,255,255,0.06), 0 12px 28px rgba(0,0,0,0.35)",
};

const logoNetworkStyle: CSSProperties = {
  color: "#a855f7",
  letterSpacing: "0.42em",
  fontWeight: 950,
  fontSize: 14,
  marginTop: 5,
  textShadow: "0 0 14px rgba(168,85,247,0.52)",
};

const sidebarNavStyle: CSSProperties = {
  display: "grid",
  gap: 5,
};

const sidebarItemStyle: CSSProperties = {
  minHeight: 39,
  borderRadius: 12,
  color: "#d1d5db",
  textDecoration: "none",
  display: "grid",
  gridTemplateColumns: "22px 1fr auto",
  alignItems: "center",
  gap: 8,
  padding: "0 11px",
  border: "1px solid transparent",
  background: "transparent",
  transition: "background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease",
};

const activeSidebarItemStyle: CSSProperties = {
  ...sidebarItemStyle,
  color: "#fff",
  background:
    "linear-gradient(90deg, rgba(168,85,247,0.20), rgba(255,255,255,0.038))",
  border: "1px solid rgba(168,85,247,0.26)",
  boxShadow: "inset 3px 0 0 #a855f7, 0 10px 24px rgba(0,0,0,0.16)",
};

const mutedSidebarItemStyle: CSSProperties = {
  ...sidebarItemStyle,
  color: "rgba(209,213,219,0.38)",
  opacity: 0.62,
  cursor: "default",
  pointerEvents: "none",
  background: "rgba(255,255,255,0.010)",
};

const sidebarComposerReelIconStyle: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 8,
  display: "grid",
  placeItems: "center",
  background: "color-mix(in srgb, var(--parapost-accent-3) 18%, transparent)",
  color: "var(--parapost-accent-readable-text)",
  fontSize: 12,
  fontWeight: 950,
  lineHeight: 1,
};

const sidebarIconWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "inherit",
};
const dotIconStyle: CSSProperties = { width: 8, height: 8, borderRadius: 999, background: "rgba(255,255,255,0.55)" };
const mutedDotIconStyle: CSSProperties = { width: 8, height: 8, borderRadius: 999, background: "rgba(255,255,255,0.26)" };
const sidebarBadgeStyle: CSSProperties = {
  minWidth: 24,
  height: 22,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg, #7c3aed, #a855f7)",
  color: "#fff",
  fontSize: 11,
  fontWeight: 950,
  padding: "0 7px",
  boxShadow: "0 0 14px rgba(168,85,247,0.24)",
};
const mutedSidebarBadgeStyle: CSSProperties = {
  ...sidebarBadgeStyle,
  background: "rgba(168,85,247,0.11)",
  color: "rgba(255,255,255,0.60)",
  border: "1px solid rgba(255,255,255,0.075)",
  boxShadow: "none",
};
const sidebarDividerStyle: CSSProperties = {
  height: 1,
  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
  margin: "14px 0",
};
const sidebarSectionLabelStyle: CSSProperties = {
  color: "#c084fc",
  fontSize: 12,
  fontWeight: 950,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 8,
};
const sidebarSectionHeaderRowStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 };
const sidebarSectionSoonBadgeStyle: CSSProperties = {
  borderRadius: 999,
  background: "rgba(168,85,247,0.13)",
  border: "1px solid rgba(168,85,247,0.18)",
  color: "rgba(255,255,255,0.76)",
  padding: "4px 8px",
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};
const paranormalHubIntroStyle: CSSProperties = {
  margin: "0 0 9px",
  borderRadius: 13,
  border: "1px solid rgba(168,85,247,0.16)",
  background: "linear-gradient(135deg, rgba(168,85,247,0.075), rgba(255,255,255,0.022))",
  color: "rgba(226,232,240,0.76)",
  fontSize: 11.5,
  lineHeight: 1.38,
  padding: "9px 10px",
};

const goLiveCardStyle: CSSProperties = {
  marginTop: 0,
  display: "flex",
  alignItems: "center",
  gap: 10,
  borderRadius: 15,
  padding: 11,
  textDecoration: "none",
  background: "linear-gradient(135deg, rgba(168,85,247,0.070), rgba(255,255,255,0.022))",
  border: "1px solid rgba(168,85,247,0.16)",
  boxShadow: "0 12px 24px rgba(0,0,0,0.16)",
  opacity: 0.78,
  cursor: "default",
};

const goLiveIconStyle: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 12,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,0.055)",
  color: "#fff",
  fontSize: 21,
  border: "1px solid rgba(255,255,255,0.075)",
};
const goLiveSoonBadgeStyle: CSSProperties = { marginLeft: "auto", borderRadius: 999, background: "color-mix(in srgb, var(--parapost-accent-2) 22%, transparent)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.78)", padding: "5px 8px", fontSize: 11, fontWeight: 950, whiteSpace: "nowrap" };
const sidebarProfileStyle: CSSProperties = {
  marginTop: 0,
  display: "flex",
  alignItems: "center",
  gap: 10,
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.095)",
  borderRadius: 14,
  padding: 9,
  background: "rgba(255,255,255,0.032)",
  transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease",
};

const desktopTopBarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 14,
  marginBottom: 18,
  width: "100%",
};

const searchWrapStyle: CSSProperties = {
  position: "relative",
  height: 48,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.105)",
  background: "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.032))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.030), 0 12px 26px rgba(0,0,0,0.18)",
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "0 16px",
  color: "#d1d5db",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
};

const searchInputStyle: CSSProperties = { flex: 1, minWidth: 0, height: "100%", background: "transparent", color: "#fff", border: 0, outline: 0, fontSize: 15, fontWeight: 750 };
const searchFilterButtonStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.09)",
  background: "rgba(255,255,255,0.035)",
  color: "#d1d5db",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  gap: 4,
};
const searchDropdownStyle: CSSProperties = { position: "absolute", left: 0, right: 0, top: "calc(100% + 10px)", borderRadius: 20, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(8,10,18,0.96)", backdropFilter: "blur(18px)", padding: 12, zIndex: 80, boxShadow: "0 22px 60px rgba(0,0,0,0.5)" };

const topActionRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 14 };
const squarePurpleButtonStyle: CSSProperties = { width: 54, height: 54, borderRadius: 16, display: "grid", placeItems: "center", border: "1px solid color-mix(in srgb, var(--parapost-accent-2) 55%, transparent)", background: "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-3))", color: "#fff", boxShadow: "0 0 26px var(--parapost-accent-strong-glow)", cursor: "pointer" };
const topIconButtonStyle: CSSProperties = {
  position: "relative",
  width: 42,
  height: 42,
  borderRadius: 14,
  display: "grid",
  placeItems: "center",
  color: "#fff",
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.105)",
  background: "rgba(255,255,255,0.045)",
  flexShrink: 0,
};
const topProfileButtonStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 14,
  display: "grid",
  placeItems: "center",
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.105)",
  background: "rgba(255,255,255,0.040)",
  overflow: "visible",
  flexShrink: 0,
};
const topBadgeStyle: CSSProperties = { position: "absolute", top: -8, right: -8, minWidth: 22, height: 22, borderRadius: 999, background: "var(--parapost-accent-1)", color: "#fff", fontSize: 12, fontWeight: 950, display: "grid", placeItems: "center", padding: "0 6px" };

const showcaseCardStyle: CSSProperties = { borderRadius: 24, border: "1px solid rgba(255,255,255,0.11)", background: "rgba(255,255,255,0.045)", padding: 14, marginBottom: 18, overflow: "hidden" };
const showcaseQuickGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1.34fr) minmax(260px, 0.66fr)", gap: 16, alignItems: "stretch" };
const showcaseColumnStyle: CSSProperties = { minWidth: 0, display: "flex", flexDirection: "column", gap: 12 };
const showcaseSectionHeaderStyle: CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" };
const showcaseSectionTitleStyle: CSSProperties = { margin: 0, color: "#fff", fontSize: 18, fontWeight: 950, letterSpacing: "-0.02em" };
const showcaseSectionSubtitleStyle: CSSProperties = { margin: "4px 0 0", color: "#9ca3af", fontSize: 12.5, lineHeight: 1.35 };
const showcaseSmallLinkStyle: CSSProperties = { minHeight: 32, borderRadius: 999, border: "1px solid var(--parapost-accent-border)", background: "var(--parapost-accent-muted-bg)", color: "var(--parapost-accent-readable-text)", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 11px", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" };
const showcaseScrollerStyle: CSSProperties = { display: "flex", gap: 16, alignItems: "stretch", overflowX: "auto", overflowY: "hidden", padding: "2px 2px 4px", scrollSnapType: "x proximity" };
const createShowcaseTileStyle: CSSProperties = { position: "relative", width: 104, minWidth: 104, height: 116, display: "grid", justifyItems: "center", alignContent: "center", gap: 6, borderRadius: 18, border: "1px solid color-mix(in srgb, var(--parapost-accent-2) 22%, transparent)", color: "#fff", textDecoration: "none", background: "linear-gradient(180deg, color-mix(in srgb, var(--parapost-accent-2) 14%, transparent), rgba(0,0,0,0.18))", padding: 10, scrollSnapAlign: "start" };
const showcasePlusStyle: CSSProperties = { position: "absolute", right: 20, top: 62, width: 27, height: 27, borderRadius: 999, background: "var(--parapost-accent-1)", color: "#fff", display: "grid", placeItems: "center", border: "2px solid #0a0d14", fontWeight: 950 };
const createShowcaseHintStyle: CSSProperties = { color: "var(--parapost-accent-readable-text)", fontSize: 11, fontWeight: 850, textAlign: "center", lineHeight: 1.15 };
const showcaseTileStyle: CSSProperties = { width: 104, minWidth: 104, height: 116, display: "grid", justifyItems: "center", alignContent: "center", gap: 8, color: "#fff", textDecoration: "none", scrollSnapAlign: "start" };
const demoAvatarStyle: CSSProperties = { width: 78, height: 78, borderRadius: 999, border: "3px solid var(--parapost-accent-1)", display: "grid", placeItems: "center", background: "linear-gradient(135deg, color-mix(in srgb, var(--parapost-accent-2) 28%, transparent), rgba(0,0,0,0.8))", fontWeight: 950, fontSize: 26, boxShadow: "0 0 22px var(--parapost-accent-active-bg)" };
const showcaseNameStyle: CSSProperties = { width: "100%", fontSize: 12.5, textAlign: "center", color: "#e5e7eb", lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const showcaseNameStrongStyle: CSSProperties = { color: "#fff", fontSize: 13, fontWeight: 950, textAlign: "center", lineHeight: 1.05 };
const newShowcaseIconStyle: CSSProperties = { width: 70, height: 70, borderRadius: 999, display: "grid", placeItems: "center", background: "radial-gradient(circle at 35% 28%, rgba(255,255,255,0.24), color-mix(in srgb, var(--parapost-accent-2) 18%, transparent) 42%, rgba(7,9,13,0.98) 76%)", border: "3px solid color-mix(in srgb, var(--parapost-accent-2) 86%, transparent)", boxShadow: "0 0 22px color-mix(in srgb, var(--parapost-accent-2) 36%, transparent), inset 0 1px 0 rgba(255,255,255,0.13)" };
const newShowcasePlusInnerStyle: CSSProperties = { width: 34, height: 34, borderRadius: 999, display: "grid", placeItems: "center", background: "linear-gradient(135deg, var(--parapost-accent-2), var(--parapost-accent-1))", color: "#fff", fontSize: 24, fontWeight: 950, boxShadow: "0 10px 22px var(--parapost-accent-strong-glow)" };
const friendShowcaseBubbleStyle: CSSProperties = { width: 76, height: 76, borderRadius: 999, display: "grid", placeItems: "center", overflow: "hidden", padding: 3, background: "linear-gradient(135deg, color-mix(in srgb, var(--parapost-accent-2) 90%, transparent), var(--parapost-accent-3))", boxShadow: "0 0 22px color-mix(in srgb, var(--parapost-accent-2) 32%, transparent)", border: "1px solid rgba(255,255,255,0.12)" };
const friendShowcaseMediaStyle: CSSProperties = { width: "100%", height: "100%", borderRadius: 999, objectFit: "cover", display: "block", border: "2px solid #07090d" };
const emptyFriendShowcaseTileStyle: CSSProperties = { width: 146, minWidth: 146, height: 116, display: "grid", justifyItems: "center", alignContent: "center", gap: 8, borderRadius: 18, border: "1px dashed rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.025)", color: "#d1d5db", scrollSnapAlign: "start" };
const emptyFriendShowcaseIconStyle: CSSProperties = { width: 54, height: 54, borderRadius: 999, display: "grid", placeItems: "center", border: "2px solid color-mix(in srgb, var(--parapost-accent-2) 42%, transparent)", color: "var(--parapost-accent-text)", background: "color-mix(in srgb, var(--parapost-accent-2) 10%, transparent)", fontWeight: 950 };
const showcaseArrowStyle: CSSProperties = { alignSelf: "center", minWidth: 38, width: 38, height: 38, borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 30, cursor: "pointer" };
const quickActionsColumnStyle: CSSProperties = { borderRadius: 22, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(0,0,0,0.18)", padding: 12, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 };
const quickActionsHeaderStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 2 };
const quickActionsEyebrowStyle: CSSProperties = { color: "var(--parapost-accent-text)", fontSize: 11, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase" };
const quickActionsTitleStyle: CSSProperties = { color: "#fff", fontSize: 15, fontWeight: 950 };
const quickActionsGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr", gap: 9 };
const quickActionTileStyle: CSSProperties = { minHeight: 54, borderRadius: 18, border: "1px solid rgba(255,255,255,0.095)", background: "rgba(255,255,255,0.045)", color: "#fff", textDecoration: "none", display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", cursor: "pointer", textAlign: "left", width: "100%" };
const quickActionIconStyle: CSSProperties = { width: 32, height: 32, borderRadius: 12, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--parapost-accent-2) 18%, transparent)", color: "var(--parapost-accent-readable-text)", fontWeight: 950, flexShrink: 0, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" };
const quickActionLabelStyle: CSSProperties = { display: "block", color: "#fff", fontSize: 13, fontWeight: 950, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const quickActionTextStyle: CSSProperties = { display: "block", color: "#9ca3af", fontSize: 11.5, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

const dashboardProfileShowcasesPanelStyle: CSSProperties = {
  marginBottom: 12,
  padding: "10px 0 12px",
  borderRadius: 22,
  borderTop: "1px solid rgba(255,255,255,0.08)",
  borderRight: "1px solid rgba(255,255,255,0.06)",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  borderLeft: "1px solid rgba(255,255,255,0.06)",
  background: "linear-gradient(180deg, rgba(38,25,52,0.68), rgba(17,19,24,0.86))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035), 0 16px 38px rgba(0,0,0,0.24)",
  overflow: "hidden",
};

const dashboardShowcasesHeaderStyle: CSSProperties = {
  margin: "0 14px 10px",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 10,
  flexWrap: "wrap",
};

const dashboardShowcasesTitleStyle: CSSProperties = {
  margin: 0,
  color: "#ffffff",
  fontSize: 15,
  fontWeight: 950,
  letterSpacing: "-0.02em",
};

const dashboardShowcasesSubtitleStyle: CSSProperties = {
  margin: 0,
  color: "#9ca3af",
  fontSize: 12,
  lineHeight: 1.35,
};

const dashboardProfileShowcasesRowStyle: CSSProperties = {
  position: "relative",
  zIndex: 3,
  display: "flex",
  alignItems: "flex-start",
  gap: 13,
  minHeight: 82,
  overflowX: "auto",
  overflowY: "visible",
  padding: "0 14px 8px",
  scrollbarWidth: "thin",
  scrollbarColor: "color-mix(in srgb, var(--parapost-accent-2) 42%, transparent) rgba(255,255,255,0.04)",
};

const dashboardProfileShowcaseNewItemStyle: CSSProperties = {
  position: "relative",
  zIndex: 5,
  display: "grid",
  justifyItems: "center",
  gap: 6,
  minWidth: 70,
  width: 70,
  border: 0,
  background: "transparent",
  padding: "0 0 4px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const dashboardProfileShowcasePlusCircleStyle: CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  border: "1px solid rgba(255,255,255,0.18)",
  background:
    "radial-gradient(circle at 32% 24%, rgba(255,255,255,0.22), transparent 23%), linear-gradient(135deg, var(--parapost-accent-2), var(--parapost-accent-1) 58%, #4f46e5)",
  color: "#ffffff",
  fontSize: 34,
  fontWeight: 950,
  lineHeight: 0.86,
  paddingBottom: 4,
  boxShadow:
    "0 16px 34px color-mix(in srgb, var(--parapost-accent-1) 38%, transparent), 0 0 34px color-mix(in srgb, var(--parapost-accent-2) 28%, transparent), inset 0 1px 0 rgba(255,255,255,0.16)",
};

const dashboardProfileShowcaseLabelStyle: CSSProperties = {
  position: "relative",
  zIndex: 6,
  display: "block",
  maxWidth: 86,
  color: "#f3e8ff",
  fontSize: 11,
  fontWeight: 900,
  lineHeight: 1.1,
  textAlign: "center",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  letterSpacing: "0.01em",
};

const dashboardProfileShowcaseItemStyle: CSSProperties = {
  position: "relative",
  zIndex: 4,
  display: "grid",
  justifyItems: "center",
  gap: 6,
  minWidth: 70,
  width: 70,
  border: 0,
  background: "transparent",
  padding: "0 0 4px",
  cursor: "pointer",
  fontFamily: "inherit",
  textDecoration: "none",
};

const dashboardProfileShowcaseCoverCircleStyle: CSSProperties = {
  position: "relative",
  width: 58,
  height: 58,
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
  borderRadius: 999,
  border: "1px solid var(--parapost-accent-border)",
  background:
    "radial-gradient(circle at 36% 18%, rgba(255,255,255,0.16), transparent 24%), linear-gradient(135deg, rgba(88,28,135,0.96), color-mix(in srgb, var(--parapost-accent-3) 58%, transparent))",
  boxShadow: "0 0 22px color-mix(in srgb, var(--parapost-accent-2) 20%, transparent), 0 12px 24px rgba(0,0,0,0.24)",
};

const dashboardProfileShowcaseCoverMediaStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  zIndex: 0,
};

const dashboardProfileShowcaseVideoPreviewStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 0,
  display: "grid",
  placeItems: "center",
  background:
    "radial-gradient(circle at 36% 18%, rgba(255,255,255,0.16), transparent 24%), linear-gradient(135deg, rgba(88,28,135,0.96), color-mix(in srgb, var(--parapost-accent-3) 58%, transparent))",
  color: "#ffffff",
  fontSize: 20,
  fontWeight: 950,
  textShadow: "0 2px 10px rgba(0,0,0,0.52)",
};

const dashboardProfileShowcaseCoverShadeStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 1,
  background: "linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.48))",
  pointerEvents: "none",
};

const dashboardProfileShowcaseCoverTextStyle: CSSProperties = {
  position: "absolute",
  zIndex: 2,
  width: "78%",
  maxWidth: "78%",
  color: "#ffffff",
  fontWeight: 950,
  lineHeight: 1.05,
  letterSpacing: "-0.02em",
  textAlign: "center",
  textShadow: "0 2px 10px rgba(0,0,0,0.52)",
  transform: "translate(-50%, -50%)",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

const dashboardShowcaseEmptyFriendStyle: CSSProperties = {
  display: "grid",
  justifyItems: "center",
  gap: 6,
  minWidth: 110,
  color: "#d1d5db",
  opacity: 0.88,
};

const dashboardShowcaseEmptyIconStyle: CSSProperties = {
  width: 58,
  height: 58,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  border: "1px dashed var(--parapost-accent-border)",
  background: "color-mix(in srgb, var(--parapost-accent-2) 8%, transparent)",
  color: "var(--parapost-accent-text)",
  fontWeight: 950,
};

const profileShowcaseOptionalTextStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: "12px",
  fontWeight: 750,
};

const profileShowcaseModalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2147483647,
  display: "flex",
  alignItems: "stretch",
  justifyContent: "center",
  padding: "18px",
  background:
    "radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--parapost-accent-2) 20%, transparent), transparent 38%), rgba(0,0,0,0.88)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  overflow: "hidden",
};

const profileShowcaseModalStyle: CSSProperties = {
  width: "min(1180px, calc(100vw - 32px))",
  height: "min(840px, calc(100dvh - 32px))",
  maxHeight: "calc(100dvh - 32px)",
  overflowY: "auto",
  overflowX: "hidden",
  scrollbarWidth: "auto",
  scrollbarColor: "rgba(255,255,255,0.82) rgba(255,255,255,0.12)",
  borderRadius: "30px",
  border: "1px solid rgba(255,255,255,0.14)",
  background:
    "radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--parapost-accent-2) 28%, transparent), transparent 34%), radial-gradient(circle at 98% 10%, rgba(34,211,238,0.12), transparent 30%), linear-gradient(180deg, rgba(20,22,30,0.996), rgba(6,8,13,0.998))",
  boxShadow: "0 42px 120px rgba(0,0,0,0.72), 0 0 0 1px rgba(255,255,255,0.035)",
  padding: "22px",
  direction: "ltr",
  overscrollBehavior: "contain",
};

const profileShowcaseModalHeaderStyle: CSSProperties = {
  position: "relative",
  zIndex: 20,
  display: "flex",
  justifyContent: "space-between",
  gap: "14px",
  alignItems: "flex-start",
  marginBottom: "18px",
  paddingBottom: "14px",
  background: "transparent",
};

const profileShowcaseModalBrandRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "42px minmax(0, 1fr)",
  gap: "12px",
  alignItems: "center",
};

const profileShowcaseModalLogoStyle: CSSProperties = {
  width: "42px",
  height: "42px",
  display: "grid",
  placeItems: "center",
  borderRadius: "15px",
  background: "linear-gradient(135deg, var(--parapost-accent-2), var(--parapost-accent-1) 60%, #2563eb)",
  color: "#ffffff",
  boxShadow: "0 16px 34px color-mix(in srgb, var(--parapost-accent-1) 34%, transparent)",
  overflow: "hidden",
};

const profileShowcaseModalLogoImageStyle: CSSProperties = {
  width: "27px",
  height: "27px",
  objectFit: "contain",
  display: "block",
  filter: "drop-shadow(0 0 8px rgba(255,255,255,0.16))",
};

const profileShowcaseModalEyebrowStyle: CSSProperties = {
  margin: 0,
  color: "var(--parapost-accent-text)",
  fontSize: "11px",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const profileShowcaseModalTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#ffffff",
  fontSize: "22px",
  fontWeight: 950,
  letterSpacing: "-0.04em",
};

const profileShowcaseModalSubtitleStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#9ca3af",
  fontSize: "13px",
  lineHeight: 1.35,
  fontWeight: 750,
};

const profileShowcaseModalFlowPillsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  marginTop: "10px",
};

const profileShowcaseModalFlowPillStyle: CSSProperties = {
  border: "1px solid var(--parapost-accent-border)",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--parapost-accent-2) 10%, transparent)",
  color: "var(--parapost-accent-readable-text)",
  padding: "5px 8px",
  fontSize: "10px",
  fontWeight: 900,
};

const profileShowcaseModalCloseStyle: CSSProperties = {
  width: "38px",
  height: "38px",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "14px",
  background: "rgba(255,255,255,0.07)",
  color: "#ffffff",
  fontSize: "20px",
  fontWeight: 900,
  cursor: "pointer",
  flex: "0 0 auto",
  boxShadow: "0 12px 24px rgba(0,0,0,0.24)",
};

const profileShowcaseSimpleStudioStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(330px, 0.88fr) minmax(410px, 1.12fr)",
  gap: "24px",
  alignItems: "start",
};

const profileShowcaseSimpleControlsStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: "12px",
};

const profileShowcaseSimpleUploadCardStyle: CSSProperties = {
  width: "100%",
  minHeight: "144px",
  border: "1px dashed var(--parapost-accent-active-border)",
  borderRadius: "24px",
  background: "radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--parapost-accent-2) 20%, transparent), transparent 36%), linear-gradient(180deg, color-mix(in srgb, var(--parapost-accent-2) 11%, transparent), rgba(255,255,255,0.035))",
  color: "#ffffff",
  display: "grid",
  gridTemplateColumns: "58px minmax(0, 1fr)",
  alignItems: "center",
  gap: "16px",
  padding: "20px",
  textAlign: "left",
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 20px 50px rgba(0,0,0,0.24)",
};

const profileShowcaseSimpleUploadCardActiveStyle: CSSProperties = {
  ...profileShowcaseSimpleUploadCardStyle,
  border: "1px dashed rgba(34,211,238,0.70)",
  background: "radial-gradient(circle at 22% 0%, rgba(34,211,238,0.18), transparent 36%), linear-gradient(180deg, color-mix(in srgb, var(--parapost-accent-2) 14%, transparent), rgba(34,211,238,0.055))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 1px rgba(34,211,238,0.18), 0 22px 52px rgba(0,0,0,0.26)",
};

const profileShowcaseSimpleUploadCardSelectedStyle: CSSProperties = {
  ...profileShowcaseSimpleUploadCardStyle,
  border: "1px solid rgba(74,222,128,0.32)",
  background: "radial-gradient(circle at 22% 0%, rgba(74,222,128,0.12), transparent 36%), linear-gradient(180deg, color-mix(in srgb, var(--parapost-accent-2) 10%, transparent), rgba(74,222,128,0.040))",
};

const profileShowcaseSimpleUploadIconStyle: CSSProperties = {
  width: "58px",
  height: "58px",
  borderRadius: "20px",
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg, color-mix(in srgb, var(--parapost-accent-2) 95%, transparent), color-mix(in srgb, var(--parapost-accent-1) 90%, transparent))",
  color: "#ffffff",
  fontSize: "28px",
  fontWeight: 950,
  boxShadow: "0 14px 28px color-mix(in srgb, var(--parapost-accent-1) 30%, transparent)",
};

const profileShowcaseUploadTitleTextStyle: CSSProperties = {
  display: "block",
  color: "#ffffff",
  fontSize: "13px",
  lineHeight: 1.14,
  fontWeight: 950,
  letterSpacing: "-0.01em",
  margin: 0,
};

const profileShowcaseUploadHelpTextStyle: CSSProperties = {
  display: "block",
  color: "rgba(226,232,240,0.74)",
  fontSize: "10px",
  lineHeight: 1.18,
  fontWeight: 800,
  marginTop: "4px",
};

const profileShowcaseSelectedFileStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  margin: "9px 0 12px",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: "13px",
  background: "rgba(255,255,255,0.045)",
  color: "#d1d5db",
  padding: "8px 10px",
  fontSize: "12px",
  fontWeight: 800,
};

const profileShowcaseTinyButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.11)",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.06)",
  color: "#ffffff",
  padding: "7px 10px",
  fontSize: "12px",
  fontWeight: 900,
  cursor: "pointer",
};

const profileShowcaseFieldLabelStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
  color: "#e5e7eb",
  fontSize: "12px",
  fontWeight: 900,
};

const profileShowcaseInputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "13px",
  background: "rgba(0,0,0,0.24)",
  color: "#ffffff",
  padding: "10px 12px",
  outline: "none",
  fontSize: "14px",
  fontFamily: "inherit",
};

const profileShowcaseTextareaStyle: CSSProperties = {
  ...profileShowcaseInputStyle,
  minHeight: "86px",
  lineHeight: 1.35,
  resize: "vertical",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  whiteSpace: "pre-wrap",
};

const profileShowcaseDurationGroupStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  marginTop: "10px",
};

const profileShowcaseDurationTitleStyle: CSSProperties = {
  display: "block",
  color: "#ffffff",
  fontSize: "13px",
};

const profileShowcaseDurationHelpStyle: CSSProperties = {
  margin: "3px 0 0",
  color: "#9ca3af",
  fontSize: "12px",
  lineHeight: 1.35,
};

const profileShowcaseDurationOptionsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
  gap: "8px",
};

const profileShowcaseDurationOptionStyle: CSSProperties = {
  display: "grid",
  gap: "4px",
  minHeight: "72px",
  alignContent: "start",
  textAlign: "left",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: "13px",
  background: "rgba(255,255,255,0.04)",
  color: "#e5e7eb",
  padding: "10px 11px",
  cursor: "pointer",
  fontFamily: "inherit",
  fontWeight: 850,
  minWidth: 0,
};

const profileShowcaseDurationOptionActiveStyle: CSSProperties = {
  ...profileShowcaseDurationOptionStyle,
  border: "1px solid var(--parapost-accent-active-border)",
  background: "linear-gradient(135deg, color-mix(in srgb, var(--parapost-accent-2) 24%, transparent), color-mix(in srgb, var(--parapost-accent-3) 10%, transparent))",
  boxShadow: "0 0 22px color-mix(in srgb, var(--parapost-accent-2) 16%, transparent)",
};

const profileShowcaseDurationOptionLabelTextStyle: CSSProperties = {
  display: "block",
  fontSize: "13px",
  lineHeight: 1.08,
  fontWeight: 900,
  letterSpacing: "-0.01em",
  whiteSpace: "normal",
};

const profileShowcaseDurationOptionHelpTextStyle: CSSProperties = {
  display: "block",
  fontSize: "10px",
  lineHeight: 1.12,
  color: "#9ca3af",
  fontWeight: 800,
};

const profileShowcaseAdvancedDividerStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  gap: "10px",
  margin: "14px 0 10px",
  color: "#8b93a4",
  fontSize: "11px",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const profileShowcaseCustomizeButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: "42px",
  border: "1px solid var(--parapost-accent-border)",
  borderRadius: "14px",
  background: "rgba(255,255,255,0.035)",
  color: "var(--parapost-accent-readable-text)",
  fontSize: "14px",
  fontWeight: 950,
  cursor: "pointer",
  fontFamily: "inherit",
};

const profileShowcaseCustomizeButtonActiveStyle: CSSProperties = {
  ...profileShowcaseCustomizeButtonStyle,
  background: "linear-gradient(135deg, color-mix(in srgb, var(--parapost-accent-2) 24%, transparent), color-mix(in srgb, var(--parapost-accent-3) 10%, transparent))",
  border: "1px solid var(--parapost-accent-active-border)",
  color: "#ffffff",
};

const profileShowcaseCustomizePanelStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
  marginTop: "12px",
  border: "1px solid var(--parapost-accent-border)",
  borderRadius: "20px",
  background: "radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--parapost-accent-2) 10%, transparent), transparent 38%), rgba(0,0,0,0.18)",
  padding: "13px",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035)",
};

const profileShowcaseCustomizeIntroStyle: CSSProperties = {
  display: "grid",
  gap: "4px",
  border: "1px solid var(--parapost-accent-border)",
  borderRadius: "15px",
  background: "linear-gradient(135deg, color-mix(in srgb, var(--parapost-accent-2) 13%, transparent), rgba(37,99,235,0.055))",
  padding: "11px",
  color: "#ffffff",
  fontSize: "13px",
  fontWeight: 900,
};

const profileShowcaseFontGroupStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
};

const profileShowcaseFontSelectStyle: CSSProperties = {
  ...profileShowcaseInputStyle,
  minHeight: "42px",
  background: "rgba(7,10,16,0.98)",
  color: "#ffffff",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: "12px",
  colorScheme: "dark",
};

const profileShowcaseFontPreviewStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: "13px",
  background: "rgba(255,255,255,0.035)",
  color: "#ffffff",
  padding: "10px 12px",
  fontSize: "16px",
  fontWeight: 900,
};

const profileShowcaseVisibilityOptionsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
  gap: "8px",
};

const profileShowcaseVisibilityOptionStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: "14px",
  background: "rgba(255,255,255,0.035)",
  color: "#ffffff",
  padding: "10px",
  display: "grid",
  gridTemplateColumns: "34px minmax(0, 1fr)",
  alignItems: "center",
  gap: "9px",
  textAlign: "left",
  cursor: "pointer",
  fontFamily: "inherit",
  minHeight: "58px",
  minWidth: 0,
};

const profileShowcaseVisibilityOptionActiveStyle: CSSProperties = {
  ...profileShowcaseVisibilityOptionStyle,
  border: "1px solid var(--parapost-accent-active-border)",
  background: "linear-gradient(135deg, color-mix(in srgb, var(--parapost-accent-2) 24%, transparent), rgba(37,99,235,0.11))",
  boxShadow: "0 0 0 1px color-mix(in srgb, var(--parapost-accent-2) 12%, transparent), 0 14px 30px color-mix(in srgb, var(--parapost-accent-1) 18%, transparent)",
};

const profileShowcaseVisibilityIconStyle: CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "13px",
  display: "grid",
  placeItems: "center",
  background: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.16), transparent 28%), color-mix(in srgb, var(--parapost-accent-2) 16%, transparent)",
  border: "1px solid var(--parapost-accent-border)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
  position: "relative",
};

const profileShowcaseVisibilityTextStyle: CSSProperties = {
  display: "grid",
  gap: "2px",
  minWidth: 0,
  overflow: "hidden",
};

const profileShowcasePreviewColumnStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
  minWidth: 0,
  borderLeft: "1px solid rgba(255,255,255,0.085)",
  paddingLeft: "24px",
  alignContent: "start",
  justifyItems: "stretch",
};

const profileShowcasePreviewHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  color: "#9ca3af",
  fontSize: "12px",
  fontWeight: 850,
};

const profileShowcasePreviewPhoneStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  maxWidth: "430px",
  height: "clamp(330px, 42dvh, 460px)",
  minHeight: "330px",
  maxHeight: "460px",
  justifySelf: "center",
  alignSelf: "start",
  borderRadius: "30px",
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.14)",
  background:
    "radial-gradient(circle at 20% 0%, rgba(34,211,238,0.30), transparent 34%), linear-gradient(135deg, rgba(20,184,166,0.78), color-mix(in srgb, var(--parapost-accent-1) 90%, transparent) 52%, color-mix(in srgb, var(--parapost-accent-2) 84%, transparent))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 34px 86px rgba(0,0,0,0.50)",
};

const profileShowcasePreviewCanvasStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(135deg, rgba(20,184,166,0.80), color-mix(in srgb, var(--parapost-accent-3) 66%, transparent) 45%, color-mix(in srgb, var(--parapost-accent-2) 86%, transparent))",
};

const profileShowcasePreviewMediaStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  objectPosition: "center center",
  display: "block",
  backgroundColor: "#05060a",
};

const profileShowcasePreviewOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "block",
  padding: "18px",
  background: "linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.10) 45%, rgba(0,0,0,0.42))",
  touchAction: "none",
  cursor: "grab",
  userSelect: "none",
  WebkitUserSelect: "none",
  contain: "layout paint",
  overflow: "hidden",
};

const profileShowcasePreviewTextStyle: CSSProperties = {
  position: "absolute",
  transform: "translate3d(-50%, -50%, 0)",
  color: "#ffffff",
  fontSize: "28px",
  fontWeight: 950,
  textAlign: "center",
  lineHeight: 1.08,
  textShadow: "0 4px 16px rgba(0,0,0,0.42)",
  pointerEvents: "none",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  maxHeight: "70%",
  overflow: "hidden",
  padding: "0 6px",
  minWidth: "80px",
  boxSizing: "border-box",
  userSelect: "none",
  WebkitUserSelect: "none",
  willChange: "left, top, transform",
  transition: "none",
  contain: "layout paint",
  backfaceVisibility: "hidden",
};

const profileShowcaseVerticalSizeRailStyle: CSSProperties = {
  position: "absolute",
  left: "10px",
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 4,
  height: "176px",
  display: "grid",
  placeItems: "center",
};

const profileShowcaseVerticalSizeSliderStyle: CSSProperties = {
  width: "180px",
  transform: "rotate(-90deg)",
  accentColor: "var(--parapost-accent-2)",
};

const profileShowcaseCenterGuideVerticalStyle: CSSProperties = {
  position: "absolute",
  top: "8%",
  bottom: "8%",
  left: "50%",
  width: "1px",
  transform: "translateX(-50%)",
  background: "repeating-linear-gradient(to bottom, rgba(255,255,255,0.42) 0 5px, transparent 5px 10px)",
  boxShadow: "0 0 12px color-mix(in srgb, var(--parapost-accent-2) 22%, transparent)",
  pointerEvents: "none",
};

const profileShowcaseCenterGuideHorizontalStyle: CSSProperties = {
  position: "absolute",
  left: "8%",
  right: "8%",
  top: "50%",
  height: "1px",
  transform: "translateY(-50%)",
  background: "repeating-linear-gradient(to right, rgba(255,255,255,0.42) 0 5px, transparent 5px 10px)",
  boxShadow: "0 0 12px color-mix(in srgb, var(--parapost-accent-2) 22%, transparent)",
  pointerEvents: "none",
};

const profileShowcaseDragHintStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "10px",
  transform: "translateX(-50%)",
  borderRadius: "999px",
  background: "rgba(0,0,0,0.48)",
  color: "rgba(255,255,255,0.88)",
  padding: "6px 10px",
  fontSize: "10px",
  fontWeight: 900,
  pointerEvents: "none",
  boxShadow: "0 8px 20px rgba(0,0,0,0.26)",
};

const profileShowcasePositionControlsStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: "14px",
  padding: "10px",
  color: "#d1d5db",
  fontSize: "12px",
  fontWeight: 850,
};

const profileShowcasePreviewMetaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
  width: "100%",
  color: "#9ca3af",
  fontSize: "12px",
  fontWeight: 800,
};

const profileShowcaseErrorStyle: CSSProperties = {
  margin: "12px 0 0",
  color: "#fecaca",
  fontSize: "13px",
  fontWeight: 850,
};

const profileShowcaseModalActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
  marginTop: "16px",
  paddingTop: "12px",
  borderTop: "1px solid rgba(255,255,255,0.07)",
  background: "transparent",
  position: "relative",
  zIndex: 1,
};

const profileShowcaseCancelButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.05)",
  color: "#ffffff",
  borderRadius: "12px",
  padding: "11px 13px",
  fontWeight: 900,
  cursor: "pointer",
};

const profileShowcaseCreateButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.13)",
  background: "linear-gradient(135deg, var(--parapost-accent-2), var(--parapost-accent-1) 58%, #2563eb)",
  color: "#ffffff",
  borderRadius: "15px",
  padding: "12px 18px",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 20px 38px color-mix(in srgb, var(--parapost-accent-1) 34%, transparent)",
};

const composerCardStyle: CSSProperties = {
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.105)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.060), rgba(255,255,255,0.032))",
  padding: 16,
  marginBottom: 16,
  boxShadow: "0 16px 34px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.035)",
  overflow: "hidden",
  scrollMarginTop: 96,
};
const composerHeaderStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 14 };
const composerIdentityStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 12, minWidth: 0 };
const composerTitleStyle: CSSProperties = { margin: 0, color: "#fff", fontSize: 17, fontWeight: 950, letterSpacing: "-0.02em" };
const composerSubtitleStyle: CSSProperties = { margin: "3px 0 0", color: "#9ca3af", fontSize: 12.5, lineHeight: 1.35 };
const composerDestinationBadgeStyle: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 30, borderRadius: 999, padding: "0 11px", color: "var(--parapost-accent-readable-text)", fontSize: 11, fontWeight: 950, whiteSpace: "nowrap", background: "var(--parapost-accent-active-bg)", border: "1px solid color-mix(in srgb, var(--parapost-accent-2) 35%, transparent)", boxShadow: "0 10px 24px var(--parapost-accent-active-bg)" };
const composerTopRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: 12, alignItems: "center" };
const composerInputStyle: CSSProperties = {
  width: "100%",
  minHeight: 60,
  maxHeight: 190,
  resize: "none",
  overflowY: "auto",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 18,
  background: "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.032))",
  color: "#fff",
  outline: 0,
  padding: "15px 17px",
  fontSize: 15,
  lineHeight: 1.45,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.030)",
};
const composerImageButtonStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.040)",
  color: "#fff",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  flexShrink: 0,
};
const composerActionGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 9, alignItems: "center", marginTop: 13 };
const composerActionPillStyle: CSSProperties = {
  minHeight: 38,
  borderRadius: 13,
  border: "1px solid rgba(255,255,255,0.085)",
  background: "rgba(255,255,255,0.035)",
  color: "#fff",
  padding: "0 12px",
  fontWeight: 850,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  textDecoration: "none",
  whiteSpace: "nowrap",
  fontSize: 12.5,
  transition: "border-color 160ms ease, background 160ms ease, transform 160ms ease",
};
const composerActionPillActiveStyle: CSSProperties = {
  border: "1px solid color-mix(in srgb, var(--parapost-accent-text) 26%, transparent)",
  background: "color-mix(in srgb, var(--parapost-accent-2) 10%, transparent)",
  boxShadow: "inset 0 -2px 0 var(--parapost-accent-2)",
};
const composerActionDisabledStyle: CSSProperties = { opacity: 0.46, background: "rgba(255,255,255,0.018)", border: "1px dashed rgba(255,255,255,0.11)", cursor: "not-allowed", color: "#9ca3af" };
const composerActionNoteStyle: CSSProperties = { borderRadius: 999, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.045)", color: "#a1a1aa", padding: "2px 6px", fontSize: 10, fontWeight: 900, lineHeight: 1, textTransform: "uppercase", letterSpacing: "0.03em", flexShrink: 0 };
const composerActionIconStyle: CSSProperties = { width: 24, height: 24, borderRadius: 8, display: "grid", placeItems: "center", color: "#fff", fontSize: 13, fontWeight: 950, lineHeight: 1 };
const composerActionToneStyles: Record<"green" | "pink" | "red" | "gold", CSSProperties> = {
  green: { background: "var(--parapost-accent-muted-bg)", color: "var(--parapost-accent-readable-text)" },
  pink: { background: "color-mix(in srgb, var(--parapost-accent-3) 18%, transparent)", color: "var(--parapost-accent-readable-text)" },
  red: { background: "rgba(239,68,68,0.18)", color: "#fca5a5" },
  gold: { background: "var(--parapost-accent-muted-bg)", color: "var(--parapost-accent-readable-text)" },
};
const composerFooterStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 13, flexWrap: "wrap" };
const composerHelperTextStyle: CSSProperties = { color: "#6b7280", fontSize: 11.5, lineHeight: 1.35 };
const publishButtonStyle: CSSProperties = { marginLeft: "auto", minHeight: 35, borderRadius: 14, border: 0, background: "linear-gradient(135deg, #ffffff, var(--parapost-accent-readable-text))", color: "#111827", fontWeight: 900, padding: "0 15px", cursor: "pointer", boxShadow: "0 10px 20px color-mix(in srgb, var(--parapost-accent-2) 18%, transparent)", whiteSpace: "nowrap", fontSize: 12.5 };

const imagePreviewWrapStyle: CSSProperties = {
  width: "min(100%, 560px)",
  margin: "12px auto 0",
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.10)",
  overflow: "hidden",
  background: "rgba(0,0,0,0.22)",
  position: "relative",
};
const imagePreviewStyle: CSSProperties = { width: "100%", maxHeight: 360, objectFit: "cover", display: "block" };
const composerPreviewGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 6,
  padding: 8,
  maxHeight: 292,
  overflow: "hidden",
};
const composerPreviewSingleGridStyle: CSSProperties = {
  gridTemplateColumns: "1fr",
  maxHeight: 260,
};
const composerPreviewTileStyle: CSSProperties = {
  position: "relative",
  minHeight: 132,
  height: 132,
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 16,
  overflow: "hidden",
  padding: 0,
  background: "rgba(255,255,255,0.04)",
  cursor: "pointer",
};
const composerPreviewSingleTileStyle: CSSProperties = {
  minHeight: 246,
  height: 246,
};
const composerPreviewImageStyle: CSSProperties = { width: "100%", height: "100%", minHeight: "100%", objectFit: "cover", display: "block" };
const composerPreviewCounterStyle: CSSProperties = { position: "absolute", right: 10, top: 10, borderRadius: 999, padding: "5px 9px", background: "rgba(0,0,0,0.72)", color: "#fff", fontSize: 12, fontWeight: 950, lineHeight: 1, border: "1px solid rgba(255,255,255,0.16)", boxShadow: "0 8px 18px rgba(0,0,0,0.28)" };
const composerPreviewTypeBadgeStyle: CSSProperties = { position: "absolute", left: 10, top: 10, borderRadius: 999, padding: "5px 9px", background: "var(--parapost-accent-active-bg)", color: "var(--parapost-accent-readable-text)", fontSize: 12, fontWeight: 950, lineHeight: 1, border: "1px solid var(--parapost-accent-active-border)" };
const composerPreviewOverlayStyle: CSSProperties = { position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,0.55)", color: "#ffffff", fontWeight: 950, fontSize: 30 };
const imagePreviewMetaRowStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: 12, flexWrap: "wrap" };
const removeImageButtonStyle: CSSProperties = { border: "1px solid rgba(248,113,113,0.22)", background: "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))", color: "#fca5a5", borderRadius: 999, padding: "8px 12px", fontWeight: 950, cursor: "pointer", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 10px 20px rgba(0,0,0,0.18)" };
const selectedImageNameStyle: CSSProperties = { maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderRadius: 999, padding: "7px 10px", background: "rgba(0,0,0,0.62)", color: "#e5e7eb", fontSize: 12, fontWeight: 850 };

const feedTabsStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  alignItems: "center",
  gap: 4,
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.025))",
  padding: 6,
  margin: "14px 0",
  overflow: "hidden",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.025)",
};

const feedTabStyle: CSSProperties = {
  minWidth: 0,
  width: "100%",
  height: 44,
  border: 0,
  background: "transparent",
  color: "#cbd5e1",
  padding: "0 6px",
  borderRadius: 14,
  cursor: "pointer",
  fontSize: "clamp(12px, 3.15vw, 15px)",
  fontWeight: 760,
  letterSpacing: "-0.02em",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const activeFeedTabStyle: CSSProperties = {
  ...feedTabStyle,
  color: "#fff",
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--parapost-accent-2) 16%, rgba(255,255,255,0.055)), rgba(255,255,255,0.035))",
  boxShadow: "inset 0 -2px 0 var(--parapost-accent-2), 0 8px 18px rgba(0,0,0,0.18)",
  fontWeight: 900,
};

const disabledFeedTabStyle: CSSProperties = {
  ...feedTabStyle,
  color: "rgba(229,231,235,0.42)",
  background: "transparent",
  border: "1px solid transparent",
  cursor: "default",
  opacity: 0.55,
};

const feedStackStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  marginTop: 16,
};
const emptyStateStyle: CSSProperties = { borderRadius: 24, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.045)", padding: 22 };
const feedPulseStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 16,
  alignItems: "center",
  borderRadius: 22,
  border: "1px solid color-mix(in srgb, var(--parapost-accent-2) 18%, transparent)",
  background: "linear-gradient(135deg, var(--parapost-accent-active-bg), rgba(15,23,42,0.72))",
  padding: 16,
  marginBottom: 0,
  overflow: "hidden",
  position: "relative",
  zIndex: 1,
  boxShadow: "0 18px 42px rgba(0,0,0,0.22)",
};
const feedPulseEyebrowStyle: CSSProperties = { color: "var(--parapost-accent-text)", fontSize: 11, fontWeight: 950, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 };
const feedPulseTitleStyle: CSSProperties = { margin: 0, color: "#fff", fontSize: 18, lineHeight: 1.25 };
const feedPulseStatsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(72px, 1fr))", gap: 8 };
const miniFeedStatStyle: CSSProperties = { borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.045)", padding: "10px 12px", textAlign: "center" };
const miniFeedStatValueStyle: CSSProperties = { display: "block", color: "#fff", fontSize: 18, lineHeight: 1.1 };
const miniFeedStatLabelStyle: CSSProperties = { display: "block", color: "#9ca3af", fontSize: 11, marginTop: 4 };

const linkPreviewCardStyle: CSSProperties = {
  marginTop: 13,
  display: "flex",
  gap: 12,
  alignItems: "center",
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.11)",
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.058), rgba(0,0,0,0.26))",
  padding: 10,
  textDecoration: "none",
  color: "#fff",
  boxShadow: "0 12px 28px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.045)",
};
const linkPreviewMediaStyle: CSSProperties = { width: 112, height: 72, borderRadius: 16, overflow: "hidden", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", flexShrink: 0, position: "relative", boxShadow: "0 10px 22px rgba(0,0,0,0.20)" };
const linkPreviewPlayOverlayStyle: CSSProperties = { position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", fontSize: 24, textShadow: "0 6px 18px rgba(0,0,0,0.65)", background: "rgba(0,0,0,0.10)" };
const linkPreviewFaviconWrapStyle: CSSProperties = { width: "100%", height: "100%", display: "grid", placeItems: "center", background: "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.025))" };
const linkPreviewEyebrowStyle: CSSProperties = { color: "#9ca3af", fontSize: 11, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 };
const linkPreviewTitleStyle: CSSProperties = { color: "#fff", fontSize: 15, fontWeight: 950, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const linkPreviewDomainStyle: CSSProperties = { color: "#93c5fd", fontSize: 13, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

const postCardStyle: CSSProperties = {
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.105)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.058), rgba(255,255,255,0.030))",
  padding: 18,
  position: "relative",
  zIndex: 0,
  boxShadow: "0 15px 34px rgba(0,0,0,0.23), inset 0 1px 0 rgba(255,255,255,0.030)",
};
const postHeaderStyle: CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 13 };
const postAuthorStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 12, minWidth: 0 };
const postAuthorNameLineStyle: CSSProperties = { display: "flex", alignItems: "baseline", gap: 5, flexWrap: "wrap", minWidth: 0 };
const postAuthorNameStyle: CSSProperties = { display: "block", color: "#fff", textDecoration: "none", fontWeight: 950, fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const postAuthorActivityTextStyle: CSSProperties = { color: "var(--parapost-accent-readable-text)", fontWeight: 900, fontSize: 16, lineHeight: 1.25 };
const postMetaStyle: CSSProperties = { color: "#a1a1aa", fontSize: 13, marginTop: 3 };
const postContentStyle: CSSProperties = { color: "#f9fafb", lineHeight: 1.56, fontSize: 15.8, whiteSpace: "pre-wrap", margin: "10px 0 0", overflowWrap: "anywhere" };
const postTextLinkStyle: CSSProperties = {
  position: "relative",
  zIndex: 4,
  color: "var(--parapost-accent-text)",
  fontWeight: 900,
  textDecoration: "underline",
  textDecorationColor: "color-mix(in srgb, var(--parapost-accent-2) 62%, transparent)",
  textUnderlineOffset: "3px",
  cursor: "pointer",
  pointerEvents: "auto",
  touchAction: "manipulation",
};
const postImageStyle: CSSProperties = { width: "100%", maxHeight: 680, objectFit: "cover", display: "block", borderRadius: 20, border: "1px solid rgba(255,255,255,0.10)", marginTop: 14, background: "#05070d", boxShadow: "0 18px 38px rgba(0,0,0,0.32)" };
const postImageGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginTop: 14, borderRadius: 22, overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)", background: "rgba(0,0,0,0.26)", boxShadow: "0 18px 38px rgba(0,0,0,0.32)" };
const postImageGridTileStyle: CSSProperties = { position: "relative", minHeight: 230, overflow: "hidden", background: "rgba(255,255,255,0.04)" };
const postImageGridLargeTileStyle: CSSProperties = { gridRow: "span 2", minHeight: 468 };
const postImageGridImageStyle: CSSProperties = { width: "100%", height: "100%", minHeight: "inherit", objectFit: "cover", display: "block", background: "#000" };
const postVideoBadgeStyle: CSSProperties = { position: "absolute", left: 10, top: 10, borderRadius: 999, padding: "6px 9px", background: "rgba(0,0,0,0.70)", color: "#fff", fontSize: 12, fontWeight: 950, border: "1px solid rgba(255,255,255,0.18)" };
const postImageGridOverlayStyle: CSSProperties = { position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,0.58)", color: "#ffffff", fontSize: 42, fontWeight: 950, letterSpacing: "-0.04em" };
const dotsButtonStyle: CSSProperties = { width: 38, height: 38, borderRadius: 999, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" };
const postMenuStyle: CSSProperties = { position: "absolute", right: 0, top: 45, minWidth: 170, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(8,10,18,0.96)", zIndex: 30, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" };
const menuItemStyle: CSSProperties = { width: "100%", textAlign: "left", border: 0, background: "transparent", color: "#fff", padding: "12px 14px", cursor: "pointer", fontWeight: 850 };
const followButtonStyle: CSSProperties = { border: 0, borderRadius: 999, background: "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-3))", color: "#fff", minHeight: 36, padding: "0 14px", fontWeight: 950, cursor: "pointer" };
const followingButtonStyle: CSSProperties = { ...followButtonStyle, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#e5e7eb" };
const editTextareaStyle: CSSProperties = { width: "100%", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 18, background: "rgba(255,255,255,0.04)", color: "#fff", outline: 0, padding: 14, resize: "vertical" };
const softButtonStyle: CSSProperties = { border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, background: "rgba(255,255,255,0.06)", color: "#fff", minHeight: 38, padding: "0 16px", fontWeight: 850, cursor: "pointer" };
const softDangerButtonStyle: CSSProperties = { ...softButtonStyle, color: "#fecaca", border: "1px solid rgba(248,113,113,0.24)" };
const postStatsSummaryStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 9, alignItems: "center", color: "#d1d5db", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.10)", paddingBottom: 11, marginTop: 13 };
const postStatusLinkStyle: CSSProperties = { color: "var(--parapost-accent-readable-text)", fontWeight: 900, textDecoration: "none" };
const postActionsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
  marginTop: 12,
  paddingTop: 10,
  borderTop: "1px solid rgba(255,255,255,0.08)",
  background: "transparent",
};

const dashboardCommentsPanelStyle: CSSProperties = {
  marginTop: "10px",
  borderRadius: "18px",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(5,7,12,0.38)",
  padding: "10px",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035)",
};

const dashboardCommentsHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  padding: "0 0 10px",
  color: "#f8fafc",
  fontSize: "13px",
};

const dashboardCommentsCountStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: "12px",
  fontWeight: 800,
};

const dashboardCommentsCloseButtonStyle: CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.055)",
  color: "#e9d5ff",
  borderRadius: "999px",
  padding: "7px 11px",
  fontFamily: "inherit",
  fontSize: "12px",
  fontWeight: 900,
  lineHeight: 1,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const dashboardCommentComposerStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: "8px",
  alignItems: "end",
  paddingBottom: "10px",
  borderBottom: "1px solid rgba(255,255,255,0.065)",
};

const dashboardCommentTextareaStyle: CSSProperties = {
  width: "100%",
  minHeight: "46px",
  maxHeight: "120px",
  resize: "vertical",
  borderRadius: "17px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(6,8,15,0.78)",
  color: "#fff",
  outline: "none",
  padding: "11px 13px",
  fontFamily: "inherit",
  fontSize: "13px",
  lineHeight: 1.45,
};

const dashboardCommentSubmitButtonStyle: CSSProperties = {
  minHeight: "42px",
  borderRadius: "999px",
  border: "1px solid color-mix(in srgb, var(--parapost-accent-1) 38%, rgba(255,255,255,0.12))",
  background:
    "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2))",
  color: "#fff",
  fontWeight: 900,
  padding: "0 16px",
  boxShadow: "0 10px 22px color-mix(in srgb, var(--parapost-accent-2) 20%, transparent)",
};

const dashboardCommentsEmptyStyle: CSSProperties = {
  padding: "14px 4px 4px",
  color: "#9ca3af",
  fontSize: "13px",
};

const dashboardCommentsListStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  paddingTop: "10px",
  maxHeight: "260px",
  overflowY: "auto",
};

const dashboardCommentRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "9px",
};

const dashboardCommentBubbleStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  borderRadius: "15px",
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(255,255,255,0.06)",
  padding: "9px 10px",
};

const dashboardCommentTopLineStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  marginBottom: "4px",
};

const dashboardCommentAuthorStyle: CSSProperties = {
  color: "#fff",
  fontWeight: 900,
  fontSize: "13px",
  textDecoration: "none",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const dashboardCommentTimeStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: "11px",
  flexShrink: 0,
};

const dashboardCommentTextStyle: CSSProperties = {
  color: "#e5e7eb",
  fontSize: "13px",
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

const dashboardCommentInlineActionButtonStyle: CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  border: "none",
  background: "transparent",
  fontFamily: "inherit",
  fontSize: "12px",
  fontWeight: 800,
  lineHeight: 1,
  minHeight: "16px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
  margin: 0,
  textDecoration: "none",
};

const dashboardCommentDeleteButtonStyle: CSSProperties = {
  ...dashboardCommentInlineActionButtonStyle,
  color: "#ffffff",
};

const dashboardCommentActionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginTop: "7px",
  flexWrap: "wrap",
};

const dashboardCommentLikeCountStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: "12px",
  fontWeight: 800,
};

const dashboardCommentEditActionButtonStyle: CSSProperties = {
  ...dashboardCommentInlineActionButtonStyle,
  color: "var(--parapost-accent-readable-text)",
};

const dashboardCommentEditWrapStyle: CSSProperties = {
  marginTop: "8px",
};

const dashboardCommentEditTextareaStyle: CSSProperties = {
  ...dashboardCommentTextareaStyle,
  minHeight: "72px",
  borderRadius: "14px",
  fontSize: "13px",
  padding: "10px 12px",
};

const dashboardCommentEditActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  marginTop: "8px",
  flexWrap: "wrap",
};

const dashboardCommentEditPrimaryButtonStyle: CSSProperties = {
  ...dashboardCommentSubmitButtonStyle,
  minHeight: "32px",
  padding: "0 12px",
  fontSize: "12px",
};

const dashboardCommentEditSecondaryButtonStyle: CSSProperties = {
  ...dashboardCommentDeleteButtonStyle,
  marginTop: 0,
  color: "#ffffff",
};

const actionButtonStyle: CSSProperties = {
  minHeight: 38,
  borderRadius: "14px",
  border: "1px solid rgba(255,255,255,0.075)",
  background: "rgba(255,255,255,0.035)",
  color: "#e5e7eb",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "none",
  padding: "0 8px",
};
const activeActionButtonStyle: CSSProperties = {
  ...actionButtonStyle,
  color: "#fff",
  background: "linear-gradient(135deg, color-mix(in srgb, var(--parapost-accent-1) 34%, rgba(255,255,255,0.04)), rgba(255,255,255,0.045))",
  border: "1px solid color-mix(in srgb, var(--parapost-accent-1) 34%, rgba(255,255,255,0.08))",
  boxShadow: "0 0 18px color-mix(in srgb, var(--parapost-accent-2) 16%, transparent)",
};


const sharedPostFrameStyle: CSSProperties = {
  marginTop: "14px",
  border: "1px solid var(--parapost-accent-border)",
  borderRadius: "24px",
  padding: "14px",
  background:
    "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.045), rgba(15,23,42,0.50))",
};

const sharedPostOriginalHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  marginBottom: "12px",
};

const sharedPostOriginalContentStyle: CSSProperties = {
  ...postContentStyle,
  marginTop: "10px",
};

const sharedReelFrameStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(118px, 36%) minmax(0, 1fr)",
  gap: 0,
  alignItems: "stretch",
  marginTop: 12,
  border: "1px solid color-mix(in srgb, var(--parapost-accent-2) 24%, rgba(255,255,255,0.08))",
  borderRadius: 20,
  padding: 0,
  background:
    "linear-gradient(135deg, rgba(0,0,0,0.36), color-mix(in srgb, var(--parapost-accent-muted-bg) 72%, rgba(12,15,26,0.92)))",
  overflow: "hidden",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 12px 26px rgba(0,0,0,0.20)",
  textDecoration: "none",
  color: "inherit",
  cursor: "pointer",
};

const sharedReelVideoStyle: CSSProperties = {
  position: "relative",
  display: "block",
  width: "100%",
  minHeight: 150,
  height: "100%",
  borderRadius: 0,
  overflow: "hidden",
  background: "#000",
  textDecoration: "none",
  isolation: "isolate",
};

const sharedReelInlineVideoStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center",
  display: "block",
};

const sharedReelOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  color: "#fff",
  background:
    "linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.42))",
  pointerEvents: "none",
};

const sharedReelPlayButtonStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  paddingLeft: 4,
  background: "rgba(0,0,0,0.42)",
  border: "1px solid rgba(255,255,255,0.18)",
  boxShadow: "0 14px 32px rgba(0,0,0,0.32)",
  fontSize: 24,
  lineHeight: 1,
};

const sharedReelMediaBadgeStyle: CSSProperties = {
  position: "absolute",
  left: 8,
  bottom: 8,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(0,0,0,0.66)",
  color: "#fff",
  padding: "6px 9px",
  fontSize: 11.5,
  fontWeight: 950,
  lineHeight: 1,
  backdropFilter: "blur(10px)",
};

const sharedReelCopyStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 7,
  padding: "14px 15px",
};

const sharedReelTopLineStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  minWidth: 0,
};

const sharedReelBadgeStyle: CSSProperties = {
  display: "inline-flex",
  width: "fit-content",
  borderRadius: 999,
  border: "1px solid color-mix(in srgb, var(--parapost-accent-2) 28%, transparent)",
  background: "var(--parapost-accent-muted-bg)",
  color: "var(--parapost-accent-readable-text)",
  padding: "7px 10px",
  fontSize: 12,
  lineHeight: 1,
  fontWeight: 950,
  whiteSpace: "nowrap",
};

const sharedReelSmallMetaStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: 11.5,
  fontWeight: 800,
  whiteSpace: "nowrap",
};


const sharedReelNetworkLabelStyle: CSSProperties = {
  color: "#aeb4c0",
  fontSize: 12,
  lineHeight: 1.2,
  fontWeight: 850,
  letterSpacing: "0.015em",
};

const sharedReelTitleStyle: CSSProperties = {
  margin: "0",
  color: "#fff",
  fontSize: 18,
  lineHeight: 1.12,
  letterSpacing: "-0.03em",
  fontWeight: 950,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const sharedReelCreatorRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  flexWrap: "wrap",
};

const sharedReelCreatorLinkStyle: CSSProperties = {
  color: "#f5f3ff",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 900,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const sharedCaptionStyle: CSSProperties = {
  color: "#d1d5db",
  lineHeight: 1.4,
  margin: 0,
  fontSize: 12.5,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const watchReelButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "fit-content",
  borderRadius: 999,
  minHeight: 34,
  padding: "0 13px",
  marginTop: 2,
  background: "#fff",
  color: "#0b1020",
  textDecoration: "none",
  fontWeight: 950,
  fontSize: 13,
  boxShadow: "0 12px 24px rgba(0,0,0,0.22)",
};


const railCardStyle: CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.105)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.052), rgba(255,255,255,0.026))",
  padding: 13,
  boxShadow: "0 12px 28px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.028)",
  overflow: "hidden",
};
const railCardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
  paddingBottom: 8,
  borderBottom: "1px solid rgba(255,255,255,0.055)",
};
const railActionStyle: CSSProperties = {
  color: "#f5f3ff",
  fontSize: 12,
  fontWeight: 950,
  textDecoration: "none",
  borderRadius: 999,
  border: "1px solid rgba(168,85,247,0.20)",
  background: "rgba(168,85,247,0.075)",
  padding: "5px 8px",
};
const liveRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, alignItems: "center" };
const liveThumbStyle: CSSProperties = { position: "relative", height: 70, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(248,113,113,0.45)", background: "linear-gradient(135deg, rgba(14,165,233,0.18), rgba(0,0,0,0.82)), radial-gradient(circle at 70% 30%, rgba(255,255,255,0.16), transparent 28%)" };
const liveBadgeStyle: CSSProperties = { position: "absolute", left: 8, top: 8, borderRadius: 7, background: "#ef4444", color: "#fff", fontSize: 11, fontWeight: 950, padding: "4px 6px" };
const railNameStyle: CSSProperties = { display: "block", color: "#fff", fontSize: 14, lineHeight: 1.35 };
const railMetaStyle: CSSProperties = { display: "block", color: "#9ca3af", fontSize: 12, marginTop: 2 };
const trendingRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "28px 1fr",
  gap: 10,
  alignItems: "start",
  padding: "8px 0",
  borderBottom: "1px solid rgba(255,255,255,0.045)",
};
const trendingRankStyle: CSSProperties = {
  color: "#c084fc",
  fontSize: 17,
  fontWeight: 950,
  lineHeight: 1.1,
  textShadow: "0 0 12px rgba(168,85,247,0.32)",
};
const mutedTextStyle: CSSProperties = { color: "#9ca3af", lineHeight: 1.55, margin: 0, fontSize: 13 };
const recentProfileRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: 10,
  alignItems: "center",
  textDecoration: "none",
  borderRadius: 14,
  padding: 9,
  background: "rgba(255,255,255,0.032)",
  border: "1px solid rgba(255,255,255,0.075)",
  transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease",
};
const statRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 14, color: "#d1d5db", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 8 };
const searchResultRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "center", textDecoration: "none", borderRadius: 14, padding: 10, background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.08)" };
const onlineDotStyle: CSSProperties = {
  position: "absolute",
  right: -1,
  bottom: -1,
  width: 12,
  height: 12,
  borderRadius: 999,
  background: "#22c55e",
  border: "2px solid #07090d",
  boxShadow: "0 0 10px rgba(34,197,94,0.65)",
  zIndex: 5,
  pointerEvents: "none",
};

const modalOverlayStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(12px)", display: "grid", placeItems: "start center", padding: "82px 18px 24px" };
const searchModalStyle: CSSProperties = { width: "min(620px, 100%)", borderRadius: 24, border: "1px solid rgba(255,255,255,0.12)", background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(8,10,18,0.98))", boxShadow: "0 28px 80px rgba(0,0,0,0.58)", padding: 18 };
const modalHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 14 };
const modalEyebrowStyle: CSSProperties = { color: "var(--parapost-accent-text)", textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 11, fontWeight: 950, marginBottom: 4 };
const modalCloseButtonStyle: CSSProperties = { width: 40, height: 40, borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 26, cursor: "pointer" };

const mobileHeaderStyle: CSSProperties = { display: "none", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "18px 16px 12px", position: "sticky", top: 0, zIndex: 60, background: "linear-gradient(180deg, rgba(5,7,13,0.985), rgba(5,7,13,0.86))", backdropFilter: "blur(18px)", borderBottom: "1px solid rgba(255,255,255,0.055)" };
const mobileLogoStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, color: "#fff", textDecoration: "none", minWidth: 0, flex: "1 1 auto" };
const mobileLogoCircleStyle: CSSProperties = { width: 50, height: 50, borderRadius: 999, display: "grid", placeItems: "center", border: "2px solid color-mix(in srgb, var(--parapost-accent-3) 72%, transparent)", background: "var(--parapost-accent-active-bg)", boxShadow: "0 0 22px var(--parapost-accent-strong-glow)", fontWeight: 950 };
const mobileHeaderActionsStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 };
const mobileTopIconButtonStyle: CSSProperties = { position: "relative", width: 42, height: 42, borderRadius: 14, color: "#fff", background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.10)", display: "grid", placeItems: "center", textDecoration: "none", cursor: "pointer" };

const mobileBottomNavStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  right: "auto",
  bottom: "max(10px, env(safe-area-inset-bottom))",
  zIndex: 160,
  width: "min(calc(100vw - 22px), 520px)",
  minHeight: 76,
  transform: "translateX(-50%)",
  display: "none",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  alignItems: "center",
  justifyItems: "center",
  gap: 2,
  padding: "8px 8px 10px",
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.105)",
  background: "linear-gradient(180deg, rgba(9,11,20,0.965), rgba(5,7,13,0.975))",
  backdropFilter: "blur(20px)",
  boxShadow: "0 18px 44px rgba(0,0,0,0.56)",
};
const mobileNavItemStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: 56,
  color: "#dbe4f0",
  textDecoration: "none",
  display: "grid",
  gridTemplateRows: "26px auto",
  placeItems: "center",
  alignContent: "center",
  gap: 3,
  fontSize: 10.5,
  lineHeight: 1.05,
  fontWeight: 850,
  textAlign: "center",
  borderRadius: 16,
};
const mobileNavItemActiveStyle: CSSProperties = {
  ...mobileNavItemStyle,
  color: "#ffffff",
  background: "rgba(255,255,255,0.045)",
  boxShadow: "inset 0 -2px 0 var(--parapost-accent-2)",
};
const mobileNavIconSlotStyle: CSSProperties = {
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
};
const mobileNavLabelStyle: CSSProperties = {
  maxWidth: "100%",
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const mobileNavAvatarStyle: CSSProperties = {
  width: 26,
  height: 26,
  display: "block",
  borderRadius: 999,
  objectFit: "cover",
  border: "1.5px solid rgba(255,255,255,0.72)",
  boxShadow: "0 0 0 2px var(--parapost-accent-soft)",
};
const mobileCenterPlusStyle: CSSProperties = {
  width: 58,
  height: 58,
  margin: 0,
  transform: "translateY(-18px)",
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  color: "#0b1020",
  background: "#fff",
  border: "4px solid var(--parapost-accent-1)",
  boxShadow: "0 0 0 4px color-mix(in srgb, var(--parapost-accent-3) 32%, transparent), 0 16px 38px var(--parapost-accent-strong-glow)",
  cursor: "pointer",
  textDecoration: "none",
  padding: 0,
  font: "inherit",
  justifySelf: "center",
};
const mobileNavBadgeStyle: CSSProperties = { position: "absolute", right: -9, top: -8, minWidth: 20, height: 20, borderRadius: 999, display: "grid", placeItems: "center", background: "var(--parapost-accent-1)", color: "#fff", fontSize: 10.5, fontWeight: 950, padding: "0 5px", border: "1px solid rgba(255,255,255,0.26)" };

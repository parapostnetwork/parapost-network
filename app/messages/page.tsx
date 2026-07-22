"use client";
// PARACHAT FLOW POLISH v1 - smoother route feel, cleaner mobile back behavior, and lightweight prefetch for common exits.

import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  Suspense,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_online?: boolean | null;
  last_seen_at?: string | null;
};

type ConversationRow = {
  id: string;
  user_one_id: string | null;
  user_two_id: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ConversationHideRow = {
  conversation_id: string;
  user_id: string;
  hidden_at: string | null;
};

type BlockedUserRow = {
  blocker_id: string;
  blocked_id: string;
};

type AcceptedFriendshipRow = {
  sender_id?: string | null;
  receiver_id?: string | null;
  user_id?: string | null;
  friend_id?: string | null;
  status?: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  created_at: string;
  is_read?: boolean | null;
  message_type?: "text" | "image" | null;
  image_path?: string | null;
  image_mime_type?: string | null;
  image_size_bytes?: number | null;
  image_width?: number | null;
  image_height?: number | null;
  signedImageUrl?: string | null;
};

type ParachatImageDraft = {
  blob: Blob;
  previewUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
};

type ParachatImageViewer = {
  url: string;
  alt: string;
  caption: string;
  senderName: string;
  timeLabel: string;
  isMine: boolean;
};

type ConversationItem = ConversationRow & {
  otherUserId: string;
  otherProfile: ProfileRow | null;
  lastMessage: MessageRow | null;
  unreadCount: number;
  isNewFriend: boolean;
};

function formatMessageTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  const sameYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (sameDay) return "Today";
  if (sameYesterday) return "Yesterday";

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getInitial(profile?: ProfileRow | null) {
  const value = profile?.full_name || profile?.username || "U";
  return value.charAt(0).toUpperCase();
}

function getProfileName(profile?: ProfileRow | null) {
  return profile?.full_name || profile?.username || "Parapost Member";
}

const PARACHAT_ONLINE_TIMEOUT_MS = 3 * 60 * 1000;

const PARACHAT_IMAGE_BUCKET = "parachat-images";
const PARACHAT_MAX_IMAGE_DIMENSION = 1600;
const PARACHAT_TARGET_IMAGE_BYTES = 1_200_000;
const PARACHAT_ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const DIRECT_MESSAGE_SELECT =
  "id, conversation_id, sender_id, body, created_at, is_read, message_type, image_path, image_mime_type, image_size_bytes, image_width, image_height";

function isImageMessage(message?: MessageRow | null) {
  return Boolean(message?.message_type === "image" || message?.image_path);
}

function getConversationPreviewText(conversation: ConversationItem) {
  if (conversation.isNewFriend) return "New friend · Start a Parachat";

  if (isImageMessage(conversation.lastMessage)) {
    const caption = conversation.lastMessage?.body?.trim();
    return caption ? `Photo · ${caption}` : "Photo message";
  }

  return conversation.lastMessage?.body || "No messages yet";
}

function buildParachatImagePath(
  conversationId: string,
  viewerId: string,
  fileName: string
) {
  const cleanBaseName =
    fileName
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || "parachat-image";

  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `${viewerId}/${conversationId}/${Date.now()}-${randomPart}-${cleanBaseName}.jpg`;
}

function loadImageFromUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read this image. Please try another photo."));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not compress this image."));
          return;
        }

        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

async function compressParachatImage(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  if (!PARACHAT_ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Please use a JPG, PNG, or WebP image for Parachat.");
  }

  const originalUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageFromUrl(originalUrl);

    const originalWidth = image.naturalWidth || image.width;
    const originalHeight = image.naturalHeight || image.height;

    if (!originalWidth || !originalHeight) {
      throw new Error("This image could not be prepared.");
    }

    const largestSide = Math.max(originalWidth, originalHeight);
    const scale =
      largestSide > PARACHAT_MAX_IMAGE_DIMENSION
        ? PARACHAT_MAX_IMAGE_DIMENSION / largestSide
        : 1;

    const targetWidth = Math.max(1, Math.round(originalWidth * scale));
    const targetHeight = Math.max(1, Math.round(originalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("This browser could not prepare the image.");
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    let quality = 0.84;
    let blob = await canvasToBlob(canvas, "image/jpeg", quality);

    while (blob.size > PARACHAT_TARGET_IMAGE_BYTES && quality > 0.58) {
      quality -= 0.08;
      blob = await canvasToBlob(canvas, "image/jpeg", quality);
    }

    return {
      blob,
      fileName: `${file.name.replace(/\.[^.]+$/i, "") || "parachat-image"}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: blob.size,
      width: targetWidth,
      height: targetHeight,
    };
  } finally {
    URL.revokeObjectURL(originalUrl);
  }
}

function waitForParachatImageUrlRetry(delayMs: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  });
}

const parachatSignedImageUrlCache = new Map<
  string,
  { url: string; expiresAt: number }
>();

async function attachSignedImageUrlToMessage(message: MessageRow) {
  if (!message.image_path) return message;
  if (message.signedImageUrl) return message;

  const cached = parachatSignedImageUrlCache.get(message.image_path);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return { ...message, signedImageUrl: cached.url };
  }

  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data, error } = await supabase.storage
      .from(PARACHAT_IMAGE_BUCKET)
      .createSignedUrl(message.image_path, 60 * 60);

    if (!error && data?.signedUrl) {
      parachatSignedImageUrlCache.set(message.image_path, {
        url: data.signedUrl,
        expiresAt: Date.now() + 55 * 60 * 1000,
      });

      return { ...message, signedImageUrl: data.signedUrl };
    }

    if (attempt < maxAttempts) {
      await waitForParachatImageUrlRetry(250 * attempt);
      continue;
    }

    console.warn("Could not create Parachat image URL:", error?.message);
  }

  return { ...message, signedImageUrl: null };
}

async function attachSignedImageUrls(messages: MessageRow[]) {
  return Promise.all(messages.map((message) => attachSignedImageUrlToMessage(message)));
}

function isRecentParachatOnlineTimestamp(value?: string | null) {
  if (!value) return false;

  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;

  return Date.now() - time <= PARACHAT_ONLINE_TIMEOUT_MS;
}

function isParachatProfileActuallyOnline(profile?: ProfileRow | null) {
  return Boolean(profile?.is_online && isRecentParachatOnlineTimestamp(profile.last_seen_at));
}

function getConversationOtherUserId(conversation: ConversationRow, viewerId: string) {
  return conversation.user_one_id === viewerId
    ? conversation.user_two_id || ""
    : conversation.user_one_id || "";
}

function buildAcceptedFriendIdSet(
  rows: AcceptedFriendshipRow[] | null | undefined,
  viewerId: string
) {
  const friendIds = new Set<string>();

  for (const row of rows || []) {
    const status = (row.status || "accepted").toLowerCase();
    if (status !== "accepted") continue;

    const requestOtherId =
      row.sender_id === viewerId
        ? row.receiver_id
        : row.receiver_id === viewerId
          ? row.sender_id
          : "";

    const directFriendOtherId =
      row.user_id === viewerId
        ? row.friend_id
        : row.friend_id === viewerId
          ? row.user_id
          : "";

    const otherId = requestOtherId || directFriendOtherId || "";
    if (otherId && otherId !== viewerId) friendIds.add(otherId);
  }

  return friendIds;
}

function buildBlockedUserIdSet(
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

  return blockedIds;
}

async function checkParachatBlockedBetween(viewerId: string, otherUserId: string) {
  if (!viewerId || !otherUserId) return false;

  const { data, error } = await supabase.rpc("is_blocked_between", {
    user_a: viewerId,
    user_b: otherUserId,
  });

  if (error) {
    throw new Error(error.message || "Could not check this Parachat block status.");
  }

  return Boolean(data);
}

async function updateParachatPresence(viewerId: string, isOnline: boolean) {
  if (!viewerId) return;

  try {
    await supabase
      .from("profiles")
      .update({ is_online: isOnline, last_seen_at: new Date().toISOString() })
      .eq("id", viewerId);
  } catch {
    // Presence updates should never interrupt Parachat.
  }
}

async function ensureParachatConversationsForFriends(viewerId: string, friendIds: string[]) {
  const safeFriendIds = [...new Set(friendIds.filter((friendId) => friendId && friendId !== viewerId))];

  if (safeFriendIds.length === 0) return;

  const results = await Promise.allSettled(
    safeFriendIds.map((friendId) =>
      supabase.rpc("get_or_create_direct_conversation", {
        other_user_id: friendId,
      })
    )
  );

  const failedCount = results.filter((result) => {
    if (result.status === "rejected") return true;
    return Boolean(result.value.error);
  }).length;

  if (failedCount > 0) {
    console.warn(`Could not prepare ${failedCount} Parachat friend conversation${failedCount === 1 ? "" : "s"}.`);
  }
}


async function checkAcceptedParachatFriend(viewerId: string, otherUserId: string) {
  if (!viewerId || !otherUserId || viewerId === otherUserId) return false;

  const [friendRequestResult, directFriendsResult] = await Promise.all([
    supabase
      .from("friend_requests")
      .select("id")
      .eq("status", "accepted")
      .or(
        `and(sender_id.eq.${viewerId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${viewerId})`
      )
      .limit(1),
    supabase
      .from("friends")
      .select("user_id, friend_id")
      .or(
        `and(user_id.eq.${viewerId},friend_id.eq.${otherUserId}),and(user_id.eq.${otherUserId},friend_id.eq.${viewerId})`
      )
      .limit(1),
  ]);

  if (!friendRequestResult.error && (friendRequestResult.data || []).length > 0) return true;
  if (!directFriendsResult.error && (directFriendsResult.data || []).length > 0) return true;

  if (friendRequestResult.error) {
    console.warn("Parachat accepted friend request check warning:", friendRequestResult.error.message);
  }

  if (directFriendsResult.error) {
    console.warn("Parachat accepted friends table check warning:", directFriendsResult.error.message);
  }

  return false;
}

function extractParachatConversationId(value: unknown) {
  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    const first = value[0] as unknown;

    if (typeof first === "string") return first;

    if (first && typeof first === "object" && "id" in first) {
      return String((first as { id?: unknown }).id || "");
    }

    return "";
  }

  if (value && typeof value === "object" && "id" in value) {
    return String((value as { id?: unknown }).id || "");
  }

  return "";
}

async function resolveParachatConversationId(otherUserId: string) {
  if (!otherUserId) {
    throw new Error("This Parachat could not find the other user.");
  }

  const { data, error } = await supabase.rpc("get_or_create_direct_conversation", {
    other_user_id: otherUserId,
  });

  if (error) {
    throw new Error(getParachatErrorMessage(error.message || "Could not prepare this Parachat."));
  }

  const conversationId = extractParachatConversationId(data);

  if (!conversationId) {
    throw new Error("This Parachat could not prepare a valid conversation.");
  }

  return conversationId;
}

async function ensureParachatParticipantRow(conversationId: string, viewerId: string) {
  if (!conversationId || !viewerId) return;

  const { data: existingParticipant, error: existingParticipantError } = await supabase
    .from("direct_conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", viewerId)
    .maybeSingle();

  if (existingParticipantError) {
    console.warn("Parachat participant check warning:", existingParticipantError.message);
    return;
  }

  if (existingParticipant?.conversation_id) return;

  const { error: insertParticipantError } = await supabase
    .from("direct_conversation_participants")
    .insert({
      conversation_id: conversationId,
      user_id: viewerId,
    });

  if (
    insertParticipantError &&
    !insertParticipantError.message.toLowerCase().includes("duplicate")
  ) {
    console.warn("Parachat participant repair warning:", insertParticipantError.message);
  }
}


function updateConversationUrl(conversationId: string) {
  if (typeof window === "undefined" || !conversationId) return;
  const nextUrl = `/messages?conversation=${conversationId}`;
  window.history.replaceState(null, "", nextUrl);
}

function clearConversationUrl() {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", "/messages");
}

function getParachatErrorMessage(message?: string | null) {
  const cleanMessage = message || "";

  if (
    cleanMessage.includes("friends_only_parachat") ||
    cleanMessage.toLowerCase().includes("row-level security") ||
    cleanMessage.toLowerCase().includes("violates row-level security")
  ) {
    return "Parachat is only available between accepted friends.";
  }

  return cleanMessage || "Parachat needs attention. Please try again.";
}

const PARACHAT_GROUPED_NOTIFICATION_PREFIX = "parachat_group_count:";

function getParachatGroupedNotificationCount(message?: string | null) {
  const match = (message || "").match(/parachat_group_count:(\d+)/i);
  if (!match) return 0;

  const count = Number(match[1]);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

async function createParachatNotification({
  recipientUserId,
  senderUserId,
  isPhotoMessage,
}: {
  recipientUserId: string;
  senderUserId: string;
  isPhotoMessage: boolean;
}) {
  if (!recipientUserId || !senderUserId || recipientUserId === senderUserId) return;

  const nextType = isPhotoMessage ? "parachat_photo" : "parachat_message";
  const fallbackInsert = async () => {
    const { error: fallbackError } = await supabase.from("notifications").insert({
      user_id: recipientUserId,
      actor_id: senderUserId,
      type: nextType,
      post_id: null,
      comment_id: null,
      friend_request_id: null,
      message: `${PARACHAT_GROUPED_NOTIFICATION_PREFIX}1`,
      is_read: false,
    });

    if (fallbackError) {
      console.warn("Parachat notification warning:", fallbackError.message);
    }
  };

  try {
    const { data: existingRows, error: existingError } = await supabase
      .from("notifications")
      .select("id, type, message, created_at")
      .eq("user_id", recipientUserId)
      .eq("actor_id", senderUserId)
      .in("type", ["parachat_message", "parachat_photo"])
      .eq("is_read", false)
      .order("created_at", { ascending: false });

    if (existingError) {
      await fallbackInsert();
      return;
    }

    const rows = ((existingRows || []) as Array<{
      id: string;
      type: string | null;
      message: string | null;
      created_at: string | null;
    }>).filter((row) => row.id);

    if (rows.length === 0) {
      await fallbackInsert();
      return;
    }

    const nextCount =
      rows.reduce((total, row) => {
        const storedCount = getParachatGroupedNotificationCount(row.message);
        return total + Math.max(1, storedCount);
      }, 0) + 1;

    const primaryNotification = rows[0];

    const { error: updateError } = await supabase
      .from("notifications")
      .update({
        type: nextType,
        message: `${PARACHAT_GROUPED_NOTIFICATION_PREFIX}${nextCount}`,
        is_read: false,
        created_at: new Date().toISOString(),
      })
      .eq("id", primaryNotification.id);

    if (updateError) {
      await fallbackInsert();
      return;
    }

    const duplicateIds = rows.slice(1).map((row) => row.id).filter(Boolean);

    if (duplicateIds.length > 0) {
      const { error: deleteDuplicatesError } = await supabase
        .from("notifications")
        .delete()
        .in("id", duplicateIds);

      if (deleteDuplicatesError) {
        console.warn("Parachat duplicate notification cleanup warning:", deleteDuplicatesError.message);
      }
    }
  } catch (error) {
    console.warn(
      "Parachat grouped notification warning:",
      error instanceof Error ? error.message : String(error)
    );

    await fallbackInsert();
  }
}

function MicrophoneIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 14.6C14.21 14.6 16 12.81 16 10.6V6C16 3.79 14.21 2 12 2C9.79 2 8 3.79 8 6V10.6C8 12.81 9.79 14.6 12 14.6Z"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 10.6C5.5 14.19 8.41 17.1 12 17.1C15.59 17.1 18.5 14.19 18.5 10.6"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 17.1V21"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ParachatLoadingFallback() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background:
          "radial-gradient(circle at 20% 0%, rgba(168,85,247,0.24), transparent 34%), radial-gradient(circle at 80% 18%, rgba(124,58,237,0.18), transparent 30%), linear-gradient(180deg, #05050b 0%, #07090d 52%, #05050b 100%)",
        color: "#ffffff",
      }}
      aria-busy="true"
      aria-live="polite"
    >
      <div
        style={{
          width: "min(420px, 100%)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "28px",
          padding: "26px",
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(15,23,42,0.72))",
          boxShadow: "0 24px 70px rgba(0,0,0,0.42)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: "58px",
            height: "58px",
            margin: "0 auto 16px",
            borderRadius: "18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #a855f7, #7c3aed, #d946ef)",
            boxShadow: "0 16px 34px rgba(168,85,247,0.32)",
            fontSize: "24px",
            fontWeight: 900,
            letterSpacing: "-0.08em",
          }}
        >
          P
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: "24px",
            fontWeight: 900,
            letterSpacing: "-0.04em",
          }}
        >
          Loading Parachat
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            color: "#c4b5fd",
            fontSize: "14px",
            fontWeight: 700,
          }}
        >
          Opening your messages...
        </p>
      </div>
    </main>
  );
}

export default function MessagesPageWrapper() {
  return (
    <Suspense fallback={<ParachatLoadingFallback />}>
      <MessagesPage />
    </Suspense>
  );
}

function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedConversationFromUrl = searchParams.get("conversation") || "";
  const selectedUserFromUrl = searchParams.get("user") || "";

  useEffect(() => {
    router.prefetch("/dashboard");
    router.prefetch("/notifications");
    router.prefetch("/friends");
    router.prefetch("/settings");
  }, [router]);

  const [viewerId, setViewerId] = useState("");
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [acceptedFriendIds, setAcceptedFriendIds] = useState<string[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [activeConversationId, setActiveConversationId] = useState(selectedConversationFromUrl);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [messageText, setMessageText] = useState("");
  const [searchText, setSearchText] = useState("");
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [openConversationMenuId, setOpenConversationMenuId] = useState<string | null>(null);
  const [conversationMenuAnchor, setConversationMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [conversationDeleteTarget, setConversationDeleteTarget] = useState<ConversationItem | null>(null);
  const [mobileChatOpen, setMobileChatOpen] = useState(!!selectedConversationFromUrl);
  const [selectedImage, setSelectedImage] = useState<ParachatImageDraft | null>(null);
  const [imageError, setImageError] = useState("");
  const [compressingImage, setCompressingImage] = useState(false);
  const [imageViewer, setImageViewer] = useState<ParachatImageViewer | null>(null);
  const [openMessageMenuId, setOpenMessageMenuId] = useState<string | null>(null);
  const [messageMenuAnchor, setMessageMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [sharingMessage, setSharingMessage] = useState<MessageRow | null>(null);
  const [sharingMessageId, setSharingMessageId] = useState<string | null>(null);
  const [voiceComingSoonOpen, setVoiceComingSoonOpen] = useState(false);

  const messagesAreaRef = useRef<HTMLElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedImagePreviewUrlRef = useRef<string | null>(null);
  const activeConversationIdRef = useRef(selectedConversationFromUrl);
  const conversationsRef = useRef<ConversationItem[]>([]);
  const messagesRef = useRef<MessageRow[]>([]);
  const viewportFrameRef = useRef<number | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const delayedScrollTimerRef = useRef<number | null>(null);
  const inboxRefreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    selectedImagePreviewUrlRef.current = selectedImage?.previewUrl || null;
  }, [selectedImage?.previewUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const commitViewportWidth = () => {
      viewportFrameRef.current = null;
      setViewportWidth(window.innerWidth);
    };

    const scheduleViewportWidth = () => {
      if (viewportFrameRef.current !== null) return;
      viewportFrameRef.current = window.requestAnimationFrame(commitViewportWidth);
    };

    commitViewportWidth();
    window.addEventListener("resize", scheduleViewportWidth, { passive: true });
    window.addEventListener("orientationchange", scheduleViewportWidth);

    return () => {
      window.removeEventListener("resize", scheduleViewportWidth);
      window.removeEventListener("orientationchange", scheduleViewportWidth);

      if (viewportFrameRef.current !== null) {
        window.cancelAnimationFrame(viewportFrameRef.current);
        viewportFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (selectedImagePreviewUrlRef.current) {
        URL.revokeObjectURL(selectedImagePreviewUrlRef.current);
      }

      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }

      if (delayedScrollTimerRef.current) {
        window.clearTimeout(delayedScrollTimerRef.current);
      }

      if (inboxRefreshTimerRef.current) {
        window.clearTimeout(inboxRefreshTimerRef.current);
      }
    };
  }, []);

  const clearSelectedImage = useCallback(() => {
    setSelectedImage((currentImage) => {
      if (currentImage?.previewUrl) {
        URL.revokeObjectURL(currentImage.previewUrl);
      }

      return null;
    });

    setImageError("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);


  const activeConversation = useMemo(() => {
    return conversations.find((conversation) => conversation.id === activeConversationId) || null;
  }, [conversations, activeConversationId]);

  const handleOpenImageViewer = useCallback(
    (message: MessageRow, isMine: boolean) => {
      if (!message.signedImageUrl) return;

      setImageViewer({
        url: message.signedImageUrl,
        alt: message.body?.trim() || "Parachat photo",
        caption: message.body?.trim() || "",
        senderName: isMine
          ? "You"
          : activeConversation?.otherProfile
            ? getProfileName(activeConversation.otherProfile)
            : "Parapost Member",
        timeLabel: formatMessageTime(message.created_at),
        isMine,
      });
    },
    [activeConversation?.otherProfile]
  );

  const handleCloseImageViewer = useCallback(() => {
    setImageViewer(null);
  }, []);

  useEffect(() => {
    if (!imageViewer) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setImageViewer(null);
      }
    };

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [imageViewer]);

  const activeConversationIsAcceptedFriend = useMemo(() => {
    return Boolean(
      activeConversation?.otherUserId && acceptedFriendIds.includes(activeConversation.otherUserId)
    );
  }, [acceptedFriendIds, activeConversation?.otherUserId]);

  const activeConversationIsBlocked = useMemo(() => {
    return Boolean(
      activeConversation?.otherUserId && blockedUserIds.includes(activeConversation.otherUserId)
    );
  }, [activeConversation?.otherUserId, blockedUserIds]);

  const totalUnreadCount = useMemo(() => {
    return conversations.reduce((total, conversation) => total + conversation.unreadCount, 0);
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    const term = searchText.trim().toLowerCase();

    if (!term) return conversations;

    return conversations.filter((conversation) => {
      const profile = conversation.otherProfile;
      const name = getProfileName(profile).toLowerCase();
      const username = profile?.username?.toLowerCase() || "";
      const lastMessage = getConversationPreviewText(conversation).toLowerCase();
      const newFriendLabel = conversation.isNewFriend ? "new friend start parachat" : "";

      return (
        name.includes(term) ||
        username.includes(term) ||
        lastMessage.includes(term) ||
        newFriendLabel.includes(term)
      );
    });
  }, [conversations, searchText]);

  const shareableConversations = useMemo(() => {
    return conversations.filter(
      (conversation) =>
        conversation.id !== activeConversationId &&
        Boolean(conversation.otherUserId && acceptedFriendIds.includes(conversation.otherUserId)) &&
        !blockedUserIds.includes(conversation.otherUserId)
    );
  }, [acceptedFriendIds, activeConversationId, blockedUserIds, conversations]);

  const groupedMessages = useMemo(() => {
    const groups: { label: string; items: MessageRow[] }[] = [];

    for (const message of messages) {
      const label = formatDateLabel(message.created_at);
      const lastGroup = groups[groups.length - 1];

      if (!lastGroup || lastGroup.label !== label) {
        groups.push({ label, items: [message] });
      } else {
        lastGroup.items.push(message);
      }
    }

    return groups;
  }, [messages]);

  const openConversationMenuConversation = useMemo(() => {
    if (!openConversationMenuId) return null;
    return conversations.find((conversation) => conversation.id === openConversationMenuId) || null;
  }, [conversations, openConversationMenuId]);

  const conversationOptionsUsesBottomSheet = viewportWidth <= 1024;

  const closeConversationOptions = useCallback(() => {
    setOpenConversationMenuId(null);
    setConversationMenuAnchor(null);
  }, []);

  const getDesktopConversationMenuPosition = useCallback((button: HTMLElement) => {
    if (typeof window === "undefined") return { top: 80, left: 16 };

    const rect = button.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = 220;
    const edgePadding = 12;

    const preferredTop = rect.bottom + 8;
    const fallbackTop = rect.top - menuHeight - 8;
    const top =
      preferredTop + menuHeight + edgePadding <= window.innerHeight
        ? preferredTop
        : Math.max(edgePadding, fallbackTop);

    const left = Math.min(
      window.innerWidth - menuWidth - edgePadding,
      Math.max(edgePadding, rect.right - menuWidth)
    );

    return { top, left };
  }, []);

  const openMessageMenuMessage = useMemo(() => {
    if (!openMessageMenuId) return null;
    return messages.find((message) => message.id === openMessageMenuId) || null;
  }, [messages, openMessageMenuId]);

  const openMessageMenuIsMine = Boolean(
    openMessageMenuMessage && openMessageMenuMessage.sender_id === viewerId
  );

  const openMessageMenuIsSaving = Boolean(
    openMessageMenuMessage && savingMessageId === openMessageMenuMessage.id
  );

  const openMessageMenuIsDeleting = Boolean(
    openMessageMenuMessage && deletingMessageId === openMessageMenuMessage.id
  );

  const openMessageMenuIsSharing = Boolean(
    openMessageMenuMessage && sharingMessageId === openMessageMenuMessage.id
  );

  const messageOptionsUsesBottomSheet = viewportWidth <= 1024;

  const closeMessageOptions = useCallback(() => {
    setOpenMessageMenuId(null);
    setMessageMenuAnchor(null);
  }, []);

  const getDesktopMessageMenuPosition = useCallback((button: HTMLElement) => {
    if (typeof window === "undefined") return { top: 80, left: 16 };

    const rect = button.getBoundingClientRect();
    const menuWidth = 210;
    const edgePadding = 12;
    const top = Math.min(window.innerHeight - 220, Math.max(edgePadding, rect.bottom + 8));
    const left = Math.min(
      window.innerWidth - menuWidth - edgePadding,
      Math.max(edgePadding, rect.right - menuWidth)
    );

    return { top, left };
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (typeof window === "undefined") return;

    const scrollNow = () => {
      scrollFrameRef.current = null;
      const messagesArea = messagesAreaRef.current;

      if (messagesArea) {
        messagesArea.scrollTo({
          top: messagesArea.scrollHeight,
          behavior,
        });
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
      }
    };

    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }
    scrollFrameRef.current = window.requestAnimationFrame(scrollNow);

    if (delayedScrollTimerRef.current) {
      window.clearTimeout(delayedScrollTimerRef.current);
    }
    delayedScrollTimerRef.current = window.setTimeout(() => {
      delayedScrollTimerRef.current = null;
      scrollNow();
    }, 220);
  }, []);

  const markConversationRead = useCallback(
    async (conversationId: string, currentViewerId: string) => {
      if (!conversationId || !currentViewerId) return;

      const { error } = await supabase
        .from("direct_messages")
        .update({ is_read: true })
        .eq("conversation_id", conversationId)
        .neq("sender_id", currentViewerId)
        .eq("is_read", false);

      if (error) {
        console.warn("Mark read warning:", error.message);
        return;
      }

      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, unreadCount: 0 }
            : conversation
        )
      );

      const conversation = conversationsRef.current.find((item) => item.id === conversationId);
      const otherUserId = conversation?.otherUserId || "";

      if (otherUserId) {
        const { error: notificationReadError } = await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", currentViewerId)
          .eq("actor_id", otherUserId)
          .in("type", ["parachat_message", "parachat_photo"])
          .eq("is_read", false);

        if (notificationReadError) {
          console.warn("Parachat notification read warning:", notificationReadError.message);
        }
      }
    },
    []
  );

  const loadInbox = useCallback(async () => {
    setLoadingInbox(true);
    setErrorMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.push("/");
      return;
    }

    setViewerId(user.id);

    const [friendRequestResult, directFriendsResult] = await Promise.all([
      supabase
        .from("friend_requests")
        .select("sender_id, receiver_id, status")
        .eq("status", "accepted")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`),
      supabase
       .from("friends")
       .select("user_id, friend_id")
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`),
    ]);

    if (friendRequestResult.error && directFriendsResult.error) {
      setErrorMessage(
        getParachatErrorMessage(
          friendRequestResult.error.message ||
            directFriendsResult.error.message ||
            "Could not verify your friends list for Parachat."
        )
      );
      setAcceptedFriendIds([]);
      setConversations([]);
      setActiveConversationId("");
      activeConversationIdRef.current = "";
      setMessages([]);
      setMobileChatOpen(false);
      clearConversationUrl();
      setLoadingInbox(false);
      return;
    }

    if (friendRequestResult.error) {
      console.warn("Parachat friend_requests lookup warning:", friendRequestResult.error.message);
    }

    if (directFriendsResult.error) {
      console.warn("Parachat friends table lookup warning:", directFriendsResult.error.message);
    }

    const acceptedFriendRows: AcceptedFriendshipRow[] = [
      ...(((friendRequestResult.data as AcceptedFriendshipRow[]) || [])),
      ...(((directFriendsResult.data as AcceptedFriendshipRow[]) || [])),
    ];

    const acceptedFriendIdSet = buildAcceptedFriendIdSet(acceptedFriendRows, user.id);
    const nextAcceptedFriendIds = Array.from(acceptedFriendIdSet);
    setAcceptedFriendIds(nextAcceptedFriendIds);

    const { data: blockRows, error: blockError } = await supabase
      .from("blocked_users")
      .select("blocker_id, blocked_id")
      .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);

    if (blockError) {
      console.warn("Parachat block-list warning:", blockError.message);
      setBlockedUserIds([]);
    } else {
      setBlockedUserIds(Array.from(buildBlockedUserIdSet((blockRows as BlockedUserRow[]) || [], user.id)));
    }

    if (nextAcceptedFriendIds.length === 0) {
      setConversations([]);
      setActiveConversationId("");
      activeConversationIdRef.current = "";
      setMessages([]);
      setMobileChatOpen(false);
      clearConversationUrl();
      setLoadingInbox(false);
      return;
    }

    // Prepare/reconcile Parachat rows for every accepted friend, not only friends
    // that appear to be missing. This repairs older conversations that exist
    // but are missing participant rows, which can cause RLS to block messages.
    await ensureParachatConversationsForFriends(user.id, nextAcceptedFriendIds);

    const { data: initialConversationData, error: conversationError } = await supabase
      .from("direct_conversations")
      .select("id, user_one_id, user_two_id, created_at, updated_at")
      .or(`user_one_id.eq.${user.id},user_two_id.eq.${user.id}`)
      .order("updated_at", { ascending: false });

    let conversationData = initialConversationData;

    if (conversationError) {
      setErrorMessage(getParachatErrorMessage(conversationError.message || "Could not load conversations."));
      setLoadingInbox(false);
      return;
    }

    let allRawConversations = ((conversationData as ConversationRow[]) || []).filter(Boolean);

    const existingConversationFriendIds = new Set(
      allRawConversations
        .map((conversation) => getConversationOtherUserId(conversation, user.id))
        .filter(Boolean)
    );

    const missingFriendIds = nextAcceptedFriendIds.filter(
      (friendId) => !existingConversationFriendIds.has(friendId)
    );

    if (missingFriendIds.length > 0) {
      await ensureParachatConversationsForFriends(user.id, missingFriendIds);

      const refreshed = await supabase
        .from("direct_conversations")
        .select("id, user_one_id, user_two_id, created_at, updated_at")
        .or(`user_one_id.eq.${user.id},user_two_id.eq.${user.id}`)
        .order("updated_at", { ascending: false });

      if (refreshed.error) {
        setErrorMessage(getParachatErrorMessage(refreshed.error.message || "Could not refresh Parachat conversations."));
        setLoadingInbox(false);
        return;
      }

      conversationData = refreshed.data;
      allRawConversations = ((conversationData as ConversationRow[]) || []).filter(Boolean);
    }

    const { data: hiddenConversationRows, error: hiddenConversationError } = await supabase
      .from("direct_conversation_hides")
      .select("conversation_id, user_id, hidden_at")
      .eq("user_id", user.id);

    if (hiddenConversationError) {
      console.warn("Hidden conversation warning:", hiddenConversationError.message);
    }

    const hiddenMap = new Map(
      ((hiddenConversationRows as ConversationHideRow[]) || [])
        .filter((row) => row.conversation_id)
        .map((row) => [row.conversation_id, row.hidden_at || ""])
    );

    const visibleConversations = allRawConversations.filter((conversation) => {
      const hiddenAt = hiddenMap.get(conversation.id);
      if (!hiddenAt) return true;

      const conversationTime = new Date(
        conversation.updated_at || conversation.created_at || 0
      ).getTime();
      const hiddenTime = new Date(hiddenAt).getTime();

      if (Number.isNaN(conversationTime) || Number.isNaN(hiddenTime)) return false;

      // If someone sends a newer message after the user hid the chat,
      // the conversation can appear again naturally.
      return conversationTime > hiddenTime;
    });

    const rawConversations = visibleConversations.filter((conversation) => {
      const otherUserId = getConversationOtherUserId(conversation, user.id);
      return Boolean(otherUserId && acceptedFriendIdSet.has(otherUserId));
    });

    if (rawConversations.length === 0) {
      setConversations([]);
      setActiveConversationId("");
      activeConversationIdRef.current = "";
      setMessages([]);
      setMobileChatOpen(false);
      clearConversationUrl();
      setLoadingInbox(false);
      return;
    }

    const otherUserIds = [
      ...new Set(
        rawConversations
          .map((conversation) => getConversationOtherUserId(conversation, user.id))
          .filter(Boolean)
      ),
    ];

    const conversationIds = rawConversations.map((conversation) => conversation.id);

    const [{ data: profileData }, { data: messageData, error: messagesError }] =
      await Promise.all([
        otherUserIds.length > 0
          ? supabase
              .from("profiles")
              .select("id, username, full_name, avatar_url, is_online, last_seen_at")
              .in("id", otherUserIds)
          : Promise.resolve({ data: [] }),
        supabase
          .from("direct_messages")
          .select(DIRECT_MESSAGE_SELECT)
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: false }),
      ]);

    if (messagesError) {
      setErrorMessage(getParachatErrorMessage(messagesError.message || "Could not load messages."));
      setLoadingInbox(false);
      return;
    }

    const profileMap = new Map(
      ((profileData as ProfileRow[]) || []).map((profile) => [profile.id, profile])
    );

    const allMessages = ((messageData as MessageRow[]) || []).filter(Boolean);
    const lastMessageByConversation = new Map<string, MessageRow>();
    const unreadCountByConversation = new Map<string, number>();

    for (const message of allMessages) {
      const currentLast = lastMessageByConversation.get(message.conversation_id);
      if (
        !currentLast ||
        new Date(message.created_at).getTime() > new Date(currentLast.created_at).getTime()
      ) {
        lastMessageByConversation.set(message.conversation_id, message);
      }

      if (message.sender_id !== user.id && message.is_read === false) {
        unreadCountByConversation.set(
          message.conversation_id,
          (unreadCountByConversation.get(message.conversation_id) || 0) + 1
        );
      }
    }

    const nextItems: ConversationItem[] = rawConversations
      .map((conversation) => {
        const otherUserId = getConversationOtherUserId(conversation, user.id);
        const lastMessage = lastMessageByConversation.get(conversation.id) || null;
        const unreadCount = unreadCountByConversation.get(conversation.id) || 0;

        return {
          ...conversation,
          otherUserId,
          otherProfile: profileMap.get(otherUserId) || null,
          lastMessage,
          unreadCount,
          isNewFriend: !lastMessage,
        };
      })
      .sort((a, b) => {
        const aTime = new Date(
          a.lastMessage?.created_at || a.updated_at || a.created_at || 0
        ).getTime();
        const bTime = new Date(
          b.lastMessage?.created_at || b.updated_at || b.created_at || 0
        ).getTime();
        return bTime - aTime;
      });

    setConversations(nextItems);

    const urlConversationValid = nextItems.some(
      (conversation) => conversation.id === selectedConversationFromUrl
    );

    const urlUserConversationId = selectedUserFromUrl
      ? nextItems.find((conversation) => conversation.otherUserId === selectedUserFromUrl)?.id || ""
      : "";

    const activeConversationStillValid = Boolean(
      activeConversationIdRef.current &&
        nextItems.some((conversation) => conversation.id === activeConversationIdRef.current)
    );

    const nextActiveId = urlConversationValid
      ? selectedConversationFromUrl
      : urlUserConversationId
        ? urlUserConversationId
        : activeConversationStillValid
          ? activeConversationIdRef.current
          : "";

    setActiveConversationId(nextActiveId);
    activeConversationIdRef.current = nextActiveId;

    if (selectedConversationFromUrl && urlConversationValid) {
      setMobileChatOpen(true);
    }

    if (selectedUserFromUrl && urlUserConversationId) {
      setMobileChatOpen(true);
      updateConversationUrl(urlUserConversationId);
    }

    if ((selectedConversationFromUrl && !urlConversationValid) || (selectedUserFromUrl && !urlUserConversationId)) {
      clearConversationUrl();
      setMobileChatOpen(false);
    }

    if (!nextActiveId) {
      setMessages([]);
      setMobileChatOpen(false);
    }

    setLoadingInbox(false);
  }, [router, selectedConversationFromUrl, selectedUserFromUrl]);

  const scheduleInboxRefresh = useCallback(
    (delayMs = 320) => {
      if (inboxRefreshTimerRef.current) {
        window.clearTimeout(inboxRefreshTimerRef.current);
      }

      inboxRefreshTimerRef.current = window.setTimeout(() => {
        inboxRefreshTimerRef.current = null;
        void loadInbox();
      }, delayMs);
    },
    [loadInbox]
  );

  const loadMessages = useCallback(
    async (conversationId: string, currentViewerId: string) => {
      if (!conversationId || !currentViewerId) {
        setMessages([]);
        return;
      }

      setLoadingMessages(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("direct_messages")
        .select(DIRECT_MESSAGE_SELECT)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) {
        setErrorMessage(getParachatErrorMessage(error.message || "Could not load this conversation."));
        setMessages([]);
        setLoadingMessages(false);
        return;
      }

      const preparedMessages = await attachSignedImageUrls((data as MessageRow[]) || []);
      setMessages(preparedMessages);
      await markConversationRead(conversationId, currentViewerId);
      setLoadingMessages(false);
      scrollToBottom("auto");
    },
    [markConversationRead, scrollToBottom]
  );

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (!viewerId || typeof window === "undefined") return;

    let cancelled = false;

    const updatePresence = async (isOnline: boolean) => {
      if (cancelled) return;
      await updateParachatPresence(viewerId, isOnline);
    };

    const shouldMarkOnline = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return false;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
      return true;
    };

    const markOnlineIfVisible = () => {
      if (!shouldMarkOnline()) return;
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
  }, [viewerId]);

  useEffect(() => {
    if (!viewerId || !activeConversationId) return;

    loadMessages(activeConversationId, viewerId);
  }, [activeConversationId, viewerId, loadMessages]);

  useEffect(() => {
    if (!activeConversationId || loadingMessages) return;

    scrollToBottom("auto");
  }, [activeConversationId, loadingMessages, messages.length, scrollToBottom]);

  useEffect(() => {
    const closeFloatingMenus = () => {
      setOpenConversationMenuId(null);
      setConversationMenuAnchor(null);
      setOpenMessageMenuId(null);
      setMessageMenuAnchor(null);
    };

    window.addEventListener("click", closeFloatingMenus);

    return () => {
      window.removeEventListener("click", closeFloatingMenus);
    };
  }, []);

  useEffect(() => {
    const handleOptionsEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;

      setOpenConversationMenuId(null);
      setConversationMenuAnchor(null);
      setOpenMessageMenuId(null);
      setMessageMenuAnchor(null);
    };

    window.addEventListener("keydown", handleOptionsEscape);

    return () => {
      window.removeEventListener("keydown", handleOptionsEscape);
    };
  }, []);

  useEffect(() => {
    if (!viewerId) return;

    const channel = supabase
      .channel(`parachat-hub-${viewerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
        },
        async (payload) => {
          const nextMessage = await attachSignedImageUrlToMessage(payload.new as MessageRow);

          const belongsToUser = conversationsRef.current.some(
            (conversation) => conversation.id === nextMessage.conversation_id
          );

          if (!belongsToUser) {
            scheduleInboxRefresh(180);
            return;
          }

          const incomingConversation = conversationsRef.current.find(
            (conversation) => conversation.id === nextMessage.conversation_id
          );

          if (
            incomingConversation?.otherUserId &&
            blockedUserIds.includes(incomingConversation.otherUserId)
          ) {
            return;
          }

          setConversations((prev) =>
            prev
              .map((conversation) => {
                if (conversation.id !== nextMessage.conversation_id) return conversation;

                const isActive = activeConversationIdRef.current === nextMessage.conversation_id;
                const isMine = nextMessage.sender_id === viewerId;

                return {
                  ...conversation,
                  lastMessage: nextMessage,
                  isNewFriend: false,
                  unreadCount:
                    !isActive && !isMine
                      ? conversation.unreadCount + 1
                      : conversation.unreadCount,
                  updated_at: nextMessage.created_at,
                };
              })
              .sort((a, b) => {
                const aTime = new Date(
                  a.lastMessage?.created_at || a.updated_at || 0
                ).getTime();
                const bTime = new Date(
                  b.lastMessage?.created_at || b.updated_at || 0
                ).getTime();
                return bTime - aTime;
              })
          );

          if (nextMessage.conversation_id === activeConversationIdRef.current) {
            setMessages((prev) => {
              if (prev.some((message) => message.id === nextMessage.id)) return prev;
              return [...prev, nextMessage];
            });

            if (nextMessage.sender_id !== viewerId) {
              await markConversationRead(nextMessage.conversation_id, viewerId);
            }

            scrollToBottom();

            if (isImageMessage(nextMessage) && !nextMessage.signedImageUrl) {
              window.setTimeout(() => {
                void loadMessages(nextMessage.conversation_id, viewerId);
              }, 650);
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "direct_messages",
        },
        async (payload) => {
          const updatedMessage = await attachSignedImageUrlToMessage(payload.new as MessageRow);

          const belongsToUser = conversationsRef.current.some(
            (conversation) => conversation.id === updatedMessage.conversation_id
          );

          if (!belongsToUser) return;

          setMessages((prev) =>
            prev.map((message) => (message.id === updatedMessage.id ? updatedMessage : message))
          );

          setConversations((prev) =>
            prev.map((conversation) =>
              conversation.lastMessage?.id === updatedMessage.id
                ? { ...conversation, lastMessage: updatedMessage, updated_at: updatedMessage.created_at }
                : conversation
            )
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "direct_messages",
        },
        async (payload) => {
          const deletedMessage = payload.old as Partial<MessageRow>;
          const deletedMessageId = deletedMessage.id || "";

          if (!deletedMessageId) {
            await loadInbox();
            return;
          }

          const deletedConversationId =
            deletedMessage.conversation_id ||
            messagesRef.current.find((message) => message.id === deletedMessageId)?.conversation_id ||
            conversationsRef.current.find((conversation) => conversation.lastMessage?.id === deletedMessageId)?.id ||
            "";

          setMessages((prev) => prev.filter((message) => message.id !== deletedMessageId));

          if (deletedConversationId) {
            const remainingMessages = messagesRef.current
              .filter((message) => message.conversation_id === deletedConversationId && message.id !== deletedMessageId)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            const nextLastMessage = remainingMessages[0] || null;

            setConversations((prev) =>
              prev.map((conversation) =>
                conversation.id === deletedConversationId
                  ? {
                      ...conversation,
                      lastMessage: nextLastMessage,
                      isNewFriend: !nextLastMessage,
                      updated_at: nextLastMessage?.created_at || conversation.updated_at,
                    }
                  : conversation
              )
            );
          }

          setEditingMessageId((currentId) => {
            if (currentId !== deletedMessageId) return currentId;
            setEditingMessageText("");
            return null;
          });

          setOpenMessageMenuId((currentId) => (currentId === deletedMessageId ? null : currentId));

          await loadInbox();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    activeConversationId,
    blockedUserIds,
    loadInbox,
    loadMessages,
    scheduleInboxRefresh,
    markConversationRead,
    scrollToBottom,
    viewerId,
  ]);

  const handleRequestDeleteConversation = (conversation: ConversationItem) => {
    setOpenConversationMenuId(null);
    setConversationMenuAnchor(null);
    setStatusMessage("");
    setErrorMessage("");
    setConversationDeleteTarget(conversation);
  };

  const handleCancelDeleteConversation = () => {
    if (deletingConversationId) return;
    setConversationDeleteTarget(null);
  };

  const handleDeleteConversation = async (conversation: ConversationItem) => {
    if (!viewerId || !conversation.id) return;

    const otherName = getProfileName(conversation.otherProfile);

    setDeletingConversationId(conversation.id);
    setOpenConversationMenuId(null);
    setConversationMenuAnchor(null);
    setStatusMessage("");
    setErrorMessage("");

    const hiddenAt = new Date().toISOString();

    const { data: existingHide, error: existingHideError } = await supabase
      .from("direct_conversation_hides")
      .select("conversation_id")
      .eq("conversation_id", conversation.id)
      .eq("user_id", viewerId)
      .maybeSingle();

    if (existingHideError) {
      setErrorMessage(`Could not check this Parachat delete status: ${getParachatErrorMessage(existingHideError.message)}`);
      setDeletingConversationId(null);
      return;
    }

    const { error } = existingHide
      ? await supabase
          .from("direct_conversation_hides")
          .update({ hidden_at: hiddenAt })
          .eq("conversation_id", conversation.id)
          .eq("user_id", viewerId)
      : await supabase
          .from("direct_conversation_hides")
          .insert({
            conversation_id: conversation.id,
            user_id: viewerId,
            hidden_at: hiddenAt,
          });

    if (error) {
      setErrorMessage(`Could not delete this Parachat from your inbox: ${getParachatErrorMessage(error.message)}`);
      setDeletingConversationId(null);
      return;
    }

    const remainingConversations = conversations.filter((item) => item.id !== conversation.id);
    setConversations(remainingConversations);

    if (activeConversationId === conversation.id) {
      setMessages([]);
      setActiveConversationId("");
      activeConversationIdRef.current = "";
      setMobileChatOpen(false);
      clearConversationUrl();
    }

    setDeletingConversationId(null);
    setConversationDeleteTarget(null);
    setStatusMessage(`Parachat with ${otherName} was removed from your inbox.`);
  };

  const handleStartEditMessage = (message: MessageRow) => {
    if (!viewerId || message.sender_id !== viewerId) return;

    setOpenMessageMenuId(null);
    setMessageMenuAnchor(null);
    setEditingMessageId(message.id);
    setEditingMessageText(message.body || "");
    setStatusMessage("");
    setErrorMessage("");
  };

  const handleCancelEditMessage = () => {
    setEditingMessageId(null);
    setEditingMessageText("");
    setSavingMessageId(null);
  };

  const handleSaveEditedMessage = async (message: MessageRow) => {
    if (!viewerId || message.sender_id !== viewerId || savingMessageId) return;

    const trimmed = editingMessageText.trim();
    const isPhotoMessage = isImageMessage(message);

    if (!isPhotoMessage && !trimmed) {
      setErrorMessage("A text message needs some text. Delete the message instead if you want to remove it.");
      return;
    }

    setSavingMessageId(message.id);
    setErrorMessage("");
    setStatusMessage("");

    const { data, error } = await supabase
      .from("direct_messages")
      .update({ body: trimmed || null })
      .eq("id", message.id)
      .eq("sender_id", viewerId)
      .select(DIRECT_MESSAGE_SELECT)
      .single();

    if (error) {
      setErrorMessage(`Could not edit this message: ${getParachatErrorMessage(error.message)}`);
      setSavingMessageId(null);
      return;
    }

    const updatedMessage = await attachSignedImageUrlToMessage(data as MessageRow);

    setMessages((prev) =>
      prev.map((item) => (item.id === updatedMessage.id ? updatedMessage : item))
    );

    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.lastMessage?.id === updatedMessage.id
          ? { ...conversation, lastMessage: updatedMessage, updated_at: updatedMessage.created_at }
          : conversation
      )
    );

    setEditingMessageId(null);
    setEditingMessageText("");
    setSavingMessageId(null);
  };

  const handleDeleteMessage = async (message: MessageRow) => {
    if (!viewerId || message.sender_id !== viewerId || deletingMessageId) return;

    const confirmed = window.confirm(
      "Delete this message? This removes the message from the Parachat."
    );

    if (!confirmed) return;

    setDeletingMessageId(message.id);
    setOpenMessageMenuId(null);
    setMessageMenuAnchor(null);
    setStatusMessage("");
    setErrorMessage("");

    const { data: deletedMessage, error } = await supabase
      .from("direct_messages")
      .delete()
      .eq("id", message.id)
      .eq("sender_id", viewerId)
      .select("id")
      .maybeSingle();

    if (error) {
      setErrorMessage(`Could not delete this message: ${getParachatErrorMessage(error.message)}`);
      setDeletingMessageId(null);
      return;
    }

    if (!deletedMessage?.id) {
      setErrorMessage(
        "This message could not be removed from the conversation. Please refresh and try again. If the problem continues, the Parachat delete policy needs to be checked."
      );
      setDeletingMessageId(null);
      return;
    }

    if (message.image_path) {
      const { error: removeImageError } = await supabase.storage
        .from(PARACHAT_IMAGE_BUCKET)
        .remove([message.image_path]);

      if (removeImageError) {
        console.warn("Parachat image cleanup warning:", removeImageError.message);
      }
    }

    const remainingMessages = messages
      .filter((item) => item.id !== message.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const nextLastMessage =
      remainingMessages.find((item) => item.conversation_id === message.conversation_id) || null;

    setMessages((prev) => prev.filter((item) => item.id !== message.id));

    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === message.conversation_id
          ? {
              ...conversation,
              lastMessage: nextLastMessage,
              isNewFriend: !nextLastMessage,
              updated_at: nextLastMessage?.created_at || conversation.updated_at,
            }
          : conversation
      )
    );

    if (editingMessageId === message.id) {
      setEditingMessageId(null);
      setEditingMessageText("");
    }

    setDeletingMessageId(null);
  };

  const handleOpenShareMessage = (message: MessageRow) => {
    if (!viewerId || !message.id) return;

    setOpenMessageMenuId(null);
    setMessageMenuAnchor(null);
    setSharingMessage(message);
    setSharingMessageId(null);
    setStatusMessage("");
    setErrorMessage("");
  };

  const handleCloseShareMessage = () => {
    if (sharingMessageId) return;

    setSharingMessage(null);
    setSharingMessageId(null);
  };

  const handleShareMessageToConversation = async (conversation: ConversationItem) => {
    const messageToShare = sharingMessage;

    if (!viewerId || !messageToShare || !conversation.id) return;

    if (!conversation.otherUserId || !acceptedFriendIds.includes(conversation.otherUserId)) {
      setErrorMessage("You can only share Parachat messages with accepted friends.");
      return;
    }

    if (blockedUserIds.includes(conversation.otherUserId)) {
      setErrorMessage("You can’t share messages to this Parachat because one of you has blocked the other.");
      return;
    }

    try {
      const isBlocked = await checkParachatBlockedBetween(viewerId, conversation.otherUserId);

      if (isBlocked) {
        setBlockedUserIds((prev) =>
          prev.includes(conversation.otherUserId) ? prev : [...prev, conversation.otherUserId]
        );
        setErrorMessage("You can’t share messages to this Parachat because one of you has blocked the other.");
        return;
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not check this Parachat block status.");
      return;
    }

    if (conversation.id === messageToShare.conversation_id) {
      setErrorMessage("Choose a different Parachat to share this with.");
      return;
    }

    const isPhotoShare = isImageMessage(messageToShare);
    const sharedText = (messageToShare.body || "").trim();

    if (!isPhotoShare && !sharedText) {
      setErrorMessage("This message has nothing to share.");
      return;
    }

    setSharingMessageId(messageToShare.id);
    setStatusMessage("");
    setErrorMessage("");

    let copiedImagePath: string | null = null;

    if (isPhotoShare) {
      if (!messageToShare.image_path) {
        setErrorMessage("This photo could not be shared because its image file is unavailable.");
        setSharingMessageId(null);
        return;
      }

      const { data: imageBlob, error: downloadError } = await supabase.storage
        .from(PARACHAT_IMAGE_BUCKET)
        .download(messageToShare.image_path);

      if (downloadError || !imageBlob) {
        setErrorMessage(`Could not prepare this photo for sharing: ${getParachatErrorMessage(downloadError?.message)}`);
        setSharingMessageId(null);
        return;
      }

      copiedImagePath = buildParachatImagePath(
        conversation.id,
        viewerId,
        "shared-parachat-photo.jpg"
      );

      const { error: uploadError } = await supabase.storage
        .from(PARACHAT_IMAGE_BUCKET)
        .upload(copiedImagePath, imageBlob, {
          cacheControl: "3600",
          contentType: messageToShare.image_mime_type || imageBlob.type || "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        setErrorMessage(`Could not share this photo: ${getParachatErrorMessage(uploadError.message)}`);
        setSharingMessageId(null);
        return;
      }
    }

    const nextBody = isPhotoShare
      ? sharedText
        ? `Shared photo\n\n${sharedText}`
        : "Shared photo"
      : `Shared message\n\n${sharedText}`;

    const { data, error } = await supabase
      .from("direct_messages")
      .insert([
        {
          conversation_id: conversation.id,
          sender_id: viewerId,
          body: nextBody,
          is_read: false,
          message_type: isPhotoShare ? "image" : "text",
          image_path: copiedImagePath,
          image_mime_type: isPhotoShare ? messageToShare.image_mime_type || "image/jpeg" : null,
          image_size_bytes: isPhotoShare ? messageToShare.image_size_bytes || null : null,
          image_width: isPhotoShare ? messageToShare.image_width || null : null,
          image_height: isPhotoShare ? messageToShare.image_height || null : null,
        },
      ])
      .select(DIRECT_MESSAGE_SELECT)
      .single();

    if (error) {
      if (copiedImagePath) {
        await supabase.storage.from(PARACHAT_IMAGE_BUCKET).remove([copiedImagePath]);
      }

      setErrorMessage(`Could not share this message: ${getParachatErrorMessage(error.message)}`);
      setSharingMessageId(null);
      return;
    }

    const sharedMessage = await attachSignedImageUrlToMessage(data as MessageRow);

    await createParachatNotification({
      recipientUserId: conversation.otherUserId,
      senderUserId: viewerId,
      isPhotoMessage: isPhotoShare,
    });

    setConversations((prev) =>
      prev
        .map((item) =>
          item.id === conversation.id
            ? {
                ...item,
                lastMessage: sharedMessage,
                isNewFriend: false,
                updated_at: sharedMessage.created_at,
              }
            : item
        )
        .sort((a, b) => {
          const aTime = new Date(a.lastMessage?.created_at || a.updated_at || 0).getTime();
          const bTime = new Date(b.lastMessage?.created_at || b.updated_at || 0).getTime();
          return bTime - aTime;
        })
    );

    if (activeConversationId === conversation.id) {
      setMessages((prev) => {
        if (prev.some((message) => message.id === sharedMessage.id)) return prev;
        return [...prev, sharedMessage];
      });
      scrollToBottom();
    }

    await supabase
      .from("direct_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    setSharingMessage(null);
    setSharingMessageId(null);
    setStatusMessage(`Shared to ${getProfileName(conversation.otherProfile)}.`);
  };

  const handleSelectConversation = (conversationId: string) => {
    if (conversationId === activeConversationId) {
      setOpenConversationMenuId(null);
      setConversationMenuAnchor(null);
      setOpenMessageMenuId(null);
      setMessageMenuAnchor(null);
      setMobileChatOpen(true);
      updateConversationUrl(conversationId);
      scrollToBottom("smooth");
      return;
    }

    setOpenConversationMenuId(null);
    setConversationMenuAnchor(null);
    setOpenMessageMenuId(null);
    setMessageMenuAnchor(null);
    setEditingMessageId(null);
    setEditingMessageText("");
    setActiveConversationId(conversationId);
    activeConversationIdRef.current = conversationId;
    setMobileChatOpen(true);
    updateConversationUrl(conversationId);

    if (viewerId) {
      void markConversationRead(conversationId, viewerId);
    }

    scrollToBottom("auto");
  };

  const handleMobileBackToInbox = () => {
    setOpenConversationMenuId(null);
    setConversationMenuAnchor(null);
    setOpenMessageMenuId(null);
    setMessageMenuAnchor(null);
    setImageViewer(null);
    setMobileChatOpen(false);
    clearConversationUrl();
  };

  const handleCloseActiveConversation = () => {
    setOpenConversationMenuId(null);
    setConversationMenuAnchor(null);
    setOpenMessageMenuId(null);
    setMessageMenuAnchor(null);
    setEditingMessageId(null);
    setEditingMessageText("");
    setActiveConversationId("");
    activeConversationIdRef.current = "";
    setMessages([]);
    setMessageText("");
    clearSelectedImage();
    setImageViewer(null);
    setMobileChatOpen(false);
    clearConversationUrl();

    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  };

  const handleTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setMessageText(event.target.value);

    const textarea = event.currentTarget;
    textarea.style.height = "44px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 130)}px`;
  };

  const handleSelectImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!activeConversationIsAcceptedFriend) {
      setImageError("Parachat photos are only available between accepted friends.");
      event.currentTarget.value = "";
      return;
    }

    if (activeConversationIsBlocked) {
      setImageError("Photos are unavailable because this Parachat is blocked.");
      event.currentTarget.value = "";
      return;
    }

    setImageError("");
    setCompressingImage(true);

    try {
      const compressedImage = await compressParachatImage(file);
      const previewUrl = URL.createObjectURL(compressedImage.blob);

      setSelectedImage((currentImage) => {
        if (currentImage?.previewUrl) {
          URL.revokeObjectURL(currentImage.previewUrl);
        }

        return {
          previewUrl,
          ...compressedImage,
        };
      });
    } catch (error) {
      setSelectedImage(null);
      setImageError(error instanceof Error ? error.message : "Could not prepare this photo.");
      event.currentTarget.value = "";
    } finally {
      setCompressingImage(false);
    }
  };

  const handleSendMessage = async () => {
    const trimmed = messageText.trim();
    const imageDraft = selectedImage;

    if ((!trimmed && !imageDraft) || sending || compressingImage || !viewerId || !activeConversationId) return;

    const recipientUserId =
      activeConversation?.otherUserId ||
      conversationsRef.current.find((conversation) => conversation.id === activeConversationId)?.otherUserId ||
      "";

    if (!recipientUserId) {
      setErrorMessage("This Parachat could not find the other user.");
      return;
    }

    const acceptedForParachat =
      activeConversationIsAcceptedFriend ||
      acceptedFriendIds.includes(recipientUserId) ||
      (await checkAcceptedParachatFriend(viewerId, recipientUserId));

    if (!acceptedForParachat) {
      setErrorMessage("Parachat is only available between accepted friends.");
      return;
    }

    if (!acceptedFriendIds.includes(recipientUserId)) {
      setAcceptedFriendIds((prev) =>
        prev.includes(recipientUserId) ? prev : [...prev, recipientUserId]
      );
    }

    if (activeConversationIsBlocked) {
      setErrorMessage("You can’t send messages in this Parachat because one of you has blocked the other.");
      return;
    }

    try {
      const isBlocked = await checkParachatBlockedBetween(viewerId, recipientUserId);

      if (isBlocked) {
        setBlockedUserIds((prev) =>
          prev.includes(recipientUserId) ? prev : [...prev, recipientUserId]
        );
        setErrorMessage("You can’t send messages in this Parachat because one of you has blocked the other.");
        return;
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not check this Parachat block status.");
      return;
    }

    setSending(true);
    setErrorMessage("");
    setImageError("");

    let sendConversationId = activeConversationId;

    try {
      const canonicalConversationId = await resolveParachatConversationId(recipientUserId);
      await ensureParachatParticipantRow(canonicalConversationId, viewerId);

      if (canonicalConversationId !== activeConversationId) {
        sendConversationId = canonicalConversationId;
        setActiveConversationId(canonicalConversationId);
        activeConversationIdRef.current = canonicalConversationId;
        updateConversationUrl(canonicalConversationId);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not prepare this Parachat.");
      setSending(false);
      return;
    }

    let uploadedImagePath: string | null = null;

    if (imageDraft) {
      uploadedImagePath = buildParachatImagePath(
        sendConversationId,
        viewerId,
        imageDraft.fileName
      );

      const { error: uploadError } = await supabase.storage
        .from(PARACHAT_IMAGE_BUCKET)
        .upload(uploadedImagePath, imageDraft.blob, {
          cacheControl: "3600",
          contentType: imageDraft.mimeType,
          upsert: false,
        });

      if (uploadError) {
        setErrorMessage(getParachatErrorMessage(uploadError.message || "Photo could not be uploaded."));
        setSending(false);
        return;
      }
    }

    const { data, error } = await supabase
      .from("direct_messages")
      .insert([
        {
          conversation_id: sendConversationId,
          sender_id: viewerId,
          body: trimmed || null,
          is_read: false,
          message_type: imageDraft ? "image" : "text",
          image_path: uploadedImagePath,
          image_mime_type: imageDraft?.mimeType || null,
          image_size_bytes: imageDraft?.sizeBytes || null,
          image_width: imageDraft?.width || null,
          image_height: imageDraft?.height || null,
        },
      ])
      .select(DIRECT_MESSAGE_SELECT)
      .single();

    if (error) {
      if (uploadedImagePath) {
        await supabase.storage.from(PARACHAT_IMAGE_BUCKET).remove([uploadedImagePath]);
      }

      setErrorMessage(getParachatErrorMessage(error.message || "Message could not be sent."));
      setSending(false);
      return;
    }

    if (data) {
      const sentMessage = await attachSignedImageUrlToMessage(data as MessageRow);

      const notificationConversation =
        activeConversation ||
        conversationsRef.current.find((conversation) => conversation.id === sendConversationId) ||
        null;

      if (notificationConversation?.otherUserId) {
        await createParachatNotification({
          recipientUserId: notificationConversation.otherUserId,
          senderUserId: viewerId,
          isPhotoMessage: Boolean(imageDraft),
        });
      }

      setMessages((prev) => {
        if (prev.some((message) => message.id === sentMessage.id)) return prev;
        return [...prev, sentMessage];
      });

      setConversations((prev) =>
        prev
          .map((conversation) =>
            conversation.id === sendConversationId
              ? {
                  ...conversation,
                  lastMessage: sentMessage,
                  isNewFriend: false,
                  updated_at: sentMessage.created_at,
                }
              : conversation
          )
          .sort((a, b) => {
            const aTime = new Date(
              a.lastMessage?.created_at || a.updated_at || 0
            ).getTime();
            const bTime = new Date(
              b.lastMessage?.created_at || b.updated_at || 0
            ).getTime();
            return bTime - aTime;
          })
      );
    }

    await supabase
      .from("direct_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sendConversationId);

    if (sendConversationId !== activeConversationId) {
      await loadInbox();
    }

    setMessageText("");
    clearSelectedImage();

    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
      textareaRef.current.focus();
    }

    setSending(false);
    scrollToBottom();

    if (imageDraft) {
      window.setTimeout(() => {
        void loadMessages(sendConversationId, viewerId);
      }, 650);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleSendMessage();
  };

  const handleComposerKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await handleSendMessage();
    }
  };

  const activeProfile = activeConversation?.otherProfile || null;
  const activeName = getProfileName(activeProfile);
  const activeHandle = activeProfile?.username ? `@${activeProfile.username}` : "Parapost Network member";
  const activeBlockedNotice = activeConversationIsBlocked
    ? "This Parachat is blocked. You can view previous messages, but new messages and photos are disabled."
    : "";
  const inputDisabled =
    loadingInbox ||
    sending ||
    !activeConversationId ||
    !activeConversationIsAcceptedFriend ||
    activeConversationIsBlocked;
  const sendDisabled = (!messageText.trim() && !selectedImage) || inputDisabled || compressingImage;

  return (
    <div
      className={
        mobileChatOpen
          ? "parachat-page-root parachat-page-chat-open parachat-mobile-chat-open"
          : "parachat-page-root"
      }
      style={pageStyle}
    >
      <style>{`
        .parachat-page-root {
          overflow-x: hidden !important;
        }

        .parachat-conversation-row,
        .parachat-message-group {
          content-visibility: auto;
          contain-intrinsic-size: 80px;
        }

        .parachat-message-image {
          transition: opacity 180ms ease, transform 180ms ease;
        }

        .parachat-shell,
        .parachat-inbox,
        .parachat-panel,
        .parachat-messages,
        .parachat-composer {
          box-sizing: border-box !important;
        }

        .parachat-messages {
          overscroll-behavior: contain !important;
          scrollbar-width: thin;
        }

        .parachat-composer textarea {
          touch-action: manipulation !important;
        }

        @media (min-width: 1181px) {
          .parachat-inbox,
          .parachat-panel {
            height: calc(100vh - 36px) !important;
            max-height: calc(100vh - 36px) !important;
          }

          .parachat-conversation-list {
            max-height: calc(100vh - 290px) !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
            padding-right: 2px !important;
          }
        }

        @media (min-width: 981px) and (max-width: 1180px) {
          .parachat-shell {
            grid-template-columns: 340px minmax(0, 1fr) !important;
            gap: 14px !important;
            padding: 14px !important;
            max-width: 1180px !important;
          }

          .parachat-inbox,
          .parachat-panel {
            height: calc(100vh - 28px) !important;
            max-height: calc(100vh - 28px) !important;
            min-height: calc(100vh - 28px) !important;
            border-radius: 24px !important;
          }

          .parachat-title {
            font-size: 25px !important;
          }

          .parachat-conversation-list {
            max-height: calc(100vh - 276px) !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
          }

          .parachat-messages {
            padding: 16px !important;
          }

          .parachat-composer {
            padding: 12px !important;
          }
        }

        /* Tablet Parachat uses one full-width screen for either inbox or chat.
           This prevents 981–1180px iPad viewports from falling into the compact
           desktop two-column grid and narrowing an individual conversation. */
        @media (min-width: 641px) and (max-width: 1180px) {
          .parachat-shell {
            grid-template-columns: minmax(0, 1fr) !important;
            width: 100% !important;
            max-width: none !important;
          }

          .parachat-mobile-chat-open .parachat-inbox {
            display: none !important;
          }

          .parachat-mobile-chat-open .parachat-panel {
            display: grid !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: none !important;
            margin: 0 !important;
            grid-column: 1 / -1 !important;
            justify-self: stretch !important;
          }
        }

        @media (max-width: 1180px) {
          .parachat-page-root {
            min-height: 100svh !important;
            min-height: 100dvh !important;
            overflow-x: hidden !important;
            background:
              radial-gradient(circle at top left, rgba(168,85,247,0.28), transparent 34%),
              radial-gradient(circle at bottom right, rgba(34,211,238,0.10), transparent 30%),
              #05070a !important;
          }

          .parachat-page-chat-open {
            height: 100svh !important;
            height: 100dvh !important;
            max-height: 100svh !important;
            max-height: 100dvh !important;
            overflow: hidden !important;
          }

          .parachat-shell {
            grid-template-columns: 1fr !important;
            gap: 0 !important;
            padding: 0 !important;
            min-height: 100svh !important;
            min-height: 100dvh !important;
            max-width: none !important;
          }

          .parachat-page-chat-open .parachat-shell {
            height: 100svh !important;
            height: 100dvh !important;
            max-height: 100svh !important;
            max-height: 100dvh !important;
            overflow: hidden !important;
          }

          .parachat-inbox {
            display: block !important;
            border-radius: 0 !important;
            min-height: 100svh !important;
            min-height: 100dvh !important;
            max-height: none !important;
            border: none !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
            padding: 14px 14px calc(110px + env(safe-area-inset-bottom)) !important;
          }

          .parachat-panel {
            display: none !important;
            border-radius: 0 !important;
            min-height: 100svh !important;
            min-height: 100dvh !important;
            border: none !important;
          }

          .parachat-mobile-chat-open .parachat-inbox {
            display: none !important;
          }

          .parachat-mobile-chat-open .parachat-panel {
            display: grid !important;
            grid-template-rows: auto minmax(0, 1fr) auto !important;
            height: 100svh !important;
            height: 100dvh !important;
            min-height: 100svh !important;
            min-height: 100dvh !important;
            max-height: 100svh !important;
            max-height: 100dvh !important;
            overflow: hidden !important;
            background: rgba(7,10,16,0.98) !important;
          }

          .parachat-mobile-chat-open .parachat-messages {
            min-height: 0 !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
            padding-bottom: calc(22px + env(safe-area-inset-bottom)) !important;
          }

          .parachat-mobile-chat-open .parachat-composer {
            position: sticky !important;
            bottom: 0 !important;
            z-index: 80 !important;
            flex-shrink: 0 !important;
            width: 100% !important;
            box-sizing: border-box !important;
            padding: 10px 12px calc(18px + env(safe-area-inset-bottom)) !important;
            background: rgba(3,7,18,0.99) !important;
            box-shadow: 0 -18px 34px rgba(0,0,0,0.42) !important;
          }

          .parachat-mobile-chat-open .parachat-composer-row {
            align-items: center !important;
            width: 100% !important;
            min-width: 0 !important;
          }

          .parachat-mobile-chat-open .parachat-composer textarea {
            height: 46px !important;
            min-height: 46px !important;
            max-height: 96px !important;
            box-sizing: border-box !important;
            line-height: 1.25 !important;
            overflow-y: auto !important;
          }

          .parachat-desktop-only {
            display: none !important;
          }

          .parachat-mobile-back {
            display: inline-flex !important;
          }

          .parachat-conversation-list {
            max-height: none !important;
            overflow: visible !important;
            scrollbar-width: none !important;
          }

          .parachat-conversation-list::-webkit-scrollbar {
            display: none !important;
          }
        }

        @media (min-width: 1181px) {
          .parachat-mobile-back {
            display: none !important;
          }
        }

        @media (min-width: 641px) and (max-width: 1180px) {
          .parachat-inbox {
            padding: 18px 22px calc(116px + env(safe-area-inset-bottom)) !important;
          }

          .parachat-inbox > * {
            max-width: 760px !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }

          .parachat-mobile-chat-open .parachat-panel {
            width: 100% !important;
            min-width: 0 !important;
            max-width: none !important;
            margin: 0 !important;
            justify-self: stretch !important;
            border-left: 1px solid rgba(255,255,255,0.08) !important;
            border-right: 1px solid rgba(255,255,255,0.08) !important;
          }

          .parachat-mobile-chat-open .parachat-composer {
            padding-left: 16px !important;
            padding-right: 16px !important;
          }
        }

        @media (max-width: 640px) {
          .parachat-title {
            font-size: 25px !important;
          }

          .parachat-panel {
            grid-template-rows: auto minmax(0, 1fr) auto !important;
          }

          .parachat-messages {
            padding: 14px !important;
          }

          .parachat-composer {
            gap: 8px !important;
            padding: 10px 10px calc(18px + env(safe-area-inset-bottom)) !important;
          }

          .parachat-composer-row {
            gap: 8px !important;
            align-items: center !important;
          }

          .parachat-image-button,
          .parachat-voice-button {
            width: 44px !important;
            min-width: 44px !important;
            height: 44px !important;
            padding: 0 !important;
          }

          .parachat-image-preview {
            max-width: 100% !important;
          }

          .parachat-composer textarea {
            flex: 1 1 auto !important;
            min-width: 0 !important;
            height: 46px !important;
            min-height: 46px !important;
            max-height: 92px !important;
            font-size: 16px !important;
            line-height: 1.25 !important;
            padding: 12px 13px !important;
          }

          .parachat-composer button[type="submit"] {
            min-width: 74px !important;
            min-height: 46px !important;
            padding: 0 14px !important;
            font-size: 14px !important;
            white-space: nowrap !important;
          }
        }

        @media (max-width: 390px) {
          .parachat-inbox {
            padding: 12px 10px calc(104px + env(safe-area-inset-bottom)) !important;
          }

          .parachat-title {
            font-size: 23px !important;
          }

          .parachat-messages {
            padding: 12px !important;
          }

          .parachat-composer {
            padding-left: 8px !important;
            padding-right: 8px !important;
          }

          .parachat-composer-row {
            gap: 6px !important;
          }

          .parachat-image-button,
          .parachat-voice-button {
            width: 40px !important;
            min-width: 40px !important;
            height: 40px !important;
          }

          .parachat-composer textarea {
            height: 44px !important;
            min-height: 44px !important;
            padding: 11px 12px !important;
          }

          .parachat-composer button[type="submit"] {
            min-width: 62px !important;
            min-height: 44px !important;
            padding: 0 11px !important;
            font-size: 13px !important;
          }
        }

        @media (max-height: 560px) and (max-width: 1180px) {
          .parachat-inbox {
            padding-top: 8px !important;
          }

          .parachat-mobile-chat-open .parachat-composer {
            padding-top: 7px !important;
            padding-bottom: calc(10px + env(safe-area-inset-bottom)) !important;
          }

          .parachat-mobile-chat-open .parachat-composer textarea {
            height: 40px !important;
            min-height: 40px !important;
            max-height: 70px !important;
          }

          .parachat-mobile-chat-open .parachat-composer button[type="submit"],
          .parachat-mobile-chat-open .parachat-image-button,
          .parachat-mobile-chat-open .parachat-voice-button {
            min-height: 40px !important;
            height: 40px !important;
          }
        }
      `}</style>

      <div
        className={`parachat-shell ${mobileChatOpen ? "parachat-mobile-chat-open" : ""}`}
        style={shellStyle}
      >
        <aside className="parachat-inbox" style={inboxStyle}>
          <div style={inboxHeaderStyle}>
            <Link
              href="/dashboard"
              style={backLinkStyle}
              onClick={() => {
                closeConversationOptions();
                closeMessageOptions();
                setImageViewer(null);
              }}
            >
              ← Feed
            </Link>

            <div style={{ textAlign: "right" }}>
              <div style={brandTitleStyle}>PARAPOST</div>
              <div style={brandSubtitleStyle}>PARACHAT</div>
            </div>
          </div>

          <div style={heroCardStyle}>
            <div style={heroIconStyle}>💬</div>
            <div style={{ minWidth: 0 }}>
              <h1 className="parachat-title" style={inboxTitleStyle}>Parachat</h1>
              <p style={inboxSubtitleStyle}>
                Private and secure direct messages for Parapost Network. Your chats are designed to stay between you and the people you message.
              </p>
            </div>

            {totalUnreadCount > 0 ? (
              <span style={totalBadgeStyle}>{totalUnreadCount}</span>
            ) : null}
          </div>

          <div style={statusStripStyle}>
            <span style={statusDotStyle} />
            <span>
              {totalUnreadCount > 0
                ? `${totalUnreadCount} unread message${totalUnreadCount === 1 ? "" : "s"}`
                : "All caught up"}
            </span>
          </div>

          {statusMessage ? (
            <div style={statusMessageStyle}>
              <span style={successDotStyle} />
              {statusMessage}
            </div>
          ) : null}

          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search Parachat..."
            style={searchInputStyle}
          />

          <div className="parachat-conversation-list" style={conversationListStyle}>
            {loadingInbox ? (
              <div style={conversationEmptyStyle}>Loading Parachat...</div>
            ) : filteredConversations.length === 0 ? (
              <div style={conversationEmptyStyle}>
                No conversations yet. Visit an accepted friend’s profile and click Parachat to start messaging.
              </div>
            ) : (
              filteredConversations.map((conversation) => {
                const profile = conversation.otherProfile;
                const isActive = conversation.id === activeConversationId;

                return (
                  <div
                    key={conversation.id}
                    style={isActive ? conversationItemActiveStyle : conversationItemStyle}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectConversation(conversation.id)}
                      style={conversationSelectButtonStyle}
                    >
                      <div style={conversationAvatarWrapStyle}>
                        {profile?.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt=""
                            style={conversationAvatarImageStyle}
                          />
                        ) : (
                          <div style={conversationAvatarFallbackStyle}>
                            {getInitial(profile)}
                          </div>
                        )}

                        {isParachatProfileActuallyOnline(profile) ? <span style={onlineDotStyle} /> : null}
                      </div>

                      <div style={conversationTextStyle}>
                        <div style={conversationTopLineStyle}>
                          <strong style={conversationNameStyle}>
                            {getProfileName(profile)}
                          </strong>

                          <span style={conversationTimeStyle}>
                            {formatMessageTime(conversation.lastMessage?.created_at)}
                          </span>
                        </div>

                        <div style={conversationBottomLineStyle}>
                          <span
                            style={{
                              ...conversationPreviewStyle,
                              color: conversation.unreadCount > 0 ? "#f9fafb" : "#9ca3af",
                              fontWeight: conversation.unreadCount > 0 ? 850 : 500,
                            }}
                          >
                            {getConversationPreviewText(conversation)}
                          </span>

                          {conversation.unreadCount > 0 ? (
                            <span style={unreadBadgeStyle}>{conversation.unreadCount}</span>
                          ) : conversation.isNewFriend ? (
                            <span style={newFriendBadgeStyle}>New friend</span>
                          ) : null}
                        </div>
                      </div>
                    </button>

                    <div
                      style={conversationMenuWrapStyle}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();

                          setOpenMessageMenuId(null);
                          setMessageMenuAnchor(null);

                          if (openConversationMenuId === conversation.id) {
                            closeConversationOptions();
                            return;
                          }

                          setConversationMenuAnchor(
                            conversationOptionsUsesBottomSheet
                              ? null
                              : getDesktopConversationMenuPosition(event.currentTarget)
                          );
                          setOpenConversationMenuId(conversation.id);
                        }}
                        style={conversationMenuButtonStyle}
                        aria-label={`Open options for Parachat with ${getProfileName(profile)}`}
                        aria-haspopup="menu"
                        aria-expanded={openConversationMenuId === conversation.id}
                        title="Parachat options"
                      >
                        ⋯
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        <main className="parachat-panel" style={chatPanelStyle}>
          {!activeConversationId ? (
            <div style={selectConversationStyle}>
              <div style={emptyIconStyle}>💬</div>
              <strong>Select a Parachat</strong>
              <span>Choose someone from the left to start messaging.</span>
            </div>
          ) : (
            <>
              <header style={chatHeaderStyle}>
                <div style={headerLeftStyle}>
                  <button
                    type="button"
                    className="parachat-mobile-back"
                    onClick={handleMobileBackToInbox}
                    style={mobileBackButtonStyle}
                    aria-label="Back to Parachat inbox"
                  >
                    ←
                  </button>

                  <div style={avatarWrapStyle}>
                    {activeProfile?.avatar_url ? (
                      <img src={activeProfile.avatar_url} alt="" style={avatarImageStyle} />
                    ) : (
                      <div style={avatarFallbackStyle}>{getInitial(activeProfile)}</div>
                    )}

                    {isParachatProfileActuallyOnline(activeProfile) ? <span style={onlineDotStyle} /> : null}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <h2 style={headerTitleStyle}>{activeName}</h2>
                    <div style={headerSubtitleStyle}>
                      {activeConversationIsAcceptedFriend
                        ? isParachatProfileActuallyOnline(activeProfile)
                          ? "Online now"
                          : activeHandle
                        : "Parachat requires accepted friendship"}
                    </div>
                  </div>
                </div>

                <div style={headerActionsStyle}>
                  {activeConversation?.otherUserId ? (
                    <Link
                      href={`/profile/${activeConversation.otherUserId}`}
                      style={profileButtonStyle}
                      onClick={() => {
                        closeConversationOptions();
                        closeMessageOptions();
                        setImageViewer(null);
                      }}
                    >
                      Profile
                    </Link>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleCloseActiveConversation}
                    style={closeChatButtonStyle}
                    aria-label="Close this Parachat"
                    title="Close Parachat"
                  >
                    ×
                  </button>
                </div>
              </header>

              <section ref={messagesAreaRef} className="parachat-messages" style={messagesAreaStyle}>
                {errorMessage ? (
                  <div style={errorBoxStyle}>
                    <strong>Parachat needs attention</strong>
                    <span>{errorMessage}</span>
                    <button
                      type="button"
                      onClick={() =>
                        activeConversationId && viewerId
                          ? loadMessages(activeConversationId, viewerId)
                          : loadInbox()
                      }
                      style={retryButtonStyle}
                    >
                      Retry
                    </button>
                  </div>
                ) : messages.length === 0 ? (
                  <div style={emptyStateStyle}>
                    <div style={emptyIconStyle}>👋</div>
                    <strong>No messages yet</strong>
                    <span>
                      {activeConversation?.isNewFriend
                        ? `${activeName} is now your friend. Send the first Parachat when you are ready.`
                        : `Start the Parachat with ${activeName}.`}
                    </span>
                  </div>
                ) : (
                  <div style={messageStackStyle}>
                    {groupedMessages.map((group) => (
                      <div key={group.label} style={messageGroupStyle}>
                        <div style={dateDividerStyle}>
                          <span>{group.label}</span>
                        </div>

                        {group.items.map((message) => {
                          const isMine = message.sender_id === viewerId;
                          const isEditing = editingMessageId === message.id;
                          const isSavingMessage = savingMessageId === message.id;
                          const isDeletingMessage = deletingMessageId === message.id;

                          const editBox = (
                            <div style={messageEditBoxStyle}>
                              <textarea
                                value={editingMessageText}
                                onChange={(event) => setEditingMessageText(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    handleCancelEditMessage();
                                    return;
                                  }

                                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                                    event.preventDefault();
                                    void handleSaveEditedMessage(message);
                                  }
                                }}
                                placeholder={isImageMessage(message) ? "Edit caption..." : "Edit message..."}
                                rows={3}
                                style={messageEditTextareaStyle}
                                autoFocus
                              />

                              <div style={messageEditActionsStyle}>
                                <button
                                  type="button"
                                  onClick={handleCancelEditMessage}
                                  style={messageEditCancelButtonStyle}
                                  disabled={isSavingMessage}
                                >
                                  Cancel
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleSaveEditedMessage(message)}
                                  style={messageEditSaveButtonStyle}
                                  disabled={isSavingMessage}
                                >
                                  {isSavingMessage ? "Saving..." : "Save"}
                                </button>
                              </div>
                            </div>
                          );

                          return (
                            <div
                              key={message.id}
                              style={{
                                ...messageRowStyle,
                                justifyContent: isMine ? "flex-end" : "flex-start",
                              }}
                            >
                              {!isMine ? (
                                <div style={smallAvatarStyle}>
                                  {activeProfile?.avatar_url ? (
                                    <img
                                      src={activeProfile.avatar_url}
                                      alt=""
                                      style={smallAvatarImageStyle}
                                    />
                                  ) : (
                                    <span>{getInitial(activeProfile)}</span>
                                  )}
                                </div>
                              ) : null}

                              <div
                                style={{
                                  ...bubbleWrapStyle,
                                  alignItems: isMine ? "flex-end" : "flex-start",
                                }}
                              >
                                <div style={isMine ? myBubbleStyle : theirBubbleStyle}>
                                  {isImageMessage(message) ? (
                                    <div style={messageImageBlockStyle}>
                                      {message.signedImageUrl ? (
                                        <img
                                          src={message.signedImageUrl}
                                          alt={message.body || "Parachat image"}
                                          className="parachat-message-image"
                                          style={messageImageStyle}
                                          loading="lazy"
                                          decoding="async"
                                          onClick={() => handleOpenImageViewer(message, isMine)}
                                          onLoad={() => {
                                            const area = messagesAreaRef.current;
                                            if (!area) return;
                                            const distanceFromBottom =
                                              area.scrollHeight - area.scrollTop - area.clientHeight;
                                            if (distanceFromBottom < 220) {
                                              scrollToBottom("auto");
                                            }
                                          }}
                                          title="Open photo"
                                        />
                                      ) : (
                                        <div style={messageImageMissingStyle}>
                                          Image preview unavailable
                                        </div>
                                      )}

                                      {isEditing ? (
                                        editBox
                                      ) : message.body ? (
                                        <div style={messageImageCaptionStyle}>{message.body}</div>
                                      ) : null}
                                    </div>
                                  ) : isEditing ? (
                                    editBox
                                  ) : (
                                    message.body
                                  )}
                                </div>

                                <div style={messageMetaRowStyle}>
                                  <span style={messageTimeStyle}>
                                    {isDeletingMessage ? "Deleting..." : formatMessageTime(message.created_at)}
                                  </span>

                                  <span
                                    style={messageOptionsWrapStyle}
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();

                                        if (openMessageMenuId === message.id) {
                                          closeMessageOptions();
                                          return;
                                        }

                                        setOpenConversationMenuId(null);
                                        setConversationMenuAnchor(null);
                                        setMessageMenuAnchor(getDesktopMessageMenuPosition(event.currentTarget));
                                        setOpenMessageMenuId(message.id);
                                      }}
                                      style={messageOptionsButtonStyle}
                                      aria-label="Message options"
                                      disabled={isSavingMessage || isDeletingMessage || sharingMessageId === message.id}
                                    >
                                      ⋯
                                    </button>

                                    {/* Message options are rendered once at page level so the menu cannot be clipped on mobile. */}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}

                    <div ref={messagesEndRef} />
                  </div>
                )}
              </section>

              <form className="parachat-composer" onSubmit={handleSubmit} style={composerShellStyle}>
                {activeBlockedNotice ? (
                  <div style={blockedParachatNoticeStyle}>
                    {activeBlockedNotice}
                  </div>
                ) : null}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleSelectImage}
                  style={{ display: "none" }}
                />

                {selectedImage || imageError || compressingImage ? (
                  <div className="parachat-image-preview" style={imagePreviewShellStyle}>
                    {selectedImage ? (
                      <div style={imagePreviewContentStyle}>
                        <img
                          src={selectedImage.previewUrl}
                          alt="Selected Parachat upload"
                          style={imagePreviewStyle}
                        />

                        <div style={imagePreviewTextStyle}>
                          <strong>Photo ready</strong>
                          <span>
                            Compressed to {(selectedImage.sizeBytes / 1024).toFixed(0)} KB
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={clearSelectedImage}
                          style={imageRemoveButtonStyle}
                          aria-label="Remove selected photo"
                        >
                          Remove
                        </button>
                      </div>
                    ) : compressingImage ? (
                      <div style={imageHelperTextStyle}>Compressing photo...</div>
                    ) : imageError ? (
                      <div style={imageErrorTextStyle}>{imageError}</div>
                    ) : null}
                  </div>
                ) : null}

                <div className="parachat-composer-row" style={composerRowStyle}>
                  <button
                    type="button"
                    className="parachat-image-button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={inputDisabled || compressingImage}
                    style={{
                      ...imageButtonStyle,
                      opacity: inputDisabled || compressingImage ? 0.55 : 1,
                      cursor: inputDisabled || compressingImage ? "not-allowed" : "pointer",
                    }}
                    aria-label="Add a photo to this Parachat"
                    title="Add photo"
                  >
                    +
                  </button>

                  <button
                    type="button"
                    className="parachat-voice-button"
                    onClick={() => setVoiceComingSoonOpen(true)}
                    style={voiceComingSoonButtonStyle}
                    aria-label="Voice messaging coming soon"
                    title="Voice messaging coming soon"
                  >
                    <MicrophoneIcon size={19} />
                  </button>

                  <textarea
                    ref={textareaRef}
                    value={messageText}
                    onChange={handleTextChange}
                    onKeyDown={handleComposerKeyDown}
                    placeholder={
                      activeConversationIsBlocked
                        ? "Messaging unavailable"
                        : activeConversationIsAcceptedFriend
                          ? selectedImage
                            ? "Add a caption..."
                            : "Message..."
                          : "Friends only"
                    }
                    rows={1}
                    style={composerInputStyle}
                    disabled={inputDisabled}
                  />

                  <button
                    type="submit"
                    disabled={sendDisabled}
                    style={{
                      ...sendButtonStyle,
                      opacity: sendDisabled ? 0.55 : 1,
                      cursor: sendDisabled ? "not-allowed" : "pointer",
                    }}
                  >
                    {sending ? "Sending..." : selectedImage ? "Send Photo" : "Send"}
                  </button>
                </div>
              </form>
            </>
          )}
        </main>
      </div>

      {openConversationMenuConversation ? (
        <>
          <button
            type="button"
            aria-label="Close Parachat options"
            onClick={closeConversationOptions}
            style={
              conversationOptionsUsesBottomSheet
                ? messageOptionsOverlayBackdropStyle
                : messageOptionsDesktopBackdropStyle
            }
          />

          <div
            style={
              conversationOptionsUsesBottomSheet
                ? messageOptionsActionSheetStyle
                : {
                    ...messageOptionsDesktopPopoverStyle,
                    top: conversationMenuAnchor?.top ?? 80,
                    left: conversationMenuAnchor?.left ?? 16,
                  }
            }
            role={conversationOptionsUsesBottomSheet ? "dialog" : "menu"}
            aria-modal={conversationOptionsUsesBottomSheet ? "true" : undefined}
            aria-label={`Parachat options for ${getProfileName(openConversationMenuConversation.otherProfile)}`}
            onClick={(event) => event.stopPropagation()}
          >
            {conversationOptionsUsesBottomSheet ? (
              <div style={mobileMessageOptionsHeaderStyle}>
                <span style={mobileMessageOptionsHandleStyle} />
                <span style={mobileMessageOptionsTitleStyle}>Parachat options</span>
              </div>
            ) : null}

            <Link
              href={`/profile/${openConversationMenuConversation.otherUserId}`}
              onClick={closeConversationOptions}
              style={{
                ...(conversationOptionsUsesBottomSheet
                  ? messageOptionButtonStyle
                  : messageDesktopOptionButtonStyle),
                display: "block",
                textDecoration: "none",
              }}
            >
              View profile
            </Link>

            <button
              type="button"
              onClick={() => handleRequestDeleteConversation(openConversationMenuConversation)}
              style={
                conversationOptionsUsesBottomSheet
                  ? messageDeleteOptionButtonStyle
                  : messageDesktopDeleteOptionButtonStyle
              }
            >
              Delete chat
            </button>

            <button
              type="button"
              onClick={closeConversationOptions}
              style={
                conversationOptionsUsesBottomSheet
                  ? messageCancelOptionButtonStyle
                  : messageDesktopCancelOptionButtonStyle
              }
            >
              Cancel
            </button>
          </div>
        </>
      ) : null}

      {openMessageMenuMessage ? (
        <>
          <button
            type="button"
            aria-label="Close message options"
            onClick={closeMessageOptions}
            style={messageOptionsUsesBottomSheet ? messageOptionsOverlayBackdropStyle : messageOptionsDesktopBackdropStyle}
          />

          <div
            style={
              messageOptionsUsesBottomSheet
                ? messageOptionsActionSheetStyle
                : {
                    ...messageOptionsDesktopPopoverStyle,
                    top: messageMenuAnchor?.top ?? 80,
                    left: messageMenuAnchor?.left ?? 16,
                  }
            }
            role={messageOptionsUsesBottomSheet ? "dialog" : "menu"}
            aria-modal={messageOptionsUsesBottomSheet ? "true" : undefined}
            aria-label="Message options"
            onClick={(event) => event.stopPropagation()}
          >
            {messageOptionsUsesBottomSheet ? (
              <div style={mobileMessageOptionsHeaderStyle}>
                <span style={mobileMessageOptionsHandleStyle} />
                <span style={mobileMessageOptionsTitleStyle}>Message options</span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => handleOpenShareMessage(openMessageMenuMessage)}
              style={messageOptionsUsesBottomSheet ? messageOptionButtonStyle : messageDesktopOptionButtonStyle}
              disabled={openMessageMenuIsSaving || openMessageMenuIsDeleting || openMessageMenuIsSharing}
            >
              Share to Parachat
            </button>

            {openMessageMenuIsMine ? (
              <>
                <button
                  type="button"
                  onClick={() => handleStartEditMessage(openMessageMenuMessage)}
                  style={messageOptionsUsesBottomSheet ? messageOptionButtonStyle : messageDesktopOptionButtonStyle}
                  disabled={openMessageMenuIsSaving || openMessageMenuIsDeleting || openMessageMenuIsSharing}
                >
                  Edit message
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteMessage(openMessageMenuMessage)}
                  style={messageOptionsUsesBottomSheet ? messageDeleteOptionButtonStyle : messageDesktopDeleteOptionButtonStyle}
                  disabled={openMessageMenuIsSaving || openMessageMenuIsDeleting || openMessageMenuIsSharing}
                >
                  {openMessageMenuIsDeleting ? "Deleting..." : "Delete message"}
                </button>
              </>
            ) : null}

            <button
              type="button"
              onClick={closeMessageOptions}
              style={messageOptionsUsesBottomSheet ? messageCancelOptionButtonStyle : messageDesktopCancelOptionButtonStyle}
            >
              Cancel
            </button>
          </div>
        </>
      ) : null}

      {sharingMessage ? (
        <div
          style={shareOverlayStyle}
          onClick={handleCloseShareMessage}
          role="dialog"
          aria-modal="true"
          aria-label="Share Parachat message"
        >
          <div style={shareSheetStyle} onClick={(event) => event.stopPropagation()}>
            <div style={shareSheetHeaderStyle}>
              <div>
                <strong style={shareSheetTitleStyle}>Share to Parachat</strong>
                <div style={shareSheetSubtitleStyle}>
                  Choose an accepted friend to forward this {isImageMessage(sharingMessage) ? "photo" : "message"}.
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseShareMessage}
                style={shareSheetCloseButtonStyle}
                aria-label="Close share menu"
                disabled={Boolean(sharingMessageId)}
              >
                ×
              </button>
            </div>

            <div style={sharePreviewStyle}>
              <span style={sharePreviewLabelStyle}>
                {isImageMessage(sharingMessage) ? "Photo message" : "Message"}
              </span>
              <span style={sharePreviewTextStyle}>
                {(sharingMessage.body || "").trim() || (isImageMessage(sharingMessage) ? "Shared photo" : "Message")}
              </span>
            </div>

            <div style={shareFriendListStyle}>
              {shareableConversations.length === 0 ? (
                <div style={shareEmptyStyle}>
                  No other accepted friends are available to share with yet.
                </div>
              ) : (
                shareableConversations.map((conversation) => {
                  const profile = conversation.otherProfile;
                  const sharingNow = sharingMessageId === sharingMessage.id;

                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => handleShareMessageToConversation(conversation)}
                      style={shareFriendButtonStyle}
                      disabled={sharingNow}
                    >
                      <span style={shareFriendAvatarStyle}>
                        {profile?.avatar_url ? (
                          <img src={profile.avatar_url} alt="" style={shareFriendAvatarImageStyle} />
                        ) : (
                          <span>{getInitial(profile)}</span>
                        )}
                      </span>

                      <span style={shareFriendTextStyle}>
                        <strong>{getProfileName(profile)}</strong>
                        <span>{sharingNow ? "Sharing..." : "Send in Parachat"}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}

      {conversationDeleteTarget ? (
        <div
          style={conversationDeleteModalOverlayStyle}
          onClick={handleCancelDeleteConversation}
          role="dialog"
          aria-modal="true"
          aria-label="Delete Parachat conversation"
        >
          <div
            style={conversationDeleteModalShellStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={conversationDeleteModalIconStyle}>!</div>
            <div style={conversationDeleteModalContentStyle}>
              <div style={conversationDeleteModalEyebrowStyle}>Delete Parachat</div>
              <h3 style={conversationDeleteModalTitleStyle}>
                Delete chat with {getProfileName(conversationDeleteTarget.otherProfile)}?
              </h3>
              <p style={conversationDeleteModalTextStyle}>
                This removes the conversation from your inbox. It does not block this person, unfriend them, or delete the chat from their account.
              </p>
            </div>

            <div style={conversationDeleteModalActionsStyle}>
              <button
                type="button"
                onClick={handleCancelDeleteConversation}
                disabled={Boolean(deletingConversationId)}
                style={conversationDeleteCancelButtonStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteConversation(conversationDeleteTarget)}
                disabled={deletingConversationId === conversationDeleteTarget.id}
                style={conversationDeleteConfirmButtonStyle}
              >
                {deletingConversationId === conversationDeleteTarget.id ? "Deleting..." : "Delete chat"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {voiceComingSoonOpen ? (
        <div
          style={voiceComingSoonOverlayStyle}
          onClick={() => setVoiceComingSoonOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Voice messaging coming soon"
        >
          <div
            style={voiceComingSoonShellStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={voiceComingSoonIconStyle}>
              <MicrophoneIcon size={24} />
            </div>
            <div style={voiceComingSoonContentStyle}>
              <div style={voiceComingSoonEyebrowStyle}>Future Parachat upgrade</div>
              <h3 style={voiceComingSoonTitleStyle}>Voice messaging is coming soon</h3>
              <p style={voiceComingSoonTextStyle}>
                Soon you’ll be able to send quick voice messages inside Parachat. This feature is being prepared for a future update.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setVoiceComingSoonOpen(false)}
              style={voiceComingSoonButtonConfirmStyle}
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}

      {imageViewer ? (
        <div
          style={imageViewerOverlayStyle}
          onClick={handleCloseImageViewer}
          role="dialog"
          aria-modal="true"
          aria-label="Parachat photo viewer"
        >
          <div style={imageViewerShellStyle} onClick={(event) => event.stopPropagation()}>
            <div style={imageViewerTopBarStyle}>
              <div style={imageViewerMetaStyle}>
                <strong>{imageViewer.senderName}</strong>
                <span>{imageViewer.timeLabel}</span>
              </div>

              <button
                type="button"
                onClick={handleCloseImageViewer}
                style={imageViewerCloseButtonStyle}
                aria-label="Close photo viewer"
              >
                ×
              </button>
            </div>

            <img
              src={imageViewer.url}
              alt={imageViewer.alt}
              style={imageViewerImageStyle}
            />

            {imageViewer.caption ? (
              <div style={imageViewerCaptionStyle}>{imageViewer.caption}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  overflowX: "hidden",
  background:
    "radial-gradient(circle at top left, rgba(168,85,247,0.30), transparent 34%), radial-gradient(circle at bottom right, rgba(34,211,238,0.12), transparent 30%), radial-gradient(circle at 50% 0%, rgba(236,72,153,0.10), transparent 28%), #05070a",
  color: "#f9fafb",
};

const shellStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "1500px",
  minHeight: "100dvh",
  margin: "0 auto",
  padding: "18px",
  display: "grid",
  gridTemplateColumns: "minmax(320px, 390px) minmax(0, 1fr)",
  gap: "18px",
  alignItems: "stretch",
};

const inboxStyle: React.CSSProperties = {
  height: "calc(100dvh - 36px)",
  minHeight: "calc(100dvh - 36px)",
  maxHeight: "calc(100dvh - 36px)",
  border: "1px solid rgba(255,255,255,0.10)",
  background:
    "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(7,10,16,0.94))",
  borderRadius: "30px",
  padding: "16px",
  boxShadow: "0 24px 70px rgba(0,0,0,0.38)",
  overflow: "hidden",
  backdropFilter: "blur(18px)",
};

const inboxHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "14px",
};

const backLinkStyle: React.CSSProperties = {
  color: "#d8b4fe",
  textDecoration: "none",
  fontWeight: 900,
  fontSize: "13px",
};

const brandTitleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 950,
  letterSpacing: "-0.04em",
};

const brandSubtitleStyle: React.CSSProperties = {
  color: "#a855f7",
  fontSize: "10px",
  letterSpacing: "0.28em",
  fontWeight: 900,
};

const heroCardStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "48px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "12px",
  padding: "14px",
  borderRadius: "24px",
  border: "1px solid rgba(168,85,247,0.28)",
  background:
    "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(255,255,255,0.055))",
  marginBottom: "12px",
};

const heroIconStyle: React.CSSProperties = {
  width: "48px",
  height: "48px",
  borderRadius: "18px",
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg, #a855f7, #7c3aed)",
  boxShadow: "0 14px 34px rgba(168,85,247,0.30)",
  fontSize: "22px",
};

const inboxTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "30px",
  fontWeight: 950,
  letterSpacing: "-0.06em",
};

const inboxSubtitleStyle: React.CSSProperties = {
  margin: "3px 0 0",
  color: "#9ca3af",
  fontSize: "13px",
};

const totalBadgeStyle: React.CSSProperties = {
  minWidth: "30px",
  height: "30px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg, #ec4899, #a855f7)",
  color: "#ffffff",
  fontWeight: 950,
  boxShadow: "0 10px 28px rgba(168,85,247,0.35)",
};

const statusStripStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  color: "#d1d5db",
  fontSize: "12px",
  fontWeight: 800,
  padding: "8px 10px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.045)",
  marginBottom: "12px",
};

const statusDotStyle: React.CSSProperties = {
  width: "8px",
  height: "8px",
  borderRadius: "999px",
  background: "#22c55e",
  boxShadow: "0 0 18px rgba(34,197,94,0.60)",
};

const statusMessageStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  color: "#d1fae5",
  fontSize: "12px",
  fontWeight: 850,
  padding: "9px 11px",
  borderRadius: "16px",
  border: "1px solid rgba(34,197,94,0.22)",
  background: "rgba(34,197,94,0.09)",
  marginBottom: "12px",
};

const successDotStyle: React.CSSProperties = {
  width: "8px",
  height: "8px",
  borderRadius: "999px",
  background: "#22c55e",
  boxShadow: "0 0 14px rgba(34,197,94,0.60)",
  flexShrink: 0,
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "46px",
  borderRadius: "18px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.065)",
  color: "#ffffff",
  outline: "none",
  padding: "0 14px",
  marginBottom: "14px",
};

const conversationListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  maxHeight: "calc(100vh - 300px)",
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "contain",
  paddingRight: 2,
};

const conversationEmptyStyle: React.CSSProperties = {
  color: "#9ca3af",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.045)",
  borderRadius: "18px",
  padding: "16px",
  lineHeight: 1.5,
};

const conversationItemStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.045)",
  color: "#f9fafb",
  borderRadius: "20px",
  padding: "11px",
  display: "flex",
  alignItems: "center",
  gap: "11px",
  cursor: "pointer",
  textAlign: "left",
  transition: "transform 160ms ease, border-color 160ms ease, background 160ms ease",
};

const conversationItemActiveStyle: React.CSSProperties = {
  ...conversationItemStyle,
  border: "1px solid rgba(168,85,247,0.55)",
  background:
    "linear-gradient(135deg, rgba(168,85,247,0.24), rgba(255,255,255,0.065))",
  boxShadow: "0 14px 38px rgba(0,0,0,0.30)",
};

const conversationSelectButtonStyle: React.CSSProperties = {
  minWidth: 0,
  flex: 1,
  border: 0,
  background: "transparent",
  color: "inherit",
  padding: 0,
  display: "flex",
  alignItems: "center",
  gap: "11px",
  textAlign: "left",
  cursor: "pointer",
};

const conversationMenuWrapStyle: React.CSSProperties = {
  position: "relative",
  flexShrink: 0,
  alignSelf: "center",
};

const conversationMenuButtonStyle: React.CSSProperties = {
  width: "26px",
  height: "26px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.045)",
  color: "#d1d5db",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  fontSize: "15px",
  lineHeight: 1,
  fontWeight: 950,
};

const conversationMenuStyle: React.CSSProperties = {
  position: "absolute",
  right: 0,
  bottom: "34px",
  zIndex: 120,
  minWidth: "170px",
  borderRadius: "13px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(7,10,16,0.98)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.44)",
  padding: "6px",
  backdropFilter: "blur(16px)",
};

const conversationDeleteButtonStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(248,113,113,0.20)",
  background: "rgba(248,113,113,0.10)",
  color: "#fecaca",
  borderRadius: "10px",
  padding: "7px 9px",
  textAlign: "left",
  fontWeight: 900,
  fontSize: "11px",
  cursor: "pointer",
};

const conversationDeleteModalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 500,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "18px",
  background: "rgba(3,7,18,0.72)",
  backdropFilter: "blur(16px)",
};

const conversationDeleteModalShellStyle: React.CSSProperties = {
  width: "min(94vw, 430px)",
  borderRadius: "26px",
  border: "1px solid rgba(255,255,255,0.14)",
  background:
    "linear-gradient(180deg, rgba(17,24,39,0.98), rgba(7,10,16,0.98))",
  boxShadow: "0 30px 90px rgba(0,0,0,0.56)",
  padding: "20px",
  color: "#f9fafb",
};

const conversationDeleteModalIconStyle: React.CSSProperties = {
  width: "42px",
  height: "42px",
  borderRadius: "16px",
  display: "grid",
  placeItems: "center",
  marginBottom: "14px",
  border: "1px solid rgba(248,113,113,0.34)",
  background: "rgba(248,113,113,0.13)",
  color: "#fecaca",
  fontWeight: 950,
  fontSize: "22px",
  lineHeight: 1,
};

const conversationDeleteModalContentStyle: React.CSSProperties = {
  display: "grid",
  gap: "6px",
};

const conversationDeleteModalEyebrowStyle: React.CSSProperties = {
  color: "#fca5a5",
  fontSize: "11px",
  fontWeight: 950,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

const conversationDeleteModalTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#ffffff",
  fontSize: "22px",
  lineHeight: 1.12,
  letterSpacing: "-0.04em",
  fontWeight: 950,
};

const conversationDeleteModalTextStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#aeb7c7",
  fontSize: "14px",
  lineHeight: 1.55,
};

const conversationDeleteModalActionsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "10px",
  marginTop: "18px",
};

const conversationDeleteCancelButtonStyle: React.CSSProperties = {
  minHeight: "44px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.055)",
  color: "#f3f4f6",
  borderRadius: "999px",
  fontWeight: 950,
  cursor: "pointer",
};

const conversationDeleteConfirmButtonStyle: React.CSSProperties = {
  minHeight: "44px",
  border: "1px solid rgba(248,113,113,0.28)",
  background: "linear-gradient(135deg, rgba(239,68,68,0.96), rgba(185,28,28,0.96))",
  color: "#ffffff",
  borderRadius: "999px",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 14px 34px rgba(239,68,68,0.22)",
};

const conversationAvatarWrapStyle: React.CSSProperties = {
  width: "52px",
  height: "52px",
  borderRadius: "50%",
  position: "relative",
  flexShrink: 0,
  border: "2px solid rgba(168,85,247,0.72)",
  padding: "2px",
  background: "#05070a",
  overflow: "visible",
  isolation: "isolate",
};

const conversationAvatarImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  objectFit: "cover",
};

const conversationAvatarFallbackStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  fontWeight: 950,
  background: "linear-gradient(135deg, #7c3aed, #111827)",
};

const onlineDotStyle: React.CSSProperties = {
  position: "absolute",
  right: "-1px",
  bottom: "-1px",
  width: "12px",
  height: "12px",
  borderRadius: "999px",
  background: "#22c55e",
  border: "2px solid #05070a",
  boxShadow: "0 0 10px rgba(34,197,94,0.65)",
  zIndex: 5,
  pointerEvents: "none",
};

const conversationTextStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const conversationTopLineStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
};

const conversationNameStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "14px",
};

const conversationTimeStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "11px",
  fontWeight: 800,
  flexShrink: 0,
};

const conversationBottomLineStyle: React.CSSProperties = {
  marginTop: "4px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
};

const conversationPreviewStyle: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "12px",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const unreadBadgeStyle: React.CSSProperties = {
  minWidth: "21px",
  height: "21px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg, #ec4899, #a855f7)",
  color: "#ffffff",
  fontSize: "11px",
  fontWeight: 950,
};

const newFriendBadgeStyle: React.CSSProperties = {
  minHeight: "21px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background: "rgba(168,85,247,0.16)",
  border: "1px solid rgba(168,85,247,0.28)",
  color: "#f5d0fe",
  fontSize: "10px",
  fontWeight: 950,
  padding: "0 7px",
  whiteSpace: "nowrap",
};

const chatPanelStyle: React.CSSProperties = {
  height: "calc(100dvh - 36px)",
  minHeight: "calc(100dvh - 36px)",
  maxHeight: "calc(100dvh - 36px)",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(7,10,16,0.90)",
  borderRadius: "30px",
  overflow: "hidden",
  display: "grid",
  gridTemplateRows: "86px minmax(0, 1fr) auto",
  boxShadow: "0 24px 70px rgba(0,0,0,0.38)",
  backdropFilter: "blur(18px)",
};

const selectConversationStyle: React.CSSProperties = {
  minHeight: "calc(100vh - 36px)",
  display: "grid",
  placeItems: "center",
  color: "#9ca3af",
  textAlign: "center",
  gap: "8px",
};

const emptyIconStyle: React.CSSProperties = {
  width: "62px",
  height: "62px",
  borderRadius: "22px",
  display: "grid",
  placeItems: "center",
  background: "rgba(168,85,247,0.16)",
  border: "1px solid rgba(168,85,247,0.24)",
  fontSize: "26px",
  margin: "0 auto 6px",
};

const chatHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "14px",
  padding: "14px 18px",
  borderBottom: "1px solid rgba(255,255,255,0.10)",
  background:
    "linear-gradient(135deg, rgba(17,24,39,0.96), rgba(88,28,135,0.34), rgba(8,12,18,0.96))",
};

const headerLeftStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  minWidth: 0,
};

const headerActionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "8px",
  flexShrink: 0,
  flexWrap: "wrap",
};

const mobileBackButtonStyle: React.CSSProperties = {
  display: "none",
  width: "38px",
  height: "38px",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "#ffffff",
  fontSize: "18px",
  cursor: "pointer",
  flexShrink: 0,
};

const avatarWrapStyle: React.CSSProperties = {
  width: "54px",
  height: "54px",
  borderRadius: "50%",
  position: "relative",
  border: "2px solid rgba(168,85,247,0.82)",
  padding: "2px",
  background: "#090b12",
  flexShrink: 0,
  overflow: "visible",
  isolation: "isolate",
};

const avatarImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  objectFit: "cover",
};

const avatarFallbackStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  fontWeight: 950,
  background: "linear-gradient(135deg, #7c3aed, #111827)",
};

const headerTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "19px",
  fontWeight: 950,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const headerSubtitleStyle: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "13px",
  marginTop: "3px",
};

const profileButtonStyle: React.CSSProperties = {
  textDecoration: "none",
  color: "#f9fafb",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  borderRadius: "999px",
  padding: "9px 13px",
  fontWeight: 900,
  fontSize: "13px",
  flexShrink: 0,
};

const closeChatButtonStyle: React.CSSProperties = {
  width: "38px",
  height: "38px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.075)",
  color: "#ffffff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "22px",
  lineHeight: 1,
  fontWeight: 950,
  cursor: "pointer",
  flexShrink: 0,
};

const messagesAreaStyle: React.CSSProperties = {
  minHeight: 0,
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "contain",
  padding: "18px",
};

const emptyStateStyle: React.CSSProperties = {
  minHeight: "100%",
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  gap: "7px",
  color: "#9ca3af",
};

const errorBoxStyle: React.CSSProperties = {
  border: "1px solid rgba(248,113,113,0.35)",
  background: "rgba(127,29,29,0.22)",
  color: "#fecaca",
  borderRadius: "18px",
  padding: "14px",
  fontWeight: 800,
  display: "grid",
  gap: "8px",
  alignContent: "start",
};

const retryButtonStyle: React.CSSProperties = {
  width: "fit-content",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.08)",
  color: "#ffffff",
  borderRadius: "999px",
  padding: "8px 12px",
  fontWeight: 900,
  cursor: "pointer",
};

const messageStackStyle: React.CSSProperties = {
  display: "grid",
  gap: "18px",
};

const messageGroupStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
};

const dateDividerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  margin: "6px 0",
  color: "#9ca3af",
  fontSize: "12px",
  fontWeight: 800,
};

const messageRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: "8px",
};

const smallAvatarStyle: React.CSSProperties = {
  width: "30px",
  height: "30px",
  borderRadius: "50%",
  background: "rgba(255,255,255,0.07)",
  display: "grid",
  placeItems: "center",
  color: "#f9fafb",
  fontSize: "12px",
  fontWeight: 900,
  flexShrink: 0,
  overflow: "hidden",
};

const smallAvatarImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const bubbleWrapStyle: React.CSSProperties = {
  maxWidth: "min(700px, 78%)",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const myBubbleStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #9333ea, #7c3aed)",
  color: "#ffffff",
  borderRadius: "20px 20px 6px 20px",
  padding: "11px 14px",
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  boxShadow: "0 12px 30px rgba(124,58,237,0.24)",
};

const theirBubbleStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.075)",
  color: "#f9fafb",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "20px 20px 20px 6px",
  padding: "11px 14px",
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const messageImageBlockStyle: React.CSSProperties = {
  display: "grid",
  gap: "8px",
};

const messageImageStyle: React.CSSProperties = {
  display: "block",
  width: "min(320px, 72vw)",
  maxHeight: "420px",
  objectFit: "cover",
  cursor: "zoom-in",
  borderRadius: "16px",
  border: "1px solid rgba(255,255,255,0.14)",
};

const messageImageMissingStyle: React.CSSProperties = {
  width: "min(320px, 72vw)",
  minHeight: "170px",
  borderRadius: "16px",
  display: "grid",
  placeItems: "center",
  color: "#cbd5e1",
  background: "rgba(15,23,42,0.72)",
  border: "1px solid rgba(255,255,255,0.10)",
  fontWeight: 850,
};

const messageImageCaptionStyle: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const messageTimeStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "11px",
  fontWeight: 700,
  padding: "0 4px",
};

const messageMetaRowStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "4px",
  minHeight: "20px",
  padding: "0 2px",
};

const messageOptionsWrapStyle: React.CSSProperties = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
};

const messageOptionsButtonStyle: React.CSSProperties = {
  width: "22px",
  height: "20px",
  border: "1px solid transparent",
  borderRadius: "999px",
  background: "transparent",
  color: "#9ca3af",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 950,
  cursor: "pointer",
  lineHeight: 1,
  padding: 0,
};

const messageOptionsMenuStyle: React.CSSProperties = {
  position: "absolute",
  right: 0,
  bottom: "24px",
  zIndex: 55,
  minWidth: "168px",
  borderRadius: "13px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(7,10,16,0.98)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.44)",
  padding: "6px",
  backdropFilter: "blur(16px)",
};

const messageOptionsOverlayBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2147483000,
  border: "none",
  background: "rgba(0,0,0,0.32)",
  padding: 0,
  cursor: "pointer",
};

const messageOptionsDesktopBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2147483000,
  border: "none",
  background: "transparent",
  padding: 0,
  cursor: "default",
};

const messageOptionsDesktopPopoverStyle: React.CSSProperties = {
  position: "fixed",
  zIndex: 2147483001,
  width: "210px",
  borderRadius: "16px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(7,10,16,0.99))",
  boxShadow: "0 18px 44px rgba(0,0,0,0.50), 0 0 24px rgba(168,85,247,0.12)",
  padding: "7px",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
};

const messageOptionsActionSheetStyle: React.CSSProperties = {
  position: "fixed",
  left: "max(12px, env(safe-area-inset-left))",
  right: "max(12px, env(safe-area-inset-right))",
  bottom: "calc(12px + env(safe-area-inset-bottom))",
  zIndex: 2147483001,
  borderRadius: "24px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(7,10,16,0.99))",
  boxShadow: "0 -18px 44px rgba(0,0,0,0.52)",
  padding: "8px",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
};

const mobileMessageOptionsHeaderStyle: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  gap: "8px",
  padding: "8px 10px 10px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  marginBottom: "8px",
};

const mobileMessageOptionsHandleStyle: React.CSSProperties = {
  width: "42px",
  height: "4px",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.25)",
};

const mobileMessageOptionsTitleStyle: React.CSSProperties = {
  color: "#f9fafb",
  fontSize: "13px",
  fontWeight: 950,
  letterSpacing: "-0.01em",
};

const messageOptionButtonStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.055)",
  color: "#f3e8ff",
  borderRadius: "10px",
  padding: "7px 9px",
  textAlign: "left",
  fontWeight: 900,
  fontSize: "11px",
  cursor: "pointer",
  marginBottom: "5px",
};

const messageDesktopOptionButtonStyle: React.CSSProperties = {
  ...messageOptionButtonStyle,
  borderRadius: "11px",
  padding: "10px 11px",
  fontSize: "12px",
  marginBottom: "6px",
  background: "rgba(255,255,255,0.045)",
};

const messageDeleteOptionButtonStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(248,113,113,0.20)",
  background: "rgba(248,113,113,0.10)",
  color: "#fecaca",
  borderRadius: "10px",
  padding: "7px 9px",
  textAlign: "left",
  fontWeight: 900,
  fontSize: "11px",
  cursor: "pointer",
};

const messageDesktopDeleteOptionButtonStyle: React.CSSProperties = {
  ...messageDesktopOptionButtonStyle,
  color: "#fecaca",
  borderColor: "rgba(248,113,113,0.22)",
  background: "rgba(127,29,29,0.18)",
};

const messageCancelOptionButtonStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.035)",
  color: "#e5e7eb",
  borderRadius: "10px",
  padding: "8px 9px",
  textAlign: "center",
  fontWeight: 950,
  fontSize: "11px",
  cursor: "pointer",
};

const messageDesktopCancelOptionButtonStyle: React.CSSProperties = {
  ...messageDesktopOptionButtonStyle,
  marginBottom: 0,
  textAlign: "center",
  color: "#d1d5db",
};

const messageEditBoxStyle: React.CSSProperties = {
  display: "grid",
  gap: "8px",
  minWidth: "min(320px, 66vw)",
};

const messageEditTextareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "82px",
  resize: "vertical",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: "14px",
  background: "rgba(3,7,18,0.34)",
  color: "#ffffff",
  padding: "10px 11px",
  outline: "none",
  fontSize: "14px",
  lineHeight: 1.45,
  fontWeight: 650,
  boxSizing: "border-box",
};

const messageEditActionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "8px",
};

const messageEditCancelButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.08)",
  color: "#f3f4f6",
  padding: "7px 11px",
  fontSize: "12px",
  fontWeight: 900,
  cursor: "pointer",
};

const messageEditSaveButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.22)",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.18)",
  color: "#ffffff",
  padding: "7px 13px",
  fontSize: "12px",
  fontWeight: 950,
  cursor: "pointer",
};

const shareOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9998,
  display: "grid",
  placeItems: "center",
  padding: "clamp(14px, 4vw, 34px)",
  background: "rgba(3,7,18,0.78)",
  backdropFilter: "blur(16px)",
};

const shareSheetStyle: React.CSSProperties = {
  width: "min(440px, 100%)",
  maxHeight: "min(620px, calc(100dvh - 34px))",
  overflowY: "auto",
  borderRadius: "26px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "linear-gradient(180deg, rgba(17,24,39,0.98), rgba(7,10,16,0.98))",
  boxShadow: "0 28px 80px rgba(0,0,0,0.50)",
  padding: "16px",
  color: "#f9fafb",
};

const shareSheetHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "12px",
};

const shareSheetTitleStyle: React.CSSProperties = {
  display: "block",
  fontSize: "18px",
  fontWeight: 950,
  letterSpacing: "-0.035em",
};

const shareSheetSubtitleStyle: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "12px",
  fontWeight: 750,
  lineHeight: 1.45,
  marginTop: "3px",
};

const shareSheetCloseButtonStyle: React.CSSProperties = {
  width: "34px",
  height: "34px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.07)",
  color: "#ffffff",
  fontSize: "22px",
  fontWeight: 900,
  cursor: "pointer",
  lineHeight: 1,
};

const sharePreviewStyle: React.CSSProperties = {
  display: "grid",
  gap: "5px",
  padding: "12px",
  borderRadius: "18px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.045)",
  marginBottom: "12px",
};

const sharePreviewLabelStyle: React.CSSProperties = {
  color: "#d8b4fe",
  fontSize: "11px",
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const sharePreviewTextStyle: React.CSSProperties = {
  color: "#e5e7eb",
  fontSize: "13px",
  fontWeight: 750,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  display: "-webkit-box",
  WebkitLineClamp: 4,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const shareFriendListStyle: React.CSSProperties = {
  display: "grid",
  gap: "8px",
};

const shareFriendButtonStyle: React.CSSProperties = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "42px minmax(0, 1fr)",
  alignItems: "center",
  gap: "10px",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "18px",
  background: "rgba(255,255,255,0.055)",
  color: "#ffffff",
  padding: "10px",
  textAlign: "left",
  cursor: "pointer",
};

const shareFriendAvatarStyle: React.CSSProperties = {
  width: "42px",
  height: "42px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
  background: "linear-gradient(135deg, #a855f7, #111827)",
  color: "#ffffff",
  fontWeight: 950,
};

const shareFriendAvatarImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const shareFriendTextStyle: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: "2px",
};

const shareEmptyStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "18px",
  background: "rgba(255,255,255,0.04)",
  color: "#9ca3af",
  fontSize: "13px",
  fontWeight: 800,
  padding: "14px",
  textAlign: "center",
};

const imageViewerOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  display: "grid",
  placeItems: "center",
  padding: "clamp(14px, 4vw, 34px)",
  background: "rgba(3,7,18,0.88)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
};

const imageViewerShellStyle: React.CSSProperties = {
  width: "min(980px, 100%)",
  maxHeight: "calc(100dvh - 28px)",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
  gap: "12px",
  borderRadius: "26px",
  border: "1px solid rgba(168,85,247,0.32)",
  background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(3,7,18,0.98))",
  boxShadow: "0 28px 90px rgba(0,0,0,0.55), 0 0 44px rgba(168,85,247,0.24)",
  padding: "12px",
  overflow: "hidden",
};

const imageViewerTopBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  padding: "4px 4px 0",
};

const imageViewerMetaStyle: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: "2px",
  color: "#f9fafb",
  fontSize: "14px",
};

const imageViewerCloseButtonStyle: React.CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.08)",
  color: "#ffffff",
  display: "grid",
  placeItems: "center",
  fontSize: "24px",
  lineHeight: 1,
  fontWeight: 900,
  cursor: "pointer",
  flexShrink: 0,
};

const imageViewerImageStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  maxHeight: "calc(100dvh - 150px)",
  objectFit: "contain",
  borderRadius: "20px",
  background: "rgba(0,0,0,0.34)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const imageViewerCaptionStyle: React.CSSProperties = {
  color: "#e5e7eb",
  fontSize: "14px",
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  padding: "0 4px 3px",
};

const composerShellStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
  width: "100%",
  boxSizing: "border-box",
  padding: "14px",
  borderTop: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(3,7,18,0.92)",
};

const blockedParachatNoticeStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: "18px",
  border: "1px solid rgba(248,113,113,0.30)",
  background: "rgba(127,29,29,0.20)",
  color: "#fecaca",
  padding: "11px 12px",
  fontSize: "12px",
  fontWeight: 850,
  lineHeight: 1.35,
};

const composerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  width: "100%",
  minWidth: 0,
};

const imageButtonStyle: React.CSSProperties = {
  width: "44px",
  minWidth: "44px",
  height: "44px",
  borderRadius: "999px",
  border: "1px solid rgba(168,85,247,0.45)",
  background: "rgba(168,85,247,0.14)",
  color: "#f5d0fe",
  fontSize: "24px",
  lineHeight: 1,
  fontWeight: 900,
  display: "grid",
  placeItems: "center",
};

const voiceComingSoonButtonStyle: React.CSSProperties = {
  width: "44px",
  minWidth: "44px",
  height: "44px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.055)",
  color: "#e9d5ff",
  display: "grid",
  placeItems: "center",
  opacity: 0.62,
  cursor: "pointer",
  flexShrink: 0,
  boxShadow: "inset 0 0 0 1px rgba(168,85,247,0.08)",
};

const voiceComingSoonOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "18px",
  background: "rgba(3,7,18,0.76)",
  backdropFilter: "blur(16px)",
};

const voiceComingSoonShellStyle: React.CSSProperties = {
  width: "min(94vw, 430px)",
  borderRadius: "26px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "linear-gradient(180deg, rgba(17,24,39,0.98), rgba(7,10,16,0.98))",
  boxShadow: "0 30px 90px rgba(0,0,0,0.56)",
  padding: "20px",
  color: "#f9fafb",
};

const voiceComingSoonIconStyle: React.CSSProperties = {
  width: "46px",
  height: "46px",
  borderRadius: "17px",
  display: "grid",
  placeItems: "center",
  marginBottom: "14px",
  border: "1px solid rgba(168,85,247,0.34)",
  background: "rgba(168,85,247,0.13)",
  color: "#e9d5ff",
  boxShadow: "0 14px 34px rgba(168,85,247,0.20)",
};

const voiceComingSoonContentStyle: React.CSSProperties = {
  display: "grid",
  gap: "6px",
};

const voiceComingSoonEyebrowStyle: React.CSSProperties = {
  color: "#c4b5fd",
  fontSize: "11px",
  fontWeight: 950,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

const voiceComingSoonTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#ffffff",
  fontSize: "22px",
  lineHeight: 1.12,
  letterSpacing: "-0.04em",
  fontWeight: 950,
};

const voiceComingSoonTextStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#aeb7c7",
  fontSize: "14px",
  lineHeight: 1.55,
};

const voiceComingSoonButtonConfirmStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "46px",
  borderRadius: "999px",
  border: "1px solid rgba(168,85,247,0.55)",
  background: "linear-gradient(135deg, #a855f7, #7c3aed)",
  color: "#ffffff",
  fontWeight: 950,
  fontSize: "14px",
  marginTop: "18px",
  cursor: "pointer",
};

const imagePreviewShellStyle: React.CSSProperties = {
  border: "1px solid rgba(168,85,247,0.24)",
  background: "rgba(168,85,247,0.10)",
  borderRadius: "18px",
  padding: "9px",
};

const imagePreviewContentStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  minWidth: 0,
};

const imagePreviewStyle: React.CSSProperties = {
  width: "56px",
  height: "56px",
  borderRadius: "14px",
  objectFit: "cover",
  flexShrink: 0,
  border: "1px solid rgba(255,255,255,0.14)",
};

const imagePreviewTextStyle: React.CSSProperties = {
  display: "grid",
  gap: "3px",
  minWidth: 0,
  color: "#f9fafb",
  fontSize: "12px",
};

const imageRemoveButtonStyle: React.CSSProperties = {
  marginLeft: "auto",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.07)",
  color: "#ffffff",
  borderRadius: "999px",
  padding: "8px 10px",
  fontWeight: 900,
  fontSize: "12px",
  cursor: "pointer",
};

const imageHelperTextStyle: React.CSSProperties = {
  color: "#ddd6fe",
  fontSize: "13px",
  fontWeight: 850,
};

const imageErrorTextStyle: React.CSSProperties = {
  color: "#fecaca",
  fontSize: "13px",
  fontWeight: 850,
};

const composerInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  boxSizing: "border-box",
  minHeight: "44px",
  maxHeight: "130px",
  resize: "none",
  overflowY: "hidden",
  borderRadius: "18px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.065)",
  color: "#ffffff",
  outline: "none",
  padding: "12px 14px",
  lineHeight: 1.45,
  fontSize: "14px",
};

const sendButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  minHeight: "44px",
  borderRadius: "999px",
  border: "1px solid rgba(168,85,247,0.55)",
  background: "linear-gradient(135deg, #a855f7, #7c3aed)",
  color: "#ffffff",
  padding: "0 18px",
  fontWeight: 950,
};

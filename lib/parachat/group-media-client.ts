import { supabase } from "@/lib/supabase";
import {
  PAGE_IMAGE_ACCEPT,
  preparePageImage,
} from "@/lib/creatorverse/page-image-preparation";

import {
  isCommunityStagingTarget,
} from "@/lib/community/release-target";

const bucket = "parachat-group-media";

const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export const GROUP_PHOTO_MAX_BYTES = 8388608;
export const GROUP_VIDEO_MAX_BYTES = 33554432;
export const GROUP_VIDEO_MAX_SECONDS = 120;

export const GROUP_MEDIA_ACCEPT =
  `${PAGE_IMAGE_ACCEPT},video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov`;

function ensureStaging() {
  if (
    !isCommunityStagingTarget(
      process.env.NEXT_PUBLIC_SUPABASE_URL
    )
  ) {
    throw new Error("Group chat media is unavailable.");
  }
}

function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

async function requireSession() {
  ensureStaging();

  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    throw new Error("Sign in to continue.");
  }

  return data.session;
}

async function requestMedia(
  url: string,
  method: "GET" | "POST",
  accessToken: string
) {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "The media request could not be completed."
    );
  }

  return data;
}

export async function uploadGroupChatMedia(
  conversationId: string,
  file: File,
  onStatus?: (
    status: "reserving" | "uploading" | "verifying"
  ) => void
): Promise<string> {
  const session = await requireSession();

  if (!validId(conversationId)) {
    throw new Error("Invalid group conversation.");
  }

  const sourceType = file.type.toLowerCase();

  if (
    sourceType.startsWith("image/") ||
    (
      (!sourceType || sourceType === "application/octet-stream") &&
      /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)
    )
  ) {
    file = await preparePageImage(file, "cover");
  }

  const preparedSession = await requireSession();

  if (preparedSession.user.id !== session.user.id) {
    throw new Error("Your session has changed.");
  }

  const actualMime = file.type.toLowerCase();

  const isQuickTime =
    actualMime === "video/quicktime" ||
    (
      /\.mov$/i.test(file.name) &&
      ["", "application/octet-stream", "video/mp4"].includes(actualMime)
    );

  const mime = isQuickTime ? "video/mp4" : actualMime;

  const uploadBucket = isQuickTime
    ? "parachat-group-conversion"
    : bucket;

  const uploadMime = isQuickTime
    ? "video/quicktime"
    : mime;

  if (!Object.hasOwn(extensions, mime)) {
    throw new Error(
      "Choose a supported photo, MP4, WebM or MOV video."
    );
  }

  const maxBytes = mime.startsWith("image/")
    ? GROUP_PHOTO_MAX_BYTES
    : GROUP_VIDEO_MAX_BYTES;

  if (file.size < 16 || file.size > maxBytes) {
    throw new Error(
      mime.startsWith("image/")
        ? "Photos must be no larger than 8 MB."
        : "Videos must be no larger than 32 MB."
    );
  }

  onStatus?.("reserving");

  const { data: reservation, error: reserveError } =
    await supabase.rpc("parachat_group_reserve_media", {
      p_conversation_id: conversationId,
      p_mime_type: mime,
    });

  if (
    reserveError ||
    !reservation ||
    !validId(reservation.id) ||
    reservation.mime_type !== mime
  ) {
    throw new Error("Media reservation was denied.");
  }

  const expectedPath =
    `${conversationId}/${session.user.id}/` +
    `${reservation.id}.${extensions[mime]}`;

  if (reservation.storage_path !== expectedPath) {
    throw new Error("Invalid media reservation.");
  }

  onStatus?.("uploading");

  const { error: uploadError } = await supabase.storage
    .from(uploadBucket)
    .upload(expectedPath, file, {
      contentType: uploadMime,
      cacheControl: "0",
      upsert: false,
    });

  if (uploadError) {
    throw new Error("Media upload failed.");
  }

  onStatus?.("verifying");

  const current = await requireSession();

  if (current.user.id !== session.user.id) {
    throw new Error("Your session has changed.");
  }

  const result = await requestMedia(
    `/api/parachat/groups/${conversationId}` +
      `/media/${reservation.id}/verify` +
      (isQuickTime ? "?source=quicktime" : ""),
    "POST",
    current.access_token
  );

  if (
    result.status !== "published" ||
    result.media_id !== reservation.id ||
    !validId(result.message_id)
  ) {
    throw new Error("Media publishing was not confirmed.");
  }

  return result.message_id;
}

export type GroupChatAttachment = {
  media_id: string;
  message_id: string;
  mime_type: string;
  verified_bytes: number;
  duration_seconds: number | null;
  signed_url: string;
  expires_in: number;
};

export async function getGroupChatAttachment(
  conversationId: string,
  messageId: string
): Promise<GroupChatAttachment> {
  const session = await requireSession();

  if (!validId(conversationId) || !validId(messageId)) {
    throw new Error("Invalid attachment identifier.");
  }

  const result = await requestMedia(
    `/api/parachat/groups/${conversationId}` +
      `/messages/${messageId}/attachment`,
    "GET",
    session.access_token
  );

  if (
    result.message_id !== messageId ||
    !validId(result.media_id) ||
    !Object.hasOwn(extensions, result.mime_type) ||
    typeof result.signed_url !== "string"
  ) {
    throw new Error("Invalid attachment response.");
  }

  const signedUrl = new URL(result.signed_url);
  const projectUrl = new URL(
    process.env.NEXT_PUBLIC_SUPABASE_URL!
  );

  if (
    signedUrl.protocol !== "https:" ||
    signedUrl.origin !== projectUrl.origin
  ) {
    throw new Error("Invalid attachment URL.");
  }

  return result as GroupChatAttachment;
}

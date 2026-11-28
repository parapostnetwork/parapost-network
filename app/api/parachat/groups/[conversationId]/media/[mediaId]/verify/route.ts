import {
  convertGroupQuickTimeVideo,
} from "@/lib/parachat/group-video-conversion";

import {
  requireGroupChatUser,
  groupChatAdmin,
  groupChatId,
  GroupChatError,
  groupChatResponse,
  groupChatErrorResponse,
} from "@/lib/parachat/group-server";

import {
  inspectCreatorVerseMediaBlob,
} from "@/lib/creatorverse/media-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const bucket = "parachat-group-media";

const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

type RouteContext = {
  params: Promise<{
    conversationId: string;
    mediaId: string;
  }>;
};

export async function POST(
  request: Request,
  context: RouteContext
): Promise<Response> {
  try {
    const params = await context.params;
    const conversationId = groupChatId(params.conversationId);
    const mediaId = groupChatId(params.mediaId);

    const { client, userId } =
      await requireGroupChatUser(request);

    const rpcArgs = {
      p_conversation_id: conversationId,
      p_media_id: mediaId,
    };

    const { data: media, error: pendingError } =
      await client.rpc(
        "parachat_group_pending_media",
        rpcArgs
      );

    if (pendingError || !media || media.id !== mediaId) {
      throw new GroupChatError(
        403,
        "Media reservation unavailable."
      );
    }

    const mime = media.mime_type;

    if (
      typeof mime !== "string" ||
      !Object.hasOwn(extensions, mime)
    ) {
      throw new GroupChatError(400, "Unsupported media type.");
    }

    const expectedPath =
      `${conversationId}/${userId}/${mediaId}.${extensions[mime]}`;

    if (media.storage_path !== expectedPath) {
      throw new GroupChatError(403, "Invalid media reservation.");
    }

    const admin = groupChatAdmin();

    const isQuickTime =
      new URL(request.url).searchParams.get("source") === "quicktime";

    const conversionBucket = "parachat-group-conversion";

    if (isQuickTime && mime !== "video/mp4") {
      throw new GroupChatError(400, "Invalid video reservation.");
    }

    const { data: uploaded, error: downloadError } =
      await admin.storage
        .from(isQuickTime ? conversionBucket : bucket)
        .download(expectedPath);

    let blob = uploaded;

    if (downloadError || !blob) {
      throw new GroupChatError(
        404,
        "Uploaded media unavailable."
      );
    }

    const isImage = mime.startsWith("image/");
    const maxBytes = isImage ? 8388608 : 33554432;

    if (
      !Number.isSafeInteger(blob.size) ||
      blob.size < 16 ||
      blob.size > maxBytes
    ) {
      throw new GroupChatError(400, "Invalid media size.");
    }

    let inspected;

    try {
      if (isQuickTime) {
        const converted = await convertGroupQuickTimeVideo(blob);

        blob = converted.blob;

        inspected = {
          ...converted.inspected,
          kind: "video" as const,
        };
      } else {
        inspected = await inspectCreatorVerseMediaBlob(
          blob,
          mime,
          120
        );
      }
    } catch {
      throw new GroupChatError(
        422,
        "Media failed trusted file inspection."
      );
    }

    if (
      inspected.mimeType !== mime ||
      inspected.kind !== (isImage ? "image" : "video")
    ) {
      throw new GroupChatError(422, "Media type mismatch.");
    }

    const current = await requireGroupChatUser(request);

    if (current.userId !== userId) {
      throw new GroupChatError(403, "Authorization changed.");
    }

    const { data: pending, error: recheckError } =
      await current.client.rpc(
        "parachat_group_pending_media",
        rpcArgs
      );

    if (
      recheckError ||
      !pending ||
      pending.id !== mediaId ||
      pending.storage_path !== expectedPath ||
      pending.mime_type !== mime
    ) {
      throw new GroupChatError(
        409,
        "Media reservation is no longer available."
      );
    }

    if (isQuickTime) {
      const { error: conversionUploadError } =
        await admin.storage.from(bucket).upload(
          expectedPath,
          blob,
          {
            contentType: "video/mp4",
            cacheControl: "0",
            upsert: false,
          }
        );

      if (conversionUploadError) {
        throw new GroupChatError(
          409,
          "Converted video could not be saved."
        );
      }
    }

    const { data: messageId, error: publishError } =
      await admin.rpc("parachat_group_publish_media", {
        p_conversation_id: conversationId,
        p_media_id: mediaId,
        p_uploader_id: userId,
        p_verified_bytes: blob.size,
        p_detected_mime_type: inspected.mimeType,
        p_duration_seconds:
          inspected.kind === "video"
            ? inspected.durationSeconds
            : null,
      });

    if (
      publishError ||
      typeof messageId !== "string"
    ) {
      throw new GroupChatError(
        409,
        "Media publishing was not confirmed."
      );
    }

    if (isQuickTime) {
      try {
        await admin.storage
          .from(conversionBucket)
          .remove([expectedPath]);
      } catch {
        // Abandoned files are handled by separate cleanup.
      }
    }

    return groupChatResponse({
      message_id: messageId,
      media_id: mediaId,
      status: "published",
    });
  } catch (error) {
    return groupChatErrorResponse(error);
  }
}

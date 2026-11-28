import { randomUUID } from "node:crypto";

import {
  GroupChatError,
  groupChatResponse,
  groupChatErrorResponse,
  groupChatId,
  requireGroupChatUser,
  groupChatAdmin,
} from "@/lib/parachat/group-server";

import {
  inspectCreatorVerseMediaBlob,
} from "@/lib/creatorverse/media-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BUCKET = "parachat-group-photos";
const MAX_BYTES = 2097152;

const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type Context = {
  params: Promise<{ conversationId: string }>;
};

function validPath(id: string, value: unknown): value is string {
  return typeof value === "string" &&
    new RegExp(
      "^" + id +
      "/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-" +
      "[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png|webp)$"
    ).test(value);
}

async function requireAccess(
  request: Request,
  id: string,
  manage = false
) {
  const session = await requireGroupChatUser(request);

  const { data, error } = await session.client.rpc(
    "parachat_group_photo_access",
    { p_conversation_id: id }
  );

  if (error || !data || (manage && data.can_manage !== true)) {
    throw new GroupChatError(403, "Group photo access denied.");
  }

  return {
    ...session,
    photoPath: data.photo_path,
    canManage: data.can_manage === true,
  };
}

async function readImage(
  request: Request,
  mime: string
): Promise<Blob> {
  const reader = request.body?.getReader();

  if (!reader) {
    throw new GroupChatError(400, "Image required.");
  }

  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      size += value.byteLength;

      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new GroupChatError(413, "Maximum photo size is 2 MB.");
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (size < 16) {
    throw new GroupChatError(400, "Invalid image.");
  }

  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Blob([bytes], { type: mime });
}

export async function GET(
  request: Request,
  context: Context
) {
  try {
    const id = groupChatId(
      (await context.params).conversationId
    );

    const access = await requireAccess(request, id);

    if (!access.photoPath) {
      return groupChatResponse({
        signed_url: null,
        can_manage: access.canManage,
      });
    }

    if (!validPath(id, access.photoPath)) {
      throw new GroupChatError(404, "Group photo unavailable.");
    }

    const admin = groupChatAdmin();

    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(access.photoPath, 120);

    if (error || !data?.signedUrl) {
      throw new GroupChatError(404, "Group photo unavailable.");
    }

    return groupChatResponse({
      signed_url: data.signedUrl,
      can_manage: access.canManage,
      expires_in: 120,
    });
  } catch (error) {
    return groupChatErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: Context
) {
  try {
    const id = groupChatId(
      (await context.params).conversationId
    );

    const access = await requireAccess(request, id, true);

    const mime = request.headers
      .get("content-type")
      ?.split(";")[0]
      .trim()
      .toLowerCase() || "";

    const extension = extensions[mime];

    if (!extension) {
      throw new GroupChatError(
        415, "Choose a JPEG, PNG or WebP image."
      );
    }

    const { data: allowed, error: limitError } =
      await groupChatAdmin().rpc(
        "parachat_group_reserve_photo_upload",
        {
          p_conversation_id: id,
          p_actor_id: access.userId,
        }
      );

    if (limitError) {
      throw new GroupChatError(
        503, "Photo uploads are temporarily unavailable."
      );
    }

    if (allowed !== true) {
      throw new GroupChatError(
        429, "Photo upload limit reached. Please try again later."
      );
    }

    const blob = await readImage(request, mime);

    try {
      const inspected = await inspectCreatorVerseMediaBlob(
        blob, mime, 120
      );

      if (
        inspected.kind !== "image" ||
        inspected.mimeType !== mime
      ) {
        throw new Error("Invalid image.");
      }
    } catch {
      throw new GroupChatError(422, "Image verification failed.");
    }

    const current = await requireAccess(request, id, true);

    if (current.userId !== access.userId) {
      throw new GroupChatError(403, "Authorization changed.");
    }

    const photoPath =
      `${id}/${randomUUID()}.${extension}`;

    const admin = groupChatAdmin();

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(photoPath, blob, {
        contentType: mime,
        cacheControl: "0",
        upsert: false,
      });

    if (uploadError) {
      throw new GroupChatError(500, "Photo upload failed.");
    }

    const { data, error } = await admin.rpc(
      "parachat_group_set_photo",
      {
        p_conversation_id: id,
        p_actor_id: current.userId,
        p_photo_path: photoPath,
      }
    );

    if (error || data?.photo_path !== photoPath) {
      throw new GroupChatError(
        409, "Group photo update could not be confirmed."
      );
    }

    const previous = data.previous_photo_path;

    if (
      validPath(id, previous) &&
      previous !== photoPath
    ) {
      try {
        await admin.storage.from(BUCKET).remove([previous]);
      } catch {
        // Cleanup can be retried separately.
      }
    }

    return groupChatResponse({
      photo_path: photoPath,
      updated: true,
    });
  } catch (error) {
    return groupChatErrorResponse(error);
  }
}

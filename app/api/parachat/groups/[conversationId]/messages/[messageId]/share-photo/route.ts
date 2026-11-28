import { randomUUID } from "node:crypto";

import {
  requireGroupChatUser,
  groupChatAdmin,
  groupChatId,
  GroupChatError,
  groupChatResponse,
  groupChatErrorResponse,
} from "@/lib/parachat/group-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type RouteContext = {
  params: Promise<{
    conversationId: string;
    messageId: string;
  }>;
};

export async function POST(
  request: Request,
  context: RouteContext
): Promise<Response> {
  try {
    const params = await context.params;

    const conversationId =
      groupChatId(params.conversationId);

    const messageId =
      groupChatId(params.messageId);

    const { client, userId } =
      await requireGroupChatUser(request);

    const body = await request.json().catch(() => null);

    if (typeof body?.destinationId !== "string") {
      throw new GroupChatError(
        400,
        "Invalid destination."
      );
    }

    const destinationId =
      groupChatId(body.destinationId);

    const { data: authorization, error } =
      await client.rpc(
        "parachat_group_authorize_photo_share",
        {
          p_conversation_id: conversationId,
          p_message_id: messageId,
          p_destination_id: destinationId,
        }
      );

    if (
      error ||
      !authorization ||
      authorization.actor_id !== userId ||
      authorization.destination_id !== destinationId ||
      authorization.conversation_id !== conversationId ||
      authorization.message_id !== messageId
    ) {
      throw new GroupChatError(
        403,
        "Photograph sharing is not authorized."
      );
    }

    const mime = authorization.mime_type;
    const bytes = Number(authorization.verified_bytes);

    if (
      typeof mime !== "string" ||
      !Object.hasOwn(extensions, mime) ||
      !Number.isSafeInteger(bytes) ||
      bytes < 16 ||
      bytes > 8388608 ||
      typeof authorization.storage_path !== "string" ||
      typeof authorization.media_id !== "string"
    ) {
      throw new GroupChatError(
        400,
        "Invalid photograph."
      );
    }

    const mediaId =
      groupChatId(authorization.media_id);

    const parts =
      authorization.storage_path.split("/");

    if (
      parts.length !== 3 ||
      parts[0] !== conversationId ||
      parts[2] !== `${mediaId}.${extensions[mime]}`
    ) {
      throw new GroupChatError(
        400,
        "Invalid photograph path."
      );
    }

    groupChatId(parts[1]);

    const admin = groupChatAdmin();

    const { data: photograph, error: downloadError } =
      await admin.storage
        .from("parachat-group-media")
        .download(authorization.storage_path);

    if (
      downloadError ||
      !photograph ||
      photograph.size !== bytes
    ) {
      throw new GroupChatError(
        404,
        "Photograph unavailable."
      );
    }

    const copyId = randomUUID();

    const destinationPath =
      `${userId}/${destinationId}/` +
      `group-forward-${copyId}.${extensions[mime]}`;

    const { data: registered, error: registrationError } =
      await admin.rpc(
        "parachat_group_register_photo_copy",
        {
          p_actor_id: userId,
          p_conversation_id: conversationId,
          p_message_id: messageId,
          p_destination_id: destinationId,
          p_copy_id: copyId,
          p_storage_path: destinationPath,
        }
      );

    if (registrationError || registered !== true) {
      throw new GroupChatError(
        403,
        "Photograph forwarding authorization failed."
      );
    }


    const { error: uploadError } =
      await admin.storage
        .from("parachat-images")
        .upload(destinationPath, photograph, {
          contentType: mime,
          cacheControl: "0",
          upsert: false,
        });

    if (uploadError) {
      throw new GroupChatError(
        500,
        "Unable to copy photograph."
      );
    }

    const { data: sharedId, error: publishError } =
      await client.rpc(
        "parachat_group_publish_shared_photo",
        {
          p_conversation_id: conversationId,
          p_message_id: messageId,
          p_destination_id: destinationId,
          p_copy_id: copyId,
        }
      );

    if (publishError || sharedId !== copyId) {
      // Only remove the copy after a definitive
      // database rejection, not an uncertain
      // network or publication outcome.
      if (
        publishError &&
        /^[0-9A-Z]{5}$/.test(publishError.code || "") &&
        !publishError.code.startsWith("08") &&
        !publishError.code.startsWith("57") &&
        !publishError.code.startsWith("40")
      ) {
        await admin.storage
          .from("parachat-images")
          .remove([destinationPath]);
      }

      throw new GroupChatError(
        500,
        "Photograph sharing could not be confirmed."
      );
    }

    return groupChatResponse({
      status: "shared",
      message_id: sharedId,
    });
  } catch (error) {
    return groupChatErrorResponse(error);
  }
}

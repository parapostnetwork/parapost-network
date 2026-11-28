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

const bucket = "parachat-group-media";
const expiresIn = 120;

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
    messageId: string;
  }>;
};

export async function GET(
  request: Request,
  context: RouteContext
): Promise<Response> {
  try {
    const params = await context.params;

    const conversationId =
      groupChatId(params.conversationId);

    const messageId =
      groupChatId(params.messageId);

    const { client } =
      await requireGroupChatUser(request);

    const { data: media, error } =
      await client.rpc("parachat_group_get_attachment", {
        p_conversation_id: conversationId,
        p_message_id: messageId,
      });

    if (error || !media) {
      throw new GroupChatError(
        404,
        "Attachment unavailable."
      );
    }

    const mime = media.mime_type;

    if (
      typeof mime !== "string" ||
      !Object.hasOwn(extensions, mime) ||
      typeof media.storage_path !== "string" ||
      typeof media.id !== "string"
    ) {
      throw new GroupChatError(
        404,
        "Invalid attachment."
      );
    }

    const mediaId = groupChatId(media.id);
    const parts = media.storage_path.split("/");

    if (
      parts.length !== 3 ||
      parts[0] !== conversationId ||
      parts[2] !== `${mediaId}.${extensions[mime]}`
    ) {
      throw new GroupChatError(
        404,
        "Invalid attachment path."
      );
    }

    groupChatId(parts[1]);

    const admin = groupChatAdmin();

    const { data: signed, error: signingError } =
      await admin.storage
        .from(bucket)
        .createSignedUrl(
          media.storage_path,
          expiresIn
        );

    if (signingError || !signed?.signedUrl) {
      throw new GroupChatError(
        404,
        "Attachment unavailable."
      );
    }

    return groupChatResponse({
      media_id: mediaId,
      message_id: messageId,
      mime_type: mime,
      verified_bytes: media.verified_bytes,
      duration_seconds: media.duration_seconds,
      signed_url: signed.signedUrl,
      expires_in: expiresIn,
    });

  } catch (error) {
    return groupChatErrorResponse(error);
  }
}

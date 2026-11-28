import {
  requireGroupChatUser,
  groupChatAdmin,
  groupChatId,
  groupChatResponse,
  groupChatErrorResponse,
  GroupChatError,
} from "@/lib/parachat/group-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

type RouteContext = {
  params: Promise<{ reportId: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext
): Promise<Response> {
  try {
    const { reportId } = await context.params;
    const id = groupChatId(reportId);

    const { client } =
      await requireGroupChatUser(request);

    const { data: media, error } = await client.rpc(
      "parachat_group_report_attachment",
      {
        p_report_id: id,
      }
    );

    if (error) {
      throw new GroupChatError(
        403,
        "Attachment review is unavailable."
      );
    }

    if (!media) {
      return groupChatResponse({
        attachment: null,
      });
    }

    const conversationId =
      groupChatId(media.conversation_id);

    const mediaId = groupChatId(media.media_id);
    const extension = extensions[media.mime_type];

    const parts = String(media.storage_path || "")
      .split("/");

    if (
      !extension ||
      parts.length !== 3 ||
      parts[0] !== conversationId ||
      parts[2] !== `${mediaId}.${extension}`
    ) {
      throw new GroupChatError(
        400,
        "Invalid attachment record."
      );
    }

    groupChatId(parts[1]);

    const admin = groupChatAdmin();

    const { data: signed, error: signedError } =
      await admin.storage
        .from("parachat-group-media")
        .createSignedUrl(media.storage_path, 60);

    if (signedError || !signed?.signedUrl) {
      throw new GroupChatError(
        404,
        "Reported attachment unavailable."
      );
    }

    return groupChatResponse({
      attachment: {
        media_id: mediaId,
        mime_type: media.mime_type,
        signed_url: signed.signedUrl,
        expires_in: 60,
      },
    });

  } catch (error) {
    return groupChatErrorResponse(error);
  }
}

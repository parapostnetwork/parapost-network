import { supabase } from "@/lib/supabase";
import {
  PAGE_IMAGE_ACCEPT,
  preparePageImage,
} from "@/lib/creatorverse/page-image-preparation";

import { groupChatEnabled } from "@/lib/parachat/group-client";

export const GROUP_PHOTO_ACCEPT =
  PAGE_IMAGE_ACCEPT;

async function photoRequest(
  conversationId: string,
  file?: File
) {
  if (!groupChatEnabled()) {
    throw new Error("Group photos unavailable.");
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId)) {
    throw new Error("Invalid group identifier.");
  }

  const { data } = await supabase.auth.getSession();
  const session = data.session;

  if (!session || session.user.is_anonymous) {
    throw new Error("Sign in to continue.");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
  };

  if (file) headers["Content-Type"] = file.type;

  const response = await fetch(
    `/api/parachat/groups/${conversationId}/photo`,
    {
      method: file ? "POST" : "GET",
      headers,
      body: file,
      cache: "no-store",
    }
  );

  const result = await response.json();

  const { data: current } = await supabase.auth.getSession();

  if (current.session?.user.id !== session.user.id) {
    throw new Error("Session changed.");
  }

  if (!response.ok) {
    throw new Error(
      result.error || "Group photo request failed."
    );
  }

  return result;
}

export async function getGroupChatPhoto(
  conversationId: string
): Promise<string | null> {
  const data = await photoRequest(conversationId);

  if (data.signed_url === null) return null;

  if (typeof data.signed_url !== "string") {
    throw new Error("Invalid photo response.");
  }

  const url = new URL(data.signed_url);

  const origin = new URL(
    process.env.NEXT_PUBLIC_SUPABASE_URL!
  ).origin;

  if (
    url.protocol !== "https:" ||
    url.origin !== origin ||
    !url.pathname.startsWith(
      `/storage/v1/object/sign/parachat-group-photos/${conversationId}/`
    )
  ) {
    throw new Error("Invalid photo URL.");
  }

  return url.href;
}

export async function uploadGroupChatPhoto(
  conversationId: string,
  file: File
): Promise<void> {
  if (!groupChatEnabled()) {
    throw new Error("Group photos unavailable.");
  }

  const { data: initial } = await supabase.auth.getSession();

  if (!initial.session || initial.session.user.is_anonymous) {
    throw new Error("Sign in to continue.");
  }

  file = await preparePageImage(file, "logo");

  const { data: current } = await supabase.auth.getSession();

  if (current.session?.user.id !== initial.session.user.id) {
    throw new Error("Your session has changed.");
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Unsupported prepared image.");
  }

  if (file.size < 16 || file.size > 2097152) {
    throw new Error("Choose an image smaller than 2 MB.");
  }

  const data = await photoRequest(conversationId, file);

  if (data.updated !== true) {
    throw new Error("Photo update not confirmed.");
  }
}

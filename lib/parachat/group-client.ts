import { supabase } from "@/lib/supabase";
import {
  isCommunityStagingTarget,
} from "@/lib/community/release-target";

export const GROUP_CHAT_MAX_MEMBERS = 50;
export const GROUP_CHAT_MAX_NAME = 100;
export const GROUP_CHAT_MAX_MESSAGE = 4000;

export type GroupChatRole = "admin" | "member";

export type GroupChatConversation = {
  conversation_id: string;
  name: string;
  role: GroupChatRole;
  photo_path: string | null;
  member_count: number;
  muted_until: string | null;
  last_message_id: string | null;
  last_sender_id: string | null;
  last_sender_name: string | null;
  last_body: string | null;
  last_message_seq: number | null;
  last_activity_at: string;
  unread_count: number;
};

export type GroupChatMember = {
  user_id: string;
  role: GroupChatRole;
  full_name: string;
  username: string | null;
  avatar_url: string | null;
  joined_at: string;
};

export const GROUP_CHAT_REACTIONS = [
  "like", "love", "laugh", "wow", "sad", "angry",
] as const;

export type GroupChatReaction =
  typeof GROUP_CHAT_REACTIONS[number];

export type GroupChatReactionSummary = {
  counts: Partial<Record<GroupChatReaction, number>>;
  mine: GroupChatReaction | null;
};

export type GroupChatMessage = {
  reactions: GroupChatReactionSummary | null;
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sequence_number: number;
  body: string;
  created_at: string;
  edited_at: string | null;
  message_type: "text" | "photo" | "video";
  attachment_mime_type: string | null;
  reply_preview: {
    is_reply: boolean;
    original_message: {
      id: string;
      sender_id: string | null;
      body: string;
      created_at: string;
    } | null;
  } | null;

};

export type GroupInboxCursor = {
  activityAt: string;
  conversationId: string;
};

type GroupAction =
  | { action: "leave" }
  | { action: "mute"; mutedUntil: string }
  | { action: "unmute" }
  | { action: "rename"; name: string }
  | { action: "remove"; targetUserId: string }
  | { action: "promote"; targetUserId: string };

export function groupChatEnabled(): boolean {
  return isCommunityStagingTarget(
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}

async function requireGroupSession() {
  if (!groupChatEnabled()) {
    throw new Error("Group chats are unavailable.");
  }

  const { data, error } =
    await supabase.auth.getSession();

  if (
    error ||
    !data.session ||
    data.session.user.is_anonymous
  ) {
    throw new Error("Sign in to continue.");
  }

  return data.session;
}

function validateId(value: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new Error("Invalid identifier.");
  }

  return value.toLowerCase();
}

function validateName(value: string): string {
  const name = value.trim();

  if (!name || Array.from(name).length > GROUP_CHAT_MAX_NAME) {
    throw new Error(
      "Enter a group name between 1 and 100 characters."
    );
  }

  return name;
}

function validateMembers(
  memberIds: string[],
  minimum: number,
  currentUserId: string
): string[] {
  const ids = [...new Set(memberIds.map(validateId))];

  if (
    ids.length < minimum ||
    ids.length > 49 ||
    ids.includes(currentUserId.toLowerCase())
  ) {
    throw new Error("Invalid friend selection.");
  }

  return ids;
}

export async function getGroupChatInbox(
  cursor?: GroupInboxCursor
): Promise<GroupChatConversation[]> {
  await requireGroupSession();

  const { data, error } = await supabase.rpc(
    "parachat_group_inbox",
    {
      p_limit: 100,
      p_before_activity_at: cursor?.activityAt ?? null,
      p_before_id: cursor
        ? validateId(cursor.conversationId)
        : null,
    }
  );

  if (error || !Array.isArray(data)) {
    throw new Error("Unable to load group conversations.");
  }

  return data as GroupChatConversation[];
}

export async function createGroupChat(
  name: string,
  memberIds: string[]
): Promise<string> {
  const session = await requireGroupSession();

  const { data, error } = await supabase.rpc(
    "parachat_group_create",
    {
      p_name: validateName(name),
      p_member_ids: validateMembers(
        memberIds,
        2,
        session.user.id
      ),
    }
  );

  if (error || typeof data !== "string") {
    throw new Error("Unable to create group chat.");
  }

  return validateId(data);
}

export async function getGroupChatMembers(
  conversationId: string
): Promise<GroupChatMember[]> {
  await requireGroupSession();

  const { data, error } = await supabase.rpc(
    "parachat_group_members",
    {
      p_conversation_id: validateId(conversationId),
    }
  );

  if (error || !Array.isArray(data)) {
    throw new Error("Unable to load group members.");
  }

  return data as GroupChatMember[];
}

export async function addGroupChatMembers(
  conversationId: string,
  memberIds: string[]
): Promise<number> {
  const session = await requireGroupSession();

  const ids = validateMembers(
    memberIds,
    1,
    session.user.id
  );

  const { data, error } = await supabase.rpc(
    "parachat_group_add_members",
    {
      p_conversation_id: validateId(conversationId),
      p_member_ids: ids,
    }
  );

  if (error || data !== ids.length) {
    throw new Error("Unable to add selected friends.");
  }

  return data;
}

export async function getGroupChatMessages(
  conversationId: string,
  beforeSequence: number | null = null
): Promise<GroupChatMessage[]> {
  await requireGroupSession();

  if (
    beforeSequence !== null &&
    (
      !Number.isSafeInteger(beforeSequence) ||
      beforeSequence < 1
    )
  ) {
    throw new Error("Invalid message cursor.");
  }

  const { data, error } = await supabase.rpc(
    "parachat_group_get_messages_v4",
    {
      p_conversation_id: validateId(conversationId),
      p_before_seq: beforeSequence,
      p_limit: 50,
    }
  );

  if (error || !Array.isArray(data)) {
    throw new Error("Unable to load group messages.");
  }

  return data as GroupChatMessage[];
}

export async function sendGroupChatMessage(
  conversationId: string,
  body: string
): Promise<string> {
  await requireGroupSession();

  const message = body.trim();

  if (
    !message ||
    Array.from(message).length > GROUP_CHAT_MAX_MESSAGE
  ) {
    throw new Error(
      "Messages must contain 1 to 4000 characters."
    );
  }

  const { data, error } = await supabase.rpc(
    "parachat_group_send_message",
    {
      p_conversation_id: validateId(conversationId),
      p_body: message,
    }
  );

  if (error || typeof data !== "string") {
    throw new Error("Unable to send group message.");
  }

  return validateId(data);
}

export async function markGroupChatRead(
  conversationId: string,
  throughSequence: number
): Promise<void> {
  await requireGroupSession();

  if (
    !Number.isSafeInteger(throughSequence) ||
    throughSequence < 0
  ) {
    throw new Error("Invalid read position.");
  }

  const { data, error } = await supabase.rpc(
    "parachat_group_mark_read",
    {
      p_conversation_id: validateId(conversationId),
      p_through_seq: throughSequence,
    }
  );

  if (error || data !== true) {
    throw new Error("Unable to update read status.");
  }
}

export async function manageGroupChat(
  conversationId: string,
  operation: GroupAction
): Promise<void> {
  await requireGroupSession();

  let targetUserId: string | null = null;
  let name: string | null = null;
  let mutedUntil: string | null = null;

  if (
    operation.action === "remove" ||
    operation.action === "promote"
  ) {
    targetUserId = validateId(operation.targetUserId);
  }

  if (operation.action === "rename") {
    name = validateName(operation.name);
  }

  if (operation.action === "mute") {
    const timestamp = Date.parse(operation.mutedUntil);

    if (
      !Number.isFinite(timestamp) ||
      timestamp <= Date.now()
    ) {
      throw new Error("Invalid mute duration.");
    }

    mutedUntil = new Date(timestamp).toISOString();
  }

  const { data, error } = await supabase.rpc(
    "parachat_group_manage",
    {
      p_conversation_id: validateId(conversationId),
      p_action: operation.action,
      p_target_user_id: targetUserId,
      p_name: name,
      p_muted_until: mutedUntil,
    }
  );

  if (error || data !== true) {
    throw new Error("Unable to complete group action.");
  }
}


export async function getGroupEligibleFriends(): Promise<
  { id: string; name: string }[]
> {
  const session = await requireGroupSession();

  const { data, error } = await supabase.rpc(
    "parachat_group_eligible_friends"
  );

  const current = await requireGroupSession();

  if (
    error ||
    !Array.isArray(data) ||
    current.user.id !== session.user.id
  ) {
    throw new Error("Unable to load eligible friends.");
  }

  return data as { id: string; name: string }[];
}


export type GroupChatDetails = {
  conversation_id: string;
  name: string;
  photo_path: string | null;
  role: GroupChatRole;
  muted_until: string | null;
  admin_only: boolean;
  can_add_members: boolean;
  member_count: number;
};

export async function getGroupChatDetails(
  conversationId: string
): Promise<GroupChatDetails> {
  await requireGroupSession();

  const id = validateId(conversationId);

  const { data, error } = await supabase.rpc(
    "parachat_group_details",
    { p_conversation_id: id }
  );

  if (error || !data || data.conversation_id !== id) {
    throw new Error("Group conversation unavailable.");
  }

  return data as GroupChatDetails;
}

export async function setGroupChatInvitationMode(
  conversationId: string,
  adminOnly: boolean
): Promise<void> {
  await requireGroupSession();

  const { data, error } = await supabase.rpc(
    "parachat_group_set_invitation_mode",
    {
      p_conversation_id: validateId(conversationId),
      p_admin_only: adminOnly,
    }
  );

  if (error || data !== true) {
    throw new Error("Unable to update invitation permissions.");
  }
}


export async function sendGroupChatReply(
  conversationId: string,
  replyToMessageId: string,
  body: string
): Promise<string> {
  await requireGroupSession();

  const message = body.trim();

  if (
    !message ||
    Array.from(message).length > GROUP_CHAT_MAX_MESSAGE
  ) {
    throw new Error(
      "Messages must contain 1 to 4000 characters."
    );
  }

  const { data, error } = await supabase.rpc(
    "parachat_group_send_reply",
    {
      p_conversation_id: validateId(conversationId),
      p_reply_to_message_id: validateId(replyToMessageId),
      p_body: message,
    }
  );

  if (error || typeof data !== "string") {
    throw new Error("Unable to send group reply.");
  }

  return validateId(data);
}


export async function setGroupChatReaction(
  conversationId: string,
  messageId: string,
  reaction: GroupChatReaction | null
): Promise<void> {
  await requireGroupSession();

  if (
    reaction !== null &&
    !GROUP_CHAT_REACTIONS.includes(reaction)
  ) {
    throw new Error("Invalid reaction.");
  }

  const { data, error } = await supabase.rpc(
    "parachat_group_set_reaction",
    {
      p_conversation_id: validateId(conversationId),
      p_message_id: validateId(messageId),
      p_reaction: reaction,
    }
  );

  if (error || data !== true) {
    throw new Error("Unable to update message reaction.");
  }
}


export async function reportGroupChatMessage(
  conversationId: string,
  messageId: string,
  reason: string
): Promise<void> {
  await requireGroupSession();

  const trimmedReason = reason.trim();

  if (
    !trimmedReason ||
    Array.from(trimmedReason).length > 160
  ) {
    throw new Error(
      "Enter a report reason between 1 and 160 characters."
    );
  }

  const { data, error } = await supabase.rpc(
    "parachat_group_report_message",
    {
      p_conversation_id: validateId(conversationId),
      p_message_id: validateId(messageId),
      p_reason: trimmedReason,
    }
  );

  if (error || data !== true) {
    throw new Error(
      "Unable to submit this message report."
    );
  }
}

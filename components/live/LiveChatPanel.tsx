"use client";

import {
  CSSProperties,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";

type LiveStatus = "draft" | "upcoming" | "live" | "ended" | "cancelled";

type LiveChatMessageRow = {
  id: string;
  live_stream_id: string;
  user_id: string;
  message: string;
  created_at: string;
};

type ProfilePreview = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

type LiveChatPanelProps = {
  liveStreamId: string;
  creatorUserId: string;
  currentUserId: string;
  status: LiveStatus;
  compact?: boolean;
  maxVisibleMessages?: number;
  showHeader?: boolean;
};

function getDisplayName(profile?: ProfilePreview) {
  return profile?.full_name || profile?.username || "Parapost member";
}

function getInitials(profile?: ProfilePreview) {
  const value = getDisplayName(profile).trim();

  if (!value) return "P";

  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function formatChatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getChatStatusLabel(status: LiveStatus) {
  if (status === "live") return "Live discussion";
  if (status === "ended") return "Replay discussion";
  if (status === "upcoming") return "Opens when live";
  if (status === "cancelled") return "Closed";
  return "Not published";
}

function canCommentForStatus(status: LiveStatus) {
  return status === "live" || status === "ended";
}

export default function LiveChatPanel({
  liveStreamId,
  creatorUserId,
  currentUserId,
  status,
  compact = false,
  maxVisibleMessages,
  showHeader = true,
}: LiveChatPanelProps) {
  const [messages, setMessages] = useState<LiveChatMessageRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfilePreview>>({});
  const [draft, setDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editingDraft, setEditingDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [busyMessageId, setBusyMessageId] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  const canSend = canCommentForStatus(status) && Boolean(currentUserId);
  const visibleLimit = maxVisibleMessages ?? (compact ? 4 : 100);

  const visibleMessages = useMemo(() => {
    if (expanded || messages.length <= visibleLimit) return messages;
    return messages.slice(Math.max(messages.length - visibleLimit, 0));
  }, [expanded, messages, visibleLimit]);

  const hiddenMessageCount = Math.max(messages.length - visibleMessages.length, 0);

  const loadProfiles = useCallback(async (userIds: string[]) => {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

    if (uniqueUserIds.length === 0) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .in("id", uniqueUserIds);

    if (error) return;

    const nextProfiles: Record<string, ProfilePreview> = {};

    for (const profile of (data || []) as ProfilePreview[]) {
      nextProfiles[profile.id] = profile;
    }

    setProfiles((current) => ({
      ...current,
      ...nextProfiles,
    }));
  }, []);

  const loadMessages = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("live_chat_messages")
      .select("id, live_stream_id, user_id, message, created_at")
      .eq("live_stream_id", liveStreamId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      setNotice(error.message || "Could not load Live comments.");
      setLoading(false);
      return;
    }

    const nextMessages = ((data || []) as LiveChatMessageRow[]).reverse();

    setMessages(nextMessages);
    setLoading(false);
    void loadProfiles(nextMessages.map((message) => message.user_id));
  }, [liveStreamId, loadProfiles]);

  useEffect(() => {
    void loadMessages();

    const channel = supabase
      .channel(`live-chat-${liveStreamId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_chat_messages",
          filter: `live_stream_id=eq.${liveStreamId}`,
        },
        (payload) => {
          const nextMessage = payload.new as LiveChatMessageRow;

          setMessages((current) => {
            if (current.some((message) => message.id === nextMessage.id)) {
              return current;
            }

            return [...current, nextMessage].slice(-100);
          });

          void loadProfiles([nextMessage.user_id]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "live_chat_messages",
          filter: `live_stream_id=eq.${liveStreamId}`,
        },
        (payload) => {
          const updatedMessage = payload.new as LiveChatMessageRow;

          setMessages((current) =>
            current.map((message) =>
              message.id === updatedMessage.id ? updatedMessage : message
            )
          );

          void loadProfiles([updatedMessage.user_id]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "live_chat_messages",
          filter: `live_stream_id=eq.${liveStreamId}`,
        },
        () => {
          void loadMessages();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [liveStreamId, loadMessages, loadProfiles]);

  useEffect(() => {
    if (compact && !expanded) return;

    endRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [compact, expanded, messages.length]);

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const message = draft.trim();

    if (!canSend || sending || !message) return;

    if (message.length > 500) {
      setNotice("Comments can be up to 500 characters.");
      return;
    }

    setSending(true);
    setNotice("");

    const { error } = await supabase.from("live_chat_messages").insert({
      live_stream_id: liveStreamId,
      user_id: currentUserId,
      message,
    });

    setSending(false);

    if (error) {
      setNotice(error.message || "Could not send your comment.");
      return;
    }

    setDraft("");
    setExpanded(true);
    await loadMessages();
  };

  const startEditMessage = (message: LiveChatMessageRow) => {
    if (currentUserId !== message.user_id) return;

    setEditingMessageId(message.id);
    setEditingDraft(message.message);
    setNotice("");
  };

  const cancelEditMessage = () => {
    setEditingMessageId("");
    setEditingDraft("");
  };

  const saveEditedMessage = async (message: LiveChatMessageRow) => {
    if (currentUserId !== message.user_id) return;

    const nextMessage = editingDraft.trim();

    if (!nextMessage) {
      setNotice("Comment cannot be empty.");
      return;
    }

    if (nextMessage.length > 500) {
      setNotice("Comments can be up to 500 characters.");
      return;
    }

    setBusyMessageId(message.id);
    setNotice("");

    const { error } = await supabase
      .from("live_chat_messages")
      .update({ message: nextMessage })
      .eq("id", message.id)
      .eq("user_id", currentUserId);

    setBusyMessageId("");

    if (error) {
      setNotice(error.message || "Could not edit this comment.");
      return;
    }

    setEditingMessageId("");
    setEditingDraft("");
    await loadMessages();
  };

  const deleteMessage = async (message: LiveChatMessageRow) => {
    const canDelete =
      currentUserId === message.user_id || currentUserId === creatorUserId;

    if (!canDelete) return;

    const ok = window.confirm("Remove this comment?");

    if (!ok) return;

    setBusyMessageId(message.id);
    setNotice("");

    const { error } = await supabase
      .from("live_chat_messages")
      .delete()
      .eq("id", message.id);

    setBusyMessageId("");

    if (error) {
      setNotice(error.message || "Could not remove this comment.");
      return;
    }

    if (editingMessageId === message.id) {
      cancelEditMessage();
    }

    await loadMessages();
  };

  return (
    <section style={compact ? compactPanelStyle : panelStyle}>
      {showHeader ? (
        <div style={compact ? compactHeaderStyle : headerStyle}>
          <div>
            <div style={eyebrowStyle}>Parapost Comments</div>
            <strong style={titleStyle}>
              {status === "ended" ? "Replay discussion" : "Join the conversation"}
            </strong>
          </div>

          <span style={statusStyle}>{getChatStatusLabel(status)}</span>
        </div>
      ) : null}

      <div style={compact ? compactMessagesStyle : messagesStyle}>
        {loading ? (
          <div style={emptyStyle}>Loading comments...</div>
        ) : messages.length === 0 ? (
          <div style={emptyStyle}>
            {status === "live"
              ? "No comments yet. Start the conversation."
              : "Comments open when the show starts."}
          </div>
        ) : (
          visibleMessages.map((message) => {
            const profile = profiles[message.user_id];
            const canDelete =
              currentUserId === message.user_id ||
              currentUserId === creatorUserId;
            const canEdit = currentUserId === message.user_id;
            const isEditing = editingMessageId === message.id;

            return (
              <div key={message.id} style={messageRowStyle}>
                <div style={avatarStyle}>
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      style={avatarImageStyle}
                    />
                  ) : (
                    <span>{getInitials(profile)}</span>
                  )}
                </div>

                <div style={messageContentStyle}>
                  <div style={messageMetaStyle}>
                    <strong style={nameStyle}>{getDisplayName(profile)}</strong>
                    <span style={timeStyle}>
                      {formatChatTime(message.created_at)}
                    </span>

                    <div style={messageActionWrapStyle}>
                      {canEdit && !isEditing ? (
                        <button
                          type="button"
                          onClick={() => startEditMessage(message)}
                          style={editButtonStyle}
                        >
                          Edit
                        </button>
                      ) : null}

                      {canDelete ? (
                        <button
                          type="button"
                          disabled={busyMessageId === message.id}
                          onClick={() => deleteMessage(message)}
                          style={removeButtonStyle}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {isEditing ? (
                    <div style={editFormStyle}>
                      <input
                        value={editingDraft}
                        onChange={(event) => setEditingDraft(event.target.value)}
                        maxLength={500}
                        style={editInputStyle}
                      />

                      <div style={editActionRowStyle}>
                        <button
                          type="button"
                          disabled={busyMessageId === message.id}
                          onClick={() => saveEditedMessage(message)}
                          style={saveEditButtonStyle}
                        >
                          Save
                        </button>

                        <button
                          type="button"
                          onClick={cancelEditMessage}
                          style={cancelEditButtonStyle}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p style={messageTextStyle}>{message.message}</p>
                  )}
                </div>
              </div>
            );
          })
        )}

        <div ref={endRef} />
      </div>

      {hiddenMessageCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={viewMoreButtonStyle}
        >
          View {hiddenMessageCount} earlier comment{hiddenMessageCount === 1 ? "" : "s"}
        </button>
      ) : null}

      {canCommentForStatus(status) ? (
        <form onSubmit={submitMessage} style={formStyle}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={500}
            placeholder={status === "ended" ? "Add a replay comment..." : "Write a comment..."}
            style={inputStyle}
          />

          <button
            type="submit"
            disabled={!canSend || sending || !draft.trim()}
            style={{
              ...sendButtonStyle,
              opacity: !canSend || sending || !draft.trim() ? 0.55 : 1,
              cursor:
                !canSend || sending || !draft.trim()
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </form>
      ) : (
        <div style={closedStyle}>
          {status === "upcoming"
            ? "Comments open when this show starts."
            : "Comments are not available for this show."}
        </div>
      )}

      {notice ? <div style={noticeStyle}>{notice}</div> : null}
    </section>
  );
}

const panelStyle: CSSProperties = {
  marginTop: 4,
  borderRadius: 18,
  border: "1px solid rgba(216,180,254,0.16)",
  background: "rgba(4,6,14,0.46)",
  overflow: "hidden",
};

const compactPanelStyle: CSSProperties = {
  ...panelStyle,
  marginTop: 12,
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "12px 13px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const compactHeaderStyle: CSSProperties = {
  ...headerStyle,
  padding: "10px 12px",
};

const eyebrowStyle: CSSProperties = {
  color: "#a78bfa",
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 4,
};

const titleStyle: CSSProperties = {
  color: "#fff",
  fontSize: 14,
  fontWeight: 950,
};

const statusStyle: CSSProperties = {
  minHeight: 28,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 10px",
  color: "#f3e8ff",
  background: "rgba(168,85,247,0.16)",
  border: "1px solid rgba(216,180,254,0.18)",
  fontSize: 11,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const messagesStyle: CSSProperties = {
  minHeight: 150,
  maxHeight: 280,
  overflowY: "auto",
  padding: 12,
  display: "grid",
  alignContent: "start",
  gap: 10,
};

const compactMessagesStyle: CSSProperties = {
  ...messagesStyle,
  minHeight: 0,
  maxHeight: 240,
  padding: 10,
};

const emptyStyle: CSSProperties = {
  minHeight: 88,
  display: "grid",
  placeItems: "center",
  color: "#9ca3af",
  textAlign: "center",
  fontSize: 13,
  lineHeight: 1.5,
};

const messageRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "34px minmax(0, 1fr)",
  alignItems: "start",
  gap: 9,
};

const avatarStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  overflow: "hidden",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
  color: "#fff",
  background: "linear-gradient(135deg, #7c3aed, #ec4899)",
  fontSize: 11,
  fontWeight: 950,
};

const avatarImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const messageContentStyle: CSSProperties = {
  minWidth: 0,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.075)",
  background: "rgba(255,255,255,0.04)",
  padding: "8px 9px",
};

const messageMetaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 7,
};

const nameStyle: CSSProperties = {
  color: "#fff",
  fontSize: 12.5,
  fontWeight: 900,
};

const timeStyle: CSSProperties = {
  color: "#7d8593",
  fontSize: 11,
};

const messageActionWrapStyle: CSSProperties = {
  marginLeft: "auto",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const editButtonStyle: CSSProperties = {
  border: 0,
  background: "transparent",
  color: "#c4b5fd",
  padding: 0,
  fontSize: 11,
  fontWeight: 850,
  cursor: "pointer",
};

const removeButtonStyle: CSSProperties = {
  border: 0,
  background: "transparent",
  color: "#fca5a5",
  padding: 0,
  fontSize: 11,
  fontWeight: 850,
  cursor: "pointer",
};

const messageTextStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#d1d5db",
  fontSize: 13,
  lineHeight: 1.45,
  overflowWrap: "anywhere",
};

const editFormStyle: CSSProperties = {
  marginTop: 8,
  display: "grid",
  gap: 8,
};

const editInputStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 36,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  outline: "none",
  background: "rgba(255,255,255,0.065)",
  color: "#fff",
  padding: "0 10px",
  fontSize: 13,
};

const editActionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const saveEditButtonStyle: CSSProperties = {
  minHeight: 30,
  borderRadius: 999,
  border: "1px solid rgba(216,180,254,0.26)",
  background: "rgba(168,85,247,0.22)",
  color: "#fff",
  padding: "0 11px",
  fontSize: 11,
  fontWeight: 900,
  cursor: "pointer",
};

const cancelEditButtonStyle: CSSProperties = {
  ...saveEditButtonStyle,
  background: "rgba(255,255,255,0.06)",
  color: "#cbd5e1",
};

const viewMoreButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 34,
  border: 0,
  borderTop: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.035)",
  color: "#c4b5fd",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const formStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 8,
  padding: 11,
  borderTop: "1px solid rgba(255,255,255,0.08)",
};

const inputStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 40,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  outline: "none",
  background: "rgba(255,255,255,0.065)",
  color: "#fff",
  padding: "0 13px",
  fontSize: 13,
};

const sendButtonStyle: CSSProperties = {
  minHeight: 40,
  borderRadius: 999,
  border: "1px solid rgba(216,180,254,0.26)",
  background:
    "linear-gradient(135deg, rgba(168,85,247,0.95), rgba(124,58,237,0.95))",
  color: "#fff",
  padding: "0 15px",
  fontSize: 12,
  fontWeight: 950,
};

const closedStyle: CSSProperties = {
  borderTop: "1px solid rgba(255,255,255,0.08)",
  color: "#9ca3af",
  padding: 11,
  fontSize: 12.5,
  lineHeight: 1.45,
};

const noticeStyle: CSSProperties = {
  borderTop: "1px solid rgba(248,113,113,0.18)",
  color: "#fca5a5",
  background: "rgba(127,29,29,0.12)",
  padding: "9px 11px",
  fontSize: 12,
  lineHeight: 1.45,
};

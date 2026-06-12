"use client";

import {
  CSSProperties,
  FormEvent,
  useCallback,
  useEffect,
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

export default function LiveChatPanel({
  liveStreamId,
  creatorUserId,
  currentUserId,
  status,
}: LiveChatPanelProps) {
  const [messages, setMessages] = useState<LiveChatMessageRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfilePreview>>({});
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [busyMessageId, setBusyMessageId] = useState("");
  const [notice, setNotice] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  const canSend = status === "live" && Boolean(currentUserId);

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
      setNotice(error.message || "Could not load Live chat.");
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
          event: "DELETE",
          schema: "public",
          table: "live_chat_messages",
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
    endRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [messages.length]);

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const message = draft.trim();

    if (!canSend || sending || !message) return;

    if (message.length > 500) {
      setNotice("Live chat messages can be up to 500 characters.");
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
      setNotice(error.message || "Could not send your Live chat message.");
      return;
    }

    setDraft("");
    await loadMessages();
  };

  const deleteMessage = async (message: LiveChatMessageRow) => {
    const canDelete =
      currentUserId === message.user_id || currentUserId === creatorUserId;

    if (!canDelete) return;

    const ok = window.confirm("Remove this Live chat message?");

    if (!ok) return;

    setBusyMessageId(message.id);
    setNotice("");

    const { error } = await supabase
      .from("live_chat_messages")
      .delete()
      .eq("id", message.id);

    setBusyMessageId("");

    if (error) {
      setNotice(error.message || "Could not remove this Live chat message.");
      return;
    }

    await loadMessages();
  };

  return (
    <section style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>Parapost Live Chat</div>
          <strong style={titleStyle}>Join the conversation</strong>
        </div>

        <span style={statusStyle}>
          {status === "live" ? "Chat open" : "Read only"}
        </span>
      </div>

      <div style={messagesStyle}>
        {loading ? (
          <div style={emptyStyle}>Loading Live chat...</div>
        ) : messages.length === 0 ? (
          <div style={emptyStyle}>
            {status === "live"
              ? "No messages yet. Start the conversation."
              : "No Live chat messages yet."}
          </div>
        ) : (
          messages.map((message) => {
            const profile = profiles[message.user_id];
            const canDelete =
              currentUserId === message.user_id ||
              currentUserId === creatorUserId;

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

                  <p style={messageTextStyle}>{message.message}</p>
                </div>
              </div>
            );
          })
        )}

        <div ref={endRef} />
      </div>

      {status === "live" ? (
        <form onSubmit={submitMessage} style={formStyle}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={500}
            placeholder="Write a Live chat message..."
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
            ? "Chat opens when this show goes Live."
            : "This Live chat is read-only because the show is no longer live."}
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

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "12px 13px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
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

const emptyStyle: CSSProperties = {
  minHeight: 120,
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

const removeButtonStyle: CSSProperties = {
  marginLeft: "auto",
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

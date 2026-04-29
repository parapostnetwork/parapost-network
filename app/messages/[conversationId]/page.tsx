"use client";

import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_online?: boolean | null;
};

type ConversationRow = {
  id: string;
  user_one_id: string | null;
  user_two_id: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  created_at: string;
  is_read?: boolean | null;
};

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  const sameYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (sameDay) return "Today";
  if (sameYesterday) return "Yesterday";

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getInitial(profile?: ProfileRow | null) {
  const value = profile?.full_name || profile?.username || "U";
  return value.charAt(0).toUpperCase();
}

export default function ConversationPage() {
  const params = useParams();
  const router = useRouter();

  const conversationId = useMemo(() => {
    const raw = params?.conversationId;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] || "" : "";
  }, [params]);

  const [viewerId, setViewerId] = useState("");
  const [conversation, setConversation] = useState<ConversationRow | null>(null);
  const [otherProfile, setOtherProfile] = useState<ProfileRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const otherUserId = useMemo(() => {
    if (!conversation || !viewerId) return "";

    const { user_one_id, user_two_id } = conversation;

    if (user_one_id === viewerId && user_two_id) {
      return user_two_id;
    }

    if (user_two_id === viewerId && user_one_id) {
      return user_one_id;
    }

    return "";
  }, [conversation, viewerId]);

  const groupedMessages = useMemo(() => {
    const groups: { label: string; items: MessageRow[] }[] = [];

    for (const message of messages) {
      const label = formatDateLabel(message.created_at);
      const lastGroup = groups[groups.length - 1];

      if (!lastGroup || lastGroup.label !== label) {
        groups.push({ label, items: [message] });
      } else {
        lastGroup.items.push(message);
      }
    }

    return groups;
  }, [messages]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    window.setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
    }, 60);
  }, []);

  const loadConversation = useCallback(async () => {
    if (!conversationId) {
      setErrorMessage("Conversation not found.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErrorMessage("Please log in to view this conversation.");
      setLoading(false);
      return;
    }

    setViewerId(user.id);

    const { data: conversationData, error: conversationError } = await supabase
      .from("direct_conversations")
      .select("id, user_one_id, user_two_id, created_at, updated_at")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationError || !conversationData) {
      console.error("Conversation error:", conversationError);
      setErrorMessage(conversationError?.message || "Conversation could not be loaded.");
      setConversation(null);
      setOtherProfile(null);
      setMessages([]);
      setLoading(false);
      return;
    }

    const currentConversation = conversationData as ConversationRow;

    const isParticipant =
      currentConversation.user_one_id === user.id ||
      currentConversation.user_two_id === user.id;

    if (!isParticipant) {
      setErrorMessage("You do not have access to this conversation.");
      setConversation(null);
      setOtherProfile(null);
      setMessages([]);
      setLoading(false);
      return;
    }

    setConversation(currentConversation);

    const nextOtherUserId =
      currentConversation.user_one_id === user.id
        ? currentConversation.user_two_id || ""
        : currentConversation.user_one_id || "";

    if (nextOtherUserId) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, is_online")
        .eq("id", nextOtherUserId)
        .maybeSingle();

      if (profileError) {
        console.warn("Profile load warning:", profileError.message);
      }

      setOtherProfile((profileData as ProfileRow | null) || null);
    } else {
      setOtherProfile(null);
    }

    const { data: messageData, error: messageError } = await supabase
      .from("direct_messages")
      .select("id, conversation_id, sender_id, body, created_at, is_read")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (messageError) {
      console.error("Messages error:", messageError);
      setErrorMessage(messageError.message || "Messages could not be loaded.");
      setMessages([]);
      setLoading(false);
      return;
    }

    setMessages((messageData as MessageRow[]) || []);
    setLoading(false);
    scrollToBottom("auto");
  }, [conversationId, scrollToBottom]);

  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`direct-messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const nextMessage = payload.new as MessageRow;

          setMessages((prev) => {
            if (prev.some((message) => message.id === nextMessage.id)) return prev;

            return [...prev, nextMessage].sort(
              (a, b) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });

          scrollToBottom();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, scrollToBottom]);

  useEffect(() => {
    scrollToBottom("auto");
  }, [messages.length, scrollToBottom]);

  const handleTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setMessageText(event.target.value);

    const textarea = event.currentTarget;
    textarea.style.height = "44px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 130)}px`;
  };

  const handleSendMessage = async () => {
    const trimmed = messageText.trim();

    if (!trimmed || sending || !viewerId || !conversationId || !conversation) return;

    setSending(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("direct_messages")
      .insert([
        {
          conversation_id: conversationId,
          sender_id: viewerId,
          body: trimmed,
        },
      ])
      .select("id, conversation_id, sender_id, body, created_at, is_read")
      .single();

    if (error) {
      console.error("Send message error:", error);
      setErrorMessage(error.message || "Message could not be sent.");
      setSending(false);
      return;
    }

    if (data) {
      setMessages((prev) => {
        if (prev.some((message) => message.id === data.id)) return prev;
        return [...prev, data as MessageRow];
      });
    }

    await supabase
      .from("direct_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    setMessageText("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
      textareaRef.current.focus();
    }

    setSending(false);
    scrollToBottom();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleSendMessage();
  };

  const handleComposerKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await handleSendMessage();
    }
  };

  const displayName = otherProfile?.full_name || otherProfile?.username || "Conversation";
  const displayHandle = otherProfile?.username ? `@${otherProfile.username}` : "Parapost Network member";
  const inputDisabled = loading || sending || !conversation || !!errorMessage;

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        <aside style={sidebarStyle}>
          <Link href="/dashboard" style={backLinkStyle}>
            ← Back to Feed
          </Link>

          <div style={brandBlockStyle}>
            <div style={brandTitleStyle}>PARAPOST</div>
            <div style={brandSubtitleStyle}>NETWORK</div>
          </div>

          <div style={sidebarCardStyle}>
            <div style={sidebarLabelStyle}>Direct Messages</div>
            <div style={sidebarTitleStyle}>Private Conversation</div>
            <p style={sidebarTextStyle}>
              Send secure one-to-one messages with other Parapost Network members.
            </p>
          </div>

          {otherUserId ? (
            <Link href={`/profile/${otherUserId}`} style={profileLinkStyle}>
              View Profile
            </Link>
          ) : null}
        </aside>

        <main style={chatPanelStyle}>
          <header style={chatHeaderStyle}>
            <div style={headerLeftStyle}>
              <button
                type="button"
                onClick={() => router.back()}
                style={mobileBackButtonStyle}
                aria-label="Go back"
              >
                ←
              </button>

              <div style={avatarWrapStyle}>
                {otherProfile?.avatar_url ? (
                  <img src={otherProfile.avatar_url} alt="" style={avatarImageStyle} />
                ) : (
                  <div style={avatarFallbackStyle}>{getInitial(otherProfile)}</div>
                )}

                {otherProfile?.is_online ? <span style={onlineDotStyle} /> : null}
              </div>

              <div style={{ minWidth: 0 }}>
                <h1 style={headerTitleStyle}>{loading ? "Loading conversation..." : displayName}</h1>
                <div style={headerSubtitleStyle}>
                  {otherProfile?.is_online ? "Online now" : displayHandle}
                </div>
              </div>
            </div>

            {otherUserId ? (
              <Link href={`/profile/${otherUserId}`} style={headerProfileButtonStyle}>
                Profile
              </Link>
            ) : null}
          </header>

          <section style={messagesAreaStyle}>
            {loading ? (
              <div style={emptyStateStyle}>
                <strong>Loading conversation...</strong>
                <span>Getting your messages ready.</span>
              </div>
            ) : errorMessage ? (
              <div style={errorBoxStyle}>
                <strong>Messaging needs attention</strong>
                <span>{errorMessage}</span>
                <button type="button" onClick={loadConversation} style={retryButtonStyle}>
                  Retry
                </button>
              </div>
            ) : messages.length === 0 ? (
              <div style={emptyStateStyle}>
                <strong>No messages yet</strong>
                <span>Start the conversation with {displayName}.</span>
              </div>
            ) : (
              <div style={messageStackStyle}>
                {groupedMessages.map((group) => (
                  <div key={group.label} style={messageGroupStyle}>
                    <div style={dateDividerStyle}>
                      <span>{group.label}</span>
                    </div>

                    {group.items.map((message) => {
                      const isMine = message.sender_id === viewerId;

                      return (
                        <div
                          key={message.id}
                          style={{
                            ...messageRowStyle,
                            justifyContent: isMine ? "flex-end" : "flex-start",
                          }}
                        >
                          {!isMine ? (
                            <div style={smallAvatarStyle}>
                              {otherProfile?.avatar_url ? (
                                <img
                                  src={otherProfile.avatar_url}
                                  alt=""
                                  style={smallAvatarImageStyle}
                                />
                              ) : (
                                <span>{getInitial(otherProfile)}</span>
                              )}
                            </div>
                          ) : null}

                          <div
                            style={{
                              ...bubbleWrapStyle,
                              alignItems: isMine ? "flex-end" : "flex-start",
                            }}
                          >
                            <div style={isMine ? myBubbleStyle : theirBubbleStyle}>
                              {message.body}
                            </div>

                            <div style={messageTimeStyle}>
                              {formatMessageTime(message.created_at)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

                <div ref={messagesEndRef} />
              </div>
            )}
          </section>

          <form onSubmit={handleSubmit} style={composerShellStyle}>
            <textarea
              ref={textareaRef}
              value={messageText}
              onChange={handleTextChange}
              onKeyDown={handleComposerKeyDown}
              placeholder={
                errorMessage
                  ? "Fix the conversation issue first..."
                  : `Message ${displayName}...`
              }
              rows={1}
              style={composerInputStyle}
              disabled={inputDisabled}
            />

            <button
              type="submit"
              disabled={!messageText.trim() || inputDisabled}
              style={{
                ...sendButtonStyle,
                opacity: !messageText.trim() || inputDisabled ? 0.55 : 1,
                cursor: !messageText.trim() || inputDisabled ? "not-allowed" : "pointer",
              }}
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top left, rgba(168,85,247,0.22), transparent 34%), radial-gradient(circle at bottom right, rgba(34,211,238,0.10), transparent 30%), #05070a",
  color: "#f9fafb",
};

const shellStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "1500px",
  margin: "0 auto",
  padding: "18px",
  display: "grid",
  gridTemplateColumns: "280px minmax(0, 1fr)",
  gap: "18px",
};

const sidebarStyle: React.CSSProperties = {
  minHeight: "calc(100vh - 36px)",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "linear-gradient(180deg, rgba(17,24,39,0.92), rgba(10,12,18,0.92))",
  borderRadius: "28px",
  padding: "18px",
  boxShadow: "0 24px 70px rgba(0,0,0,0.35)",
  position: "sticky",
  top: "18px",
  alignSelf: "start",
};

const backLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  color: "#d8b4fe",
  textDecoration: "none",
  fontWeight: 800,
  fontSize: "13px",
  marginBottom: "26px",
};

const brandBlockStyle: React.CSSProperties = {
  marginBottom: "24px",
};

const brandTitleStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 950,
  letterSpacing: "-0.04em",
};

const brandSubtitleStyle: React.CSSProperties = {
  color: "#a855f7",
  fontSize: "12px",
  letterSpacing: "0.32em",
  fontWeight: 900,
  marginTop: "2px",
};

const sidebarCardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.055)",
  borderRadius: "22px",
  padding: "16px",
  marginBottom: "14px",
};

const sidebarLabelStyle: React.CSSProperties = {
  color: "#c084fc",
  fontSize: "12px",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  marginBottom: "8px",
};

const sidebarTitleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 900,
  marginBottom: "8px",
};

const sidebarTextStyle: React.CSSProperties = {
  margin: 0,
  color: "#9ca3af",
  lineHeight: 1.6,
  fontSize: "13px",
};

const profileLinkStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: "42px",
  borderRadius: "999px",
  border: "1px solid rgba(168,85,247,0.36)",
  background: "rgba(168,85,247,0.14)",
  color: "#f5d0fe",
  textDecoration: "none",
  fontWeight: 900,
  fontSize: "13px",
};

const chatPanelStyle: React.CSSProperties = {
  minHeight: "calc(100vh - 36px)",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(7,10,16,0.86)",
  borderRadius: "28px",
  overflow: "hidden",
  display: "grid",
  gridTemplateRows: "82px minmax(0, 1fr) auto",
  boxShadow: "0 24px 70px rgba(0,0,0,0.35)",
};

const chatHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "14px",
  padding: "14px 18px",
  borderBottom: "1px solid rgba(255,255,255,0.10)",
  background:
    "linear-gradient(135deg, rgba(17,24,39,0.96), rgba(88,28,135,0.30), rgba(8,12,18,0.96))",
};

const headerLeftStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  minWidth: 0,
};

const mobileBackButtonStyle: React.CSSProperties = {
  width: "38px",
  height: "38px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "#ffffff",
  fontSize: "18px",
  cursor: "pointer",
};

const avatarWrapStyle: React.CSSProperties = {
  width: "52px",
  height: "52px",
  borderRadius: "50%",
  position: "relative",
  border: "2px solid rgba(168,85,247,0.82)",
  padding: "2px",
  background: "#090b12",
  flexShrink: 0,
};

const avatarImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  objectFit: "cover",
};

const avatarFallbackStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  fontWeight: 950,
  background: "linear-gradient(135deg, #7c3aed, #111827)",
};

const onlineDotStyle: React.CSSProperties = {
  position: "absolute",
  right: "2px",
  bottom: "2px",
  width: "13px",
  height: "13px",
  borderRadius: "999px",
  background: "#22c55e",
  border: "2px solid #05070a",
};

const headerTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "18px",
  fontWeight: 950,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const headerSubtitleStyle: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "13px",
  marginTop: "3px",
};

const headerProfileButtonStyle: React.CSSProperties = {
  textDecoration: "none",
  color: "#f9fafb",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  borderRadius: "999px",
  padding: "10px 14px",
  fontWeight: 900,
  fontSize: "13px",
  flexShrink: 0,
};

const messagesAreaStyle: React.CSSProperties = {
  minHeight: 0,
  overflowY: "auto",
  padding: "18px",
};

const emptyStateStyle: React.CSSProperties = {
  minHeight: "100%",
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  gap: "6px",
  color: "#9ca3af",
};

const errorBoxStyle: React.CSSProperties = {
  border: "1px solid rgba(248,113,113,0.35)",
  background: "rgba(127,29,29,0.22)",
  color: "#fecaca",
  borderRadius: "18px",
  padding: "14px",
  fontWeight: 800,
  display: "grid",
  gap: "8px",
  alignContent: "start",
};

const retryButtonStyle: React.CSSProperties = {
  width: "fit-content",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.08)",
  color: "#ffffff",
  borderRadius: "999px",
  padding: "8px 12px",
  fontWeight: 900,
  cursor: "pointer",
};

const messageStackStyle: React.CSSProperties = {
  display: "grid",
  gap: "18px",
};

const messageGroupStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
};

const dateDividerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  margin: "6px 0",
  color: "#9ca3af",
  fontSize: "12px",
  fontWeight: 800,
};

const messageRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: "8px",
};

const smallAvatarStyle: React.CSSProperties = {
  width: "30px",
  height: "30px",
  borderRadius: "50%",
  background: "rgba(255,255,255,0.07)",
  display: "grid",
  placeItems: "center",
  color: "#f9fafb",
  fontSize: "12px",
  fontWeight: 900,
  flexShrink: 0,
  overflow: "hidden",
};

const smallAvatarImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const bubbleWrapStyle: React.CSSProperties = {
  maxWidth: "min(680px, 78%)",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const myBubbleStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #9333ea, #7c3aed)",
  color: "#ffffff",
  borderRadius: "20px 20px 6px 20px",
  padding: "11px 14px",
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  boxShadow: "0 12px 30px rgba(124,58,237,0.24)",
};

const theirBubbleStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.075)",
  color: "#f9fafb",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "20px 20px 20px 6px",
  padding: "11px 14px",
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const messageTimeStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "11px",
  fontWeight: 700,
  padding: "0 4px",
};

const composerShellStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: "10px",
  padding: "14px",
  borderTop: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(3,7,18,0.92)",
};

const composerInputStyle: React.CSSProperties = {
  flex: 1,
  minHeight: "44px",
  maxHeight: "130px",
  resize: "none",
  borderRadius: "18px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.065)",
  color: "#ffffff",
  outline: "none",
  padding: "12px 14px",
  lineHeight: 1.45,
  fontSize: "14px",
};

const sendButtonStyle: React.CSSProperties = {
  minHeight: "44px",
  borderRadius: "999px",
  border: "1px solid rgba(168,85,247,0.55)",
  background: "linear-gradient(135deg, #a855f7, #7c3aed)",
  color: "#ffffff",
  padding: "0 18px",
  fontWeight: 950,
};


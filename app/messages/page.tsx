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
import { useRouter, useSearchParams } from "next/navigation";
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

type ConversationItem = ConversationRow & {
  otherUserId: string;
  otherProfile: ProfileRow | null;
  lastMessage: MessageRow | null;
  unreadCount: number;
};

function formatMessageTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
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

function getProfileName(profile?: ProfileRow | null) {
  return profile?.full_name || profile?.username || "Parapost Member";
}

export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedConversationFromUrl = searchParams.get("conversation") || "";

  const [viewerId, setViewerId] = useState("");
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState(selectedConversationFromUrl);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [messageText, setMessageText] = useState("");
  const [searchText, setSearchText] = useState("");
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(!!selectedConversationFromUrl);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeConversation = useMemo(() => {
    return conversations.find((conversation) => conversation.id === activeConversationId) || null;
  }, [conversations, activeConversationId]);

  const totalUnreadCount = useMemo(() => {
    return conversations.reduce((total, conversation) => total + conversation.unreadCount, 0);
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    const term = searchText.trim().toLowerCase();

    if (!term) return conversations;

    return conversations.filter((conversation) => {
      const profile = conversation.otherProfile;
      const name = getProfileName(profile).toLowerCase();
      const username = profile?.username?.toLowerCase() || "";
      const lastMessage = conversation.lastMessage?.body?.toLowerCase() || "";

      return name.includes(term) || username.includes(term) || lastMessage.includes(term);
    });
  }, [conversations, searchText]);

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
    }, 70);
  }, []);

  const markConversationRead = useCallback(
    async (conversationId: string, currentViewerId: string) => {
      if (!conversationId || !currentViewerId) return;

      const { error } = await supabase
        .from("direct_messages")
        .update({ is_read: true })
        .eq("conversation_id", conversationId)
        .neq("sender_id", currentViewerId)
        .eq("is_read", false);

      if (error) {
        console.warn("Mark read warning:", error.message);
        return;
      }

      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, unreadCount: 0 }
            : conversation
        )
      );
    },
    []
  );

  const loadInbox = useCallback(async () => {
    setLoadingInbox(true);
    setErrorMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.push("/");
      return;
    }

    setViewerId(user.id);

    const { data: conversationData, error: conversationError } = await supabase
      .from("direct_conversations")
      .select("id, user_one_id, user_two_id, created_at, updated_at")
      .or(`user_one_id.eq.${user.id},user_two_id.eq.${user.id}`)
      .order("updated_at", { ascending: false });

    if (conversationError) {
      setErrorMessage(conversationError.message || "Could not load conversations.");
      setLoadingInbox(false);
      return;
    }

    const rawConversations = ((conversationData as ConversationRow[]) || []).filter(Boolean);

    if (rawConversations.length === 0) {
      setConversations([]);
      setActiveConversationId("");
      setMessages([]);
      setMobileChatOpen(false);
      setLoadingInbox(false);
      return;
    }

    const otherUserIds = [
      ...new Set(
        rawConversations
          .map((conversation) =>
            conversation.user_one_id === user.id
              ? conversation.user_two_id || ""
              : conversation.user_one_id || ""
          )
          .filter(Boolean)
      ),
    ];

    const conversationIds = rawConversations.map((conversation) => conversation.id);

    const [{ data: profileData }, { data: messageData, error: messagesError }] =
      await Promise.all([
        otherUserIds.length > 0
          ? supabase
              .from("profiles")
              .select("id, username, full_name, avatar_url, is_online")
              .in("id", otherUserIds)
          : Promise.resolve({ data: [] }),
        supabase
          .from("direct_messages")
          .select("id, conversation_id, sender_id, body, created_at, is_read")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: false }),
      ]);

    if (messagesError) {
      setErrorMessage(messagesError.message || "Could not load messages.");
      setLoadingInbox(false);
      return;
    }

    const profileMap = new Map(
      ((profileData as ProfileRow[]) || []).map((profile) => [profile.id, profile])
    );

    const allMessages = ((messageData as MessageRow[]) || []).filter(Boolean);

    const nextItems: ConversationItem[] = rawConversations
      .map((conversation) => {
        const otherUserId =
          conversation.user_one_id === user.id
            ? conversation.user_two_id || ""
            : conversation.user_one_id || "";

        const conversationMessages = allMessages.filter(
          (message) => message.conversation_id === conversation.id
        );

        const lastMessage =
          conversationMessages.sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0] || null;

        const unreadCount = conversationMessages.filter(
          (message) => message.sender_id !== user.id && message.is_read === false
        ).length;

        return {
          ...conversation,
          otherUserId,
          otherProfile: profileMap.get(otherUserId) || null,
          lastMessage,
          unreadCount,
        };
      })
      .sort((a, b) => {
        const aTime = new Date(
          a.lastMessage?.created_at || a.updated_at || a.created_at || 0
        ).getTime();
        const bTime = new Date(
          b.lastMessage?.created_at || b.updated_at || b.created_at || 0
        ).getTime();
        return bTime - aTime;
      });

    setConversations(nextItems);

    const urlConversationValid = nextItems.some(
      (conversation) => conversation.id === selectedConversationFromUrl
    );

    const nextActiveId =
      urlConversationValid
        ? selectedConversationFromUrl
        : activeConversationId &&
            nextItems.some((conversation) => conversation.id === activeConversationId)
          ? activeConversationId
          : nextItems[0]?.id || "";

    setActiveConversationId(nextActiveId);

    if (selectedConversationFromUrl && urlConversationValid) {
      setMobileChatOpen(true);
    }

    if (!selectedConversationFromUrl && nextActiveId) {
      router.replace(`/messages?conversation=${nextActiveId}`);
    }

    setLoadingInbox(false);
  }, [activeConversationId, router, selectedConversationFromUrl]);

  const loadMessages = useCallback(
    async (conversationId: string, currentViewerId: string) => {
      if (!conversationId || !currentViewerId) {
        setMessages([]);
        return;
      }

      setLoadingMessages(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("direct_messages")
        .select("id, conversation_id, sender_id, body, created_at, is_read")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) {
        setErrorMessage(error.message || "Could not load this conversation.");
        setMessages([]);
        setLoadingMessages(false);
        return;
      }

      setMessages((data as MessageRow[]) || []);
      await markConversationRead(conversationId, currentViewerId);
      setLoadingMessages(false);
      scrollToBottom("auto");
    },
    [markConversationRead, scrollToBottom]
  );

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (!viewerId || !activeConversationId) return;

    loadMessages(activeConversationId, viewerId);
  }, [activeConversationId, viewerId, loadMessages]);

  useEffect(() => {
    if (!viewerId) return;

    const channel = supabase
      .channel(`parachat-hub-${viewerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
        },
        async (payload) => {
          const nextMessage = payload.new as MessageRow;

          const belongsToUser = conversations.some(
            (conversation) => conversation.id === nextMessage.conversation_id
          );

          if (!belongsToUser) {
            await loadInbox();
            return;
          }

          setConversations((prev) =>
            prev
              .map((conversation) => {
                if (conversation.id !== nextMessage.conversation_id) return conversation;

                const isActive = activeConversationId === nextMessage.conversation_id;
                const isMine = nextMessage.sender_id === viewerId;

                return {
                  ...conversation,
                  lastMessage: nextMessage,
                  unreadCount:
                    !isActive && !isMine
                      ? conversation.unreadCount + 1
                      : conversation.unreadCount,
                  updated_at: nextMessage.created_at,
                };
              })
              .sort((a, b) => {
                const aTime = new Date(
                  a.lastMessage?.created_at || a.updated_at || 0
                ).getTime();
                const bTime = new Date(
                  b.lastMessage?.created_at || b.updated_at || 0
                ).getTime();
                return bTime - aTime;
              })
          );

          if (nextMessage.conversation_id === activeConversationId) {
            setMessages((prev) => {
              if (prev.some((message) => message.id === nextMessage.id)) return prev;
              return [...prev, nextMessage];
            });

            if (nextMessage.sender_id !== viewerId) {
              await markConversationRead(nextMessage.conversation_id, viewerId);
            }

            scrollToBottom();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    activeConversationId,
    conversations,
    loadInbox,
    markConversationRead,
    scrollToBottom,
    viewerId,
  ]);

  const handleSelectConversation = async (conversationId: string) => {
    setActiveConversationId(conversationId);
    setMobileChatOpen(true);
    router.replace(`/messages?conversation=${conversationId}`);

    if (viewerId) {
      await markConversationRead(conversationId, viewerId);
    }
  };

  const handleMobileBackToInbox = () => {
    setMobileChatOpen(false);
  };

  const handleTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setMessageText(event.target.value);

    const textarea = event.currentTarget;
    textarea.style.height = "44px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 130)}px`;
  };

  const handleSendMessage = async () => {
    const trimmed = messageText.trim();

    if (!trimmed || sending || !viewerId || !activeConversationId) return;

    setSending(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("direct_messages")
      .insert([
        {
          conversation_id: activeConversationId,
          sender_id: viewerId,
          body: trimmed,
          is_read: false,
        },
      ])
      .select("id, conversation_id, sender_id, body, created_at, is_read")
      .single();

    if (error) {
      setErrorMessage(error.message || "Message could not be sent.");
      setSending(false);
      return;
    }

    if (data) {
      const sentMessage = data as MessageRow;

      setMessages((prev) => {
        if (prev.some((message) => message.id === sentMessage.id)) return prev;
        return [...prev, sentMessage];
      });

      setConversations((prev) =>
        prev
          .map((conversation) =>
            conversation.id === activeConversationId
              ? {
                  ...conversation,
                  lastMessage: sentMessage,
                  updated_at: sentMessage.created_at,
                }
              : conversation
          )
          .sort((a, b) => {
            const aTime = new Date(
              a.lastMessage?.created_at || a.updated_at || 0
            ).getTime();
            const bTime = new Date(
              b.lastMessage?.created_at || b.updated_at || 0
            ).getTime();
            return bTime - aTime;
          })
      );
    }

    await supabase
      .from("direct_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", activeConversationId);

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

  const activeProfile = activeConversation?.otherProfile || null;
  const activeName = getProfileName(activeProfile);
  const activeHandle = activeProfile?.username ? `@${activeProfile.username}` : "Parapost Network member";
  const inputDisabled =
    loadingInbox || loadingMessages || sending || !activeConversationId || !!errorMessage;

  return (
    <div style={pageStyle}>
      <style>{`
        @media (max-width: 980px) {
          .parachat-shell {
            grid-template-columns: 1fr !important;
            padding: 0 !important;
            min-height: 100vh !important;
          }

          .parachat-inbox {
            display: block !important;
            border-radius: 0 !important;
            min-height: 100vh !important;
            max-height: none !important;
            border: none !important;
          }

          .parachat-panel {
            display: none !important;
            border-radius: 0 !important;
            min-height: 100vh !important;
            border: none !important;
          }

          .parachat-mobile-chat-open .parachat-inbox {
            display: none !important;
          }

          .parachat-mobile-chat-open .parachat-panel {
            display: grid !important;
          }

          .parachat-desktop-only {
            display: none !important;
          }

          .parachat-mobile-back {
            display: inline-flex !important;
          }

          .parachat-conversation-list {
            max-height: calc(100vh - 230px) !important;
          }
        }

        @media (min-width: 981px) {
          .parachat-mobile-back {
            display: none !important;
          }
        }

        @media (max-width: 640px) {
          .parachat-title {
            font-size: 25px !important;
          }

          .parachat-panel {
            grid-template-rows: 76px minmax(0, 1fr) auto !important;
          }

          .parachat-messages {
            padding: 14px !important;
          }

          .parachat-composer {
            padding: 10px !important;
          }
        }
      `}</style>

      <div
        className={`parachat-shell ${mobileChatOpen ? "parachat-mobile-chat-open" : ""}`}
        style={shellStyle}
      >
        <aside className="parachat-inbox" style={inboxStyle}>
          <div style={inboxHeaderStyle}>
            <Link href="/dashboard" style={backLinkStyle}>
              ← Feed
            </Link>

            <div style={{ textAlign: "right" }}>
              <div style={brandTitleStyle}>PARAPOST</div>
              <div style={brandSubtitleStyle}>PARACHAT</div>
            </div>
          </div>

          <div style={heroCardStyle}>
            <div style={heroIconStyle}>💬</div>
            <div style={{ minWidth: 0 }}>
              <h1 className="parachat-title" style={inboxTitleStyle}>Parachat</h1>
              <p style={inboxSubtitleStyle}>
                Premium direct messaging for Parapost Network.
              </p>
            </div>

            {totalUnreadCount > 0 ? (
              <span style={totalBadgeStyle}>{totalUnreadCount}</span>
            ) : null}
          </div>

          <div style={statusStripStyle}>
            <span style={statusDotStyle} />
            <span>
              {totalUnreadCount > 0
                ? `${totalUnreadCount} unread message${totalUnreadCount === 1 ? "" : "s"}`
                : "All caught up"}
            </span>
          </div>

          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search Parachat..."
            style={searchInputStyle}
          />

          <div className="parachat-conversation-list" style={conversationListStyle}>
            {loadingInbox ? (
              <div style={conversationEmptyStyle}>Loading Parachat...</div>
            ) : filteredConversations.length === 0 ? (
              <div style={conversationEmptyStyle}>
                No conversations yet. Visit a profile and click Message to start a Parachat.
              </div>
            ) : (
              filteredConversations.map((conversation) => {
                const profile = conversation.otherProfile;
                const isActive = conversation.id === activeConversationId;

                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => handleSelectConversation(conversation.id)}
                    style={isActive ? conversationItemActiveStyle : conversationItemStyle}
                  >
                    <div style={conversationAvatarWrapStyle}>
                      {profile?.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt=""
                          style={conversationAvatarImageStyle}
                        />
                      ) : (
                        <div style={conversationAvatarFallbackStyle}>
                          {getInitial(profile)}
                        </div>
                      )}

                      {profile?.is_online ? <span style={onlineDotStyle} /> : null}
                    </div>

                    <div style={conversationTextStyle}>
                      <div style={conversationTopLineStyle}>
                        <strong style={conversationNameStyle}>
                          {getProfileName(profile)}
                        </strong>

                        <span style={conversationTimeStyle}>
                          {formatMessageTime(conversation.lastMessage?.created_at)}
                        </span>
                      </div>

                      <div style={conversationBottomLineStyle}>
                        <span
                          style={{
                            ...conversationPreviewStyle,
                            color: conversation.unreadCount > 0 ? "#f9fafb" : "#9ca3af",
                            fontWeight: conversation.unreadCount > 0 ? 850 : 500,
                          }}
                        >
                          {conversation.lastMessage?.body || "No messages yet"}
                        </span>

                        {conversation.unreadCount > 0 ? (
                          <span style={unreadBadgeStyle}>{conversation.unreadCount}</span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <main className="parachat-panel" style={chatPanelStyle}>
          {!activeConversationId ? (
            <div style={selectConversationStyle}>
              <div style={emptyIconStyle}>💬</div>
              <strong>Select a Parachat</strong>
              <span>Choose someone from the left to start messaging.</span>
            </div>
          ) : (
            <>
              <header style={chatHeaderStyle}>
                <div style={headerLeftStyle}>
                  <button
                    type="button"
                    className="parachat-mobile-back"
                    onClick={handleMobileBackToInbox}
                    style={mobileBackButtonStyle}
                    aria-label="Back to Parachat inbox"
                  >
                    ←
                  </button>

                  <div style={avatarWrapStyle}>
                    {activeProfile?.avatar_url ? (
                      <img src={activeProfile.avatar_url} alt="" style={avatarImageStyle} />
                    ) : (
                      <div style={avatarFallbackStyle}>{getInitial(activeProfile)}</div>
                    )}

                    {activeProfile?.is_online ? <span style={onlineDotStyle} /> : null}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <h2 style={headerTitleStyle}>{activeName}</h2>
                    <div style={headerSubtitleStyle}>
                      {activeProfile?.is_online ? "Online now" : activeHandle}
                    </div>
                  </div>
                </div>

                <div style={headerActionsStyle}>
                  <span className="parachat-desktop-only" style={securePillStyle}>Private</span>

                  {activeConversation?.otherUserId ? (
                    <Link
                      href={`/profile/${activeConversation.otherUserId}`}
                      style={profileButtonStyle}
                    >
                      Profile
                    </Link>
                  ) : null}
                </div>
              </header>

              <section className="parachat-messages" style={messagesAreaStyle}>
                {loadingMessages ? (
                  <div style={emptyStateStyle}>
                    <div style={emptyIconStyle}>⌛</div>
                    <strong>Loading Parachat...</strong>
                    <span>Getting this conversation ready.</span>
                  </div>
                ) : errorMessage ? (
                  <div style={errorBoxStyle}>
                    <strong>Parachat needs attention</strong>
                    <span>{errorMessage}</span>
                    <button
                      type="button"
                      onClick={() =>
                        activeConversationId && viewerId
                          ? loadMessages(activeConversationId, viewerId)
                          : loadInbox()
                      }
                      style={retryButtonStyle}
                    >
                      Retry
                    </button>
                  </div>
                ) : messages.length === 0 ? (
                  <div style={emptyStateStyle}>
                    <div style={emptyIconStyle}>👋</div>
                    <strong>No messages yet</strong>
                    <span>Start the Parachat with {activeName}.</span>
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
                                  {activeProfile?.avatar_url ? (
                                    <img
                                      src={activeProfile.avatar_url}
                                      alt=""
                                      style={smallAvatarImageStyle}
                                    />
                                  ) : (
                                    <span>{getInitial(activeProfile)}</span>
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

              <form className="parachat-composer" onSubmit={handleSubmit} style={composerShellStyle}>
                <textarea
                  ref={textareaRef}
                  value={messageText}
                  onChange={handleTextChange}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={`Send a Parachat to ${activeName}...`}
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
            </>
          )}
        </main>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top left, rgba(168,85,247,0.30), transparent 34%), radial-gradient(circle at bottom right, rgba(34,211,238,0.12), transparent 30%), radial-gradient(circle at 50% 0%, rgba(236,72,153,0.10), transparent 28%), #05070a",
  color: "#f9fafb",
};

const shellStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "1600px",
  margin: "0 auto",
  padding: "18px",
  display: "grid",
  gridTemplateColumns: "400px minmax(0, 1fr)",
  gap: "18px",
};

const inboxStyle: React.CSSProperties = {
  minHeight: "calc(100vh - 36px)",
  border: "1px solid rgba(255,255,255,0.10)",
  background:
    "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(7,10,16,0.94))",
  borderRadius: "30px",
  padding: "16px",
  boxShadow: "0 24px 70px rgba(0,0,0,0.38)",
  overflow: "hidden",
  backdropFilter: "blur(18px)",
};

const inboxHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "14px",
};

const backLinkStyle: React.CSSProperties = {
  color: "#d8b4fe",
  textDecoration: "none",
  fontWeight: 900,
  fontSize: "13px",
};

const brandTitleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 950,
  letterSpacing: "-0.04em",
};

const brandSubtitleStyle: React.CSSProperties = {
  color: "#a855f7",
  fontSize: "10px",
  letterSpacing: "0.28em",
  fontWeight: 900,
};

const heroCardStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "48px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "12px",
  padding: "14px",
  borderRadius: "24px",
  border: "1px solid rgba(168,85,247,0.28)",
  background:
    "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(255,255,255,0.055))",
  marginBottom: "12px",
};

const heroIconStyle: React.CSSProperties = {
  width: "48px",
  height: "48px",
  borderRadius: "18px",
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg, #a855f7, #7c3aed)",
  boxShadow: "0 14px 34px rgba(168,85,247,0.30)",
  fontSize: "22px",
};

const inboxTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "30px",
  fontWeight: 950,
  letterSpacing: "-0.06em",
};

const inboxSubtitleStyle: React.CSSProperties = {
  margin: "3px 0 0",
  color: "#9ca3af",
  fontSize: "13px",
};

const totalBadgeStyle: React.CSSProperties = {
  minWidth: "30px",
  height: "30px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg, #ec4899, #a855f7)",
  color: "#ffffff",
  fontWeight: 950,
  boxShadow: "0 10px 28px rgba(168,85,247,0.35)",
};

const statusStripStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  color: "#d1d5db",
  fontSize: "12px",
  fontWeight: 800,
  padding: "8px 10px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.045)",
  marginBottom: "12px",
};

const statusDotStyle: React.CSSProperties = {
  width: "8px",
  height: "8px",
  borderRadius: "999px",
  background: "#22c55e",
  boxShadow: "0 0 18px rgba(34,197,94,0.60)",
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "46px",
  borderRadius: "18px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.065)",
  color: "#ffffff",
  outline: "none",
  padding: "0 14px",
  marginBottom: "14px",
};

const conversationListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  maxHeight: "calc(100vh - 250px)",
  overflowY: "auto",
  paddingRight: "2px",
};

const conversationEmptyStyle: React.CSSProperties = {
  color: "#9ca3af",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.045)",
  borderRadius: "18px",
  padding: "16px",
  lineHeight: 1.5,
};

const conversationItemStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.045)",
  color: "#f9fafb",
  borderRadius: "20px",
  padding: "11px",
  display: "flex",
  alignItems: "center",
  gap: "11px",
  cursor: "pointer",
  textAlign: "left",
  transition: "transform 160ms ease, border-color 160ms ease, background 160ms ease",
};

const conversationItemActiveStyle: React.CSSProperties = {
  ...conversationItemStyle,
  border: "1px solid rgba(168,85,247,0.55)",
  background:
    "linear-gradient(135deg, rgba(168,85,247,0.24), rgba(255,255,255,0.065))",
  boxShadow: "0 14px 38px rgba(0,0,0,0.30)",
};

const conversationAvatarWrapStyle: React.CSSProperties = {
  width: "52px",
  height: "52px",
  borderRadius: "50%",
  position: "relative",
  flexShrink: 0,
  border: "2px solid rgba(168,85,247,0.72)",
  padding: "2px",
  background: "#05070a",
};

const conversationAvatarImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  objectFit: "cover",
};

const conversationAvatarFallbackStyle: React.CSSProperties = {
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
  right: "1px",
  bottom: "1px",
  width: "12px",
  height: "12px",
  borderRadius: "999px",
  background: "#22c55e",
  border: "2px solid #05070a",
};

const conversationTextStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const conversationTopLineStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
};

const conversationNameStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "14px",
};

const conversationTimeStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "11px",
  fontWeight: 800,
  flexShrink: 0,
};

const conversationBottomLineStyle: React.CSSProperties = {
  marginTop: "4px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
};

const conversationPreviewStyle: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "12px",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const unreadBadgeStyle: React.CSSProperties = {
  minWidth: "21px",
  height: "21px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg, #ec4899, #a855f7)",
  color: "#ffffff",
  fontSize: "11px",
  fontWeight: 950,
};

const chatPanelStyle: React.CSSProperties = {
  minHeight: "calc(100vh - 36px)",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(7,10,16,0.90)",
  borderRadius: "30px",
  overflow: "hidden",
  display: "grid",
  gridTemplateRows: "86px minmax(0, 1fr) auto",
  boxShadow: "0 24px 70px rgba(0,0,0,0.38)",
  backdropFilter: "blur(18px)",
};

const selectConversationStyle: React.CSSProperties = {
  minHeight: "calc(100vh - 36px)",
  display: "grid",
  placeItems: "center",
  color: "#9ca3af",
  textAlign: "center",
  gap: "8px",
};

const emptyIconStyle: React.CSSProperties = {
  width: "62px",
  height: "62px",
  borderRadius: "22px",
  display: "grid",
  placeItems: "center",
  background: "rgba(168,85,247,0.16)",
  border: "1px solid rgba(168,85,247,0.24)",
  fontSize: "26px",
  margin: "0 auto 6px",
};

const chatHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "14px",
  padding: "14px 18px",
  borderBottom: "1px solid rgba(255,255,255,0.10)",
  background:
    "linear-gradient(135deg, rgba(17,24,39,0.96), rgba(88,28,135,0.34), rgba(8,12,18,0.96))",
};

const headerLeftStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  minWidth: 0,
};

const headerActionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexShrink: 0,
};

const mobileBackButtonStyle: React.CSSProperties = {
  display: "none",
  width: "38px",
  height: "38px",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "#ffffff",
  fontSize: "18px",
  cursor: "pointer",
  flexShrink: 0,
};

const avatarWrapStyle: React.CSSProperties = {
  width: "54px",
  height: "54px",
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

const headerTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "19px",
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

const securePillStyle: React.CSSProperties = {
  color: "#86efac",
  border: "1px solid rgba(34,197,94,0.24)",
  background: "rgba(34,197,94,0.10)",
  borderRadius: "999px",
  padding: "8px 10px",
  fontWeight: 900,
  fontSize: "12px",
};

const profileButtonStyle: React.CSSProperties = {
  textDecoration: "none",
  color: "#f9fafb",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  borderRadius: "999px",
  padding: "9px 13px",
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
  gap: "7px",
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
  maxWidth: "min(700px, 78%)",
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

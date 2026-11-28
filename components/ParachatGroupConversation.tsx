"use client";

import { createPortal } from "react-dom";

import {
  getGroupChatPendingMembers,
  cancelGroupChatInvitation,
  type GroupChatPendingMember,
} from "@/lib/parachat/group-client";

import { useEffect, useRef, useState } from "react";
import {
  editGroupChatMessage,
  deleteGroupChatMessage,
  getGroupShareRecipients,
  shareGroupTextToDirect,
  shareGroupPhotoToDirect,
  type GroupShareRecipient,
} from "@/lib/parachat/group-client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import MentionTextarea from "@/components/MentionTextarea";
import ParachatGroupCreate from "@/components/ParachatGroupCreate";
import ParachatGroupAvatar from "@/components/ParachatGroupAvatar";
import {
  GROUP_PHOTO_ACCEPT,
  uploadGroupChatPhoto,
} from "@/lib/parachat/group-photo-client";
import {
  GROUP_MEDIA_ACCEPT,
  uploadGroupChatMedia,
  getGroupChatAttachment,
} from "@/lib/parachat/group-media-client";

import {
  groupChatEnabled,
  getGroupChatDetails,
  setGroupChatInvitationMode,
  type GroupChatDetails,
  getGroupChatMembers,
  getGroupChatMessages,
  sendGroupChatMessage,
  sendGroupChatReply,
  GROUP_CHAT_REACTIONS,
  setGroupChatReaction,
  reportGroupChatMessage,
  type GroupChatReaction,

  markGroupChatRead,
  manageGroupChat,
  type GroupChatMessage,
  type GroupChatMember,
} from "@/lib/parachat/group-client";

type GroupComposerControls = (
  onAttach: () => void,
  attachDisabled: boolean,
  isGroup?: boolean
) => React.ReactNode;

export default function GroupConversation({
  userId,
  conversationId,
  renderControls,
}: {
  userId: string;
  conversationId: string;
  renderControls: GroupComposerControls;
}) {
  const [name, setName] = useState("Group Chat");
  const [details, setDetails] = useState<GroupChatDetails | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyCursors, setHistoryCursors] =
    useState<(number | null)[]>([null]);
  const [hasOlder, setHasOlder] = useState(false);

  const historyCursor =
    historyCursors[historyCursors.length - 1];

  const browsingHistory = historyCursor !== null;

  function changeHistory(cursors: (number | null)[]) {
    setAvailable(false);
    setLoading(true);
    setMessages([]);
    setSettingsOpen(false);
    setHistoryCursors(cursors);
  }
  const [members, setMembers] =
    useState<GroupChatMember[]>([]);

  const [messages, setMessages] =
    useState<GroupChatMessage[]>([]);

  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");

  const bottom = useRef<HTMLDivElement>(null);
  const refreshRef = useRef<() => void>(() => {});
  const lastRead = useRef(0);
  const sendingRef = useRef(false);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const replyTarget = messages.find(
    (message) => message.id === replyToId
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState("");

  async function upload(file: File) {
    if (replyToId) {
      setSendError("Cancel the reply before uploading an attachment.");
      return;
    }

    if (!available || sendingRef.current) return;

    sendingRef.current = true;
    setSending(true);
    setSendError("");

    try {
      await uploadGroupChatMedia(
        conversationId,
        file,
        (status) => setUploadStatus(
          status === "reserving" ? "Preparing..." :
          status === "uploading" ? "Uploading..." :
          "Verifying..."
        )
      );

      refreshRef.current();
    } catch (error) {
      setSendError(
        error instanceof Error
          ? error.message
          : "Attachment could not be sent."
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
      setUploadStatus("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  useEffect(() => {
    let disposed = false;
    let running = false;
    let again = false;

    const refresh = async () => {
      if (disposed || document.hidden) return;

      if (running) {
        again = true;
        return;
      }

      running = true;

      try {
        const [rows, people, group] = await Promise.all([
          getGroupChatMessages(conversationId, historyCursor),
          getGroupChatMembers(conversationId),
          getGroupChatDetails(conversationId),
        ]);

        if (disposed) return;

        if (!people.some((person) => person.user_id === userId)) {
          throw new Error("Group membership required.");
        }

        setHasOlder(rows.length === 50);



        setName(group?.name || "Group Chat");
        setDetails(group);
        setPhotoPath(group?.photo_path || null);
        setMembers(people);
        setMessages([...rows].reverse());
        setAvailable(true);
        setError("");

        const latest = rows[0]?.sequence_number || 0;

        if (
          !browsingHistory &&
          !document.hidden &&
          latest > lastRead.current
        ) {
          try {
            await markGroupChatRead(conversationId, latest);
            lastRead.current = latest;
          } catch {
            // Retry during the next refresh.
          }
        }
      } catch {
        if (!disposed) {
          setAvailable(false);
          setMessages([]);
          setMembers([]);
          setError("Group conversation unavailable.");
        }
      } finally {
        running = false;

        if (!disposed) {
          setLoading(false);

          if (again) {
            again = false;
            void refresh();
          }
        }
      }
    };

    refreshRef.current = () => void refresh();

    void refresh();

    const timer = setInterval(refresh, 15000);

    document.addEventListener(
      "visibilitychange", refresh
    );

    return () => {
      disposed = true;
      clearInterval(timer);
      refreshRef.current = () => {};
      document.removeEventListener(
        "visibilitychange", refresh
      );
    };
  }, [conversationId, userId, historyCursor, browsingHistory]);

  const latestMessageId =
    messages[messages.length - 1]?.id;

  useEffect(() => {
    if (browsingHistory) return;

    bottom.current?.scrollIntoView({
      block: "nearest",
    });
  }, [latestMessageId, browsingHistory]);

  async function send() {
    if (!available || sendingRef.current || !body.trim()) return;

    sendingRef.current = true;
    setSending(true);
    setSendError("");

    try {
      if (replyToId) {
        await sendGroupChatReply(conversationId, replyToId, body);
      } else {
        await sendGroupChatMessage(conversationId, body);
      }

      setReplyToId(null);

      setBody("");
      refreshRef.current();
    } catch {
      setSendError("Message could not be sent.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <div style={{
      gridRow: "1 / -1",
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      minHeight: 0,
      minWidth: 0,
      overflow: "hidden",
      boxSizing: "border-box",
      color: "#f9fafb",
    }}>
      <header className="parachat-group-header" style={{
        ...chatHeaderStyle,
        flexShrink: 0,
        minHeight: 86,
        boxSizing: "border-box",
      }}>
        <div style={headerLeftStyle}>
        <Link
          href="/messages"
          className="parachat-mobile-back"
          aria-label="Back to Parachat"
          style={mobileBackButtonStyle}
        >
          ←
        </Link>

        {available ? (
          <ParachatGroupAvatar
            key={photoPath || "default"}
            conversationId={conversationId}
            name={name}
            photoPath={photoPath}
            size={54}
          />
        ) : null}

        <div style={{ minWidth: 0 }}>
          <h2 style={headerTitleStyle}>{name}</h2>

          <div style={headerSubtitleStyle}>
            {members.length} visible members
          </div>
        </div>
        </div>

        <div style={headerActionsStyle}>
        {available ? (
          <button
            type="button"
            aria-label="Group settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
            style={closeChatButtonStyle}
          >
            ⋯
          </button>
        ) : null}

        <Link
          href="/messages"
          aria-label="Close group conversation"
          style={{
            ...closeChatButtonStyle,
            textDecoration: "none",
          }}
        >
          ×
        </Link>
        </div>
      </header>

      {available && settingsOpen ? (
        <GroupSettings details={details}
          photoPath={photoPath}
          conversationId={conversationId}
          userId={userId}
          name={name}
          members={members}
          onRefresh={() => refreshRef.current()}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {available && (hasOlder || browsingHistory) ? (
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: 16,
          padding: "5px 0",
        }}>
          {hasOlder && messages.length > 0 ? (
            <button
              type="button"
              disabled={sending}
              onClick={() => changeHistory([
                ...historyCursors,
                messages[0].sequence_number,
              ])}
              style={{
                background: "transparent",
                border: 0,
                color: "#bc92ef",
                fontSize: 12,
                cursor: "pointer",
                padding: 6,
              }}
            >
              Older messages
            </button>
          ) : null}

          {browsingHistory ? (
            <button
              type="button"
              onClick={() => changeHistory(
                historyCursors.slice(0, -1)
              )}
              style={{
                background: "transparent",
                border: 0,
                color: "#bc92ef",
                fontSize: 12,
                cursor: "pointer",
                padding: 6,
              }}
            >
              Newer messages
            </button>
          ) : null}

          {browsingHistory && historyCursors.length > 2 ? (
            <button
              type="button"
              onClick={() => changeHistory([null])}
              style={{
                background: "transparent",
                border: 0,
                color: "#bc92ef",
                fontSize: 12,
                cursor: "pointer",
                padding: 6,
              }}
            >
              Latest
            </button>
          ) : null}
        </div>
      ) : null}

      <section
        aria-label="Group messages"
        className="parachat-messages"
        style={{
          ...messagesAreaStyle,
          flex: "1 1 0",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {loading ? <p>Loading messages...</p> : null}
        {error ? <p role="alert">{error}</p> : null}

        {!loading && available && !messages.length
          ? <p>Start the conversation.</p>
          : null}

        {available && messages.map((message, index) => {
          const own = message.sender_id === userId;

          const sender = members.find(
            (member) => member.user_id === message.sender_id
          );

          const senderName =
            sender?.full_name || sender?.username || "Member";

          const date = new Date(message.created_at);
          const previous = index > 0
            ? new Date(messages[index - 1].created_at)
            : null;

          const today = new Date();
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);

          const day = date.toDateString();

          const dateLabel =
            day === today.toDateString() ? "Today" :
            day === yesterday.toDateString() ? "Yesterday" :
            date.toLocaleDateString([], {
              month: "long",
              day: "numeric",
              year: "numeric",
            });

          if (message.message_type === "system") {
            return (
              <div key={message.id} style={{
                width: "100%",
                minWidth: 0,
                flexShrink: 0,
              }}>
                {!previous || previous.toDateString() !== day ? (
                  <div style={dateDividerStyle}>
                    <span>{dateLabel}</span>
                  </div>
                ) : null}

                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  padding: "12px 16px",
                  color: "#bc92ef",
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: 1.5,
                  textAlign: "center",
                  overflowWrap: "anywhere",
                }}>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    style={{ flexShrink: 0 }}
                  >
                    {message.system_event === "member_joined" ? (
                      <>
                        <circle cx="9" cy="7" r="4" />
                        <path d="M2 21v-2a7 7 0 0 1 14 0v2" />
                        <path d="M19 8v6M16 11h6" />
                      </>
                    ) : (
                      <>
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 11v5M12 7h.01" />
                      </>
                    )}
                  </svg>

                  <span>{message.body}</span>
                </div>
              </div>
            );
          }

          return (
            <div key={message.id} style={{
              width: "100%",
              minWidth: 0,
              flexShrink: 0,
            }}>
              {!previous || previous.toDateString() !== day ? (
                <div style={dateDividerStyle}>
                  <span>{dateLabel}</span>
                </div>
              ) : null}

              <div style={{
                ...messageRowStyle,
                justifyContent: own ? "flex-end" : "flex-start",
              }}>
                {!own ? (
                  <div style={smallAvatarStyle}>
                    {sender?.avatar_url ? (
                      <img
                        src={sender.avatar_url}
                        alt=""
                        style={smallAvatarImageStyle}
                      />
                    ) : (
                      <span>{senderName.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                ) : null}

                <div style={{
                  ...bubbleWrapStyle,
                  minWidth: 0,
                  alignItems: own ? "flex-end" : "flex-start",
                }}>
                  {!own ? (
                    <div style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#bc92ef",
                      padding: "0 4px",
                    }}>
                      {senderName}
                    </div>
                  ) : null}

                  <div style={{
                    ...(own ? myBubbleStyle : theirBubbleStyle),
                    maxWidth: "100%",
                    boxSizing: "border-box",
                    overflowWrap: "anywhere",
                  }}>
                    {message.reply_preview?.is_reply ? (
                      <div style={{
                        borderLeft: "3px solid #bc92ef",
                        background: "rgba(0,0,0,.15)",
                        padding: "6px 9px",
                        marginBottom: 7,
                        borderRadius: 4,
                        fontSize: 12,
                      }}>
                        <strong>Replying to</strong>
                        <div>
                          {message.reply_preview.original_message?.body
                            || "Original message unavailable"}
                        </div>
                      </div>
                    ) : null}

                    {message.message_type === "text"
                      ? message.body
                      : <GroupAttachment
                          conversationId={conversationId}
                          message={message}
                        />}
                  </div>

                  <GroupMessageActions
                    conversationId={conversationId}
                    message={message}
                    own={own}
                    canReply={!browsingHistory && available && !sending}
                    onReply={() => setReplyToId(message.id)}
                    onRefresh={() => refreshRef.current()}
                  />
                </div>
              </div>
            </div>
          );
        })}

        <div ref={bottom} />
      </section>

      {available && !browsingHistory ? (
        <div className="parachat-composer" style={{
          flexShrink: 0,
          padding: 12,
          background: "rgba(3,7,18,0.99)",
          borderTop: "1px solid rgba(255,255,255,.10)",
        }}>
          {replyToId ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "8px 12px",
              background: "#251f30",
              borderLeft: "3px solid #a779e5",
              borderRadius: 6,
              marginBottom: 6,
              fontSize: 12,
            }}>
              <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                <strong>Replying to message</strong>
                <div>
                  {replyTarget?.body.slice(0, 160)
                    || "Original message unavailable"}
                </div>
              </div>
              <button
                type="button"
                disabled={sending}
                aria-label="Cancel reply"
                onClick={() => setReplyToId(null)}
                style={{
                  background: "transparent",
                  color: "#fff",
                  border: 0,
                  cursor: "pointer",
                  fontSize: 20,
                }}
              >
                ×
              </button>
            </div>
          ) : null}
        <form
          className="parachat-composer-row"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          style={composerRowStyle}
        >
          <input
            ref={fileInput}
            type="file"
            accept={GROUP_MEDIA_ACCEPT}
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />

          {renderControls(
            () => fileInput.current?.click(),
            sending,
            true
          )}

          <MentionTextarea
            mentionContext={{
              surface: "parachat_group",
              containerId: conversationId,
            }}
            rows={1}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            aria-label="Message"
            placeholder="Message..."
            value={body}
            maxLength={4000}
            disabled={sending}
            onChange={(event) => setBody(event.target.value)}
            style={composerInputStyle}
          />

          <button
            type="submit"
            disabled={sending || !body.trim()}
            style={{
              ...sendButtonStyle,
              opacity: sending || !body.trim() ? 0.5 : 1,
              cursor: sending || !body.trim() ? "default" : "pointer",
            }}
          >
            {sending ? "..." : "Send"}
          </button>
        </form>
        </div>
      ) : null}

      {uploadStatus ? (
        <p role="status" style={{ fontSize: 12, color: "#bc92ef" }}>
          {uploadStatus}
        </p>
      ) : null}

      {sendError ? <p role="alert">{sendError}</p> : null}
    </div>
  );
}


function GroupAttachment({
  conversationId,
  message,
}: {
  conversationId: string;
  message: GroupChatMessage;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (loading) return;

    setLoading(true);
    setError("");
    setUrl("");

    try {
      const attachment = await getGroupChatAttachment(
        conversationId,
        message.id
      );

      setUrl(attachment.signed_url);
    } catch {
      setError("Attachment unavailable.");
    } finally {
      setLoading(false);
    }
  }

  function failed() {
    setUrl("");
    setError("Attachment unavailable or expired.");
  }

  const photo = message.message_type === "photo";

  return (
    <div style={{ maxWidth: 260 }}>
      {url ? (
        photo ? (
          <img
            src={url}
            alt="Group chat photo"
            onError={failed}
            referrerPolicy="no-referrer"
            style={{
              display: "block",
              maxWidth: "100%",
              maxHeight: 280,
              objectFit: "contain",
              borderRadius: 6,
            }}
          />
        ) : (
          <video
            src={url}
            controls
            playsInline
            preload="metadata"
            onError={failed}
            style={{
              display: "block",
              maxWidth: "100%",
              maxHeight: 280,
              borderRadius: 6,
            }}
          />
        )
      ) : null}

      <button
        type="button"
        disabled={loading}
        onClick={() => void load()}
        style={{
          background: "transparent",
          border: 0,
          padding: "4px 0",
          color: "#fff",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        {loading ? "Loading..." :
          url ? "Reload attachment" :
          photo ? "View photo" : "Play video"}
      </button>

      {error ? (
        <div role="alert" style={{ fontSize: 12 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}


function GroupSettings({
  details,
  photoPath,
  conversationId,
  userId,
  name,
  members,
  onRefresh,
  onClose,
}: {
  details: GroupChatDetails | null;
  photoPath: string | null;
  conversationId: string;
  userId: string;
  name: string;
  members: GroupChatMember[];
  onRefresh: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [newName, setNewName] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const busyRef = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [expandedSetting, setExpandedSetting] =
    useState<"notifications" | "permissions" | null>(null);
  const [memberMenu, setMemberMenu] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();

    const resetScroll = () => {
      dialog.querySelector<HTMLElement>(".pgs-body")
        ?.scrollTo({ top: 0 });
      dialog.querySelector<HTMLElement>(".pgs-header button")
        ?.focus({ preventScroll: true });
    };

    resetScroll();
    const frame = requestAnimationFrame(resetScroll);

    return () => {
      cancelAnimationFrame(frame);
      if (dialog.open) dialog.close();
    };
  }, []);

  async function saveInvitationMode(adminOnly: boolean) {
    if (busyRef.current || details?.role !== "admin") return;

    busyRef.current = true;
    setBusy(true);
    setError("");

    try {
      await setGroupChatInvitationMode(conversationId, adminOnly);
      setStatus("Invitation permissions updated.");
      onRefresh();
    } catch {
      setError("Unable to update invitation permissions.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const photoInput = useRef<HTMLInputElement>(null);

  async function changePhoto(file: File) {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError("");
    setStatus("");

    try {
      await uploadGroupChatPhoto(conversationId, file);
      setStatus("Group photo updated.");
      onRefresh();
    } catch (error) {
      setError(error instanceof Error
        ? error.message
        : "Unable to update group photo.");
    } finally {
      busyRef.current = false;
      setBusy(false);
      if (photoInput.current) photoInput.current.value = "";
    }
  }

  const admin = members.some(
    (member) =>
      member.user_id === userId &&
      member.role === "admin"
  );

  const [pendingMembers, setPendingMembers] =
    useState<GroupChatPendingMember[]>([]);

  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState("");
  const [pendingRefresh, setPendingRefresh] = useState(0);

  useEffect(() => {
    if (!admin) {
      setPendingMembers([]);
      setPendingLoading(false);
      return;
    }

    let active = true;
    let inFlight = false;

    async function loadPending() {
      if (!active || inFlight) return;

      inFlight = true;

      try {
        const rows =
          await getGroupChatPendingMembers(conversationId);

        if (active) {
          setPendingMembers(rows);
          setPendingError("");
        }
      } catch {
        if (active) {
          setPendingMembers([]);
          setPendingError("Unable to load pending invitations.");
        }
      } finally {
        inFlight = false;
        if (active) setPendingLoading(false);
      }
    }

    void loadPending();

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadPending();
      }
    }, 15000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [admin, conversationId, userId, pendingRefresh]);

  async function cancelPending(invitationId: string) {
    if (!admin || busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError("");
    setStatus("");

    try {
      await cancelGroupChatInvitation(
        conversationId,
        invitationId
      );

      setPendingMembers((previous) =>
        previous.filter(
          (item) => item.invitation_id !== invitationId
        )
      );

      setStatus("Invitation cancelled.");
      onRefresh();

    } catch {
      setError("Unable to cancel this invitation.");
    } finally {
      setPendingRefresh((previous) => previous + 1);
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function run(
    action: Parameters<typeof manageGroupChat>[1]
  ) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setStatus("");

    try {
      await manageGroupChat(conversationId, action);

      if (action.action === "leave") {
        router.replace("/messages");
        return;
      }

      setStatus("Group settings updated.");
      setMemberMenu(null);
      if (action.action === "rename") setEditingName(false);
      onRefresh();
    } catch {
      setError("Unable to complete this group action.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }


  function settingIcon(kind: string) {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        {kind === "edit" ? (
          <>
            <path d="m16 3 5 5-12 12-6 1 1-6Z" />
            <path d="m13 6 5 5" />
          </>
        ) : kind === "bell" ? (
          <>
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
            <path d="M10 21h4" />
          </>
        ) : kind === "shield" ? (
          <>
            <path d="m12 2 9 4v6c0 5-5 9-9 10-4-1-9-5-9-10V6Z" />
            <path d="m8 12 3 3 5-6" />
          </>
        ) : kind === "leave" ? (
          <>
            <path d="M10 3H4v18h6" />
            <path d="M9 12h12m-5-5 5 5-5 5" />
          </>
        ) : (
          <path d="m9 6 6 6-6 6" />
        )}
      </svg>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className="parachat-group-settings-dialog"
      aria-labelledby="parachat-group-settings-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busyRef.current) onClose();
      }}
    >
      <style>{`
        .parachat-group-settings-dialog {
          width: min(460px, calc(100% - 24px));
          width: min(460px, calc(100% - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
          max-height: calc(100vh - 32px);
          max-height: calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
          box-sizing: border-box;
          margin: auto;
          padding: 0;
          border: 1px solid rgba(168,85,247,.32);
          border-radius: 24px;
          background: linear-gradient(180deg, #171426, #10111b);
          color: #f9fafb;
          color-scheme: dark;
          box-shadow: 0 24px 90px rgba(0,0,0,.6);
          overflow: hidden;
          font-size: 14px;
        }

        .parachat-group-settings-dialog[open] {
          display: flex;
          flex-direction: column;
        }

        .parachat-group-settings-dialog::backdrop {
          background: rgba(3,7,18,.78);
          backdrop-filter: blur(7px);
          -webkit-backdrop-filter: blur(7px);
        }

        .pgs-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;
          border-bottom: 1px solid rgba(255,255,255,.09);
          flex-shrink: 0;
        }

        .pgs-body {
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          padding: 14px 18px 18px;
        }

        .pgs-identity {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 4px 0 16px;
          text-align: center;
          overflow-wrap: anywhere;
        }

        .pgs-muted {
          color: #a3a3b5;
          font-size: 12px;
        }

        .pgs-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-height: 52px;
          padding: 9px 0;
          border-bottom: 1px solid rgba(255,255,255,.08);
          box-sizing: border-box;
        }

        .pgs-button {
          min-height: 44px;
          padding: 8px 10px;
          border: 0;
          background: transparent;
          color: #c4a0f3;
          font-size: 13px;
          font-weight: 650;
          cursor: pointer;
          border-radius: 10px;
        }

        .pgs-button:disabled {
          opacity: .45;
          cursor: default;
        }

        .pgs-round {
          display: grid;
          place-items: center;
          width: 44px;
          min-width: 44px;
          height: 44px;
          padding: 0;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 50%;
          background: rgba(255,255,255,.055);
          color: #fff;
          cursor: pointer;
          font-size: 22px;
        }

        .pgs-field {
          width: 100%;
          min-width: 0;
          min-height: 44px;
          box-sizing: border-box;
          padding: 10px 12px;
          border: 1px solid #45375c;
          border-radius: 12px;
          color: #f9fafb;
          background: #15121e;
          font-size: 16px;
        }

        .pgs-member {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 58px;
        }

        .pgs-member-avatar {
          position: relative;
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: #493168;
          border: 1px solid #8055ad;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          overflow: hidden;
          font-weight: 750;
        }

        .pgs-member-avatar img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .pgs-danger {
          color: #f87171;
        }

        .parachat-group-settings-dialog {
          position: fixed;
          inset: 0;
          max-width: 460px;
        }

        .pgs-body {
          flex: 1 1 auto;
          min-height: 0;
          padding: 12px 18px 16px;
        }

        .pgs-identity {
          gap: 4px;
          padding: 8px 0 12px;
          border-bottom: 1px solid rgba(255,255,255,.10);
        }

        .pgs-identity .pgs-button {
          min-height: 36px;
          padding: 6px 10px;
        }

        .pgs-setting-trigger {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          min-height: 48px;
          padding: 8px 2px;
          border: 0;
          background: transparent;
          color: #f9fafb;
          text-align: left;
          cursor: pointer;
          font-size: 14px;
        }

        .pgs-setting-trigger > svg:first-child {
          color: #bc92ef;
        }

        .pgs-setting-trigger > svg:last-child {
          color: #9291a1;
          width: 16px;
        }

        .pgs-setting-label {
          flex: 1;
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .pgs-row {
          display: block;
          min-height: 0;
          padding: 0;
        }

        .pgs-setting-content {
          padding: 0 0 10px 32px;
        }

        .pgs-members-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 6px;
          min-height: 44px;
        }

        .pgs-add-picker {
          flex: 0 1 auto;
          min-width: 0;
          max-width: 100%;
        }

        .pgs-add-picker:has(input) {
          flex-basis: 100%;
        }

        .pgs-member {
          min-height: 56px;
        }

        .pgs-member-avatar {
          width: 38px;
          height: 38px;
        }

        .pgs-leave {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          margin-top: 10px;
          padding: 10px 2px;
          background: transparent;
          border: 0;
          color: #f87171;
          text-align: left;
          min-height: 44px;
          cursor: pointer;
          font-size: 14px;
        }

        @media (max-width: 480px) {
          .parachat-group-settings-dialog {
            border-radius: 20px;
          }

          .pgs-header {
            padding: 10px 14px;
          }

          .pgs-body {
            padding: 12px 14px 16px;
          }
        }
      `}</style>

      <header className="pgs-header">
        <h2
          id="parachat-group-settings-title"
          style={{ margin: 0, fontSize: 18, fontWeight: 800 }}
        >
          Group settings
        </h2>

        <button
          type="button"
          className="pgs-round"
          aria-label="Close group settings"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className="pgs-body">
        <div className="pgs-identity">
          <ParachatGroupAvatar
            key={photoPath || "default"}
            conversationId={conversationId}
            name={name}
            photoPath={photoPath}
            size={64}
          />

          <strong style={{ fontSize: 20 }}>{name}</strong>

          <span className="pgs-muted">
            {members.length} visible members
          </span>

          {admin ? (
            <>
              <input
                ref={photoInput}
                type="file"
                accept={GROUP_PHOTO_ACCEPT}
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void changePhoto(file);
                }}
              />

              <button
                type="button"
                className="pgs-button"
                disabled={busy}
                onClick={() => photoInput.current?.click()}
              >
                Change group photo
              </button>
            </>
          ) : null}
        </div>


        {admin ? (
          <div className="pgs-row">
            <button
              type="button"
              className="pgs-setting-trigger"
              disabled={busy}
              aria-expanded={editingName}
              onClick={() => {
                setNewName(name);
                setEditingName(!editingName);
                setExpandedSetting(null);
              }}
            >
              {settingIcon("edit")}
              <span className="pgs-setting-label">
                Edit group name
              </span>
              {settingIcon("chevron")}
            </button>

            {editingName ? (
              <div className="pgs-setting-content">
                <input
                  className="pgs-field"
                  aria-label="Group name"
                  value={newName}
                  maxLength={100}
                  disabled={busy}
                  onChange={(event) =>
                    setNewName(event.target.value)
                  }
                />

                <button
                  type="button"
                  className="pgs-button"
                  disabled={
                    busy ||
                    !newName.trim() ||
                    newName.trim() === name
                  }
                  onClick={() => void run({
                    action: "rename",
                    name: newName,
                  })}
                >
                  Save
                </button>

                <button
                  type="button"
                  className="pgs-button"
                  disabled={busy}
                  onClick={() => setEditingName(false)}
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="pgs-row">
          <button
            type="button"
            className="pgs-setting-trigger"
            disabled={busy}
            aria-expanded={expandedSetting === "notifications"}
            onClick={() => {
              setEditingName(false);
              setExpandedSetting(
                expandedSetting === "notifications"
                  ? null : "notifications"
              );
            }}
          >
            {settingIcon("bell")}
            <span className="pgs-setting-label">
              Mute notifications
            </span>
            {settingIcon("chevron")}
          </button>

          {expandedSetting === "notifications" ? (
            <div className="pgs-setting-content">
              <button
                type="button"
                className="pgs-button"
                disabled={busy}
                onClick={() => void run({
                  action: "mute",
                  mutedUntil: new Date(
                    Date.now() + 8 * 60 * 60 * 1000
                  ).toISOString(),
                })}
              >
                Mute for 8 hours
              </button>

              <button
                type="button"
                className="pgs-button"
                disabled={busy}
                onClick={() => void run({
                  action: "unmute",
                })}
              >
                Unmute
              </button>
            </div>
          ) : null}
        </div>

        {details?.role === "admin" ? (
          <div className="pgs-row">
            <button
              type="button"
              className="pgs-setting-trigger"
              disabled={busy}
              aria-expanded={expandedSetting === "permissions"}
              onClick={() => {
                setEditingName(false);
                setExpandedSetting(
                  expandedSetting === "permissions"
                    ? null : "permissions"
                );
              }}
            >
              {settingIcon("shield")}

              <span className="pgs-setting-label">
                Who can invite members?
                <span
                  className="pgs-muted"
                  style={{ display: "block", marginTop: 3 }}
                >
                  {details.admin_only
                    ? "Administrators only"
                    : "All members"}
                </span>
              </span>

              {settingIcon("chevron")}
            </button>

            {expandedSetting === "permissions" ? (
              <div className="pgs-setting-content">
                <button
                  type="button"
                  className="pgs-button"
                  disabled={busy}
                  aria-pressed={!details.admin_only}
                  onClick={() => void saveInvitationMode(false)}
                >
                  {!details.admin_only ? "✓ " : ""}
                  All members
                </button>

                <button
                  type="button"
                  className="pgs-button"
                  disabled={busy}
                  aria-pressed={details.admin_only}
                  onClick={() => void saveInvitationMode(true)}
                >
                  {details.admin_only ? "✓ " : ""}
                  Administrators only
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ paddingTop: 8 }}>
          <div className="pgs-members-heading">
            <strong style={{ fontSize: 14 }}>
              Members ({members.length})
            </strong>

            {details?.can_add_members &&
              details.member_count < 50 ? (
              <div className="pgs-add-picker">
                <ParachatGroupCreate
                  conversationId={conversationId}
                  existingMemberIds={[
                    ...members.map((member) => member.user_id),
                    ...pendingMembers.map(
                      (item) => item.invited_user_id
                    ),
                  ]}
                  onAdded={() => {
                    setPendingRefresh((previous) => previous + 1);
                    onRefresh();
                  }}
                  disabled={busy}
                />
              </div>
            ) : null}
          </div>

          {details?.member_count === 50 ? (
            <p className="pgs-muted">50-member limit reached.</p>
          ) : !details?.can_add_members && details?.admin_only ? (
            <p className="pgs-muted">
              Only administrators can invite members.
            </p>
          ) : null}

          {members.map((member) => {
            const displayName =
              member.full_name || member.username || "Member";

            const canManage =
              admin &&
              member.role === "member" &&
              member.user_id !== userId;

            const menuOpen = memberMenu === member.user_id;

            return (
              <div
                key={member.user_id}
                style={{
                  borderBottom: "1px solid rgba(255,255,255,.08)",
                }}
              >
                <div className="pgs-member">
                  <span className="pgs-member-avatar">
                    {displayName.charAt(0).toUpperCase()}

                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    ) : null}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 650,
                      overflowWrap: "anywhere",
                    }}>
                      {displayName}
                      {member.user_id === userId ? " (You)" : ""}
                    </div>

                    <div className="pgs-muted">
                      {member.role === "admin" ? "Admin" : "Member"}
                    </div>
                  </div>

                  {canManage ? (
                    <button
                      type="button"
                      className="pgs-round"
                      aria-label={"Manage " + displayName}
                      aria-expanded={menuOpen}
                      disabled={busy}
                      onClick={() => setMemberMenu(
                        menuOpen ? null : member.user_id
                      )}
                    >
                      ⋯
                    </button>
                  ) : null}
                </div>

                {canManage && menuOpen ? (
                  <div style={{
                    display: "grid",
                    background: "#211a30",
                    borderRadius: 12,
                    marginBottom: 8,
                    padding: 4,
                  }}>
                    <button
                      type="button"
                      className="pgs-button"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm("Make this member an admin?")) {
                          void run({
                            action: "promote",
                            targetUserId: member.user_id,
                          });
                        }
                      }}
                    >
                      Make admin
                    </button>

                    <button
                      type="button"
                      className="pgs-button pgs-danger"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm("Remove this member?")) {
                          void run({
                            action: "remove",
                            targetUserId: member.user_id,
                          });
                        }
                      }}
                    >
                      Remove member
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {admin ? (
          <div style={{ paddingTop: 12, paddingBottom: 12 }}>
            <div className="pgs-members-heading">
              <strong style={{ fontSize: 14 }}>
                Pending Invitations ({pendingMembers.length})
              </strong>
            </div>

            {pendingLoading ? (
              <p className="pgs-muted">
                Loading invitations...
              </p>
            ) : pendingError ? (
              <div role="alert" style={{ color: "#fca5a5" }}>
                {pendingError}
                <button
                  type="button"
                  className="pgs-button"
                  onClick={() => {
                    setPendingLoading(true);
                    setPendingRefresh((previous) => previous + 1);
                  }}
                >
                  Retry
                </button>
              </div>
            ) : pendingMembers.length === 0 ? (
              <p className="pgs-muted">
                No pending invitations.
              </p>
            ) : (
              pendingMembers.map((item) => (
                <div
                  key={item.invitation_id}
                  className="pgs-member"
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,.08)",
                  }}
                >
                  <span className="pgs-member-avatar">
                    {item.invited_user_name.charAt(0).toUpperCase()}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 650,
                      overflowWrap: "anywhere",
                    }}>
                      {item.invited_user_name}
                    </div>

                    <div style={{
                      color: "#bc92ef",
                      fontSize: 12,
                    }}>
                      {item.available
                        ? "Invitation pending"
                        : "Invitation unavailable"}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="pgs-button pgs-danger"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Cancel this invitation?")) {
                        void cancelPending(item.invitation_id);
                      }
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ))
            )}
          </div>
        ) : null}

        <button
          type="button"
          className="pgs-leave"
          disabled={busy}
          onClick={() => {
            if (window.confirm("Leave this group chat?")) {
              void run({ action: "leave" });
            }
          }}
        >
          {settingIcon("leave")}
          Leave group
        </button>

        {busy ? <p role="status">Updating...</p> : null}
        {status ? (
          <p role="status" style={{ color: "#c4b5fd" }}>
            {status}
          </p>
        ) : null}
        {error ? (
          <p role="alert" style={{ color: "#fca5a5" }}>
            {error}
          </p>
        ) : null}
      </div>
    </dialog>
  );
}

const groupReactionIcons: Record<GroupChatReaction, string> = {
  like: "👍",
  love: "❤️",
  laugh: "😂",
  wow: "😮",
  sad: "😢",
  angry: "😠",
};

function GroupMessageActions({
  conversationId,
  message,
  own,
  canReply,
  onReply,
  onRefresh,
}: {
  conversationId: string;
  message: GroupChatMessage;
  own: boolean;
  canReply: boolean;
  onReply: () => void;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [operation, setOperation] =
    useState<"edit" | "delete" | "share" | null>(null);
  const [editBody, setEditBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const canModify =
    own &&
    Boolean(message.sender_id) &&
    message.message_type !== "system" &&
    !message.system_event;

  const canEdit =
    canModify && message.message_type === "text";

  const [shareRecipients, setShareRecipients] =
    useState<GroupShareRecipient[]>([]);
  const [shareSearch, setShareSearch] = useState("");
  const [shareStatus, setShareStatus] = useState("");

  const canShare =
    (
      message.message_type === "text" ||
      message.message_type === "photo"
    ) &&
    Boolean(message.sender_id) &&
    !message.system_event;

  async function openShare() {
    if (!canShare || busy) return;

    setOperation("share");
    setShareRecipients([]);
    setShareSearch("");
    setShareStatus("");
    setActionError("");
    setBusy(true);

    try {
      const recipients = await getGroupShareRecipients(
        conversationId,
        message.id
      );
      setShareRecipients(recipients);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to load recipients."
      );
    } finally {
      setBusy(false);
    }
  }

  async function shareToRecipient(
    recipient: GroupShareRecipient
  ) {
    if (!canShare || busy) return;

    setBusy(true);
    setActionError("");

    try {
      if (message.message_type === "photo") {
        await shareGroupPhotoToDirect(
          conversationId,
          message.id,
          recipient.destination_id
        );
      } else {
        await shareGroupTextToDirect(
          conversationId,
          message.id,
          recipient.destination_id
        );
      }

      setShareStatus(
        (message.message_type === "photo"
          ? "Photograph shared with "
          : "Message shared with ") +
        recipient.full_name
      );
      setOperation(null);
      setOpen(false);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to share this message."
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!canEdit || busy || !editBody.trim()) return;

    setBusy(true);
    setActionError("");

    try {
      await editGroupChatMessage(
        conversationId,
        message.id,
        editBody
      );
      setOperation(null);
      setOpen(false);
      onRefresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to edit message."
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!canModify || busy) return;

    setBusy(true);
    setActionError("");

    try {
      await deleteGroupChatMessage(
        conversationId,
        message.id
      );
      setOperation(null);
      setOpen(false);
      onRefresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to delete message."
      );
    } finally {
      setBusy(false);
    }
  }

  const [mobile, setMobile] = useState(false);
  const [anchor, setAnchor] = useState({
    top: 80,
    left: 16,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const actionStyle = mobile
    ? messageOptionButtonStyle
    : messageDesktopOptionButtonStyle;

  function showMenu() {
    if (busy || message.message_type === "system" ||
        message.system_event) return;

    setOperation(null);
    setActionError("");
    const rect =
      triggerRef.current?.getBoundingClientRect();

    if (!rect) return;

    setMobile(window.innerWidth <= 980);

    setAnchor({
      top: rect.bottom + 8,
      left: Math.max(
        12,
        Math.min(
          rect.right - 224,
          window.innerWidth - 236
        )
      ),
    });

    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    function close(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function resize() {
      setOpen(false);
    }

    document.addEventListener("keydown", close);
    window.addEventListener("resize", resize);

    return () => {
      document.removeEventListener("keydown", close);
      window.removeEventListener("resize", resize);
    };
  }, [open]);

  useEffect(() => {
    if (!open || mobile || !menuRef.current) return;

    const menu = menuRef.current;

    const observer = new ResizeObserver(() => {
      const rect =
        triggerRef.current?.getBoundingClientRect();

      if (!rect) return;

      const height = menu.offsetHeight;
      const below = rect.bottom + 8;

      setAnchor({
        top: below + height <= window.innerHeight - 12
          ? below
          : Math.max(12, rect.top - height - 8),
        left: Math.max(
          12,
          Math.min(
            rect.right - menu.offsetWidth,
            window.innerWidth - menu.offsetWidth - 12
          )
        ),
      });
    });

    observer.observe(menu);

    return () => observer.disconnect();
  }, [open, mobile]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: own ? "flex-end" : "flex-start",
        maxWidth: "100%",
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <div style={messageMetaRowStyle}>
        <span style={messageTimeStyle}>
          {new Date(message.created_at).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
          {message.edited_at ? " · Edited" : ""}
        </span>

        <button
          type="button"
          ref={triggerRef}
          style={messageOptionsButtonStyle}
          aria-label="Message options"
          aria-expanded={open}
          onClick={() => open ? setOpen(false) : showMenu()}
        >
          ⋯
        </button>
      </div>

      {shareStatus ? (
        <span role="status" style={{
          color: "#bc92ef",
          fontSize: 12,
          padding: "4px 0",
        }}>
          {shareStatus}
        </span>
      ) : null}

      {open ? createPortal(
        <>
          <button
            type="button"
            aria-label="Close message options"
            onClick={() => setOpen(false)}
            style={mobile
              ? messageOptionsOverlayBackdropStyle
              : messageOptionsDesktopBackdropStyle}
          />

          <div
            ref={menuRef}
            role={mobile || operation ? "dialog" : "menu"}
            aria-modal={mobile ? true : undefined}
            aria-label="Message options"
            style={mobile
              ? messageOptionsActionSheetStyle
              : {
                  ...messageOptionsDesktopPopoverStyle,
                  top: anchor.top,
                  left: anchor.left,
                }}
          >
            {mobile ? (
              <div style={mobileMessageOptionsHeaderStyle}>
                <span style={mobileMessageOptionsHandleStyle} />
                <span style={mobileMessageOptionsTitleStyle}>
                  Message options
                </span>
              </div>
            ) : null}
          {operation === "share" ? (
            <div style={{
              display: "grid",
              gap: 10,
              padding: 10,
            }}>
              <strong>Share to Parachat</strong>

              <span style={{
                fontSize: 13,
                color: "#cbd5e1",
              }}>
                Choose an authorized friend to forward
                this {message.message_type === "photo"
                  ? "photograph"
                  : "message"}.
              </span>

              <input
                aria-label="Search recipients"
                placeholder="Search friends..."
                value={shareSearch}
                disabled={busy}
                onChange={(event) =>
                  setShareSearch(event.target.value)
                }
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,.15)",
                  background: "#111827",
                  color: "#fff",
                }}
              />

              <div style={{
                display: "grid",
                gap: 6,
                maxHeight: 260,
                overflowY: "auto",
              }}>
                {busy ? (
                  <span role="status">Please wait...</span>
                ) : shareRecipients.length === 0 ? (
                  <span style={{
                    fontSize: 13,
                    color: "#9ca3af",
                  }}>
                    No eligible Parachat recipients.
                  </span>
                ) : shareRecipients.filter((recipient) =>
                  (
                    recipient.full_name + " " +
                    (recipient.username || "")
                  ).toLowerCase().includes(
                    shareSearch.trim().toLowerCase()
                  )
                ).map((recipient) => (
                  <button
                    key={recipient.user_id}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void shareToRecipient(recipient)
                    }
                    style={{
                      ...actionStyle,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      textAlign: "left",
                    }}
                  >
                    {recipient.avatar_url ? (
                      <img
                        src={recipient.avatar_url}
                        alt=""
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: "50%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <span style={{
                        width: 34,
                        height: 34,
                        borderRadius: "50%",
                        background: "#7c3aed",
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}>
                        {recipient.full_name
                          .charAt(0).toUpperCase()}
                      </span>
                    )}

                    <span>{recipient.full_name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : operation === "edit" ? (
            <div style={{
              display: "grid",
              gap: 10,
              padding: 10,
            }}>
              <strong>Edit Message</strong>

              <textarea
                aria-label="Edit message"
                value={editBody}
                maxLength={4000}
                rows={4}
                disabled={busy}
                onChange={(event) =>
                  setEditBody(event.target.value)
                }
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,.15)",
                  background: "#111827",
                  color: "#ffffff",
                  fontSize: 14,
                  resize: "vertical",
                }}
              />

              <button
                type="button"
                style={actionStyle}
                disabled={busy || !editBody.trim()}
                onClick={() => void saveEdit()}
              >
                {busy ? "Saving..." : "Save Changes"}
              </button>
            </div>
          ) : operation === "delete" ? (
            <div style={{
              display: "grid",
              gap: 10,
              padding: 10,
            }}>
              <strong>Delete Message?</strong>

              <span style={{
                fontSize: 13,
                color: "#cbd5e1",
              }}>
                This message will be removed from the
                group conversation. This cannot be undone.
              </span>

              <button
                type="button"
                disabled={busy}
                style={{
                  ...actionStyle,
                  color: "#fca5a5",
                }}
                onClick={() => void confirmDelete()}
              >
                {busy ? "Deleting..." : "Delete Message"}
              </button>
            </div>
          ) : (
            <>
          {canReply ? (
            <button
              type="button"
              style={actionStyle}
              onClick={() => {
                onReply();
                setOpen(false);
              }}
            >
              Reply
            </button>
          ) : null}

          <GroupMessageReactions
            conversationId={conversationId}
            message={message}
            onRefresh={onRefresh}
          />

          {canShare ? (
            <button
              type="button"
              style={actionStyle}
              onClick={() => void openShare()}
            >
              Share to Parachat
            </button>
          ) : null}

          {canEdit ? (
            <button
              type="button"
              style={actionStyle}
              onClick={() => {
                setEditBody(message.body);
                setActionError("");
                setOperation("edit");
              }}
            >
              Edit Message
            </button>
          ) : null}

          {canModify ? (
            <button
              type="button"
              style={{
                ...actionStyle,
                color: "#fca5a5",
              }}
              onClick={() => {
                setActionError("");
                setOperation("delete");
              }}
            >
              Delete Message
            </button>
          ) : null}

          {!own && message.sender_id ? (
            <GroupMessageReport
              conversationId={conversationId}
              messageId={message.id}
            />
          ) : null}
            </>
          )}

          {actionError ? (
            <div role="alert" style={{
              padding: 10,
              fontSize: 12,
              color: "#fca5a5",
            }}>
              {actionError}
            </div>
          ) : null}

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOperation(null);
                setActionError("");
                setOpen(false);
              }}
              style={mobile
                ? messageCancelOptionButtonStyle
                : messageDesktopCancelOptionButtonStyle}
            >
              Cancel
            </button>
          </div>
        </>,
        document.body
      ) : (
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
        }}>
          {GROUP_CHAT_REACTIONS.filter(
            (reaction) => (message.reactions?.counts[reaction] || 0) > 0
          ).map((reaction) => (
            <button
              key={reaction}
              type="button"
              aria-label={reaction + " reactions"}
              onClick={showMenu}
              style={{
                border: "1px solid rgba(255,255,255,.12)",
                background: "rgba(255,255,255,.06)",
                color: "#fff",
                borderRadius: 12,
                padding: "3px 7px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {groupReactionIcons[reaction]} {message.reactions?.counts[reaction]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupMessageReactions({
  conversationId,
  message,
  onRefresh,
}: {
  conversationId: string;
  message: GroupChatMessage;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  const summary = message.reactions;

  async function react(reaction: GroupChatReaction) {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError("");

    try {
      await setGroupChatReaction(
        conversationId,
        message.id,
        summary?.mine === reaction ? null : reaction
      );

      setOpen(false);
      onRefresh();
    } catch {
      setError("Unable to update reaction.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 5 }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 4,
      }}>
        <button
          type="button"
          aria-label="React to message"
          aria-expanded={open}
          disabled={busy}
          onClick={() => setOpen(!open)}
          style={{
            ...messageDesktopOptionButtonStyle,
            width: "100%",
          }}
        >
          React
        </button>

        {GROUP_CHAT_REACTIONS.filter(
          (reaction) => (summary?.counts[reaction] || 0) > 0
        ).map((reaction) => (
          <button
            key={reaction}
            type="button"
            disabled={busy}
            aria-pressed={summary?.mine === reaction}
            aria-label={reaction + " reaction"}
            onClick={() => void react(reaction)}
            style={{
              background: summary?.mine === reaction
                ? "#65478e"
                : "rgba(0,0,0,.18)",
              color: "#fff",
              border: summary?.mine === reaction
                ? "1px solid #bc92ef"
                : "1px solid transparent",
              borderRadius: 12,
              padding: "3px 7px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {groupReactionIcons[reaction]} {summary?.counts[reaction]}
          </button>
        ))}
      </div>

      {open ? (
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          background: "#251f30",
          padding: 6,
          borderRadius: 8,
          marginTop: 5,
        }}>
          {GROUP_CHAT_REACTIONS.map((reaction) => (
            <button
              key={reaction}
              type="button"
              title={reaction}
              aria-label={reaction}
              aria-pressed={summary?.mine === reaction}
              disabled={busy}
              onClick={() => void react(reaction)}
              style={{
                background: summary?.mine === reaction
                  ? "#65478e"
                  : "transparent",
                border: 0,
                borderRadius: 6,
                padding: 5,
                cursor: "pointer",
                fontSize: 20,
              }}
            >
              {groupReactionIcons[reaction]}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <small style={{ color: "#ffaaaa" }}>{error}</small>
      ) : null}
    </div>
  );
}


function GroupMessageReport({
  conversationId,
  messageId,
}: {
  conversationId: string;
  messageId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  async function submitReport() {
    if (busyRef.current || reported) return;

    const reason = window.prompt(
      "Report this message to Parapost moderation. " +
      "The reported message and your reason will be " +
      "shared with authorized moderation staff.",
      ""
    );

    if (!reason?.trim()) return;

    if (Array.from(reason.trim()).length > 160) {
      setError("Please use 160 characters or fewer.");
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setError("");

    try {
      await reportGroupChatMessage(
        conversationId,
        messageId,
        reason
      );

      setReported(true);
    } catch {
      setError("Unable to submit report.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 2 }}>
      <button
        type="button"
        disabled={busy || reported}
        onClick={() => void submitReport()}
        style={{
          background: "transparent",
          border: 0,
          color: reported ? "#b5dfbc" : "#d0c2df",
          fontSize: 11,
          padding: "3px 5px",
          cursor: reported ? "default" : "pointer",
        }}
      >
        {reported
          ? "Reported"
          : busy
            ? "Reporting..."
            : "Report"}
      </button>

      {error ? (
        <small style={{ color: "#ffaaaa" }}>
          {error}
        </small>
      ) : null}
    </div>
  );
}


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

const messagesAreaStyle: React.CSSProperties = {
  minHeight: 0,
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "contain",
  padding: "18px",
};


export function AuthenticatedGroupConversation({
  conversationId,
  renderControls,
}: {
  conversationId: string;
  renderControls: GroupComposerControls;
}) {

  const [userId, setUserId] =
    useState<string | null>(null);

  useEffect(() => {
    if (!groupChatEnabled()) return;

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, session) => {
        setUserId(
          session?.user && !session.user.is_anonymous
            ? session.user.id
            : null
        );
      });

    return () => subscription.unsubscribe();
  }, []);

  if (!groupChatEnabled() || !userId) {
    return (
      <div style={{ padding: 16 }}>
        <Link href="/messages">Back to Parachat</Link>
        <p>Group conversation unavailable.</p>
      </div>
    );
  }

  return (
    <GroupConversation
      key={`${userId}:${conversationId}`}
      userId={userId}
      conversationId={conversationId}
      renderControls={renderControls}
    />
  );
}


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

const messageMetaRowStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "4px",
  minHeight: "20px",
  padding: "0 2px",
};

const messageOptionsButtonStyle: React.CSSProperties = {
  width: "22px",
  height: "20px",
  border: "1px solid transparent",
  borderRadius: "999px",
  background: "transparent",
  color: "#9ca3af",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 950,
  cursor: "pointer",
  lineHeight: 1,
  padding: 0,
};

const messageOptionsMenuStyle: React.CSSProperties = {
  position: "absolute",
  right: 0,
  bottom: "24px",
  zIndex: 55,
  minWidth: "168px",
  borderRadius: "13px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(7,10,16,0.98)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.44)",
  padding: "6px",
  backdropFilter: "blur(16px)",
};

const composerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  width: "100%",
  minWidth: 0,
};

const composerInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  boxSizing: "border-box",
  minHeight: "44px",
  maxHeight: "130px",
  resize: "none",
  overflowY: "hidden",
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
  flexShrink: 0,
  minHeight: "44px",
  borderRadius: "999px",
  border: "1px solid rgba(168,85,247,0.55)",
  background: "linear-gradient(135deg, #a855f7, #7c3aed)",
  color: "#ffffff",
  padding: "0 18px",
  fontWeight: 950,
};


const messageOptionsOverlayBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2147483000,
  border: "none",
  background: "rgba(0,0,0,0.32)",
  padding: 0,
  cursor: "pointer",
};


const messageOptionsDesktopBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2147483000,
  border: "none",
  background: "transparent",
  padding: 0,
  cursor: "default",
};


const messageOptionsActionSheetStyle: React.CSSProperties = {
  position: "fixed",
  left: "max(12px, env(safe-area-inset-left))",
  right: "max(12px, env(safe-area-inset-right))",
  bottom: "calc(12px + env(safe-area-inset-bottom))",
  zIndex: 2147483001,
  borderRadius: "24px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(7,10,16,0.99))",
  boxShadow: "0 -18px 44px rgba(0,0,0,0.52)",
  padding: "8px",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
};


const messageOptionsDesktopPopoverStyle: React.CSSProperties = {
  position: "fixed",
  zIndex: 2147483001,
  width: "210px",
  borderRadius: "16px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(7,10,16,0.99))",
  boxShadow: "0 18px 44px rgba(0,0,0,0.50), 0 0 24px rgba(168,85,247,0.12)",
  padding: "7px",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
};


const mobileMessageOptionsHeaderStyle: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  gap: "8px",
  padding: "8px 10px 10px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  marginBottom: "8px",
};


const mobileMessageOptionsHandleStyle: React.CSSProperties = {
  width: "42px",
  height: "4px",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.25)",
};


const mobileMessageOptionsTitleStyle: React.CSSProperties = {
  color: "#f9fafb",
  fontSize: "13px",
  fontWeight: 950,
  letterSpacing: "-0.01em",
};


const messageOptionButtonStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.055)",
  color: "#f3e8ff",
  borderRadius: "10px",
  padding: "7px 9px",
  textAlign: "left",
  fontWeight: 900,
  fontSize: "11px",
  cursor: "pointer",
  marginBottom: "5px",
};


const messageDesktopOptionButtonStyle: React.CSSProperties = {
  ...messageOptionButtonStyle,
  borderRadius: "11px",
  padding: "10px 11px",
  fontSize: "12px",
  marginBottom: "6px",
  background: "rgba(255,255,255,0.045)",
};


const messageCancelOptionButtonStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.035)",
  color: "#e5e7eb",
  borderRadius: "10px",
  padding: "8px 9px",
  textAlign: "center",
  fontWeight: 950,
  fontSize: "11px",
  cursor: "pointer",
};


const messageDesktopCancelOptionButtonStyle: React.CSSProperties = {
  ...messageDesktopOptionButtonStyle,
  marginBottom: 0,
  textAlign: "center",
  color: "#d1d5db",
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


const headerLeftStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  minWidth: 0,
};


const headerActionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "8px",
  flexShrink: 0,
  flexWrap: "wrap",
};


const mobileBackButtonStyle: React.CSSProperties = {
  display: "none",
  width: "44px",
  height: "44px",
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


const closeChatButtonStyle: React.CSSProperties = {
  width: "44px",
  height: "44px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.075)",
  color: "#ffffff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "22px",
  lineHeight: 1,
  fontWeight: 950,
  cursor: "pointer",
  flexShrink: 0,
};

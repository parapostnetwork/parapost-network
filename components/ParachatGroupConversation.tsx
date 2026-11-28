"use client";

import { useEffect, useRef, useState } from "react";
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

export default function GroupConversation({
  userId,
  conversationId,
}: {
  userId: string;
  conversationId: string;
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
        justifyContent: "flex-start",
        flexShrink: 0,
        minHeight: 72,
      }}>
        <Link
          href="/messages"
          aria-label="Back to Parachat"
          style={{ color: "#bc92ef", fontSize: 22 }}
        >
          ←
        </Link>

        {available ? (
          <ParachatGroupAvatar
            key={photoPath || "default"}
            conversationId={conversationId}
            name={name}
            photoPath={photoPath}
            size={50}
          />
        ) : null}

        <div style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 16 }}>
            {name}
          </strong>

          <div style={{
            fontSize: 12,
            color: "#9ca3af",
          }}>
            {members.length} visible members
          </div>
        </div>
        {available ? (
          <button
            type="button"
            aria-label="Group settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: 0,
              color: "#bc92ef",
              fontSize: 22,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            ⋯
          </button>
        ) : null}
      </header>

      {available && settingsOpen ? (
        <div style={{
          maxHeight: "45%",
          overflowY: "auto",
          padding: 12,
        }}>
        <GroupSettings details={details}
          conversationId={conversationId}
          userId={userId}
          name={name}
          members={members}
          onRefresh={() => refreshRef.current()}
          onClose={() => setSettingsOpen(false)}
        />
        </div>
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

        {available && messages.map((message) => {
          const own = message.sender_id === userId;

          const sender = members.find(
            (member) =>
              member.user_id === message.sender_id
          );

          return (
            <div
              key={message.id}
              style={{
                alignSelf: own ? "flex-end" : "flex-start",
                maxWidth: "82%",
              }}
            >
              {!own ? (
                <div style={{
                  fontSize: 11,
                  color: "#bca2df",
                  marginBottom: 3,
                }}>
                  {sender?.full_name || "Member"}
                </div>
              ) : null}

              <div style={{
                background: own ? "#65478e" : "#251f30",
                padding: "9px 12px",
                borderRadius: 12,
                fontSize: 14,
                whiteSpace: "pre-wrap",
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
                  overflowWrap: "anywhere",
                }}>
                  <strong>Replying to</strong>
                  <div>
                    {message.reply_preview.original_message?.body
                      || "Original message unavailable"}
                  </div>
                </div>
              ) : null}

              {!browsingHistory && available ? (
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => setReplyToId(message.id)}
                  style={{
                    background: "transparent",
                    border: 0,
                    color: "#e1ccff",
                    fontSize: 11,
                    cursor: "pointer",
                    padding: "3px 0",
                    display: "block",
                  }}
                >
                  Reply
                </button>
              ) : null}

{message.message_type === "text"
                  ? message.body
                  : <GroupAttachment
                      conversationId={conversationId}
                      message={message}
                    />}

              <GroupMessageReactions
                conversationId={conversationId}
                message={message}
                onRefresh={() => refreshRef.current()}
              />

              {message.sender_id &&
               message.sender_id !== userId ? (
                <GroupMessageReport
                  conversationId={conversationId}
                  messageId={message.id}
                />
              ) : null}


              </div>

              <div style={{
                fontSize: 10,
                color: "#9ca3af",
                marginTop: 3,
                textAlign: own ? "right" : "left",
              }}>
                {new Date(message.created_at)
                  .toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
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
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderTop: "1px solid rgba(255,255,255,.12)",
            paddingTop: 10,
          }}
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

          <button
            type="button"
            aria-label="Attach photo or video"
            title="Attach photo or video"
            disabled={sending}
            onClick={() => fileInput.current?.click()}
            style={{
              background: "transparent",
              border: 0,
              color: "#bc92ef",
              padding: 6,
              cursor: "pointer",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 11.5l-8.5 8.5a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.8-2.8l8.5-8.5"/>
            </svg>
          </button>

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
            placeholder="Write a message..."
            value={body}
            maxLength={4000}
            disabled={sending}
            onChange={(event) => setBody(event.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              background: "#251f30",
              color: "#fff",
              border: "1px solid #41364f",
              borderRadius: 8,
              padding: 10,
              fontSize: 16,
            }}
          />

          <button
            type="submit"
            disabled={sending || !body.trim()}
            style={{
              background: "#65478e",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              padding: "10px 14px",
              fontWeight: 700,
              opacity: sending || !body.trim() ? 0.5 : 1,
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
  conversationId,
  userId,
  name,
  members,
  onRefresh,
  onClose,
}: {
  details: GroupChatDetails | null;
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
      onRefresh();
    } catch {
      setError("Unable to complete this group action.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const actionStyle = {
    background: "transparent",
    border: 0,
    color: "#bc92ef",
    fontSize: 13,
    padding: "8px 4px",
    cursor: "pointer",
  };

  return (
    <section style={{
      padding: 12,
      background: "#211b2b",
      borderBottom: "1px solid #41364f",
      fontSize: 13,
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <strong>Group settings</strong>
        <button
          type="button"
          style={actionStyle}
          onClick={onClose}
          disabled={busy}
        >
          Close
        </button>
      </div>

      {admin ? (
        <div>
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
            style={actionStyle}
            disabled={busy}
            onClick={() => photoInput.current?.click()}
          >
            Change Group Photo
          </button>
        </div>
      ) : null}

      {admin ? (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            aria-label="Group name"
            value={newName}
            maxLength={100}
            disabled={busy}
            onChange={(event) => setNewName(event.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              background: "#15121c",
              border: "1px solid #41364f",
              color: "#fff",
              padding: 8,
              borderRadius: 6,
              fontSize: 16,
            }}
          />
          <button
            type="button"
            style={actionStyle}
            disabled={busy || !newName.trim() || newName.trim() === name}
            onClick={() => void run({
              action: "rename",
              name: newName,
            })}
          >
            Save name
          </button>
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <button
          type="button"
          style={actionStyle}
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
          style={actionStyle}
          disabled={busy}
          onClick={() => void run({ action: "unmute" })}
        >
          Unmute
        </button>
      </div>


      {details?.role === "admin" ? (
        <label style={{ display: "grid", gap: 6 }}>
          <strong>Who can add members?</strong>
          <select
            value={details.admin_only ? "admin" : "all"}
            disabled={busy}
            onChange={(event) => {
              void saveInvitationMode(event.target.value === "admin");
            }}
            style={{
              background: "#251f30",
              color: "#fff",
              border: "1px solid #65478e",
              borderRadius: 8,
              padding: "9px 12px",
              width: "100%",
            }}
          >
            <option value="all">All members</option>
            <option value="admin">Administrators only</option>
          </select>
        </label>
      ) : null}

      {details?.can_add_members && details.member_count < 50 ? (
        <ParachatGroupCreate
        conversationId={conversationId}
        existingMemberIds={members.map((member) => member.user_id)}
        onAdded={onRefresh}
        disabled={busy}
      />
      ) : details?.member_count === 50 ? (
        <small>This group has reached its 50-member limit.</small>
      ) : details?.admin_only ? (
        <small>Only administrators can add new members.</small>
      ) : null}


      <strong>Members ({members.length})</strong>

      <div style={{ maxHeight: 240, overflowY: "auto" }}>
        {members.map((member) => (
          <div key={member.user_id} style={{
            padding: "8px 0",
            borderBottom: "1px solid rgba(255,255,255,.08)",
          }}>
            <div>
              {member.full_name || member.username || "Member"}
              {member.user_id === userId ? " (You)" : ""}
              {member.role === "admin" ? " · Admin" : ""}
            </div>

            {admin &&
              member.role === "member" &&
              member.user_id !== userId ? (
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  type="button"
                  disabled={busy}
                  style={actionStyle}
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
                  disabled={busy}
                  style={{ ...actionStyle, color: "#fca5a5" }}
                  onClick={() => {
                    if (window.confirm("Remove this member?")) {
                      void run({
                        action: "remove",
                        targetUserId: member.user_id,
                      });
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={busy}
        style={{ ...actionStyle, color: "#fca5a5" }}
        onClick={() => {
          if (window.confirm("Leave this group chat?")) {
            void run({ action: "leave" });
          }
        }}
      >
        Leave group
      </button>

      {busy ? <p role="status">Updating...</p> : null}
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
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
            background: "transparent",
            border: 0,
            color: "#e1ccff",
            padding: "3px 5px",
            cursor: "pointer",
            fontSize: 12,
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
}: {
  conversationId: string;
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
    />
  );
}

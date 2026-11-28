"use client";

import { useEffect, useRef, useState } from "react";
import ParachatGroupAvatar from "@/components/ParachatGroupAvatar";

import {
  respondToGroupChatInvitation,
  type GroupChatInvitation,
  type GroupChatInvitationStatus,
} from "@/lib/parachat/group-client";

export default function ParachatGroupInvitation({
  invitation,
  onClose,
  onResponded,
}: {
  invitation: GroupChatInvitation;
  onClose: () => void;
  onResponded: (
    status: GroupChatInvitationStatus
  ) => void | Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    if (!dialog.open) dialog.showModal();

    closeRef.current?.focus({ preventScroll: true });

    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  async function respond(accept: boolean) {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError("");

    try {
      const result = await respondToGroupChatInvitation(
        invitation.invitation_id,
        accept
      );

      await onResponded(result);

    } catch {
      setError(
        "Unable to process your invitation. Please try again."
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="parachat-invitation-dialog"
      aria-labelledby="parachat-invitation-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busyRef.current) onClose();
      }}
    >
      <style>{`
        .parachat-invitation-dialog {
          position: fixed;
          inset: 0;
          margin: auto;
          width: min(440px, calc(100% - 28px));
          max-height: calc(100dvh - 36px);
          padding: 0;
          box-sizing: border-box;
          border: 1px solid rgba(168,85,247,.35);
          border-radius: 24px;
          background: linear-gradient(
            155deg, #20172e, #101019 65%
          );
          color: #f9fafb;
          box-shadow: 0 24px 80px rgba(0,0,0,.65);
          overflow: auto;
          overscroll-behavior: contain;
        }

        .parachat-invitation-dialog::backdrop {
          background: rgba(0,0,0,.72);
          backdrop-filter: blur(6px);
        }

        .parachat-invitation-action {
          min-height: 46px;
          border-radius: 13px;
          padding: 10px 14px;
          font-size: 14px;
          font-weight: 750;
          cursor: pointer;
        }

        .parachat-invitation-action:disabled {
          opacity: .55;
          cursor: default;
        }

        @media (max-width: 480px) {
          .parachat-invitation-dialog {
            border-radius: 20px;
            max-height: calc(
              100dvh - 28px -
              env(safe-area-inset-top, 0px) -
              env(safe-area-inset-bottom, 0px)
            );
          }
        }
      `}</style>

      <div style={{
        padding: "18px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid rgba(255,255,255,.09)",
      }}>
        <h2
          id="parachat-invitation-title"
          style={{ margin: 0, fontSize: 17, fontWeight: 800 }}
        >
          Group Chat Invitation
        </h2>

        <button
          ref={closeRef}
          type="button"
          disabled={busy}
          aria-label="Close invitation"
          onClick={onClose}
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: 0,
            background: "rgba(255,255,255,.07)",
            color: "#fff",
            fontSize: 23,
            cursor: "pointer",
          }}
        >
          ×
        </button>
      </div>

      <div style={{
        padding: "24px 20px",
        textAlign: "center",
      }}>
        <div style={{
          width: 80,
          height: 80,
          margin: "0 auto 14px",
          display: "grid",
          placeItems: "center",
        }}>
          <ParachatGroupAvatar
            key={invitation.photo_path || "default"}
            conversationId={invitation.conversation_id}
            name={invitation.group_name}
            photoPath={invitation.photo_path}
          />
        </div>

        <h3 style={{
          margin: "0 0 5px",
          fontSize: 23,
          overflowWrap: "anywhere",
        }}>
          {invitation.group_name}
        </h3>

        <div style={{
          color: "#a8a3b5",
          fontSize: 13,
        }}>
          {invitation.member_count} {
            invitation.member_count === 1
              ? "member"
              : "members"
          }
        </div>

        <p style={{
          fontSize: 15,
          lineHeight: 1.6,
          margin: "22px 0 18px",
          overflowWrap: "anywhere",
        }}>
          <strong>{invitation.inviter_name}</strong>
          {" has invited you to join this Parachat group."}
        </p>

        <div style={{
          borderTop: "1px solid rgba(255,255,255,.10)",
          paddingTop: 16,
          color: "#b5afc3",
          fontSize: 13,
          lineHeight: 1.6,
        }}>
          Accept this invitation to participate in group
          conversations and receive group notifications.
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginTop: 22,
        }}>
          <button
            className="parachat-invitation-action"
            type="button"
            disabled={busy}
            onClick={() => void respond(false)}
            style={{
              background: "rgba(255,255,255,.05)",
              border: "1px solid rgba(255,255,255,.16)",
              color: "#f9fafb",
            }}
          >
            Decline
          </button>

          <button
            className="parachat-invitation-action"
            type="button"
            disabled={busy}
            onClick={() => void respond(true)}
            style={{
              background: "linear-gradient(135deg,#9333ea,#6d28d9)",
              border: 0,
              color: "#fff",
            }}
          >
            Accept Invitation
          </button>
        </div>

        {busy ? (
          <p role="status" style={{ fontSize: 13 }}>
            Processing invitation...
          </p>
        ) : null}

        {error ? (
          <p role="alert" style={{
            color: "#fca5a5",
            fontSize: 13,
          }}>
            {error}
          </p>
        ) : null}
      </div>
    </dialog>
  );
}

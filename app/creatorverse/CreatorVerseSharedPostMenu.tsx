"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const stagingEnabled =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ===
    "https://vmgelrgrtpghmvqgufzz.supabase.co" &&
  process.env.NEXT_PUBLIC_CREATORVERSE_SOCIAL_UI_ENABLED === "true";

type Props = {
  shareId: string;
  sharerId: string;
};

export default function CreatorVerseSharedPostMenu({
  shareId,
  sharerId,
}: Props) {
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!stagingEnabled) return;

    let active = true;

    async function verifyViewer() {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (active) {
          setViewerId(
            error ? null : (data.user?.id ?? null)
          );
        }
      } catch {
        if (active) setViewerId(null);
      }
    }

    void verifyViewer();

    const { data: listener } =
      supabase.auth.onAuthStateChange((_event, session) => {
        if (active) {
          setViewerId(session?.user?.id ?? null);
        }
      });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const isOwnShare =
    stagingEnabled &&
    viewerId !== null &&
    viewerId === sharerId;

  async function removeShare() {
    if (!isOwnShare || removing) return;

    const confirmed = window.confirm(
      "Remove this share from the Dashboard and your Profile? " +
      "The original CreatorVerse post will not be deleted."
    );

    if (!confirmed) return;

    setRemoving(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "creatorverse_delete_share",
        {
          p_share_id: shareId,
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      if (data !== true) {
        throw new Error(
          "This share could not be removed."
        );
      }

      setOpen(false);

      window.dispatchEvent(
        new Event("parapost-creatorverse-shared")
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to remove this share."
      );
    } finally {
      setRemoving(false);
    }
  }

  if (!isOwnShare) return null;

  return (
    <div
      style={{
        alignSelf: "flex-end",
        position: "relative",
        marginTop: 2,
      }}
    >
      <button
        type="button"
        aria-label="More options for this shared CreatorVerse post"
        aria-expanded={open}
        onClick={() => {
          setOpen(value => !value);
          setErrorMessage("");
        }}
        disabled={removing}
        style={{
          border: "1px solid currentColor",
          borderRadius: 8,
          background: "transparent",
          color: "inherit",
          cursor: "pointer",
          padding: "3px 11px",
          fontSize: 20,
          lineHeight: 1.2,
        }}
      >
        ⋯
      </button>

      {open && (
        <div
          style={{
            marginTop: 5,
            padding: 8,
            border: "1px solid currentColor",
            borderRadius: 8,
          }}
        >
          <button
            type="button"
            onClick={() => void removeShare()}
            disabled={removing}
            style={{
              color: "inherit",
              background: "transparent",
              cursor: removing ? "wait" : "pointer",
              border: "none",
              padding: 6,
              textAlign: "left",
            }}
          >
            {removing ? "Removing..." : "Remove share"}
          </button>
        </div>
      )}

      {errorMessage && (
        <p role="alert" style={{ fontSize: 12 }}>
          {errorMessage}
        </p>
      )}
    </div>
  );
}

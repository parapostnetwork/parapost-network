"use client";

import { useEffect, useRef, useState } from "react";
import { groupsFetch } from "@/lib/groups/client";
import { supabase } from "@/lib/supabase";

type Props = {
  shareId: string;
  ownerId: string;
  kind: "post" | "promotion";
  onDeleted: () => void;
};

export default function SharedGroupDeleteMenu({
  shareId,
  ownerId,
  kind,
  onDeleted,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null);

  const [viewerId, setViewerId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (active) setViewerId(data.session?.user.id ?? null);
    });

    const { data } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (active) setViewerId(session?.user.id ?? null);
      }
    );

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);


  useEffect(() => {
    function close(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function removeShare() {
    setOpen(false);

    if (
      !window.confirm(
        "Delete this share from your Dashboard and Profile? " +
        "The original Group or Group post will not be deleted."
      )
    ) {
      return;
    }

    setPending(true);
    setError("");

    try {
      const response = await groupsFetch("/api/groups/sharing", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId, kind }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Could not delete share.");
      }

      onDeleted();
      window.dispatchEvent(new Event("parapost-group-shared"));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete share."
      );
    } finally {
      setPending(false);
    }
  }

  if (viewerId !== ownerId) return null;

  return (
    <div ref={container} style={{ marginLeft: "auto", position: "relative" }}>
      <button
        type="button"
        aria-label="Share options"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((value) => !value)}
        style={{
          border: 0,
          background: "transparent",
          color: "inherit",
          cursor: "pointer",
          fontSize: 24,
          padding: "4px 10px",
        }}
      >
        ⋯
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            zIndex: 20,
            minWidth: 160,
            padding: 6,
            borderRadius: 10,
            background: "#22212c",
            border: "1px solid #555061",
            boxShadow: "0 8px 22px #0006",
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={removeShare}
            style={{
              background: "transparent",
              border: 0,
              color: "#fca5a5",
              padding: "10px 12px",
              cursor: "pointer",
              width: "100%",
              textAlign: "left",
            }}
          >
            Delete Share
          </button>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: "#fca5a5", fontSize: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}

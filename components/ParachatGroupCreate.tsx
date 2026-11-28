"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

import {
  createGroupChat,
  addGroupChatMembers,
  getGroupEligibleFriends,
} from "@/lib/parachat/group-client";

type Friend = { id: string; name: string };

export default function ParachatGroupCreate({
  conversationId,
  existingMemberIds = [],
  onAdded,
  disabled = false,
}: {
  conversationId?: string;
  existingMemberIds?: string[];
  onAdded?: () => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const adding = Boolean(conversationId);
  const minimum = adding ? 1 : 2;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    let active = true;
    let generation = 0;
    let currentUser = "";
    let timer: ReturnType<typeof setTimeout>;

    setLoading(true);

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, session) => {
        const nextUser = session?.user?.id || "";

        if (nextUser === currentUser && generation > 0) return;

        currentUser = nextUser;
        const request = ++generation;

        setFriends([]);
        setSelected([]);
        setError("");
        setLoading(Boolean(nextUser));
        clearTimeout(timer);

        if (!nextUser) return;

        timer = setTimeout(async () => {
          try {
            const rows = await getGroupEligibleFriends();

            if (active && request === generation) {
              setFriends(rows);
            }
          } catch {
            if (active && request === generation) {
              setError("Unable to load friends.");
            }
          } finally {
            if (active && request === generation) {
              setLoading(false);
            }
          }
        }, 0);
      });

    return () => {
      active = false;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [open]);

  const available = friends.filter(
    (friend) => !existingMemberIds.includes(friend.id)
  );

  const valid = selected.filter(
    (id) => available.some((friend) => friend.id === id)
  );

  async function submit() {
    if (
      disabled || loading || busyRef.current ||
      valid.length < minimum ||
      (!adding && !name.trim())
    ) return;

    busyRef.current = true;
    setBusy(true);
    setError("");

    try {
      if (conversationId) {
        await addGroupChatMembers(conversationId, valid);
        setSelected([]);
        setOpen(false);
        onAdded?.();
      } else {
        const id = await createGroupChat(name, valid);
        router.push(`/messages?group=${id}`, { scroll: false });
      }
    } catch {
      setError("Unable to complete this request. Check your friend selection.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const buttonStyle = {
    background: "transparent",
    border: 0,
    color: "#bc92ef",
    fontWeight: 700,
    fontSize: 13,
    padding: "8px 4px",
    cursor: "pointer",
  } as const;

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    background: "#15121c",
    border: "1px solid #41364f",
    borderRadius: 6,
    color: "#fff",
    padding: 8,
    fontSize: 16,
  } as const;

  return (
    <div style={{ padding: "4px 0" }}>
      <button
        type="button"
        disabled={busy || disabled}
        aria-expanded={open}
        style={buttonStyle}
        onClick={() => {
          setSelected([]);
          setFriends([]);
          setSearch("");
          setError("");
          setOpen(!open);
        }}
      >
        {open ? "Cancel" :
          adding ? "+ Add Members" : "+ Create Group Chat"}
      </button>

      {open ? (
        <div style={{ display: "grid", gap: 8, padding: 6 }}>
          {!adding ? (
            <input
              style={inputStyle}
              aria-label="Group name"
              placeholder="Group name"
              maxLength={100}
              disabled={busy}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          ) : null}

          <input
            style={inputStyle}
            aria-label="Search friends"
            placeholder="Search friends"
            value={search}
            disabled={busy}
            onChange={(e) => setSearch(e.target.value)}
          />

          <small>{valid.length} selected</small>

          {loading ? <small>Loading friends...</small> : null}

          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {available
              .filter((friend) =>
                friend.name.toLowerCase().includes(
                  search.toLowerCase()
                )
              )
              .map((friend) => (
                <label key={friend.id} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 0",
                  fontSize: 13,
                }}>
                  <input
                    type="checkbox"
                    checked={selected.includes(friend.id)}
                    disabled={busy || disabled}
                    onChange={() => setSelected((previous) =>
                      previous.includes(friend.id)
                        ? previous.filter((id) => id !== friend.id)
                        : previous.length < 49
                          ? [...previous, friend.id]
                          : previous
                    )}
                  />
                  {friend.name}
                </label>
              ))}
          </div>

          {!loading && !error && !available.length
            ? <small>No eligible friends found.</small>
            : null}

          {error ? <small role="alert">{error}</small> : null}

          <button
            type="button"
            style={buttonStyle}
            disabled={
              busy || disabled || loading ||
              valid.length < minimum ||
              (!adding && !name.trim())
            }
            onClick={() => void submit()}
          >
            {busy ? "Updating..." :
              adding ? "Add Selected Members" : "Create Group"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

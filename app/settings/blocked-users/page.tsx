"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import BackToPrevious from "@/components/BackToPrevious";

type ProfilePreview = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
};

type BlockRow = {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string;
};

type BlockedUserCard = {
  blockId: string;
  blockedId: string;
  createdAt: string;
  profile: ProfilePreview | null;
};

function getDisplayName(profile: ProfilePreview | null) {
  return profile?.full_name || profile?.username || "Parapost Member";
}

function getInitial(profile: ProfilePreview | null) {
  return getDisplayName(profile).charAt(0).toUpperCase();
}

function formatRelativeTime(value?: string | null) {
  if (!value) return "recently";

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "recently";

  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

export default function BlockedUsersSettingsPage() {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserCard[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [processingBlockId, setProcessingBlockId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadBlockedUsers = useCallback(async (userId: string) => {
    setPageLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("user_blocks")
      .select("id, blocker_id, blocked_id, created_at")
      .eq("blocker_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      setBlockedUsers([]);
      setErrorMessage(`Could not load blocked users: ${error.message}`);
      setPageLoading(false);
      return;
    }

    const rows = (data || []) as BlockRow[];
    const blockedIds = [...new Set(rows.map((row) => row.blocked_id).filter(Boolean))];

    let profilesMap: Record<string, ProfilePreview> = {};

    if (blockedIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, bio")
        .in("id", blockedIds);

      if (profileError) {
        setErrorMessage(`Could not load blocked profiles: ${profileError.message}`);
      } else {
        profilesMap = Object.fromEntries(
          ((profileRows || []) as ProfilePreview[]).map((profile) => [profile.id, profile])
        );
      }
    }

    setBlockedUsers(
      rows.map((row) => ({
        blockId: row.id,
        blockedId: row.blocked_id,
        createdAt: row.created_at,
        profile: profilesMap[row.blocked_id] || null,
      }))
    );

    setPageLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setPageLoading(true);
      setStatusMessage("");
      setErrorMessage("");

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (error || !user) {
        setBlockedUsers([]);
        setPageLoading(false);
        setErrorMessage("Please sign in to manage blocked users.");
        return;
      }

      await loadBlockedUsers(user.id);
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [loadBlockedUsers]);

  const filteredBlockedUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return blockedUsers;

    return blockedUsers.filter((item) => {
      const name = item.profile?.full_name?.toLowerCase() || "";
      const username = item.profile?.username?.toLowerCase() || "";
      const bio = item.profile?.bio?.toLowerCase() || "";
      return name.includes(query) || username.includes(query) || bio.includes(query);
    });
  }, [blockedUsers, searchTerm]);

  const handleUnblock = async (item: BlockedUserCard) => {
    const label = getDisplayName(item.profile);
    const confirmUnblock = window.confirm(`Unblock ${label}?`);
    if (!confirmUnblock) return;

    setProcessingBlockId(item.blockId);
    setStatusMessage("");
    setErrorMessage("");

    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("id", item.blockId);

    if (error) {
      setErrorMessage(`Could not unblock user: ${error.message}`);
      setProcessingBlockId(null);
      return;
    }

    setBlockedUsers((prev) => prev.filter((row) => row.blockId !== item.blockId));
    setProcessingBlockId(null);
    setStatusMessage(`${label} has been unblocked.`);
  };

  return (
    <main className="blocked-users-settings-page px-3 py-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] text-white sm:px-6 sm:py-6 lg:px-6">
      <style jsx global>{`
        .blocked-users-back-mobile {
          display: none;
        }

        @media (max-width: 1024px) {
          .blocked-users-back-desktop {
            display: none !important;
          }

          .blocked-users-back-mobile {
            display: block !important;
          }
        }
      `}</style>
      <div className="relative z-10 mx-auto w-full max-w-4xl">
        <div className="blocked-users-back-row mb-5 flex items-center justify-between gap-3">
          <div className="blocked-users-back-desktop flex min-w-0 items-center gap-1.5">
            <BackToPrevious label="Back" fallbackHref="/settings/privacy-safety" />
            <span className="select-none text-slate-700">/</span>
            <Link
              href="/settings"
              className="truncate text-xs font-bold text-slate-500 no-underline transition hover:text-white"
            >
              Settings
            </Link>
          </div>

          <div className="blocked-users-back-mobile">
            <BackToPrevious
              label="Back to Privacy & Safety"
              fallbackHref="/dashboard?menu=settings-privacy"
              alwaysUseFallback
            />
          </div>

          <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Blocked Users
          </span>
        </div>

        <section className="mb-4 rounded-[26px] border p-4 shadow-2xl ring-1 ring-white/[0.035] sm:mb-5 sm:rounded-[30px] sm:p-7"
          style={{
            borderColor: "var(--parapost-accent-border)",
            background:
              "linear-gradient(135deg, var(--parapost-accent-soft), rgba(255,255,255,0.06), rgba(15,23,42,0.70))",
            boxShadow: "0 24px 70px rgba(0,0,0,0.38), 0 0 38px var(--parapost-accent-glow)",
          }}
        >
          <p className="mb-3 text-xs font-black uppercase tracking-[0.18em]" style={{ color: "var(--parapost-accent-text)" }}>
            Blocked Users
          </p>

          <h1 className="max-w-4xl text-[2.05rem] font-black leading-[0.95] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
            Manage who you have blocked on Parapost Network.
          </h1>

          <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
            Review accounts you have blocked on Parapost Network. You can search your blocked list,
            review when someone was blocked, and unblock an account when you are ready.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <span
              className="inline-flex w-full justify-center rounded-full px-5 py-3 text-sm font-black shadow-lg sm:w-auto"
              style={{
                background:
                  "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
                color: "var(--parapost-accent-button-text)",
                boxShadow: "0 12px 26px var(--parapost-accent-glow)",
              }}
            >
              {blockedUsers.length} blocked
            </span>

            <Link
              href="/settings/privacy-safety"
              className="inline-flex w-full justify-center rounded-full border px-5 py-3 text-sm font-black text-white no-underline shadow-lg transition hover:bg-white/10 sm:w-auto"
              style={{ borderColor: "var(--parapost-accent-border)", background: "rgba(255,255,255,0.055)" }}
            >
              Privacy & Safety
            </Link>
          </div>
        </section>

        {statusMessage ? (
          <div className="mb-4 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">
            {statusMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mb-4 rounded-2xl border border-red-300/25 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
            {errorMessage}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div
            className="rounded-[24px] border p-4 shadow-2xl ring-1 ring-white/[0.035] sm:rounded-[28px] sm:p-6"
            style={{
              borderColor: "var(--parapost-accent-border)",
              background:
                "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.055), rgba(15,23,42,0.55))",
            }}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-5">
              <div>
                <p
                  className="mb-2 text-xs font-black uppercase tracking-[0.18em]"
                  style={{ color: "var(--parapost-accent-text)" }}
                >
                  Block List
                </p>
                <h2 className="text-2xl font-black tracking-[-0.03em]">Blocked accounts</h2>
              </div>

              <span
                className="rounded-full border px-3 py-1.5 text-xs font-black"
                style={{
                  borderColor: "var(--parapost-accent-border)",
                  background: "var(--parapost-accent-muted-bg)",
                  color: "var(--parapost-accent-readable-text)",
                }}
              >
                {filteredBlockedUsers.length} shown
              </span>
            </div>

            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search blocked users..."
              className="mb-4 h-12 w-full rounded-2xl border bg-black/35 px-4 text-sm font-bold text-white outline-none placeholder:text-white/35 sm:mb-5"
              style={{ borderColor: "var(--parapost-accent-border)" }}
            />

            {pageLoading ? (
              <div className="rounded-[24px] border border-white/10 bg-black/25 p-5 text-sm font-bold text-slate-300">
                Loading blocked users...
              </div>
            ) : filteredBlockedUsers.length === 0 ? (
              <div className="rounded-[24px] border border-white/10 bg-black/25 p-5">
                <h3 className="text-xl font-black tracking-[-0.03em]">
                  {blockedUsers.length === 0 ? "No blocked users" : "No matching blocked users"}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {blockedUsers.length === 0
                    ? "When you block someone, they will appear here so you can manage or unblock them later."
                    : "Try a different search term."}
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {filteredBlockedUsers.map((item) => {
                  const profile = item.profile;
                  const label = getDisplayName(profile);
                  const username = profile?.username || "no-username";
                  const isBusy = processingBlockId === item.blockId;

                  return (
                    <article
                      key={item.blockId}
                      className="rounded-[22px] border p-4 sm:rounded-[24px]"
                      style={{
                        borderColor: "var(--parapost-accent-border)",
                        background:
                          "linear-gradient(135deg, rgba(255,255,255,0.055), var(--parapost-accent-muted-bg), rgba(255,255,255,0.035))",
                      }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex w-full min-w-0 gap-3 sm:w-auto">
                          <Link
                            href={`/profile/${item.blockedId}`}
                            className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full text-xl font-black no-underline"
                            style={{
                              background:
                                "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
                              color: "var(--parapost-accent-button-text)",
                              boxShadow: "0 0 22px var(--parapost-accent-glow)",
                            }}
                          >
                            {profile?.avatar_url ? (
                                                <Image
                    src={profile.avatar_url}
                    alt=""
                    width={56}
                    height={56}
                    sizes="56px"
                    unoptimized
                    className="h-full w-full object-cover object-center"
                  />
                            ) : (
                              getInitial(profile)
                            )}
                          </Link>

                          <div className="min-w-0">
                            <Link
                              href={`/profile/${item.blockedId}`}
                              className="block truncate text-lg font-black text-white no-underline hover:text-white"
                            >
                              {label}
                            </Link>

                            <div className="mt-1 text-sm font-bold" style={{ color: "var(--parapost-accent-text)" }}>
                              @{username}
                            </div>

                            <div className="mt-2 text-sm text-slate-400">
                              Blocked {formatRelativeTime(item.createdAt)}
                            </div>

                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleUnblock(item)}
                          disabled={isBusy}
                          className="w-full rounded-full border border-red-300/25 bg-red-400/10 px-4 py-2.5 text-sm font-black text-red-100 transition hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                        >
                          {isBusy ? "Unblocking..." : "Unblock"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <section
              className="rounded-[24px] border p-4 shadow-xl sm:rounded-[26px] sm:p-5"
              style={{
                borderColor: "var(--parapost-accent-border)",
                background:
                  "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.045), rgba(15,23,42,0.52))",
              }}
            >
              <p
                className="mb-2 text-xs font-black uppercase tracking-[0.16em]"
                style={{ color: "var(--parapost-accent-text)" }}
              >
                How blocking helps
              </p>
              <h3 className="text-lg font-black tracking-[-0.02em]">Block controls</h3>

              <div className="mt-4 space-y-3">
                {[
                  "Blocked users are listed here for review and management.",
                  "Blocking helps reduce unwanted contact across the platform.",
                  "You can return here anytime to review your blocked list.",
                  "Unblocking asks for confirmation before changes are made.",
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-black/25 p-3 text-sm leading-6 text-slate-300">
                    {item}
                  </div>
                ))}
              </div>
            </section>

            <Link href="/settings/privacy-safety" className="block text-white no-underline">
              <section
                className="rounded-[26px] border p-5 shadow-xl transition hover:bg-white/[0.06]"
                style={{
                  borderColor: "var(--parapost-accent-border)",
                  background:
                    "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.045), rgba(15,23,42,0.52))",
                }}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span
                    className="text-[11px] font-black uppercase tracking-[0.16em]"
                    style={{ color: "var(--parapost-accent-text)" }}
                  >
                    Related
                  </span>
                  <span
                    className="rounded-full border px-2.5 py-1 text-[11px] font-black text-slate-300"
                    style={{ borderColor: "var(--parapost-accent-border)", background: "var(--parapost-accent-muted-bg)" }}
                  >
                    Open
                  </span>
                </div>

                <h3 className="text-lg font-black tracking-[-0.02em]">Privacy & Safety</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Return to privacy, safety, reporting, and account protection controls.
                </p>
              </section>
            </Link>
          </aside>
        </section>
      </div>
    </main>
  );
}

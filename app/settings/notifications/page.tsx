"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import BackToPrevious from "@/components/BackToPrevious";

type NotificationCategory =
  | "friend_requests"
  | "parachat"
  | "comments_likes"
  | "reels"
  | "badges"
  | "support_updates";

type ProfilePreview = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

type AdminUserRow = {
  user_id: string;
  role: string;
};

type NotificationPrefs = Record<NotificationCategory, boolean>;

const defaultPrefs: NotificationPrefs = {
  friend_requests: true,
  parachat: true,
  comments_likes: true,
  reels: true,
  badges: true,
  support_updates: true,
};

const preferenceOptions: Array<{
  key: NotificationCategory;
  title: string;
  description: string;
  examples: string[];
}> = [
  {
    key: "friend_requests",
    title: "Friend Requests",
    description: "Alerts for new friend requests, accepted requests, and friend activity.",
    examples: ["New request", "Request accepted", "Friend activity"],
  },
  {
    key: "parachat",
    title: "Parachat",
    description: "Alerts for new messages, unread conversations, and chat activity.",
    examples: ["New message", "Unread chat", "Conversation updates"],
  },
  {
    key: "comments_likes",
    title: "Comments & Likes",
    description: "Alerts when people like, comment, reply, or interact with your posts.",
    examples: ["Post likes", "Comments", "Replies"],
  },
  {
    key: "reels",
    title: "Parapost Reels",
    description: "Alerts for Reel likes, comments, shares, saves, and creator activity.",
    examples: ["Reel likes", "Reel comments", "Reel shares"],
  },
  {
    key: "badges",
    title: "Badges",
    description: "Alerts when badges are earned, awarded, or shown in profile activity.",
    examples: ["Badge earned", "Profile award", "Milestones"],
  },
  {
    key: "support_updates",
    title: "Support Updates",
    description: "Alerts for support replies, account/data requests, privacy reviews, and safety requests.",
    examples: ["Support reply", "Request update", "Safety review"],
  },
];

const notificationInfoCards = [
  {
    title: "Activity Center",
    description:
      "Your main Notifications page remains the place to review friend requests, comments, likes, Reels activity, and badge updates.",
    href: "/notifications",
    label: "Open",
  },
  {
    title: "Privacy & Safety Alerts",
    description:
      "Safety and support updates help users stay informed when they contact Parapost Network about privacy, account, or moderation concerns.",
    href: "/settings/privacy-safety",
    label: "Manage",
  },
  {
    title: "Parachat Updates",
    description:
      "Message alerts help users keep track of conversations while still giving them control over notification noise.",
    href: "/messages",
    label: "Open",
  },
];

function getDisplayName(profile: ProfilePreview | null) {
  return profile?.full_name || profile?.username || "Parapost Member";
}

function getInitial(profile: ProfilePreview | null) {
  return getDisplayName(profile).charAt(0).toUpperCase();
}

function isAdminRole(role: string) {
  return ["owner", "admin", "support", "moderator"].includes(role);
}

function getStorageKey(userId: string) {
  return `parapost-notification-preferences-${userId}`;
}

function safeReadStoredPrefs(userId: string): NotificationPrefs {
  if (typeof window === "undefined" || !userId) return defaultPrefs;

  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) return defaultPrefs;

    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;

    return {
      friend_requests:
        typeof parsed.friend_requests === "boolean" ? parsed.friend_requests : defaultPrefs.friend_requests,
      parachat: typeof parsed.parachat === "boolean" ? parsed.parachat : defaultPrefs.parachat,
      comments_likes:
        typeof parsed.comments_likes === "boolean" ? parsed.comments_likes : defaultPrefs.comments_likes,
      reels: typeof parsed.reels === "boolean" ? parsed.reels : defaultPrefs.reels,
      badges: typeof parsed.badges === "boolean" ? parsed.badges : defaultPrefs.badges,
      support_updates:
        typeof parsed.support_updates === "boolean" ? parsed.support_updates : defaultPrefs.support_updates,
    };
  } catch {
    return defaultPrefs;
  }
}

export default function NotificationSettingsPage() {
  const [currentProfile, setCurrentProfile] = useState<ProfilePreview | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [adminRole, setAdminRole] = useState("");
  const [pageLoading, setPageLoading] = useState(true);

  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const [savedPrefs, setSavedPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const canSeeAdminSupport = isAdminRole(adminRole);

  const enabledCount = useMemo(() => {
    return Object.values(prefs).filter(Boolean).length;
  }, [prefs]);

  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(prefs) !== JSON.stringify(savedPrefs);
  }, [prefs, savedPrefs]);

  useEffect(() => {
    let cancelled = false;

    async function loadPageUser() {
      setPageLoading(true);
      setStatusMessage("");
      setErrorMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        setCurrentUserId("");
        setUserEmail("");
        setCurrentProfile(null);
        setAdminRole("");
        setPrefs(defaultPrefs);
        setSavedPrefs(defaultPrefs);
        setPageLoading(false);
        return;
      }

      setCurrentUserId(user.id);
      setUserEmail(user.email || "");

      const storedPrefs = safeReadStoredPrefs(user.id);
      setPrefs(storedPrefs);
      setSavedPrefs(storedPrefs);

      const [{ data: profileData }, { data: adminData }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("admin_users")
          .select("user_id, role")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      setCurrentProfile((profileData as ProfilePreview | null) || null);

      const adminRow = adminData as AdminUserRow | null;
      setAdminRole(adminRow?.role && isAdminRole(adminRow.role) ? adminRow.role : "");

      setPageLoading(false);
    }

    void loadPageUser();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = (key: NotificationCategory) => {
    setPrefs((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
    setStatusMessage("");
    setErrorMessage("");
  };

  const handleSavePreferences = () => {
    setStatusMessage("");
    setErrorMessage("");

    if (!currentUserId) {
      setErrorMessage("Please sign in before saving notification preferences.");
      return;
    }

    setSaving(true);

    try {
      window.localStorage.setItem(getStorageKey(currentUserId), JSON.stringify(prefs));
      window.dispatchEvent(
        new CustomEvent("parapost-notification-preferences-updated", {
          detail: { user_id: currentUserId, preferences: prefs },
        })
      );

      setSavedPrefs(prefs);
      setStatusMessage("Notification preferences saved.");
    } catch {
      setErrorMessage("Could not save notification preferences in this browser. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetPreferences = () => {
    setPrefs(defaultPrefs);
    setStatusMessage("");
    setErrorMessage("");
  };

  return (
    <main
      className="notification-settings-page min-h-svh touch-pan-y overflow-x-hidden px-3 py-4 pb-[calc(9.5rem+env(safe-area-inset-bottom))] text-white sm:px-5 sm:py-6 lg:min-h-0 lg:px-6"
      style={{
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorY: "auto",
        scrollPaddingTop: 16,
        scrollPaddingBottom: "calc(9.5rem + env(safe-area-inset-bottom))",
      }}
    >
      <div className="relative z-10 mx-auto w-full max-w-4xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <BackToPrevious label="← Back to Settings" fallbackHref="/settings" />
          <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Notifications
          </span>
        </div>

        <section className="mb-4 grid gap-4 sm:mb-5 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div
            className="rounded-[24px] border p-4 shadow-2xl ring-1 ring-white/[0.035] sm:rounded-[30px] sm:p-7"
            style={{
              borderColor: "var(--parapost-accent-border)",
              background:
                "linear-gradient(135deg, var(--parapost-accent-soft), rgba(255,255,255,0.06), rgba(15,23,42,0.70))",
              boxShadow: "0 24px 70px rgba(0,0,0,0.38), 0 0 38px var(--parapost-accent-glow)",
            }}
          >
            <p className="mb-3 text-xs font-black uppercase tracking-[0.18em]" style={{ color: "var(--parapost-accent-text)" }}>
              Notifications
            </p>

            <h1 className="max-w-3xl text-3xl font-black leading-[0.96] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
              Control how Parapost Network keeps you updated.
            </h1>

            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:mt-5 sm:text-base">
              Choose which alerts matter most to you, including friend requests, Parachat, post activity,
              Parapost Reels, badges, and support updates.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:mt-6 sm:flex-row sm:flex-wrap">
              <a
                href="#notification-preferences"
                className="inline-flex w-full justify-center rounded-full px-5 py-3 text-sm font-black no-underline shadow-lg transition hover:brightness-110 sm:w-auto"
                style={{
                  background:
                    "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
                  color: "var(--parapost-accent-button-text)",
                  boxShadow: "0 12px 26px var(--parapost-accent-glow)",
                }}
              >
                Notification Controls
              </a>

              <Link
                href="/notifications"
                className="inline-flex w-full justify-center rounded-full border border-purple-200/20 bg-purple-400/10 px-5 py-3 text-sm font-black text-white no-underline shadow-lg shadow-purple-950/10 transition hover:bg-purple-400/15 sm:w-auto"
              >
                Open Notifications
              </Link>

              {canSeeAdminSupport ? (
                <Link
                  href="/admin/support"
                  className="inline-flex w-full justify-center rounded-full border border-emerald-300/25 bg-emerald-400/10 px-5 py-3 text-sm font-black text-emerald-100 no-underline hover:bg-emerald-400/15 sm:w-auto"
                >
                  Support Inbox
                </Link>
              ) : null}
            </div>
          </div>

          <aside
            className="rounded-[24px] border p-4 shadow-2xl ring-1 ring-white/[0.035] sm:rounded-[30px] sm:p-5"
            style={{
              borderColor: "var(--parapost-accent-border)",
              background:
                "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.055), rgba(15,23,42,0.56))",
              boxShadow: "0 24px 70px rgba(0,0,0,0.30)",
            }}
          >
            <div className="flex items-center gap-4">
              <div
                className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full text-2xl font-black ring-1 ring-white/15"
                style={{
                  background:
                    "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
                }}
              >
                {currentProfile?.avatar_url ? (
                  <Image
                    src={currentProfile.avatar_url}
                    alt=""
                    width={64}
                    height={64}
                    sizes="64px"
                    unoptimized
                    className="h-full w-full object-cover object-center"
                  />
                ) : (
                  getInitial(currentProfile)
                )}
              </div>

              <div className="min-w-0">
                <div className="truncate text-lg font-black">
                  {pageLoading ? "Loading..." : getDisplayName(currentProfile)}
                </div>
                <div className="truncate text-sm text-slate-400">{userEmail || "Signed out"}</div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 shadow-inner shadow-black/20">
              <div className="text-xs font-black uppercase tracking-[0.14em]" style={{ color: "var(--parapost-accent-text)" }}>
                Current Preference
              </div>
              <div className="mt-2 text-2xl font-black">{enabledCount}/6 On</div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {hasUnsavedChanges ? "You have unsaved notification changes." : "Your notification settings are saved."}
              </p>
            </div>

            {!pageLoading && !currentUserId ? (
              <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                Sign in is required to save notification preferences.
              </div>
            ) : null}
          </aside>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-4">
            <section
              id="notification-preferences"
              className="rounded-[24px] border border-purple-200/15 bg-gradient-to-br from-purple-500/10 via-white/[0.055] to-slate-950/55 p-4 shadow-2xl shadow-purple-950/15 ring-1 ring-white/[0.035] sm:rounded-[28px] sm:p-6"
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-purple-200">
                    Notification Preferences
                  </p>
                  <h2 className="text-[1.35rem] font-black tracking-[-0.03em] sm:text-2xl">
                    Choose what you want to hear about.
                  </h2>
                </div>

                <span
                  className={`rounded-full border px-3 py-1.5 text-xs font-black ${
                    hasUnsavedChanges
                      ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
                      : "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                  }`}
                >
                  {hasUnsavedChanges ? "Unsaved" : "Saved"}
                </span>
              </div>

              <div className="grid gap-3">
                {preferenceOptions.map((item) => {
                  const enabled = prefs[item.key];

                  return (
                    <div
                      key={item.key}
                      className="rounded-[20px] border border-purple-200/15 bg-black/25 p-4 sm:rounded-[24px]"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="m-0 text-lg font-black tracking-[-0.02em]">
                              {item.title}
                            </h3>

                            <span
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${
                                enabled
                                  ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                                  : "border-white/10 bg-white/5 text-slate-300"
                              }`}
                            >
                              {enabled ? "On" : "Off"}
                            </span>
                          </div>

                          <p className="mt-2 text-sm leading-6 text-slate-400">
                            {item.description}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {item.examples.map((example) => (
                              <span
                                key={example}
                                className="rounded-full border border-purple-200/15 bg-black/30 px-3 py-1.5 text-xs font-bold text-slate-300"
                              >
                                {example}
                              </span>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          aria-pressed={enabled}
                          onClick={() => handleToggle(item.key)}
                          className={`relative inline-flex h-8 w-16 shrink-0 self-start items-center rounded-full border transition sm:self-auto ${
                            enabled ? "" : "border-white/10 bg-white/15"
                          }`}
                          style={
                            enabled
                              ? {
                                  borderColor: "var(--parapost-accent-border)",
                                  background:
                                    "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
                                }
                              : undefined
                          }
                        >
                          <span
                            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition ${
                              enabled ? "translate-x-8" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                <span className="text-xs font-bold text-slate-500">
                  {enabledCount} notification categories enabled
                </span>

                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                  <button
                    type="button"
                    onClick={handleResetPreferences}
                    disabled={saving || pageLoading}
                    className="rounded-2xl border border-purple-200/15 bg-white/5 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Reset Defaults
                  </button>

                  <button
                    type="button"
                    onClick={handleSavePreferences}
                    disabled={saving || pageLoading || !currentUserId}
                    className="rounded-2xl px-5 py-3 text-sm font-black shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
                      color: "var(--parapost-accent-button-text)",
                      boxShadow: "0 12px 26px var(--parapost-accent-glow)",
                    }}
                  >
                    {saving ? "Saving..." : hasUnsavedChanges ? "Save Changes" : "Saved"}
                  </button>
                </div>
              </div>

              {statusMessage ? (
                <div className="mt-4 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">
                  {statusMessage}
                </div>
              ) : null}

              {errorMessage ? (
                <div className="mt-4 rounded-2xl border border-red-300/25 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                  {errorMessage}
                </div>
              ) : null}
            </section>

            <section className="rounded-[28px] border border-purple-200/15 bg-gradient-to-br from-purple-500/10 via-white/[0.055] to-slate-950/55 p-5 shadow-2xl shadow-purple-950/15 ring-1 ring-white/[0.035] sm:p-6">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-purple-200">
                Notification Types
              </p>
              <h2 className="text-[1.35rem] font-black tracking-[-0.03em] sm:text-2xl">
                Keep important activity easy to find.
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                Notification controls help users reduce noise while staying updated on messages, social activity,
                Parapost Reels, badges, friend requests, and support updates.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  "Friend request controls",
                  "Parachat alerts",
                  "Post interaction alerts",
                  "Parapost Reels alerts",
                  "Badge award alerts",
                  "Support update alerts",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-purple-200/15 bg-black/30 px-4 py-3 text-sm font-bold text-slate-200"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            {notificationInfoCards.map((card) => (
              <Link key={card.title} href={card.href} className="block text-white no-underline">
                <section
                  className="rounded-[22px] border p-4 shadow-xl transition hover:bg-white/[0.065] sm:rounded-[26px] sm:p-5"
                  style={{
                    borderColor: "var(--parapost-accent-border)",
                    background:
                      "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.045), rgba(15,23,42,0.52))",
                  }}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-purple-200">
                      Notifications
                    </span>
                    <span className="rounded-full border border-purple-200/15 bg-purple-400/10 px-2.5 py-1 text-[11px] font-black text-slate-300">
                      {card.label}
                    </span>
                  </div>

                  <h3 className="text-lg font-black tracking-[-0.02em]">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{card.description}</p>
                </section>
              </Link>
            ))}

            <section className="rounded-[22px] border border-purple-200/15 bg-gradient-to-br from-purple-500/10 via-white/[0.045] to-slate-950/55 p-4 shadow-xl shadow-purple-950/10 sm:rounded-[26px] sm:p-5">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-purple-200">
                Quiet Control
              </span>
              <h3 className="mt-3 text-lg font-black tracking-[-0.02em]">More control, less noise</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Users can keep important updates on and turn off categories they do not want to see as often.
              </p>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

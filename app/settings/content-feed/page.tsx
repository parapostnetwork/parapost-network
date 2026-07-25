"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import BackToPrevious from "@/components/BackToPrevious";

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

type PreferenceKey =
  | "prioritize_friends"
  | "show_reels"
  | "show_trending"
  | "show_sponsored"
  | "hide_seen_posts"
  | "reduce_sensitive";

type FeedPreferenceItem = {
  key: PreferenceKey;
  title: string;
  description: string;
  examples: string[];
};

type FeedPreferences = Record<PreferenceKey, boolean>;

const defaultFeedPreferences: FeedPreferences = {
  prioritize_friends: true,
  show_reels: true,
  show_trending: true,
  show_sponsored: true,
  hide_seen_posts: false,
  reduce_sensitive: false,
};

const preferenceItems: FeedPreferenceItem[] = [
  {
    key: "prioritize_friends",
    title: "Prioritize Friends",
    description: "Show more updates from friends and accepted connections when possible.",
    examples: ["Friend posts", "Accepted connections", "Closer community"],
  },
  {
    key: "show_reels",
    title: "Show Parapost Reels",
    description: "Allow Parapost Reels recommendations and shared Reels to appear in feed areas.",
    examples: ["Reels", "Shared clips", "Creator videos"],
  },
  {
    key: "show_trending",
    title: "Trending in Parapost",
    description: "Show trending topics, popular community activity, and discovery suggestions.",
    examples: ["Trending topics", "Popular posts", "Discovery"],
  },
  {
    key: "show_sponsored",
    title: "Sponsored Content",
    description: "Allow sponsored posts, promoted placements, and partner content when ads are active.",
    examples: ["Sponsored posts", "Promotions", "Partner content"],
  },
  {
    key: "hide_seen_posts",
    title: "Reduce Repeated Posts",
    description: "Prefer fewer repeated posts you have already seen or interacted with.",
    examples: ["Less repetition", "Cleaner feed", "Fresh posts"],
  },
  {
    key: "reduce_sensitive",
    title: "Reduce Sensitive Content",
    description: "Prefer fewer intense, unwanted, or sensitive posts in discovery and feed areas.",
    examples: ["Sensitive content", "Discovery controls", "Safer browsing"],
  },
];

const contentControlCards = [
  {
    title: "Muted Words",
    description: "Prepared control for hiding words, topics, or phrases you do not want to see often.",
  },
  {
    title: "Hidden Hashtags",
    description: "Prepared control for reducing hashtags or topics that are not relevant to your feed.",
  },
  {
    title: "Reels Preferences",
    description: "Prepared control for shaping the types of Parapost Reels shown in discovery and timelines.",
  },
  {
    title: "Discovery Filters",
    description: "Prepared control for refining people, posts, Reels, and topics recommended to you.",
  },
];

const quickLinks = [
  {
    title: "Privacy & Safety",
    description: "Manage blocking, reporting, private profile controls, and safety support.",
    href: "/settings/privacy-safety",
    label: "Open",
  },
  {
    title: "Blocked Users",
    description: "Review accounts you have blocked and unblock them later if needed.",
    href: "/settings/blocked-users",
    label: "Manage",
  },
  {
    title: "Notifications",
    description: "Choose which activity alerts matter most to you.",
    href: "/settings/notifications",
    label: "Manage",
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
  return `parapost-content-feed-preferences-${userId}`;
}

function safeReadStoredPreferences(userId: string): FeedPreferences {
  if (typeof window === "undefined" || !userId) return defaultFeedPreferences;

  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) return defaultFeedPreferences;

    const parsed = JSON.parse(raw) as Partial<FeedPreferences>;

    return {
      prioritize_friends:
        typeof parsed.prioritize_friends === "boolean"
          ? parsed.prioritize_friends
          : defaultFeedPreferences.prioritize_friends,
      show_reels:
        typeof parsed.show_reels === "boolean" ? parsed.show_reels : defaultFeedPreferences.show_reels,
      show_trending:
        typeof parsed.show_trending === "boolean"
          ? parsed.show_trending
          : defaultFeedPreferences.show_trending,
      show_sponsored:
        typeof parsed.show_sponsored === "boolean"
          ? parsed.show_sponsored
          : defaultFeedPreferences.show_sponsored,
      hide_seen_posts:
        typeof parsed.hide_seen_posts === "boolean"
          ? parsed.hide_seen_posts
          : defaultFeedPreferences.hide_seen_posts,
      reduce_sensitive:
        typeof parsed.reduce_sensitive === "boolean"
          ? parsed.reduce_sensitive
          : defaultFeedPreferences.reduce_sensitive,
    };
  } catch {
    return defaultFeedPreferences;
  }
}

export default function ContentFeedSettingsPage() {
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentProfile, setCurrentProfile] = useState<ProfilePreview | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [adminRole, setAdminRole] = useState("");
  const [pageLoading, setPageLoading] = useState(true);

  const [feedPreferences, setFeedPreferences] = useState<FeedPreferences>(defaultFeedPreferences);
  const [savedFeedPreferences, setSavedFeedPreferences] = useState<FeedPreferences>(defaultFeedPreferences);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const canSeeAdminSupport = isAdminRole(adminRole);

  const enabledCount = useMemo(() => {
    return Object.values(feedPreferences).filter(Boolean).length;
  }, [feedPreferences]);

  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(feedPreferences) !== JSON.stringify(savedFeedPreferences);
  }, [feedPreferences, savedFeedPreferences]);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      setPageLoading(true);
      setStatusMessage("");
      setErrorMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        setCurrentUserId("");
        setCurrentProfile(null);
        setUserEmail("");
        setAdminRole("");
        setFeedPreferences(defaultFeedPreferences);
        setSavedFeedPreferences(defaultFeedPreferences);
        setPageLoading(false);
        return;
      }

      setCurrentUserId(user.id);
      setUserEmail(user.email || "");

      const storedPreferences = safeReadStoredPreferences(user.id);
      setFeedPreferences(storedPreferences);
      setSavedFeedPreferences(storedPreferences);

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

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, []);

  const togglePreference = (key: PreferenceKey) => {
    setFeedPreferences((prev) => ({
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
      setErrorMessage("Please sign in before saving content and feed preferences.");
      return;
    }

    setSaving(true);

    try {
      window.localStorage.setItem(getStorageKey(currentUserId), JSON.stringify(feedPreferences));
      window.dispatchEvent(
        new CustomEvent("parapost-content-feed-preferences-updated", {
          detail: { user_id: currentUserId, preferences: feedPreferences },
        })
      );

      setSavedFeedPreferences(feedPreferences);
      setStatusMessage("Content and feed preferences saved.");
    } catch {
      setErrorMessage("Could not save content and feed preferences in this browser. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetPreferences = () => {
    setFeedPreferences(defaultFeedPreferences);
    setStatusMessage("");
    setErrorMessage("");
  };

  return (
    <main
      className="content-feed-settings-page min-h-[100dvh] touch-pan-y overflow-x-hidden px-3 py-4 pb-[calc(9.5rem+env(safe-area-inset-bottom))] text-white sm:px-5 sm:py-6 lg:min-h-0 lg:px-6"
      style={{
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorY: "auto",
        scrollPaddingTop: 16,
        scrollPaddingBottom: "calc(9.5rem + env(safe-area-inset-bottom))",
      }}
    >
      <style jsx global>{`
        .content-feed-settings-page {
          scroll-padding-bottom: calc(9.5rem + env(safe-area-inset-bottom));
        }

        .content-feed-back-mobile {
          display: none;
        }

        .content-feed-related-link,
        .content-feed-related-card {
          height: auto;
          min-height: 0;
        }

        @media (max-width: 1180px) {
          .content-feed-back-desktop {
            display: none !important;
          }

          .content-feed-back-mobile {
            display: block !important;
          }
        }

        @media (max-width: 430px) {
          .content-feed-settings-page {
            padding-top: max(14px, env(safe-area-inset-top)) !important;
            padding-left: 12px !important;
            padding-right: 12px !important;
          }

          .content-feed-back-row {
            align-items: flex-start !important;
          }

          .content-feed-settings-page h1 {
            font-size: clamp(2.2rem, 11vw, 3.35rem) !important;
            line-height: 0.96 !important;
          }
        }

        @media (min-width: 768px) and (max-width: 1180px) {
          .content-feed-settings-page {
            padding-left: 20px !important;
            padding-right: 20px !important;
            padding-bottom: calc(8rem + env(safe-area-inset-bottom)) !important;
          }

          .content-feed-hero-grid {
            grid-template-columns: minmax(0, 1fr) 320px !important;
            align-items: stretch !important;
          }

          .content-feed-hero-grid > * {
            height: 100% !important;
          }

          .content-feed-content-grid {
            grid-template-columns: minmax(0, 1fr) 320px !important;
            align-items: start !important;
          }

          .content-feed-related-grid {
            display: grid !important;
            grid-auto-rows: auto !important;
            align-items: start !important;
            gap: 16px !important;
          }

          .content-feed-related-link,
          .content-feed-related-card {
            height: auto !important;
            min-height: 0 !important;
            align-self: start !important;
          }

          .content-feed-settings-page h1 + p {
            margin-top: 24px !important;
          }
        }

        @media (max-height: 720px) and (max-width: 980px) {
          .content-feed-settings-page {
            padding-top: max(12px, env(safe-area-inset-top)) !important;
            padding-bottom: calc(7rem + env(safe-area-inset-bottom)) !important;
          }
        }
      `}</style>

      <div className="relative z-10 mx-auto w-full max-w-4xl">
        <div className="content-feed-back-row mb-5 flex items-center justify-between gap-3">
          <div className="content-feed-back-desktop flex items-center gap-1.5 min-w-0">
            <BackToPrevious label="Back to Privacy & Safety" fallbackHref="/settings/privacy-safety" />
            <span className="text-slate-700 select-none">/</span>
            <Link href="/settings" className="truncate text-xs font-bold text-slate-500 no-underline transition hover:text-white">Settings</Link>
          </div>

          <div className="content-feed-back-mobile">
            <BackToPrevious
              label="Back to Privacy & Safety"
              fallbackHref="/dashboard?menu=settingsPrivacy"
              alwaysUseFallback
            />
          </div>

          <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Content & Feed
          </span>
        </div>

        <section className="content-feed-hero-grid mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div
            className="rounded-[24px] border p-4 shadow-2xl ring-1 ring-white/[0.035] sm:rounded-[30px] sm:p-7"
            style={{
              borderColor: "var(--parapost-accent-border)",
              background:
                "linear-gradient(135deg, var(--parapost-accent-soft), rgba(255,255,255,0.06), rgba(15,23,42,0.70))",
              boxShadow: "0 24px 70px rgba(0,0,0,0.38), 0 0 38px var(--parapost-accent-glow)",
            }}
          >
            <p
              className="mb-3 text-xs font-black uppercase tracking-[0.18em]"
              style={{ color: "var(--parapost-accent-text)" }}
            >
              Content & Feed
            </p>

            <h1 className="max-w-3xl text-[2.05rem] font-black leading-[0.95] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
              Shape what appears in your Parapost Network feed.
            </h1>

            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Choose your preferred feed direction for friends, Parapost Reels, trending topics, sponsored content,
              repeated posts, and sensitive content controls.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="#feed-controls"
                className="inline-flex w-full justify-center rounded-full px-5 py-3 text-center text-sm font-black no-underline shadow-lg transition hover:brightness-110 sm:w-auto"
                style={{
                  background:
                    "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
                  color: "var(--parapost-accent-button-text)",
                  boxShadow: "0 12px 26px var(--parapost-accent-glow)",
                }}
              >
                Feed Controls
              </a>

              <Link
                href="/settings/privacy-safety"
                className="inline-flex w-full justify-center rounded-full border px-5 py-3 text-center text-sm font-black text-white no-underline shadow-lg transition hover:bg-white/10 sm:w-auto"
                style={{ borderColor: "var(--parapost-accent-border)", background: "rgba(255,255,255,0.055)" }}
              >
                Privacy & Safety
              </Link>

              {canSeeAdminSupport ? (
                <Link
                  href="/admin/support"
                  className="inline-flex w-full justify-center rounded-full border border-emerald-300/25 bg-emerald-400/10 px-5 py-3 text-center text-sm font-black text-emerald-100 no-underline hover:bg-emerald-400/15 sm:w-auto"
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
              <div
                className="text-xs font-black uppercase tracking-[0.14em]"
                style={{ color: "var(--parapost-accent-text)" }}
              >
                Feed Preference
              </div>
              <div className="mt-2 text-2xl font-black">{enabledCount}/6 On</div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {hasUnsavedChanges ? "You have unsaved feed preference changes." : "Your feed preferences are saved."}
              </p>
            </div>

            {!pageLoading && !currentUserId ? (
              <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                Sign in is required to save content and feed preferences.
              </div>
            ) : null}
          </aside>
        </section>

        <section className="content-feed-content-grid grid gap-4 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-4">
            <section
              id="feed-controls"
              className="scroll-mt-24 rounded-[24px] border p-4 shadow-2xl ring-1 ring-white/[0.035] sm:rounded-[28px] sm:p-6"
              style={{
                borderColor: "var(--parapost-accent-border)",
                background:
                  "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.055), rgba(15,23,42,0.55))",
              }}
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p
                    className="mb-2 text-xs font-black uppercase tracking-[0.18em]"
                    style={{ color: "var(--parapost-accent-text)" }}
                  >
                    Feed Controls
                  </p>
                  <h2 className="text-xl font-black tracking-[-0.03em] sm:text-2xl">
                    Choose your feed preferences.
                  </h2>
                </div>

                <span
                  className="rounded-full border px-3 py-1.5 text-xs font-black"
                  style={{
                    borderColor: "var(--parapost-accent-border)",
                    background: "var(--parapost-accent-muted-bg)",
                    color: "var(--parapost-accent-readable-text)",
                  }}
                >
                  {hasUnsavedChanges ? "Unsaved" : "Saved"}
                </span>
              </div>

              <div className="grid gap-3">
                {preferenceItems.map((item) => {
                  const enabled = feedPreferences[item.key];

                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => togglePreference(item.key)}
                      className="w-full rounded-[22px] border p-4 text-left transition hover:bg-white/[0.06] sm:rounded-[24px]"
                      style={{
                        borderColor: enabled ? "var(--parapost-accent-active-border)" : "rgba(255,255,255,0.10)",
                        background: enabled ? "var(--parapost-accent-muted-bg)" : "rgba(0,0,0,0.25)",
                        boxShadow: enabled ? "0 0 22px var(--parapost-accent-glow)" : "none",
                      }}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="m-0 text-lg font-black tracking-[-0.02em]">{item.title}</h3>

                            <span
                              className="rounded-full border px-2.5 py-1 text-[11px] font-black"
                              style={{
                                borderColor: enabled ? "var(--parapost-accent-active-border)" : "rgba(255,255,255,0.12)",
                                background: enabled ? "var(--parapost-accent-active-bg)" : "rgba(255,255,255,0.05)",
                                color: enabled ? "var(--parapost-accent-readable-text)" : "#cbd5e1",
                              }}
                            >
                              {enabled ? "On" : "Off"}
                            </span>
                          </div>

                          <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {item.examples.map((example) => (
                              <span
                                key={example}
                                className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs font-bold text-slate-300"
                              >
                                {example}
                              </span>
                            ))}
                          </div>
                        </div>

                        <span
                          className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border transition ${
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
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-500">
                  {enabledCount} content and feed controls enabled
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

            <section className="rounded-[24px] border border-purple-200/15 bg-gradient-to-br from-purple-500/10 via-white/[0.055] to-slate-950/55 p-4 shadow-2xl shadow-purple-950/15 ring-1 ring-white/[0.035] sm:rounded-[28px] sm:p-6">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-purple-200">
                Advanced Content Controls
              </p>
              <h2 className="text-xl font-black tracking-[-0.03em] sm:text-2xl">
                More filtering tools are prepared for future expansion.
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                Parapost Network can expand this area with muted words, hidden hashtags, discovery filters,
                Reels content preferences, and stronger feed controls as the platform grows.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {contentControlCards.map((card) => (
                  <div key={card.title} className="rounded-2xl border border-purple-200/15 bg-black/30 p-4">
                    <h3 className="text-base font-black text-white">{card.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{card.description}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="content-feed-related-grid space-y-4">
            {quickLinks.map((card) => (
              <Link key={card.title} href={card.href} className="content-feed-related-link block text-white no-underline">
                <section
                  className="content-feed-related-card h-auto rounded-[22px] border p-4 shadow-xl transition hover:bg-white/[0.06] sm:rounded-[26px] sm:p-5"
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
                      {card.label}
                    </span>
                  </div>

                  <h3 className="text-lg font-black tracking-[-0.02em]">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{card.description}</p>
                </section>
              </Link>
            ))}

            <section
              className="rounded-[22px] border p-4 shadow-xl sm:rounded-[26px] sm:p-5"
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
                Feed Balance
              </p>
              <h3 className="text-lg font-black tracking-[-0.02em]">Control without clutter</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                These settings are designed to give users more control without making the dashboard feel complicated.
              </p>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

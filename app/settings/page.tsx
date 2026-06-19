"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

type SettingsCard = {
  eyebrow: string;
  title: string;
  description: string;
  items: string[];
  href: string;
  active: boolean;
  comingSoon?: boolean;
};

type SettingsGroup = {
  label: string;
  icon: string;
  cards: SettingsCard[];
};

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: "Your Account",
    icon: "◎",
    cards: [
      {
        eyebrow: "Account",
        title: "Account & Security",
        description: "Manage your signed-in account, email, password reset, sign out, and security tools.",
        items: ["Signed-in account", "Email & password", "Password reset", "Log out", "Sign out"],
        href: "/settings/account",
        active: true,
      },
      {
        eyebrow: "Profile",
        title: "Profile Settings",
        description: "Edit your profile details, avatar, bio, and public information.",
        items: ["Profile info", "Avatar", "Bio", "Profile details"],
        href: "/settings/profile",
        active: true,
      },
      {
        eyebrow: "Visibility",
        title: "Profile Visibility",
        description: "Set your profile to public or private and control who sees your content.",
        items: ["Public profile", "Private profile", "Visibility toggle"],
        href: "/settings/profile-visibility",
        active: true,
      },
    ],
  },
  {
    label: "Privacy & Safety",
    icon: "⊙",
    cards: [
      {
        eyebrow: "Privacy",
        title: "Privacy & Safety",
        description: "Control privacy, blocking, reporting, and community protection tools.",
        items: ["Profile visibility", "Blocked users", "Reports", "Safety tools"],
        href: "/settings/privacy-safety",
        active: true,
      },
      {
        eyebrow: "Safety",
        title: "Blocked Users",
        description: "Review accounts you have blocked and unblock them safely if needed.",
        items: ["Blocked accounts", "Unblock users"],
        href: "/settings/blocked-users",
        active: true,
      },
    ],
  },
  {
    label: "Preferences",
    icon: "◈",
    cards: [
      {
        eyebrow: "Personalization",
        title: "Personalization",
        description: "Customize accent colors, theme appearance, and font style options.",
        items: ["Accent color", "Theme", "Font style"],
        href: "/settings/personalization",
        active: true,
      },
      {
        eyebrow: "Notifications",
        title: "Notifications",
        description: "Manage alerts for friend requests, Parachat, comments, likes, and Reels.",
        items: ["Friend requests", "Parachat", "Comments & likes", "Reels"],
        href: "/settings/notifications",
        active: true,
      },
      {
        eyebrow: "Feed",
        title: "Content & Feed",
        description: "Manage feed preferences, muted words, hidden posts, and content filters.",
        items: ["Feed preferences", "Muted words", "Hidden posts"],
        href: "/settings/content-feed",
        active: true,
      },
    ],
  },
  {
    label: "Data & Support",
    icon: "◇",
    cards: [
      {
        eyebrow: "Data",
        title: "Data & Account Files",
        description: "Request account data, correct information, or start account deletion.",
        items: ["Request my data", "Correct data", "Account deletion"],
        href: "/settings/data",
        active: true,
      },
      {
        eyebrow: "Support",
        title: "Help & Support",
        description: "Contact Parapost Network for account help, privacy, bugs, or policy questions.",
        items: ["Contact support", "Report a problem", "Account help"],
        href: "/settings/help-support",
        active: true,
      },
      {
        eyebrow: "Legal",
        title: "Legal & Policies",
        description: "Review Parapost Network policies for trust, safety, and user protection.",
        items: ["Terms", "Privacy Policy", "Community Guidelines"],
        href: "/settings/legal",
        active: true,
      },
    ],
  },
  {
    label: "Monetization",
    icon: "◬",
    cards: [
      {
        eyebrow: "Coming Soon",
        title: "Payments",
        description: "Promoted posts, sponsored content, billing history, and business tools — coming soon.",
        items: ["Promotions", "Sponsored posts", "Billing history"],
        href: "/settings/payments",
        active: true,
        comingSoon: true,
      },
    ],
  },
];

function getInitial(profile: ProfilePreview | null) {
  const value = profile?.full_name || profile?.username || "P";
  return value.charAt(0).toUpperCase();
}

function isAdminRole(role: string) {
  return ["owner", "admin", "support", "moderator"].includes(role);
}

type SearchResult = SettingsCard & { groupLabel: string; groupIcon: string };

export default function SettingsPage() {
  const router = useRouter();
  const [currentProfile, setCurrentProfile] = useState<ProfilePreview | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [adminRole, setAdminRole] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const displayName = currentProfile?.full_name || currentProfile?.username || "Parapost Member";
  const canSeeAdminSupport = isAdminRole(adminRole);

  // Compute search results across all cards — title, description, eyebrow, items, group label
  const searchResults = useMemo<SearchResult[] | null>(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return null;

    const results: SearchResult[] = [];
    for (const group of SETTINGS_GROUPS) {
      for (const card of group.cards) {
        const haystack = [
          card.title,
          card.description,
          card.eyebrow,
          group.label,
          ...card.items,
        ]
          .join(" ")
          .toLowerCase();
        if (haystack.includes(query)) {
          results.push({ ...card, groupLabel: group.label, groupIcon: group.icon });
        }
      }
    }
    return results;
  }, [searchQuery]);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      setPageLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userError || !user) {
        setCurrentUserId("");
        setUserEmail("");
        setCurrentProfile(null);
        setAdminRole("");
        setPageLoading(false);
        return;
      }

      setCurrentUserId(user.id);
      setUserEmail(user.email || "");

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

  async function handleLogOut() {
    if (logoutLoading) return;

    setLogoutLoading(true);

    try {
      await supabase.auth.signOut();
      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("Error logging out:", error);
      setLogoutLoading(false);
    }
  }

  // Reusable card renderer — used in both normal and search views
  function SettingsCardItem({ card, groupLabel, groupIcon }: {
    card: SettingsCard;
    groupLabel?: string;
    groupIcon?: string;
  }) {
    const content = (
      <div
        className={`group/card flex h-full flex-col rounded-[20px] border border-white/[0.08] bg-white/[0.035] p-5 shadow-md transition-all duration-150 hover:border-white/[0.15] hover:bg-white/[0.06] hover:shadow-lg ${
          card.active ? "" : "opacity-50 pointer-events-none"
        }`}
      >
        {/* Group breadcrumb — shown in search results only */}
        {groupLabel && (
          <div className="mb-2 flex items-center gap-1.5">
            <span className="text-[10px] text-purple-400/40" aria-hidden="true">{groupIcon}</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-purple-300/40">
              {groupLabel}
            </span>
          </div>
        )}

        {/* Eyebrow + badge row */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-300/60">
            {card.eyebrow}
          </span>
          {card.comingSoon ? (
            <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black text-amber-300">
              Coming soon
            </span>
          ) : null}
        </div>

        {/* Title */}
        <h3 className="text-lg font-black leading-snug tracking-[-0.02em] text-white">
          {card.title}
        </h3>

        {/* Description */}
        <p className="mt-1.5 flex-1 text-sm leading-[1.55] text-slate-400">
          {card.description}
        </p>

        {/* Item tags */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {card.items.map((item) => (
            <span
              key={item}
              className="rounded-full border border-white/[0.07] bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-semibold text-slate-400"
            >
              {item}
            </span>
          ))}
        </div>

        {/* Arrow — shown on hover */}
        {!card.comingSoon && (
          <div className="mt-3 flex justify-end">
            <span className="text-xs text-purple-400/0 transition-all duration-150 group-hover/card:text-purple-400/80">
              Open →
            </span>
          </div>
        )}
      </div>
    );

    if (card.href) {
      return (
        <Link href={card.href} className="block text-white no-underline">
          {content}
        </Link>
      );
    }
    return <div>{content}</div>;
  }

  return (
    <main className="px-4 py-5 pb-[calc(8.5rem+env(safe-area-inset-bottom))] sm:px-5 sm:py-6 lg:px-6">
      <div className="relative z-10 mx-auto w-full max-w-3xl xl:max-w-6xl 2xl:max-w-7xl">

        {/* Top bar */}
        <div className="mb-5 flex items-center gap-3">
          <BackToPrevious label="← Dashboard" fallbackHref="/dashboard" />
        </div>

        {/* Hero — user card */}
        <div className="mb-4 rounded-[22px] border border-white/[0.08] bg-gradient-to-br from-purple-500/10 via-white/[0.04] to-slate-950/60 p-5 shadow-xl ring-1 ring-white/[0.04]">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-violet-500 to-slate-900 text-sm font-black ring-2 ring-white/10">
              {currentProfile?.avatar_url ? (
                <img src={currentProfile.avatar_url} alt="" className="h-full w-full object-cover object-center" />
              ) : (
                getInitial(currentProfile)
              )}
            </div>

            {/* Name + email */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black leading-tight text-white">
                {pageLoading ? "Loading…" : displayName}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500">{userEmail || "Signed out"}</p>
            </div>
          </div>

          {/* Quick actions — row below */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/settings/help-support"
              className="rounded-full bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 px-4 py-2 text-sm font-black text-white no-underline shadow-lg shadow-purple-950/40 transition hover:brightness-110"
            >
              Contact Support
            </Link>
            <Link
              href="/settings/privacy-safety"
              className="rounded-full border border-purple-200/20 bg-purple-400/10 px-4 py-2 text-sm font-black text-white no-underline transition hover:bg-purple-400/15"
            >
              Privacy & Safety
            </Link>
            {canSeeAdminSupport ? (
              <Link
                href="/admin/support"
                className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-sm font-black text-emerald-100 no-underline transition hover:bg-emerald-400/15"
              >
                Support Inbox
              </Link>
            ) : null}

            {currentUserId ? (
              <button
                type="button"
                onClick={handleLogOut}
                disabled={logoutLoading}
                className="rounded-full border border-red-300/25 bg-red-500/10 px-4 py-2 text-sm font-black text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {logoutLoading ? "Logging out..." : "Log out"}
              </button>
            ) : null}
          </div>
        </div>

        {/* ── Search bar ── */}
        <div className="mb-6 relative">
          {/* Search icon */}
          <span
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 select-none"
            aria-hidden="true"
          >
            ⌕
          </span>

          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search settings… try 'password', 'notifications', 'avatar'"
            aria-label="Search settings"
            className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] py-3 pl-10 pr-10 text-sm text-white placeholder-slate-600 outline-none transition focus:border-purple-500/40 focus:bg-white/[0.06] focus:ring-1 focus:ring-purple-500/20"
          />

          {/* Clear button */}
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                searchInputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-500 transition hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* ── Search results view ── */}
        {searchResults !== null ? (
          <div>
            {searchResults.length > 0 ? (
              <>
                {/* Result count */}
                <p className="mb-3 px-0.5 text-[11px] font-black uppercase tracking-[0.2em] text-purple-300/80">
                  {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for &ldquo;{searchQuery.trim()}&rdquo;
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 xl:gap-4">
                  {searchResults.map((result) => (
                    <SettingsCardItem
                      key={result.href}
                      card={result}
                      groupLabel={result.groupLabel}
                      groupIcon={result.groupIcon}
                    />
                  ))}
                </div>
              </>
            ) : (
              /* Empty state */
              <div className="flex flex-col items-center gap-4 rounded-[20px] border border-white/[0.06] bg-white/[0.025] px-6 py-10 text-center">
                <span className="text-3xl opacity-30" aria-hidden="true">⌕</span>
                <div>
                  <p className="text-sm font-black text-white">
                    No results for &ldquo;{searchQuery.trim()}&rdquo;
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Try a different keyword — or browse the sections below.
                  </p>
                </div>
                {/* Quick suggestions */}
                <div className="flex flex-wrap justify-center gap-2">
                  {["password", "privacy", "notifications", "avatar", "blocked", "theme"].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setSearchQuery(suggestion)}
                      className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-semibold text-slate-400 transition hover:border-white/[0.15] hover:text-white"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── Normal grouped view ── */
          <div className="space-y-7">
            {SETTINGS_GROUPS.map((group) => (
              <div key={group.label}>
                {/* Section header */}
                <div className="mb-3 flex items-center gap-2 px-0.5">
                  <span className="text-sm text-purple-400/50" aria-hidden="true">{group.icon}</span>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-300/80">
                    {group.label}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 xl:gap-4">
                  {group.cards.map((card) => (
                    <SettingsCardItem key={card.href} card={card} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Log out — visible final Settings action for web, mobile, tablet, iOS, and Android */}
        {currentUserId ? (
          <section className="mt-8 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center gap-2 px-0.5">
              <span className="text-sm text-red-300/50" aria-hidden="true">↳</span>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-red-200/80">
                Account Session
              </p>
            </div>

            <div className="rounded-[22px] border border-red-300/15 bg-red-500/[0.065] p-5 shadow-xl ring-1 ring-red-300/[0.04]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-lg font-black leading-tight text-white">Log out</p>
                  <p className="mt-1.5 max-w-2xl text-sm leading-6 text-red-50/55">
                    Sign out of Parapost Network. You can log back in anytime with your email and password.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleLogOut}
                  disabled={logoutLoading}
                  className="min-h-[46px] w-full rounded-2xl border border-red-200/20 bg-red-500/15 px-5 py-3 text-sm font-black text-red-50 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {logoutLoading ? "Logging out..." : "Log out"}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {/* Admin support panel — always visible */}
        {canSeeAdminSupport ? (
          <div className="mt-8">
            <Link
              href="/admin/support"
              className="flex items-center justify-between gap-4 rounded-[20px] border border-emerald-300/15 bg-emerald-400/[0.07] p-5 text-white no-underline transition hover:bg-emerald-400/[0.11]"
            >
              <div className="min-w-0">
                <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-400">
                  Admin · {adminRole}
                </p>
                <p className="text-sm font-black">Support Inbox</p>
                <p className="mt-0.5 text-xs text-emerald-100/50">
                  Review messages, bug reports, privacy issues, and data requests.
                </p>
              </div>
              <span className="shrink-0 text-emerald-400/60">→</span>
            </Link>
          </div>
        ) : null}

      </div>

      <style jsx global>{`
        /* suppress browser's default search clear button — we have our own */
        input[type="search"]::-webkit-search-cancel-button { display: none; }
        input[type="search"]::-ms-clear { display: none; }

        @media (max-width: 480px) {
          main {
            padding-left: 14px !important;
            padding-right: 14px !important;
          }
        }
      `}</style>
    </main>
  );
}

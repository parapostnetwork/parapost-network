"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import BackToPrevious from "@/components/BackToPrevious";

type SafetyTopic = "privacy_safety" | "report_problem";

type ProfilePreview = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_private: boolean | null;
};

type AdminUserRow = {
  user_id: string;
  role: string;
};

const safetyTopics: Array<{ value: SafetyTopic; label: string; helper: string }> = [
  {
    value: "privacy_safety",
    label: "Privacy or Safety Concern",
    helper:
      "Use this for harassment, unwanted contact, blocked-user questions, profile privacy, or safety concerns.",
  },
  {
    value: "report_problem",
    label: "Report Content or User",
    helper:
      "Use this when a profile, post, comment, Reel, message, or Showcase should be reviewed by support.",
  },
];

const primarySafetyActions = [
  {
    title: "Profile Visibility",
    description:
      "Choose whether your profile content is public or protected while keeping your basic profile shell visible.",
    href: "/settings/profile-visibility",
    status: "Privacy control",
    items: ["Public profile", "Private profile", "Protected content"],
  },
  {
    title: "Blocked Users",
    description:
      "Review blocked accounts and unblock people later if you choose to.",
    href: "/settings/blocked-users",
    status: "Safety control",
    items: ["Blocked list", "Unblock users", "Reduce unwanted contact"],
  },
  {
    title: "Content & Feed",
    description:
      "Manage feed preferences, hidden content, muted words, discovery, and Parapost Reels content controls.",
    href: "/settings/content-feed",
    status: "Content control",
    items: ["Feed preferences", "Hidden posts", "Muted words", "Reels controls"],
  },
  {
    title: "Help & Support",
    description:
      "Contact Parapost Network about privacy concerns, safety issues, reports, account access, or data help.",
    href: "/settings/help-support",
    status: "Support",
    items: ["Contact support", "Report a problem", "Safety help", "Data help"],
  },
];

const trustChecklist = [
  "Private profile controls",
  "Blocked user management",
  "Support and report forms",
  "Content and feed controls",
  "Community guidelines access",
  "Data and account request path",
];

function getInitial(profile: ProfilePreview | null) {
  const value = profile?.full_name || profile?.username || "P";
  return value.charAt(0).toUpperCase();
}

function getDisplayName(profile: ProfilePreview | null) {
  return profile?.full_name || profile?.username || "Parapost Member";
}

function isAdminRole(role: string) {
  return ["owner", "admin", "support", "moderator"].includes(role);
}

function getTopicLabel(topic: SafetyTopic) {
  return safetyTopics.find((item) => item.value === topic)?.label || "Privacy or Safety Concern";
}

export default function PrivacySafetySettingsPage() {
  const [currentProfile, setCurrentProfile] = useState<ProfilePreview | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [adminRole, setAdminRole] = useState("");
  const [pageLoading, setPageLoading] = useState(true);

  const [topic, setTopic] = useState<SafetyTopic>("privacy_safety");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const canSeeAdminSupport = isAdminRole(adminRole);

  const selectedTopicHelper = useMemo(() => {
    return safetyTopics.find((item) => item.value === topic)?.helper || "";
  }, [topic]);

  useEffect(() => {
    let cancelled = false;

    async function loadPageUser() {
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
          .select("id, username, full_name, avatar_url, is_private")
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

  const handleSafetySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const cleanMessage = message.trim();

    setSuccessMessage("");
    setErrorMessage("");

    if (!currentUserId) {
      setErrorMessage("Please sign in before sending a privacy or safety message.");
      return;
    }

    if (cleanMessage.length < 10) {
      setErrorMessage("Please add a little more detail so support can understand the issue.");
      return;
    }

    setSubmitting(true);

    const { error } = await supabase.from("support_messages").insert({
      user_id: currentUserId,
      user_email: userEmail || null,
      user_name: getDisplayName(currentProfile),
      topic,
      message: cleanMessage,
      status: "open",
      priority: topic === "privacy_safety" ? "high" : "normal",
      source: "privacy_safety_settings",
      page_url: typeof window !== "undefined" ? window.location.href : null,
      metadata: {
        topic_label: getTopicLabel(topic),
        submitted_from: "settings_privacy_safety_page",
      },
    });

    setSubmitting(false);

    if (error) {
      setErrorMessage(`Could not send message: ${error.message}`);
      return;
    }

    setSuccessMessage("Message sent. Parapost Network support will review it.");
    setMessage("");
  };

  return (
    <main
      className="privacy-safety-settings-page min-h-[100dvh] touch-pan-y overflow-x-hidden px-3 py-5 pb-[calc(9.5rem+env(safe-area-inset-bottom))] text-white sm:px-6 sm:py-6 lg:min-h-0 lg:px-6"
      style={{
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorY: "auto",
        scrollPaddingTop: 16,
        scrollPaddingBottom: "calc(9.5rem + env(safe-area-inset-bottom))",
      }}
    >
      <style jsx global>{`
        .privacy-safety-settings-page {
          scroll-padding-bottom: calc(9.5rem + env(safe-area-inset-bottom));
        }

        .privacy-safety-back-mobile {
          display: none;
        }

        .privacy-safety-action-card {
          display: flex;
          flex-direction: column;
        }

        @media (max-width: 1024px) {
          .privacy-safety-back-desktop {
            display: none !important;
          }

          .privacy-safety-back-mobile {
            display: block !important;
          }
        }

        @media (max-width: 430px) {
          .privacy-safety-settings-page {
            padding-top: max(14px, env(safe-area-inset-top)) !important;
            padding-left: 12px !important;
            padding-right: 12px !important;
          }

          .privacy-safety-back-row {
            align-items: flex-start !important;
          }

          .privacy-safety-settings-page h1 {
            font-size: clamp(2.2rem, 11vw, 3.35rem) !important;
            line-height: 0.96 !important;
          }
        }

        @media (min-width: 768px) and (max-width: 1180px) {
          .privacy-safety-settings-page {
            padding-left: 20px !important;
            padding-right: 20px !important;
            padding-bottom: calc(8rem + env(safe-area-inset-bottom)) !important;
          }

          .privacy-safety-hero-grid {
            grid-template-columns: minmax(0, 1fr) 320px !important;
            align-items: stretch !important;
          }

          .privacy-safety-hero-grid > * {
            height: 100% !important;
          }

          .privacy-safety-content-grid {
            grid-template-columns: minmax(0, 1fr) 320px !important;
            align-items: start !important;
          }

          .privacy-safety-action-grid {
            display: grid !important;
            grid-auto-rows: 1fr !important;
            gap: 16px !important;
          }

          .privacy-safety-settings-page h1 + p {
            margin-top: 24px !important;
          }
        }

        @media (max-height: 720px) and (max-width: 980px) {
          .privacy-safety-settings-page {
            padding-top: max(12px, env(safe-area-inset-top)) !important;
            padding-bottom: calc(7rem + env(safe-area-inset-bottom)) !important;
          }
        }
      `}</style>

      <div className="relative z-10 mx-auto w-full max-w-4xl">
        <div className="privacy-safety-back-row mb-5 flex items-center justify-between gap-3">
          <div className="privacy-safety-back-desktop">
            <BackToPrevious label="Back to Settings" fallbackHref="/settings" />
          </div>

          <div className="privacy-safety-back-mobile">
            <BackToPrevious
              label="Back to Settings"
              fallbackHref="/dashboard?menu=settings"
              alwaysUseFallback
            />
          </div>

          <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Privacy & Safety
          </span>
        </div>

        <section className="privacy-safety-hero-grid mb-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
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
              Privacy & Safety Center
            </p>

            <h1 className="max-w-3xl text-[clamp(2.15rem,9vw,3.75rem)] font-black leading-[0.95] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
              Protect your profile, privacy, and community experience.
            </h1>

            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Manage privacy controls, blocked users, reporting, content preferences, community guidelines,
              and support requests from one focused safety area.
            </p>

            <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap">
              <a
                href="#safety-contact"
                className="inline-flex w-full justify-center rounded-full px-5 py-3 text-center text-sm font-black no-underline shadow-lg transition hover:brightness-110 sm:w-auto"
                style={{
                  background:
                    "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
                  color: "var(--parapost-accent-button-text)",
                  boxShadow: "0 12px 26px var(--parapost-accent-glow)",
                }}
              >
                Send Safety Message
              </a>

              <Link
                href="/settings/profile-visibility"
                className="inline-flex w-full justify-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-center text-sm font-black text-white no-underline hover:bg-white/10 sm:w-auto"
              >
                Profile Visibility
              </Link>

              <Link
                href="/settings/blocked-users"
                className="inline-flex w-full justify-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-center text-sm font-black text-white no-underline hover:bg-white/10 sm:w-auto"
              >
                Blocked Users
              </Link>

              <Link
                href="/settings/content-feed"
                className="inline-flex w-full justify-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-center text-sm font-black text-white no-underline hover:bg-white/10 sm:w-auto"
              >
                Content & Feed
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

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-purple-200">
                Profile Visibility
              </div>
              <div className="mt-2 text-2xl font-black">
                {pageLoading ? "Checking..." : currentProfile?.is_private ? "Private" : "Public"}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Private profiles can protect profile content from people who are not connected to you.
              </p>
            </div>

            {!pageLoading && !currentUserId ? (
              <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                Sign in is required to send support messages and manage privacy controls.
              </div>
            ) : null}
          </aside>
        </section>

        <section className="privacy-safety-content-grid grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-4">
            <section id="safety-contact" className="scroll-mt-24 rounded-[24px] border border-purple-200/15 bg-white/[0.055] p-4 shadow-2xl sm:rounded-[28px] sm:p-6">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-purple-200">
                    Support & Reporting
                  </p>
                  <h2 className="text-2xl font-black tracking-[-0.03em]">Send a privacy or safety message</h2>
                </div>

                <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-black text-emerald-200">
                  Available
                </span>
              </div>

              <p className="mb-5 text-sm leading-7 text-slate-300">
                Use this form for privacy concerns, safety issues, harassment, unwanted contact, reporting content,
                reporting users, or anything that should be reviewed by Parapost Network support.
              </p>

              <form onSubmit={handleSafetySubmit} className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-100">Issue Type</span>
                  <select
                    value={topic}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setTopic(event.target.value as SafetyTopic)
                    }
                    className="w-full rounded-2xl border border-purple-200/15 bg-black/35 px-4 py-3 text-white outline-none focus:border-purple-300/50"
                  >
                    {safetyTopics.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <p className="rounded-2xl border border-purple-200/15 bg-white/[0.035] px-4 py-3 text-sm text-slate-300">
                  {selectedTopicHelper}
                </p>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-100">Message</span>
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Describe the privacy or safety issue..."
                    rows={7}
                    maxLength={5000}
                    className="min-h-[170px] w-full resize-y rounded-2xl border border-purple-200/15 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-purple-300/50"
                  />
                </label>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-bold text-slate-500">{message.trim().length}/5000</span>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-2xl bg-white px-5 py-3 text-sm font-black text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {submitting ? "Sending..." : "Send to Support"}
                  </button>
                </div>

                {successMessage ? (
                  <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">
                    {successMessage}
                  </div>
                ) : null}

                {errorMessage ? (
                  <div className="rounded-2xl border border-red-300/25 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                    {errorMessage}
                  </div>
                ) : null}
              </form>
            </section>

            <section className="rounded-[24px] border border-purple-200/15 bg-white/[0.055] p-4 shadow-2xl sm:rounded-[28px] sm:p-6">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-purple-200">
                Privacy Tools
              </p>
              <h2 className="text-2xl font-black tracking-[-0.03em]">Core protections</h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                Parapost Network gives users clear ways to control privacy, contact support, report issues,
                request account or data help, and understand community rules.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {trustChecklist.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-purple-200/15 bg-black/25 px-4 py-3 text-sm font-bold text-slate-200"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="privacy-safety-action-grid space-y-4">
            {primarySafetyActions.map((card) => (
              <Link key={card.title} href={card.href} className="privacy-safety-action-link block h-full text-white no-underline">
                <section className="privacy-safety-action-card h-full rounded-[22px] border border-purple-200/15 bg-white/[0.045] p-4 shadow-xl transition hover:bg-white/[0.065] sm:rounded-[26px] sm:p-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-purple-200">
                      {card.status}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-black text-slate-300">
                      Open
                    </span>
                  </div>

                  <h3 className="text-lg font-black tracking-[-0.02em]">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{card.description}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {card.items.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-purple-200/15 bg-black/25 px-3 py-1.5 text-xs font-bold text-slate-300"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </section>
              </Link>
            ))}
          </aside>
        </section>
      </div>
    </main>
  );
}

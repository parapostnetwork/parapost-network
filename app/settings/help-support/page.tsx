"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import BackToPrevious from "@/components/BackToPrevious";

type SupportTopic =
  | "account"
  | "privacy_safety"
  | "report_problem"
  | "data_delete_account"
  | "payments"
  | "bug_report"
  | "legal_policy"
  | "other";

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

const SUPPORT_TOPICS: Array<{ value: SupportTopic; label: string; helper: string }> = [
  {
    value: "account",
    label: "Account Help",
    helper: "Login, profile, email, password, account access, or account settings.",
  },
  {
    value: "privacy_safety",
    label: "Privacy & Safety",
    helper: "Blocking, privacy controls, safety concerns, reports, or unwanted contact.",
  },
  {
    value: "report_problem",
    label: "Report a Problem",
    helper: "Something on Parapost Network is not working correctly.",
  },
  {
    value: "data_delete_account",
    label: "Data / Delete Account",
    helper: "Account deletion, data deletion, privacy/data access, or correction help.",
  },
  {
    value: "payments",
    label: "Payments",
    helper: "Future payment questions, promoted posts, sponsorships, billing, or business tools once payments are available.",
  },
  {
    value: "bug_report",
    label: "Bug Report",
    helper: "Technical bug, layout issue, broken button, upload issue, or app problem.",
  },
  {
    value: "legal_policy",
    label: "Legal / Policy",
    helper: "Terms, privacy policy, community guidelines, or content policy questions.",
  },
  {
    value: "other",
    label: "Other",
    helper: "Anything else you want to send to Parapost Network support.",
  },
];

const quickHelpCards = [
  {
    title: "Account & Login",
    description: "Password reset, sign-in access, profile settings, and account status.",
    href: "/settings/account",
  },
  {
    title: "Privacy & Safety",
    description: "Blocked users, reports, safety concerns, profile visibility, and unwanted contact.",
    href: "/settings/privacy-safety",
  },
  {
    title: "Data & Account",
    description: "Data requests, account deletion, data deletion, correction, and access help.",
    href: "/settings/data",
  },
  {
    title: "Legal & Policies",
    description: "Terms, Privacy Policy, Community Guidelines, and Data Deletion Policy.",
    href: "/settings/legal",
  },
  {
    title: "Payments",
    description: "Coming-soon payment, promotion, sponsorship, and business-tool support.",
    href: "/settings/payments",
  },
];

const supportExpectations = [
  "Do not share passwords or sensitive payment details in support messages.",
  "Use the right topic so support can sort messages faster.",
  "Safety, privacy, and data deletion requests are reviewed with higher priority.",
  "Bug reports are easier to review when you include the page and what you clicked.",
];

function getInitial(profile: ProfilePreview | null) {
  const value = profile?.full_name || profile?.username || "P";
  return value.charAt(0).toUpperCase();
}

function getDisplayName(profile: ProfilePreview | null) {
  return profile?.full_name || profile?.username || "Parapost Member";
}

function getTopicLabel(topic: SupportTopic) {
  return SUPPORT_TOPICS.find((item) => item.value === topic)?.label || "Other";
}

function isAdminRole(role: string) {
  return ["owner", "admin", "support", "moderator"].includes(role);
}

export default function HelpSupportSettingsPage() {
  const [currentProfile, setCurrentProfile] = useState<ProfilePreview | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [adminRole, setAdminRole] = useState("");
  const [pageLoading, setPageLoading] = useState(true);

  const [supportTopic, setSupportTopic] = useState<SupportTopic>("account");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [supportStatus, setSupportStatus] = useState("");
  const [supportError, setSupportError] = useState("");

  const displayName = getDisplayName(currentProfile);
  const canSeeAdminSupport = isAdminRole(adminRole);

  const selectedTopicHelper = useMemo(() => {
    return SUPPORT_TOPICS.find((item) => item.value === supportTopic)?.helper || "";
  }, [supportTopic]);

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

  const handleSupportSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const cleanMessage = supportMessage.trim();

    setSupportStatus("");
    setSupportError("");

    if (!currentUserId) {
      setSupportError("Please sign in before sending a message to Parapost Network support.");
      return;
    }

    if (cleanMessage.length < 5) {
      setSupportError("Please add a little more detail before sending your message.");
      return;
    }

    setSupportSubmitting(true);

    const { error } = await supabase.from("support_messages").insert({
      user_id: currentUserId,
      user_email: userEmail || null,
      user_name: displayName,
      topic: supportTopic,
      message: cleanMessage,
      status: "open",
      priority: supportTopic === "privacy_safety" || supportTopic === "data_delete_account" ? "high" : "normal",
      source: "help_support_settings",
      page_url: typeof window !== "undefined" ? window.location.href : null,
      metadata: {
        topic_label: getTopicLabel(supportTopic),
        submitted_from: "settings_help_support_page",
      },
    });

    setSupportSubmitting(false);

    if (error) {
      setSupportError(`Could not send message: ${error.message}`);
      return;
    }

    setSupportStatus("Message sent. Parapost Network support will review it.");
    setSupportMessage("");
  };

  return (
    <main className="help-support-page min-h-[100dvh] overflow-x-hidden px-3 py-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] text-white sm:px-5 sm:py-6 lg:px-6">
      <style jsx global>{`
        .help-support-page {
          scroll-padding-bottom: calc(9rem + env(safe-area-inset-bottom));
        }

        .help-support-back-mobile {
          display: none;
        }

        .help-support-quick-card {
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
        }

        @media (max-width: 1024px) {
          .help-support-back-desktop {
            display: none !important;
          }

          .help-support-back-mobile {
            display: block !important;
          }
        }

        @media (max-width: 430px) {
          .help-support-page {
            padding-left: 12px !important;
            padding-right: 12px !important;
            padding-top: max(14px, env(safe-area-inset-top)) !important;
          }

          .help-support-back-row {
            align-items: flex-start !important;
          }

          .help-support-hero-title {
            font-size: clamp(34px, 11vw, 44px) !important;
            line-height: 0.98 !important;
            letter-spacing: -0.05em !important;
          }
        }

        @media (min-width: 768px) and (max-width: 1180px) {
          .help-support-page {
            padding-left: 20px !important;
            padding-right: 20px !important;
            padding-bottom: calc(8rem + env(safe-area-inset-bottom)) !important;
          }

          .help-support-content-grid {
            grid-template-columns: minmax(0, 1fr) 320px !important;
            align-items: start !important;
          }

          .help-support-quick-links {
            display: grid !important;
            grid-auto-rows: 1fr !important;
            gap: 16px !important;
          }

          .help-support-safety > div {
            gap: 14px !important;
          }
        }

        @media (max-height: 720px) and (max-width: 980px) {
          .help-support-page {
            padding-top: max(12px, env(safe-area-inset-top)) !important;
            padding-bottom: calc(7rem + env(safe-area-inset-bottom)) !important;
          }
        }
      `}</style>
      <div className="relative z-10 mx-auto w-full max-w-4xl">
        <div className="help-support-back-row mb-5 flex items-center justify-between gap-3">
          <div className="help-support-back-desktop">
            <BackToPrevious label="Back" fallbackHref="/settings" />
          </div>

          <div className="help-support-back-mobile">
            <BackToPrevious
              label="Back to Help & Legal"
              fallbackHref="/dashboard?menu=settings-help"
              alwaysUseFallback
            />
          </div>

          <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Help & Support
          </span>
        </div>

        <section className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div
            className="rounded-[26px] border p-4 shadow-2xl ring-1 ring-white/[0.035] sm:rounded-[30px] sm:p-7"
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
              Help & Support
            </p>

            <h1 className="help-support-hero-title max-w-3xl text-3xl font-black leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
              Get help with your Parapost Network account.
            </h1>

            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Contact Parapost Network support for account help, privacy and safety concerns, data and deletion
              requests, bug reports, policy questions, payment questions, and other platform issues.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a
                href="#support-form"
                className="inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-black no-underline shadow-lg transition hover:brightness-110 sm:w-auto"
                style={{
                  background:
                    "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
                  color: "var(--parapost-accent-button-text)",
                  boxShadow: "0 12px 26px var(--parapost-accent-glow)",
                }}
              >
                Contact Support
              </a>

              <Link
                href="/settings/account"
                className="inline-flex w-full items-center justify-center rounded-full border px-5 py-3 text-sm font-black text-white no-underline shadow-lg transition hover:bg-white/10 sm:w-auto"
                style={{ borderColor: "var(--parapost-accent-border)", background: "rgba(255,255,255,0.055)" }}
              >
                Account & Security
              </Link>

              {canSeeAdminSupport ? (
                <Link
                  href="/admin/support"
                  className="inline-flex w-full items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-400/10 px-5 py-3 text-sm font-black text-emerald-100 no-underline hover:bg-emerald-400/15 sm:w-auto"
                >
                  Support Inbox
                </Link>
              ) : null}
            </div>
          </div>

          <aside
            className="rounded-[26px] border p-4 shadow-2xl ring-1 ring-white/[0.035] sm:rounded-[30px] sm:p-5"
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
                  {pageLoading ? "Loading..." : displayName}
                </div>
                <div className="truncate text-sm text-slate-400">{userEmail || "Signed out"}</div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 shadow-inner shadow-black/20">
              <div
                className="text-xs font-black uppercase tracking-[0.14em]"
                style={{ color: "var(--parapost-accent-text)" }}
              >
                Support Access
              </div>
              <div className="mt-2 text-2xl font-black">{currentUserId ? "Signed in" : "Signed out"}</div>
              <p className="mt-2 text-sm leading-6 text-slate-400 break-words">
                Signed-in users can send support messages directly from this secure support form.
              </p>
            </div>
          </aside>
        </section>

        <section className="help-support-content-grid grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-4 min-w-0">
            <section
              id="support-form"
              className="scroll-mt-24 rounded-[24px] border p-4 shadow-2xl ring-1 ring-white/[0.035] sm:rounded-[28px] sm:p-6"
              style={{
                borderColor: "var(--parapost-accent-border)",
                background:
                  "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.055), rgba(15,23,42,0.55))",
              }}
            >
              <div className="mb-4 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <p
                    className="mb-2 text-xs font-black uppercase tracking-[0.18em]"
                    style={{ color: "var(--parapost-accent-text)" }}
                  >
                    Contact Form
                  </p>
                  <h2 className="text-2xl font-black tracking-[-0.03em]">Send a support message</h2>
                </div>

                <span
                  className="rounded-full border px-3 py-1.5 text-xs font-black"
                  style={{
                    borderColor: "var(--parapost-accent-border)",
                    background: "var(--parapost-accent-muted-bg)",
                    color: "var(--parapost-accent-readable-text)",
                  }}
                >
                  Active
                </span>
              </div>

              <form onSubmit={handleSupportSubmit} className="space-y-4 min-w-0">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-100">Topic</span>
                  <select
                    value={supportTopic}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setSupportTopic(event.target.value as SupportTopic)
                    }
                    className="w-full rounded-2xl border bg-black/35 px-4 py-3 text-white outline-none"
                    style={{ borderColor: "var(--parapost-accent-border)" }}
                  >
                    {SUPPORT_TOPICS.map((topic) => (
                      <option key={topic.value} value={topic.value}>
                        {topic.label}
                      </option>
                    ))}
                  </select>
                </label>

                <p className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-slate-300">
                  {selectedTopicHelper}
                </p>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-100">Message</span>
                  <textarea
                    value={supportMessage}
                    onChange={(event) => setSupportMessage(event.target.value)}
                    placeholder="Tell us what you need help with..."
                    rows={8}
                    maxLength={5000}
                    className="min-h-[190px] w-full resize-y rounded-2xl border bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35"
                    style={{ borderColor: "var(--parapost-accent-border)" }}
                  />
                </label>

                <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                  <span className="text-xs font-bold text-slate-500">{supportMessage.trim().length}/5000</span>

                  <button
                    type="submit"
                    disabled={supportSubmitting}
                    className="w-full rounded-2xl px-5 py-3 text-sm font-black shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
                      color: "var(--parapost-accent-button-text)",
                      boxShadow: "0 12px 26px var(--parapost-accent-glow)",
                    }}
                  >
                    {supportSubmitting ? "Sending..." : "Send Message"}
                  </button>
                </div>

                {supportStatus ? (
                  <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">
                    {supportStatus}
                  </div>
                ) : null}

                {supportError ? (
                  <div className="rounded-2xl border border-red-300/25 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                    {supportError}
                  </div>
                ) : null}
              </form>
            </section>

            <section className="help-support-safety rounded-[28px] border border-amber-300/20 bg-amber-400/10 p-5 shadow-2xl shadow-amber-950/10 sm:p-6">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-amber-100">
                Support Safety
              </p>
              <h2 className="text-2xl font-black tracking-[-0.03em] text-white">
                Keep support messages safe and useful.
              </h2>

              <div className="mt-5 grid gap-3">
                {supportExpectations.map((note) => (
                  <div key={note} className="rounded-2xl border border-amber-200/20 bg-black/20 p-4 text-sm font-bold leading-6 text-amber-50/85">
                    {note}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="help-support-quick-links min-w-0 space-y-4">
            {canSeeAdminSupport ? (
              <Link href="/admin/support" className="block text-white no-underline">
                <section className="rounded-[26px] border border-emerald-300/20 bg-emerald-400/10 p-5 shadow-xl transition hover:bg-emerald-400/15">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-100">
                      Admin
                    </span>
                    <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-black text-emerald-100">
                      {adminRole}
                    </span>
                  </div>

                  <h3 className="text-lg font-black tracking-[-0.02em] break-words">Support Inbox</h3>
                  <p className="mt-2 text-sm leading-6 text-emerald-100/80 break-words">
                    Review support messages, data requests, privacy/safety issues, bug reports, and payment questions.
                  </p>
                </section>
              </Link>
            ) : null}

            {quickHelpCards.map((card) => (
              <Link key={card.title} href={card.href} className="block text-white no-underline">
                <section
                  className="help-support-quick-card h-full rounded-[24px] border p-4 shadow-xl transition hover:bg-white/[0.06] sm:rounded-[26px] sm:p-5"
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
                      Help
                    </span>
                    <span
                      className="rounded-full border px-2.5 py-1 text-[11px] font-black text-slate-300"
                      style={{ borderColor: "var(--parapost-accent-border)", background: "var(--parapost-accent-muted-bg)" }}
                    >
                      Open
                    </span>
                  </div>

                  <h3 className="text-lg font-black tracking-[-0.02em] break-words">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400 break-words">{card.description}</p>
                </section>
              </Link>
            ))}
          </aside>
        </section>
      </div>
    </main>
  );
}

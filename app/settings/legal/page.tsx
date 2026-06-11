"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

type LegalSection = {
  eyebrow: string;
  title: string;
  description: string;
  items: string[];
  href?: string;
  status: "Available" | "Coming soon";
};

const legalSections: LegalSection[] = [
  {
    eyebrow: "Core Policy",
    title: "Terms of Service",
    description:
      "Review the rules for using Parapost Network, including account responsibilities, user content, acceptable use, moderation, suspensions, and account termination.",
    items: [
      "Account eligibility",
      "User content",
      "Acceptable use",
      "Platform rules",
      "Moderation",
      "Account termination",
    ],
    href: "/settings/legal/terms",
    status: "Available",
  },
  {
    eyebrow: "Core Policy",
    title: "Privacy Policy",
    description:
      "Learn what information Parapost Network collects, why it is used, how it is protected, and how users can submit privacy and data requests.",
    items: [
      "Account data",
      "Profile data",
      "Posts and media",
      "Parachat",
      "Safety records",
      "Data requests",
    ],
    href: "/settings/legal/privacy",
    status: "Available",
  },
  {
    eyebrow: "Community Policy",
    title: "Community Guidelines",
    description:
      "Understand the behavior and content standards that help keep Parapost Network respectful, safe, useful, and welcoming for the community.",
    items: [
      "Respectful conduct",
      "No harassment",
      "No scams",
      "No harmful abuse",
      "Reporting",
      "Moderation review",
    ],
    href: "/settings/legal/community-guidelines",
    status: "Available",
  },
  {
    eyebrow: "Privacy Policy",
    title: "Data Deletion Policy",
    description:
      "Learn how to request account or data deletion, what information may be removed, and when limited information may need to be retained.",
    items: [
      "Account deletion",
      "Data deletion",
      "Request review",
      "Support follow-up",
      "Safety records",
      "Confirmation process",
    ],
    href: "/settings/legal/data-deletion",
    status: "Available",
  },
  {
    eyebrow: "Safety Policy",
    title: "Safety & Reporting Policy",
    description:
      "Learn how to report safety concerns, inappropriate content, suspicious activity, and possible Community Guidelines violations.",
    items: [
      "Safety reports",
      "User reports",
      "Content reports",
      "Blocking",
      "Moderation response",
      "Appeals",
    ],
    href: "/settings/legal/safety-reporting",
    status: "Available",
  },
  {
    eyebrow: "Privacy Policy",
    title: "Cookie Policy",
    description:
      "Learn how cookies and similar technologies may be used to support login sessions, security, preferences, and platform performance.",
    items: [
      "Login sessions",
      "Security",
      "Preferences",
      "Essential cookies",
      "Performance",
      "Future updates",
    ],
    href: "/settings/legal/cookies",
    status: "Available",
  },
  {
    eyebrow: "Content Policy",
    title: "Copyright & Intellectual Property",
    description:
      "Learn the rules for uploading content, respecting ownership rights, reporting possible copyright violations, and protecting Parapost Network branding.",
    items: [
      "User uploads",
      "Ownership rights",
      "Copyright reports",
      "Permission to share",
      "Platform branding",
      "Review process",
    ],
    href: "/settings/legal/copyright",
    status: "Coming soon",
  },
];

const trustCards = [
  {
    title: "Help & Support",
    description:
      "Contact Parapost Network through the in-app support area for account questions, technical help, or general assistance.",
    href: "/settings/help-support",
  },
  {
    title: "Privacy & Safety",
    description:
      "Submit privacy concerns, safety issues, reports, and moderation questions through the Privacy & Safety area.",
    href: "/settings/privacy-safety",
  },
  {
    title: "Data & Account",
    description:
      "Submit account deletion, data deletion, correction, access, and privacy-related requests through Data & Account.",
    href: "/settings/data",
  },
  {
    title: "Profile Visibility",
    description:
      "Manage whether profile content is public or private through the Profile Visibility area.",
    href: "/settings/profile-visibility",
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

export default function LegalSettingsPage() {
  const [currentProfile, setCurrentProfile] =
    useState<ProfilePreview | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [adminRole, setAdminRole] = useState("");
  const [pageLoading, setPageLoading] = useState(true);

  const canSeeAdminSupport = isAdminRole(adminRole);

  useEffect(() => {
    let cancelled = false;

    async function loadPageUser() {
      setPageLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        setCurrentProfile(null);
        setUserEmail("");
        setAdminRole("");
        setPageLoading(false);
        return;
      }

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

      setAdminRole(
        adminRow?.role && isAdminRole(adminRow.role) ? adminRow.role : ""
      );

      setPageLoading(false);
    }

    void loadPageUser();

    return () => {
      cancelled = true;
    };
  }, []);

  const publishedPolicyCount = legalSections.filter(
    (section) => section.status === "Available"
  ).length;

  return (
    <main className="legal-settings-page px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] text-white sm:px-6 lg:px-6">
      <style jsx global>{`
        .legal-settings-page {
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-y: contain;
          scroll-padding-bottom: calc(9rem + env(safe-area-inset-bottom));
        }

        .legal-settings-page a,
        .legal-settings-page button {
          touch-action: manipulation;
        }

        @media (max-width: 430px) {
          .legal-settings-page {
            padding-left: 12px !important;
            padding-right: 12px !important;
            padding-top: max(14px, env(safe-area-inset-top)) !important;
            padding-bottom: calc(
              8.5rem + env(safe-area-inset-bottom)
            ) !important;
          }

          .legal-settings-inner {
            max-width: 100% !important;
          }

          .legal-settings-topbar {
            align-items: flex-start !important;
          }

          .legal-settings-card,
          .legal-settings-side-card,
          .legal-settings-policy-shell {
            border-radius: 22px !important;
            padding: 16px !important;
          }

          .legal-settings-hero-title {
            font-size: clamp(34px, 12vw, 44px) !important;
            line-height: 0.98 !important;
            letter-spacing: -0.05em !important;
          }

          .legal-settings-actions {
            display: grid !important;
            grid-template-columns: 1fr !important;
            width: 100% !important;
          }

          .legal-settings-actions a {
            width: 100% !important;
            justify-content: center !important;
            text-align: center !important;
          }

          .legal-policy-pill-row {
            gap: 7px !important;
          }

          .legal-policy-pill-row span {
            font-size: 11px !important;
            padding: 6px 9px !important;
          }

          .legal-settings-profile-card .legal-profile-row {
            align-items: flex-start !important;
          }

          .legal-trust-link section {
            border-radius: 22px !important;
            padding: 16px !important;
          }
        }

        @media (max-width: 767px) {
          .legal-settings-topbar {
            flex-direction: column !important;
            align-items: flex-start !important;
          }

          .legal-settings-status-pill {
            max-width: 100% !important;
            white-space: normal !important;
            text-align: center !important;
          }

          .legal-settings-hero,
          .legal-settings-content-grid {
            grid-template-columns: 1fr !important;
          }

          .legal-settings-policy-card {
            border-radius: 22px !important;
            padding: 16px !important;
          }
        }

        @media (min-width: 768px) and (max-width: 1120px) {
          .legal-settings-page {
            padding-left: 20px !important;
            padding-right: 20px !important;
            padding-bottom: calc(
              8rem + env(safe-area-inset-bottom)
            ) !important;
          }

          .legal-settings-inner {
            max-width: 900px !important;
          }

          .legal-settings-hero,
          .legal-settings-content-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (min-width: 1121px) and (max-width: 1366px) {
          .legal-settings-inner {
            max-width: 1100px !important;
          }

          .legal-settings-hero {
            grid-template-columns: minmax(0, 1fr) 310px !important;
          }

          .legal-settings-content-grid {
            grid-template-columns: minmax(0, 1fr) 340px !important;
          }
        }

        @media (max-height: 720px) and (max-width: 980px) {
          .legal-settings-page {
            padding-top: max(12px, env(safe-area-inset-top)) !important;
            padding-bottom: calc(
              7.5rem + env(safe-area-inset-bottom)
            ) !important;
          }

          .legal-settings-card,
          .legal-settings-side-card,
          .legal-settings-policy-shell {
            padding: 15px !important;
          }
        }
      `}</style>

      <div className="legal-settings-inner relative z-10 mx-auto w-full max-w-4xl">
        <div className="legal-settings-topbar mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <BackToPrevious label={"\u2190 Back"} fallbackHref="/settings/help-support" />
            <span className="text-slate-700 select-none">/</span>
            <Link href="/settings" className="truncate text-xs font-bold text-slate-500 no-underline transition hover:text-white">Settings</Link>
          </div>
          <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Legal & Policies
          </span>
        </div>

        <section className="legal-settings-hero mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div
            className="legal-settings-card rounded-[30px] border p-5 shadow-2xl ring-1 ring-white/[0.035] sm:p-7"
            style={{
              borderColor: "var(--parapost-accent-border)",
              background:
                "linear-gradient(135deg, var(--parapost-accent-soft), rgba(255,255,255,0.06), rgba(15,23,42,0.70))",
              boxShadow:
                "0 24px 70px rgba(0,0,0,0.38), 0 0 38px var(--parapost-accent-glow)",
            }}
          >
            <p
              className="mb-3 text-xs font-black uppercase tracking-[0.18em]"
              style={{ color: "var(--parapost-accent-text)" }}
            >
              Legal & Policies
            </p>

            <h1 className="legal-settings-hero-title max-w-3xl text-4xl font-black leading-[0.95] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
              Review Parapost Network policies, privacy, and community rules.
            </h1>

            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              This Policy Center keeps Parapost Network terms, privacy
              information, community rules, safety guidance, and data-request
              options organized in one place.
            </p>

            <div className="legal-settings-actions mt-6 flex flex-wrap gap-3">
              <a
                href="#policy-areas"
                className="rounded-full px-5 py-3 text-sm font-black no-underline shadow-lg transition hover:brightness-110"
                style={{
                  background:
                    "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
                  color: "var(--parapost-accent-button-text)",
                  boxShadow: "0 12px 26px var(--parapost-accent-glow)",
                }}
              >
                View Policies
              </a>

              <Link
                href="/settings/help-support"
                className="rounded-full border px-5 py-3 text-sm font-black text-white no-underline shadow-lg transition hover:bg-white/10"
                style={{
                  borderColor: "var(--parapost-accent-border)",
                  background: "rgba(255,255,255,0.055)",
                }}
              >
                Help & Support
              </Link>

              <Link
                href="/settings/data"
                className="rounded-full border px-5 py-3 text-sm font-black text-white no-underline shadow-lg transition hover:bg-white/10"
                style={{
                  borderColor: "var(--parapost-accent-border)",
                  background: "rgba(255,255,255,0.055)",
                }}
              >
                Data Requests
              </Link>

              {canSeeAdminSupport ? (
                <Link
                  href="/admin/support"
                  className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-5 py-3 text-sm font-black text-emerald-100 no-underline transition hover:bg-emerald-400/15"
                >
                  Support Inbox
                </Link>
              ) : null}
            </div>
          </div>

          <aside
            className="legal-settings-side-card legal-settings-profile-card rounded-[30px] border p-5 shadow-2xl ring-1 ring-white/[0.035]"
            style={{
              borderColor: "var(--parapost-accent-border)",
              background:
                "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.055), rgba(15,23,42,0.56))",
              boxShadow: "0 24px 70px rgba(0,0,0,0.30)",
            }}
          >
            <div className="legal-profile-row flex items-center gap-4">
              <div
                className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full text-2xl font-black ring-1 ring-white/15"
                style={{
                  background:
                    "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
                }}
              >
                {currentProfile?.avatar_url ? (
                  <img
                    src={currentProfile.avatar_url}
                    alt=""
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

                <div className="truncate text-sm text-slate-400">
                  {userEmail || "Signed out"}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-purple-200/15 bg-black/30 p-4 shadow-inner shadow-purple-950/10">
              <div
                className="text-xs font-black uppercase tracking-[0.14em]"
                style={{ color: "var(--parapost-accent-text)" }}
              >
                Policy Center
              </div>

              <div className="mt-2 text-2xl font-black">User Trust</div>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                Parapost Network provides clear rules, safety tools, privacy
                information, and support paths for the community.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-black text-emerald-100">
                  {publishedPolicyCount} Published
                </span>

                <span className="rounded-full border border-purple-200/15 bg-purple-400/10 px-3 py-1.5 text-xs font-black text-slate-300">
                  {legalSections.length} Total Policies
                </span>
              </div>
            </div>
          </aside>
        </section>

        <section className="legal-settings-content-grid grid gap-4 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-4">
            <section
              id="policy-areas"
              className="legal-settings-policy-shell rounded-[28px] border p-5 shadow-2xl ring-1 ring-white/[0.035] sm:p-6"
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
                    Policy Areas
                  </p>

                  <h2 className="text-2xl font-black tracking-[-0.03em]">
                    Policy overview
                  </h2>
                </div>

                <span className="rounded-full border border-purple-200/15 bg-purple-400/10 px-3 py-1.5 text-xs font-black text-slate-200">
                  {publishedPolicyCount} of {legalSections.length} available
                </span>
              </div>

              <div className="grid gap-4">
                {legalSections.map((section) => {
                  const isAvailable =
                    section.status === "Available" && Boolean(section.href);

                  const card = (
                    <article
                      className={`legal-settings-policy-card rounded-[26px] border bg-black/25 p-5 transition ${
                        isAvailable
                          ? "hover:-translate-y-0.5 hover:bg-white/[0.06]"
                          : "opacity-85"
                      }`}
                      style={{
                        borderColor: "var(--parapost-accent-border)",
                      }}
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <span
                          className="text-[11px] font-black uppercase tracking-[0.16em]"
                          style={{ color: "var(--parapost-accent-text)" }}
                        >
                          {section.eyebrow}
                        </span>

                        <span
                          className={
                            isAvailable
                              ? "rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-black text-emerald-100"
                              : "rounded-full border border-purple-200/15 bg-purple-400/10 px-2.5 py-1 text-[11px] font-black text-slate-300"
                          }
                        >
                          {isAvailable ? "Open \u2192" : "Coming soon"}
                        </span>
                      </div>

                      <h3 className="text-xl font-black tracking-[-0.02em]">
                        {section.title}
                      </h3>

                      <p className="mt-3 text-sm leading-7 text-slate-400">
                        {section.description}
                      </p>

                      <div className="legal-policy-pill-row mt-4 flex flex-wrap gap-2">
                        {section.items.map((item) => (
                          <span
                            key={item}
                            className="rounded-full border border-purple-200/15 bg-black/30 px-3 py-1.5 text-xs font-bold text-slate-300"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </article>
                  );

                  return isAvailable && section.href ? (
                    <Link
                      key={section.title}
                      href={section.href}
                      className="block text-white no-underline"
                      aria-label={`Open ${section.title}`}
                    >
                      {card}
                    </Link>
                  ) : (
                    <div key={section.title}>{card}</div>
                  );
                })}
              </div>
            </section>

            <section
              className="rounded-[28px] border p-5 shadow-2xl ring-1 ring-white/[0.035] sm:p-6"
              style={{
                borderColor: "var(--parapost-accent-border)",
                background:
                  "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.055), rgba(15,23,42,0.55))",
              }}
            >
              <p
                className="mb-2 text-xs font-black uppercase tracking-[0.18em]"
                style={{ color: "var(--parapost-accent-text)" }}
              >
                User Rights & Safety
              </p>

              <h2 className="text-2xl font-black tracking-[-0.03em]">
                Clear user controls matter.
              </h2>

              <p className="mt-4 text-sm leading-7 text-slate-300">
                Parapost Network gives users clear places to contact support,
                report concerns, manage privacy, request account or data
                deletion, and review platform rules.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  "Support contact flow",
                  "Privacy and safety reporting",
                  "Account deletion request",
                  "Data deletion request",
                  "Community rules",
                  "Policy review",
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
            {trustCards.map((card) => (
              <Link
                key={card.title}
                href={card.href}
                className="legal-trust-link block text-white no-underline"
              >
                <section
                  className="rounded-[26px] border p-5 shadow-xl transition hover:-translate-y-0.5 hover:bg-white/[0.06]"
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

                    <span className="rounded-full border border-purple-200/15 bg-purple-400/10 px-2.5 py-1 text-[11px] font-black text-slate-300">
                      {"Open \u2192"}
                    </span>
                  </div>

                  <h3 className="text-lg font-black tracking-[-0.02em]">
                    {card.title}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {card.description}
                  </p>
                </section>
              </Link>
            ))}
          </aside>
        </section>
      </div>
    </main>
  );
}

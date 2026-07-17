"use client";

import { useEffect, useState } from "react";
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

const paymentAreas = [
  {
    title: "Promoted Posts",
    status: "Coming soon",
    description:
      "Tools for boosting selected posts so creators, teams, and businesses can reach more people on Parapost Network once payments are active.",
    items: ["Boosted reach", "Campaign controls", "Post review", "Performance tracking"],
  },
  {
    title: "Sponsored Posts",
    status: "Coming soon",
    description:
      "Sponsored placements that can appear naturally inside the dashboard timeline and other approved areas once ads are active.",
    items: ["Timeline placement", "Sponsor labels", "Approval flow", "Audience controls"],
  },
  {
    title: "Business & Creator Tools",
    status: "Planned",
    description:
      "Business-ready tools for creators, paranormal teams, brands, sponsors, and event organizers.",
    items: ["Creator packages", "Sponsor options", "Event promotion", "Business profiles"],
  },
  {
    title: "Billing History",
    status: "Coming soon",
    description:
      "An area where users will be able to review invoices, receipts, payments, and promotion history once payments are live.",
    items: ["Receipts", "Invoices", "Payment status", "Refund support"],
  },
];

const safetyNotes = [
  "No payments are being collected from this page.",
  "Payment tools will stay disabled until they are fully tested.",
  "Promoted content will be clearly labeled.",
  "Billing, refunds, and sponsor support will connect to Parapost support.",
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

export default function PaymentsSettingsPage() {
  const [currentProfile, setCurrentProfile] = useState<ProfilePreview | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [adminRole, setAdminRole] = useState("");
  const [pageLoading, setPageLoading] = useState(true);

  const canSeeAdminSupport = isAdminRole(adminRole);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
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
      setAdminRole(adminRow?.role && isAdminRole(adminRow.role) ? adminRow.role : "");
      setPageLoading(false);
    }

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="payments-page-root min-h-[100dvh] overflow-x-hidden px-3 py-4 pb-[calc(8rem+env(safe-area-inset-bottom))] text-white sm:px-5 sm:py-6 lg:px-6">
      <style jsx global>{`
        .payments-page-root{
          min-height:100dvh;
          overflow-x:hidden;
          -webkit-overflow-scrolling:touch;
          scrollbar-gutter:stable;
        }

        .payments-page-root,
        .payments-page-root * {
          box-sizing: border-box;
        }

        .payments-page-inner {
          width: min(100%, 1180px);
        }

        .payments-back-mobile {
          display: none;
        }

        @media (max-width: 1024px) {
          .payments-back-desktop {
            display: none !important;
          }

          .payments-back-mobile {
            display: block !important;
          }
        }

        .payments-hero-card,
        .payments-user-card,
        .payments-main-card,
        .payments-safety-card,
        .payments-side-card {
          min-width: 0;
        }

        .payments-hero-actions > a,
        .payments-hero-actions > span {
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-align: center;
        }

        @media (max-width: 430px) {
          .payments-page-root {
            padding-left: 12px !important;
            padding-right: 12px !important;
            padding-top: max(14px, env(safe-area-inset-top)) !important;
          }

          .payments-back-row {
            align-items: flex-start !important;
          }

          .payments-page-pill {
            width: 100% !important;
            justify-content: center !important;
            text-align: center !important;
            letter-spacing: 0.12em !important;
          }

          .payments-hero-card,
          .payments-user-card,
          .payments-main-card,
          .payments-safety-card,
          .payments-side-card {
            border-radius: 24px !important;
            padding: 16px !important;
          }

          .payments-hero-card h1 {
            font-size: clamp(32px, 12vw, 42px) !important;
            line-height: 0.98 !important;
            letter-spacing: -0.05em !important;
          }

          .payments-hero-card p {
            font-size: 14px !important;
            line-height: 1.65 !important;
          }

          .payments-hero-actions {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }

          .payments-hero-actions > a,
          .payments-hero-actions > span {
            width: 100% !important;
            padding-left: 14px !important;
            padding-right: 14px !important;
          }

          .payments-area-grid {
            grid-template-columns: 1fr !important;
          }

          .payments-main-card h2,
          .payments-safety-card h2 {
            font-size: 24px !important;
            line-height: 1.08 !important;
          }

          .payments-user-row {
            align-items: flex-start !important;
          }
        }

        @media (min-width: 431px) and (max-width: 767px) {
          .payments-hero-actions > a,
          .payments-hero-actions > span {
            flex: 1 1 calc(50% - 8px) !important;
          }

          .payments-area-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (min-width: 768px) and (max-width: 1180px) {
          .payments-page-root {
            padding-left: clamp(18px, 3vw, 34px) !important;
            padding-right: clamp(18px, 3vw, 34px) !important;
          }

          .payments-hero-grid,
          .payments-content-grid {
            grid-template-columns: 1fr !important;
          }

          .payments-user-card,
          .payments-side-rail {
            max-width: 760px !important;
            width: 100% !important;
          }

          .payments-area-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (min-width: 1181px) and (max-width: 1366px) {
          .payments-page-inner {
            max-width: 1120px !important;
          }

          .payments-hero-grid {
            grid-template-columns: minmax(0, 1fr) 320px !important;
          }

          .payments-content-grid {
            grid-template-columns: minmax(0, 1fr) 360px !important;
          }
        }

        @media (max-height: 620px) and (max-width: 980px) {
          .payments-page-root {
            padding-top: 12px !important;
            padding-bottom: calc(6.25rem + env(safe-area-inset-bottom)) !important;
          }

          .payments-hero-card,
          .payments-user-card,
          .payments-main-card,
          .payments-safety-card,
          .payments-side-card {
            padding: 14px !important;
          }
        }
      `}</style>

      <div className="payments-page-inner relative z-10 mx-auto w-full max-w-4xl">
        <div className="payments-back-row mb-5 flex items-center justify-between gap-3">
          <div className="payments-back-desktop">
            <BackToPrevious label="Back" fallbackHref="/settings" />
          </div>

          <div className="payments-back-mobile">
            <BackToPrevious
              label="Back to Ads & Sponsors"
              fallbackHref="/dashboard?menu=ads"
              alwaysUseFallback
            />
          </div>

          <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Payments
          </span>
        </div>

        <section className="payments-hero-grid mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div
            className="payments-hero-card rounded-[30px] border p-5 shadow-2xl ring-1 ring-white/[0.035] sm:p-7"
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
              Payments
            </p>

            <h1 className="max-w-3xl text-4xl font-black leading-[0.95] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
              Payments are coming soon.
            </h1>

            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Payments are not live yet on Parapost Network. This page gives users a clear place to understand upcoming promoted posts, sponsored content, creator tools, billing history, and payment support before those features are available.
            </p>

            <div className="payments-hero-actions mt-6 flex flex-wrap gap-3">
              <span
                className="rounded-full px-5 py-3 text-sm font-black shadow-lg"
                style={{
                  background:
                    "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
                  color: "var(--parapost-accent-button-text)",
                  boxShadow: "0 12px 26px var(--parapost-accent-glow)",
                }}
              >
                Coming Soon
              </span>

              <Link
                href="/settings"
                className="rounded-full border px-5 py-3 text-sm font-black text-white no-underline shadow-lg transition hover:bg-white/10"
                style={{ borderColor: "var(--parapost-accent-border)", background: "rgba(255,255,255,0.055)" }}
              >
                Settings Center
              </Link>

              <Link
                href="/settings/help-support"
                className="rounded-full border px-5 py-3 text-sm font-black text-white no-underline shadow-lg transition hover:bg-white/10"
                style={{ borderColor: "var(--parapost-accent-border)", background: "rgba(255,255,255,0.055)" }}
              >
                Help & Support
              </Link>

              {canSeeAdminSupport ? (
                <Link
                  href="/admin/support"
                  className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-5 py-3 text-sm font-black text-emerald-100 no-underline hover:bg-emerald-400/15"
                >
                  Support Inbox
                </Link>
              ) : null}
            </div>
          </div>

          <aside
            className="payments-user-card rounded-[30px] border p-5 shadow-2xl ring-1 ring-white/[0.035]"
            style={{
              borderColor: "var(--parapost-accent-border)",
              background:
                "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.055), rgba(15,23,42,0.56))",
              boxShadow: "0 24px 70px rgba(0,0,0,0.30)",
            }}
          >
            <div className="payments-user-row flex items-center gap-4">
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
                Payment Status
              </div>
              <div className="mt-2 text-2xl font-black">Not live yet</div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Users cannot be charged from this page. Payment tools remain disabled until they are fully tested.
              </p>
            </div>
          </aside>
        </section>

        <section className="payments-content-grid grid gap-4 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="payments-side-rail space-y-4">
            <section
              className="payments-main-card rounded-[28px] border p-5 shadow-2xl ring-1 ring-white/[0.035] sm:p-6"
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
                    Upcoming Payment Areas
                  </p>
                  <h2 className="text-2xl font-black tracking-[-0.03em]">Coming soon / not live yet.</h2>
                </div>

                <span
                  className="rounded-full border px-3 py-1.5 text-xs font-black"
                  style={{
                    borderColor: "var(--parapost-accent-border)",
                    background: "var(--parapost-accent-muted-bg)",
                    color: "var(--parapost-accent-readable-text)",
                  }}
                >
                  Not live yet
                </span>
              </div>

              <div className="payments-area-grid grid gap-3 sm:grid-cols-2">
                {paymentAreas.map((area) => (
                  <article key={area.title} className="rounded-[24px] border border-white/10 bg-black/25 p-4">
                    <span
                      className="rounded-full border px-2.5 py-1 text-[11px] font-black"
                      style={{
                        borderColor: "var(--parapost-accent-border)",
                        background: "var(--parapost-accent-muted-bg)",
                        color: "var(--parapost-accent-readable-text)",
                      }}
                    >
                      {area.status}
                    </span>

                    <h3 className="mt-4 text-lg font-black tracking-[-0.02em]">{area.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{area.description}</p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {area.items.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-bold text-slate-300"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="payments-safety-card rounded-[28px] border border-amber-300/20 bg-amber-400/10 p-5 shadow-2xl shadow-amber-950/10 sm:p-6">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-amber-100">
                Payment Safety
              </p>
              <h2 className="text-2xl font-black tracking-[-0.03em] text-white">
                Payments stay controlled before launch.
              </h2>

              <div className="mt-5 grid gap-3">
                {safetyNotes.map((note) => (
                  <div key={note} className="rounded-2xl border border-amber-200/20 bg-black/20 p-4 text-sm font-bold leading-6 text-amber-50/85">
                    {note}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <Link href="/settings/account" className="block text-white no-underline">
              <section
                className="payments-side-card rounded-[26px] border p-5 shadow-xl transition hover:bg-white/[0.06]"
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

                <h3 className="text-lg font-black tracking-[-0.02em]">Account & Security</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Review account status, reset password, sign out, and open deletion/data request controls.
                </p>
              </section>
            </Link>

            <Link href="/settings/data" className="block text-white no-underline">
              <section
                className="payments-side-card rounded-[26px] border p-5 shadow-xl transition hover:bg-white/[0.06]"
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
                    Support
                  </span>
                  <span
                    className="rounded-full border px-2.5 py-1 text-[11px] font-black text-slate-300"
                    style={{ borderColor: "var(--parapost-accent-border)", background: "var(--parapost-accent-muted-bg)" }}
                  >
                    Open
                  </span>
                </div>

                <h3 className="text-lg font-black tracking-[-0.02em]">Data & Account</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Request data help, account deletion, data deletion, correction, or access support.
                </p>
              </section>
            </Link>

            <Link href="/settings/help-support" className="block text-white no-underline">
              <section
                className="payments-side-card rounded-[26px] border p-5 shadow-xl transition hover:bg-white/[0.06]"
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

                <h3 className="text-lg font-black tracking-[-0.02em]">Help & Support</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Contact Parapost Network support about future payment, sponsorship, promotion, or billing questions.
                </p>
              </section>
            </Link>

            <Link href="/settings" className="block text-white no-underline">
              <section
                className="payments-side-card rounded-[26px] border p-5 shadow-xl transition hover:bg-white/[0.06]"
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
                    Settings
                  </span>
                  <span
                    className="rounded-full border px-2.5 py-1 text-[11px] font-black text-slate-300"
                    style={{ borderColor: "var(--parapost-accent-border)", background: "var(--parapost-accent-muted-bg)" }}
                  >
                    Back
                  </span>
                </div>

                <h3 className="text-lg font-black tracking-[-0.02em]">Settings Center</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Return to the full Parapost Network Settings area.
                </p>
              </section>
            </Link>
          </aside>
        </section>
      </div>
    </main>
  );
}

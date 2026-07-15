"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BackToPrevious from "@/components/BackToPrevious";

type ProfilePreview = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at?: string | null;
};

type AdminUserRow = {
  user_id: string;
  role: string;
};

function getDisplayName(profile: ProfilePreview | null) {
  return profile?.full_name || profile?.username || "Parapost Member";
}

function getInitial(profile: ProfilePreview | null) {
  return getDisplayName(profile).charAt(0).toUpperCase();
}

function isAdminRole(role: string) {
  return ["owner", "admin", "support", "moderator"].includes(role);
}

function formatDate(value?: string | null) {
  if (!value) return "Not available";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}


function blurActiveElement() {
  if (typeof document === "undefined") return;

  const activeElement = document.activeElement;

  if (activeElement instanceof HTMLElement) {
    activeElement.blur();
  }
}


const accountControls = [
  {
    title: "Password reset",
    description: "Send a secure reset email to the address connected to this account.",
    status: "Available",
  },
  {
    title: "Signed-in session",
    description: "Your browser session keeps you signed in until you sign out or the session expires.",
    status: "Active when signed in",
  },
  {
    title: "Account data",
    description: "Data access, deletion, and account removal requests stay in the controlled data request flow.",
    status: "Controlled",
  },
  {
    title: "Account support",
    description: "Account access, security, and deletion questions can be sent through Parapost support.",
    status: "Support ready",
  },
];

const accountChecklist = [
  "Use a private email account you control.",
  "Request a password reset if you think your password needs to be changed.",
  "Sign out on shared or public devices.",
  "Use the support form for account access, deletion, or data concerns.",
];

export default function AccountSecuritySettingsPage() {
  const router = useRouter();

  const [currentProfile, setCurrentProfile] = useState<ProfilePreview | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null);
  const [adminRole, setAdminRole] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [sendingReset, setSendingReset] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const canSeeAdminSupport = isAdminRole(adminRole);

  const accountStatusLabel = useMemo(() => {
    if (pageLoading) return "Checking...";
    if (!userId) return "Signed out";
    return "Signed in";
  }, [pageLoading, userId]);

  const prepareAccountNavigation = useCallback(() => {
    blurActiveElement();
  }, []);

  useEffect(() => {
    router.prefetch("/");
    router.prefetch("/dashboard");
    router.prefetch("/settings");
    router.prefetch("/settings/data");
    router.prefetch("/settings/help-support");
    router.prefetch("/settings/profile");
    router.prefetch("/settings/profile-visibility");
    router.prefetch("/notifications");
    router.prefetch("/messages");
    router.prefetch("/friends");

    if (canSeeAdminSupport) {
      router.prefetch("/admin/support");
    }

    if (currentProfile?.id) {
      router.prefetch(`/profile/${currentProfile.id}`);
    }
  }, [canSeeAdminSupport, currentProfile?.id, router]);

  useEffect(() => {
    let cancelled = false;

    async function loadPageUser() {
      setPageLoading(true);
      setStatusMessage("");
      setErrorMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userError || !user) {
        setUserId("");
        setUserEmail("");
        setLastSignInAt(null);
        setCurrentProfile(null);
        setAdminRole("");
        setPageLoading(false);
        return;
      }

      setUserId(user.id);
      setUserEmail(user.email || "");
      setLastSignInAt(user.last_sign_in_at || null);

      const [{ data: profileData }, { data: adminData }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url, created_at")
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

  const handleSendPasswordReset = async () => {
    blurActiveElement();
    setStatusMessage("");
    setErrorMessage("");

    if (!userEmail) {
      setErrorMessage("Please sign in before requesting a password reset.");
      return;
    }

    setSendingReset(true);

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/reset-password`
        : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
      redirectTo,
    });

    setSendingReset(false);

    if (error) {
      setErrorMessage(`Could not send password reset email: ${error.message}`);
      return;
    }

    setStatusMessage("Password reset email sent. Check your inbox for the secure reset link.");
  };

  const handleSignOut = async () => {
    blurActiveElement();
    setStatusMessage("");
    setErrorMessage("");
    setSigningOut(true);

    if (userId) {
      await supabase.from("profiles").update({ is_online: false }).eq("id", userId);
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      setSigningOut(false);
      setErrorMessage(`Could not sign out: ${error.message}`);
      return;
    }

    router.replace("/");
    router.refresh();
  };

  return (
    <main
      className="account-settings-page min-h-svh touch-pan-y overflow-x-hidden px-3 py-4 pb-[calc(9.5rem+env(safe-area-inset-bottom))] text-white sm:px-5 sm:py-6 lg:min-h-0 lg:px-6"
      style={{ paddingBottom: "calc(9.5rem + env(safe-area-inset-bottom))" }}
    >
      <div className="relative z-10 mx-auto w-full max-w-4xl">
        <div className="account-settings-back-row mb-5 flex items-center justify-between gap-3">
          <div className="account-settings-back-desktop">
            <BackToPrevious label="Back to Settings" fallbackHref="/settings" />
          </div>

          <div className="account-settings-back-mobile">
            <BackToPrevious
              label="Back to Your Account"
              fallbackHref="/dashboard?menu=settings-account"
              alwaysUseFallback
            />
          </div>

          <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Account & Security
          </span>
        </div>

        <section className="account-settings-hero-grid mb-4 grid gap-4 sm:mb-5 lg:grid-cols-[minmax(0,1fr)_340px]">
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
              Account Safety
            </p>

            <h1 className="max-w-3xl text-[clamp(2rem,10vw,3.75rem)] font-black leading-[0.95] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
              Keep your Parapost Network account secure.
            </h1>

            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Manage your signed-in account, password reset, session status, sign-out access, and account data
              request flow from one focused security page.
            </p>

            <div className="mt-5 grid gap-3 sm:mt-6 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={handleSendPasswordReset}
                disabled={sendingReset || pageLoading || !userEmail}
                className="inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-center text-sm font-black shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                style={{
                  background:
                    "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
                  color: "var(--parapost-accent-button-text)",
                  boxShadow: "0 12px 26px var(--parapost-accent-glow)",
                }}
              >
                {sendingReset ? "Sending..." : "Send Password Reset"}
              </button>

              <Link
                href="/settings/data"
                onClick={prepareAccountNavigation}
                className="inline-flex w-full items-center justify-center rounded-full border px-5 py-3 text-center text-sm font-black text-white no-underline shadow-lg transition hover:bg-white/10 sm:w-auto"
                style={{
                  borderColor: "var(--parapost-accent-border)",
                  background: "rgba(255,255,255,0.055)",
                }}
              >
                Data & Account
              </Link>

              <Link
                href="/settings/help-support"
                onClick={prepareAccountNavigation}
                className="inline-flex w-full items-center justify-center rounded-full border px-5 py-3 text-center text-sm font-black text-white no-underline shadow-lg transition hover:bg-white/10 sm:w-auto"
                style={{
                  borderColor: "var(--parapost-accent-border)",
                  background: "rgba(255,255,255,0.055)",
                }}
              >
                Account Support
              </Link>

              {canSeeAdminSupport ? (
                <Link
                  href="/admin/support"
                  onClick={prepareAccountNavigation}
                  className="inline-flex w-full items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-400/10 px-5 py-3 text-center text-sm font-black text-emerald-100 no-underline hover:bg-emerald-400/15 sm:w-auto"
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
                Account Status
              </div>
              <div className="mt-2 text-2xl font-black">{accountStatusLabel}</div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Last sign-in: {formatDate(lastSignInAt)}
              </p>
            </div>

            {userId ? (
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="mt-5 w-full rounded-2xl border border-red-300/25 bg-red-400/10 px-5 py-3 text-sm font-black text-red-100 transition hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {signingOut ? "Signing out..." : "Sign Out"}
              </button>
            ) : (
              <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                Sign in to manage account security controls.
              </div>
            )}
          </aside>
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

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <section
              className="scroll-mt-24 rounded-[24px] border p-4 shadow-2xl ring-1 ring-white/[0.035] sm:rounded-[28px] sm:p-6"
              style={{
                borderColor: "var(--parapost-accent-border)",
                background:
                  "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.055), rgba(15,23,42,0.55))",
              }}
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.18em]" style={{ color: "var(--parapost-accent-text)" }}>
                    Security Controls
                  </p>
                  <h2 className="text-[clamp(1.45rem,6vw,1.5rem)] font-black tracking-[-0.03em]">
                    Account protection tools
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
                  Ready
                </span>
              </div>

              <div className="account-security-card-grid grid gap-3 sm:grid-cols-2">
                {accountControls.map((card) => (
                  <article key={card.title} className="account-security-card h-full rounded-[20px] border border-white/10 bg-black/25 p-4 sm:rounded-[24px]">
                    <span
                      className="rounded-full border px-2.5 py-1 text-[11px] font-black"
                      style={{
                        borderColor: "var(--parapost-accent-border)",
                        background: "var(--parapost-accent-muted-bg)",
                        color: "var(--parapost-accent-readable-text)",
                      }}
                    >
                      {card.status}
                    </span>

                    <h3 className="mt-4 text-lg font-black tracking-[-0.02em]">{card.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{card.description}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[24px] border border-amber-300/20 bg-amber-400/10 p-4 shadow-2xl shadow-amber-950/10 sm:rounded-[28px] sm:p-6">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-amber-100">
                Data & Account
              </p>
              <h2 className="text-[clamp(1.45rem,6vw,1.5rem)] font-black tracking-[-0.03em] text-white">
                Account deletion stays controlled.
              </h2>
              <p className="mt-4 text-sm leading-7 text-amber-50/85">
                Account and data deletion requests use a careful review process so users understand what happens
                to their profile, posts, media, messages, comments, reports, and safety records before anything is
                removed.
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/settings/data"
                  className="inline-flex w-full items-center justify-center rounded-full bg-amber-300 px-5 py-3 text-center text-sm font-black text-black no-underline transition hover:brightness-110 sm:w-auto"
                >
                  Open Data & Account
                </Link>

                <Link
                  href="/settings/help-support"
                  className="inline-flex w-full items-center justify-center rounded-full border border-amber-200/25 bg-black/20 px-5 py-3 text-center text-sm font-black text-amber-50 no-underline hover:bg-black/30 sm:w-auto"
                >
                  Contact Support
                </Link>
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section
              className="rounded-[22px] border p-4 shadow-xl sm:rounded-[26px] sm:p-5"
              style={{
                borderColor: "var(--parapost-accent-border)",
                background:
                  "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.045), rgba(15,23,42,0.52))",
              }}
            >
              <p className="mb-2 text-xs font-black uppercase tracking-[0.16em]" style={{ color: "var(--parapost-accent-text)" }}>
                Account Checklist
              </p>
              <h3 className="text-lg font-black tracking-[-0.02em]">Quick safety reminders</h3>

              <div className="mt-4 space-y-3">
                {accountChecklist.map((item) => (
                  <div key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-black/25 p-3">
                    <span
                      className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black"
                      style={{
                        background: "var(--parapost-accent-muted-bg)",
                        color: "var(--parapost-accent-readable-text)",
                      }}
                    >
                      ✓
                    </span>
                    <p className="text-sm leading-6 text-slate-300">{item}</p>
                  </div>
                ))}
              </div>
            </section>

            <section
              className="rounded-[22px] border p-4 shadow-xl sm:rounded-[26px] sm:p-5"
              style={{
                borderColor: "var(--parapost-accent-border)",
                background:
                  "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.045), rgba(15,23,42,0.52))",
              }}
            >
              <p className="mb-2 text-xs font-black uppercase tracking-[0.16em]" style={{ color: "var(--parapost-accent-text)" }}>
                Related Account Areas
              </p>
              <h3 className="text-lg font-black tracking-[-0.02em]">Account help and data tools</h3>

              <div className="account-related-card-grid mt-4 grid gap-3">
                <Link
                  href="/settings/data"
                  className="account-related-card block h-full rounded-2xl border border-white/10 bg-black/25 p-4 text-white no-underline transition hover:bg-white/[0.06]"
                >
                  <strong className="block text-sm font-black">Data & Account</strong>
                  <span className="mt-1 block text-xs leading-5 text-slate-400">
                    Account data, deletion requests, and privacy/data help.
                  </span>
                </Link>

                <Link
                  href="/settings/help-support"
                  className="account-related-card block h-full rounded-2xl border border-white/10 bg-black/25 p-4 text-white no-underline transition hover:bg-white/[0.06]"
                >
                  <strong className="block text-sm font-black">Account Support</strong>
                  <span className="mt-1 block text-xs leading-5 text-slate-400">
                    Help with sign-in, account access, deletion, or account questions.
                  </span>
                </Link>

                {canSeeAdminSupport ? (
                  <Link
                    href="/admin/support"
                    className="account-related-card block h-full rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-emerald-100 no-underline transition hover:bg-emerald-400/15"
                  >
                    <strong className="block text-sm font-black">Admin Support Inbox</strong>
                    <span className="mt-1 block text-xs leading-5 text-emerald-100/75">
                      Review account support requests and safety messages.
                    </span>
                  </Link>
                ) : null}
              </div>
            </section>
          </aside>
        </section>


      <style jsx global>{`
        .account-settings-page {
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-y: auto;
          scroll-padding-top: 16px;
          scroll-padding-bottom: calc(9.5rem + env(safe-area-inset-bottom));
        }

        .account-settings-back-mobile {
          display: none;
        }

        @media (max-width: 1024px) {
          .account-settings-back-desktop {
            display: none !important;
          }

          .account-settings-back-mobile {
            display: block !important;
          }
        }

        .account-security-card,
        .account-related-card {
          display: flex;
          flex-direction: column;
        }

        @media (max-width: 1023px) {
          .account-settings-page {
            min-height: 100dvh;
            height: auto;
            overflow-y: visible;
          }
        }

        @media (max-width: 430px) {
          .account-settings-page {
            padding-top: max(14px, env(safe-area-inset-top)) !important;
          }
        }

        @media (max-width: 420px) {
          .account-settings-page h1 {
            letter-spacing: -0.05em;
          }

          .account-settings-page aside,
          .account-settings-page section,
          .account-settings-page article {
            max-width: 100%;
          }

          .account-settings-page button,
          .account-settings-page a {
            min-height: 42px;
          }
        }

        @media (min-width: 768px) and (max-width: 1180px) {
          .account-settings-page {
            padding-left: 20px !important;
            padding-right: 20px !important;
            padding-bottom: calc(8rem + env(safe-area-inset-bottom)) !important;
          }

          .account-settings-hero-grid {
            grid-template-columns: minmax(0, 1fr) 320px !important;
            align-items: stretch !important;
          }

          .account-settings-hero-grid > * {
            height: 100% !important;
          }

          .account-security-card-grid {
            grid-auto-rows: 1fr !important;
          }

          .account-related-card-grid {
            grid-auto-rows: 1fr !important;
          }

          .account-settings-page h1 + p {
            margin-top: 24px !important;
          }

          .account-settings-page h1 + p + div {
            margin-top: 28px !important;
          }
        }

        @media (max-height: 620px) and (orientation: landscape) {
          .account-settings-page {
            padding-top: 12px !important;
            padding-bottom: calc(7rem + env(safe-area-inset-bottom)) !important;
          }
        }
      `}</style>
      </div>
    </main>
  );
}

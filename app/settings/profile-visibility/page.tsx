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
  is_private: boolean | null;
};

type AdminUserRow = {
  user_id: string;
  role: string;
};

const visibilityCards = [
  {
    eyebrow: "Visibility",
    title: "Public Profile",
    description:
      "People can visit your profile and view your available profile content based on your privacy settings.",
    items: ["Profile shell visible", "Timeline visible", "Reels visible", "Friends page available"],
  },
  {
    eyebrow: "Privacy",
    title: "Private Profile",
    description:
      "Your profile identity stays visible, but your timeline, Reels, Friends page, and protected content stay limited to you and approved connections.",
    items: ["Timeline hidden", "Reels protected", "Friends protected", "Private message shown"],
  },
  {
    eyebrow: "Access",
    title: "Protected Content",
    description:
      "Private profile protection helps keep direct profile sections from being viewed by people who should not have access.",
    items: ["Profile content", "Reels grid", "Direct Reel viewer", "Friends page"],
  },
  {
    eyebrow: "Control",
    title: "More Privacy Controls",
    description:
      "Parapost Network can expand this area with post-level, Reel-level, Showcase, message, and friend-list privacy controls as the platform grows.",
    items: ["Post privacy", "Reel privacy", "Showcase privacy", "Message privacy"],
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


export default function ProfileVisibilitySettingsPage() {
  const [currentProfile, setCurrentProfile] = useState<ProfilePreview | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [adminRole, setAdminRole] = useState("");
  const [pageLoading, setPageLoading] = useState(true);

  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const canSeeAdminSupport = isAdminRole(adminRole);

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
        setCurrentUserId("");
        setUserEmail("");
        setCurrentProfile(null);
        setAdminRole("");
        setIsPrivate(false);
        setPageLoading(false);
        return;
      }

      setCurrentUserId(user.id);
      setUserEmail(user.email || "");

      const [{ data: profileData, error: profileError }, { data: adminData }] = await Promise.all([
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

      if (profileError) {
        setErrorMessage(`Could not load profile visibility: ${profileError.message}`);
        setPageLoading(false);
        return;
      }

      const profile = (profileData as ProfilePreview | null) || null;
      setCurrentProfile(profile);
      setIsPrivate(Boolean(profile?.is_private));

      const adminRow = adminData as AdminUserRow | null;
      setAdminRole(adminRow?.role && isAdminRole(adminRow.role) ? adminRow.role : "");

      setPageLoading(false);
    }

    void loadPageUser();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveVisibility = async () => {
    setStatusMessage("");
    setErrorMessage("");

    if (!currentUserId) {
      setErrorMessage("Please sign in before changing profile visibility.");
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        is_private: isPrivate,
      })
      .eq("id", currentUserId);

    setSaving(false);

    if (error) {
      setErrorMessage(`Could not update profile visibility: ${error.message}`);
      return;
    }

    setCurrentProfile((prev) => (prev ? { ...prev, is_private: isPrivate } : prev));
    setStatusMessage(isPrivate ? "Your profile is now private." : "Your profile is now public.");
  };

  return (
    <main className="profile-visibility-page min-h-[100dvh] overflow-x-hidden px-3 py-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] text-white sm:px-6 sm:py-6 lg:px-6">
      <style jsx global>{`
        .profile-visibility-page{
          scroll-padding-bottom:calc(8rem + env(safe-area-inset-bottom));
        }

        .profile-visibility-side-card{
          display:flex;
          flex-direction:column;
        }

        .profile-visibility-back-mobile {
          display: none;
        }

        @media (max-width: 1180px) {
          .profile-visibility-back-desktop {
            display: none !important;
          }

          .profile-visibility-back-mobile {
            display: block !important;
          }
        }

        @media (max-width:430px){
          .profile-visibility-page{
            padding-top:max(14px,env(safe-area-inset-top)) !important;
            padding-left:12px !important;
            padding-right:12px !important;
          }

          .profile-visibility-back-row{
            align-items:flex-start !important;
          }

          .profile-visibility-page h1{
            font-size:clamp(2.25rem,11vw,3.3rem)!important;
          }
        }

        @media (min-width:768px) and (max-width:1180px){
          .profile-visibility-page{
            padding-left:20px!important;
            padding-right:20px!important;
          }

          .profile-visibility-hero-grid{
            grid-template-columns:minmax(0,1fr) 320px!important;
            align-items:stretch!important;
          }

          .profile-visibility-hero-grid>*{
            height:100%!important;
          }

          .profile-visibility-side-grid{
            display:grid!important;
            grid-auto-rows:1fr!important;
            gap:16px!important;
          }

          .profile-visibility-page h1 + p{
            margin-top:24px!important;
          }
        }
      `}</style>
      <div className="relative z-10 mx-auto w-full max-w-4xl">
        <div className="profile-visibility-back-row mb-5 flex items-center justify-between gap-3">
          <div className="profile-visibility-back-desktop flex min-w-0 items-center gap-1.5">
            <BackToPrevious label="Back" fallbackHref="/settings/privacy-safety" />
            <span className="select-none text-slate-700">/</span>
            <Link
              href="/settings"
              className="truncate text-xs font-bold text-slate-500 no-underline transition hover:text-white"
            >
              Settings
            </Link>
          </div>

          <div className="profile-visibility-back-mobile">
            <BackToPrevious
              label="Back to Privacy & Safety"
              fallbackHref="/dashboard?menu=settingsPrivacy"
              alwaysUseFallback
            />
          </div>

          <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Profile Visibility
          </span>
        </div>

        <section className="profile-visibility-hero-grid mb-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div
            className="rounded-[26px] border p-4 shadow-2xl ring-1 ring-white/[0.035] sm:rounded-[30px] sm:p-7"
            style={{
              borderColor: "var(--parapost-accent-border)",
              background:
                "linear-gradient(135deg, var(--parapost-accent-soft), rgba(255,255,255,0.06), rgba(15,23,42,0.70))",
              boxShadow: "0 24px 70px rgba(0,0,0,0.38), 0 0 38px var(--parapost-accent-glow)",
            }}
          >
            <p className="mb-3 text-xs font-black uppercase tracking-[0.18em]" style={{ color: "var(--parapost-accent-text)" }}>
              Profile Visibility
            </p>

            <h1 className="max-w-3xl text-[2.1rem] font-black leading-[0.95] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
              Choose who can see your profile content.
            </h1>

            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Public profiles show available profile content normally. Private profiles keep your basic profile shell visible,
              while protecting timeline content, Reels, Friends, and other private sections from non-friends.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a
                href="#visibility-control"
                className="inline-flex w-full justify-center rounded-full px-5 py-3 text-sm font-black no-underline shadow-lg transition hover:brightness-110 sm:w-auto"
                style={{
                  background:
                    "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
                  color: "var(--parapost-accent-button-text)",
                  boxShadow: "0 12px 26px var(--parapost-accent-glow)",
                }}
              >
                Change Visibility
              </a>

              {currentProfile?.id ? (
                <Link
                  href={`/profile/${currentProfile.id}`}
                  className="inline-flex w-full justify-center rounded-full border px-5 py-3 text-sm font-black text-white no-underline shadow-lg transition hover:bg-white/10 sm:w-auto"
                  style={{ borderColor: "var(--parapost-accent-border)", background: "rgba(255,255,255,0.055)" }}
                >
                  View Profile
                </Link>
              ) : null}

              <Link
                href="/settings/privacy-safety"
                className="inline-flex w-full justify-center rounded-full border px-5 py-3 text-sm font-black text-white no-underline shadow-lg transition hover:bg-white/10 sm:w-auto"
                style={{ borderColor: "var(--parapost-accent-border)", background: "rgba(255,255,255,0.055)" }}
              >
                Privacy & Safety
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
            className="profile-visibility-side-card h-full rounded-[30px] border p-5 shadow-2xl ring-1 ring-white/[0.035]"
            style={{
              borderColor: "var(--parapost-accent-border)",
              background:
                "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.055), rgba(15,23,42,0.56))",
              boxShadow: "0 24px 70px rgba(0,0,0,0.30)",
            }}
          >
            <div className="flex items-center gap-4">
              <div
                className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full text-xl font-black ring-1 ring-white/15 sm:h-16 sm:w-16 sm:text-2xl"
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
                Current Visibility
              </div>
              <div className="mt-2 text-2xl font-black">
                {pageLoading ? "Checking..." : isPrivate ? "Private" : "Public"}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                This setting updates your profile visibility after saving.
              </p>
            </div>

            {!pageLoading && !currentUserId ? (
              <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                Sign in is required to manage profile visibility.
              </div>
            ) : null}
          </aside>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-4">
            <section
              id="visibility-control"
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
                    Public / Private
                  </p>
                  <h2 className="text-[1.55rem] font-black tracking-[-0.03em] sm:text-2xl">
                    Profile visibility control
                  </h2>
                </div>

                <span
                  className={`rounded-full border px-3 py-1.5 text-xs font-black ${
                    isPrivate
                      ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
                      : "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                  }`}
                >
                  {isPrivate ? "Private" : "Public"}
                </span>
              </div>

              <div className="rounded-[24px] border border-purple-200/15 bg-black/25 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-base font-black text-white">Private Profile</p>
                    <p className="mt-1 text-sm leading-6 text-slate-400">
                      When this is on, non-friends can still see your basic profile shell, but your protected
                      content stays limited to you and approved connections.
                    </p>
                  </div>

                  <button
                    type="button"
                    aria-pressed={isPrivate}
                    onClick={() => {
                      setIsPrivate((prev) => !prev);
                      setStatusMessage("");
                      setErrorMessage("");
                    }}
                    className={`relative inline-flex h-9 w-[4.25rem] shrink-0 items-center self-start rounded-full border transition sm:h-8 sm:w-16 sm:self-center ${
                      isPrivate ? "" : "border-white/10 bg-white/15"
                    }`}
                    style={
                      isPrivate
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
                        isPrivate ? "translate-x-8" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="mt-4 rounded-2xl border border-purple-200/15 bg-purple-400/[0.045] p-4 text-sm leading-6 text-slate-300">
                  Selected setting:{" "}
                  <span className="font-black text-white">{isPrivate ? "Private" : "Public"}</span>
                </div>
              </div>

              <div className="mt-5 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                <span className="text-xs font-bold text-slate-500">
                  Save after changing the toggle.
                </span>

                <button
                  type="button"
                  onClick={handleSaveVisibility}
                  disabled={saving || pageLoading || !currentUserId}
                  className="w-full rounded-2xl px-5 py-3 text-sm font-black shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
                    color: "var(--parapost-accent-button-text)",
                    boxShadow: "0 12px 26px var(--parapost-accent-glow)",
                  }}
                >
                  {saving ? "Saving..." : "Save Visibility"}
                </button>
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
                What private protects
              </p>
              <h2 className="text-[1.55rem] font-black tracking-[-0.03em] sm:text-2xl">
                Private profiles still show a basic profile shell.
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                This keeps Parapost Network social and discoverable while protecting personal content. Non-friends
                see the profile identity area and a private message instead of timeline, Reels, Friends, and other
                protected sections.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  "Profile shell remains visible",
                  "Timeline content hidden",
                  "Reels routes protected",
                  "Friends route protected",
                  "Owner still sees everything",
                  "Accepted friends can view content",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-purple-200/15 bg-black/30 px-3 py-3 text-sm font-bold text-slate-200 sm:px-4"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="profile-visibility-side-grid space-y-4">
            {visibilityCards.map((card) => (
              <section
                key={card.title}
                className="rounded-[24px] border p-4 shadow-xl transition hover:bg-white/[0.06] sm:rounded-[26px] sm:p-5"
                style={{
                  borderColor: "var(--parapost-accent-border)",
                  background:
                    "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.045), rgba(15,23,42,0.52))",
                }}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--parapost-accent-text)" }}>
                    {card.eyebrow}
                  </span>
                </div>

                <h3 className="text-lg font-black tracking-[-0.02em]">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{card.description}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {card.items.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-purple-200/15 bg-black/30 px-3 py-1.5 text-xs font-bold text-slate-300"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </section>
            ))}
          </aside>
        </section>
      </div>
    </main>
  );
}

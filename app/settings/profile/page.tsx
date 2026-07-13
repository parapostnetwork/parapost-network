"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BackToPrevious from "@/components/BackToPrevious";

type ProfileSettingsRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_private: boolean | null;
};

type ProfileSettingsForm = {
  full_name: string;
  bio: string;
  avatar_url: string;
  is_private: boolean;
};

const emptyForm: ProfileSettingsForm = {
  full_name: "",
  bio: "",
  avatar_url: "",
  is_private: false,
};

const AVATAR_BUCKET = "post-images";
const MAX_AVATAR_MB = 8;

function getSafeAvatarExtension(file: File) {
  const rawExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
  return rawExt.replace(/[^a-z0-9]/g, "") || "jpg";
}

function getAvatarErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;

  if (typeof error === "object" && error && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return message;
  }

  return "Unknown avatar upload error";
}

function getInitial(name?: string | null, username?: string | null) {
  const value = name || username || "P";
  return value.charAt(0).toUpperCase();
}

function getDisplayName(form: ProfileSettingsForm, username: string) {
  return form.full_name.trim() || username || "Parapost Member";
}

function blurActiveElement() {
  if (typeof document === "undefined") return;

  const activeElement = document.activeElement;

  if (activeElement instanceof HTMLElement) {
    activeElement.blur();
  }
}

export default function ProfileSettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [form, setForm] = useState<ProfileSettingsForm>(emptyForm);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarRefreshKey, setAvatarRefreshKey] = useState(0);
  const [localAvatarPreviewUrl, setLocalAvatarPreviewUrl] = useState("");

  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);

  const displayName = useMemo(() => getDisplayName(form, username), [form, username]);
  const bioCharacters = form.bio.trim().length;
  const avatarPreviewUrl = form.avatar_url.trim();

  const displayedAvatarPreviewUrl = localAvatarPreviewUrl
    ? localAvatarPreviewUrl
    : avatarPreviewUrl
      ? `${avatarPreviewUrl}${avatarPreviewUrl.includes("?") ? "&" : "?"}v=${avatarRefreshKey}`
      : "";

  const viewProfileHref = userId ? `/profile/${userId}` : "/dashboard";

  const goToAccountSettings = useCallback(() => {
    blurActiveElement();
    router.push("/settings/account");
  }, [router]);

  const goToViewProfile = useCallback(() => {
    blurActiveElement();
    router.push(viewProfileHref);
  }, [router, viewProfileHref]);

  useEffect(() => {
    router.prefetch("/settings");
    router.prefetch("/settings/account");
    router.prefetch("/settings/profile-visibility");
    router.prefetch("/dashboard");
    router.prefetch("/notifications");
    router.prefetch("/messages");
  }, [router]);

  useEffect(() => {
    if (!userId) return;

    router.prefetch(`/profile/${userId}`);
  }, [router, userId]);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setStatusMessage("");
      setErrorMessage("");

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (cancelled) return;

        if (userError || !user) {
          setUserId(null);
          setUsername("");
          setForm(emptyForm);
          setErrorMessage("Please sign in to edit your profile settings.");
          setLoading(false);
          return;
        }

        setUserId(user.id);

        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, username, bio, avatar_url, is_private")
          .eq("id", user.id)
          .single();

        if (error) throw error;

        const profile = data as ProfileSettingsRow;

        if (cancelled) return;

        setUsername(profile.username || "");
        setForm({
          full_name: profile.full_name || "",
          bio: profile.bio || "",
          avatar_url: profile.avatar_url || "",
          is_private: Boolean(profile.is_private),
        });
      } catch (error) {
        console.error("Error loading profile settings:", error);
        if (!cancelled) {
          setErrorMessage("Could not load your profile settings. Please refresh and try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (localAvatarPreviewUrl) {
        URL.revokeObjectURL(localAvatarPreviewUrl);
      }
    };
  }, [localAvatarPreviewUrl]);

  const handleAvatarFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!userId || avatarUploading) return;

    const file = event.target.files?.[0] || null;

    if (!file) return;

    setStatusMessage("");
    setErrorMessage("");

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please choose an image file for your avatar.");
      if (avatarFileInputRef.current) avatarFileInputRef.current.value = "";
      return;
    }

    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      setErrorMessage(`Avatar images can be up to ${MAX_AVATAR_MB}MB.`);
      if (avatarFileInputRef.current) avatarFileInputRef.current.value = "";
      return;
    }

    const objectPreviewUrl = URL.createObjectURL(file);

    setLocalAvatarPreviewUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      return objectPreviewUrl;
    });

    setForm((prev) => ({
      ...prev,
      avatar_url: objectPreviewUrl,
    }));

    setAvatarRefreshKey(Date.now());
    setAvatarUploading(true);

    try {
      const safeExt = getSafeAvatarExtension(file);
      const storagePath = `${userId}/avatars/avatar-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${safeExt}`;

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(storagePath, file, {
          cacheControl: "604800",
          upsert: false,
          contentType: file.type || undefined,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(storagePath);

      const nextAvatarUrl = publicUrlData.publicUrl;

      if (!nextAvatarUrl) {
        throw new Error("Avatar uploaded, but no public URL was returned.");
      }

      const { data: updatedProfile, error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: nextAvatarUrl })
        .eq("id", userId)
        .select("id, avatar_url")
        .single();

      if (updateError) throw updateError;

      const savedAvatarUrl = updatedProfile?.avatar_url || nextAvatarUrl;

      setLocalAvatarPreviewUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        return "";
      });

      setForm((prev) => ({
        ...prev,
        avatar_url: savedAvatarUrl,
      }));

      setAvatarRefreshKey(Date.now());
      setStatusMessage("Avatar uploaded and saved. Your new avatar should now show across Parapost.");
    } catch (error) {
      console.error("Avatar upload error:", error);

      setLocalAvatarPreviewUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        return "";
      });

      setAvatarRefreshKey(Date.now());
      setErrorMessage(`Avatar upload failed: ${getAvatarErrorMessage(error)}`);
    } finally {
      setAvatarUploading(false);
      if (avatarFileInputRef.current) avatarFileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!userId || saving || avatarUploading) return;

    blurActiveElement();
    setSaving(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const cleanFullName = form.full_name.trim();
      const cleanBio = form.bio.trim();
      const cleanAvatarUrl = form.avatar_url.trim();

      const { data: updatedProfile, error } = await supabase
        .from("profiles")
        .update({
          full_name: cleanFullName || null,
          bio: cleanBio || null,
          avatar_url: cleanAvatarUrl || null,
        })
        .eq("id", userId)
        .select("full_name, bio, avatar_url")
        .single();

      if (error) throw error;

      if (updatedProfile) {
        setForm((prev) => ({
          ...prev,
          full_name: updatedProfile.full_name || "",
          bio: updatedProfile.bio || "",
          avatar_url: updatedProfile.avatar_url || "",
        }));
      }

      setAvatarRefreshKey(Date.now());
      setStatusMessage("Profile settings saved successfully.");
    } catch (error) {
      console.error("Error saving profile settings:", error);
      setErrorMessage("Failed to update profile settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="profile-settings-root min-h-svh touch-pan-y overflow-x-hidden px-4 py-8 pb-[calc(9.5rem+env(safe-area-inset-bottom))] text-white sm:px-6 lg:min-h-0 lg:px-6">
        <div className="mx-auto w-full max-w-4xl">
          <div className="animate-pulse rounded-[32px] border border-white/10 bg-white/[0.055] p-6 shadow-2xl">
            <div className="mb-5 h-8 w-48 rounded bg-white/10" />
            <div className="mb-3 h-12 rounded-2xl bg-white/10" />
            <div className="mb-3 h-28 rounded-2xl bg-white/10" />
            <div className="mb-3 h-12 rounded-2xl bg-white/10" />
            <div className="h-12 w-32 rounded-2xl bg-white/10" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="profile-settings-root min-h-svh touch-pan-y overflow-x-hidden px-4 py-6 pb-[calc(9.5rem+env(safe-area-inset-bottom))] text-white sm:px-6 lg:min-h-0 lg:px-6">
      <section className="relative z-10 mx-auto w-full max-w-4xl">
        <div className="profile-settings-topbar mb-5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <BackToPrevious label="← Back to Account" fallbackHref="/settings/account" />
            <span className="select-none text-slate-700">/</span>
            <Link
              href="/settings"
              className="truncate text-xs font-bold text-slate-500 no-underline transition hover:text-white"
            >
              Settings
            </Link>
          </div>

          {userId ? (
            <button
              type="button"
              onClick={goToViewProfile}
              className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-slate-300 no-underline transition hover:bg-white/[0.08] hover:text-white"
            >
              View Profile →
            </button>
          ) : (
            <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              Profile Settings
            </span>
          )}
        </div>

        <section className="profile-settings-hero-grid mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div
            className="rounded-[30px] border p-5 shadow-2xl ring-1 ring-white/[0.035] sm:p-7"
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
              Profile Settings
            </p>
            <h1 className="max-w-3xl text-4xl font-black leading-[0.95] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
              Update how your profile appears.
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Manage your display name, bio, and avatar preview from one clean settings page.
              Profile visibility has its own dedicated control so privacy changes stay clear and easy to review.
            </p>
          </div>

          <aside
            className="rounded-[30px] border p-5 shadow-2xl ring-1 ring-white/[0.035]"
            style={{
              borderColor: "var(--parapost-accent-border)",
              background:
                "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.045), rgba(15,23,42,0.58))",
            }}
          >
            <div className="flex items-center gap-4">
              <div
                className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[26px] border text-3xl font-black text-white shadow-2xl"
                style={{
                  borderColor: "var(--parapost-accent-border)",
                  background: "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
                  boxShadow: "0 0 28px var(--parapost-accent-glow)",
                }}
              >
                {displayedAvatarPreviewUrl ? (
                  <Image
                    src={displayedAvatarPreviewUrl}
                    alt="Profile avatar preview"
                    width={80}
                    height={80}
                    sizes="80px"
                    unoptimized
                    className="h-full w-full object-cover object-center"
                  />
                ) : (
                  <span>{getInitial(form.full_name, username)}</span>
                )}
              </div>

              <div className="min-w-0">
                <p className="truncate text-lg font-black tracking-[-0.02em] text-white">{displayName}</p>
                <p className="truncate text-sm font-bold text-slate-400">{username ? `@${username}` : "@parapost"}</p>
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: "var(--parapost-accent-text)" }}>
                  Live preview
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-400">
              This preview updates as you edit. Uploads save immediately, and the Save Changes button updates your name, bio, and avatar URL.
            </p>
          </aside>
        </section>

        {(statusMessage || errorMessage) ? (
          <div
            className="mb-5 rounded-[24px] border px-4 py-3 text-sm font-bold shadow-xl"
            style={{
              borderColor: errorMessage ? "rgba(248,113,113,0.30)" : "rgba(34,197,94,0.30)",
              background: errorMessage ? "rgba(127,29,29,0.18)" : "rgba(22,163,74,0.14)",
              color: errorMessage ? "#fecaca" : "#bbf7d0",
            }}
          >
            {errorMessage || statusMessage}
          </div>
        ) : null}

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div
            className="rounded-[30px] border p-5 shadow-2xl ring-1 ring-white/[0.035] sm:p-6"
            style={{
              borderColor: "var(--parapost-accent-border)",
              background: "linear-gradient(135deg, rgba(255,255,255,0.065), rgba(15,23,42,0.68))",
            }}
          >
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p
                  className="text-xs font-black uppercase tracking-[0.18em]"
                  style={{ color: "var(--parapost-accent-text)" }}
                >
                  Basic Info
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">
                  Name, bio, and avatar
                </h2>
              </div>

              <span className="w-fit rounded-full border border-white/[0.08] bg-white/[0.045] px-3 py-1.5 text-xs font-black text-slate-300">
                {bioCharacters}/175 bio chars
              </span>
            </div>

            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-bold text-white/85">Full Name</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      full_name: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none placeholder:text-white/35 transition focus:border-purple-400/40 focus:bg-black/35"
                  placeholder="Enter your full name"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-white/85">Username</label>
                <input
                  type="text"
                  value={username}
                  readOnly
                  className="w-full cursor-not-allowed rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-slate-400 outline-none"
                  placeholder="Username"
                />
                <p className="mt-2 text-xs font-medium text-slate-500">
                  Username changes can be handled separately so profile routes stay stable.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-white/85">Bio</label>
                <textarea
                  value={form.bio}
                  maxLength={175}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      bio: event.target.value.slice(0, 175),
                    }))
                  }
                  className="min-h-[132px] w-full resize-y rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none placeholder:text-white/35 transition focus:border-purple-400/40 focus:bg-black/35"
                  placeholder="Tell the Parapost community a little about yourself."
                />
              </div>

              <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.035] p-4">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-base font-black text-white">Profile Avatar</p>
                    <p className="mt-1 text-sm leading-6 text-slate-400">
                      Upload a new avatar and it will save immediately to your profile.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => avatarFileInputRef.current?.click()}
                    disabled={avatarUploading || !userId}
                    className="rounded-2xl border px-5 py-3 text-sm font-black text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      borderColor: "var(--parapost-accent-border)",
                      background: "linear-gradient(135deg, var(--parapost-accent-soft), rgba(255,255,255,0.06))",
                    }}
                  >
                    {avatarUploading ? "Uploading..." : "Upload Avatar"}
                  </button>

                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarFileUpload}
                  />
                </div>

                <label className="mb-2 block text-sm font-bold text-white/85">Avatar URL</label>
                <input
                  type="text"
                  value={form.avatar_url}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      avatar_url: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none placeholder:text-white/35 transition focus:border-purple-400/40 focus:bg-black/35"
                  placeholder="Paste image URL or upload above"
                />
                <p className="mt-2 text-xs font-medium text-slate-500">
                  Upload saves on the first try. The URL field remains available for a direct image link if needed.
                </p>
              </div>

              <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || avatarUploading || !userId}
                  className="rounded-2xl px-5 py-3 text-sm font-black text-white shadow-xl transition disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    background: "linear-gradient(135deg, var(--parapost-accent-1), var(--parapost-accent-2), var(--parapost-accent-3))",
                    boxShadow: "0 18px 38px var(--parapost-accent-glow)",
                  }}
                >
                  {saving ? "Saving..." : avatarUploading ? "Avatar Uploading..." : "Save Changes"}
                </button>

                <button
                  type="button"
                  onClick={goToAccountSettings}
                  className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
                >
                  Back to Your Account
                </button>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <section
              className="rounded-[26px] border p-5 shadow-xl"
              style={{
                borderColor: "var(--parapost-accent-border)",
                background: "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.045), rgba(15,23,42,0.52))",
              }}
            >
              <p
                className="mb-2 text-xs font-black uppercase tracking-[0.16em]"
                style={{ color: "var(--parapost-accent-text)" }}
              >
                Profile Preview
              </p>
              <h3 className="text-lg font-black tracking-[-0.02em]">How people recognize you</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Your name, avatar, username, and bio help people understand who they are connecting with.
              </p>

              {userId ? (
                <button
                  type="button"
                  onClick={goToViewProfile}
                  className="mt-4 inline-flex rounded-full border px-4 py-2 text-sm font-black text-white transition hover:bg-white/10"
                  style={{
                    borderColor: "var(--parapost-accent-border)",
                    background: "rgba(255,255,255,0.055)",
                  }}
                >
                  View Profile
                </button>
              ) : null}
            </section>

            <section
              className="rounded-[26px] border p-5 shadow-xl"
              style={{
                borderColor: "var(--parapost-accent-border)",
                background: "linear-gradient(135deg, var(--parapost-accent-muted-bg), rgba(255,255,255,0.045), rgba(15,23,42,0.52))",
              }}
            >
              <p
                className="mb-2 text-xs font-black uppercase tracking-[0.16em]"
                style={{ color: "var(--parapost-accent-text)" }}
              >
                Privacy
              </p>
              <h3 className="text-lg font-black tracking-[-0.02em]">Visibility controls</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Public/private profile controls should stay easy to understand and consistent across profile pages, Reels, friends, and direct profile routes.
              </p>
              <Link
                href="/settings/profile-visibility"
                onClick={blurActiveElement}
                className="mt-4 inline-flex rounded-full border px-4 py-2 text-sm font-black text-white no-underline transition hover:bg-white/10"
                style={{
                  borderColor: "var(--parapost-accent-border)",
                  background: "rgba(255,255,255,0.055)",
                }}
              >
                Profile Visibility
              </Link>
            </section>
          </aside>
        </section>
      </section>

      <style jsx global>{`
        .profile-settings-root {
          min-height: 100svh !important;
          height: auto !important;
          overflow-y: visible !important;
          overflow-x: hidden !important;
          overscroll-behavior-y: auto !important;
          -webkit-overflow-scrolling: touch !important;
          scroll-padding-top: 16px;
          scroll-padding-bottom: calc(9.5rem + env(safe-area-inset-bottom));
          padding-bottom: calc(9.5rem + env(safe-area-inset-bottom)) !important;
        }

        @media (min-width: 1024px) {
          .profile-settings-root {
            min-height: 0 !important;
          }
        }

        .profile-settings-root input,
        .profile-settings-root textarea {
          max-width: 100%;
        }

        @media (max-width: 640px) {
          .profile-settings-root {
            padding-left: 12px !important;
            padding-right: 12px !important;
            padding-top: 18px !important;
          }

          .profile-settings-root h1 {
            font-size: clamp(2.25rem, 12vw, 3.35rem) !important;
            line-height: 0.96 !important;
          }

          .profile-settings-root h2 {
            font-size: clamp(1.55rem, 7vw, 2.15rem) !important;
            line-height: 1.05 !important;
          }

          .profile-settings-topbar {
            align-items: flex-start !important;
            gap: 12px !important;
          }

          .profile-settings-hero-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </main>
  );
}

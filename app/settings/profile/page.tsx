"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ProfileSettingsRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_private: boolean | null;
};

export default function ProfileSettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [form, setForm] = useState({
    full_name: "",
    bio: "",
    avatar_url: "",
    is_private: false,
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/");
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

        setForm({
          full_name: profile.full_name || "",
          bio: profile.bio || "",
          avatar_url: profile.avatar_url || "",
          is_private: !!profile.is_private,
        });
      } catch (error) {
        console.error("Error loading settings:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [router]);

  const handleSave = async () => {
    if (!userId) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: form.full_name || null,
          bio: form.bio || null,
          avatar_url: form.avatar_url || null,
          is_private: form.is_private,
        })
        .eq("id", userId);

      if (error) throw error;

      alert("Profile updated successfully.");
      router.push(`/profile/${userId}`);
    } catch (error) {
      console.error("Error saving profile:", error);
      alert("Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07090d] text-white">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="animate-pulse rounded-[32px] border border-white/10 bg-white/5 p-6">
            <div className="mb-4 h-8 w-48 rounded bg-white/10" />
            <div className="mb-3 h-12 rounded bg-white/10" />
            <div className="mb-3 h-28 rounded bg-white/10" />
            <div className="mb-3 h-12 rounded bg-white/10" />
            <div className="h-12 w-32 rounded bg-white/10" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07090d] text-white">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-2xl">
          <h1 className="text-2xl font-semibold">Profile Settings</h1>
          <p className="mt-2 text-sm text-white/60">
            Update your profile information and privacy.
          </p>

          <div className="mt-6 space-y-5">
            {/* Full Name */}
            <div>
              <label className="mb-2 block text-sm font-medium text-white/85">
                Full Name
              </label>
              <input
                type="text"
                value={form.full_name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, full_name: e.target.value }))
                }
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-white/20"
                placeholder="Enter your full name"
              />
            </div>

            {/* Bio */}
            <div>
              <label className="mb-2 block text-sm font-medium text-white/85">
                Bio
              </label>
              <textarea
                value={form.bio}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, bio: e.target.value }))
                }
                rows={5}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-white/20"
                placeholder="Write something about yourself"
              />
            </div>

            {/* Avatar */}
            <div>
              <label className="mb-2 block text-sm font-medium text-white/85">
                Avatar URL
              </label>
              <input
                type="text"
                value={form.avatar_url}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, avatar_url: e.target.value }))
                }
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-white/20"
                placeholder="Paste image URL"
              />
            </div>

            {/* Private Toggle */}
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
              <div>
                <p className="font-medium">Private Profile</p>
                <p className="text-sm text-white/60">
                  Only friends can see your posts
                </p>
              </div>

              <button
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    is_private: !prev.is_private,
                  }))
                }
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition ${
                  form.is_private ? "bg-white" : "bg-white/20"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-black transition ${
                    form.is_private ? "translate-x-8" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>

              <button
                onClick={() => router.back()}
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-white hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
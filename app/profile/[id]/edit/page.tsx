"use client";

import { CSSProperties, FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_online?: boolean | null;
};

const pageShellStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#07090d",
  color: "white",
};

const containerStyle: CSSProperties = {
  maxWidth: "980px",
  margin: "0 auto",
  padding: "24px 16px 48px",
};

const cardStyle: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 100%)",
  borderRadius: "28px",
  padding: "20px",
  border: "1px solid rgba(255,255,255,0.10)",
  backdropFilter: "blur(10px)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "18px",
  padding: "14px 16px",
  fontSize: "14px",
  outline: "none",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: "130px",
  resize: "vertical",
  fontFamily: "inherit",
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: "8px",
  fontSize: "13px",
  fontWeight: 700,
  color: "#e5e7eb",
  letterSpacing: "0.02em",
};

const primaryButtonStyle: CSSProperties = {
  background: "white",
  color: "#07090d",
  border: "none",
  borderRadius: "999px",
  padding: "11px 18px",
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "999px",
  padding: "11px 18px",
  fontWeight: 600,
  fontSize: "14px",
  cursor: "pointer",
};

function getInitial(name?: string | null, username?: string | null) {
  const value = name || username || "U";
  return value.charAt(0).toUpperCase();
}

export default function EditProfilePage() {
  const [currentUserId, setCurrentUserId] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setLoading(false);
        setStatusMessage("You need to be logged in to edit your profile.");
        return;
      }

      setCurrentUserId(user.id);
      setEmail(user.email || "");

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, bio, avatar_url, is_online")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        setLoading(false);
        setStatusMessage(`Could not load profile: ${error.message}`);
        return;
      }

      const profile = data as ProfileRow | null;

      setUsername(profile?.username || "");
      setFullName(profile?.full_name || "");
      setBio(profile?.bio || "");
      setAvatarUrl(profile?.avatar_url || "");
      setLoading(false);
    };

    loadProfile();
  }, []);

  const handleAvatarUpload = async (file: File | null) => {
    if (!file || !currentUserId) return;

    setUploadingAvatar(true);
    setStatusMessage("");

    const extension = file.name.split(".").pop() || "jpg";
    const fileName = `${currentUserId}-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(fileName, file, { cacheControl: "3600", upsert: false });

    if (uploadError) {
      setUploadingAvatar(false);
      setStatusMessage(`Avatar upload error: ${uploadError.message}`);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
    const nextAvatarUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: nextAvatarUrl })
      .eq("id", currentUserId);

    if (updateError) {
      setUploadingAvatar(false);
      setStatusMessage(`Avatar save error: ${updateError.message}`);
      return;
    }

    setAvatarUrl(nextAvatarUrl);
    setUploadingAvatar(false);
    setStatusMessage("Avatar updated.");
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();

    if (!currentUserId) {
      setStatusMessage("You need to be logged in to save changes.");
      return;
    }

    setSaving(true);
    setStatusMessage("");

    const cleanedUsername = username.trim();
    const cleanedFullName = fullName.trim();
    const cleanedBio = bio.trim();

    const { error } = await supabase.from("profiles").upsert({
     id: currentUserId,
     username: cleanedUsername || "",
     full_name: cleanedFullName || "",
     bio: (cleanedBio || "").replace(/<[^>]*>/g, ""),
    });

    if (error) {
      setSaving(false);
      setStatusMessage(`Save error: ${error.message}`);
      return;
    }

    setSaving(false);
    setStatusMessage("Profile updated successfully.");
  };

  return (
    <div style={pageShellStyle}>
      <div style={containerStyle}>
        <div style={{ display: "grid", gap: "20px" }}>
          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "14px",
                flexWrap: "wrap",
                marginBottom: "14px",
              }}
            >
              <div>
                <p
                  style={{
                    margin: "0 0 8px",
                    color: "#9ca3af",
                    fontSize: "13px",
                    letterSpacing: "0.02em",
                    textTransform: "uppercase",
                  }}
                >
                  Parapost Network
                </p>
                <h1 style={{ margin: "0 0 8px", fontSize: "30px", lineHeight: 1.1 }}>Edit Profile</h1>
                <p style={{ margin: 0, color: "#9ca3af", fontSize: "14px" }}>
                  Update your public profile details so your dashboard, profile, and notifications stay consistent.
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <Link href="/dashboard" style={{ ...secondaryButtonStyle, textDecoration: "none" }}>
                  Back to Dashboard
                </Link>
                <Link href={currentUserId ? `/profile/${currentUserId}` : "/dashboard"} style={{ ...secondaryButtonStyle, textDecoration: "none" }}>
                  View Profile
                </Link>
              </div>
            </div>

            {email ? (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12px",
                  color: "#d1d5db",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: "999px",
                  padding: "6px 10px",
                }}
              >
                Signed in as {email}
              </div>
            ) : null}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr)",
              gap: "20px",
            }}
          >
            <div style={cardStyle}>
              {loading ? (
                <p style={{ margin: 0, color: "#9ca3af" }}>Loading profile...</p>
              ) : (
                <form onSubmit={handleSave} style={{ display: "grid", gap: "18px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        width: "88px",
                        height: "88px",
                        borderRadius: "50%",
                        overflow: "hidden",
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: "28px",
                        color: "white",
                      }}
                    >
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt="Profile avatar"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <span>{getInitial(fullName, username)}</span>
                      )}
                    </div>

                    <div style={{ display: "grid", gap: "10px" }}>
                      <div style={{ color: "#d1d5db", fontWeight: 600 }}>Profile photo</div>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={secondaryButtonStyle}
                        >
                          {uploadingAvatar ? "Uploading..." : "Upload Avatar"}
                        </button>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => handleAvatarUpload(e.target.files?.[0] || null)}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="username" style={labelStyle}>
                      Username
                    </label>
                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter your username"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label htmlFor="fullName" style={labelStyle}>
                      Full Name
                    </label>
                    <input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Enter your full name"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label htmlFor="bio" style={labelStyle}>
                      Bio
                    </label>
                    <textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Tell the Parapost community a little about yourself..."
                      style={textareaStyle}
                    />
                  </div>

                  {statusMessage ? (
                    <div
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.10)",
                        color: "#f9fafb",
                        borderRadius: "20px",
                        padding: "12px 14px",
                      }}
                    >
                      {statusMessage}
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="submit" disabled={saving} style={primaryButtonStyle}>
                      {saving ? "Saving..." : "Save Changes"}
                    </button>

                    <Link
                      href={currentUserId ? `/profile/${currentUserId}` : "/dashboard"}
                      style={{ ...secondaryButtonStyle, textDecoration: "none" }}
                    >
                      Cancel
                    </Link>
                  </div>
                </form>
              )}
            </div>

            <div style={cardStyle}>
              <h3 style={{ marginTop: 0, marginBottom: "10px" }}>Profile Notes</h3>
              <div style={{ display: "grid", gap: "10px", color: "#9ca3af", lineHeight: 1.7 }}>
                <p style={{ margin: 0 }}>
                  This page updates your basic public profile information directly from the signed-in account.
                </p>
                <p style={{ margin: 0 }}>
                  It is designed as a safe route to remove the Edit Profile 404 and keep launch prep moving.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

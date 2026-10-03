"use client";

import { uploadImageWithVariant } from "@/lib/images/media-variants";
import { optimizeImageUpload, IMAGE_SOURCE_MAX_BYTES } from "@/lib/images/optimize-upload";

import { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url?: string | null;
  cover_position_x?: number | string | null;
  cover_position_y?: number | string | null;
  is_online?: boolean | null;
};

const BIO_MAX_LENGTH = 175;
const USERNAME_TAKEN_MESSAGE = "That username already exists. Please choose another one.";
const COVER_BUCKET_NAME = "profile-covers";
const COVER_MAX_SIZE_MB = IMAGE_SOURCE_MAX_BYTES / (1024 * 1024);

type StatusKind = "success" | "error" | "info";

const pageShellStyle: CSSProperties = {
  minHeight: "100dvh",
  height: "100dvh",
  overflowX: "hidden",
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
  overscrollBehaviorY: "contain",
  background: "#07090d",
  color: "white",
};

const containerStyle: CSSProperties = {
  maxWidth: "980px",
  margin: "0 auto",
  padding: "24px 16px 48px",
};

const cardStyle: CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 100%)",
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

const helperRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "10px",
  marginTop: "6px",
  color: "#9ca3af",
  fontSize: "12px",
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

function cleanText(value: string) {
  return value.trim().replace(/<[^>]*>/g, "");
}

function normalizeUsername(value: string) {
  return cleanText(value)
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .slice(0, 30);
}

function clampCoverPosition(value: number) {
  if (Number.isNaN(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isDuplicateUsernameError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message || "")
      : typeof error === "string"
        ? error
        : "";

  const normalized = message.toLowerCase();

  return (
    normalized.includes("profiles_username_key") ||
    (normalized.includes("duplicate key") && normalized.includes("username"))
  );
}

function getStatusBoxStyle(kind: StatusKind): CSSProperties {
  if (kind === "error") {
    return {
      background: "rgba(248,113,113,0.10)",
      border: "1px solid rgba(248,113,113,0.30)",
      color: "#fecaca",
      borderRadius: "20px",
      padding: "12px 14px",
      fontWeight: 700,
    };
  }

  if (kind === "success") {
    return {
      background: "rgba(52,211,153,0.10)",
      border: "1px solid rgba(52,211,153,0.28)",
      color: "#bbf7d0",
      borderRadius: "20px",
      padding: "12px 14px",
      fontWeight: 700,
    };
  }

  return {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "#f9fafb",
    borderRadius: "20px",
    padding: "12px 14px",
    fontWeight: 700,
  };
}

export default function EditProfilePage() {
  const [currentUserId, setCurrentUserId] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusKind, setStatusKind] = useState<StatusKind>("info");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [coverPositionX, setCoverPositionX] = useState(50);
  const [coverPositionY, setCoverPositionY] = useState(50);
  const [uploadingCover, setUploadingCover] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);
  const coverPreviewRef = useRef<HTMLDivElement | null>(null);
  const coverDragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    startX: number;
    startY: number;
    pointerType: string;
  } | null>(null);
  const [coverDragging, setCoverDragging] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setLoading(false);
        setStatusKind("error");
        setStatusMessage("You need to be logged in to edit your profile.");
        return;
      }

      setCurrentUserId(user.id);
      setEmail(user.email || "");

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, bio, avatar_url, cover_url, cover_position_x, cover_position_y, is_online")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        setLoading(false);
        setStatusKind("error");
        setStatusMessage(`Could not load profile: ${error.message}`);
        return;
      }

      const profile = data as ProfileRow | null;

      setUsername(profile?.username || "");
      setFullName(profile?.full_name || "");
      setBio((profile?.bio || "").slice(0, BIO_MAX_LENGTH));
      setAvatarUrl(profile?.avatar_url || "");
      setCoverUrl(profile?.cover_url || "");
      setCoverPositionX(clampCoverPosition(Number(profile?.cover_position_x ?? 50)));
      setCoverPositionY(clampCoverPosition(Number(profile?.cover_position_y ?? 50)));
      setLoading(false);
    };

    loadProfile();
  }, []);

  const handleAvatarUpload = async (file: File | null) => {
    if (!file || !currentUserId) return;

    setUploadingAvatar(true);
    setStatusMessage("");
    setStatusKind("info");

    let optimizedFile: File;
    try {
      optimizedFile = (await optimizeImageUpload(file, "avatar")).file;
    } catch (error) {
      setUploadingAvatar(false);
      setStatusKind("error");
      setStatusMessage(error instanceof Error ? error.message : "This image could not be prepared. Please try another photo.");
      return;
    }
    const extension = optimizedFile.name.split(".").pop()!;
    let fileName = `${currentUserId}-${Date.now()}.${extension}`;

    const { error: uploadError, path: uploadedPath } = await uploadImageWithVariant(
      supabase.storage.from("avatars"), fileName, optimizedFile, "avatar", { contentType: optimizedFile.type, cacheControl: "3600", upsert: false });
    fileName = uploadedPath;

    if (uploadError) {
      setUploadingAvatar(false);
      setStatusKind("error");
      setStatusMessage(`Avatar upload error: ${uploadError.message}`);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(fileName);

    const nextAvatarUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: nextAvatarUrl })
      .eq("id", currentUserId);

    if (updateError) {
      setUploadingAvatar(false);
      setStatusKind("error");
      setStatusMessage(`Avatar save error: ${updateError.message}`);
      return;
    }

    setAvatarUrl(nextAvatarUrl);
    setUploadingAvatar(false);
    setStatusKind("success");
    setStatusMessage("Avatar updated.");
  };

  const handleCoverUpload = async (file: File | null) => {
    if (!file || !currentUserId) return;

    if (!file.type.startsWith("image/")) {
      setStatusKind("error");
      setStatusMessage("Please choose a cover photo image file.");
      return;
    }

    if (file.size > COVER_MAX_SIZE_MB * 1024 * 1024) {
      setStatusKind("error");
      setStatusMessage(`Please choose a cover photo under ${COVER_MAX_SIZE_MB}MB.`);
      return;
    }

    setUploadingCover(true);
    setStatusMessage("");
    setStatusKind("info");

    let optimizedFile: File;
    try {
      optimizedFile = (await optimizeImageUpload(file, "cover")).file;
    } catch (error) {
      setUploadingCover(false);
      setStatusKind("error");
      setStatusMessage(error instanceof Error ? error.message : "This image could not be prepared. Please try another photo.");
      return;
    }
    const extension = optimizedFile.name.split(".").pop()!;
    const fileName = `${currentUserId}/cover-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(COVER_BUCKET_NAME)
      .upload(fileName, optimizedFile, { contentType: optimizedFile.type, cacheControl: "604800", upsert: false });

    if (uploadError) {
      setUploadingCover(false);
      setStatusKind("error");
      setStatusMessage(`Cover upload error: ${uploadError.message}`);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from(COVER_BUCKET_NAME)
      .getPublicUrl(fileName);

    const nextCoverUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        cover_url: nextCoverUrl,
        cover_position_x: coverPositionX,
        cover_position_y: coverPositionY,
      })
      .eq("id", currentUserId);

    if (updateError) {
      setUploadingCover(false);
      setStatusKind("error");
      setStatusMessage(`Cover save error: ${updateError.message}`);
      return;
    }

    setCoverUrl(nextCoverUrl);
    setUploadingCover(false);
    setStatusKind("success");
    setStatusMessage("Cover photo updated. Drag the preview or use the sliders to fine-tune, then save changes.");
  };

  const updateCoverPositionFromPointer = (clientX: number, clientY: number) => {
    const preview = coverPreviewRef.current;
    const dragStart = coverDragStartRef.current;
    if (!preview || !dragStart) return;

    const rect = preview.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    // Mobile/tablet users need a controlled touch adjustment rather than a harsh jump.
    // This uses movement from the original touch point, so the cover can be nudged into place
    // across many phone sizes while still allowing enough range for meaningful adjustments.
    const isTouchLike = dragStart.pointerType === "touch" || dragStart.pointerType === "pen";
    const sensitivity = isTouchLike ? 0.74 : 0.92;
    const deltaX = ((clientX - dragStart.pointerX) / rect.width) * 100 * sensitivity;
    const deltaY = ((clientY - dragStart.pointerY) / rect.height) * 100 * sensitivity;

    const nextX = clampCoverPosition(dragStart.startX + deltaX);
    const nextY = clampCoverPosition(dragStart.startY + deltaY);

    setCoverPositionX(nextX);
    setCoverPositionY(nextY);
  };

  const handleCoverPreviewPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!coverUrl) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    coverDragStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: coverPositionX,
      startY: coverPositionY,
      pointerType: event.pointerType || "mouse",
    };
    setCoverDragging(true);
  };

  const handleCoverPreviewPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!coverUrl || !coverDragging || !coverDragStartRef.current) return;

    event.preventDefault();
    updateCoverPositionFromPointer(event.clientX, event.clientY);
  };

  const handleCoverPreviewPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    coverDragStartRef.current = null;
    setCoverDragging(false);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();

    if (!currentUserId) {
      setStatusKind("error");
      setStatusMessage("You need to be logged in to save changes.");
      return;
    }

    setSaving(true);
    setStatusMessage("");
    setStatusKind("info");

    const cleanedUsername = normalizeUsername(username);
    const cleanedFullName = cleanText(fullName);
    const cleanedBio = cleanText(bio).slice(0, BIO_MAX_LENGTH);

    if (!cleanedUsername) {
      setSaving(false);
      setStatusKind("error");
      setStatusMessage("Please choose a username before saving your profile.");
      return;
    }

    const { data: existingUsernameOwner, error: usernameLookupError } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", cleanedUsername)
      .neq("id", currentUserId)
      .maybeSingle();

    if (usernameLookupError) {
      setSaving(false);
      setStatusKind("error");
      setStatusMessage("We couldn’t check that username. Please try again.");
      return;
    }

    if (existingUsernameOwner) {
      setSaving(false);
      setStatusKind("error");
      setStatusMessage(USERNAME_TAKEN_MESSAGE);
      return;
    }

    const { error } = await supabase.from("profiles").upsert({
      id: currentUserId,
      username: cleanedUsername,
      full_name: cleanedFullName || "",
      bio: cleanedBio || "",
      cover_url: coverUrl || null,
      cover_position_x: coverPositionX,
      cover_position_y: coverPositionY,
    });

    if (error) {
      setSaving(false);
      setStatusKind("error");
      setStatusMessage(
        isDuplicateUsernameError(error)
          ? USERNAME_TAKEN_MESSAGE
          : "We couldn’t save your profile changes. Please try again."
      );
      return;
    }

    setUsername(cleanedUsername);
    setBio(cleanedBio);
    setSaving(false);
    setStatusKind("success");
    setStatusMessage("Profile updated successfully.");
  };

  return (
    <div className="edit-profile-scroll-root" style={pageShellStyle}>
      <style>{`
        html:has(.edit-profile-scroll-root),
        body:has(.edit-profile-scroll-root) {
          height: 100% !important;
          overflow: hidden !important;
          overscroll-behavior-y: contain !important;
        }

        .edit-profile-scroll-root {
          min-height: 100dvh !important;
          height: 100dvh !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch !important;
          overscroll-behavior-y: contain !important;
          touch-action: pan-y !important;
        }

        .edit-profile-page-container {
          padding-bottom: calc(72px + env(safe-area-inset-bottom)) !important;
        }

        .cover-editor-block {
          scroll-margin-top: 18px;
        }

        .cover-main-preview {
          min-height: clamp(240px, 34vw, 330px) !important;
        }

        .cover-control-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 14px;
        }

        .cover-preview-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          align-items: start;
        }

        .cover-device-preview-card {
          display: grid;
          gap: 7px;
          min-width: 0;
        }

        .cover-device-preview-box {
          width: 100%;
        }

        .profile-photo-edit-section {
          margin-top: 8px;
          padding-top: 22px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }

        @media (max-width: 720px) {
          .edit-profile-scroll-root {
            height: 100dvh !important;
            min-height: 100dvh !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            -webkit-overflow-scrolling: touch !important;
            touch-action: pan-y !important;
          }

          .edit-profile-page-container input:not([type="range"]):not([type="checkbox"]),
          .edit-profile-page-container select,
          .edit-profile-page-container textarea {
            font-size: 16px !important;
            min-width: 0;
            max-width: 100%;
          }

          .edit-profile-page-container button {
            min-height: 44px;
          }

          .edit-profile-page-container {
            padding: 14px 10px calc(118px + env(safe-area-inset-bottom)) !important;
          }

          .cover-editor-block {
            gap: 16px !important;
          }

          .cover-main-preview {
            min-height: 255px !important;
            border-radius: 20px !important;
          }

          .cover-control-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }

          .cover-preview-grid {
            grid-template-columns: 1fr !important;
            gap: 14px !important;
          }

          .cover-device-preview-box {
            border-radius: 18px !important;
          }

          .cover-device-preview-desktop .cover-device-preview-box {
            height: 96px !important;
          }

          .cover-device-preview-tablet .cover-device-preview-box {
            height: 116px !important;
          }

          .cover-device-preview-mobile .cover-device-preview-box {
            height: 190px !important;
          }

          .profile-photo-edit-section {
            margin-top: 12px !important;
            padding-top: 24px !important;
          }
        }

        @media (min-width: 721px) and (max-width: 1024px) {
          .edit-profile-scroll-root {
            height: 100dvh !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
          }

          .edit-profile-page-container {
            padding: 22px 18px calc(92px + env(safe-area-inset-bottom)) !important;
          }
        }
      `}</style>
      <div className="edit-profile-page-container" style={containerStyle}>
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

                <h1
                  style={{
                    margin: "0 0 8px",
                    fontSize: "30px",
                    lineHeight: 1.1,
                  }}
                >
                  Edit Profile
                </h1>

                <p style={{ margin: 0, color: "#9ca3af", fontSize: "14px" }}>
                  Update your public profile details so your dashboard, profile,
                  and notifications stay consistent.
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
                <Link
                  href="/dashboard"
                  style={{ ...secondaryButtonStyle, textDecoration: "none" }}
                >
                  Back to Dashboard
                </Link>

                <Link
                  href={currentUserId ? `/profile/${currentUserId}` : "/dashboard"}
                  style={{ ...secondaryButtonStyle, textDecoration: "none" }}
                >
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
                <p style={{ margin: 0, color: "#9ca3af" }}>
                  Loading profile...
                </p>
              ) : (
                <form
                  onSubmit={handleSave}
                  style={{ display: "grid", gap: "18px" }}
                >
                  <div className="cover-editor-block" style={{ display: "grid", gap: "14px" }}>
                    <div>
                      <label style={labelStyle}>Cover photo</label>
                      <p style={{ margin: "0 0 12px", color: "#9ca3af", fontSize: "13px", lineHeight: 1.6 }}>
                        Upload one cover image. Drag the large preview with your mouse or finger, then use the sliders only if you need small adjustments.
                      </p>
                    </div>

                    <div
                      className="cover-main-preview"
                      ref={coverPreviewRef}
                      role={coverUrl ? "button" : undefined}
                      tabIndex={coverUrl ? 0 : undefined}
                      aria-label={coverUrl ? "Drag to reposition cover photo" : undefined}
                      onPointerDown={handleCoverPreviewPointerDown}
                      onPointerMove={handleCoverPreviewPointerMove}
                      onPointerUp={handleCoverPreviewPointerEnd}
                      onPointerCancel={handleCoverPreviewPointerEnd}
                      onLostPointerCapture={handleCoverPreviewPointerEnd}
                      style={{
                        position: "relative",
                        minHeight: "210px",
                        borderRadius: "24px",
                        overflow: "hidden",
                        border: coverDragging
                          ? "1px solid rgba(216,180,254,0.46)"
                          : "1px solid rgba(216,180,254,0.18)",
                        backgroundColor: coverUrl ? "#0b0f19" : "#0f1020",
                        backgroundImage: coverUrl
                          ? `linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.44)), url(${coverUrl})`
                          : "radial-gradient(circle at 50% 30%, rgba(168,85,247,0.62) 0%, rgba(88,28,135,0.35) 28%, rgba(3,7,18,0.78) 58%), linear-gradient(135deg, #0f1020 0%, #16162a 44%, #05070b 100%)",
                        backgroundSize: "cover",
                        backgroundPosition: `${coverPositionX}% ${coverPositionY}%`,
                        backgroundRepeat: "no-repeat",
                        boxShadow: coverDragging
                          ? "0 22px 58px rgba(0,0,0,0.34), 0 0 0 1px rgba(168,85,247,0.20) inset"
                          : "0 18px 48px rgba(0,0,0,0.28)",
                        cursor: coverUrl ? (coverDragging ? "grabbing" : "grab") : "default",
                        touchAction: "none",
                        overscrollBehavior: "contain",
                        userSelect: "none",
                        WebkitUserSelect: "none",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "linear-gradient(180deg, rgba(0,0,0,0.00), rgba(0,0,0,0.52))",
                          pointerEvents: "none",
                        }}
                      />

                      {coverUrl ? (
                        <>
                          <div
                            style={{
                              position: "absolute",
                              left: `${coverPositionX}%`,
                              top: 0,
                              bottom: 0,
                              width: "1px",
                              background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.28), transparent)",
                              pointerEvents: "none",
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              top: `${coverPositionY}%`,
                              left: 0,
                              right: 0,
                              height: "1px",
                              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)",
                              pointerEvents: "none",
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              left: `${coverPositionX}%`,
                              top: `${coverPositionY}%`,
                              width: "18px",
                              height: "18px",
                              borderRadius: "999px",
                              border: "2px solid rgba(255,255,255,0.92)",
                              background: "rgba(168,85,247,0.76)",
                              boxShadow: "0 0 0 5px rgba(168,85,247,0.18), 0 8px 20px rgba(0,0,0,0.34)",
                              transform: "translate(-50%, -50%)",
                              pointerEvents: "none",
                            }}
                          />
                        </>
                      ) : null}

                      {coverUrl ? (
                        <div
                          style={{
                            position: "absolute",
                            top: "14px",
                            left: "14px",
                            zIndex: 2,
                            borderRadius: "999px",
                            padding: "7px 10px",
                            border: "1px solid rgba(255,255,255,0.16)",
                            background: "rgba(3,7,18,0.48)",
                            color: "#f8fafc",
                            fontSize: "12px",
                            fontWeight: 900,
                            letterSpacing: "0.02em",
                            backdropFilter: "blur(12px)",
                          }}
                        >
                          {coverDragging ? "Fine-tuning cover…" : "Drag or touch to reposition"}
                        </div>
                      ) : null}

                      <div
                        style={{
                          position: "absolute",
                          left: "18px",
                          right: "18px",
                          bottom: "16px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "12px", color: "#c084fc", fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                            Responsive cover
                          </div>
                          <div style={{ fontSize: "13px", color: "#e5e7eb", marginTop: "4px" }}>
                            Drag to position. One cover adapts everywhere.
                          </div>
                        </div>

                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={() => coverFileInputRef.current?.click()}
                          style={secondaryButtonStyle}
                          disabled={uploadingCover}
                        >
                          {uploadingCover ? "Uploading..." : coverUrl ? "Change Cover" : "Upload Cover"}
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        border: "1px solid rgba(216,180,254,0.12)",
                        background: "rgba(168,85,247,0.055)",
                        borderRadius: "18px",
                        padding: "12px 14px",
                        color: "#d8b4fe",
                        fontSize: "12px",
                        lineHeight: 1.6,
                        fontWeight: 700,
                      }}
                    >
                      Tip: keep important faces, logos, and text near the center. Parapost will crop the same cover differently on desktop, tablet, and mobile.
                    </div>

                    <input
                      ref={coverFileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(event) =>
                        handleCoverUpload(event.target.files?.[0] || null)
                      }
                    />

                    <div className="cover-control-grid">
                      <div>
                        <label htmlFor="coverPositionX" style={labelStyle}>
                          Horizontal focus
                        </label>
                        <input
                          id="coverPositionX"
                          type="range"
                          min="0"
                          max="100"
                          value={coverPositionX}
                          onChange={(event) => setCoverPositionX(clampCoverPosition(Number(event.target.value)))}
                          style={{ width: "100%" }}
                        />
                        <div style={helperRowStyle}>
                          <span>Drag/touch preview or fine-tune left/right.</span>
                          <span>{coverPositionX}%</span>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="coverPositionY" style={labelStyle}>
                          Vertical focus
                        </label>
                        <input
                          id="coverPositionY"
                          type="range"
                          min="0"
                          max="100"
                          value={coverPositionY}
                          onChange={(event) => setCoverPositionY(clampCoverPosition(Number(event.target.value)))}
                          style={{ width: "100%" }}
                        />
                        <div style={helperRowStyle}>
                          <span>Drag/touch preview or fine-tune up/down.</span>
                          <span>{coverPositionY}%</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: "10px" }}>
                      <div>
                        <div style={{ color: "#e5e7eb", fontSize: "13px", fontWeight: 900 }}>
                          Device previews
                        </div>
                        <div style={{ color: "#9ca3af", fontSize: "12px", marginTop: "4px", lineHeight: 1.5 }}>
                          These previews show how the same cover focus adapts across different screens.
                        </div>
                      </div>

                      <div className="cover-preview-grid">
                      {[
                        { label: "Desktop", height: 88 },
                        { label: "Tablet", height: 110 },
                        { label: "Mobile", height: 136 },
                      ].map((preview) => (
                        <div key={preview.label} className={`cover-device-preview-card cover-device-preview-${preview.label.toLowerCase()}`} style={{ display: "grid", gap: "7px" }}>
                          <div style={{ fontSize: "12px", color: "#9ca3af", fontWeight: 800 }}>
                            {preview.label} preview
                          </div>
                          <div
                            className="cover-device-preview-box"
                            style={{
                              height: `${preview.height}px`,
                              borderRadius: "16px",
                              border: "1px solid rgba(255,255,255,0.10)",
                              backgroundColor: coverUrl ? "#0b0f19" : "#111827",
                              backgroundImage: coverUrl
                                ? `url(${coverUrl})`
                                : "radial-gradient(circle at 50% 30%, rgba(168,85,247,0.54), rgba(15,23,42,0.9))",
                              backgroundSize: "cover",
                              backgroundPosition: `${coverPositionX}% ${coverPositionY}%`,
                              backgroundRepeat: "no-repeat",
                              overflow: "hidden",
                            }}
                          />
                        </div>
                      ))}
                      </div>
                    </div>
                  </div>

                  <div
                    className="profile-photo-edit-section"
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
                      <div style={{ color: "#d1d5db", fontWeight: 600 }}>
                        Profile photo
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={secondaryButtonStyle}
                          disabled={uploadingAvatar}
                        >
                          {uploadingAvatar ? "Uploading..." : "Upload Avatar"}
                        </button>
                      </div>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(event) =>
                          handleAvatarUpload(event.target.files?.[0] || null)
                        }
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
                      onChange={(event) => {
                        setUsername(event.target.value);
                        if (statusMessage === USERNAME_TAKEN_MESSAGE) {
                          setStatusMessage("");
                        }
                      }}
                      placeholder="Enter your username"
                      style={inputStyle}
                    />

                    <div style={helperRowStyle}>
                      <span>Letters, numbers, underscores, or a clean display name.</span>
                      <span>{normalizeUsername(username).length}/30</span>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="fullName" style={labelStyle}>
                      Full Name
                    </label>

                    <input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
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
                      onChange={(event) => setBio(event.target.value)}
                      maxLength={BIO_MAX_LENGTH}
                      placeholder="Tell the Parapost community a little about yourself..."
                      style={textareaStyle}
                    />

                    <div style={helperRowStyle}>
                      <span>Keep it short and clear for your public profile.</span>
                      <span>{bio.length}/{BIO_MAX_LENGTH}</span>
                    </div>
                  </div>

                  {statusMessage ? (
                    <div style={getStatusBoxStyle(statusKind)}>
                      {statusMessage}
                    </div>
                  ) : null}

                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="submit"
                      disabled={saving}
                      style={{
                        ...primaryButtonStyle,
                        opacity: saving ? 0.7 : 1,
                        cursor: saving ? "not-allowed" : "pointer",
                      }}
                    >
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
              <h3 style={{ marginTop: 0, marginBottom: "10px" }}>
                Profile Notes
              </h3>

              <div
                style={{
                  display: "grid",
                  gap: "10px",
                  color: "#9ca3af",
                  lineHeight: 1.7,
                }}
              >
                <p style={{ margin: 0 }}>
                  This page updates your basic public profile information directly
                  from the signed-in account.
                </p>

                <p style={{ margin: 0 }}>
                  Bio is limited to {BIO_MAX_LENGTH} characters to keep profile
                  headers clean and consistent across desktop, tablet, and mobile. Cover photo focus settings help one uploaded cover fit across devices.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

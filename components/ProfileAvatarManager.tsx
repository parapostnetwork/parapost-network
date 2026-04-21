"use client";

import { ChangeEvent, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type ProfileAvatarManagerProps = {
  currentUserId: string;
  initialAvatarUrl?: string | null;
  onAvatarUpdated?: (nextAvatarUrl: string | null) => void;
};

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_FILE_SIZE_MB = 5;
const BUCKET_NAME = "avatars";

export default function ProfileAvatarManager({
  currentUserId,
  initialAvatarUrl = null,
  onAvatarUpdated,
}: ProfileAvatarManagerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialAvatarUrl);
  const [statusMessage, setStatusMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  const validateFile = (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return "Please upload a JPG, PNG, or WEBP image.";
    }

    const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      return `Please upload an image under ${MAX_FILE_SIZE_MB}MB.`;
    }

    return null;
  };

  const uploadAvatar = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setStatusMessage(validationError);
      return;
    }

    setStatusMessage("");
    setIsUploading(true);

    try {
      const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const safeExt = ["jpg", "jpeg", "png", "webp"].includes(fileExt) ? fileExt : "jpg";
      const filePath = `${currentUserId}/avatar-${Date.now()}.${safeExt}`;

      const oldAvatarPath = getStoragePathFromUrl(avatarUrl);

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);

      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", currentUserId);

      if (profileUpdateError) {
        throw profileUpdateError;
      }

      if (oldAvatarPath && oldAvatarPath !== filePath) {
        await supabase.storage.from(BUCKET_NAME).remove([oldAvatarPath]);
      }

      setAvatarUrl(publicUrl);
      setPreviewUrl(publicUrl);
      setStatusMessage("Avatar updated successfully.");
      onAvatarUpdated?.(publicUrl);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong while uploading the avatar.";
      setStatusMessage(`Upload error: ${message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setStatusMessage(validationError);
      event.target.value = "";
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);

    await uploadAvatar(file);

    event.target.value = "";
  };

  const handleRemoveAvatar = async () => {
    setStatusMessage("");
    setIsRemoving(true);

    try {
      const oldAvatarPath = getStoragePathFromUrl(avatarUrl);

      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", currentUserId);

      if (profileUpdateError) {
        throw profileUpdateError;
      }

      if (oldAvatarPath) {
        await supabase.storage.from(BUCKET_NAME).remove([oldAvatarPath]);
      }

      setAvatarUrl(null);
      setPreviewUrl(null);
      setStatusMessage("Avatar removed successfully.");
      onAvatarUpdated?.(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong while removing the avatar.";
      setStatusMessage(`Remove error: ${message}`);
    } finally {
      setIsRemoving(false);
    }
  };

  const initials = "U";

  return (
    <div
      style={{
        width: "100%",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "20px",
        padding: "18px",
        background: "rgba(255,255,255,0.04)",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
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
            width: "96px",
            height: "96px",
            borderRadius: "999px",
            overflow: "hidden",
            position: "relative",
            background: "rgba(255,255,255,0.08)",
            border: "2px solid rgba(255,255,255,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Profile avatar"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : (
            <span
              style={{
                fontSize: "30px",
                fontWeight: 700,
                color: "#ffffff",
              }}
            >
              {initials}
            </span>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            flex: 1,
            minWidth: "220px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "17px",
                fontWeight: 700,
                color: "#ffffff",
                marginBottom: "4px",
              }}
            >
              Profile photo
            </div>
            <div
              style={{
                fontSize: "14px",
                color: "rgba(255,255,255,0.72)",
                lineHeight: 1.5,
              }}
            >
              Upload a clear square image for the best result. JPG, PNG, or WEBP up to 5MB.
            </div>
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
              onClick={handleChooseFile}
              disabled={isUploading || isRemoving}
              style={buttonStyle}
            >
              {isUploading ? "Uploading..." : "Upload avatar"}
            </button>

            <button
              type="button"
              onClick={handleRemoveAvatar}
              disabled={isUploading || isRemoving || !avatarUrl}
              style={{
                ...buttonStyle,
                opacity: !avatarUrl ? 0.55 : 1,
              }}
            >
              {isRemoving ? "Removing..." : "Remove avatar"}
            </button>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      {statusMessage ? (
        <div
          style={{
            fontSize: "13px",
            color: statusMessage.toLowerCase().includes("error") ? "#ff8e8e" : "#9ff0a8",
            lineHeight: 1.5,
          }}
        >
          {statusMessage}
        </div>
      ) : null}
    </div>
  );
}

const buttonStyle = {
  border: "none",
  borderRadius: "12px",
  padding: "10px 16px",
  background: "#ffffff",
  color: "#111111",
  fontWeight: 700,
  cursor: "pointer" as const,
};

function getStoragePathFromUrl(url: string | null | undefined) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${BUCKET_NAME}/`;
    const index = parsed.pathname.indexOf(marker);

    if (index === -1) return null;

    return decodeURIComponent(parsed.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

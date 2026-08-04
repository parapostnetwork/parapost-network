"use client";

import {
  ChangeEvent,
  CSSProperties,
  DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";

type UploadedReel = {
  id: string;
  user_id: string;
  creator_profile_id: string;
  title: string;
  creator: string;
  creatorName: string;
  creatorAvatarUrl?: string;
  caption: string;
  video: string;
  poster: string;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  createdAt?: string;
};

type ReelUploadModalProps = {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  onUploadSuccess: (newReel: UploadedReel) => void;
};

type ProfileRow = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type MobileStep = "select" | "preview" | "details";

const REEL_CAPTION_MAX_LENGTH = 4000;
const MAX_REEL_DURATION_SECONDS = 60;
const MAX_REEL_DURATION_TOLERANCE_SECONDS = 0.35;
const REEL_TOO_LONG_MESSAGE = `This video is longer than ${MAX_REEL_DURATION_SECONDS} seconds. Please choose a shorter video for Parapost Reels.`;

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.72)",
  backdropFilter: "blur(8px)",
  zIndex: 120,
};

const wrapStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "18px",
  zIndex: 130,
};

const buttonStyle: CSSProperties = {
  borderRadius: "999px",
  padding: "12px 18px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.07)",
  color: "white",
  fontWeight: 800,
  fontSize: "14px",
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  borderRadius: "999px",
  padding: "12px 20px",
  border: "none",
  background: "linear-gradient(135deg, #ffffff, #e9d5ff)",
  color: "#07090d",
  fontWeight: 900,
  fontSize: "14px",
  cursor: "pointer",
  boxShadow: "0 16px 34px rgba(168,85,247,0.20)",
};

const disabledButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  opacity: 0.5,
  cursor: "not-allowed",
  boxShadow: "none",
};

const ghostButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "rgba(255,255,255,0.035)",
};

const labelStyle: CSSProperties = {
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#9ca3af",
  marginBottom: "8px",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "rgba(255,255,255,0.045)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "18px",
  padding: "14px 16px",
  fontSize: "14px",
  outline: "none",
};

const textAreaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: "118px",
  resize: "vertical",
  fontFamily: "inherit",
  lineHeight: 1.5,
};

const filePickerStyle: CSSProperties = {
  position: "relative",
  borderRadius: "26px",
  border: "1px solid rgba(255,255,255,0.12)",
  background:
    "radial-gradient(circle at 50% 0%, rgba(168,85,247,0.17), transparent 46%), rgba(255,255,255,0.035)",
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  overflow: "hidden",
};

const createFileName = (prefix: string, extension: string) => {
  const safeExt = extension.replace(/^\./, "").toLowerCase() || "mp4";
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExt}`;
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function extractFileExtension(fileName: string) {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "mp4";
}

function isOverReelDurationLimit(duration: number) {
  return duration > MAX_REEL_DURATION_SECONDS + MAX_REEL_DURATION_TOLERANCE_SECONDS;
}

function getReadableVideoDuration(video: HTMLVideoElement) {
  const duration = video.duration;
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

async function getVideoDuration(file: File) {
  return await new Promise<number>((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    let settled = false;
    let bestDuration = 0;
    let acceptShortDurationTimer: number | null = null;
    let timeoutTimer: number | null = null;

    const cleanup = () => {
      if (acceptShortDurationTimer) window.clearTimeout(acceptShortDurationTimer);
      if (timeoutTimer) window.clearTimeout(timeoutTimer);
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };

    const finish = (duration: number) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(duration);
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Could not read the selected video."));
    };

    const checkDuration = () => {
      const duration = getReadableVideoDuration(video);
      if (duration > bestDuration) bestDuration = duration;

      if (isOverReelDurationLimit(bestDuration)) {
        finish(bestDuration);
        return;
      }

      // Some mobile browsers update video duration shortly after metadata loads.
      // Wait a moment before accepting a short duration so longer videos are not
      // accidentally treated like 7-10 second clips.
      if (bestDuration > 0 && !acceptShortDurationTimer) {
        acceptShortDurationTimer = window.setTimeout(() => finish(bestDuration), 1500);
      }
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      checkDuration();

      // Force the browser to resolve the real end time when possible.
      // This helps prevent some mobile uploads from being misread as a short
      // 7-10 second clip when the selected video is actually longer.
      try {
        video.currentTime = Number.MAX_SAFE_INTEGER;
      } catch {
        // Some browsers do not allow seeking before enough metadata is ready.
      }
    };

    video.ondurationchange = checkDuration;
    video.oncanplay = checkDuration;
    video.onseeked = checkDuration;
    video.onerror = fail;

    timeoutTimer = window.setTimeout(() => {
      if (bestDuration > 0) {
        finish(bestDuration);
        return;
      }

      fail();
    }, 8000);

    video.src = objectUrl;
    video.load();
  });
}

async function generatePosterFromFile(file: File, seekTo = 0.6) {
  return await new Promise<Blob>((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);

    video.playsInline = true;
    video.muted = true;
    video.preload = "metadata";
    video.src = objectUrl;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };

    video.onloadedmetadata = () => {
      const targetTime =
        Number.isFinite(video.duration) && video.duration > seekTo
          ? seekTo
          : Math.max(0, video.duration * 0.2 || 0);
      video.currentTime = targetTime;
    };

    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 720;
      canvas.height = video.videoHeight || 1280;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        cleanup();
        reject(new Error("Could not generate reel cover image."));
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          cleanup();
          if (!blob) {
            reject(new Error("Could not generate reel cover image."));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        0.9,
      );
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Could not generate reel cover image."));
    };
  });
}

function getViewportType(width: number) {
  if (width <= 899) return "mobile";
  if (width <= 1200) return "tablet";
  return "desktop";
}

export default function ReelUploadModal({
  isOpen,
  onClose,
  userId,
  onUploadSuccess,
}: ReelUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isGeneratingPoster, setIsGeneratingPoster] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1400);
  const [mobileStep, setMobileStep] = useState<MobileStep>("select");

  const viewportType = getViewportType(viewportWidth);
  const isMobile = viewportType === "mobile";
  const isReadyToUpload =
    !!selectedVideo && !!userId && title.trim().length > 0 && !isUploading;
  const publishButtonLabel = isUploading
    ? isGeneratingPoster
      ? "Preparing..."
      : "Uploading..."
    : "Publish Reel";

  const creatorHandle = useMemo(() => {
    const raw = profile?.username?.trim();
    return raw ? `@${raw.replace(/^@+/, "")}` : "@you";
  }, [profile]);

  const creatorName = useMemo(() => {
    return profile?.display_name?.trim() || profile?.username?.trim() || "You";
  }, [profile]);

  const statusText = isUploading
    ? isGeneratingPoster
      ? "Generating cover image..."
      : "Uploading reel..."
    : isPreparing
      ? "Preparing preview..."
      : selectedVideo
        ? "Ready"
        : "Waiting";

  const clearTransientMessages = () => {
    setErrorMessage("");
    setSuccessMessage("");
  };

  const resetState = () => {
    setSelectedVideo(null);
    setTitle("");
    setCaption("");
    setVideoDuration(0);
    setDragActive(false);
    setErrorMessage("");
    setSuccessMessage("");
    setIsUploading(false);
    setIsPreparing(false);
    setIsGeneratingPoster(false);
    setMobileStep("select");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    if (isUploading) return;
    resetState();
    onClose();
  };

  const handleRemoveVideo = () => {
    setSelectedVideo(null);
    setVideoDuration(0);
    setTitle("");
    setCaption("");
    setMobileStep("select");
    clearTransientMessages();

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    const setWidth = () => setViewportWidth(window.innerWidth);
    setWidth();
    window.addEventListener("resize", setWidth);
    return () => window.removeEventListener("resize", setWidth);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const loadProfile = async () => {
      if (!userId) {
        setProfile(null);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("id", userId)
        .maybeSingle();

      if (data) {
        setProfile(data);
      } else {
        setProfile({
          id: userId,
          username: "you",
          display_name: "You",
          avatar_url: null,
        });
      }
    };

    loadProfile();
  }, [isOpen, userId]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isUploading) {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  });

  useEffect(() => {
    if (!selectedVideo) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl("");
      setVideoDuration(0);
      return;
    }

    const nextUrl = URL.createObjectURL(selectedVideo);
    setPreviewUrl(nextUrl);

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [selectedVideo]);

  useEffect(() => {
    if (!isOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [isOpen]);

  const processVideoFile = async (file: File) => {
    clearTransientMessages();

    if (!file.type.startsWith("video/")) {
      setErrorMessage("Please choose a video file.");
      return;
    }

    setIsPreparing(true);

    try {
      const duration = await getVideoDuration(file);

      if (isOverReelDurationLimit(duration)) {
        setErrorMessage(REEL_TOO_LONG_MESSAGE);
        setSelectedVideo(null);
        setVideoDuration(0);
        setMobileStep("select");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      setSelectedVideo(file);
      setVideoDuration(duration);

      if (!title.trim()) {
        const cleanedName = file.name.replace(/\.[^.]+$/, "").trim();
        setTitle(cleanedName.slice(0, 80));
      }

      if (isMobile) {
        setMobileStep("preview");
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("Could not read that video. Try another file.");
    } finally {
      setIsPreparing(false);
    }
  };

  const handleFileInputChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await processVideoFile(file);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    await processVideoFile(file);
  };

  const handleUpload = async () => {
    if (isUploading) return;
    clearTransientMessages();

    if (!userId) {
      setErrorMessage("You need to be signed in to upload a reel.");
      return;
    }

    if (!selectedVideo) {
      setErrorMessage("Choose a video first.");
      if (isMobile) setMobileStep("select");
      return;
    }

    if (!title.trim()) {
      setErrorMessage("Add a reel title before uploading.");
      if (isMobile) setMobileStep("details");
      return;
    }

    let confirmedDuration = videoDuration;

    try {
      setIsPreparing(true);
      confirmedDuration = await getVideoDuration(selectedVideo);
    } catch {
      setErrorMessage("Could not confirm this video length. Please try another video.");
      setIsPreparing(false);
      if (isMobile) setMobileStep("select");
      return;
    }

    setIsPreparing(false);

    if (isOverReelDurationLimit(confirmedDuration)) {
      setErrorMessage(REEL_TOO_LONG_MESSAGE);
      setSelectedVideo(null);
      setPreviewUrl("");
      setVideoDuration(0);
      setMobileStep("select");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setVideoDuration(confirmedDuration);
    setIsUploading(true);

    let videoPath = "";
    let posterPath = "";

    try {
      const extension = extractFileExtension(selectedVideo.name);
      const videoFileName = createFileName("reel-video", extension);
      const posterFileName = createFileName("reel-poster", "jpg");

      setIsGeneratingPoster(true);
      const posterBlob = await generatePosterFromFile(selectedVideo);
      setIsGeneratingPoster(false);

      videoPath = `${userId}/${videoFileName}`;
      posterPath = `${userId}/${posterFileName}`;

      let finalVideoUploadError: { message?: string } | null = null;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { error } = await supabase.storage
          .from("reels")
          .upload(videoPath, selectedVideo, {
            cacheControl: "604800",
            upsert: false,
            contentType: selectedVideo.type || "video/mp4",
          });

        if (!error) {
          finalVideoUploadError = null;
          break;
        }

        finalVideoUploadError = error;
      }

      if (finalVideoUploadError) {
        throw new Error(
          finalVideoUploadError.message || "Video upload failed.",
        );
      }

      const { error: posterUploadError } = await supabase.storage
        .from("reel-posters")
        .upload(posterPath, posterBlob, {
          cacheControl: "3600",
          upsert: false,
          contentType: "image/jpeg",
        });

      if (posterUploadError) {
        throw new Error(posterUploadError.message || "Poster upload failed.");
      }

      const { data: videoPublic } = supabase.storage
        .from("reels")
        .getPublicUrl(videoPath);
      const { data: posterPublic } = supabase.storage
        .from("reel-posters")
        .getPublicUrl(posterPath);

      const publicVideoUrl = videoPublic.publicUrl;
      const publicPosterUrl = posterPublic.publicUrl;
      const createdAt = new Date().toISOString();

      const insertPayload = {
        user_id: userId,
        creator_profile_id: userId,
        title: title.trim(),
        caption: caption.trim(),
        video_url: publicVideoUrl,
        poster_url: publicPosterUrl,
        duration_seconds: Math.round(confirmedDuration),
        likes_count: 0,
        created_at: createdAt,
      };

      const { data: insertedReel, error: insertError } = await supabase
        .from("reels")
        .insert(insertPayload)
        .select("id")
        .single();

      if (insertError) {
        throw new Error(insertError.message || "Could not save reel record.");
      }

      const newReel: UploadedReel = {
        id: insertedReel?.id || `reel-${Date.now()}`,
        user_id: userId,
        creator_profile_id: userId,
        title: title.trim(),
        creator: creatorHandle,
        creatorName,
        creatorAvatarUrl: profile?.avatar_url || undefined,
        caption: caption.trim(),
        video: publicVideoUrl,
        poster: publicPosterUrl,
        likes: 0,
        comments: 0,
        favorites: 0,
        shares: 0,
        createdAt,
      };

      onUploadSuccess(newReel);

      window.setTimeout(() => {
        window.dispatchEvent(new Event("reels-refresh"));
      }, 300);

      window.setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 200);

      setSuccessMessage("Reel uploaded successfully.");
      resetState();
      onClose();
    } catch (error) {
      console.error(error);

      if (videoPath) {
        await supabase.storage
          .from("reels")
          .remove([videoPath])
          .catch(() => {});
      }

      if (posterPath) {
        await supabase.storage
          .from("reel-posters")
          .remove([posterPath])
          .catch(() => {});
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong while uploading.",
      );
    } finally {
      setIsUploading(false);
      setIsPreparing(false);
      setIsGeneratingPoster(false);
    }
  };

  if (!isOpen) return null;

  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="video/*"
      onChange={handleFileInputChange}
      style={{ display: "none" }}
    />
  );

  const profileChip = (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "10px",
        borderRadius: "20px",
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.045)",
        padding: "9px 11px",
        width: "fit-content",
      }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.10)",
          display: "grid",
          placeItems: "center",
          fontWeight: 900,
          fontSize: "14px",
        }}
      >
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={creatorName}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          creatorName.charAt(0).toUpperCase()
        )}
      </div>

      <div>
        <div style={{ fontWeight: 900, fontSize: "14px" }}>{creatorName}</div>
        <div style={{ color: "#9ca3af", fontSize: "12px" }}>
          {creatorHandle}
        </div>
      </div>
    </div>
  );

  const metaLine = (
    <div
      style={{
        color: "#c4b5fd",
        fontSize: isMobile ? "12px" : "13px",
        fontWeight: 850,
        display: "flex",
        alignItems: "center",
        gap: "7px",
        flexWrap: "wrap",
      }}
    >
      <span>{selectedVideo ? formatDuration(videoDuration) : "0:00"}</span>
      <span>•</span>
      <span>{selectedVideo ? formatBytes(selectedVideo.size) : "0 B"}</span>
      <span>•</span>
      <span>{statusText}</span>
      <span>•</span>
      <span>Max {MAX_REEL_DURATION_SECONDS}s</span>
    </div>
  );

  const messages = (
    <>
      {errorMessage ? (
        <div
          style={{
            borderRadius: "18px",
            border: "1px solid rgba(248,113,113,0.25)",
            background: "rgba(127,29,29,0.24)",
            color: "#fecaca",
            padding: "12px 14px",
            fontSize: "13px",
            lineHeight: 1.55,
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div
          style={{
            borderRadius: "18px",
            border: "1px solid rgba(34,197,94,0.22)",
            background: "rgba(20,83,45,0.24)",
            color: "#bbf7d0",
            padding: "12px 14px",
            fontSize: "13px",
            lineHeight: 1.55,
          }}
        >
          {successMessage}
        </div>
      ) : null}
    </>
  );

  const uploadProgressNotice = isUploading ? (
    <div
      style={{
        borderRadius: "18px",
        border: "1px solid rgba(216,180,254,0.18)",
        background: "rgba(168,85,247,0.12)",
        padding: "12px 14px",
        display: "grid",
        gap: "9px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <strong style={{ fontSize: "13px" }}>{statusText}</strong>
        <span style={{ color: "#c4b5fd", fontSize: "12px", fontWeight: 850 }}>
          Please keep this open
        </span>
      </div>
      <div
        style={{
          width: "100%",
          height: "6px",
          borderRadius: "999px",
          overflow: "hidden",
          background: "rgba(255,255,255,0.08)",
        }}
      >
        <div
          style={{
            width: isGeneratingPoster ? "42%" : "76%",
            height: "100%",
            borderRadius: "999px",
            background: "linear-gradient(90deg, #a855f7, #ec4899)",
            transition: "width 260ms ease",
          }}
        />
      </div>
    </div>
  ) : null;

  const uploadPicker = (compact = false) => (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      style={{
        ...filePickerStyle,
        minHeight: compact
          ? "min(48dvh, 390px)"
          : isMobile
            ? "min(62dvh, 520px)"
            : "520px",
        padding: compact ? "18px" : "24px",
        borderColor: dragActive
          ? "rgba(216,180,254,0.45)"
          : "rgba(255,255,255,0.12)",
      }}
    >
      <div style={{ maxWidth: compact ? "320px" : "360px" }}>
        <div
          style={{
            width: compact ? "52px" : "64px",
            height: compact ? "52px" : "64px",
            margin: "0 auto 14px",
            borderRadius: "22px",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.07)",
            display: "grid",
            placeItems: "center",
            fontSize: compact ? "24px" : "30px",
          }}
        >
          ↑
        </div>

        <div
          style={{
            fontSize: compact ? "18px" : "22px",
            fontWeight: 950,
            marginBottom: "8px",
          }}
        >
          Upload your reel
        </div>
        <div
          style={{
            color: "#b9c0cc",
            lineHeight: 1.55,
            fontSize: compact ? "13px" : "14px",
            marginBottom: "18px",
          }}
        >
          Choose a portrait or landscape video, preview it, then add your title
          and caption. Max 60 seconds.
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            ...primaryButtonStyle,
            minWidth: compact ? "190px" : "220px",
          }}
          type="button"
        >
          Choose Video
        </button>

        <div
          style={{
            marginTop: "12px",
            color: "#aeb6c3",
            fontSize: compact ? "12px" : "13px",
            fontWeight: 800,
          }}
        >
          Portrait and landscape supported · Max {MAX_REEL_DURATION_SECONDS}s
        </div>
      </div>
    </div>
  );

  const videoPreview = (mode: "hero" | "desktop" | "thumb") => {
    if (!previewUrl) return null;

    const isHero = mode === "hero";
    const isThumb = mode === "thumb";

    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: isThumb ? "176px" : isHero ? "100%" : "100%",
          minHeight: isThumb ? "176px" : isHero ? "0" : "520px",
          borderRadius: isThumb ? "20px" : isHero ? "0" : "26px",
          overflow: "hidden",
          background: "#000",
          border: isHero ? "none" : "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <video
          src={previewUrl}
          controls
          playsInline
          muted
          preload="metadata"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            background: "#000",
            display: "block",
          }}
        />
      </div>
    );
  };

  if (isMobile) {
    const mobileShellStyle: CSSProperties = {
      width: "100vw",
      height: "100dvh",
      maxHeight: "100dvh",
      borderRadius: 0,
      border: "none",
      background: "linear-gradient(180deg, rgba(10,14,26,1), rgba(5,7,12,1))",
      boxShadow: "none",
      overflow: "hidden",
      color: "white",
      display: "flex",
      flexDirection: "column",
    };

    const mobileHeader = (
      <div
        style={{
          minHeight: "calc(58px + env(safe-area-inset-top))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          padding: "calc(10px + env(safe-area-inset-top)) 14px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(3,7,18,0.78)",
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (mobileStep === "details") {
              setMobileStep("preview");
              return;
            }
            handleClose();
          }}
          style={{ ...ghostButtonStyle, padding: "8px 12px", minWidth: "74px" }}
        >
          {mobileStep === "details" ? "← Back" : "Close"}
        </button>

        <div style={{ textAlign: "center", minWidth: 0 }}>
          <div
            style={{
              fontSize: "12px",
              letterSpacing: "0.08em",
              fontWeight: 950,
              color: "#d8b4fe",
            }}
          >
            PARAPOST REELS
          </div>
          <div style={{ fontSize: "10px", color: "#8b93a4", fontWeight: 800 }}>
            {mobileStep === "details"
              ? "Details"
              : selectedVideo
                ? "Preview"
                : "Upload"}
          </div>
        </div>

        {selectedVideo && mobileStep !== "details" ? (
          <button
            type="button"
            onClick={() => setMobileStep("details")}
            style={{
              ...primaryButtonStyle,
              padding: "8px 14px",
              minWidth: "74px",
            }}
          >
            Next
          </button>
        ) : (
          <div style={{ width: "74px" }} />
        )}
      </div>
    );

    if (mobileStep === "details" && selectedVideo) {
      return (
        <>
          <div
            style={overlayStyle}
            onClick={isUploading ? undefined : handleClose}
          />
          <div style={{ ...wrapStyle, padding: 0 }}>
            <div
              style={mobileShellStyle}
              role="dialog"
              aria-modal="true"
              aria-label="Create Parapost Reel"
            >
              {mobileHeader}
              <div
                style={{
                  flex: "1 1 auto",
                  minHeight: 0,
                  overflowY: "auto",
                  WebkitOverflowScrolling: "touch",
                  padding: "16px 16px 26px",
                  display: "grid",
                  gap: "16px",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "124px minmax(0, 1fr)",
                    gap: "14px",
                    alignItems: "start",
                  }}
                >
                  {videoPreview("thumb")}
                  <div style={{ minWidth: 0, display: "grid", gap: "10px" }}>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: "24px",
                        lineHeight: 1.05,
                        fontWeight: 950,
                      }}
                    >
                      Create a Reel
                    </h2>
                    {profileChip}
                    {metaLine}
                  </div>
                </div>

                <div>
                  <div style={labelStyle}>Reel Title</div>
                  <input
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value.slice(0, 80));
                      if (errorMessage === "Add a reel title before uploading.")
                        setErrorMessage("");
                    }}
                    placeholder="Give your reel a strong title"
                    style={inputStyle}
                    maxLength={80}
                  />
                  <div
                    style={{
                      marginTop: "8px",
                      color: "#9ca3af",
                      fontSize: "12px",
                      textAlign: "right",
                    }}
                  >
                    {title.length}/80
                  </div>
                </div>

                <div>
                  <div style={labelStyle}>Caption</div>
                  <textarea
                    value={caption}
                    onChange={(event) =>
                      setCaption(
                        event.target.value.slice(0, REEL_CAPTION_MAX_LENGTH),
                      )
                    }
                    placeholder="Write a caption for your reel..."
                    style={{ ...textAreaStyle, minHeight: "150px" }}
                    maxLength={REEL_CAPTION_MAX_LENGTH}
                  />
                  <div
                    style={{
                      marginTop: "8px",
                      color: "#9ca3af",
                      fontSize: "12px",
                      textAlign: "right",
                    }}
                  >
                    {caption.length}/{REEL_CAPTION_MAX_LENGTH}
                  </div>
                </div>

                {messages}
                {uploadProgressNotice}
              </div>

              <div
                style={{
                  flex: "0 0 auto",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  padding: "12px 14px calc(16px + env(safe-area-inset-bottom))",
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(3,7,18,0.94)",
                }}
              >
                <button
                  onClick={handleClose}
                  style={{ ...ghostButtonStyle, padding: "11px 15px" }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  style={
                    isReadyToUpload
                      ? {
                          ...primaryButtonStyle,
                          padding: "12px 18px",
                          minWidth: "142px",
                        }
                      : {
                          ...disabledButtonStyle,
                          padding: "12px 18px",
                          minWidth: "142px",
                        }
                  }
                  disabled={!isReadyToUpload}
                  type="button"
                >
                  {publishButtonLabel}
                </button>
              </div>

              {hiddenInput}
            </div>
          </div>
        </>
      );
    }

    if (selectedVideo && mobileStep === "preview") {
      return (
        <>
          <div
            style={overlayStyle}
            onClick={isUploading ? undefined : handleClose}
          />
          <div style={{ ...wrapStyle, padding: 0 }}>
            <div
              style={mobileShellStyle}
              role="dialog"
              aria-modal="true"
              aria-label="Create Parapost Reel"
            >
              {mobileHeader}
              <div
                style={{
                  flex: "1 1 auto",
                  minHeight: 0,
                  background: "#000",
                  display: "grid",
                }}
              >
                {videoPreview("hero")}
              </div>

              <div
                style={{
                  flex: "0 0 auto",
                  padding: "12px 14px calc(16px + env(safe-area-inset-bottom))",
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(3,7,18,0.94)",
                  display: "grid",
                  gap: "10px",
                }}
              >
                {metaLine}
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{ ...buttonStyle, flex: 1 }}
                    type="button"
                  >
                    Replace Video
                  </button>
                  <button
                    onClick={handleRemoveVideo}
                    style={{ ...ghostButtonStyle, flex: 1 }}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
                <button
                  onClick={() => setMobileStep("details")}
                  style={{ ...primaryButtonStyle, width: "100%" }}
                  type="button"
                >
                  Next
                </button>
                {messages}
              </div>
              {hiddenInput}
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        <div
          style={overlayStyle}
          onClick={isUploading ? undefined : handleClose}
        />
        <div style={{ ...wrapStyle, padding: 0 }}>
          <div
            style={mobileShellStyle}
            role="dialog"
            aria-modal="true"
            aria-label="Create Parapost Reel"
          >
            {mobileHeader}
            <div
              style={{
                flex: "1 1 auto",
                minHeight: 0,
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                padding: "16px",
                display: "grid",
                gap: "14px",
                alignContent: "start",
              }}
            >
              {uploadPicker(true)}
              {messages}
            </div>
            {hiddenInput}
          </div>
        </div>
      </>
    );
  }

  const modalStyle: CSSProperties = {
    width:
      viewportType === "tablet"
        ? "min(960px, calc(100vw - 32px))"
        : "min(1120px, calc(100vw - 40px))",
    maxHeight: "88dvh",
    overflow: "hidden",
    borderRadius: "30px",
    border: "1px solid rgba(255,255,255,0.10)",
    background:
      "linear-gradient(180deg, rgba(11,16,32,0.98) 0%, rgba(7,9,13,0.98) 100%)",
    boxShadow: "0 28px 80px rgba(0,0,0,0.55)",
    color: "white",
    display: "grid",
    gridTemplateColumns:
      viewportType === "tablet"
        ? "minmax(320px, 44%) minmax(0, 1fr)"
        : "minmax(380px, 48%) minmax(0, 1fr)",
  };

  return (
    <>
      <div
        style={overlayStyle}
        onClick={isUploading ? undefined : handleClose}
      />
      <div style={wrapStyle}>
        <div
          style={modalStyle}
          role="dialog"
          aria-modal="true"
          aria-label="Create Parapost Reel"
        >
          <div
            style={{
              minHeight: viewportType === "tablet" ? "620px" : "660px",
              maxHeight: "88dvh",
              borderRight: "1px solid rgba(255,255,255,0.08)",
              background:
                "radial-gradient(circle at top, rgba(168,85,247,0.12), transparent 46%), rgba(0,0,0,0.20)",
              padding: "18px",
              display: "grid",
              gridTemplateRows: "auto minmax(0, 1fr) auto",
              gap: "14px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.28)",
                  fontSize: "12px",
                  fontWeight: 900,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Parapost Reels
              </div>

              <button
                onClick={handleClose}
                style={{ ...ghostButtonStyle, padding: "9px 14px" }}
                type="button"
              >
                Close
              </button>
            </div>

            {previewUrl ? videoPreview("desktop") : uploadPicker(false)}

            {previewUrl ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                {metaLine}
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={buttonStyle}
                    type="button"
                  >
                    Replace Video
                  </button>
                  <button
                    onClick={handleRemoveVideo}
                    style={ghostButtonStyle}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div
            style={{
              padding: viewportType === "tablet" ? "20px" : "24px",
              maxHeight: "88dvh",
              overflowY: "auto",
              display: "grid",
              gap: "16px",
              alignContent: "start",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "14px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: viewportType === "tablet" ? "27px" : "32px",
                    lineHeight: 1.05,
                    fontWeight: 950,
                  }}
                >
                  Create a Reel
                </h2>
                <div
                  style={{
                    marginTop: "8px",
                    color: "#aeb6c3",
                    fontSize: "14px",
                    lineHeight: 1.55,
                    maxWidth: "520px",
                  }}
                >
                  Choose a portrait or landscape video, review the preview, add
                  your title and caption, then publish. Reels are limited to 60
                  seconds.
                </div>
              </div>
              {profileChip}
            </div>

            {metaLine}

            <div>
              <div style={labelStyle}>Reel Title</div>
              <input
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value.slice(0, 80));
                  if (errorMessage === "Add a reel title before uploading.")
                    setErrorMessage("");
                }}
                placeholder="Give your reel a strong title"
                style={inputStyle}
                maxLength={80}
              />
              <div
                style={{
                  marginTop: "8px",
                  color: "#9ca3af",
                  fontSize: "12px",
                  textAlign: "right",
                }}
              >
                {title.length}/80
              </div>
            </div>

            <div>
              <div style={labelStyle}>Caption</div>
              <textarea
                value={caption}
                onChange={(event) =>
                  setCaption(
                    event.target.value.slice(0, REEL_CAPTION_MAX_LENGTH),
                  )
                }
                placeholder="Write a caption for your reel..."
                style={{
                  ...textAreaStyle,
                  minHeight: viewportType === "tablet" ? "150px" : "190px",
                }}
                maxLength={REEL_CAPTION_MAX_LENGTH}
              />
              <div
                style={{
                  marginTop: "8px",
                  color: "#9ca3af",
                  fontSize: "12px",
                  textAlign: "right",
                }}
              >
                {caption.length}/{REEL_CAPTION_MAX_LENGTH}
              </div>
            </div>

            {messages}
            {uploadProgressNotice}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
                paddingTop: "4px",
              }}
            >
              <button
                onClick={handleClose}
                style={ghostButtonStyle}
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                style={
                  isReadyToUpload
                    ? { ...primaryButtonStyle, minWidth: "150px" }
                    : { ...disabledButtonStyle, minWidth: "150px" }
                }
                disabled={!isReadyToUpload}
                type="button"
              >
                {publishButtonLabel}
              </button>
            </div>
          </div>

          {hiddenInput}
        </div>
      </div>
    </>
  );
}

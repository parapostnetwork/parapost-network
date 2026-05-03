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

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.72)",
  backdropFilter: "blur(6px)",
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

const labelStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#9ca3af",
  marginBottom: "8px",
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

const textAreaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: "118px",
  resize: "vertical",
  fontFamily: "inherit",
};

const buttonStyle: CSSProperties = {
  borderRadius: "999px",
  padding: "12px 18px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  borderRadius: "999px",
  padding: "12px 18px",
  border: "none",
  background: "white",
  color: "#07090d",
  fontWeight: 800,
  fontSize: "14px",
  cursor: "pointer",
};

const disabledButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  opacity: 0.55,
  cursor: "not-allowed",
};

const ghostButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "transparent",
};

const statCardStyle: CSSProperties = {
  borderRadius: "20px",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  padding: "12px 14px",
};

const fileBoxBase: CSSProperties = {
  position: "relative",
  borderRadius: "24px",
  border: "1px dashed rgba(255,255,255,0.16)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03))",
  minHeight: "280px",
  padding: "18px",
  display: "grid",
  placeItems: "center",
  textAlign: "center",
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

async function getVideoDuration(file: File) {
  return await new Promise<number>((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };

    video.preload = "metadata";
    video.src = objectUrl;

    video.onloadedmetadata = () => {
      const duration = video.duration;
      cleanup();
      resolve(duration);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Could not read the selected video."));
    };
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
        0.9
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

  const isReadyToUpload =
    !!selectedVideo && !!userId && title.trim().length > 0 && !isUploading;

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

  const viewportType = getViewportType(viewportWidth);

  const creatorHandle = useMemo(() => {
    const raw = profile?.username?.trim();
    return raw ? `@${raw.replace(/^@+/, "")}` : "@you";
  }, [profile]);

  const creatorName = useMemo(() => {
    return profile?.display_name?.trim() || profile?.username?.trim() || "You";
  }, [profile]);

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
  };

  const handleClose = () => {
    if (isUploading) return;
    resetState();
    onClose();
  };

  const processVideoFile = async (file: File) => {
    clearTransientMessages();

    if (!file.type.startsWith("video/")) {
      setErrorMessage("Please choose a video file.");
      return;
    }

    setIsPreparing(true);

    try {
      const duration = await getVideoDuration(file);

      if (duration > 30) {
        setErrorMessage("Reels are currently limited to 30 seconds.");
        setSelectedVideo(null);
        setVideoDuration(0);
        return;
      }

      setSelectedVideo(file);
      setVideoDuration(duration);

      if (!title.trim()) {
        const cleanedName = file.name.replace(/\.[^.]+$/, "").trim();
        setTitle(cleanedName.slice(0, 80));
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("Could not read that video. Try another file.");
    } finally {
      setIsPreparing(false);
    }
  };

  const handleFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
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
      return;
    }

    if (!title.trim()) {
      setErrorMessage("Add a reel title before uploading.");
      return;
    }

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
        throw new Error(finalVideoUploadError.message || "Video upload failed.");
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

      const { data: videoPublic } = supabase.storage.from("reels").getPublicUrl(videoPath);
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
        duration_seconds: Math.round(videoDuration),
        likes: 0,
        comments: 0,
        favorites: 0,
        shares: 0,
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
        await supabase.storage.from("reels").remove([videoPath]).catch(() => {});
      }

      if (posterPath) {
        await supabase.storage.from("reel-posters").remove([posterPath]).catch(() => {});
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong while uploading."
      );
    } finally {
      setIsUploading(false);
      setIsGeneratingPoster(false);
    }
  };

  if (!isOpen) return null;

  const statusText = isUploading
    ? isGeneratingPoster
      ? "Generating cover image..."
      : "Uploading reel..."
    : isPreparing
      ? "Preparing preview..."
      : "";

  const modalStyle: CSSProperties = {
    width: viewportType === "mobile" ? "100%" : "min(1080px, 100%)",
    maxHeight: viewportType === "mobile" ? "95vh" : "88vh",
    overflow: "hidden",
    borderRadius: viewportType === "mobile" ? "24px" : "28px",
    border: "1px solid rgba(255,255,255,0.10)",
    background:
      "linear-gradient(180deg, rgba(11,16,32,0.98) 0%, rgba(7,9,13,0.98) 100%)",
    boxShadow: "0 28px 80px rgba(0,0,0,0.55)",
    display: "grid",
    gridTemplateColumns:
      viewportType === "mobile" ? "1fr" : "minmax(290px, 390px) minmax(0, 1fr)",
  };

  const leftPaneStyle: CSSProperties = {
    position: "relative",
    minHeight: viewportType === "mobile" ? "300px" : "560px",
    background:
      "radial-gradient(circle at top, rgba(255,255,255,0.08), rgba(255,255,255,0.02) 35%, rgba(0,0,0,0.24) 100%)",
    borderRight:
      viewportType === "mobile" ? "none" : "1px solid rgba(255,255,255,0.08)",
    borderBottom:
      viewportType === "mobile" ? "1px solid rgba(255,255,255,0.08)" : "none",
    overflow: "hidden",
  };

  const rightPaneStyle: CSSProperties = {
    padding: viewportType === "mobile" ? "18px" : "20px",
    overflowY: "auto",
    display: "grid",
    gap: "14px",
    maxHeight: viewportType === "mobile" ? "calc(95vh - 300px)" : "88vh",
  };

  return (
    <>
      <div style={overlayStyle} onClick={handleClose} />
      <div style={wrapStyle}>
        <div style={modalStyle}>
          <div style={leftPaneStyle}>
            <div
              style={{
                position: "absolute",
                top: "16px",
                left: "16px",
                right: "16px",
                zIndex: 5,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.32)",
                  fontSize: "12px",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                Parapost Reels
              </div>

              <button onClick={handleClose} style={ghostButtonStyle} type="button">
                Close
              </button>
            </div>

            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              style={{
                ...fileBoxBase,
                minHeight: "100%",
                borderColor: dragActive
                  ? "rgba(255,255,255,0.34)"
                  : "rgba(255,255,255,0.16)",
                background: dragActive
                  ? "linear-gradient(180deg, rgba(255,255,255,0.11), rgba(255,255,255,0.04))"
                  : fileBoxBase.background,
              }}
            >
              {previewUrl ? (
                <>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.18) 45%, rgba(0,0,0,0.68) 100%)",
                      pointerEvents: "none",
                      zIndex: 1,
                    }}
                  />
                  <video
                    src={previewUrl}
                    controls
                    playsInline
                    muted
                    preload="metadata"
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      width: "100%",
                      height: "100%",
                      maxWidth: viewportType === "mobile" ? "100%" : "390px",
                      objectFit: "cover",
                      background: "#000",
                      filter: "contrast(1.05) saturate(1.1)",
                    }}
                  />

                  <div
                    style={{
                      position: "absolute",
                      left: "14px",
                      right: "14px",
                      bottom: "14px",
                      zIndex: 2,
                      display: "grid",
                      gap: "10px",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        display: "inline-flex",
                        width: "fit-content",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px 12px",
                        borderRadius: "999px",
                        background: "rgba(0,0,0,0.45)",
                        border: "1px solid rgba(255,255,255,0.14)",
                        backdropFilter: "blur(10px)",
                        fontSize: "12px",
                        fontWeight: 700,
                      }}
                    >
                      Preview Ready
                    </div>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        style={buttonStyle}
                        type="button"
                      >
                        Replace Video
                      </button>
                      <button
                        onClick={() => {
                          setSelectedVideo(null);
                          setVideoDuration(0);
                          setTitle("");
                          setCaption("");
                          clearTransientMessages();
                        }}
                        style={ghostButtonStyle}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ maxWidth: "320px" }}>
                  <div
                    style={{
                      width: "74px",
                      height: "74px",
                      margin: "0 auto 14px",
                      borderRadius: "24px",
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.06)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: "30px",
                    }}
                  >
                    ⬆
                  </div>

                  <div style={{ fontSize: "22px", fontWeight: 800, marginBottom: "8px" }}>
                    Upload your reel
                  </div>
                  <div
                    style={{
                      color: "#d1d5db",
                      lineHeight: 1.6,
                      fontSize: "14px",
                      marginBottom: "18px",
                    }}
                  >
                    Drag and drop a vertical video here or choose a file. Reels are set to a 30-second maximum for launch.
                  </div>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={primaryButtonStyle}
                    type="button"
                  >
                    Choose Video
                  </button>

                  <div
                    style={{
                      marginTop: "16px",
                      color: "#9ca3af",
                      fontSize: "12px",
                      lineHeight: 1.6,
                    }}
                  >
                    Recommended: 9:16 portrait, sharp lighting, strong opening frame, short title, concise caption.
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileInputChange}
                style={{ display: "none" }}
              />
            </div>
          </div>

          <div style={rightPaneStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "14px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: viewportType === "mobile" ? "24px" : "28px",
                    lineHeight: 1.05,
                    fontWeight: 900,
                    marginBottom: "6px",
                  }}
                >
                  Create a Reel
                </div>
                <div style={{ color: "#9ca3af", fontSize: "14px", lineHeight: 1.6 }}>
                  Upload a short vertical video for Parapost Reels. This modal is built to fit your reels page flow cleanly.
                </div>
              </div>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  borderRadius: "20px",
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                  padding: "10px 12px",
                }}
              >
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "50%",
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.10)",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 800,
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
                  <div style={{ fontWeight: 800, fontSize: "14px" }}>{creatorName}</div>
                  <div style={{ color: "#9ca3af", fontSize: "12px" }}>{creatorHandle}</div>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  viewportType === "mobile"
                    ? "1fr"
                    : "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "12px",
              }}
            >
              <div style={statCardStyle}>
                <div style={labelStyle}>Duration</div>
                <div style={{ fontSize: "20px", fontWeight: 900 }}>
                  {selectedVideo ? formatDuration(videoDuration) : "0:00"}
                </div>
                <div style={{ marginTop: "6px", color: "#9ca3af", fontSize: "12px" }}>
                  Max 0:30 at launch
                </div>
              </div>

              <div style={statCardStyle}>
                <div style={labelStyle}>File Size</div>
                <div style={{ fontSize: "20px", fontWeight: 900 }}>
                  {selectedVideo ? formatBytes(selectedVideo.size) : "0 B"}
                </div>
                <div style={{ marginTop: "6px", color: "#9ca3af", fontSize: "12px" }}>
                  Bigger files may upload slower
                </div>
              </div>

              <div style={statCardStyle}>
                <div style={labelStyle}>Status</div>
                <div style={{ fontSize: "20px", fontWeight: 900 }}>
                  {selectedVideo ? "Ready" : "Waiting"}
                </div>
                <div style={{ marginTop: "6px", color: "#9ca3af", fontSize: "12px" }}>
                  {statusText || "Select a reel video to begin"}
                </div>
              </div>
            </div>

            <div>
              <div style={labelStyle}>Reel Title</div>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value.slice(0, 80))}
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
                onChange={(event) => setCaption(event.target.value.slice(0, 2200))}
                placeholder="Write a caption for your reel..."
                style={textAreaStyle}
                maxLength={2200}
              />
              <div
                style={{
                  marginTop: "8px",
                  color: "#9ca3af",
                  fontSize: "12px",
                  textAlign: "right",
                }}
              >
                {caption.length}/2200
              </div>
            </div>

            <div
              style={{
                borderRadius: "24px",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
                padding: "14px 16px",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "15px" }}>Launch Rules</div>
              <div style={{ color: "#d1d5db", fontSize: "14px", lineHeight: 1.7 }}>
                Reels are currently capped at 30 seconds. Owner controls, feed sharing, and the reels page are designed to work with this format first before expanding longer video support later.
              </div>
            </div>

            {errorMessage ? (
              <div
                style={{
                  borderRadius: "20px",
                  border: "1px solid rgba(248,113,113,0.25)",
                  background: "rgba(127,29,29,0.30)",
                  color: "#fecaca",
                  padding: "14px 16px",
                  fontSize: "14px",
                  lineHeight: 1.6,
                }}
              >
                {errorMessage}
              </div>
            ) : null}

            {successMessage ? (
              <div
                style={{
                  borderRadius: "20px",
                  border: "1px solid rgba(34,197,94,0.22)",
                  background: "rgba(20,83,45,0.30)",
                  color: "#bbf7d0",
                  padding: "14px 16px",
                  fontSize: "14px",
                  lineHeight: 1.6,
                }}
              >
                {successMessage}
              </div>
            ) : null}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
                paddingTop: "2px",
              }}
            >
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button onClick={handleClose} style={ghostButtonStyle} type="button">
                  Cancel
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={buttonStyle}
                  type="button"
                >
                  Choose Another Video
                </button>
              </div>

              <button
                onClick={handleUpload}
                style={isReadyToUpload ? primaryButtonStyle : disabledButtonStyle}
                disabled={!isReadyToUpload}
                type="button"
              >
                {isUploading ? "Uploading..." : "Publish Reel"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

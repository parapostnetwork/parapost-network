"use client";

import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type LiveProvider = "youtube" | "twitch";

type DetectedLiveMeta = {
  provider: LiveProvider;
  externalUrl: string | null;
  embedUrl: string | null;
  thumbnailUrl: string | null;
  helper: string;
};

type LiveStreamRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  provider: LiveProvider | string | null;
  external_url: string | null;
  embed_url: string | null;
  thumbnail_url: string | null;
  visibility: "private" | "friends" | "public" | string | null;
  is_hidden: boolean | null;
  is_featured: boolean | null;
  scheduled_at: string | null;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
};

const PROVIDERS: { value: LiveProvider; label: string }[] = [
  { value: "youtube", label: "YouTube Live" },
  { value: "twitch", label: "Twitch Live" },
];

function normalizeExternalUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function safeUrl(value: string) {
  const normalized = normalizeExternalUrl(value);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

function extractFirstUrlFromInput(value: string) {
  const raw = value.trim();
  if (!raw) return null;

  const iframeSrcMatch = raw.match(/src=["']([^"']+)["']/i);
  const candidate = iframeSrcMatch?.[1] || raw;
  const url = safeUrl(candidate);

  return url ? url.toString() : null;
}

function getYoutubeVideoId(url: URL) {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    return url.pathname.split("/").filter(Boolean)[0] || "";
  }

  if (!host.includes("youtube.com")) return "";

  const watchId = url.searchParams.get("v");
  if (watchId) return watchId;

  const parts = url.pathname.split("/").filter(Boolean);
  const embedIndex = parts.indexOf("embed");
  if (embedIndex >= 0 && parts[embedIndex + 1]) return parts[embedIndex + 1];

  const liveIndex = parts.indexOf("live");
  if (liveIndex >= 0 && parts[liveIndex + 1]) return parts[liveIndex + 1];

  const shortsIndex = parts.indexOf("shorts");
  if (shortsIndex >= 0 && parts[shortsIndex + 1]) return parts[shortsIndex + 1];

  return "";
}

function getTwitchChannel(url: URL) {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (!host.includes("twitch.tv")) return "";

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return "";

  const first = parts[0].toLowerCase();
  if (["videos", "directory", "downloads", "settings", "p"].includes(first)) return "";

  return first.replace(/[^a-z0-9_]/gi, "");
}

function detectLiveMetadata(provider: LiveProvider, externalUrlInput: string): DetectedLiveMeta {
  const extractedExternalUrl = extractFirstUrlFromInput(externalUrlInput);
  const url = extractedExternalUrl ? safeUrl(extractedExternalUrl) : null;

  if (!url) {
    return {
      provider,
      externalUrl: null,
      embedUrl: null,
      thumbnailUrl: null,
      helper: "Add a YouTube Live or Twitch Live link to preview the show image.",
    };
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const youtubeId = getYoutubeVideoId(url);

  if (youtubeId) {
    return {
      provider: "youtube",
      externalUrl: url.toString(),
      embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
      thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`,
      helper: "YouTube Live detected. Parapost will automatically create the inline player for Dashboard and Profile.",
    };
  }

  const twitchChannel = getTwitchChannel(url);

  if (twitchChannel) {
    return {
      provider: "twitch",
      externalUrl: url.toString(),
      embedUrl: `https://player.twitch.tv/?channel=${encodeURIComponent(twitchChannel)}`,
      thumbnailUrl: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${encodeURIComponent(twitchChannel)}-640x360.jpg`,
      helper: "Twitch Live detected. Parapost will automatically create the inline player for Dashboard and Profile.",
    };
  }

  return {
    provider,
    externalUrl: url.toString(),
    embedUrl: null,
    thumbnailUrl: null,
    helper: "Use a YouTube Live or Twitch Live link so viewers can watch inside Parapost.",
  };
}

export default function CreateLiveShowPage() {
  const [editingStreamId, setEditingStreamId] = useState("");
  const [existingStream, setExistingStream] = useState<LiveStreamRow | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState<LiveProvider>("youtube");
  const [externalUrl, setExternalUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const detectedMeta = useMemo(
    () => detectLiveMetadata(provider, externalUrl),
    [provider, externalUrl]
  );

  const previewTitle = title.trim() || "Your Parapost Live Show";
  const previewProvider = PROVIDERS.find((item) => item.value === detectedMeta.provider)?.label || "External";
  const isEditing = Boolean(editingStreamId);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit") || "";
    setEditingStreamId(editId);
  }, []);

  useEffect(() => {
    if (!editingStreamId) return;

    let cancelled = false;

    const loadExistingShow = async () => {
      setLoadingExisting(true);
      setError("");
      setMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (!cancelled) {
          setError("You must be signed in to edit this Live show.");
          setLoadingExisting(false);
        }
        return;
      }

      const { data, error: loadError } = await supabase
        .from("live_streams")
        .select("id, user_id, title, description, provider, external_url, embed_url, thumbnail_url, visibility, is_hidden, is_featured, scheduled_at, status, started_at, ended_at")
        .eq("id", editingStreamId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (loadError || !data) {
        setError(loadError?.message || "Could not load this Live show.");
        setLoadingExisting(false);
        return;
      }

      const stream = data as LiveStreamRow;
      setExistingStream(stream);
      setTitle(stream.title || "");
      setDescription(stream.description || "");
      setProvider(stream.provider === "twitch" ? "twitch" : "youtube");
      setExternalUrl(stream.external_url || "");
      setScheduledAt(toDateTimeLocal(stream.scheduled_at));
      setLoadingExisting(false);
    };

    void loadExistingShow();

    return () => {
      cancelled = true;
    };
  }, [editingStreamId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setError("");

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Add a Live title first.");
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError("You must be signed in to create a Live show.");
      return;
    }

    if (externalUrl.trim() && !detectedMeta.embedUrl) {
      setError("Please use a YouTube Live or Twitch Live link. If you use StreamYard, Restream, Evmux, or OBS, send your live to YouTube or Twitch first, then paste that link here.");
      return;
    }

    setSaving(true);

    const scheduledValue = scheduledAt ? new Date(scheduledAt).toISOString() : null;

    const basePayload = {
      title: cleanTitle,
      description: description.trim() || null,
      provider: detectedMeta.provider,
      external_url: detectedMeta.externalUrl,
      embed_url: detectedMeta.embedUrl,
      thumbnail_url: detectedMeta.thumbnailUrl,
      scheduled_at: scheduledValue,
      updated_at: new Date().toISOString(),
    };

    const result = isEditing
      ? await supabase
          .from("live_streams")
          .update(basePayload)
          .eq("id", editingStreamId)
          .eq("user_id", user.id)
      : await supabase.from("live_streams").insert({
          ...basePayload,
          user_id: user.id,
          status: "draft",
          visibility: "private",
          is_hidden: true,
          is_featured: false,
          started_at: null,
          ended_at: null,
        });

    setSaving(false);

    if (result.error) {
      setError(result.error.message || (isEditing ? "Could not update this Live show." : "Could not create this Live show."));
      return;
    }

    setMessage(isEditing ? "Parapost Live show updated. Published shows stay public and visible after editing." : "Parapost Live show saved. Publish it from Live Manager when you are ready.");

    if (!isEditing) {
      setTitle("");
      setDescription("");
      setExternalUrl("");
      setScheduledAt("");
    }
  };

  return (
    <main style={pageStyle} className="parapost-live-create-page">
      <section style={shellStyle} className="parapost-live-create-shell">
        <div style={heroStyle} className="parapost-live-create-hero">
          <div style={badgeStyle}>Creator setup</div>
          <h1 style={titleStyle}>{isEditing ? "Edit Live Show" : "Create Live Show"}</h1>
          <p style={subtitleStyle}>
            {isEditing ? "Update your Live show details." : "Set up your Live show with a YouTube Live or Twitch Live link."} Viewers can watch and comment inside Parapost.
          </p>

          <div style={heroActionsStyle} className="parapost-live-create-hero-actions">
            <Link href="/live" style={smallLinkStyle}>Back to Live Manager</Link>
            <Link href="/dashboard" style={smallLinkStyle}>Dashboard</Link>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={formStyle} className="parapost-live-create-form">
          {loadingExisting ? <div style={successStyle}>Loading Live show...</div> : null}

          <label style={labelStyle}>
            Live title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Example: Global Ghost Hunt Live"
              style={inputStyle}
              maxLength={120}
            />
          </label>

          <label style={labelStyle}>
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add a description for this Live show."
              style={textareaStyle}
              maxLength={1200}
            />
          </label>

          <div style={twoColumnStyle} className="parapost-live-create-two-column">
            <label style={labelStyle}>
              Provider
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value as LiveProvider)}
                style={inputStyle}
              >
                {PROVIDERS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              Scheduled time
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                style={inputStyle}
              />
            </label>
          </div>

          <label style={labelStyle}>
            Live link
            <input
              value={externalUrl}
              onChange={(event) => setExternalUrl(event.target.value)}
              placeholder="Paste a YouTube Live or Twitch Live link."
              style={inputStyle}
            />
          </label>

          <p style={helperStyle}>
            Using StreamYard, Restream, Evmux, or OBS? Send your broadcast to YouTube or Twitch first, then paste that YouTube/Twitch Live link here.
          </p>

          <div style={previewWrapStyle} className="parapost-live-create-preview">
            <div className="parapost-live-create-preview-media" style={previewMediaStyle}>
              {detectedMeta.thumbnailUrl ? (
                <img
                  src={detectedMeta.thumbnailUrl}
                  alt="Live thumbnail preview"
                  style={previewImageStyle}
                />
              ) : (
                <div style={fallbackThumbStyle} className="parapost-live-fallback-thumb">
                  <span style={fallbackBadgeStyle}>PARAPOST LIVE</span>
                  <strong style={fallbackTitleStyle}>{previewTitle}</strong>
                  <span style={fallbackProviderStyle}>{previewProvider}</span>
                </div>
              )}
            </div>

            <div className="parapost-live-create-preview-text" style={previewTextStyle}>
              <strong style={{ color: "#fff" }}>Thumbnail preview</strong>
              <span>{detectedMeta.helper}</span>
              <span>
                Parapost player: {detectedMeta.embedUrl ? "Yes" : "Add a YouTube Live or Twitch Live link"}
              </span>
              <span>
                Thumbnail preview: {detectedMeta.thumbnailUrl ? "Yes" : "Preview image will appear after a supported link is added"}
              </span>
            </div>
          </div>

          <div style={safetyBoxStyle}>
            <strong>Show setup</strong>
            <span>
              {isEditing ? (
                existingStream?.visibility === "public" && !existingStream?.is_hidden
                  ? "This show is visible on Dashboard and Profile."
                  : "This show is saved and can be published from Live Manager when you are ready."
              ) : (
                <>Your Live show is saved first. Publish it from Live Manager when you are ready for it to appear.</>
              )}
              
            </span>
          </div>

          {error ? <div style={errorStyle}>{error}</div> : null}
          {message ? <div style={successStyle}>{message}</div> : null}

          <div style={actionsStyle} className="parapost-live-create-actions">
            <Link href="/live" style={cancelButtonStyle}>Cancel</Link>
            <button type="submit" disabled={saving} style={saveButtonStyle}>
              {saving ? "Saving..." : isEditing ? "Update Show" : "Save Show"}
            </button>
          </div>
        </form>
        <style jsx global>{`
          .parapost-live-create-page {
            min-height: 100dvh;
            height: 100dvh;
            max-height: 100dvh;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            touch-action: pan-y;
            overscroll-behavior-y: contain;
            -webkit-overflow-scrolling: touch;
            scroll-behavior: smooth;
          }

          .parapost-live-create-shell {
            min-height: auto !important;
          }

          .parapost-live-create-page *,
          .parapost-live-create-page *::before,
          .parapost-live-create-page *::after {
            box-sizing: border-box;
          }

          .parapost-live-create-form input,
          .parapost-live-create-form textarea,
          .parapost-live-create-form select {
            font-size: 16px !important;
          }

          .parapost-live-create-form button,
          .parapost-live-create-form a,
          .parapost-live-create-hero-actions a {
            touch-action: manipulation;
          }

          .parapost-live-create-shell,
          .parapost-live-create-hero,
          .parapost-live-create-form,
          .parapost-live-create-preview {
            max-width: 100%;
          }

          @media (min-width: 761px) and (max-width: 1180px) {
            .parapost-live-create-page {
              padding: 20px 14px calc(118px + env(safe-area-inset-bottom)) !important;
            }

            .parapost-live-create-shell {
              max-width: min(940px, 100%) !important;
            }

            .parapost-live-create-preview {
              grid-template-columns: minmax(240px, 320px) 1fr !important;
            }
          }

          @media (max-width: 980px) {
            .parapost-live-create-page {
              padding: 18px 12px calc(110px + env(safe-area-inset-bottom)) !important;
            }

            .parapost-live-create-preview {
              grid-template-columns: minmax(210px, 300px) 1fr !important;
            }
          }

          @media (max-width: 900px) {
            .parapost-live-create-shell {
              width: 100% !important;
              max-width: 100% !important;
            }

            .parapost-live-create-preview {
              grid-template-columns: minmax(0, 1fr) !important;
              width: 100% !important;
              overflow: hidden !important;
            }

            .parapost-live-create-preview-media,
            .parapost-live-create-preview-text {
              min-width: 0 !important;
              width: 100% !important;
            }

            .parapost-live-create-preview-media {
              aspect-ratio: 16 / 9 !important;
              min-height: 0 !important;
              overflow: hidden !important;
            }

            .parapost-live-create-preview-media img,
            .parapost-live-fallback-thumb {
              width: 100% !important;
              height: 100% !important;
              min-height: 0 !important;
              object-fit: cover !important;
            }
          }

          @media (max-width: 760px) {
            html,
            body {
              background: #05050b !important;
              overflow-x: hidden !important;
            }

            .parapost-live-create-page {
              min-height: 100svh !important;
              height: auto !important;
              max-height: none !important;
              overflow-y: visible !important;
              overflow-x: hidden !important;
              padding: 12px 10px calc(150px + env(safe-area-inset-bottom)) !important;
              scroll-padding-bottom: calc(150px + env(safe-area-inset-bottom));
            }

            .parapost-live-create-shell {
              max-width: 100% !important;
              width: 100% !important;
              gap: 12px !important;
            }

            .parapost-live-create-hero,
            .parapost-live-create-form {
              border-radius: 22px !important;
              padding: 14px !important;
            }

            .parapost-live-create-hero h1 {
              font-size: 29px !important;
              letter-spacing: -0.05em !important;
            }

            .parapost-live-create-hero p {
              font-size: 13px !important;
              line-height: 1.5 !important;
            }

            .parapost-live-create-preview {
              grid-template-columns: minmax(0, 1fr) !important;
              gap: 12px !important;
              padding: 10px !important;
            }

            .parapost-live-create-preview-text {
              display: grid !important;
              gap: 6px !important;
              overflow-wrap: anywhere !important;
            }
          }

          @media (max-width: 520px) {
            .parapost-live-create-form {
              gap: 12px !important;
            }

            .parapost-live-create-form textarea {
              min-height: 108px !important;
            }

            .parapost-live-create-form input,
            .parapost-live-create-form select {
              min-height: 46px !important;
            }

            .parapost-live-create-form [style*="grid-template-columns"],
            .parapost-live-create-two-column {
              grid-template-columns: minmax(0, 1fr) !important;
              width: 100% !important;
            }

            .parapost-live-create-hero-actions,
            .parapost-live-create-actions {
              display: grid !important;
              grid-template-columns: 1fr !important;
              width: 100% !important;
              gap: 9px !important;
              position: static !important;
              bottom: auto !important;
              z-index: auto !important;
              padding-top: 10px !important;
              margin-top: 2px !important;
              background: transparent !important;
            }

            .parapost-live-create-hero-actions > *,
            .parapost-live-create-actions > * {
              width: 100% !important;
              min-height: 46px !important;
            }
          }

          @media (max-width: 390px) {
            .parapost-live-create-page {
              padding-left: 8px !important;
              padding-right: 8px !important;
            }

            .parapost-live-create-hero,
            .parapost-live-create-form {
              padding: 12px !important;
            }
          }
        `}</style>
      </section>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  height: "auto",
  overflowX: "hidden",
  background:
    "radial-gradient(circle at 14% 0%, rgba(168,85,247,0.28), transparent 34%), radial-gradient(circle at 86% 18%, rgba(236,72,153,0.13), transparent 34%), linear-gradient(180deg, #05050b 0%, #07090d 52%, #05050b 100%)",
  color: "#fff",
  padding: "24px 14px calc(118px + env(safe-area-inset-bottom))",
};

const shellStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  maxWidth: 980,
  margin: "0 auto",
  display: "grid",
  gap: 18,
};

const heroStyle: CSSProperties = {
  borderRadius: 30,
  border: "1px solid rgba(216,180,254,0.20)",
  background: "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(255,255,255,0.055), rgba(10,13,24,0.94))",
  padding: 22,
  boxShadow: "0 20px 58px rgba(0,0,0,0.30)",
};

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 30,
  borderRadius: 999,
  padding: "0 11px",
  color: "#f3e8ff",
  background: "rgba(168,85,247,0.18)",
  border: "1px solid rgba(216,180,254,0.22)",
  fontSize: 12,
  fontWeight: 950,
  marginBottom: 12,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "clamp(32px, 6vw, 56px)",
  letterSpacing: "-0.06em",
  lineHeight: 1,
  fontWeight: 1000,
};

const subtitleStyle: CSSProperties = {
  color: "#d1d5db",
  maxWidth: 780,
  lineHeight: 1.65,
  margin: "12px 0 0",
  fontSize: 15,
};

const heroActionsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 16,
  flexWrap: "wrap",
};

const smallLinkStyle: CSSProperties = {
  minHeight: 34,
  borderRadius: 999,
  padding: "0 12px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.07)",
  color: "#fff",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 900,
};

const formStyle: CSSProperties = {
  borderRadius: 28,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(10,13,24,0.84)",
  padding: 18,
  display: "grid",
  gap: 14,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  color: "#fff",
  fontSize: 13,
  fontWeight: 900,
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 48,
  borderRadius: 15,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(0,0,0,0.36)",
  color: "#fff",
  padding: "0 13px",
  outline: "none",
  boxSizing: "border-box",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 112,
  padding: 13,
  resize: "vertical",
  fontFamily: "inherit",
};

const twoColumnStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const helperStyle: CSSProperties = {
  color: "#aeb6c4",
  fontSize: 13,
  lineHeight: 1.55,
  margin: 0,
};

const previewWrapStyle: CSSProperties = {
  display: "grid",
  minWidth: 0,
  overflow: "hidden",
  gridTemplateColumns: "minmax(210px, 340px) 1fr",
  gap: 14,
  alignItems: "stretch",
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  padding: 12,
};

const previewMediaStyle: CSSProperties = {
  minHeight: 182,
  borderRadius: 18,
  overflow: "hidden",
  background: "#05070d",
};

const previewImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const fallbackThumbStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: 182,
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
  gap: 8,
  padding: 16,
  boxSizing: "border-box",
  background:
    "radial-gradient(circle at 20% 15%, rgba(168,85,247,0.55), transparent 32%), radial-gradient(circle at 80% 25%, rgba(236,72,153,0.28), transparent 34%), linear-gradient(135deg, #111827, #07090d)",
};

const fallbackBadgeStyle: CSSProperties = {
  color: "#f3e8ff",
  fontSize: 11,
  fontWeight: 1000,
  letterSpacing: "0.08em",
};

const fallbackTitleStyle: CSSProperties = {
  color: "#fff",
  fontSize: 22,
  lineHeight: 1.05,
};

const fallbackProviderStyle: CSSProperties = {
  color: "#d1d5db",
  fontSize: 13,
  fontWeight: 800,
};

const previewTextStyle: CSSProperties = {
  minWidth: 0,
  color: "#aeb6c4",
  fontSize: 13,
  lineHeight: 1.55,
  display: "grid",
  alignContent: "center",
  gap: 7,
};

const safetyBoxStyle: CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(0,0,0,0.22)",
  padding: 13,
  display: "grid",
  gap: 6,
  color: "#d1d5db",
  fontSize: 13,
  lineHeight: 1.55,
};

const actionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  flexWrap: "wrap",
};

const cancelButtonStyle: CSSProperties = {
  minHeight: 42,
  borderRadius: 999,
  padding: "0 16px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.07)",
  color: "#fff",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 900,
};

const saveButtonStyle: CSSProperties = {
  minHeight: 42,
  borderRadius: 999,
  padding: "0 18px",
  border: "1px solid rgba(216,180,254,0.30)",
  background: "linear-gradient(135deg, #a855f7, #7c3aed)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 14px 28px rgba(168,85,247,0.28)",
};

const errorStyle: CSSProperties = {
  borderRadius: 16,
  border: "1px solid rgba(248,113,113,0.28)",
  background: "rgba(127,29,29,0.25)",
  color: "#fecaca",
  padding: 12,
  fontSize: 13,
  lineHeight: 1.55,
};

const successStyle: CSSProperties = {
  borderRadius: 16,
  border: "1px solid rgba(74,222,128,0.28)",
  background: "rgba(20,83,45,0.25)",
  color: "#bbf7d0",
  padding: 12,
  fontSize: 13,
  lineHeight: 1.55,
};

"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type LiveStatus = "draft" | "upcoming" | "live" | "ended" | "cancelled";
type LiveVisibility = "private" | "friends" | "public";

type LiveStreamRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  provider: string | null;
  external_url: string | null;
  embed_url: string | null;
  thumbnail_url: string | null;
  status: LiveStatus;
  visibility: LiveVisibility;
  is_hidden: boolean;
  is_featured: boolean;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string | null;
};

const LIVE_SELECT =
  "id, user_id, title, description, provider, external_url, embed_url, thumbnail_url, status, visibility, is_hidden, is_featured, scheduled_at, started_at, ended_at, created_at, updated_at";

function formatLiveDate(value?: string | null) {
  if (!value) return "Not scheduled";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Not scheduled";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isScheduledTimeDue(value?: string | null) {
  if (!value) return false;

  const scheduledTime = new Date(value).getTime();

  return Number.isFinite(scheduledTime) && scheduledTime <= Date.now();
}

function getEffectiveLiveStatus(stream: LiveStreamRow): LiveStatus {
  if (
    stream.status === "upcoming" &&
    stream.visibility === "public" &&
    !stream.is_hidden &&
    isScheduledTimeDue(stream.scheduled_at)
  ) {
    return "live";
  }

  return stream.status;
}

function getStatusLabel(stream: LiveStreamRow) {
  const status = getEffectiveLiveStatus(stream);

  if (status === "live") return "Live Now";
  if (status === "ended") return "Replay";
  if (status === "cancelled") return "Cancelled";
  if (status === "upcoming") {
    if (stream.scheduled_at && isScheduledTimeDue(stream.scheduled_at)) return "Ready to Go Live";
    return "Scheduled";
  }

  return "Not Published";
}

function getProviderLabel(provider?: string | null) {
  if (provider === "youtube") return "YouTube Live";
  if (provider === "twitch") return "Twitch Live";
  return "Live link";
}

function sortOwnedShows(streams: LiveStreamRow[]) {
  const rank: Record<LiveStatus, number> = {
    live: 0,
    upcoming: 1,
    draft: 2,
    ended: 3,
    cancelled: 4,
  };

  return [...streams].sort((a, b) => {
    const rankDifference = rank[getEffectiveLiveStatus(a)] - rank[getEffectiveLiveStatus(b)];

    if (rankDifference !== 0) return rankDifference;

    const aDate = new Date(a.scheduled_at || a.updated_at || a.created_at).getTime();
    const bDate = new Date(b.scheduled_at || b.updated_at || b.created_at).getTime();

    if (getEffectiveLiveStatus(a) === "ended") return bDate - aDate;

    return aDate - bDate;
  });
}

function getOwnerHint(stream: LiveStreamRow) {
  const status = getEffectiveLiveStatus(stream);
  const isPublished = stream.visibility === "public" && !stream.is_hidden;

  if (status === "live" && isPublished) {
    return "This show is live on the Dashboard and Profile. End the show here when the broadcast is finished.";
  }

  if (status === "ended" && isPublished) {
    return "This replay can stay visible on the Dashboard and Profile with comments open.";
  }

  if (status === "upcoming" && isPublished) {
    return "This show is scheduled and will appear on the Dashboard and Profile.";
  }

  if (status === "cancelled") {
    return "This show is cancelled and hidden from viewers.";
  }

  return "This show is saved. Publish it when you are ready for it to appear.";
}

function getStatusPillStyle(stream: LiveStreamRow): CSSProperties {
  const status = getEffectiveLiveStatus(stream);

  if (status === "live") {
    return {
      ...statusPillStyle,
      color: "#dcfce7",
      background: "rgba(34,197,94,0.18)",
      border: "1px solid rgba(74,222,128,0.32)",
      boxShadow: "0 0 22px rgba(34,197,94,0.16)",
    };
  }

  if (status === "ended") {
    return {
      ...statusPillStyle,
      color: "#e5e7eb",
      background: "rgba(148,163,184,0.14)",
      border: "1px solid rgba(148,163,184,0.24)",
    };
  }

  if (status === "cancelled") {
    return {
      ...statusPillStyle,
      color: "#fecaca",
      background: "rgba(127,29,29,0.22)",
      border: "1px solid rgba(248,113,113,0.28)",
    };
  }

  if (status === "upcoming") {
    return {
      ...statusPillStyle,
      color: "#fef3c7",
      background: "rgba(245,158,11,0.16)",
      border: "1px solid rgba(251,191,36,0.28)",
    };
  }

  return statusPillStyle;
}

export default function ParapostLivePage() {
  const router = useRouter();
  const loadedOnceRef = useRef(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [ownedStreams, setOwnedStreams] = useState<LiveStreamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  const sortedOwnedStreams = useMemo(() => sortOwnedShows(ownedStreams), [ownedStreams]);

  const liveCount = useMemo(
    () => sortedOwnedStreams.filter((stream) => getEffectiveLiveStatus(stream) === "live").length,
    [sortedOwnedStreams]
  );

  const scheduledCount = useMemo(
    () => sortedOwnedStreams.filter((stream) => getEffectiveLiveStatus(stream) === "upcoming").length,
    [sortedOwnedStreams]
  );

  const replayCount = useMemo(
    () => sortedOwnedStreams.filter((stream) => getEffectiveLiveStatus(stream) === "ended").length,
    [sortedOwnedStreams]
  );

  const loadLiveManager = useCallback(async (options?: { silent?: boolean }) => {
    const shouldRefreshQuietly = Boolean(options?.silent) || loadedOnceRef.current;

    if (shouldRefreshQuietly) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setMessage("");

    const finishLoading = () => {
      loadedOnceRef.current = true;
      setLoading(false);
      setRefreshing(false);
    };

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setCurrentUserId("");
      setOwnedStreams([]);
      setMessage("Sign in to manage your Live shows.");
      finishLoading();
      return;
    }

    setCurrentUserId(user.id);

    const { data, error } = await supabase
      .from("live_streams")
      .select(LIVE_SELECT)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      setOwnedStreams([]);
      setMessage(error.message || "Could not load your Live shows.");
      finishLoading();
      return;
    }

    const rows = (data || []) as LiveStreamRow[];

    const ownedDueShows = rows.filter(
      (stream) =>
        stream.status === "upcoming" &&
        stream.visibility === "public" &&
        !stream.is_hidden &&
        isScheduledTimeDue(stream.scheduled_at)
    );

    if (ownedDueShows.length > 0) {
      const now = new Date().toISOString();

      await Promise.all(
        ownedDueShows.map((stream) =>
          supabase
            .from("live_streams")
            .update({
              status: "live",
              started_at: stream.started_at || now,
              ended_at: null,
              updated_at: now,
            })
            .eq("id", stream.id)
            .eq("user_id", user.id)
        )
      );

      const { data: refreshedData, error: refreshedError } = await supabase
        .from("live_streams")
        .select(LIVE_SELECT)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (!refreshedError) {
        setOwnedStreams((refreshedData || []) as LiveStreamRow[]);
        finishLoading();
        return;
      }
    }

    setOwnedStreams(rows);
    finishLoading();
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadLiveManager();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadLiveManager]);

  useEffect(() => {
    router.prefetch("/dashboard");
    router.prefetch("/live/create");
    router.prefetch("/notifications");
    router.prefetch("/messages");
    router.prefetch("/friends");
    router.prefetch("/settings");
  }, [router]);

  const updateOwnedStream = async (
    stream: LiveStreamRow,
    payload: Partial<LiveStreamRow>,
    confirmation: string,
    successMessage: string
  ) => {
    if (!currentUserId || stream.user_id !== currentUserId) return;

    const ok = window.confirm(confirmation);

    if (!ok) return;

    setBusyId(stream.id);
    setMessage("");

    const { error } = await supabase
      .from("live_streams")
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", stream.id)
      .eq("user_id", currentUserId);

    setBusyId("");

    if (error) {
      setMessage(error.message || "Could not update this Live show.");
      return;
    }

    setMessage(successMessage);
    await loadLiveManager({ silent: true });
  };

  const publishScheduledShow = async (stream: LiveStreamRow) => {
    if (!stream.scheduled_at) {
      setMessage("Add a scheduled date and time before publishing this show.");
      return;
    }

    await updateOwnedStream(
      stream,
      {
        status: "upcoming",
        visibility: "public",
        is_hidden: false,
        started_at: null,
        ended_at: null,
      },
      "Publish this show so it appears on the Dashboard and Profile?",
      "The show is now published and will appear on the Dashboard and Profile."
    );
  };

  const publishAndStartShow = async (stream: LiveStreamRow) => {
    await updateOwnedStream(
      stream,
      {
        status: "live",
        visibility: "public",
        is_hidden: false,
        started_at: new Date().toISOString(),
        ended_at: null,
      },
      "Mark this show Live on Parapost now?",
      "The show is now Live on the Dashboard and Profile. Start or confirm the YouTube/Twitch broadcast as well."
    );
  };

  const markLive = async (stream: LiveStreamRow) => {
    await updateOwnedStream(
      stream,
      {
        status: "live",
        visibility: "public",
        is_hidden: false,
        started_at: stream.started_at || new Date().toISOString(),
        ended_at: null,
      },
      "Mark this show Live now?",
      "The show is now marked Live on Parapost."
    );
  };

  const endShow = async (stream: LiveStreamRow) => {
    await updateOwnedStream(
      stream,
      {
        status: "ended",
        ended_at: new Date().toISOString(),
      },
      "End this show on Parapost?",
      "The show is now marked as ended. It can remain available as a replay with comments."
    );
  };

  const hideShow = async (stream: LiveStreamRow) => {
    await updateOwnedStream(
      stream,
      {
        visibility: "private",
        is_hidden: true,
      },
      "Hide this show from viewers?",
      "The show is now hidden from viewers."
    );
  };

  const cancelShow = async (stream: LiveStreamRow) => {
    await updateOwnedStream(
      stream,
      {
        status: "cancelled",
        visibility: "private",
        is_hidden: true,
        ended_at: new Date().toISOString(),
      },
      "Cancel this show and hide it from viewers?",
      "The show is cancelled and hidden from viewers."
    );
  };

  const deleteStream = async (stream: LiveStreamRow) => {
    if (!currentUserId || stream.user_id !== currentUserId) return;

    const ok = window.confirm(
      "Delete this Live show permanently from Parapost? This cannot be undone."
    );

    if (!ok) return;

    setBusyId(stream.id);
    setMessage("");

    const { error } = await supabase
      .from("live_streams")
      .delete()
      .eq("id", stream.id)
      .eq("user_id", currentUserId);

    setBusyId("");

    if (error) {
      setMessage(error.message || "Could not delete this Live show.");
      return;
    }

    setMessage("Live show deleted from Parapost.");
    await loadLiveManager({ silent: true });
  };

  return (
    <main style={pageStyle} className="parapost-live-manager-page">
      <style>{`
        @media (max-width: 760px) {
          .parapost-live-manager-page {
            padding: 18px 10px 130px !important;
            overflow-x: hidden;
          }

          .parapost-live-manager-show-card {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 12px !important;
            padding: 10px !important;
            overflow: hidden !important;
          }

          .parapost-live-manager-thumb {
            width: 100% !important;
            min-height: 0 !important;
            aspect-ratio: 16 / 9 !important;
            border-radius: 16px !important;
          }

          .parapost-live-manager-thumb img {
            width: 100% !important;
            height: 100% !important;
            min-height: 0 !important;
            max-height: none !important;
            object-fit: contain !important;
            object-position: center center !important;
            background: #05070d !important;
          }

          .parapost-live-manager-show-body {
            min-width: 0 !important;
            width: 100% !important;
          }

          .parapost-live-manager-actions {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
            width: 100% !important;
          }

          .parapost-live-manager-actions a,
          .parapost-live-manager-actions button {
            width: 100% !important;
            min-width: 0 !important;
            white-space: normal !important;
            line-height: 1.15 !important;
            text-align: center !important;
          }
        }

        @media (max-width: 430px) {
          .parapost-live-manager-actions {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
      <div style={shellStyle}>
        <section style={heroCardStyle}>
          <div style={topRowStyle}>
            <div style={badgeStyle}>Live Manager</div>

            <Link href="/dashboard" style={backLinkStyle}>
              Back to Dashboard
            </Link>
          </div>

          <div style={logoOrbStyle}>LIVE</div>

          <h1 style={titleStyle}>Manage Your Live Shows</h1>

          <p style={subtitleStyle}>
            Create, schedule, publish, end, and manage your Parapost Live shows.
            Viewers watch and comment from the Dashboard and Profile.
          </p>

          <div style={heroActionRowStyle}>
            <Link href="/live/create" style={primaryLinkStyle}>
              Create Live Show
            </Link>

            <button
              type="button"
              disabled={refreshing}
              onClick={() => void loadLiveManager({ silent: true })}
              style={secondaryButtonStyle}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div style={statsGridStyle}>
            <div style={statCardStyle}>
              <span style={statNumberStyle}>{liveCount}</span>
              <span style={statLabelStyle}>Live now</span>
            </div>
            <div style={statCardStyle}>
              <span style={statNumberStyle}>{scheduledCount}</span>
              <span style={statLabelStyle}>Scheduled</span>
            </div>
            <div style={statCardStyle}>
              <span style={statNumberStyle}>{replayCount}</span>
              <span style={statLabelStyle}>Replays</span>
            </div>
          </div>
        </section>

        {message ? <div style={messageStyle}>{message}</div> : null}

        <section style={managerSectionStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <div style={sectionEyebrowStyle}>Creator tools</div>
              <h2 style={sectionTitleStyle}>Your Live Shows</h2>
            </div>

            <Link href="/live/create" style={smallCreateLinkStyle}>
              New Show
            </Link>
          </div>

          {loading ? (
            <div style={emptyStateStyle}>Loading your Live shows...</div>
          ) : sortedOwnedStreams.length === 0 ? (
            <div style={emptyStateStyle}>
              <strong style={{ color: "#fff" }}>No Live shows yet.</strong>
              <span>Create your first Live show and add a YouTube Live or Twitch Live link.</span>
              <Link href="/live/create" style={inlineCreateLinkStyle}>
                Create Live Show
              </Link>
            </div>
          ) : (
            <div style={showGridStyle}>
              {sortedOwnedStreams.map((stream) => {
                const isBusy = busyId === stream.id;
                const effectiveStatus = getEffectiveLiveStatus(stream);
                const isPublished = stream.visibility === "public" && !stream.is_hidden;
                const isEnded = effectiveStatus === "ended";
                const isLive = effectiveStatus === "live";
                const providerLabel = getProviderLabel(stream.provider);

                return (
                  <article key={stream.id} className="parapost-live-manager-show-card" style={showCardStyle}>
                    <div className="parapost-live-manager-thumb" style={thumbWrapStyle}>
                      {stream.thumbnail_url ? (
                        <Image
                          src={stream.thumbnail_url}
                          alt=""
                          width={1280}
                          height={720}
                          sizes="(max-width: 900px) 100vw, 420px"
                          unoptimized
                          style={thumbImageStyle}
                        />
                      ) : (
                        <div style={fallbackThumbStyle}>
                          <span style={fallbackBadgeStyle}>PARAPOST LIVE</span>
                          <strong style={fallbackTitleStyle}>{stream.title || "Live Show"}</strong>
                          <span style={fallbackProviderStyle}>{providerLabel}</span>
                        </div>
                      )}
                    </div>

                    <div className="parapost-live-manager-show-body" style={showBodyStyle}>
                      <div style={showTopLineStyle}>
                        <span style={getStatusPillStyle(stream)}>
                          {getStatusLabel(stream)}
                        </span>

                        <span style={publishedLabelStyle}>
                          {isPublished ? "Visible" : "Hidden"}
                        </span>
                      </div>

                      <h3 style={showTitleStyle}>{stream.title || "Untitled Live Show"}</h3>

                      <div style={showMetaStyle}>
                        <span>{providerLabel}</span>
                        <span>·</span>
                        <span>
                          {isLive
                            ? `Started ${formatLiveDate(stream.started_at || stream.updated_at || stream.created_at)}`
                            : isEnded
                              ? `Ended ${formatLiveDate(stream.ended_at || stream.updated_at || stream.created_at)}`
                              : `Scheduled ${formatLiveDate(stream.scheduled_at)}`}
                        </span>
                      </div>

                      {stream.description ? (
                        <p style={showDescriptionStyle}>{stream.description}</p>
                      ) : null}

                      <p style={hintStyle}>{getOwnerHint(stream)}</p>

                      <div className="parapost-live-manager-actions" style={actionGridStyle}>
                        <Link href={`/live/create?edit=${stream.id}`} style={actionLinkStyle}>
                          Edit
                        </Link>

                        {!isPublished || effectiveStatus === "draft" || effectiveStatus === "cancelled" ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void publishScheduledShow(stream)}
                            style={actionButtonStyle}
                          >
                            Publish
                          </button>
                        ) : null}

                        {effectiveStatus !== "live" && effectiveStatus !== "ended" ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void publishAndStartShow(stream)}
                            style={actionButtonStyle}
                          >
                            Go Live Now
                          </button>
                        ) : null}

                        {effectiveStatus === "upcoming" && isScheduledTimeDue(stream.scheduled_at) ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void markLive(stream)}
                            style={actionButtonStyle}
                          >
                            Confirm Live
                          </button>
                        ) : null}

                        {effectiveStatus === "live" ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void endShow(stream)}
                            style={dangerButtonStyle}
                          >
                            End Show
                          </button>
                        ) : null}

                        {isPublished ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void hideShow(stream)}
                            style={secondaryActionButtonStyle}
                          >
                            Hide
                          </button>
                        ) : null}

                        {effectiveStatus !== "ended" && effectiveStatus !== "cancelled" ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void cancelShow(stream)}
                            style={secondaryActionButtonStyle}
                          >
                            Cancel
                          </button>
                        ) : null}

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void deleteStream(stream)}
                          style={deleteButtonStyle}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  overflowX: "hidden",
  padding: "28px 16px 56px",
  background:
    "radial-gradient(circle at top left, color-mix(in srgb, var(--parapost-accent, #a855f7) 22%, transparent), transparent 32%), linear-gradient(180deg, #050611 0%, #090b18 48%, #050611 100%)",
};

const shellStyle: CSSProperties = {
  width: "min(1120px, 100%)",
  margin: "0 auto",
  display: "grid",
  gap: 18,
};

const heroCardStyle: CSSProperties = {
  borderRadius: 28,
  border: "1px solid rgba(216,180,254,0.16)",
  background: "rgba(8,10,22,0.86)",
  boxShadow: "0 28px 90px rgba(0,0,0,0.45)",
  padding: 22,
  overflow: "hidden",
};

const topRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  minHeight: 30,
  alignItems: "center",
  borderRadius: 999,
  padding: "0 11px",
  color: "#f3e8ff",
  background: "rgba(168,85,247,0.16)",
  border: "1px solid rgba(216,180,254,0.18)",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const backLinkStyle: CSSProperties = {
  color: "#c4b5fd",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 850,
};

const logoOrbStyle: CSSProperties = {
  width: 74,
  height: 74,
  borderRadius: 24,
  display: "grid",
  placeItems: "center",
  marginTop: 20,
  color: "#fff",
  fontSize: 17,
  fontWeight: 1000,
  letterSpacing: "-0.06em",
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--parapost-accent, #a855f7) 92%, #ec4899), #111827)",
  boxShadow: "0 18px 54px color-mix(in srgb, var(--parapost-accent, #a855f7) 28%, transparent)",
};

const titleStyle: CSSProperties = {
  margin: "16px 0 0",
  color: "#fff",
  fontSize: "clamp(2rem, 5vw, 4rem)",
  lineHeight: 0.95,
  letterSpacing: "-0.07em",
};

const subtitleStyle: CSSProperties = {
  maxWidth: 680,
  margin: "14px 0 0",
  color: "#cbd5e1",
  fontSize: "1rem",
  lineHeight: 1.6,
};

const heroActionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 18,
};

const primaryLinkStyle: CSSProperties = {
  minHeight: 42,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 17px",
  color: "#fff",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 950,
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--parapost-accent, #a855f7) 92%, #ec4899), #7c3aed)",
  boxShadow: "0 16px 34px color-mix(in srgb, var(--parapost-accent, #a855f7) 22%, transparent)",
};

const secondaryButtonStyle: CSSProperties = {
  minHeight: 42,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "#e5e7eb",
  padding: "0 15px",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
};

const statsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 10,
  marginTop: 18,
};

const statCardStyle: CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.045)",
  padding: 14,
};

const statNumberStyle: CSSProperties = {
  display: "block",
  color: "#fff",
  fontSize: 26,
  fontWeight: 1000,
  letterSpacing: "-0.05em",
};

const statLabelStyle: CSSProperties = {
  display: "block",
  marginTop: 2,
  color: "#9ca3af",
  fontSize: 12,
  fontWeight: 800,
};

const messageStyle: CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(216,180,254,0.16)",
  background: "rgba(168,85,247,0.10)",
  color: "#f5f3ff",
  padding: "12px 14px",
  fontSize: 13,
  lineHeight: 1.5,
};

const managerSectionStyle: CSSProperties = {
  borderRadius: 24,
  border: "1px solid rgba(216,180,254,0.14)",
  background: "rgba(8,10,22,0.78)",
  padding: 16,
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 14,
};

const sectionEyebrowStyle: CSSProperties = {
  color: "#a78bfa",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: "0.09em",
};

const sectionTitleStyle: CSSProperties = {
  margin: "3px 0 0",
  color: "#fff",
  fontSize: 22,
  letterSpacing: "-0.045em",
};

const smallCreateLinkStyle: CSSProperties = {
  minHeight: 36,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 13px",
  color: "#fff",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 950,
  background: "rgba(168,85,247,0.22)",
  border: "1px solid rgba(216,180,254,0.20)",
};

const emptyStateStyle: CSSProperties = {
  minHeight: 180,
  borderRadius: 20,
  border: "1px dashed rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.035)",
  color: "#9ca3af",
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  gap: 8,
  padding: 20,
  fontSize: 14,
};

const inlineCreateLinkStyle: CSSProperties = {
  ...smallCreateLinkStyle,
  marginTop: 4,
};

const showGridStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const showCardStyle: CSSProperties = {
  display: "grid",
  minWidth: 0,
  overflow: "hidden",
  gridTemplateColumns: "minmax(180px, 280px) minmax(0, 1fr)",
  gap: 14,
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  padding: 12,
};

const thumbWrapStyle: CSSProperties = {
  borderRadius: 18,
  minWidth: 0,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.10)",
  minHeight: 150,
  aspectRatio: "16 / 9",
  background: "#05070d",
};

const thumbImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: 150,
  objectFit: "contain",
  objectPosition: "center center",
  display: "block",
  background: "#05070d",
};

const fallbackThumbStyle: CSSProperties = {
  minHeight: 150,
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  gap: 6,
  padding: 16,
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--parapost-accent, #a855f7) 24%, transparent), rgba(255,255,255,0.05))",
};

const fallbackBadgeStyle: CSSProperties = {
  color: "#c4b5fd",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: "0.10em",
};

const fallbackTitleStyle: CSSProperties = {
  color: "#fff",
  fontSize: 18,
  lineHeight: 1.15,
};

const fallbackProviderStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: 12,
  fontWeight: 850,
};

const showBodyStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  display: "grid",
  alignContent: "start",
  gap: 8,
};

const showTopLineStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const statusPillStyle: CSSProperties = {
  minHeight: 28,
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "0 10px",
  color: "#e9d5ff",
  background: "rgba(168,85,247,0.16)",
  border: "1px solid rgba(216,180,254,0.20)",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const publishedLabelStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: 12,
  fontWeight: 850,
};

const showTitleStyle: CSSProperties = {
  margin: 0,
  overflowWrap: "anywhere",
  color: "#fff",
  fontSize: 20,
  lineHeight: 1.15,
  letterSpacing: "-0.04em",
};

const showMetaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  color: "#9ca3af",
  fontSize: 12.5,
  fontWeight: 750,
};

const showDescriptionStyle: CSSProperties = {
  margin: 0,
  color: "#cbd5e1",
  fontSize: 13.5,
  lineHeight: 1.5,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const hintStyle: CSSProperties = {
  margin: 0,
  overflowWrap: "anywhere",
  color: "#9ca3af",
  fontSize: 12.5,
  lineHeight: 1.45,
};

const actionGridStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 4,
};

const actionLinkStyle: CSSProperties = {
  minHeight: 34,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 12px",
  color: "#fff",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 900,
  background: "rgba(168,85,247,0.20)",
  border: "1px solid rgba(216,180,254,0.22)",
};

const actionButtonStyle: CSSProperties = {
  minHeight: 34,
  borderRadius: 999,
  border: "1px solid rgba(216,180,254,0.22)",
  background: "rgba(168,85,247,0.18)",
  color: "#fff",
  padding: "0 12px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryActionButtonStyle: CSSProperties = {
  ...actionButtonStyle,
  background: "rgba(255,255,255,0.06)",
  color: "#d1d5db",
  border: "1px solid rgba(255,255,255,0.12)",
};

const dangerButtonStyle: CSSProperties = {
  ...actionButtonStyle,
  background: "rgba(239,68,68,0.18)",
  color: "#fee2e2",
  border: "1px solid rgba(248,113,113,0.28)",
};

const deleteButtonStyle: CSSProperties = {
  ...dangerButtonStyle,
  background: "rgba(127,29,29,0.20)",
};


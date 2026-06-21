"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import LiveChatPanel from "@/components/live/LiveChatPanel";

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
  updated_at: string;
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

function getProviderLabel(provider?: string | null) {
  if (!provider) return "Live provider";
  if (provider === "youtube") return "YouTube";
  if (provider === "twitch") return "Twitch";
  if (provider === "facebook") return "Unsupported external provider";
  if (provider === "streamyard") return "Unsupported external provider";
  return "Live provider";
}

function getLiveDisplayStatus(stream: LiveStreamRow) {
  if (stream.status === "live") return "Live Now";
  if (stream.status === "ended") return "Replay";
  if (stream.status === "cancelled") return "Cancelled";
  if (stream.status === "draft") return "Not Published";

  if (stream.status === "upcoming" && stream.scheduled_at) {
    const scheduledTime = new Date(stream.scheduled_at).getTime();

    if (Number.isFinite(scheduledTime)) {
      const msUntilLive = scheduledTime - Date.now();
      const twoHours = 2 * 60 * 60 * 1000;

      if (msUntilLive > 0 && msUntilLive <= twoHours) return "Live Soon";
    }
  }

  return "Upcoming";
}

function getPublicActionLabel(stream: LiveStreamRow) {
  if (stream.status === "live") return "Watch Live";
  if (stream.status === "ended") return "Watch Replay";
  return "Open Stream";
}

function getOwnerHint(stream: LiveStreamRow) {
  const isPublished = stream.visibility === "public" && !stream.is_hidden;

  if (stream.status === "live" && isPublished) {
    return "This show is visible in the Live hub, dashboard timeline, and your profile timeline. Remember to end the stream on your broadcast platform when the show is finished.";
  }

  if (stream.status === "upcoming" && isPublished) {
    return "This scheduled show is visible in the Live hub, dashboard timeline, and your profile timeline.";
  }

  if (stream.status === "ended" && isPublished) {
    return "This replay remains visible in the Live hub until you hide or delete it.";
  }

  if (stream.status === "cancelled") {
    return "Cancelled shows are hidden from the public Live hub.";
  }

  return "This show is saved but not published yet. Publish it when the title, schedule, thumbnail, and live link are ready.";
}

function getStatusPillStyle(status: LiveStatus): CSSProperties {
  if (status === "live") {
    return {
      ...statusPillStyle,
      color: "#dcfce7",
      background: "rgba(34,197,94,0.18)",
      border: "1px solid rgba(74,222,128,0.30)",
      boxShadow: "0 0 22px rgba(34,197,94,0.16)",
    };
  }

  if (status === "ended") {
    return {
      ...statusPillStyle,
      color: "#e5e7eb",
      background: "rgba(148,163,184,0.14)",
      border: "1px solid rgba(148,163,184,0.20)",
    };
  }

  if (status === "cancelled") {
    return {
      ...statusPillStyle,
      color: "#fecaca",
      background: "rgba(127,29,29,0.24)",
      border: "1px solid rgba(248,113,113,0.28)",
    };
  }

  if (status === "upcoming") {
    return {
      ...statusPillStyle,
      color: "#fef3c7",
      background: "rgba(245,158,11,0.16)",
      border: "1px solid rgba(251,191,36,0.26)",
    };
  }

  return statusPillStyle;
}

function sortPublicStreams(streams: LiveStreamRow[]) {
  const rank: Record<LiveStatus, number> = {
    live: 0,
    upcoming: 1,
    ended: 2,
    draft: 3,
    cancelled: 4,
  };

  return [...streams].sort((a, b) => {
    const rankDifference = rank[a.status] - rank[b.status];

    if (rankDifference !== 0) return rankDifference;

    const aDate = new Date(a.scheduled_at || a.created_at).getTime();
    const bDate = new Date(b.scheduled_at || b.created_at).getTime();

    if (a.status === "ended") return bDate - aDate;

    return aDate - bDate;
  });
}

export default function ParapostLivePage() {
  const [currentUserId, setCurrentUserId] = useState("");
  const [liveStreams, setLiveStreams] = useState<LiveStreamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  const publicStreams = useMemo(
    () =>
      sortPublicStreams(
        liveStreams.filter(
          (stream) =>
            stream.visibility === "public" &&
            !stream.is_hidden &&
            (stream.status === "upcoming" ||
              stream.status === "live" ||
              stream.status === "ended")
        )
      ),
    [liveStreams]
  );

  const ownedStreams = useMemo(
    () => liveStreams.filter((stream) => stream.user_id === currentUserId),
    [currentUserId, liveStreams]
  );

  const liveNowCount = useMemo(
    () => publicStreams.filter((stream) => stream.status === "live").length,
    [publicStreams]
  );

  const upcomingCount = useMemo(
    () => publicStreams.filter((stream) => stream.status === "upcoming").length,
    [publicStreams]
  );

  const replayCount = useMemo(
    () => publicStreams.filter((stream) => stream.status === "ended").length,
    [publicStreams]
  );

  const loadLiveHub = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setCurrentUserId("");
      setLiveStreams([]);
      setMessage("Sign in to view Parapost Live.");
      setLoading(false);
      return;
    }

    setCurrentUserId(user.id);

    const { data, error } = await supabase
      .from("live_streams")
      .select(LIVE_SELECT)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      setLiveStreams([]);
      setMessage(error.message || "Could not load Parapost Live.");
      setLoading(false);
      return;
    }

    setLiveStreams((data || []) as LiveStreamRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadLiveHub();
  }, [loadLiveHub]);

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
      .update(payload)
      .eq("id", stream.id)
      .eq("user_id", currentUserId);

    setBusyId("");

    if (error) {
      setMessage(error.message || "Could not update this Live show.");
      return;
    }

    setMessage(successMessage);
    await loadLiveHub();
  };

  const publishScheduledShow = async (stream: LiveStreamRow) => {
    if (!stream.scheduled_at) {
      setMessage("Add a scheduled date and time before publishing this show as Upcoming.");
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
      "Publish this show in the Parapost Live hub as an upcoming event?",
      "The show is now published as Upcoming in the Live hub, dashboard timeline, and your profile timeline."
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
      "Publish this show and mark it Live on Parapost now?",
      "The show is now public and marked Live on Parapost. It will appear live on the dashboard timeline and your profile timeline. Start or confirm the outside stream separately."
    );
  };

  const markLive = async (stream: LiveStreamRow) => {
    await updateOwnedStream(
      stream,
      {
        status: "live",
        started_at: new Date().toISOString(),
        ended_at: null,
      },
      "Mark this published show Live on Parapost now?",
      "The show is now marked Live on Parapost. It will appear live on the dashboard timeline and your profile timeline. Start or confirm the outside stream separately."
    );
  };

  const endLive = async (stream: LiveStreamRow) => {
    await updateOwnedStream(
      stream,
      {
        status: "ended",
        ended_at: new Date().toISOString(),
      },
      "End this show on Parapost?",
      "The show is now marked as ended on Parapost. Stop the outside stream separately."
    );
  };

  const hideShow = async (stream: LiveStreamRow) => {
    await updateOwnedStream(
      stream,
      {
        visibility: "private",
        is_hidden: true,
      },
      "Hide this show from the public Live hub?",
      "The show is now hidden from the public Live hub."
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
      "Cancel this show and remove it from the public Live hub?",
      "The show is cancelled and hidden from the public Live hub."
    );
  };

  const deleteStream = async (stream: LiveStreamRow) => {
    if (!currentUserId || stream.user_id !== currentUserId) return;

    const ok = window.confirm(
      "Delete this Live record permanently from Parapost? This cannot be undone."
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
      setMessage(error.message || "Could not delete this Live record.");
      return;
    }

    setMessage("Live record deleted from Parapost.");
    await loadLiveHub();
  };

  return (
    <main style={pageStyle} className="parapost-live-page">
      <div style={shellStyle}>
        <section style={heroCardStyle} className="parapost-live-hero">
          <div style={topRowStyle}>
            <div style={badgeStyle}>Parapost Live hub</div>

            <Link href="/dashboard" style={backLinkStyle}>
              Back to Dashboard
            </Link>
          </div>

          <div style={logoOrbStyle}>LIVE</div>

          <h1 style={titleStyle}>Parapost Live</h1>

          <p style={subtitleStyle}>
            Discover live paranormal podcasts, investigations, interviews, and
            community broadcasts. For launch, Parapost Live supports YouTube Live
            and Twitch Live links so viewers can watch inside Parapost.
          </p>

          <div style={ruleGridStyle}>
            <div style={ruleCardStyle}>
              <strong style={ruleTitleStyle}>Live broadcasts</strong>
              <span style={ruleTextStyle}>
                Watch YouTube Live and Twitch Live shows directly inside Parapost.
              </span>
            </div>

            <div style={ruleCardStyle}>
              <strong style={ruleTitleStyle}>Upcoming events</strong>
              <span style={ruleTextStyle}>
                Find scheduled podcasts, investigations, and community shows
                before they begin.
              </span>
            </div>

            <div style={ruleCardStyle}>
              <strong style={ruleTitleStyle}>Replays</strong>
              <span style={ruleTextStyle}>
                Replays can remain available inside Parapost when the YouTube or
                Twitch player supports playback.
              </span>
            </div>
          </div>

          <div style={statusStripStyle} className="parapost-live-status-strip">
            <div>
              <span style={statusNumberStyle}>{publicStreams.length}</span>
              <span style={statusLabelStyle}>Published shows</span>
            </div>

            <div>
              <span style={statusNumberStyle}>{liveNowCount}</span>
              <span style={statusLabelStyle}>Live now</span>
            </div>

            <div>
              <span style={statusNumberStyle}>{upcomingCount}</span>
              <span style={statusLabelStyle}>Upcoming</span>
            </div>

            <div>
              <span style={statusNumberStyle}>{replayCount}</span>
              <span style={statusLabelStyle}>Replays</span>
            </div>
          </div>
        </section>

        <section style={panelStyle} className="parapost-live-panel">
          <div style={sectionHeaderStyle}>
            <div>
              <div style={eyebrowStyle}>Community broadcasts</div>
              <h2 style={sectionTitleStyle}>Live shows and upcoming events</h2>
            </div>

            {currentUserId ? (
              <Link href="/live/create" style={createLinkStyle}>
                Create Live Show
              </Link>
            ) : null}
          </div>

          {loading ? (
            <div style={emptyStateStyle}>Loading Parapost Live...</div>
          ) : !currentUserId ? (
            <div style={emptyStateStyle}>{message}</div>
          ) : publicStreams.length === 0 ? (
            <div style={emptyStateStyle}>
              <strong style={{ color: "#fff" }}>No public Live shows yet.</strong>
              <span>
                Published podcasts, investigations, interviews, and broadcasts
                will appear here.
              </span>
            </div>
          ) : (
            <div style={listStyle}>
              {publicStreams.map((stream) => {
                const providerLabel = getProviderLabel(stream.provider);

                return (
                  <article
                    key={`public-${stream.id}`}
                    style={liveCardStyle}
                    className="parapost-live-card"
                  >
                    <div
                      style={thumbnailWrapStyle}
                      className="parapost-live-thumbnail"
                    >
                      {stream.thumbnail_url ? (
                        <img
                          src={stream.thumbnail_url}
                          alt=""
                          style={thumbnailImageStyle}
                        />
                      ) : (
                        <div style={fallbackThumbStyle} className="parapost-live-fallback-thumb">
                          <span style={fallbackBadgeStyle}>PARAPOST LIVE</span>
                          <strong style={fallbackTitleStyle}>
                            {stream.title}
                          </strong>
                          <span style={fallbackProviderStyle}>
                            {providerLabel}
                          </span>
                        </div>
                      )}
                    </div>

                    <div style={liveContentStyle}>
                      <div
                        style={liveCardHeaderStyle}
                        className="parapost-live-card-header"
                      >
                        <div style={{ minWidth: 0 }}>
                          <h3 style={liveTitleStyle}>{stream.title}</h3>
                          <p style={liveDescriptionStyle}>
                            {stream.description || "Live community broadcast."}
                          </p>
                        </div>

                        <span style={getStatusPillStyle(stream.status)}>
                          {getLiveDisplayStatus(stream)}
                        </span>
                      </div>

                      <div
                        style={publicMetaGridStyle}
                        className="parapost-live-meta-grid"
                      >
                        <div>
                          <span style={metaLabelStyle}>Provider</span>
                          <strong style={metaValueStyle}>{providerLabel}</strong>
                        </div>

                        <div>
                          <span style={metaLabelStyle}>Scheduled</span>
                          <strong style={metaValueStyle}>
                            {formatLiveDate(stream.scheduled_at)}
                          </strong>
                        </div>
                      </div>


                  {stream.embed_url ? (
                    <div style={livePlayerWrapStyle}>
                      <iframe
                        src={stream.embed_url}
                        title={stream.title}
                        allow="autoplay; fullscreen; picture-in-picture"
                        allowFullScreen
                        style={livePlayerFrameStyle}
                      />
                    </div>
                  ) : (
                    <div style={emptyStateStyle}>
                      <strong style={{ color: "#fff" }}>Inline player not available.</strong>
                      <span>
                        Add a YouTube Live or Twitch Live link so viewers can watch inside Parapost.
                      </span>
                    </div>
                  )}

                  <LiveChatPanel
                    liveStreamId={stream.id}
                    creatorUserId={stream.user_id}
                    currentUserId={currentUserId}
                    status={stream.status}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>



        {currentUserId ? (
          <section style={creatorPanelStyle} className="parapost-live-panel">
            <div style={sectionHeaderStyle}>
              <div>
                <div style={eyebrowStyle}>Creator studio</div>
                <h2 style={sectionTitleStyle}>Manage your Live shows</h2>
              </div>

              <Link href="/live/create" style={createLinkStyle}>
                Create Live Show
              </Link>
            </div>

            {ownedStreams.length === 0 ? (
              <div style={emptyStateStyle}>
                <strong style={{ color: "#fff" }}>No Live shows yet.</strong>
                <span>
                  Create a Live show, add your YouTube or Twitch link, and publish it
                  when your show is ready.
                </span>
              </div>
            ) : (
              <div style={listStyle}>
                {ownedStreams.map((stream) => {
                  const isBusy = busyId === stream.id;
                  const providerLabel = getProviderLabel(stream.provider);
                  const isPublished =
                    stream.visibility === "public" && !stream.is_hidden;

                  return (
                    <article
                      key={`owner-${stream.id}`}
                      style={creatorCardStyle}
                      className="parapost-live-card"
                    >
                      <div
                        style={thumbnailWrapStyle}
                        className="parapost-live-thumbnail"
                      >
                        {stream.thumbnail_url ? (
                          <img
                            src={stream.thumbnail_url}
                            alt=""
                            style={thumbnailImageStyle}
                          />
                        ) : (
                          <div style={fallbackThumbStyle} className="parapost-live-fallback-thumb">
                            <span style={fallbackBadgeStyle}>PARAPOST LIVE</span>
                            <strong style={fallbackTitleStyle}>
                              {stream.title}
                            </strong>
                            <span style={fallbackProviderStyle}>
                              {providerLabel}
                            </span>
                          </div>
                        )}
                      </div>

                      <div style={liveContentStyle}>
                        <div
                          style={liveCardHeaderStyle}
                          className="parapost-live-card-header"
                        >
                          <div style={{ minWidth: 0 }}>
                            <h3 style={liveTitleStyle}>{stream.title}</h3>
                            <p style={liveDescriptionStyle}>
                              {stream.description || "No description yet."}
                            </p>
                            <p style={liveHintStyle}>{getOwnerHint(stream)}</p>
                          </div>

                          <span style={getStatusPillStyle(stream.status)}>
                            {getLiveDisplayStatus(stream)}
                          </span>
                        </div>

                        <div
                          style={metaGridStyle}
                          className="parapost-live-meta-grid"
                        >
                          <div>
                            <span style={metaLabelStyle}>Provider</span>
                            <strong style={metaValueStyle}>
                              {providerLabel}
                            </strong>
                          </div>

                          <div>
                            <span style={metaLabelStyle}>Published</span>
                            <strong style={metaValueStyle}>
                              {isPublished ? "Yes" : "Not yet"}
                            </strong>
                          </div>

                          <div>
                            <span style={metaLabelStyle}>Visible in Parapost</span>
                            <strong style={metaValueStyle}>
                              {isPublished ? "Yes" : "No"}
                            </strong>
                          </div>

                          <div>
                            <span style={metaLabelStyle}>Scheduled</span>
                            <strong style={metaValueStyle}>
                              {formatLiveDate(stream.scheduled_at)}
                            </strong>
                          </div>

                          <div>
                            <span style={metaLabelStyle}>Started</span>
                            <strong style={metaValueStyle}>
                              {formatLiveDate(stream.started_at)}
                            </strong>
                          </div>

                          <div>
                            <span style={metaLabelStyle}>Ended</span>
                            <strong style={metaValueStyle}>
                              {formatLiveDate(stream.ended_at)}
                            </strong>
                          </div>
                        </div>

                        <div
                          style={actionRowStyle}
                          className="parapost-live-actions"
                        >
                          <Link
                            href={`/live/create?edit=${stream.id}`}
                            style={secondaryLinkActionStyle}
                          >
                            Edit Show
                          </Link>

                          {!isPublished &&
                          stream.status !== "ended" &&
                          stream.status !== "cancelled" ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => publishScheduledShow(stream)}
                              style={secondaryActionStyle}
                            >
                              Publish Upcoming
                            </button>
                          ) : null}

                          {!isPublished &&
                          stream.status !== "ended" &&
                          stream.status !== "cancelled" ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => publishAndStartShow(stream)}
                              style={primaryActionStyle}
                            >
                              Publish &amp; Go Live
                            </button>
                          ) : null}

                          {isPublished &&
                          stream.status !== "live" &&
                          stream.status !== "ended" &&
                          stream.status !== "cancelled" ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => markLive(stream)}
                              style={primaryActionStyle}
                            >
                              Mark Live
                            </button>
                          ) : null}

                          {stream.status === "live" ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => endLive(stream)}
                              style={primaryActionStyle}
                            >
                              End Live
                            </button>
                          ) : null}

                          {isPublished ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => hideShow(stream)}
                              style={secondaryActionStyle}
                            >
                              Hide from Hub
                            </button>
                          ) : null}

                          {stream.status !== "cancelled" &&
                          stream.status !== "ended" &&
                          stream.status !== "live" ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => cancelShow(stream)}
                              style={secondaryActionStyle}
                            >
                              Cancel Show
                            </button>
                          ) : null}

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => deleteStream(stream)}
                            style={dangerActionStyle}
                          >
                            Delete Record
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {message ? <div style={noteStyle}>{message}</div> : null}
          </section>
        ) : null}

        <section style={footerNoteStyle}>
          <strong>How Parapost Live works:</strong> Creators can broadcast through
          StreamYard, Restream, Evmux, OBS, or another tool to YouTube or Twitch.
          Then they paste the YouTube/Twitch Live link into Parapost so viewers can
          watch and comment inside Parapost.
        </section>
      </div>

      <style jsx global>{`
        .parapost-live-page {
          overflow-x: hidden;
          touch-action: pan-y;
          -webkit-overflow-scrolling: touch;
        }

        .parapost-live-page *,
        .parapost-live-page *::before,
        .parapost-live-page *::after {
          box-sizing: border-box;
        }

        .parapost-live-card {
          transition:
            border-color 180ms ease,
            box-shadow 180ms ease,
            transform 180ms ease;
        }

        .parapost-live-card:hover {
          border-color: rgba(216, 180, 254, 0.2) !important;
          box-shadow:
            0 18px 46px rgba(0, 0, 0, 0.28),
            0 0 30px rgba(168, 85, 247, 0.1) !important;
          transform: translateY(-1px);
        }

        @media (max-width: 980px) {
          .parapost-live-page {
            padding: max(18px, env(safe-area-inset-top)) 12px
              calc(88px + env(safe-area-inset-bottom)) !important;
          }

          .parapost-live-actions {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }

          .parapost-live-actions > * {
            width: 100% !important;
            min-height: 42px !important;
            padding-left: 10px !important;
            padding-right: 10px !important;
            touch-action: manipulation;
          }
        }

        @media (max-width: 820px) {
          .parapost-live-card {
            grid-template-columns: 1fr !important;
            border-radius: 22px !important;
          }

          .parapost-live-thumbnail {
            min-height: 210px !important;
          }

          .parapost-live-card-header {
            display: grid !important;
            gap: 10px !important;
          }

          .parapost-live-meta-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 760px) {
          .parapost-live-page {
            padding: max(14px, env(safe-area-inset-top)) 10px
              calc(96px + env(safe-area-inset-bottom)) !important;
          }

          .parapost-live-hero,
          .parapost-live-panel {
            border-radius: 24px !important;
            padding: 16px !important;
          }

          .parapost-live-status-strip {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 10px !important;
          }

          .parapost-live-card {
            padding: 10px !important;
          }

          .parapost-live-thumbnail {
            min-height: 190px !important;
          }
        }

        @media (max-width: 560px) {
          .parapost-live-actions {
            grid-template-columns: 1fr !important;
          }

          .parapost-live-actions > * {
            justify-content: center !important;
          }
        }

        @media (max-width: 430px) {
          .parapost-live-status-strip,
          .parapost-live-meta-grid {
            grid-template-columns: 1fr !important;
          }

          .parapost-live-thumbnail {
            min-height: 172px !important;
          }
        }
      `}</style>
    </main>
  );
}

const pageStyle: CSSProperties = {
height: "100dvh",
minHeight: "100dvh",
position: "relative",
overflowY: "auto",
overflowX: "hidden",
overscrollBehaviorY: "auto",
WebkitOverflowScrolling: "touch",
touchAction: "pan-y",
boxSizing: "border-box",
background:
"radial-gradient(circle at 14% 0%, rgba(168,85,247,0.28), transparent 34%), radial-gradient(circle at 88% 14%, rgba(236,72,153,0.14), transparent 34%), linear-gradient(180deg, #05050b 0%, #07090d 52%, #05050b 100%)",
color: "#fff",
padding:
"max(18px, env(safe-area-inset-top)) 14px calc(80px + env(safe-area-inset-bottom))",
};


const shellStyle: CSSProperties = {
  width: "100%",
  maxWidth: 1080,
  margin: "0 auto",
  display: "grid",
  gap: 18,
};

const heroCardStyle: CSSProperties = {
  borderRadius: 32,
  border: "1px solid rgba(216,180,254,0.20)",
  background:
    "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(255,255,255,0.055) 36%, rgba(10,13,24,0.94) 100%)",
  boxShadow:
    "0 24px 70px rgba(0,0,0,0.34), 0 0 40px rgba(168,85,247,0.15)",
  padding: 24,
  overflow: "hidden",
};

const topRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 28,
};

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 34,
  borderRadius: 999,
  padding: "0 13px",
  color: "#f3e8ff",
  background: "rgba(168,85,247,0.18)",
  border: "1px solid rgba(216,180,254,0.22)",
  fontSize: 12,
  fontWeight: 950,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const backLinkStyle: CSSProperties = {
  minHeight: 36,
  borderRadius: 999,
  padding: "0 14px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  textDecoration: "none",
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.12)",
  fontSize: 13,
  fontWeight: 850,
};

const logoOrbStyle: CSSProperties = {
  width: 84,
  height: 84,
  borderRadius: 28,
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg, #a855f7, #7c3aed 52%, #ec4899)",
  color: "#fff",
  fontSize: 17,
  fontWeight: 1000,
  letterSpacing: "0.06em",
  boxShadow: "0 18px 42px rgba(168,85,247,0.34)",
  marginBottom: 18,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "clamp(38px, 8vw, 72px)",
  lineHeight: 0.95,
  letterSpacing: "-0.07em",
  fontWeight: 1000,
};

const subtitleStyle: CSSProperties = {
  margin: "16px 0 0",
  maxWidth: 760,
  color: "#d1d5db",
  fontSize: 16,
  lineHeight: 1.65,
};

const ruleGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
  marginTop: 24,
};

const ruleCardStyle: CSSProperties = {
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.055)",
  padding: 15,
  display: "grid",
  gap: 8,
};

const ruleTitleStyle: CSSProperties = {
  color: "#fff",
  fontSize: 14,
  fontWeight: 950,
};

const ruleTextStyle: CSSProperties = {
  color: "#aeb6c4",
  fontSize: 13,
  lineHeight: 1.5,
};

const statusStripStyle: CSSProperties = {
  marginTop: 24,
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(0,0,0,0.20)",
  padding: 14,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 10,
};

const statusNumberStyle: CSSProperties = {
  display: "block",
  color: "#fff",
  fontSize: 28,
  fontWeight: 1000,
  lineHeight: 1,
};

const statusLabelStyle: CSSProperties = {
  display: "block",
  color: "#9ca3af",
  fontSize: 12,
  marginTop: 6,
  fontWeight: 800,
};

const panelStyle: CSSProperties = {
  borderRadius: 28,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(10,13,24,0.82)",
  boxShadow: "0 18px 44px rgba(0,0,0,0.24)",
  padding: 18,
};

const creatorPanelStyle: CSSProperties = {
  ...panelStyle,
  border: "1px solid rgba(216,180,254,0.18)",
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 14,
};

const eyebrowStyle: CSSProperties = {
  color: "#a78bfa",
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 6,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: "#fff",
  fontSize: 23,
  fontWeight: 1000,
  letterSpacing: "-0.04em",
};

const createLinkStyle: CSSProperties = {
  minHeight: 38,
  borderRadius: 999,
  padding: "0 14px",
  border: "1px solid rgba(216,180,254,0.28)",
  background:
    "linear-gradient(135deg, rgba(168,85,247,0.95), rgba(124,58,237,0.95))",
  color: "#fff",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 900,
  boxShadow: "0 12px 28px rgba(168,85,247,0.24)",
};

const emptyStateStyle: CSSProperties = {
  minHeight: 150,
  borderRadius: 22,
  border: "1px dashed rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.035)",
  color: "#9ca3af",
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  padding: 22,
  gap: 8,
  lineHeight: 1.5,
};

const listStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const liveCardStyle: CSSProperties = {
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.10)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.035))",
  padding: 12,
  display: "grid",
  gridTemplateColumns: "minmax(210px, 300px) 1fr",
  gap: 14,
};

const creatorCardStyle: CSSProperties = {
  ...liveCardStyle,
  border: "1px solid rgba(216,180,254,0.14)",
};

const thumbnailWrapStyle: CSSProperties = {
  borderRadius: 18,
  overflow: "hidden",
  minHeight: 168,
  background: "#05070d",
};

const thumbnailImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: 168,
  objectFit: "cover",
  display: "block",
};

const fallbackThumbStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: 168,
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
  fontSize: 21,
  lineHeight: 1.05,
};

const fallbackProviderStyle: CSSProperties = {
  color: "#d1d5db",
  fontSize: 13,
  fontWeight: 800,
};

const liveContentStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  alignContent: "space-between",
  gap: 12,
};

const liveCardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const liveTitleStyle: CSSProperties = {
  margin: 0,
  color: "#fff",
  fontSize: 17,
  fontWeight: 950,
};

const liveDescriptionStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#aeb6c4",
  fontSize: 13,
  lineHeight: 1.5,
};

const liveHintStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#c4b5fd",
  fontSize: 12.5,
  lineHeight: 1.45,
};

const statusPillStyle: CSSProperties = {
  flexShrink: 0,
  minHeight: 30,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 11px",
  color: "#f3e8ff",
  background: "rgba(168,85,247,0.18)",
  border: "1px solid rgba(216,180,254,0.18)",
  fontSize: 12,
  fontWeight: 900,
};

const publicMetaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};

const metaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 10,
};

const metaLabelStyle: CSSProperties = {
  display: "block",
  color: "#7d8593",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 4,
};

const metaValueStyle: CSSProperties = {
  color: "#e5e7eb",
  fontSize: 13,
  lineHeight: 1.35,
  textTransform: "capitalize",
};

const livePlayerWrapStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "16 / 9",
  overflow: "hidden",
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "#05070d",
};

const livePlayerFrameStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  border: 0,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const primaryActionStyle: CSSProperties = {
  minHeight: 36,
  borderRadius: 999,
  padding: "0 13px",
  border: "1px solid rgba(216,180,254,0.28)",
  background: "rgba(168,85,247,0.22)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryActionStyle: CSSProperties = {
  ...primaryActionStyle,
  background: "rgba(255,255,255,0.06)",
};

const dangerActionStyle: CSSProperties = {
  ...primaryActionStyle,
  border: "1px solid rgba(248,113,113,0.28)",
  background: "rgba(127,29,29,0.24)",
};

const secondaryLinkActionStyle: CSSProperties = {
  ...secondaryActionStyle,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const publicActionStyle: CSSProperties = {
  ...primaryActionStyle,
  minHeight: 40,
  padding: "0 16px",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background:
    "linear-gradient(135deg, rgba(168,85,247,0.95), rgba(124,58,237,0.95))",
  boxShadow: "0 12px 28px rgba(168,85,247,0.20)",
};

const linkPendingStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: 13,
  fontWeight: 800,
};

const noteStyle: CSSProperties = {
  marginTop: 12,
  color: "#fca5a5",
  fontSize: 13,
  lineHeight: 1.5,
};

const footerNoteStyle: CSSProperties = {
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.035)",
  color: "#aeb6c4",
  padding: 16,
  fontSize: 13,
  lineHeight: 1.55,
};

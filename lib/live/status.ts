export type LiveStatus = "draft" | "upcoming" | "live" | "ended" | "cancelled";
export const LIVE_REPLAY_DELAY_MS = 6 * 60 * 60 * 1000;

// A running broadcast must not expire just because it started six hours ago.
// The display grace period begins only when an end timestamp has been recorded.
export function getLiveDisplayStatus(stream: {
  status?: string | null;
  ended_at?: string | null;
}, now = Date.now()): LiveStatus {
  if (stream.status === "ended") {
    const endedAt = stream.ended_at ? Date.parse(stream.ended_at) : NaN;
    if (Number.isFinite(endedAt) && endedAt <= now && now - endedAt < LIVE_REPLAY_DELAY_MS) return "live";
    return "ended";
  }
  if (stream.status === "live" || stream.status === "upcoming" || stream.status === "cancelled") return stream.status;
  return "draft";
}

export function getLiveDisplayLabel(stream: { status?: string | null; ended_at?: string | null }, now = Date.now()) {
  switch (getLiveDisplayStatus(stream, now)) {
    case "upcoming": return "Live Soon";
    case "live": return "Live";
    case "ended": return "Replay";
    case "cancelled": return "Cancelled";
    default: return "Not Published";
  }
}

export function needsLiveRefresh(stream: { status?: string | null; ended_at?: string | null }) {
  return stream.status === "upcoming" || stream.status === "live" ||
    (stream.status === "ended" && getLiveDisplayStatus(stream) === "live");
}

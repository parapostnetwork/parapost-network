export type LiveStatus = "draft" | "upcoming" | "live" | "ended" | "cancelled";
export const LIVE_REPLAY_DELAY_MS = 6 * 60 * 60 * 1000;
type ShowTiming = { status?: string | null; scheduled_at?: string | null; started_at?: string | null; ended_at?: string | null };

// Published scheduled shows use a fixed six-hour window. Manual End Show wins.
// Display timing must not wait for a successful database synchronization.
export function getLiveDisplayStatus(stream: ShowTiming, now = Date.now()): LiveStatus {
  if (stream.status === "ended" || stream.status === "cancelled") return stream.status;
  if (stream.status !== "upcoming" && stream.status !== "live") return "draft";
  const start = Date.parse(stream.scheduled_at || stream.started_at || "");
  if (!Number.isFinite(start)) return stream.status;
  if (now >= start + LIVE_REPLAY_DELAY_MS) return "ended";
  if (now >= start) return "live";
  return stream.status;
}

export function getLiveDisplayLabel(stream: ShowTiming, now = Date.now()) {
  switch (getLiveDisplayStatus(stream, now)) {
    case "upcoming": return "Live Soon";
    case "live": return "Live";
    case "ended": return "Replay";
    case "cancelled": return "Cancelled";
    default: return "Not Published";
  }
}

export function needsLiveRefresh(stream: ShowTiming) {
  return stream.status === "upcoming" || stream.status === "live";
}

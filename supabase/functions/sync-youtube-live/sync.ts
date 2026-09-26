export type Stream = {
  id: string;
  provider: string | null;
  external_url: string | null;
  embed_url: string | null;
  status: string;
  visibility: string;
  is_hidden: boolean;
  started_at: string | null;
  ended_at: string | null;
  updated_at: string | null;
};

export type Video = {
  id: string;
  liveStreamingDetails?: { actualStartTime?: string; actualEndTime?: string };
};

export function youtubeVideoId(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.split("/")[1];
    if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
      const parts = url.pathname.split("/");
      id = url.pathname === "/watch" ? url.searchParams.get("v")
        : ["live", "embed", "shorts"].includes(parts[1]) ? parts[2] : null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

export function isCandidate(stream: Stream): boolean {
  return stream.provider === "youtube" && stream.visibility === "public" &&
    stream.is_hidden === false && ["upcoming", "live"].includes(stream.status);
}

export function transition(stream: Stream, video: Video | undefined) {
  if (!isCandidate(stream) || !video) return null;
  const details = video.liveStreamingDetails;
  const start = details?.actualStartTime;
  const end = details?.actualEndTime;
  // A scheduled date, a missing video or an API outage is not proof of a broadcast.
  if (!start || !Number.isFinite(Date.parse(start))) return null;
  if (end && (!Number.isFinite(Date.parse(end)) || Date.parse(end) < Date.parse(start))) return null;
  const status = end ? "ended" : "live";
  if (stream.status === status && stream.started_at === start && stream.ended_at === (end || null)) return null;
  return { status, started_at: start, ended_at: end || null };
}

type Config = { supabaseUrl: string; serviceRoleKey: string; youtubeApiKey: string };

export async function syncYoutube(config: Config, fetcher: typeof fetch = fetch, dryRun = false) {
  const headers = { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` };
  const table = `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/live_streams`;
  const streams: Stream[] = [];
  let cursor = "";
  // Keyset pagination avoids skipping rows when an earlier batch changes status.
  for (;;) {
    const query = new URLSearchParams({
      select: "id,provider,external_url,embed_url,status,visibility,is_hidden,started_at,ended_at,updated_at",
      provider: "eq.youtube", visibility: "eq.public", is_hidden: "eq.false",
      status: "in.(upcoming,live)", order: "id.asc", limit: "500",
    });
    if (cursor) query.set("id", `gt.${cursor}`);
    const result = await fetcher(`${table}?${query}`, { headers, signal: AbortSignal.timeout(10000) });
    if (!result.ok) throw new Error(`Live query failed (${result.status})`);
    const rows = await result.json() as Stream[];
    if (!Array.isArray(rows)) throw new Error("Invalid live query response");
    streams.push(...rows.filter(isCandidate));
    if (rows.length < 500) break;
    cursor = rows[rows.length - 1].id;
  }

  const ids = [...new Set(streams.map(s => youtubeVideoId(s.external_url || s.embed_url)).filter((id): id is string => !!id))];
  const videos = new Map<string, Video>();
  // Finish all provider reads before writing. A failed batch never fabricates statuses.
  for (let offset = 0; offset < ids.length; offset += 50) {
    const query = new URLSearchParams({ part: "liveStreamingDetails", id: ids.slice(offset, offset + 50).join(",") });
    const result = await fetcher(`https://www.googleapis.com/youtube/v3/videos?${query}`, {
      headers: { "X-Goog-Api-Key": config.youtubeApiKey }, signal: AbortSignal.timeout(10000),
    });
    if (!result.ok) throw new Error(`YouTube status check failed (${result.status})`);
    const body = await result.json() as { items?: Video[] };
    if (!Array.isArray(body.items)) throw new Error("Invalid YouTube response");
    for (const video of body.items) videos.set(video.id, video);
  }

  let changed = 0;
  let conflicts = 0;
  for (const stream of streams) {
    const id = youtubeVideoId(stream.external_url || stream.embed_url);
    const patch = transition(stream, id ? videos.get(id) : undefined);
    if (!patch) continue;
    if (dryRun) { changed++; continue; }
    const query = new URLSearchParams({
      id: `eq.${stream.id}`, status: `eq.${stream.status}`, provider: "eq.youtube",
      visibility: "eq.public", is_hidden: "eq.false",
      updated_at: stream.updated_at ? `eq.${stream.updated_at}` : "is.null",
      external_url: stream.external_url ? `eq.${stream.external_url}` : "is.null",
      embed_url: stream.embed_url ? `eq.${stream.embed_url}` : "is.null",
      select: "id",
    });
    // Compare-and-set protects an edit, hide, cancel or manual end during the API request.
    const result = await fetcher(`${table}?${query}`, {
      method: "PATCH", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }), signal: AbortSignal.timeout(10000),
    });
    if (!result.ok) throw new Error(`Live update failed (${result.status})`);
    const rows = await result.json() as { id: string }[];
    if (rows.length) changed++; else conflicts++;
  }
  return { checked: streams.length, videos: ids.length, changed, conflicts, dryRun };
}

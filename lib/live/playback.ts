// Keep the published waiting-room player mounted. YouTube can start playback
// when its broadcast begins without waiting for a Parapost metadata refresh.
export function canPlayPublishedStream(stream: {
  status?: string | null;
  visibility?: string | null;
  is_hidden?: boolean | null;
  embed_url?: string | null;
}) {
  return stream.visibility === "public" && stream.is_hidden === false &&
    Boolean(stream.embed_url) && ["upcoming", "live", "ended"].includes(stream.status || "");
}

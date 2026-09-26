// Keep the published waiting-room player mounted. YouTube can start playback
// when its broadcast begins without waiting for a Parapost metadata refresh.
export function canPlayPublishedStream(stream: {
  provider?: string | null;
  status?: string | null;
  visibility?: string | null;
  is_hidden?: boolean | null;
  embed_url?: string | null;
}) {
  const playableStatus = stream.status === "live" || stream.status === "ended" ||
    (stream.provider === "youtube" && stream.status === "upcoming");
  return stream.visibility === "public" && stream.is_hidden === false &&
    Boolean(stream.embed_url) && playableStatus;
}

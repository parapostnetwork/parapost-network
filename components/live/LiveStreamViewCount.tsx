"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { observeYouTubePlayback } from "@/lib/live/youtube-player";

export default function LiveStreamViewCount({ streamId, initialViews = 0, shouldCount = true, playerElementId }: {
  streamId: string; initialViews?: number | null; shouldCount?: boolean; playerElementId: string;
}) {
  const [recorded, setRecorded] = useState(0);
  const counted = useRef(false);
  const inFlight = useRef(false);
  const viewCount = Math.max(0, Number(initialViews || 0), recorded);
  useEffect(() => {
    if (!streamId || !shouldCount || counted.current) return;
    const frame = document.getElementById(playerElementId);
    if (!(frame instanceof HTMLIFrameElement)) return;
    const countView = async () => {
      if (counted.current || inFlight.current) return;
      inFlight.current = true;
      try {
        const { data, error } = await supabase.rpc("increment_live_stream_views", { target_stream_id: streamId });
        const value = typeof data === "number" ? data : Array.isArray(data) ? Number(data[0]) : Number(data);
        // The existing RPC returns zero when database status is not eligible yet.
        if (!error && Number.isFinite(value) && value > 0) {
          counted.current = true;
          setRecorded(value);
        }
      } catch { /* A later PLAYING check retries without double-counting. */ }
      finally { inFlight.current = false; }
    };
    const url = new URL(frame.src);
    if (["www.youtube.com", "www.youtube-nocookie.com", "youtube.com"].includes(url.hostname)) {
      return observeYouTubePlayback(frame, () => { void countView(); });
    }
    // Preserve existing interaction counting for other embedded providers.
    const onBlur = () => window.setTimeout(() => {
      if (document.activeElement === frame) void countView();
    }, 0);
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [streamId, shouldCount, playerElementId]);
  return <span>{viewCount.toLocaleString()} {viewCount === 1 ? "View" : "Views"}</span>;
}

type PlaybackOptions = {
  videos: Record<string, HTMLVideoElement | null>;
  activeId: string;
  pausedId: string | null;
  blocked: boolean;
  muted: boolean;
};

// Reconcile playback without seeking, reloading, or restarting a playing video.
// Realtime count updates must not disturb the current media element.
export function attachReelPlayback({
  videos, activeId, pausedId, blocked, muted,
}: PlaybackOptions) {
  let pageHidden = document.visibilityState === "hidden";
  let disposed = false;
  const entries = Object.entries(videos).filter(
    (entry): entry is [string, HTMLVideoElement] => entry[1] !== null,
  );

  const shouldPlay = (id: string) =>
    !disposed && !pageHidden && document.visibilityState !== "hidden" &&
    id === activeId && pausedId !== id && !blocked;

  const syncVideo = (id: string, video: HTMLVideoElement) => {
    if (!shouldPlay(id)) {
      if (!video.paused) video.pause();
      return;
    }
    if (video.paused && !video.error) {
      // A scroll or page transition can interrupt a pending play request.
      // canplay/pageshow will retry once the active video can play again.
      void video.play().catch(() => {});
    }
  };

  const syncAll = () => entries.forEach(([id, video]) => syncVideo(id, video));
  const hide = () => { pageHidden = true; syncAll(); };
  const show = () => { pageHidden = false; syncAll(); };
  const visibilityChanged = () => {
    pageHidden = document.visibilityState === "hidden";
    syncAll();
  };
  const cleanups = entries.map(([id, video]) => {
    video.muted = muted;
    const ready = () => syncVideo(id, video);
    // An old play promise must not leave an offscreen Reel playing.
    const playing = () => { if (!shouldPlay(id)) video.pause(); };
    video.addEventListener("canplay", ready);
    video.addEventListener("playing", playing);
    return () => {
      video.removeEventListener("canplay", ready);
      video.removeEventListener("playing", playing);
    };
  });

  document.addEventListener("visibilitychange", visibilityChanged);
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", show);
  window.addEventListener("online", syncAll);
  syncAll();

  return () => {
    disposed = true;
    cleanups.forEach((cleanup) => cleanup());
    document.removeEventListener("visibilitychange", visibilityChanged);
    window.removeEventListener("pagehide", hide);
    window.removeEventListener("pageshow", show);
    window.removeEventListener("online", syncAll);
    // Do not pause here: this cleanup also runs when only the counts change.
  };
}

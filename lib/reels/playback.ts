type PlaybackOptions = {
  videos: Record<string, HTMLVideoElement | null>;
  activeId: string;
  pausedId: string | null;
  blocked: boolean;
  muted: boolean;
};

// Retain recovery budgets across count-only React effect reattachments.
const recoveryStates = new WeakMap<HTMLVideoElement, { time: number; since: number; attempts: number; pending: object | null; recoveryPause: boolean }>();

const visibleStates = new WeakMap<HTMLVideoElement, boolean>();

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

  const activeVideo = videos[activeId];
  let sufficientlyVisible = activeVideo ? (!activeVideo.paused && visibleStates.get(activeVideo)) || (typeof IntersectionObserver === "undefined") : false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const stopWatchdog = () => {
    if (watchdog !== undefined) clearTimeout(watchdog);
    watchdog = undefined;
  };
  const stateFor = (video: HTMLVideoElement) => {
    let state = recoveryStates.get(video);
    if (!state) {
      state = { time: video.currentTime, since: Date.now(), attempts: 0, pending: null, recoveryPause: false };
      recoveryStates.set(video, state);
    }
    return state;
  };

  const shouldPlay = (id: string) =>
    !disposed && !pageHidden && document.visibilityState !== "hidden" &&
    id === activeId && pausedId !== id && !blocked && sufficientlyVisible;

  const syncVideo = (id: string, video: HTMLVideoElement) => {
    if (!shouldPlay(id)) {
      if (!video.paused) video.pause();
      return;
    }
    if (video.paused) requestPlay(video);
  };

  const requestPlay = (video: HTMLVideoElement) => {
    const state = stateFor(video);
    if (video.error || video.ended || state.pending) return;
    const token = {};
    state.pending = token;
    const settled = () => { if (state.pending === token) state.pending = null; };
    // Catch synchronous failures too. Never reload, seek, or mute to bypass policy.
    try {
      void Promise.resolve(video.play()).then(settled, settled);
    } catch {
      settled();
    }
  };
  const armWatchdog = () => {
    if (watchdog !== undefined || !activeVideo || !shouldPlay(activeId) || activeVideo.ended || activeVideo.error) return;
    watchdog = setTimeout(() => {
      watchdog = undefined;
      if (!shouldPlay(activeId) || activeVideo.ended || activeVideo.error) return;
      const state = stateFor(activeVideo);
      if (Math.abs(activeVideo.currentTime - state.time) > 0.01) {
        state.time = activeVideo.currentTime;
        state.since = Date.now();
        state.attempts = 0;
      } else if (Date.now() - state.since >= 8000 && !activeVideo.seeking &&
        activeVideo.playbackRate > 0 && activeVideo.readyState >= 3 && !state.pending && state.attempts < 2) {
        state.attempts += 1;
        state.since = Date.now();
        // Match the successful swipe-away/back transition without seeking or
        // changing the source. play() alone can be a no-op while paused=false.
        if (!activeVideo.paused) { state.recoveryPause = true; activeVideo.pause(); }
        requestPlay(activeVideo);
      }
      // After two attempts, actual time advancement or a lifecycle event must
      // restart monitoring. Buffer starvation is left to the browser to resolve.
      if (state.attempts < 2) armWatchdog();
    }, 2000);
  };
  const syncAll = () => {
    entries.forEach(([id, video]) => syncVideo(id, video));
    if (shouldPlay(activeId)) armWatchdog(); else stopWatchdog();
  };
  const hide = () => { pageHidden = true; syncAll(); };
  const show = () => { pageHidden = false; syncAll(); };
  const visibilityChanged = () => {
    pageHidden = document.visibilityState === "hidden";
    syncAll();
  };
  const cleanups = entries.map(([id, video]) => {
    let pauseRecovery: ReturnType<typeof setTimeout> | undefined;
    const cancelRecovery = () => {
      if (pauseRecovery !== undefined) clearTimeout(pauseRecovery);
      pauseRecovery = undefined;
    };
    const paused = () => {
      cancelRecovery();
      const state = stateFor(video);
      if (state.recoveryPause) { state.recoveryPause = false; return; }
      state.pending = null;
      if (!shouldPlay(id) || video.error || video.ended) return;
      // Wait for React to commit a tap-to-pause or overlay state change.
      // Their effect cleanup cancels this retry; only an unexpected pause of
      // the visible, active Reel is resumed, without resetting its playhead.
      pauseRecovery = setTimeout(() => {
        pauseRecovery = undefined;
        syncVideo(id, video);
      }, 150);
    };
    const progress = () => {
      if (id !== activeId || !shouldPlay(id)) return;
      const state = stateFor(video);
      if (Math.abs(video.currentTime - state.time) > 0.01) {
        state.time = video.currentTime;
        state.since = Date.now();
        state.attempts = 0;
        armWatchdog();
      }
    };
    const buffering = () => { if (id === activeId) armWatchdog(); };
    const ended = () => { if (id === activeId) { cancelRecovery(); stopWatchdog(); } };
    video.muted = muted;
    const ready = () => syncVideo(id, video);
    // An old play promise must not leave an offscreen Reel playing.
    const playing = () => { stateFor(video).pending = null; if (!shouldPlay(id)) video.pause(); };
    video.addEventListener("canplay", ready);
    video.addEventListener("playing", playing);
    video.addEventListener("pause", paused);
    video.addEventListener("timeupdate", progress);
    video.addEventListener("waiting", buffering);
    video.addEventListener("stalled", buffering);
    video.addEventListener("ended", ended);
    return () => {
      cancelRecovery();
      video.removeEventListener("canplay", ready);
      video.removeEventListener("playing", playing);
      video.removeEventListener("pause", paused);
      video.removeEventListener("timeupdate", progress);
      video.removeEventListener("waiting", buffering);
      video.removeEventListener("stalled", buffering);
      video.removeEventListener("ended", ended);
    };
  });

  const observer = activeVideo && typeof IntersectionObserver !== "undefined"
    ? new IntersectionObserver(([entry]) => {
      if (disposed || !entry) return;
      sufficientlyVisible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
      visibleStates.set(activeVideo, sufficientlyVisible);
      syncAll();
    }, { threshold: [0, 0.5] }) : null;
  if (activeVideo) observer?.observe(activeVideo);
  document.addEventListener("visibilitychange", visibilityChanged);
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", show);
  window.addEventListener("online", syncAll);
  window.addEventListener("focus", syncAll);
  syncAll();

  return () => {
    disposed = true;
    stopWatchdog();
    observer?.disconnect();
    cleanups.forEach((cleanup) => cleanup());
    document.removeEventListener("visibilitychange", visibilityChanged);
    window.removeEventListener("pagehide", hide);
    window.removeEventListener("pageshow", show);
    window.removeEventListener("online", syncAll);
    window.removeEventListener("focus", syncAll);
    // Do not pause here: this cleanup also runs when only the counts change.
  };
}

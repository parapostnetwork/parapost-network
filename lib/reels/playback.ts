export type ReelPlaybackIssue = "interrupted" | "policy" | "network" | "decode" | "unsupported" | "loading" | "frames" | "temporary";

type PlaybackOptions = {
  videos: Record<string, HTMLVideoElement | null>;
  activeId: string;
  pausedId: string | null;
  blocked: boolean;
  muted: boolean;
  onIssue?: (id: string, issue: ReelPlaybackIssue | null) => void;
};

type RecoveryState = {
  time: number;
  since: number;
  frameSince: number;
  attempts: number;
  pending: object | null;
  issue: ReelPlaybackIssue | null;
  failure: ReelPlaybackIssue | null;
  eligible: boolean;
};
// Retain budgets and the single outstanding request across count-only effects.
const recoveryStates = new WeakMap<HTMLVideoElement, RecoveryState>();
const visibleStates = new WeakMap<HTMLVideoElement, boolean>();
const controllers = new WeakMap<HTMLVideoElement, {
  settle: (failure: ReelPlaybackIssue | null) => void;
  intent: (paused: boolean, retry: boolean) => void;
}>();

// Called synchronously inside the gesture: sound-enabled play keeps user activation.
export function setReelPlaybackIntent(video: HTMLVideoElement, paused: boolean, retry = false) {
  controllers.get(video)?.intent(paused, retry);
}

function classifyFailure(video: HTMLVideoElement, error?: unknown): ReelPlaybackIssue {
  if (video.error?.code === 4) return "unsupported";
  if (video.error?.code === 3) return "decode";
  if (video.error?.code === 2) return "network";
  const name = error && typeof error === "object" && "name" in error ? error.name : "";
  if (name === "NotAllowedError") return "policy";
  if (name === "NotSupportedError") return "unsupported";
  if (name === "AbortError" || video.error?.code === 1) return "interrupted";
  if (name === "NetworkError") return "network";
  return "temporary";
}

const isSufficientlyVisibleNow = (video: HTMLVideoElement) => {
  if (typeof video.getBoundingClientRect !== "function") return false;

  const rect = video.getBoundingClientRect();
  const width = Math.max(0, rect.width || rect.right - rect.left);
  const height = Math.max(0, rect.height || rect.bottom - rect.top);

  if (width <= 0 || height <= 0) return false;

  const viewportWidth =
    document.documentElement?.clientWidth || window.innerWidth || 0;
  const viewportHeight =
    document.documentElement?.clientHeight || window.innerHeight || 0;

  if (viewportWidth <= 0 || viewportHeight <= 0) return false;

  const visibleWidth = Math.max(
    0,
    Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0),
  );
  const visibleHeight = Math.max(
    0,
    Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0),
  );

  return (visibleWidth * visibleHeight) / (width * height) >= 0.5;
};

// No automatic source reloads, seeks, or changes to the user's sound preference.
export function attachReelPlayback({
  videos, activeId, pausedId, blocked, muted, onIssue,
}: PlaybackOptions) {
  let disposed = false;
  let pageHidden = document.visibilityState === "hidden";
  const entries = Object.entries(videos).filter(
    (entry): entry is [string, HTMLVideoElement] => entry[1] !== null,
  );
  const activeVideo = videos[activeId];
  let sufficientlyVisible = activeVideo
    ? (typeof IntersectionObserver === "undefined") ||
      isSufficientlyVisibleNow(activeVideo) ||
      (typeof activeVideo.getBoundingClientRect !== "function" && !!visibleStates.get(activeVideo))
    : false;
  let manualPause = pausedId === activeId;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const stateFor = (video: HTMLVideoElement) => {
    let state = recoveryStates.get(video);
    if (!state) {
      state = { time: video.currentTime, since: Date.now(), frameSince: Date.now(),
        attempts: 0, pending: null, issue: null, failure: null, eligible: false };
      recoveryStates.set(video, state);
    }
    return state;
  };
  const eligible = (id: string) => !disposed && !pageHidden &&
    document.visibilityState !== "hidden" && id === activeId && !blocked &&
    sufficientlyVisible && videos[id]?.isConnected !== false;
  const shouldPlay = (id: string) => eligible(id) && !manualPause;
  const stopTimers = () => {
    clearTimeout(watchdog);
    clearTimeout(retryTimer);
    watchdog = retryTimer = undefined;
  };
  const report = (video: HTMLVideoElement, issue: ReelPlaybackIssue | null) => {
    if (stateFor(video).issue === issue) return;
    stateFor(video).issue = issue;
    if (video === activeVideo && !disposed) onIssue?.(activeId, issue);
  };
  const requestPlay = (video: HTMLVideoElement) => {
    const state = stateFor(video);
    if (!shouldPlay(activeId) || video !== activeVideo || video.ended || state.pending || state.issue) return;
    if (video.error) { report(video, classifyFailure(video)); return; }
    const token = {};
    state.pending = token;
    const settled = (failure: ReelPlaybackIssue | null) => {
      if (state.pending !== token) return;
      state.pending = null;
      // Dispatch to the CURRENT attachment, never the activation that called play().
      controllers.get(video)?.settle(failure);
      if (!controllers.has(video) && video.isConnected === false) video.pause();
    };
    try {
      void Promise.resolve(video.play()).then(
        () => settled(null), (error: unknown) => settled(classifyFailure(video, error)),
      );
    } catch (error) { settled(classifyFailure(video, error)); }
  };
  const recover = () => {
    if (!activeVideo || !shouldPlay(activeId)) return;
    const state = stateFor(activeVideo);
    if (state.issue || state.pending) return;
    if (state.attempts >= 2) { report(activeVideo, state.failure || "loading"); return; }
    state.attempts += 1;
    state.since = state.frameSince = Date.now();
    // pause() interrupts playback without discarding a healthy source/buffer.
    // The scheduled pause handler shares this same recovery budget.
    if (!activeVideo.paused) activeVideo.pause();
    requestPlay(activeVideo);
  };
  const scheduleRecovery = () => {
    if (retryTimer !== undefined || !activeVideo || !shouldPlay(activeId)) return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (activeVideo.paused) recover();
    }, 300);
  };
  const armWatchdog = () => {
    if (watchdog !== undefined || !activeVideo || !shouldPlay(activeId) || activeVideo.ended || stateFor(activeVideo).issue) return;
    watchdog = setTimeout(() => {
      watchdog = undefined;
      if (!shouldPlay(activeId) || activeVideo.ended) return;
      const state = stateFor(activeVideo);
      if (activeVideo.error) { report(activeVideo, classifyFailure(activeVideo)); return; }
      const moved = Math.abs(activeVideo.currentTime - state.time) > 0.01;
      const tracksFrames = typeof activeVideo.requestVideoFrameCallback === "function";
      if (moved) {
        state.time = activeVideo.currentTime;
        state.since = Date.now();
        if (!tracksFrames) state.attempts = 0;
      }
      const noFrames = tracksFrames && Date.now() - state.frameSince >= 12000;
      if (!activeVideo.seeking && activeVideo.playbackRate > 0) {
        if (state.pending && Date.now() - state.since >= 12000) {
          // Do not issue overlapping play calls. A user retry can explicitly
          // abort the stuck resource selection with load().
          report(activeVideo, "loading");
        } else if (noFrames) {
          report(activeVideo, "frames");
        } else if (!moved && Date.now() - state.since >= 8000) {
          recover(); // Includes low-readiness stalls; never reload automatically.
        }
      }
      armWatchdog();
    }, 2000);
  };
  const syncAll = () => {
    entries.forEach(([id, video]) => {
      const state = stateFor(video);
      const play = shouldPlay(id);
      if (play && !state.eligible) {
        state.time = video.currentTime;
        state.since = state.frameSince = Date.now();
      }
      state.eligible = play;
      if (!play) { if (!video.paused) video.pause(); }
      else if (video.paused) {
        if (state.failure) scheduleRecovery(); else requestPlay(video);
      }
    });
    if (shouldPlay(activeId)) armWatchdog(); else stopTimers();
  };
  const cleanups = entries.map(([id, video]) => {
    const state = stateFor(video);
    video.muted = muted;
    const controller = {
      settle: (failure: ReelPlaybackIssue | null) => {
        if (!shouldPlay(id)) { if (!video.paused) video.pause(); return; }
        if (failure) {
          state.failure = failure;
          if (failure === "policy" || failure === "unsupported" || video.error) report(video, failure);
          else scheduleRecovery();
        } else if (video.paused) scheduleRecovery();
        armWatchdog();
      },
      intent: (paused: boolean, retry: boolean) => {
        if (!eligible(id)) return;
        manualPause = paused;
        if (paused) { syncAll(); return; }
        if (state.issue === "unsupported") return;
        // Only explicit recovery may reload, once per gesture. Normal resume
        // and automatic retries preserve the source and playback position.
        const reload = retry && (state.pending !== null || video.error !== null ||
          state.issue === "loading" || state.issue === "frames");
        if (state.pending && !reload) return;
        stopTimers();
        if (reload) {
          state.pending = null; // invalidate settlement from the aborted load
          video.load();
        }
        state.attempts = 0;
        state.failure = null;
        state.since = state.frameSince = Date.now();
        report(video, null);
        requestPlay(video);
        armWatchdog();
      },
    };
    controllers.set(video, controller);
    const ready = () => syncAll();
    const playing = () => { if (!shouldPlay(id)) video.pause(); };
    const paused = () => { if (shouldPlay(id)) scheduleRecovery(); };
    const progress = () => {
      if (!shouldPlay(id)) return;
      if (Math.abs(video.currentTime - state.time) > 0.01) {
        state.time = video.currentTime;
        state.since = Date.now();
        if (typeof video.requestVideoFrameCallback !== "function") {
          state.attempts = 0;
          state.failure = null;
          report(video, null);
        }
        armWatchdog();
      }
    };
    const buffering = () => { if (shouldPlay(id)) armWatchdog(); };
    const error = () => {
      state.failure = classifyFailure(video);
      if (id === activeId) report(video, state.failure);
    };
    const ended = () => { if (id === activeId) stopTimers(); };
    const listeners = { canplay: ready, playing, pause: paused, timeupdate: progress,
      waiting: buffering, stalled: buffering, error, ended };
    Object.entries(listeners).forEach(([event, listener]) => video.addEventListener(event, listener));
    let frame: number | undefined;
    const presented = () => {
      if (disposed) return;
      if (shouldPlay(id)) {
        state.frameSince = Date.now();
        state.attempts = 0;
        state.failure = null;
        report(video, null);
        armWatchdog();
      }
      frame = video.requestVideoFrameCallback(presented);
    };
    if (id === activeId && typeof video.requestVideoFrameCallback === "function") {
      frame = video.requestVideoFrameCallback(presented);
    }
    return () => {
      if (controllers.get(video) === controller) controllers.delete(video);
      Object.entries(listeners).forEach(([event, listener]) => video.removeEventListener(event, listener));
      if (frame !== undefined) video.cancelVideoFrameCallback(frame);
    };
  });
  const observer = activeVideo && typeof IntersectionObserver !== "undefined"
    ? new IntersectionObserver(([entry]) => {
      if (disposed || !entry) return;
      sufficientlyVisible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
      visibleStates.set(activeVideo, sufficientlyVisible);
      syncAll();
    }, { threshold: [0, 0.5] }) : null;
  const hide = () => { pageHidden = true; syncAll(); };
  const show = () => { pageHidden = false; syncAll(); };
  const visibilityChanged = () => { pageHidden = document.visibilityState === "hidden"; syncAll(); };
  if (activeVideo) observer?.observe(activeVideo);
  document.addEventListener("visibilitychange", visibilityChanged);
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", show);
  window.addEventListener("online", syncAll);
  window.addEventListener("focus", syncAll);
  if (activeVideo) onIssue?.(activeId, stateFor(activeVideo).issue);
  syncAll();
  return () => {
    disposed = true;
    stopTimers();
    observer?.disconnect();
    cleanups.forEach((cleanup) => cleanup());
    document.removeEventListener("visibilitychange", visibilityChanged);
    window.removeEventListener("pagehide", hide);
    window.removeEventListener("pageshow", show);
    window.removeEventListener("online", syncAll);
    window.removeEventListener("focus", syncAll);
    // No pause here: count-only updates must preserve healthy playback.
  };
}

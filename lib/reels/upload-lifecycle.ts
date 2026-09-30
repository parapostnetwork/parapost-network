// Browser-only processing and per-attempt cancellation for the Reel uploader.
const isOverReelDurationLimit = (duration: number) => duration > 60.35;

export function createUploadAttempt() {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    cancel: () => controller.abort(),
    async wait<T>(work: PromiseLike<T>, timeoutMs = 300000): Promise<T> {
      return await new Promise<T>((resolve, reject) => {
        let settled = false;
        const finish = (error: unknown, value?: T) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          controller.signal.removeEventListener("abort", abort);
          if (error) reject(error); else resolve(value as T);
        };
        const abort = () => finish(new Error("Reel upload was cancelled."));
        const timer = setTimeout(() => {
          finish(new Error("This operation took too long. Please try again."));
          controller.abort();
        }, timeoutMs);
        controller.signal.addEventListener("abort", abort, { once: true });
        // Always consume late rejections, even when already cancelled.
        Promise.resolve(work).then(value => finish(null, value), error => finish(error));
        if (controller.signal.aborted) abort();
      });
    },
  };
}

function getReadableVideoDuration(video: HTMLVideoElement) {
  const duration = video.duration;
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

export async function getVideoDuration(file: File, signal: AbortSignal) {
  return await new Promise<number>((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    let settled = false;
    let bestDuration = 0;
    let acceptShortDurationTimer: number | null = null;
    let timeoutTimer: number | null = null;

    const abort = () => fail();
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      video.onloadedmetadata = video.ondurationchange = video.oncanplay = video.onseeked = video.onerror = null;
      if (acceptShortDurationTimer) window.clearTimeout(acceptShortDurationTimer);
      if (timeoutTimer) window.clearTimeout(timeoutTimer);
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };

    const finish = (duration: number) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(duration);
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Could not read the selected video."));
    };

    const checkDuration = () => {
      if (settled) return;
      const duration = getReadableVideoDuration(video);
      if (duration > bestDuration) bestDuration = duration;

      if (isOverReelDurationLimit(bestDuration)) {
        finish(bestDuration);
        return;
      }

      // Some mobile browsers update video duration shortly after metadata loads.
      // Wait a moment before accepting a short duration so longer videos are not
      // accidentally treated like 7-10 second clips.
      if (bestDuration > 0 && !acceptShortDurationTimer) {
        acceptShortDurationTimer = window.setTimeout(() => finish(bestDuration), 1500);
      }
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      if (settled) return;
      checkDuration();
      if (settled) return;

      // Force the browser to resolve the real end time when possible.
      // This helps prevent some mobile uploads from being misread as a short
      // 7-10 second clip when the selected video is actually longer.
      try {
        video.currentTime = Number.MAX_SAFE_INTEGER;
      } catch {
        // Some browsers do not allow seeking before enough metadata is ready.
      }
    };

    video.ondurationchange = checkDuration;
    video.oncanplay = checkDuration;
    video.onseeked = checkDuration;
    video.onerror = fail;

    timeoutTimer = window.setTimeout(() => {
      if (bestDuration > 0) {
        finish(bestDuration);
        return;
      }

      fail();
    }, 8000);

    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { fail(); return; }
    video.src = objectUrl;
    video.load();
  });
}

export async function generatePosterFromFile(file: File, signal: AbortSignal, seekTo = 0.6) {
  return await new Promise<Blob>((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    let settled = false;
    let capturing = false;
    const abort = () => finish(null, "Reel preparation was cancelled.");
    const timer = setTimeout(() => finish(null, "Preparing the Reel cover took too long. Please try again."), 30000);
    const finish = (blob: Blob | null, message = "Could not generate reel cover image.") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      video.onloadedmetadata = video.onloadeddata = video.onseeked = video.onerror = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
      if (blob) resolve(blob); else reject(new Error(message));
    };
    const capture = () => {
      if (settled || capturing || video.seeking || video.readyState < 2) return;
      capturing = true;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 720;
        canvas.height = video.videoHeight || 1280;
        const context = canvas.getContext("2d");
        if (!context) { finish(null); return; }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => finish(blob), "image/jpeg", 0.9);
      } catch { finish(null); }
    };
    video.playsInline = true;
    video.muted = true;
    video.preload = "auto";
    video.onloadedmetadata = () => {
      if (settled) return;
      try {
        const target = Number.isFinite(video.duration) && video.duration > seekTo
          ? seekTo : Math.max(0, video.duration * 0.2 || 0);
        video.currentTime = target;
        if (target === 0) capture();
      } catch { finish(null); }
    };
    video.onloadeddata = () => { if (video.currentTime === 0) capture(); };
    video.onseeked = capture;
    video.onerror = () => finish(null);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    video.src = objectUrl;
    video.load();
  });
}

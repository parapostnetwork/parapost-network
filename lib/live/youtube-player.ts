// This uses the public iframe player API, not the keyed YouTube Data API.
export function livePlayerUrl(value: string, origin?: string) {
  try {
    const url = new URL(value);

    if (
      ["www.youtube.com", "www.youtube-nocookie.com", "youtube.com"].includes(url.hostname) &&
      url.pathname.startsWith("/embed/")
    ) {
      url.searchParams.set("enablejsapi", "1");
      if (origin) url.searchParams.set("origin", origin);
      return url.toString();
    }

    if (url.hostname === "player.twitch.tv") {
      if (origin) {
        try {
          const parentHost = new URL(origin).hostname;
          if (parentHost) url.searchParams.set("parent", parentHost);
        } catch {
          // Leave the Twitch URL otherwise unchanged if origin is malformed.
        }
      }
      return url.toString();
    }

    return value;
  } catch {
    return value;
  }
}

type Player = { getPlayerState(): number; addEventListener(name: string, listener: (event: { data: number }) => void): void; removeEventListener(name: string, listener: (event: { data: number }) => void): void };
type YouTube = { Player: new (frame: HTMLIFrameElement, options: { events: { onReady: () => void; onStateChange: (event: { data: number }) => void } }) => Player };
type PlayerWindow = Window & { YT?: YouTube; onYouTubeIframeAPIReady?: () => void };
let loading: Promise<YouTube> | undefined;
const players = new WeakMap<HTMLIFrameElement, { player?: Player; listeners: Set<() => void> }>();

function loadYouTube(): Promise<YouTube> {
  const host = window as PlayerWindow;
  if (host.YT?.Player) return Promise.resolve(host.YT);
  if (loading) return loading;
  loading = new Promise<YouTube>((resolve, reject) => {
    const previous = host.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => { loading = undefined; reject(new Error("Player API timeout")); }, 15000);
    host.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      previous?.();
      if (host.YT?.Player) resolve(host.YT);
      else { loading = undefined; reject(new Error("Player API unavailable")); }
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => { window.clearTimeout(timeout); loading = undefined; script.remove(); reject(new Error("Player API unavailable")); };
    document.head.appendChild(script);
  });
  return loading;
}

// Observe the existing iframe without replacing/remounting it on status refresh.
// The WeakMap avoids duplicate SDK players under React Strict Mode.
export function observeYouTubePlayback(frame: HTMLIFrameElement, onPlaying: () => void): () => void {
  let active = true;
  let entry = players.get(frame);
  if (!entry) { entry = { listeners: new Set() }; players.set(frame, entry); }
  const current = entry;
  current.listeners.add(onPlaying);
  const notify = () => current.listeners.forEach(listener => listener());
  void loadYouTube().then(YT => {
    if (!active || !frame.isConnected) return;
    if (!current.player) {
      current.player = new YT.Player(frame, { events: {
        onReady: () => { if (current.player?.getPlayerState() === 1) notify(); },
        onStateChange: event => { if (event.data === 1) notify(); },
      } });
    } else if (current.player.getPlayerState() === 1) onPlaying();
  }).catch(() => { /* Playback remains usable even if tracking is blocked. */ });
  // Retry a failed count while actual playback continues, without inventing a view.
  const retry = window.setInterval(() => {
    if (document.visibilityState === "visible" && current.player?.getPlayerState() === 1) onPlaying();
  }, 10000);
  return () => { active = false; current.listeners.delete(onPlaying); window.clearInterval(retry); };
}

'use client';

import { useEffect, useState } from 'react';
import styles from './CreatorVerseReplayPlayer.module.css';

type ReplaySource = {
  provider: 'youtube' | 'twitch';
  videoId: string;
  watchUrl: string;
};

type Props = {
  title: string;
  externalUrl: string | null;
  embedUrl: string | null;
  thumbnailUrl: string | null;
  active: boolean;
  onToggle: () => void;
  inline?: boolean;
};

function identifyReplay(
  externalUrl: string | null,
  embedUrl: string | null
): ReplaySource | null {
  for (const raw of [externalUrl, embedUrl]) {
    if (!raw) continue;

    try {
      const url = new URL(raw.trim());

      if (url.protocol !== 'https:') continue;

      const host = url.hostname
        .toLowerCase()
        .replace(/^www\./, '');

      const parts = url.pathname
        .split('/')
        .filter(Boolean);

      const youtubeHost =
        host === 'youtube.com' ||
        host === 'm.youtube.com' ||
        host === 'music.youtube.com' ||
        host === 'youtube-nocookie.com' ||
        host === 'youtu.be';

      if (youtubeHost) {
        let videoId: string | null = null;

        if (host === 'youtu.be') {
          videoId = parts[0] || null;
        } else if (parts[0] === 'watch') {
          videoId = url.searchParams.get('v');
        } else if (
          ['embed', 'live', 'shorts', 'v'].includes(parts[0])
        ) {
          videoId = parts[1] || null;
        }

        if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
          return {
            provider: 'youtube',
            videoId,
            watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
          };
        }
      }

      const twitchHost =
        host === 'twitch.tv' ||
        host === 'm.twitch.tv' ||
        host === 'player.twitch.tv';

      if (twitchHost) {
        let id: string | null = null;

        if (host === 'player.twitch.tv') {
          id = url.searchParams.get('video');
        } else if (parts[0] === 'videos') {
          id = parts[1] || null;
        }

        if (id?.startsWith('v')) {
          id = id.slice(1);
        }

        if (id && /^[0-9]+$/.test(id)) {
          return {
            provider: 'twitch',
            videoId: id,
            watchUrl: `https://www.twitch.tv/videos/${id}`,
          };
        }
      }
    } catch {
      // Invalid provider URL: try the next known source.
    }
  }

  return null;
}

function safeThumbnail(raw: string | null) {
  if (!raw) return null;

  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export default function CreatorVerseReplayPlayer({
  title,
  externalUrl,
  embedUrl,
  thumbnailUrl,
  active,
  onToggle,
  inline = false,
}: Props) {
  const [parentHost, setParentHost] = useState('');

  useEffect(() => {
    setParentHost(window.location.hostname);
  }, []);

  const replay = identifyReplay(externalUrl, embedUrl);

  if (!replay) {
    return (
      <p className={styles.unavailable}>
        Replay playback is not available yet for this broadcast.
      </p>
    );
  }

  const src =
    replay.provider === 'youtube'
      ? `https://www.youtube.com/embed/${replay.videoId}?rel=0&playsinline=1`
      : parentHost
        ? `https://player.twitch.tv/?video=v${replay.videoId}&parent=${encodeURIComponent(parentHost)}&autoplay=false`
        : null;

  const poster =
    safeThumbnail(thumbnailUrl) ||
    (replay.provider === 'youtube'
      ? `https://i.ytimg.com/vi/${replay.videoId}/hqdefault.jpg`
      : null);

  return (
    <div className={styles.replay}>
      {!(active || inline) ? (
        <div className={styles.poster}>
          {poster && (
            <img
              className={styles.posterImage}
              src={poster}
              alt=""
              loading="lazy"
            />
          )}

          <button
            type="button"
            onClick={onToggle}
            className={styles.playButton}
            aria-label={`Watch replay: ${title}`}
          >
            <span className={styles.playSymbol} aria-hidden="true">
              ▶
            </span>
            Watch Replay
          </button>
        </div>
      ) : (
        <>
          <div
            className={`${styles.frame} ${
              replay.provider === 'twitch'
                ? styles.twitchFrame
                : ''
            }`}
          >
            {src ? (
              <iframe
                src={src}
                title={`Replay: ${title}`}
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              <p className={styles.unavailable}>
                Loading replay player...
              </p>
            )}
          </div>

          {replay.provider === 'twitch' && (
            <p className={styles.twitchSmall}>
              Twitch requires a larger video player on small screens.
              <a
                href={replay.watchUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Watch this replay on Twitch
              </a>
            </p>
          )}

          {!inline && (
            <button
              type="button"
              onClick={onToggle}
              className={styles.closeButton}
            >
              Close Replay
            </button>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SharedCreatorVersePost } from "@/lib/creatorverse/useSharedCreatorVerseFeed";
import CreatorVersePostActions from "./CreatorVersePostActions";
import CreatorVerseSharedPostMenu from "./CreatorVerseSharedPostMenu";
import sharedStyles from "./SharedCreatorVersePostCard.module.css";
import CreatorVersePublishedMedia from "./CreatorVersePublishedMedia";
import type {
  CreatorVersePublishedMedia as PublishedMedia
} from "@/lib/creatorverse/types";

const mediaEnabled =
  process.env.NEXT_PUBLIC_CREATORVERSE_POST_MEDIA_READ_ENABLED === "true" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ===
    "https://vmgelrgrtpghmvqgufzz.supabase.co";
import {
  postCardStyle,
  postContentStyle,
  sharedPostFrameStyle
} from "@/components/postPresentation";

export default function SharedCreatorVersePostCard({
  share,
  sharerName = "Member",
}: {
  share: SharedCreatorVersePost;
  sharerName?: string;
}) {
  const pageHref = `/creatorverse/${share.page_id}`;
  const settingKey = `${share.page_id}:${share.post_id}`;

  const mediaHost = useRef<HTMLDivElement>(null);
  const [mediaVisible, setMediaVisible] = useState(false);
  const [mediaState, setMediaState] = useState<{
    scope: string;
    items: PublishedMedia[];
  } | null>(null);

  useEffect(() => {
    if (!mediaEnabled) return;

    const element = mediaHost.current;
    if (!element) return;

    if (typeof IntersectionObserver === "undefined") {
      setMediaVisible(true);
      return;
    }

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setMediaVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "300px" });

    observer.observe(element);
    return () => observer.disconnect();
  }, [settingKey]);

  useEffect(() => {
    if (!mediaEnabled || !mediaVisible) return;

    let active = true;

    async function loadMedia() {
      try {
        const url =
          `/api/creatorverse/pages/${encodeURIComponent(share.page_id)}` +
          `/posts/${encodeURIComponent(share.post_id)}/media`;

        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return;

        const payload: unknown = await response.json();

        if (
          !payload ||
          typeof payload !== "object" ||
          Array.isArray(payload) ||
          !("media" in payload)
        ) return;

        const raw = (payload as { media: unknown }).media;
        if (!Array.isArray(raw)) return;

        const items = raw.filter(
          (item: unknown): item is PublishedMedia => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return false;
            }

            const row = item as Record<string, unknown>;

            return typeof row.id === "string" &&
              (row.media_type === "image" || row.media_type === "video") &&
              typeof row.display_order === "number" &&
              Number.isInteger(row.display_order);
          }
        ).slice(0, 4);

        if (active) setMediaState({ scope: settingKey, items });
      } catch {
        // An unavailable media item must not break the shared post.
      }
    }

    void loadMedia();
    return () => { active = false; };
  }, [mediaVisible, settingKey, share.page_id, share.post_id]);

  const visibleMedia =
    mediaState?.scope === settingKey ? mediaState.items : [];

  return (
    <article
      className={sharedStyles.card}
      style={postCardStyle}
      aria-label="Shared CreatorVerse post"
    >
      <header style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        marginBottom: 12
      }}>
        <div>
          <Link href={`/profile/${share.sharer_id}`}>
            {sharerName}
          </Link>
          {" shared a CreatorVerse post"}
        </div>
        <time
          dateTime={share.shared_at}
          style={{ fontSize: 12, opacity: 0.75 }}
        >
          {new Date(share.shared_at).toLocaleString()}
        </time>

        <CreatorVerseSharedPostMenu
          shareId={share.share_id}
          sharerId={share.sharer_id}
        />
      </header>

      {share.caption && (
        <p style={postContentStyle}>{share.caption}</p>
      )}

      <div ref={mediaHost} style={sharedPostFrameStyle}>
        <strong>
          <Link href={pageHref}>{share.page_name}</Link>
        </strong>

        {share.original_content && (
          <p style={postContentStyle}>
            {share.original_content}
          </p>
        )}

        {visibleMedia.length > 0 && (
            <div style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
              gap: 10,
              marginTop: 12
            }}>
              {visibleMedia.map(media => (
                <CreatorVersePublishedMedia
                  key={media.id}
                  pageId={share.page_id}
                  postId={share.post_id}
                  media={media}
                />
              ))}
            </div>
          )}

          <p style={{ marginTop: 10 }}>
          <Link href={pageHref}>
            View CreatorVerse Page
          </Link>
        </p>
      </div>

      <CreatorVersePostActions
        pageId={share.page_id}
        postId={share.post_id}
      />
    </article>
  );
}

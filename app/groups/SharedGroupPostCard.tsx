"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./sharedGroupPost.module.css";

export type SharedGroupPost = {
  share_id: string;
  group_id: string;
  post_id: string;
  sharer_id: string;
  caption: string | null;
  shared_at: string;
  group_name: string;
  original_author_id: string;
  original_content: string;
  original_created_at: string;
  media: Array<{
    media_type: string;
    storage_path: string;
    display_order: number;
  }> | null;
};

type Props = {
  share: SharedGroupPost;
  sharerName?: string;
  authorName?: string;
  getMediaUrl?: (storagePath: string) => string | null;
};

export default function SharedGroupPostCard({
  share,
  sharerName,
  authorName,
  getMediaUrl,
}: Props) {
  const media = Array.isArray(share.media) ? share.media : [];
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

  const [resolvedAuthorName, setResolvedAuthorName] = useState<string | null>(null);

  useEffect(() => {
    setResolvedAuthorName(null);

    if (
      !share.original_author_id ||
      (authorName && authorName !== "Original author")
    ) {
      return;
    }

    let active = true;

    void (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, username")
        .eq("id", share.original_author_id)
        .maybeSingle();

      if (!active || error || !data) return;

      const name = [data.full_name, data.username].find(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0
      );

      setResolvedAuthorName(name?.trim() || null);
    })();

    return () => {
      active = false;
    };
  }, [share.original_author_id, authorName]);


  useEffect(() => {
    let active = true;
    const createdUrls: string[] = [];

    setMediaUrls({});

    if (!getMediaUrl) {
      const prefix = `${share.group_id}/posts/${share.post_id}/`;
      const paths = [
        ...new Set(
          (Array.isArray(share.media) ? share.media : [])
            .filter(
              (item) =>
                (item.media_type === "image" ||
                  item.media_type === "video") &&
                typeof item.storage_path === "string" &&
                item.storage_path.startsWith(prefix)
            )
            .map((item) => item.storage_path)
        ),
      ];

      void Promise.all(
        paths.map(async (path) => {
          try {
            const { data, error } = await supabase.storage
              .from("group-media")
              .download(path);

            if (error || !data) return;

            const url = URL.createObjectURL(data);

            if (!active) {
              URL.revokeObjectURL(url);
              return;
            }

            createdUrls.push(url);
            setMediaUrls((previous) => ({
              ...previous,
              [path]: url,
            }));
          } catch {
            // Protected media remains unavailable if access is denied.
          }
        })
      );
    }

    return () => {
      active = false;
      for (const url of createdUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [share.media, share.group_id, share.post_id, getMediaUrl]);

  return (
    <article className={styles.card}>
      <div className={styles.heading}>
        <a href={`/profile/${share.sharer_id}`}>
          {sharerName || "Member"}
        </a>
        {" shared a post from "}
        <strong>{share.group_name}</strong>
      </div>

      {share.caption && (
        <p className={styles.caption}>{share.caption}</p>
      )}

      <div className={styles.original}>
        <div className={styles.author}>
          <a href={`/profile/${share.original_author_id}`}>
            {authorName && authorName !== "Original author" ? authorName : resolvedAuthorName || "Original author"}
          </a>
        </div>

        {share.original_content && (
          <p className={styles.content}>
            {share.original_content}
          </p>
        )}

        {media.length > 0 && (
          <div className={styles.mediaGrid}>
            {media.map((item, index) => {
              const url =
                getMediaUrl?.(item.storage_path) ||
                mediaUrls[item.storage_path] ||
                null;

              if (!url) {
                return (
                  <div
                    key={`${item.storage_path}-${index}`}
                    className={styles.mediaPlaceholder}
                  >
                    Media loading or unavailable
                  </div>
                );
              }

              return item.media_type === "video" ? (
                <video
                  key={`${item.storage_path}-${index}`}
                  src={url}
                  controls
                  preload="none"
                  className={styles.media}
                />
              ) : (
                <img
                  key={`${item.storage_path}-${index}`}
                  src={url}
                  alt="Shared Group post attachment"
                  loading="lazy"
                  className={styles.media}
                />
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}

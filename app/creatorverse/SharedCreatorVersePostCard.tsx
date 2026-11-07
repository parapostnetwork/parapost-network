"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { SharedCreatorVersePost } from "@/lib/creatorverse/useSharedCreatorVerseFeed";
import CreatorVersePostActions from "./CreatorVersePostActions";
import CreatorVerseSharedPostMenu from "./CreatorVerseSharedPostMenu";
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

  const [commentSetting, setCommentSetting] = useState<{
    key: string;
    enabled: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;

    const loadCommentSetting = async () => {
      try {
        const { data, error } = await supabase.rpc(
          "creatorverse_post_engagement",
          {
            p_page_id: share.page_id,
            p_post_id: share.post_id,
          }
        );

        if (!active) return;

        const enabled =
          !error &&
          data !== null &&
          typeof data === "object" &&
          !Array.isArray(data) &&
          "comments_enabled" in data &&
          data.comments_enabled === true;

        setCommentSetting({
          key: settingKey,
          enabled,
        });
      } catch {
        if (active) {
          setCommentSetting({
            key: settingKey,
            enabled: false,
          });
        }
      }
    };

    void loadCommentSetting();

    return () => {
      active = false;
    };
  }, [share.page_id, share.post_id, settingKey]);

  const commentsEnabled =
    commentSetting?.key === settingKey &&
    commentSetting.enabled;

  return (
    <article
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

      <div style={sharedPostFrameStyle}>
        <strong>
          <Link href={pageHref}>{share.page_name}</Link>
        </strong>

        {share.original_content && (
          <p style={postContentStyle}>
            {share.original_content}
          </p>
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
        commentsEnabled={commentsEnabled}
      />
    </article>
  );
}

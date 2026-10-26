"use client";

import { useEffect, useState } from "react";
import Link from 'next/link';
import { supabase } from "@/lib/supabase";
import { postCardStyle, postContentStyle, sharedPostFrameStyle } from '@/components/postPresentation';
import { PostAvatar, profileName, type PostProfile } from './PostIdentity';
import SharedGroupPromotionCard from './SharedGroupPromotionCard';
import type {GroupPromotion} from '@/lib/groups/sharing';
import GroupPostMedia from './GroupPostMedia';
import SharedGroupPostEngagement from './SharedGroupPostEngagement';
import styles from './groupPosting.module.css';

export type SharedGroupPost = {
  promotion?: GroupPromotion;
  share_id: string;
  group_id: string;
  post_id: string | null;
  sharer_id: string;
  caption: string | null;
  shared_at: string;
  group_name: string;
  original_author_id: string | null;
  original_content: string | null;
  original_created_at: string | null;
  media: Array<{
    media_type: string;
    storage_path: string;
    display_order: number;
  }> | null;
};

export default function SharedGroupPostCard(props:{share:SharedGroupPost;sharerName?:string;authorName?:string}) {
  if(props.share.promotion)return <SharedGroupPromotionCard share={props.share}/>;
  if(!props.share.post_id||!props.share.original_author_id||!props.share.original_created_at)return null;
  return <OriginalGroupPostCard {...props} share={{...props.share,post_id:props.share.post_id,original_author_id:props.share.original_author_id,original_created_at:props.share.original_created_at}}/>;
}
function OriginalGroupPostCard({ share, sharerName, authorName }: {
  share: SharedGroupPost & {post_id:string;original_author_id:string;original_created_at:string}; sharerName?: string; authorName?: string;
}) {
  const [profiles, setProfiles] = useState<Record<string, PostProfile>>({});
  useEffect(() => {
    let active = true;
    void supabase.from('profiles').select('id,full_name,username,avatar_url')
      .in('id', [...new Set([share.sharer_id, share.original_author_id])])
      .then(({ data, error }) => {
        if (active && !error) setProfiles(Object.fromEntries((data ?? []).map(profile => [profile.id, profile])));
      });
    return () => { active = false; };
  }, [share.sharer_id, share.original_author_id]);
  const sharer = profiles[share.sharer_id];
  const author = profiles[share.original_author_id];
  return <article data-posting className={`${styles.posting} ${styles.post}`} style={postCardStyle}>
    <div className={styles.sharedHeading}>
      <PostAvatar id={share.sharer_id} profile={sharer} size={48} />
      <div>
        <Link href={`/profile/${share.sharer_id}`}>{sharer ? profileName(sharer) : sharerName || 'Member'}</Link>
        <div className={styles.sharedContext}>shared a post from <Link href={`/groups/${share.group_id}`}>{share.group_name}</Link></div>
        <time dateTime={share.shared_at}>{new Date(share.shared_at).toLocaleString()}</time>
      </div>
    </div>
    {share.caption && <p style={postContentStyle}>{share.caption}</p>}
    <div className={styles.sharedOriginal} style={sharedPostFrameStyle}>
      <div className={styles.sharedHeading}>
        <PostAvatar id={share.original_author_id} profile={author} size={40} />
        <div><Link href={`/profile/${share.original_author_id}`}>
          {author ? profileName(author) : authorName || 'Original author'}
        </Link><time dateTime={share.original_created_at}>{new Date(share.original_created_at).toLocaleString()}</time></div>
      </div>
      {share.original_content && <p style={postContentStyle}>{share.original_content}</p>}
      <GroupPostMedia groupId={share.group_id} postId={share.post_id} media={share.media ?? []} />
      <p className={styles.sharedContext}><Link href={`/groups/${share.group_id}`}>View discussion in {share.group_name}</Link></p>
    </div>
    <SharedGroupPostEngagement
      shareId={share.share_id}
      groupId={share.group_id}
      postId={share.post_id}
    />
  </article>;
}

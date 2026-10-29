'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';
import {promotionHref} from '@/lib/groups/sharing';
import {postCardStyle,postContentStyle} from '@/components/postPresentation';
import {PostAvatar,profileName,type PostProfile} from './PostIdentity';
import type {SharedGroupPost} from './SharedGroupPostCard';
import GroupPromotionPreview from './GroupPromotionPreview';
import SharedGroupPostEngagement from './SharedGroupPostEngagement';
import SharedGroupDeleteMenu from './SharedGroupDeleteMenu';
import posting from './groupPosting.module.css';
import styles from './groupSharing.module.css';

export default function SharedGroupPromotionCard({share}:{share:SharedGroupPost}){
  const [deleted,setDeleted]=useState(false);
  // The feed RPC already returns the current authorized, privacy-filtered projection.
  // Parent feed revalidation handles auth, visibility, revocation and share changes.
  const preview=share.promotion;
  const [profile,setProfile]=useState<PostProfile>();
  useEffect(()=>{
    let active=true;void supabase.from('profiles').select('full_name,username,avatar_url').eq('id',share.sharer_id).maybeSingle().then(({data,error})=>{if(active&&!error&&data)setProfile(data);});return ()=>{active=false;};
  },[share.sharer_id]);
  if(deleted||!preview)return null;
  return <article data-posting className={`${posting.posting} ${posting.post} ${styles.card}`} style={postCardStyle}>
    <div className={posting.sharedHeading}><PostAvatar id={share.sharer_id} profile={profile} size={48}/><div>
      <Link href={`/profile/${share.sharer_id}`}>{profileName(profile)}</Link>
      <div className={posting.sharedContext}>{preview.kind==='invitation'?'shared a Group invitation':'shared a Group'}</div>
      <time dateTime={share.shared_at}>{new Date(share.shared_at).toLocaleString()}</time>
    </div><SharedGroupDeleteMenu ownerId={share.sharer_id} shareId={share.share_id} kind="promotion" onDeleted={() => setDeleted(true)} /></div>
    {share.caption&&<p style={postContentStyle}>{share.caption}</p>}
    <div style={{marginTop:14}}><GroupPromotionPreview preview={preview} shareId={share.share_id} linked/></div>
    <div className={styles.cardFooter}><Link className={styles.button} href={promotionHref(preview)}>{preview.visibility==='private'&&!preview.approved?'Request to Join':'View Group'}</Link>

    </div>
    <SharedGroupPostEngagement shareId={share.share_id} groupId={share.group_id} kind="promotion" canShare={preview.can_share && preview.approved}/>
  </article>;
}

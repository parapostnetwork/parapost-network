'use client';
import {useCallback} from 'react';
import Link from 'next/link';
import GroupCover from './GroupCover';
import {groupsFetch} from '@/lib/groups/client';
import type {GroupsTransport} from '@/lib/groups/transport';
import {promotionHref,type GroupPromotion} from '@/lib/groups/sharing';
import styles from './groupSharing.module.css';

export default function GroupPromotionPreview({preview,shareId,read=groupsFetch,linked=false}:{preview:GroupPromotion;shareId?:string;read?:GroupsTransport['read'];linked?:boolean}){
  const load=useCallback((_path:string,init?:RequestInit)=>{
    const params=new URLSearchParams({group:preview.group_id,key:preview.cover_key??''});
    if(shareId)params.set('share',shareId);
    return read(`/api/groups/sharing/cover?${params}`,init);
  },[preview.group_id,preview.cover_key,shareId,read]);
  // Never enter the public GroupCover cache: sharing permissions are checked per request.
  const cover=<GroupCover path={preview.cover_key?`${preview.group_id}/covers/${preview.cover_key}`:null} load={load} name={preview.name}/>;
  return <div className={styles.preview}>
    {linked?<Link className={styles.coverLink} href={promotionHref(preview)} aria-label={`Open ${preview.name}`}>{cover}</Link>:cover}
    <div className={styles.previewBody}><span className={styles.meta}>{preview.visibility==='private'?'Private Group':'Public Group'}</span>
      <h3>{preview.name}</h3>{preview.description&&<p>{preview.description}</p>}
      {preview.member_count!==null&&<p className={styles.meta}>{preview.member_count} {preview.member_count===1?'member':'members'}</p>}
      {preview.visibility==='private'&&<p className={styles.meta}>An invitation to connect. Discussions and member information remain private.</p>}
    </div>
  </div>;
}

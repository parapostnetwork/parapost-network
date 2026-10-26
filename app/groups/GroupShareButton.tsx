'use client';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ShareIcon} from '@/components/PostActionIcons';
import {groupsFetch} from '@/lib/groups/client';
import type {GroupsTransport} from '@/lib/groups/transport';
import type {GroupPromotion} from '@/lib/groups/sharing';
import GroupPromotionPreview from './GroupPromotionPreview';
import styles from './groupSharing.module.css';

export default function GroupShareButton({groupId,postId,shareId,iconOnly=false,header=false,read=groupsFetch}:{groupId:string;postId?:string;shareId?:string;iconOnly?:boolean;header?:boolean;read?:GroupsTransport['read']}){
  const [open,setOpen]=useState(false);const [notice,setNotice]=useState('');
  return <><button type="button" className={`${styles.button} ${iconOnly?styles.iconButton:''} ${header?styles.headerButton:''}`}
    aria-label={postId?'Share private Group post invitation':'Share Group'} aria-haspopup="dialog" onClick={()=>{setNotice('');setOpen(true);}}>
    <ShareIcon/>{!iconOnly&&'Share Group'}
  </button>{notice&&<p className={styles.notice} role="status">{notice}</p>}
  {open&&createPortal(<ShareDialog groupId={groupId} postId={postId} shareId={shareId} read={read} onClose={()=>setOpen(false)} onShared={()=>{setNotice('Shared to Dashboard and your Profile.');setOpen(false);window.dispatchEvent(new Event('parapost-group-shared'));}}/>,document.body)}</>;
}
function ShareDialog({groupId,postId,shareId,read,onClose,onShared}:{groupId:string;postId?:string;shareId?:string;read:GroupsTransport['read'];onClose:()=>void;onShared:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);const lock=useRef(false);
  const [preview,setPreview]=useState<GroupPromotion|null>(null);const [loading,setLoading]=useState(true);const [caption,setCaption]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{
    const element=dialog.current;const trigger=document.activeElement as HTMLElement|null;
    element?.showModal();const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    return ()=>{element?.close();document.body.style.overflow=overflow;trigger?.focus();};
  },[]);
  useEffect(()=>{
    const abort=new AbortController();const params=new URLSearchParams({group:groupId});if(shareId)params.set('share',shareId);
    void read(`/api/groups/sharing?${params}`,{signal:abort.signal}).then(response=>response.json()).then((data:GroupPromotion|null)=>{
      if(!abort.signal.aborted){
        setPreview(data);
        if(!data?.can_share &&
          !(data as (GroupPromotion & {preview_only?:boolean}) | null)?.preview_only)
          setError('Sharing is unavailable for this Group. Its permissions may have changed.');
      }
    }).catch(()=>{if(!abort.signal.aborted)setError('Group sharing is unavailable. Please check your access or try again later.');}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return ()=>abort.abort();
  },[groupId,shareId,read]);
  const demoPreview=Boolean(
    (preview as (GroupPromotion & {preview_only?:boolean}) | null)?.preview_only
  );
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="share-group-title" onCancel={event=>{event.preventDefault();if(!busy)onClose();}} onClick={event=>{if(event.target===event.currentTarget&&!busy){const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)onClose();}}}>
    <header><h2 id="share-group-title">{postId?'Share Group invitation':'Share Group'}</h2><button className={styles.button} type="button" disabled={busy} onClick={onClose}>Close</button></header>
    {loading&&<p role="status">Loading sharing preview…</p>}
    {preview&&<GroupPromotionPreview preview={preview} shareId={shareId} read={read}/>}
    {demoPreview&&<p className={styles.meta}>
      Local design preview only. Sharing is not performed here.
    </p>}
    {postId&&<p className={styles.meta}>Only this invitation is shared. Private post text, photos, videos and comments are never included.</p>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {preview?.can_share&&<form className={styles.form} onSubmit={async event=>{
      event.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');
      try{
        const response=await read('/api/groups/sharing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'share',groupId,postId,shareId,caption})});
        const result=await response.json();if(typeof result?.id!=='string')throw new Error('Share unavailable');onShared();
      }catch{setError('Unable to share. Your membership or the owner’s sharing settings may have changed.');}
      finally{lock.current=false;setBusy(false);}
    }}><label>Optional message<textarea maxLength={1000} value={caption} onChange={event=>setCaption(event.target.value)} disabled={busy} rows={3} placeholder="Say something about this Group…"/></label>
      <p className={styles.meta}>Share once to appear on Dashboard and your Profile. Repeated shares of the same item do not create duplicate entries.</p>
      <button className={styles.button} type="submit" disabled={busy}>{busy?'Sharing…':'Share'}</button>
    </form>}
  </dialog>;
}

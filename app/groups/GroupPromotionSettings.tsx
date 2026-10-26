'use client';
import {useEffect,useState} from 'react';
import {groupsFetch} from '@/lib/groups/client';
import type {GroupsTransport} from '@/lib/groups/transport';
import type {PromotionSettings} from '@/lib/groups/sharing';
import styles from './groupSharing.module.css';
export default function GroupPromotionSettings({groupId,read=groupsFetch}:{groupId:string;read?:GroupsTransport['read']}){
  const [settings,setSettings]=useState<PromotionSettings|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  useEffect(()=>{const abort=new AbortController();void read(`/api/groups/sharing?kind=settings&group=${groupId}`,{signal:abort.signal}).then(response=>response.json()).then((value:PromotionSettings)=>{if(!abort.signal.aborted)setSettings(value);}).catch(()=>{if(!abort.signal.aborted)setError('Sharing controls are unavailable. No settings have been changed.');});return ()=>abort.abort();},[groupId,read]);
  return <section className={styles.controls} aria-label="Private Group sharing"><h2>Private Group sharing</h2>
    <p className={styles.meta}>Only the owner can enable promotional sharing. These choices also control the information nonmembers see in the directory. Discussions and member identities stay private.</p>
    {!settings&&!error&&<p role="status">Loading sharing settings…</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}
    {settings&&<form onSubmit={async event=>{event.preventDefault();if(busy)return;setBusy(true);setError('');setNotice('');try{const response=await read('/api/groups/sharing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'settings',groupId,settings})});setSettings(await response.json());setNotice('Sharing settings saved. Existing shared cards follow these permissions when revalidated.');window.dispatchEvent(new Event('parapost-group-shared'));}catch{setError('Unable to save sharing settings.');}finally{setBusy(false);}}}>
      <fieldset disabled={busy}>{([['enabled','Allow promotional sharing'],['show_name','Show Group name'],['show_cover','Show Group cover'],['show_description','Show Group description']] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={settings[key]} onChange={event=>setSettings({...settings,[key]:event.target.checked})}/>{label}</label>)}</fieldset>
      <button className={styles.button} disabled={busy} type="submit">{busy?'Saving…':'Save sharing settings'}</button>
    </form>}{notice&&<p role="status" className={styles.notice}>{notice}</p>}
  </section>;
}

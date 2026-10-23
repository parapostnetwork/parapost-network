'use client';
import { DotsIcon } from "@/components/PostActionIcons";
import ResponsiveMediaImage from '@/components/ResponsiveMediaImage';
import { supabase } from '@/lib/supabase';
/* eslint-disable @next/next/no-img-element -- private media uses authenticated blob URLs */
import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { liveGroupsTransport, type GroupsTransport } from '@/lib/groups/transport';
import { validateGroupFields, validateUpload } from '@/lib/groups/validation';
import type { Group, GroupMember, GroupPost } from '@/lib/groups/types';
import styles from './groups.module.css';
import GroupCover from './GroupCover';
import GroupPostActions from './GroupPostActions';

const TransportContext=createContext<GroupsTransport>(liveGroupsTransport);

function PrivateMedia({path,video=false,alt='Group image'}:{path:string;video?:boolean;alt?:string}) {
  const {read:groupsFetch}=useContext(TransportContext);
  const [src,setSrc] = useState('');
  const [failed,setFailed] = useState(false);
  const dialogRef=useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const controller = new AbortController(); let url = '';
    groupsFetch(`/api/groups/media?path=${encodeURIComponent(path)}`,{signal:controller.signal})
      .then(r => r.blob()).then(blob => { if (!controller.signal.aborted) { url=URL.createObjectURL(blob); setSrc(url); } })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if(url) URL.revokeObjectURL(url); };
  },[path,groupsFetch]);
  if (failed) return <p>Media unavailable. Refresh to check access.</p>;
  if (!src) return <p role="status">Loading media…</p>;
  return video
    ? <video className={styles.postMediaVideo} src={src}
        controls preload="metadata" playsInline />
    : <>
        <button type="button" className={styles.postMediaOpen}
          aria-label="View full-size Group image"
          onClick={()=>dialogRef.current?.showModal()}>
          <img className={styles.postMediaThumb} src={src} alt={alt}/>
        </button>
        <dialog ref={dialogRef} className={styles.postMediaDialog}>
          <button type="button"
            onClick={()=>dialogRef.current?.close()}>Close</button>
          <img src={src} alt={alt}/>
        </dialog>
      </>;
}
function SelectedMedia({file}:{file:File}) {
  const [src,setSrc]=useState('');
  useEffect(()=>{
    const url=URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize a browser-owned object URL, revoked on cleanup
    setSrc(url);
    return ()=>URL.revokeObjectURL(url);
  },[file]);
  return <figure><figcaption>{file.name} · {(file.size/1024/1024).toFixed(1)} MB · not uploaded yet</figcaption>{src&&(file.type.startsWith('video/')?<video className={styles.media} src={src} controls playsInline preload="metadata"/>:<img className={styles.media} src={src} alt="Selected upload preview"/>)}</figure>;
}
function GroupForm({group,onSubmit,busy}:{group?:Group;onSubmit:(name:string,description:string,visibility:string,file?:File)=>Promise<void>;busy:boolean}) {
  const {read}=useContext(TransportContext);
  const [name,setName]=useState(group?.name ?? '');
  const [description,setDescription]=useState(group?.description ?? '');
  const [visibility,setVisibility]=useState(group?.visibility ?? 'public');
  const [file,setFile]=useState<File>();
  const [error,setError]=useState('');
  return <form className={styles.form} onSubmit={async event => {event.preventDefault();setError('');try {validateGroupFields(name,description,visibility);if(file)validateUpload(file.type,file.size,true);await onSubmit(name,description,visibility,file);}catch(e){setError(e instanceof Error?e.message:'Unable to save.');}}}>
    <h2>{group?'Group settings':'Create a Group'}</h2><GroupCover path={group?.cover_storage_path} file={file} load={read} name={name||'New Group'}/>
    <label>Name<input required minLength={3} maxLength={100} value={name} onChange={e=>setName(e.target.value)} /></label>
    <label>Description<textarea maxLength={5000} value={description} onChange={e=>setDescription(e.target.value)} rows={4}/></label>
    <label>Visibility<select value={visibility} disabled={!!group && group.membership_role!=='owner'} onChange={e=>setVisibility(e.target.value as 'public'|'private')}><option value="public">Public — authenticated users can read; members can post</option><option value="private">Private — approval required to read or post</option></select></label>
    <label>Cover image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const selected=e.target.files?.[0];try{if(selected)validateUpload(selected.type,selected.size,true);setFile(selected);setError('');}catch(err){setFile(undefined);setError(err instanceof Error?err.message:'Invalid cover');}}}/></label>{file&&<p className={styles.muted}>{file.name} · selected cover preview</p>}
    <p className={styles.muted}>The name, description, cover, owner and member count appear in the directory, including for private Groups. Images: up to 8 MB. Changing a private Group to public makes its existing discussions visible to eligible authenticated users.</p>
    {error && <p role="alert">{error}</p>}<button disabled={busy} type="submit">{busy?'Saving…':group?'Save changes':'Create Group'}</button>
  </form>;
}
export default function GroupsClient({groupId,transport=liveGroupsTransport,routeBase='/groups'}:{groupId?:string;transport?:GroupsTransport;routeBase?:string}) {
  return <TransportContext.Provider value={transport}><GroupsView groupId={groupId} routeBase={routeBase}/></TransportContext.Provider>;
}
function GroupsView({groupId,routeBase}:{groupId?:string;routeBase:string}) {
  const transport=useContext(TransportContext);
  const {read:groupsFetch,action:groupAction,upload:groupUpload}=transport;
  const router=useRouter();
  const [userId,setUserId]=useState('');
  const [viewerProfile,setViewerProfile]=useState<{
    full_name:string|null;
    username:string|null;
    avatar_url:string|null;
  }|null>(null); const [authReady,setAuthReady]=useState(false);
  const [authorProfiles,setAuthorProfiles]=useState<Record<string,{
    full_name:string|null;
    username:string|null;
    avatar_url:string|null;
  }>>({});
  const [groups,setGroups]=useState<Group[]>([]); const [posts,setPosts]=useState<GroupPost[]>([]); const [members,setMembers]=useState<GroupMember[]>([]);
  const [search,setSearch]=useState('');const [filter,setFilter]=useState('all');const [offset,setOffset]=useState(0);const [feedOffset,setFeedOffset]=useState(0);const [memberOffset,setMemberOffset]=useState(0);
  const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [create,setCreate]=useState(false);const [settings,setSettings]=useState(false);const [management,setManagement]=useState(false);
  const [content,setContent]=useState('');const [files,setFiles]=useState<File[]>([]);const [inputKey,setInputKey]=useState(0);
  const [editPost,setEditPost]=useState<string>(); const [editContent,setEditContent]=useState('');
const [openPostMenuId,setOpenPostMenuId]=useState<string|null>(null);
  const [deleteName,setDeleteName]=useState('');const requestNumber=useRef(0);const mutationLock=useRef(false);
  const group=groupId?groups[0]:undefined;
  const approved=group?.membership_status==='approved';const owner=approved&&group?.membership_role==='owner';
  const admin=approved&&['owner','admin'].includes(group?.membership_role ?? '');
  const moderator=approved&&['owner','admin','moderator'].includes(group?.membership_role ?? '');
  const canRead=!!group && (approved || (group.visibility==='public' && !['rejected','removed','banned'].includes(group.membership_status ?? '')));
  useEffect(()=>{
    let active=true;
    setViewerProfile(null);
    if(userId){
      void supabase.from('profiles')
        .select('full_name,username,avatar_url')
        .eq('id',userId).maybeSingle()
        .then(({data,error})=>{
          if(active && !error)setViewerProfile(data);
        });
    }
    return ()=>{active=false;};
  },[userId]);

  useEffect(()=>{
    if(!openPostMenuId)return;
    const outside=(event:PointerEvent)=>{
      const menu=document.getElementById(`group-post-menu-${openPostMenuId}`);
      if(!menu?.contains(event.target as Node))setOpenPostMenuId(null);
    };
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape')setOpenPostMenuId(null);
    };
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',escape);
    return ()=>{
      document.removeEventListener('pointerdown',outside);
      document.removeEventListener('keydown',escape);
    };
  },[openPostMenuId]);
  useEffect(()=>{
    let active=true;let authEvent=false;let currentUser='';const sequence=requestNumber;
    const acceptUser=(id:string)=>{
      if(!active)return;
      if(id!==currentUser){
        currentUser=id;requestNumber.current++;
        setGroups([]);setPosts([]);setMembers([]);setContent('');setFiles([]);setInputKey(k=>k+1);
        setSettings(false);setManagement(false);setEditPost(undefined);setCreate(false);
      }
      setUserId(id);setAuthReady(true);
    };
    const unsubscribe=transport.subscribe(id=>{authEvent=true;acceptUser(id);});
    transport.getUser().then(id=>{if(!authEvent)acceptUser(id);if(active&&new URLSearchParams(window.location.search).get('cover')==='retry')setNotice('Your Group was created, but its cover upload failed. Open Group settings to retry.');}).catch(()=>{if(!authEvent)acceptUser('');});
    return ()=>{active=false;sequence.current++;unsubscribe();};
  },[transport]);
  useEffect(()=>{
    let active=true;
    const ids=[...new Set(posts.map(p=>p.author_id))].filter(Boolean);
    if(ids.length){
      void supabase.from('profiles')
        .select('id,full_name,username,avatar_url')
        .in('id',ids)
        .then(({data,error})=>{
          if(!active)return;
          if(error){
            console.warn('Group author profiles:',error.message);
            return;
          }
          setAuthorProfiles(Object.fromEntries(
            (data??[]).map(profile=>[profile.id,profile])
          ));
        });
    }
    return ()=>{active=false;};
  },[posts]);

  const refresh=useCallback(async()=>{
    const number=++requestNumber.current;setLoading(true);
    try {
      const params=new URLSearchParams({search,filter,offset:String(offset)});if(groupId)params.set('group',groupId);
      const list:Group[]=await (await groupsFetch(`/api/groups?${params}`)).json();
      if(number!==requestNumber.current)return;
      setGroups(list);setPosts([]);setMembers([]);
      if(groupId&&list[0]) {
        const current=list[0];
        const allowed=current.membership_status==='approved'||(current.visibility==='public'&&!['rejected','removed','banned'].includes(current.membership_status ?? ''));
        const feed:GroupPost[]=allowed?await(await groupsFetch(`/api/groups?kind=feed&group=${groupId}&offset=${feedOffset}`)).json():[];
        if(number!==requestNumber.current)return;setPosts(feed);
        if(management&&current.membership_status==='approved'&&['owner','admin'].includes(current.membership_role ?? '')) {
          const roster=await(await groupsFetch(`/api/groups?kind=members&group=${groupId}&offset=${memberOffset}`)).json();
          if(number===requestNumber.current)setMembers(roster);
        }
      }
    } catch(e) {if(number===requestNumber.current){setGroups([]);setPosts([]);setMembers([]);setError(e instanceof Error?e.message:'Unable to load Groups.');}}
    finally {if(number===requestNumber.current)setLoading(false);}
  },[groupId,search,filter,offset,feedOffset,memberOffset,management,groupsFetch]);
  useEffect(()=>{if(!authReady||!userId)return;const sequence=requestNumber;const timer=setTimeout(()=>{setError('');void refresh();},200);return()=>{clearTimeout(timer);sequence.current++;};},[refresh,userId,authReady]);
  // Clear restricted content before revalidating on tab focus. Already downloaded bytes cannot be revoked.
  useEffect(()=>{const focus=()=>{setPosts([]);setMembers([]);if(userId)void refresh();};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[refresh,userId]);
  async function perform(fn:()=>Promise<void>) {
    if(mutationLock.current)return;mutationLock.current=true;setBusy(true);setError('');setNotice('');
    try{await fn();await refresh();}catch(e){setError(e instanceof Error?e.message:'Action failed.');}finally{mutationLock.current=false;setBusy(false);}
  }
  function membership(g:Group) {
    const status=g.membership_status;
    if(status==='approved')return <><span>Joined · {g.membership_role}</span>{g.membership_role!=='owner'&&<button disabled={busy} onClick={()=>void perform(async()=>{await groupAction('leave',g.id);})}>Leave Group</button>}</>;
    if(status==='pending')return <><span>Request pending</span><button disabled={busy} onClick={()=>void perform(async()=>{await groupAction('leave',g.id);})}>Cancel request</button></>;
    if(status)return <span>Membership {status}. Contact the owner to request review.</span>;
    return <button disabled={busy} onClick={()=>void perform(async()=>{await groupAction('join',g.id);})}>{g.visibility==='private'?'Request to join':'Join Group'}</button>;
  }
  async function publish() {
    if(!groupId)return;
    if(!content.trim()&&!files.length)throw new Error('Add text or media.');
    if(files.length>4)throw new Error('Choose up to four files.');
    files.forEach(file=>validateUpload(file.type,file.size));
    const draft=await groupAction('draft',groupId,{content});
    try{for(const file of files)await groupUpload(groupId,file,draft.id);await groupAction('publish',groupId,{post_id:draft.id});}
    catch(e){try{await groupAction('delete_post',groupId,{post_id:draft.id});}catch{/* Durable cleanup runbook handles abandoned drafts. */}throw e;}
    setContent('');setFiles([]);setInputKey(k=>k+1);setFeedOffset(0);setNotice('Post published.');
  }
  if(!authReady)return <main className={styles.page}><p role="status">Checking your session…</p></main>;
  if(!userId)return <main className={styles.page}><h1>Groups</h1><p>Sign in to discover and participate in Groups.</p><Link href="/">Sign in</Link></main>;
  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.topbar}><Link href="/dashboard">PARAPOST NETWORK</Link><Link href={routeBase}>Groups</Link><Link href="/dashboard">← Dashboard</Link></header>
    {error&&<p className={styles.alert} role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {loading&&<p role="status">Loading Groups…</p>}
    {!groupId?<>
      <section className={styles.hero}><div><p className={styles.eyebrow}>COMMUNITY CONNECTIONS</p><h1>Discover Groups</h1><p>Find your paranormal community. Share experiences and explore together.</p></div><button onClick={()=>setCreate(v=>!v)} aria-expanded={create}>{create?'Close form':'+ Create Group'}</button></section>
      {create&&<GroupForm busy={busy} onSubmit={async(name,description,visibility,file)=>{
        if(mutationLock.current)return;mutationLock.current=true;setBusy(true);
        try{const created=await groupAction('create',undefined,{name,description,visibility});
          if(file){try{await groupUpload(created.id,file);}catch{setCreate(false);router.push(`${routeBase}/${created.id}?cover=retry`);return;}}
          router.push(`${routeBase}/${created.id}`);
        }finally{mutationLock.current=false;setBusy(false);}
      }}/>}
      <div className={styles.controls}><div className={styles.tabs}>{[['all','Discover'],['public','Public'],['private','Private'],['mine','My Groups']].map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>{setFilter(value);setOffset(0);}}>{label}</button>)}</div><label>Search Groups<input type="search" maxLength={100} value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/></label></div>
      <div className={styles.grid}>{groups.map(g=><article key={g.id} className={styles.card}><GroupCover path={g.cover_storage_path} name={g.name} load={groupsFetch}/><div className={styles.body}><p className={styles.eyebrow}>{g.visibility} Group</p><h2><Link href={`${routeBase}/${g.id}`}>{g.name}</Link></h2><p>{g.description}</p><p className={styles.muted}>{g.member_count} {g.member_count===1?'member':'members'} · Owner: {g.owner_name}</p><div className={styles.controls}>{membership(g)}</div></div></article>)}</div>
      {!loading&&!groups.length&&<p className={styles.empty}>No Groups found. Try another filter or create a community.</p>}
      <div className={styles.controls}><button disabled={offset===0||loading} onClick={()=>setOffset(Math.max(0,offset-24))}>Previous</button><button disabled={groups.length<24||loading} onClick={()=>setOffset(offset+24)}>Next</button></div>
    </>:group?<>
      <section className={styles.card}><GroupCover path={group.cover_storage_path} name={group.name} load={groupsFetch}/><div className={styles.body}><p className={styles.eyebrow}>{group.visibility} Group</p><h1>{group.name}</h1><p className={styles.text}>{group.description}</p><p>{group.member_count} {group.member_count===1?'member':'members'} · Owner: <Link href={`/profile/${group.owner_id}`}>{group.owner_name}</Link></p><div className={styles.controls}>{membership(group)}{admin&&<><button onClick={()=>setSettings(v=>!v)} aria-expanded={settings}>Group settings</button><button onClick={()=>setManagement(v=>!v)} aria-expanded={management}>Manage members</button></>}</div></div></section>
      {admin&&settings&&<>{group.cover_storage_path&&<button disabled={busy} onClick={()=>void perform(async()=>{await groupAction('remove_cover',group.id);setNotice('Custom cover removed. ParaGhost is restored.');})}>Remove cover and restore ParaGhost</button>}<GroupForm key={JSON.stringify([group.id,group.name,group.description,group.visibility,group.cover_storage_path])} group={group} busy={busy} onSubmit={async(name,description,visibility,file)=>{await perform(async()=>{await groupAction('edit',group.id,{name,description,visibility});if(file)await groupUpload(group.id,file);setNotice('Group saved.');});}}/>{owner&&<section className={styles.form}><h2>Delete Group</h2><p>This permanently removes the Group, memberships and posts. Ownership transfer is not supported.</p><label>Type “{group.name}” to confirm<input value={deleteName} onChange={e=>setDeleteName(e.target.value)}/></label><button disabled={busy||deleteName!==group.name} onClick={()=>void perform(async()=>{await groupAction('delete',group.id,{confirmation:deleteName});router.push(routeBase);})}>Delete Group permanently</button></section>}</>}
      {admin&&management&&<section className={styles.form}><h2>Member management</h2><p>Admins manage ordinary members. Only the owner assigns roles or restores rejected, removed or banned members to pending.</p>{members.map(m=><article className={styles.member} key={m.user_id}><div><Link href={`/profile/${m.user_id}`}>{m.display_name}</Link><p>{m.role} · {m.status}</p></div>{m.user_id!==userId&&m.role!=='owner'&&(owner||m.role==='member')&&<div className={styles.controls}>
        {m.status==='pending'&&['approve','reject'].map(action=><button key={action} disabled={busy} onClick={()=>void perform(async()=>{await groupAction(action,group.id,{user_id:m.user_id});})}>{action==='approve'?'Approve':'Reject'}</button>)}
        {m.status==='approved'&&<><button disabled={busy} onClick={()=>void perform(async()=>{await groupAction('remove',group.id,{user_id:m.user_id});})}>Remove</button>{owner&&<label>Role<select value={m.role} disabled={busy} onChange={e=>void perform(async()=>{await groupAction('role',group.id,{user_id:m.user_id,role:e.target.value});})}><option value="member">Member</option><option value="moderator">Moderator</option><option value="admin">Administrator</option></select></label>}</>}
        {m.status!=='banned'&&<button disabled={busy} onClick={()=>void perform(async()=>{await groupAction('ban',group.id,{user_id:m.user_id});})}>Ban</button>}
        {owner&&['rejected','removed','banned'].includes(m.status)&&<button disabled={busy} onClick={()=>void perform(async()=>{await groupAction('restore',group.id,{user_id:m.user_id});})}>Restore to pending</button>}
      </div>}</article>)}{!members.length&&!loading&&<p>No members on this page.</p>}<div className={styles.controls}><button disabled={!memberOffset||loading} onClick={()=>setMemberOffset(Math.max(0,memberOffset-50))}>Previous members</button><button disabled={members.length<50||loading} onClick={()=>setMemberOffset(memberOffset+50)}>More members</button></div></section>}
      {approved&&<form className={styles.postComposer} onSubmit={e=>{e.preventDefault();void perform(publish);}}>
  <div className={styles.postComposerTop}>
    <Link href={`/profile/${userId}`} className={styles.postComposerAvatar}>
  {viewerProfile?.avatar_url
    ? <ResponsiveMediaImage
        purpose="avatar"
        avatarSize={48}
        src={viewerProfile.avatar_url}
        alt="Your profile photo"
        style={{width:'100%',height:'100%',objectFit:'cover'}}
      />
    : (viewerProfile?.full_name||viewerProfile?.username||'You')
        .trim().charAt(0).toUpperCase()}
</Link>
    <textarea
      maxLength={10000}
      value={content}
      onChange={e=>setContent(e.target.value)}
      placeholder="What's on your mind?"
      rows={2}
      aria-label="Write a Group post"
    />
    <label htmlFor={`group-post-files-${groupId}`} className={styles.postComposerMediaIcon} aria-label="Add photos or videos">▣</label>
  </div>
  <input
    id={`group-post-files-${groupId}`}
    className={styles.postComposerHiddenInput}
    key={inputKey}
    type="file"
    multiple
    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
    onChange={e=>{
      const selected=Array.from(e.target.files??[]);
      try {
        if(selected.length>4)throw new Error('Choose up to four files.');
        selected.forEach(f=>validateUpload(f.type,f.size));
        setFiles(selected);
        setError('');
      } catch(err) {
        setFiles([]);
        setError(err instanceof Error?err.message:'Invalid media');
      }
    }}
  />
  {files.length>0&&<div className={styles.postComposerMediaGrid}>
    {files.map((file,index)=>(
  <div
    key={`${file.name}-${file.lastModified}-${index}`}
    className={styles.postComposerSelectedMedia}
  >
    <SelectedMedia file={file}/>
    <button
      type="button"
      className={styles.postComposerRemoveMedia}
      aria-label={`Remove ${file.name}`}
      onClick={()=>{
        setFiles(current=>current.filter((_,i)=>i!==index));
        setInputKey(k=>k+1);
      }}
    >
      ×
    </button>
  </div>
))}
  </div>}
  <div className={styles.postComposerActions}>
    <label htmlFor={`group-post-files-${groupId}`} className={styles.postComposerPhotos}>▣ Photos / Videos</label>
    <span>Up to 4 files · Images 8 MB · Videos 32 MB</span>
  </div>
  <div className={styles.postComposerFooter}>
    <button type="submit" disabled={busy||(!content.trim()&&!files.length)}>
      {busy?'Publishing…':'Publish post'}
    </button>
  </div>
</form>}
      {!canRead?<p className={styles.empty}>Discussion and media are available only to eligible members. {group.membership_status==='pending'?'Your request is awaiting approval.':''}</p>:<section aria-label="Group discussion"><h2>Discussion</h2>{posts.map(post=><article className={styles.post} key={post.id}><div className={styles.postHeader}>
  <div className={styles.postAuthor}>
    <Link href={`/profile/${post.author_id}`} className={styles.postAuthorAvatar}>
      {authorProfiles[post.author_id]?.avatar_url
        ? <ResponsiveMediaImage
            purpose="avatar"
            avatarSize={44}
            src={authorProfiles[post.author_id].avatar_url!}
            alt="Post author"
            style={{width:'100%',height:'100%',objectFit:'cover'}}
          />
        : (authorProfiles[post.author_id]?.full_name||
           authorProfiles[post.author_id]?.username||
           'M').trim().charAt(0).toUpperCase()}
    </Link>
    <div className={styles.postAuthorMeta}>
      <Link href={`/profile/${post.author_id}`} className={styles.postAuthorName}>
        {authorProfiles[post.author_id]?.full_name?.trim()||
         authorProfiles[post.author_id]?.username?.trim()||'Member'}
      </Link>
      <time dateTime={post.created_at}>
        {new Date(post.created_at).toLocaleString()}
      </time>
    </div>
  </div>{approved&&(post.author_id===userId||moderator)&&(
<div className={styles.postMenuWrap} id={`group-post-menu-${post.id}`}>
  <button type="button" className={styles.postDots}
    aria-label="Post options" aria-expanded={openPostMenuId===post.id}
    onClick={()=>setOpenPostMenuId(v=>v===post.id?null:post.id)}>
    <DotsIcon/>
  </button>
  {openPostMenuId===post.id&&<div className={styles.postMenu}>
    {post.author_id===userId&&
      <button type="button" className={styles.postMenuItem} disabled={busy}
        onClick={()=>{setOpenPostMenuId(null);setEditPost(post.id);setEditContent(post.content);}}>
        Edit post
      </button>}
    <button type="button" className={`${styles.postMenuItem} ${styles.postMenuDanger}`}
      disabled={busy} onClick={()=>{
        setOpenPostMenuId(null);
        if(window.confirm('Delete this Group post and its media?'))
          void perform(async()=>{await groupAction('delete_post',group.id,{post_id:post.id});});
      }}>Delete post</button>
  </div>}
</div>
)}</div>{editPost===post.id?<form className={styles.form} onSubmit={e=>{e.preventDefault();void perform(async()=>{await groupAction('edit_post',group.id,{post_id:post.id,content:editContent});setEditPost(undefined);});}}><label>Edit post<textarea maxLength={10000} value={editContent} onChange={e=>setEditContent(e.target.value)}/></label><button disabled={busy}>Save post</button><button type="button" onClick={()=>setEditPost(undefined)}>Cancel</button></form>:<p className={styles.text}>{post.content}</p>}
        {post.group_post_media.length>0&&
  <div className={styles.postMediaGrid}>
    {post.group_post_media.slice()
      .sort((a,b)=>a.display_order-b.display_order)
      .map(media=><div key={media.id} className={styles.postMediaItem}>
        <PrivateMedia
          path={media.storage_path}
          video={media.media_type==='video'}
        />
      </div>)}
  </div>}

      <GroupPostActions
  groupId={group.id}
  postId={post.id}
  canInteract={approved}
  canShare={approved && group.visibility === 'public'}
  read={groupsFetch}
  action={groupAction}
/>
</article>)}{!posts.length&&!loading&&<p className={styles.empty}>No posts on this page yet.</p>}<div className={styles.controls}><button disabled={!feedOffset||loading} onClick={()=>setFeedOffset(Math.max(0,feedOffset-20))}>Newer posts</button><button disabled={posts.length<20||loading} onClick={()=>setFeedOffset(feedOffset+20)}>Older posts</button></div></section>}
    </>:!loading&&<p className={styles.empty}>This Group is unavailable.</p>}
  </div></main>;
}

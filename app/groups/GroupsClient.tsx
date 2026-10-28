'use client';
import { DotsIcon } from "@/components/PostActionIcons";
import ResponsiveMediaImage from '@/components/ResponsiveMediaImage';
import GroupPostComposer from './GroupPostComposer';
import GroupPostMedia from './GroupPostMedia';
import posting from './groupPosting.module.css';
import { postCardStyle, postHeaderStyle, postAuthorStyle, postContentStyle, dotsButtonStyle, postMenuStyle, menuItemStyle } from '@/components/postPresentation';
import { supabase } from '@/lib/supabase';
import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { liveGroupsTransport, type GroupsTransport } from '@/lib/groups/transport';
import { validateGroupFields, validateUpload } from '@/lib/groups/validation';
import { appendGroupPosts } from '@/lib/groups/feed';
import type { Group, GroupMember, GroupPost } from '@/lib/groups/types';
import styles from './groups.module.css';
import GroupCover from './GroupCover';
import GroupShareButton from './GroupShareButton';
import GroupPromotionSettings from './GroupPromotionSettings';
import GroupPostActions from './GroupPostActions';
import GroupsDirectory, { DirectoryHeading, type DirectoryTab } from './GroupsDirectory';
import { useGroupPreferences } from './useGroupPreferences';
import { parseGroupPreferences } from '@/lib/groups/directory';

type GroupTab = 'discussion' | 'about' | 'members' | 'media';

function GroupAbout({group}:{group:Group}) {
  return <>
    <h2>About this Group</h2>
    <p className={styles.text}>{group.description || 'A place for the community to connect and share.'}</p>
    <dl className={styles.details}>
      <div><dt>Privacy</dt><dd>{group.visibility==='public'?'Public Group':'Private Group'}<span>{group.visibility==='public'?'Eligible signed-in visitors can read discussions. Join to participate.':'Only approved members can read discussions and media.'}</span></dd></div>
      {group.member_count!==null&&<div><dt>Community</dt><dd>{group.member_count} {group.member_count===1?'member':'members'}</dd></div>}
      <div><dt>Group owner</dt><dd>{group.owner_id?<Link href={`/profile/${group.owner_id}`}>{group.owner_name}</Link>:'Private'}</dd></div>
    </dl>
  </>;
}

const TransportContext=createContext<GroupsTransport>(liveGroupsTransport);

function GroupForm({group,onSubmit,busy,viewerId}:{group?:Group;onSubmit:(name:string,description:string,visibility:string,file?:File)=>Promise<void>;busy:boolean;viewerId?:string}) {
  const {read}=useContext(TransportContext);
  const [name,setName]=useState(group?.name ?? '');
  const [description,setDescription]=useState(group?.description ?? '');
  const [visibility,setVisibility]=useState(group?.visibility ?? 'public');
  const [file,setFile]=useState<File>();
  const [error,setError]=useState('');
  return <form className={styles.form} onSubmit={async event => {event.preventDefault();setError('');try {validateGroupFields(name,description,visibility);if(file)validateUpload(file.type,file.size,true);await onSubmit(name,description,visibility,file);}catch(e){setError(e instanceof Error?e.message:'Unable to save.');}}}>
    {!group&&<h2>Create a Group</h2>}<GroupCover path={group ? group.cover_storage_path : null} file={file} load={read} name={name||'New Group'} viewerId={viewerId} cacheable={!!group&&group.visibility==='public'&&!file}/>
    <label>Name<input required minLength={3} maxLength={100} value={name} onChange={e=>setName(e.target.value)} /></label>
    <label>Description<textarea maxLength={5000} value={description} onChange={e=>setDescription(e.target.value)} rows={4}/></label>
    <label>Visibility<select value={visibility} disabled={!!group && group.membership_role!=='owner'} onChange={e=>setVisibility(e.target.value as 'public'|'private')}><option value="public">Public — authenticated users can read; members can post</option><option value="private">Private — approval required to read or post</option></select></label>
    <label>Cover image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const selected=e.target.files?.[0];try{if(selected)validateUpload(selected.type,selected.size,true);setFile(selected);setError('');}catch(err){setFile(undefined);setError(err instanceof Error?err.message:'Invalid cover');}}}/></label>{file&&<p className={styles.muted}>{file.name} · selected cover preview</p>}
    <p className={styles.muted}>Public Group information appears in the directory. For private Groups, the owner’s sharing settings control the promotional details nonmembers can see. Recommended cover: 1640 × 856 pixels (1.91:1). Directory previews show the full image; the wide Group banner crops to fit. Images: up to 8 MB. Changing a private Group to public makes its existing discussions visible to eligible authenticated users.</p>
    {error && <p role="alert">{error}</p>}<button disabled={busy} type="submit">{busy?'Saving…':group?'Save changes':'Create Group'}</button>
  </form>;
}
export default function GroupsClient({groupId,transport=liveGroupsTransport,routeBase='/groups'}:{groupId?:string;transport?:GroupsTransport;routeBase?:string}) {
  return <TransportContext.Provider value={transport}><GroupsView key={groupId ?? "directory"} groupId={groupId} routeBase={routeBase}/></TransportContext.Provider>;
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
  const groupPreferences=useGroupPreferences(userId);
  const [search,setSearch]=useState('');const [filter,setFilter]=useState<DirectoryTab>('all');const [offset,setOffset]=useState(0);const [memberOffset,setMemberOffset]=useState(0);
  const feedEnd=useRef<HTMLDivElement>(null);const moreLock=useRef(false);
  const [hasMore,setHasMore]=useState(false);const [loadingMore,setLoadingMore]=useState(false);const [moreError,setMoreError]=useState('');
  const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [activeTab,setActiveTab]=useState<GroupTab>('discussion');
  const [create,setCreate]=useState(false);const [settings,setSettings]=useState(false);const [management,setManagement]=useState(false);
  const [content,setContent]=useState('');const [files,setFiles]=useState<File[]>([]);
  const [editPost,setEditPost]=useState<string>(); const [editContent,setEditContent]=useState('');
const [openPostMenuId,setOpenPostMenuId]=useState<string|null>(null);
  const [deleteName,setDeleteName]=useState('');
  useEffect(()=>{
    if(!settings)return;

    const html=document.documentElement;
    const body=document.body;
    const scrollY=window.scrollY;

    const previous={
      htmlOverflow:html.style.overflow,
      overflow:body.style.overflow,
      position:body.style.position,
      top:body.style.top,
      left:body.style.left,
      right:body.style.right,
      width:body.style.width
    };

    html.style.overflow='hidden';
    body.style.overflow='hidden';
    body.style.position='fixed';
    body.style.top=`-${scrollY}px`;
    body.style.left='0';
    body.style.right='0';
    body.style.width='100%';

    return ()=>{
      html.style.overflow=previous.htmlOverflow;
      body.style.overflow=previous.overflow;
      body.style.position=previous.position;
      body.style.top=previous.top;
      body.style.left=previous.left;
      body.style.right=previous.right;
      body.style.width=previous.width;
      window.scrollTo(0,scrollY);
    };
  },[settings]);

  useEffect(()=>{
    if(!settings)return;
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==='Tab'){
        const modal=document.querySelector('[aria-labelledby="group-settings-heading"]');
        const controls=Array.from(modal?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')??[]);
        const first=controls[0],last=controls[controls.length-1];
        if(first&&last&&event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(first&&last&&!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
      if(event.key==='Escape'&&!busy){
        setSettings(false);
        setDeleteName('');
      }
    };
    document.addEventListener('keydown',onKeyDown);
    return ()=>document.removeEventListener('keydown',onKeyDown);
  },[settings,busy]);
const requestNumber=useRef(0);const mutationLock=useRef(false);
  const group=groupId?groups.find(g=>g.id===groupId):undefined;
  const approved=group?.membership_status==='approved';const owner=approved&&group?.membership_role==='owner';
  const admin=approved&&['owner','admin'].includes(group?.membership_role ?? '');
  const moderator=approved&&['owner','admin','moderator'].includes(group?.membership_role ?? '');
  const canRead=!!group && (approved || (group.visibility==='public' && !['rejected','removed','banned'].includes(group.membership_status ?? '')));
  const selectedTab=(activeTab==='members'&&!admin)||(activeTab==='media'&&!canRead)?'discussion':activeTab;
  useEffect(()=>{
    let active=true;
    setViewerProfile(null);
    if(userId && transport===liveGroupsTransport){
      void supabase.from('profiles')
        .select('full_name,username,avatar_url')
        .eq('id',userId).maybeSingle()
        .then(({data,error})=>{
          if(active && !error)setViewerProfile(data);
        });
    }
    return ()=>{active=false;};
  },[userId,transport]);

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
        setGroups([]);setPosts([]);setMembers([]);setContent('');setFiles([]);
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
    if(transport!==liveGroupsTransport)return;
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
  },[posts,transport]);

  const serverSearch=filter==='mine'?'':search;
  useEffect(()=>{
    if(!groupId||!group?.id||!approved||!userId)return;
    const key=`parapost:groups:vmgelrgrtpghmvqgufzz:${userId}`;
    try{const preferences=parseGroupPreferences(localStorage.getItem(key));preferences.visits[group.id]=Date.now();localStorage.setItem(key,JSON.stringify(preferences));}catch{/* Browser storage is optional. */}
  },[groupId,group?.id,approved,userId]);

  const refresh=useCallback(async()=>{
    const number=++requestNumber.current;setLoading(true);
    try {
      const params=new URLSearchParams({search:serverSearch,filter,offset:String(filter==='mine'&&!groupId?0:offset)});if(groupId)params.set('group',groupId);
      const list:Group[]=await (await groupsFetch(`/api/groups?${params}`)).json();
      if(number!==requestNumber.current)return;
      // My Groups filters/counts cover the full authorized membership list.
      if(filter==='mine'&&!groupId){
        let pageLength=list.length;
        for(let nextOffset=24;pageLength===24;nextOffset+=24){
          if(number!==requestNumber.current)return;
          if(nextOffset>100000)throw new Error('Too many Groups to load. Please contact support.');
          params.set('offset',String(nextOffset));
          const page:Group[]=await(await groupsFetch(`/api/groups?${params}`)).json();
          pageLength=page.length;
          list.push(...page);
        }
      }
      if(number!==requestNumber.current)return;
      setGroups([...new Map(list.map(item=>[item.id,item])).values()]);setPosts([]);setMembers([]);setHasMore(false);setMoreError('');
      if(groupId&&list[0]) {
        const current=list[0];
        const allowed=current.membership_status==='approved'||(current.visibility==='public'&&!['rejected','removed','banned'].includes(current.membership_status ?? ''));
        const feed:GroupPost[]=allowed?await(await groupsFetch(`/api/groups?kind=feed&group=${groupId}&offset=0`)).json():[];
        if(number!==requestNumber.current)return;setPosts(feed);setHasMore(feed.length===20);
        if(management&&current.membership_status==='approved'&&['owner','admin'].includes(current.membership_role ?? '')) {
          const roster=await(await groupsFetch(`/api/groups?kind=members&group=${groupId}&offset=${memberOffset}`)).json();
          if(number===requestNumber.current)setMembers(roster);
        }
      }
    } catch(e) {if(number===requestNumber.current){setGroups([]);setPosts([]);setMembers([]);setError(e instanceof Error?e.message:'Unable to load Groups.');}}
    finally {if(number===requestNumber.current)setLoading(false);}
  },[groupId,serverSearch,filter,offset,memberOffset,management,groupsFetch]);
  useEffect(()=>{if(!authReady||!userId)return;const sequence=requestNumber;const timer=setTimeout(()=>{setError('');void refresh();},200);return()=>{clearTimeout(timer);sequence.current++;};},[refresh,userId,authReady]);
  // Clear restricted content before revalidating on tab focus. Already downloaded bytes cannot be revoked.
  useEffect(()=>{const focus=()=>{setPosts([]);setMembers([]);if(userId)void refresh();};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[refresh,userId]);
  const loadMore=useCallback(async()=>{
    if(!groupId||!hasMore||loading||moreLock.current||!posts.length)return;
    moreLock.current=true;setLoadingMore(true);setMoreError('');
    const version=requestNumber.current;const last=posts[posts.length-1];
    try{
      const params=new URLSearchParams({kind:'feed',group:groupId,afterCreated:last.created_at,afterId:last.id});
      const next:GroupPost[]=await(await groupsFetch(`/api/groups?${params}`)).json();
      if(version!==requestNumber.current)return;
      setPosts(current=>appendGroupPosts(current,next));
      setHasMore(next.length===20);
    }catch{if(version===requestNumber.current)setMoreError('Unable to load more posts. Please try again.');}
    finally{moreLock.current=false;setLoadingMore(false);}
  },[groupId,hasMore,loading,posts,groupsFetch]);
  useEffect(()=>{
    const target=feedEnd.current;
    if(selectedTab!=='discussion'||!target||!hasMore||loading||loadingMore||moreError)return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))void loadMore();},{rootMargin:'300px'});
    observer.observe(target);return()=>observer.disconnect();
  },[selectedTab,loadMore,hasMore,loading,loadingMore,moreError]);
  async function perform(fn:()=>Promise<void>) {
    if(mutationLock.current)return;mutationLock.current=true;setBusy(true);setError('');setNotice('');
    try{await fn();await refresh();}catch(e){setError(e instanceof Error?e.message:'Action failed.');}finally{mutationLock.current=false;setBusy(false);}
  }
  function membership(g:Group) {
    const status=g.membership_status;
    if(status==='approved')return <><span className={styles.membershipStatus}>✓ Joined · {g.membership_role}</span>{g.membership_role!=='owner'&&<button className={styles.leaveButton} disabled={busy} onClick={()=>{
  if(window.confirm('Are you sure you want to leave this Group? You may need approval to rejoin.'))
    void perform(async()=>{await groupAction('leave',g.id);});
}}>Leave Group</button>}</>;
    if(status==='pending')return <><span className={styles.membershipStatus}>Request pending</span><button disabled={busy} onClick={()=>void perform(async()=>{await groupAction('leave',g.id);})}>Cancel request</button></>;
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
    setContent('');setFiles([]);setNotice('Post published.');
  }
  if(!authReady)return <main className={styles.page}><p role="status">Checking your session…</p></main>;
  if(!userId)return <main className={styles.page}><h1>Groups</h1><p>Sign in to discover and participate in Groups.</p><Link href="/">Sign in</Link></main>;
  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.topbar}>
      <Link href={routeBase === '/group-original-preview' ? '/groups-preview' : '/dashboard'}>
        <span
          className={styles.topbarGhost}
          role="img"
          aria-label="Parapost Network"
        />
      </Link>
      <Link href={routeBase === '/group-original-preview' ? '/groups-preview' : routeBase}>
        Groups
      </Link>
      <Link href={routeBase === '/group-original-preview' ? '/' : '/dashboard'}>
        ← Dashboard
      </Link>
    </header>
    {error&&<p className={styles.alert} role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {loading&&<p role="status">Loading Groups…</p>}
    {!groupId?<>
      <DirectoryHeading mine={filter==='mine'} create={create} onCreate={()=>setCreate(value=>!value)}/>
      {create&&<GroupForm busy={busy} onSubmit={async(name,description,visibility,file)=>{
        if(mutationLock.current)return;mutationLock.current=true;setBusy(true);
        try{const created=await groupAction('create',undefined,{name,description,visibility});
          if(file){try{await groupUpload(created.id,file);}catch{setCreate(false);router.push(`${routeBase}/${created.id}?cover=retry`);return;}}
          router.push(`${routeBase}/${created.id}`);
        }finally{mutationLock.current=false;setBusy(false);}
      }}/>}
      {!create&&<>

      <GroupsDirectory groups={groups} viewerId={userId} tab={filter}
        onTab={value=>{setFilter(value);setOffset(0);setSearch('');}}
        search={search} onSearch={value=>{setSearch(value);setOffset(0);}} loading={loading}
        {...groupPreferences} renderMembership={membership} routeBase={routeBase}
        renderCover={g=><GroupCover path={g.cover_storage_path} name={g.name} load={groupsFetch} viewerId={userId} cacheable={g.visibility==='public'}/>}/>
      {filter!=='mine'&&<nav className={styles.pagination} aria-label="Group directory pages">{offset>0&&<button disabled={loading} onClick={()=>setOffset(Math.max(0,offset-24))}>Previous</button>}{groups.length===24&&<button disabled={loading} onClick={()=>setOffset(offset+24)}>Next</button>}</nav>}
      </>}
    </>:group?<>
      <section className={`${styles.card} ${styles.groupHeader}`}>
        <GroupCover banner path={group.cover_storage_path} name={group.name} load={groupsFetch} viewerId={userId} cacheable={group.visibility==='public'}/>
        <div className={styles.groupIdentity}>
          <div className={styles.identityText}>
            <p className={styles.eyebrow}>{group.visibility} Group</p>
            <h1>{group.name}</h1>
            <p className={styles.headerDescription}>{group.description}</p>
            <p className={styles.identityMeta}>{group.member_count!==null&&<>{group.member_count} {group.member_count===1?'member':'members'}</>}{group.owner_id&&<> <span aria-hidden="true">·</span> Owner: <Link href={`/profile/${group.owner_id}`}>{group.owner_name}</Link></>}</p>
            <div className={styles.headerActionRow}>
              {(group.visibility==='public'?canRead:approved)&&<GroupShareButton header groupId={group.id} read={groupsFetch}/>}
              {admin&&<button className={styles.secondaryButton} onClick={()=>setSettings(true)} aria-haspopup="dialog">Group settings</button>}
            </div>
          </div>
          <div className={styles.identityActions}>
            <div className={styles.membershipActions}>{membership(group)}</div>

          </div>
        </div>
        <div className={styles.groupTabs} role="tablist" aria-label="Group sections">
          {(['discussion','about',...(admin?['members']:[]),...(canRead?['media']:[])] as GroupTab[]).map(tab=><button
            key={tab} id={`group-tab-${tab}`} role="tab" aria-selected={selectedTab===tab}
            aria-controls={`group-panel-${tab}`} tabIndex={selectedTab===tab?0:-1}
            onClick={()=>{setActiveTab(tab);setManagement(tab==='members');}}
            onKeyDown={event=>{
              if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
              event.preventDefault();
              const tabs=Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
              const index=tabs.indexOf(event.currentTarget);
              const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
              tabs[next].focus();tabs[next].click();
            }}>{tab==='members'?'Members':tab.charAt(0).toUpperCase()+tab.slice(1)}</button>)}
        </div>
      </section>
      {selectedTab==='about'&&<section className={styles.aboutPanel} id="group-panel-about" role="tabpanel" aria-labelledby="group-tab-about" tabIndex={0}><GroupAbout group={group}/></section>}
      {selectedTab==='media'&&canRead&&<section className={styles.mediaPanel} id="group-panel-media" role="tabpanel" aria-labelledby="group-tab-media" tabIndex={0}>
        <h2>Photos & videos</h2><p className={styles.muted}>Media from the discussions you can access. Load older posts to explore more.</p>
        <div className={styles.mediaGallery}>{posts.filter(post=>post.group_post_media.some(item=>['image','video'].includes(item.media_type))).map(post=><article data-posting key={post.id} className={`${posting.posting} ${styles.mediaCard}`}>
          <GroupPostMedia groupId={group.id} postId={post.id} media={post.group_post_media} read={groupsFetch}/>
          <p className={styles.muted}><time dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString()}</time></p>
          <button className={styles.secondaryButton} onClick={()=>{setActiveTab('discussion');requestAnimationFrame(()=>document.getElementById(`group-post-${post.id}`)?.scrollIntoView({block:'start'}));}}>View discussion</button>
        </article>)}</div>
        {!loading&&!posts.some(post=>post.group_post_media.some(item=>['image','video'].includes(item.media_type)))&&<p className={styles.empty}>No photos or videos in the loaded posts.</p>}
        {hasMore&&<button disabled={loadingMore} onClick={()=>void loadMore()}>{loadingMore?'Loading…':'Load older posts'}</button>}
        {moreError&&<p role="alert" className={styles.alert}>{moreError}</p>}
      </section>}
      {admin&&settings&&
        <div className={styles.settingsOverlay}
          onMouseDown={event=>{
            if(event.target===event.currentTarget&&!busy){
              setSettings(false);
              setDeleteName('');
            }
          }}>
          <div className={styles.settingsModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-settings-heading">
            <header className={styles.settingsModalHeader}>
              <h2 id="group-settings-heading">Group settings</h2>
              <button type="button" autoFocus disabled={busy}
                onClick={()=>{
                  setSettings(false);
                  setDeleteName('');
                }}>Close</button>
            </header>
{group.cover_storage_path&&<button disabled={busy} onClick={()=>void perform(async()=>{await groupAction('remove_cover',group.id);setNotice('Custom cover removed. ParaGhost is restored.');})}>Remove cover and restore ParaGhost</button>}<GroupForm key={JSON.stringify([group.id,group.name,group.description,group.visibility,group.cover_storage_path])} group={group} viewerId={userId} busy={busy} onSubmit={async(name,description,visibility,file)=>{await perform(async()=>{await groupAction('edit',group.id,{name,description,visibility});if(file)await groupUpload(group.id,file);setNotice('Group saved.');setSettings(false);setDeleteName('');});}}/>{owner&&<GroupPromotionSettings groupId={group.id} read={groupsFetch}/>} {owner&&<section className={`${styles.form} ${styles.settingsDanger}`}><h2>Delete Group</h2><p>This permanently removes the Group, memberships and posts. Ownership transfer is not supported.</p><label>Type “{group.name}” to confirm<input value={deleteName} onChange={e=>setDeleteName(e.target.value)}/></label><button disabled={busy||deleteName!==group.name} onClick={()=>void perform(async()=>{await groupAction('delete',group.id,{confirmation:deleteName});router.push(routeBase);})}>Delete Group permanently</button></section>}</div></div>}
      {admin&&management&&<section className={styles.form} id="group-panel-members" role="tabpanel" aria-labelledby="group-tab-members" tabIndex={0}><h2>Member management</h2><p>Admins manage ordinary members. Only the owner assigns roles or restores rejected, removed or banned members to pending.</p>{members.map(m=><article className={styles.member} key={m.user_id}><div><Link href={`/profile/${m.user_id}`}>{m.display_name}</Link><p>{m.role} · {m.status}</p></div>{m.user_id!==userId&&m.role!=='owner'&&(owner||m.role==='member')&&<div className={styles.controls}>
        {m.status==='pending'&&['approve','reject'].map(action=><button key={action} disabled={busy} onClick={()=>void perform(async()=>{await groupAction(action,group.id,{user_id:m.user_id});})}>{action==='approve'?'Approve':'Reject'}</button>)}
        {m.status==='approved'&&<><button disabled={busy} onClick={()=>void perform(async()=>{await groupAction('remove',group.id,{user_id:m.user_id});})}>Remove</button>{owner&&<label>Role<select value={m.role} disabled={busy} onChange={e=>void perform(async()=>{await groupAction('role',group.id,{user_id:m.user_id,role:e.target.value});})}><option value="member">Member</option><option value="moderator">Moderator</option><option value="admin">Administrator</option></select></label>}</>}
        {m.status!=='banned'&&<button disabled={busy} onClick={()=>void perform(async()=>{await groupAction('ban',group.id,{user_id:m.user_id});})}>Ban</button>}
        {owner&&['rejected','removed','banned'].includes(m.status)&&<button disabled={busy} onClick={()=>void perform(async()=>{await groupAction('restore',group.id,{user_id:m.user_id});})}>Restore to pending</button>}
      </div>}</article>)}{!members.length&&!loading&&<p>No members on this page.</p>}<div className={styles.controls}>{memberOffset>0&&<button disabled={loading} onClick={()=>setMemberOffset(Math.max(0,memberOffset-50))}>Previous members</button>}{members.length===50&&<button disabled={loading} onClick={()=>setMemberOffset(memberOffset+50)}>More members</button>}</div></section>}
      <div hidden={selectedTab!=='discussion'} className={styles.discussionLayout} id="group-panel-discussion" role="tabpanel" aria-labelledby="group-tab-discussion" tabIndex={0}>
      <aside className={styles.aboutSidebar}><GroupAbout group={group}/></aside>
      <div className={styles.discussionColumn}>
      {canRead&&!approved&&<p className={styles.readingNotice}>You’re viewing a public discussion. Join this Group to participate.</p>}
      {approved && <GroupPostComposer userId={userId} profile={viewerProfile}
        groupName={group.name}
        coverPath={group.cover_storage_path}
        read={groupsFetch}
        cacheable={group.visibility==='public'}
        content={content}
        setContent={setContent} files={files} setFiles={setFiles} busy={busy} onPublish={() => void perform(publish)} />}

      {!canRead?<p className={styles.empty}>Discussion and media are available only to eligible members. {group.membership_status==='pending'?'Your request is awaiting approval.':''}</p>:<section aria-label="Group discussion"><h2>Discussion</h2>{posts.map(post=><article data-posting className={`${posting.posting} ${posting.post}`} id={`group-post-${post.id}`} style={postCardStyle} key={post.id}><div className={posting.postHeader} style={postHeaderStyle}>
  <div style={postAuthorStyle}>
    <Link href={`/profile/${post.author_id}`} className={posting.avatar} style={{width:48,height:48}}>
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
    <div className={posting.authorMeta}>
      <Link href={`/profile/${post.author_id}`} className={posting.authorName}>
        {authorProfiles[post.author_id]?.full_name?.trim()||
         authorProfiles[post.author_id]?.username?.trim()||'Member'}
      </Link>
      <time dateTime={post.created_at}>
        {new Date(post.created_at).toLocaleString()}
      </time>
    </div>
  </div>{approved&&(post.author_id===userId||moderator)&&(
<div className={posting.menuWrap} id={`group-post-menu-${post.id}`}>
  <button type="button" style={dotsButtonStyle}
    aria-label="Post options" aria-expanded={openPostMenuId===post.id}
    onClick={()=>setOpenPostMenuId(v=>v===post.id?null:post.id)}>
    <DotsIcon/>
  </button>
  {openPostMenuId===post.id&&<div role="menu" style={postMenuStyle}>
    {post.author_id===userId&&
      <button type="button" role="menuitem" style={menuItemStyle} disabled={busy}
        onClick={()=>{setOpenPostMenuId(null);setEditPost(post.id);setEditContent(post.content);}}>
        Edit post
      </button>}
    <button type="button" role="menuitem" style={{...menuItemStyle,color:"#fca5a5"}}
      disabled={busy} onClick={()=>{
        setOpenPostMenuId(null);
        if(window.confirm('Delete this Group post and its media?'))
          void perform(async()=>{await groupAction('delete_post',group.id,{post_id:post.id});});
      }}>Delete post</button>
  </div>}
</div>
)}</div>{editPost===post.id?<form className={posting.editForm} onSubmit={e=>{e.preventDefault();void perform(async()=>{await groupAction('edit_post',group.id,{post_id:post.id,content:editContent});setEditPost(undefined);});}}><label>Edit post<textarea maxLength={10000} value={editContent} onChange={e=>setEditContent(e.target.value)}/></label><button disabled={busy}>Save post</button><button type="button" onClick={()=>setEditPost(undefined)}>Cancel</button></form>:<p style={postContentStyle}>{post.content}</p>}
        <GroupPostMedia groupId={group.id} postId={post.id} media={post.group_post_media} read={groupsFetch} />

      <GroupPostActions viewerId={userId} ownerId={group.owner_id}
  groupId={group.id}
  postId={post.id}
  canInteract={approved}
  canShare={approved && group.visibility === 'public'}
  privateSharing={approved && group.visibility === 'private'}
  read={groupsFetch}
  action={groupAction}
/>
</article>)}{!posts.length&&!loading&&<p className={styles.empty}>No posts on this page yet.</p>}<div ref={feedEnd} className={styles.feedEnd} role="status">{loadingMore?'Loading more posts…':!hasMore&&posts.length>0?'You’re all caught up.':''}</div>{moreError&&<div role="alert" className={styles.alert}>{moreError} <button disabled={loadingMore} onClick={()=>void loadMore()}>Try again</button></div>}</section>}
      </div></div>
    </>:!loading&&<p className={styles.empty}>This Group is unavailable.</p>}
  </div></main>;
}

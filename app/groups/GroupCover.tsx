'use client';
/* eslint-disable @next/next/no-img-element -- authenticated object URLs and existing exact branding artwork */
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import type {GroupsTransport} from '@/lib/groups/transport';
import styles from './groups.module.css';

export const OFFICIAL_PARAGHOST='/parapost-icon-white.png';

type CacheEntry={
  url:string;
  expires:number;
  refs:number;
  retired:boolean;
};

const MAX_COVERS=12;
const COVER_TTL=120000;
const coverCache=new Map<string,CacheEntry>();
let cacheViewer='';
let authWatching=false;

function retire(entry:CacheEntry){
  if(entry.retired)return;
  entry.retired=true;
  if(entry.refs===0)URL.revokeObjectURL(entry.url);
}

function forget(path:string){
  const entry=coverCache.get(path);
  if(!entry)return;
  coverCache.delete(path);
  retire(entry);
}

function setCacheViewer(viewer:string){
  if(cacheViewer===viewer)return;
  for(const path of coverCache.keys())forget(path);
  cacheViewer=viewer;
}

function watchAuthentication(){
  if(authWatching||typeof window==='undefined')return;
  authWatching=true;
  supabase.auth.onAuthStateChange((_event,session)=>{
    const viewer=session?.user?.id??'';
    if(cacheViewer&&viewer!==cacheViewer)setCacheViewer(viewer);
  });
}

function cachedCover(viewer:string,path:string):CacheEntry|null{
  if(typeof window==='undefined'||!viewer||cacheViewer!==viewer)return null;
  const entry=coverCache.get(path);
  if(!entry||entry.retired||entry.expires<=Date.now())return null;
  return entry;
}

function acquireCover(viewer:string,path:string):CacheEntry|null{
  const entry=cachedCover(viewer,path);
  if(!entry)return null;
  entry.refs++;
  coverCache.delete(path);
  coverCache.set(path,entry);
  return entry;
}

function releaseCover(entry:CacheEntry){
  entry.refs=Math.max(0,entry.refs-1);
  if(entry.retired&&entry.refs===0)URL.revokeObjectURL(entry.url);
}

function rememberCover(viewer:string,path:string,url:string):CacheEntry|null{
  if(cacheViewer!==viewer)return null;

  for(const [key,entry] of coverCache){
    if(entry.expires<=Date.now())forget(key);
  }

  forget(path);
  const entry:CacheEntry={
    url,
    expires:Date.now()+COVER_TTL,
    refs:1,
    retired:false
  };
  coverCache.set(path,entry);

  while(coverCache.size>MAX_COVERS){
    const oldest=coverCache.keys().next().value;
    if(!oldest)break;
    forget(oldest);
  }

  return entry;
}

type Props={
  path?:string|null;
  file?:File;
  load:GroupsTransport['read'];
  name:string;
  banner?:boolean;
  viewerId?:string;
  cacheable?:boolean;
};

export default function GroupCover(props:Props){
  const imageKey=props.file
    ? `${props.file.name}:${props.file.size}:${props.file.lastModified}`
    : props.path??'default';
  const key=`${props.viewerId??'preview'}:${imageKey}`;
  return <div className={`${styles.cover} ${props.banner?styles.banner:''}`}>
    <CoverImage key={key} {...props}/>
  </div>;
}

function CoverImage({path,file,load,name,viewerId,cacheable}:Props){
  const [src,setSrc]=useState<string|null>(()=>{
    if(file)return null;
    if(path===null)return OFFICIAL_PARAGHOST;
    if(path&&viewerId&&cacheable)return cachedCover(viewerId,path)?.url??null;
    return null;
  });

  useEffect(()=>{
    if(!path&&!file){
      return;
    }

    if(path&&!file&&viewerId&&cacheable){
      watchAuthentication();
      setCacheViewer(viewerId);
      const cached=acquireCover(viewerId,path);
      if(cached){
        return ()=>releaseCover(cached);
      }
    }

    const controller=new AbortController();
    let active=true;
    let objectUrl='';
    let preloader:HTMLImageElement|null=null;
    let held:CacheEntry|null=null;

    const resolve=async()=>{
      let blob:Blob;
      if(file){
        blob=file;
      }else if(path){
        const response=await load(
          `/api/groups/media?path=${encodeURIComponent(path)}`,
          {signal:controller.signal}
        );
        if(!response.ok)throw new Error('Cover image unavailable');
        blob=await response.blob();
      }else{
        return;
      }

      if(!active||controller.signal.aborted)return;
      objectUrl=URL.createObjectURL(blob);
      preloader=new Image();

      preloader.onload=()=>{
        if(!active||controller.signal.aborted)return;
        if(cacheable&&viewerId&&cacheViewer!==viewerId)return;
        if(path&&!file&&viewerId&&cacheable){
          held=rememberCover(viewerId,path,objectUrl);
        }
        setSrc(objectUrl);
      };

      preloader.onerror=()=>{
        if(active&&!controller.signal.aborted)setSrc(null);
      };

      preloader.src=objectUrl;
    };

    void resolve().catch(()=>{
      if(active&&!controller.signal.aborted)setSrc(null);
    });

    return ()=>{
      active=false;
      controller.abort();
      if(preloader){
        preloader.onload=null;
        preloader.onerror=null;
      }
      if(held)releaseCover(held);
      else if(objectUrl)URL.revokeObjectURL(objectUrl);
    };
  },[path,file,load,viewerId,cacheable]);

  if(!src)return null;
  const fallback=src===OFFICIAL_PARAGHOST;

  return <img
    className={fallback?styles.mascot:styles.coverImage}
    src={src}
    alt={fallback?'ParaGhost — official Parapost Network mascot':`${name} cover`}
    onError={()=>{
      if(!fallback){
        if(path&&viewerId&&cacheable){
          const entry=cachedCover(viewerId,path);
          if(entry?.url===src)forget(path);
        }
        setSrc(null);
      }
    }}
  />;
}

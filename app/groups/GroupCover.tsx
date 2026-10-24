'use client';
/* eslint-disable @next/next/no-img-element -- authenticated object URLs and existing exact branding artwork */
import {useEffect,useState} from 'react';
import type {GroupsTransport} from '@/lib/groups/transport';
import styles from './groups.module.css';
// Exact artwork used by the desktop and mobile dashboard ParaGhostLogoIcon.
export const OFFICIAL_PARAGHOST='/parapost-icon-white.png';
type Props={path?:string|null;file?:File;load:GroupsTransport['read'];name:string;banner?:boolean};
export default function GroupCover(props:Props){
  const key=props.file?`${props.file.name}:${props.file.size}:${props.file.lastModified}`:props.path??'default';
  return <div className={`${styles.cover} ${props.banner?styles.banner:''}`}><CoverImage key={key} {...props}/></div>;
}
function CoverImage({path,file,load,name}:Props){
  const [src,setSrc]=useState<string|null>(
    file || path !== null ? null : OFFICIAL_PARAGHOST
  );

  useEffect(()=>{
    if(!path&&!file){
      setSrc(path === null ? OFFICIAL_PARAGHOST : null);
      return;
    }

    const controller=new AbortController();
    let active=true;
    let objectUrl='';
    let preloader:HTMLImageElement|null=null;

    setSrc(null);

    const resolve=async()=>{
      let blob:Blob;

      if(file){
        blob=file;
      }else if(path){
        const response=await load(
          `/api/groups/media?path=${encodeURIComponent(path)}`,
          {signal:controller.signal}
        );

        if(!response.ok){
          throw new Error('Cover image unavailable');
        }

        blob=await response.blob();
      }else{
        return;
      }

      if(!active||controller.signal.aborted)return;

      objectUrl=URL.createObjectURL(blob);

      preloader=new Image();

      preloader.onload=()=>{
        if(active&&!controller.signal.aborted){
          setSrc(objectUrl);
        }
      };

      preloader.onerror=()=>{
        if(active&&!controller.signal.aborted){
          setSrc(null);
        }
      };

      preloader.src=objectUrl;
    };

    void resolve().catch(()=>{
      if(active&&!controller.signal.aborted){
        setSrc(null);
      }
    });

    return()=>{
      active=false;
      controller.abort();
      if(preloader){
        preloader.onload=null;
        preloader.onerror=null;
      }
      if(objectUrl)URL.revokeObjectURL(objectUrl);
    };
  },[path,file,load]);

  if(!src)return null;

  const fallback=src===OFFICIAL_PARAGHOST;

  return <img
    className={fallback?styles.mascot:styles.coverImage}
    src={src}
    alt={fallback
      ?'ParaGhost — official Parapost Network mascot'
      :`${name} cover`}
    onError={()=>{
      if(!fallback)setSrc(null);
    }}
  />;
}

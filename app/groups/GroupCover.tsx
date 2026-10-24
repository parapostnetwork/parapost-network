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
 const [src,setSrc]=useState(OFFICIAL_PARAGHOST);
 useEffect(()=>{
  if(!path&&!file)return;
  const controller=new AbortController();let url='';
  const resolve=async()=>{
   const blob=file?await Promise.resolve(file):await(await load(`/api/groups/media?path=${encodeURIComponent(path!)}`,{signal:controller.signal})).blob();
   if(controller.signal.aborted)return;
   url=URL.createObjectURL(blob);setSrc(url);
  };
  void resolve().catch(()=>{if(!controller.signal.aborted)setSrc(OFFICIAL_PARAGHOST);});
  return()=>{controller.abort();if(url)URL.revokeObjectURL(url);};
 },[path,file,load]);
 const fallback=src===OFFICIAL_PARAGHOST;
 return <img className={fallback?styles.mascot:styles.coverImage} src={src} alt={fallback?'ParaGhost — official Parapost Network mascot':`${name} cover`} onError={()=>{if(!fallback)setSrc(OFFICIAL_PARAGHOST);}}/>;
}

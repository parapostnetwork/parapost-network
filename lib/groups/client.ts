import { supabase } from '@/lib/supabase';
import { matchesSignature, validateUpload } from './validation';
export async function groupsFetch(path:string, init:RequestInit = {}) {
  const {data} = await supabase.auth.getSession();
  if (!data.session) throw new Error('Sign in to use Groups.');
  const response = await fetch(path,{...init,cache:'no-store',headers:{...init.headers,Authorization:`Bearer ${data.session.access_token}`}});
  if (!response.ok) {
    if (response.status===401) throw new Error('Your session expired. Sign in again.');
    if (response.status===404) throw new Error('Groups is not enabled for this environment.');
    throw new Error('Unable to complete the request. Your access may have changed. Refresh and try again.');
  }
  return response;
}
export async function groupAction(action:string,groupId?:string,payload:Record<string,unknown> = {}) {
  return (await groupsFetch('/api/groups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,groupId,payload})})).json();
}
export async function groupUpload(groupId:string,file:File,postId?:string) {
  validateUpload(file.type,file.size,!postId);
  if (!matchesSignature(file.type,new Uint8Array(await file.slice(0,16).arrayBuffer()))) throw new Error('The file does not match its image or video type.');
  const {path} = await groupAction(postId?'reserve_media':'reserve_cover',groupId,{post_id:postId,mime_type:file.type});
  // Direct authenticated upload avoids Vercel's request-body limit. Database reservations,
  // immutable paths, bucket limits and RLS are authoritative, not this browser validation.
  const {error} = await supabase.storage.from('group-media').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'0'});
  if (error) throw new Error('Upload failed. Check your connection and Group access.');
  if (!postId) await groupAction('set_cover',groupId,{path});
  return {path};
}

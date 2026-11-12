import { shareErrorFromResponse } from './shareErrors';
import { supabase } from '@/lib/supabase';
import { matchesSignature, validateUpload } from './validation';
export async function groupsFetch(path:string, init:RequestInit = {}) {
  const {data} = await supabase.auth.getSession();
  if (!data.session) throw new Error('Sign in to use Groups.');
  const response = await fetch(path,{...init,cache:'no-store',headers:{...init.headers,Authorization:`Bearer ${data.session.access_token}`}});
  if (!response.ok) {
    if (response.status === 409 || response.status === 403) {
      const shareError = shareErrorFromResponse(await response.clone().json().catch(() => null));
      if (shareError) throw shareError;
    }
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
  const reservation = await groupAction(
    postId?'reserve_media':'reserve_cover',
    groupId,
    {post_id:postId,mime_type:file.type}
  ) as {path:string;poster_path?:string|null};

  const {path,poster_path:posterPath} = reservation;

  // Direct authenticated upload avoids Vercel's request-body limit.
  // Existing storage reservations and RLS remain authoritative.
  const {error} = await supabase.storage.from('group-media').upload(
    path,file,{contentType:file.type,upsert:false,cacheControl:'0'}
  );
  if (error) throw new Error('Upload failed. Check your connection and Group access.');

  // Poster creation is optional. A JPEG failure must not fail a valid video post.
  // Never accept an arbitrary poster destination from the server response.
  if (postId && file.type.startsWith('video/') &&
      posterPath === `${path}.poster.jpg`) {
    try {
      const {generatePosterFromFile} = await import('@/lib/reels/upload-lifecycle');
      const poster = await generatePosterFromFile(
        file,new AbortController().signal
      );

      if (poster.type !== 'image/jpeg' || !poster.size)
        throw new Error('Invalid JPEG poster');

      const {error:posterError} = await supabase.storage
        .from('group-media')
        .upload(posterPath,poster,{
          contentType:'image/jpeg',
          upsert:false,
          cacheControl:'0'
        });

      if (posterError) throw posterError;
    } catch {
      // Video remains available; the feed uses its existing preview fallback.
    }
  }

  if (!postId) await groupAction('set_cover',groupId,{path});
  return {path};
}

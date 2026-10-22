import { groupClient, groupError, privateHeaders } from '@/lib/groups/server';
import { UUID, matchesSignature, validateUpload } from '@/lib/groups/validation';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const client = await groupClient(request);
    const path = new URL(request.url).searchParams.get('path') ?? '';
    if (path.length > 240 || !UUID.test(path.split('/')[0])) throw new Error('Invalid media');
    // RLS checks live membership and the live post/cover reference for every request.
    const {data,error} = await client.storage.from('group-media').download(path);
    if (error || !data) throw error ?? new Error('Unavailable');
    validateUpload(data.type,data.size);
    if (!matchesSignature(data.type,new Uint8Array(await data.slice(0,16).arrayBuffer()))) throw new Error('Invalid media');
    return new Response(data.stream(),{headers:{...privateHeaders,'Content-Type':data.type,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':'inline'}});
  } catch (error) { return groupError(error); }
}
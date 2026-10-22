import { groupClient, groupError, privateHeaders } from '@/lib/groups/server';
import { UUID, validateDownloadedMedia } from '@/lib/groups/validation';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const client = await groupClient(request);
    const path = new URL(request.url).searchParams.get('path') ?? '';
    if (path.length > 240 || !UUID.test(path.split('/')[0])) throw new Error('Invalid media');
    // RLS checks live membership and the live post/cover reference for every request.
    const {data,error} = await client.storage.from('group-media').download(path);
    if (error || !data) throw error ?? new Error('Unavailable');
    const type = await validateDownloadedMedia(data, path.split('/')[1] === 'covers');
    return new Response(data.stream(),{headers:{...privateHeaders,'Content-Type':type,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':'inline'}});
  } catch (error) { return groupError(error); }
}

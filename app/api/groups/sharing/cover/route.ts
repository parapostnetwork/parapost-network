import {groupClient,groupError,privateHeaders} from '@/lib/groups/server';
import {UUID,validateDownloadedMedia} from '@/lib/groups/validation';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{
    const client=await groupClient(request);
    const params=new URL(request.url).searchParams;
    const group=params.get('group'),share=params.get('share'),key=params.get('key');
    if(!group||!UUID.test(group)||(share&&!UUID.test(share))||!key||!/^[a-f0-9]{32}$/.test(key))throw new Error('Invalid cover');
    // Resolve current permission and cover reference before EVERY download, then enforce Storage RLS.
    const {data:path,error}=await client.rpc('groups_promotion_cover',{p_group_id:group,p_share_id:share,p_cover_key:key});
    if(error||typeof path!=='string'||!path.startsWith(`${group}/covers/`))throw new Error('Cover unavailable');
    const download=await client.storage.from('group-media').download(path);
    if(download.error||!download.data)throw new Error('Cover unavailable');
    const type=await validateDownloadedMedia(download.data,true);
    return new Response(download.data.stream(),{headers:{...privateHeaders,'Content-Type':type,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':'inline'}});
  }catch(error){return groupError(error);}
}

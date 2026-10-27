import { shareErrorResponse } from '@/lib/groups/shareErrorResponse';
import {groupClient,groupError,privateHeaders} from '@/lib/groups/server';
import {UUID} from '@/lib/groups/validation';
import {sharingInput} from '@/lib/groups/sharing';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{
    const client=await groupClient(request);
    const params=new URL(request.url).searchParams;
    const group=params.get('group'),share=params.get('share');
    if(!group||!UUID.test(group)||(share&&!UUID.test(share)))throw new Error('Invalid Group');
    const settings=params.get('kind')==='settings';
    const {data,error}=await client.rpc(settings?'groups_promotion_settings':'groups_promotion_preview',settings?{p_group_id:group}:{p_group_id:group,p_share_id:share});
    if(error)throw error;
    return Response.json(data,{headers:privateHeaders});
  }catch(error){return groupError(error);}
}
export async function POST(request:Request){
  try{
    const client=await groupClient(request);
    // Bound streamed bodies too, rather than trusting Content-Length.
    const reader=request.body?.getReader();if(!reader)throw new Error('Missing body');
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>12000){await reader.cancel();throw new Error('Too large');}chunks.push(value);}
    const input=sharingInput(JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))));
    const {data,error}=input.action==='settings'
      ?await client.rpc('groups_promotion_settings',{p_group_id:input.groupId,p_settings:input.settings})
      :await client.rpc('groups_promote',{p_group_id:input.groupId,p_post_id:input.postId??null,p_share_id:input.shareId??null,p_caption:input.caption??null});
    if(error){
      const failure=input.action==='share'?shareErrorResponse(error):null;
      if(failure)return failure;
      throw error;
    }
    return Response.json(data,{headers:privateHeaders});
  }catch(error){return groupError(error);}
}

export async function DELETE(request: Request) {
  try {
    const client = await groupClient(request);

    const reader = request.body?.getReader();
    if (!reader) throw new Error("Missing body");

    const chunks: Uint8Array[] = [];
    let size = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      size += value.byteLength;
      if (size > 2000) {
        await reader.cancel();
        throw new Error("Request too large");
      }

      chunks.push(value);
    }

    const input = JSON.parse(
      new TextDecoder().decode(Buffer.concat(chunks))
    );

    const shareId = input?.shareId;
    const kind = input?.kind;

    if (
      typeof shareId !== "string" ||
      !UUID.test(shareId) ||
      (kind !== "post" && kind !== "promotion")
    ) {
      throw new Error("Invalid share");
    }

    const { data, error } = await client.rpc(
      "groups_remove_share",
      {
        p_share_id: shareId,
        p_kind: kind,
      }
    );

    if (error) throw error;

    return Response.json(data, {
      headers: privateHeaders,
    });
  } catch (error) {
    return groupError(error);
  }
}

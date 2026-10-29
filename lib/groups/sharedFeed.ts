import {supabase} from '@/lib/supabase';
import type {SharedGroupPost} from '@/app/groups/SharedGroupPostCard';

/** Preserve existing post shares while merging canonical Group/invitation shares. */
export async function fetchGroupShares(sharerId:string|null,limit=60,signal?:AbortSignal){
  const params={p_sharer_id:sharerId,p_limit:limit,p_offset:0};
  const read=(name:string)=>{
    const request=supabase.rpc(name,params);
    return signal ? request.abortSignal(signal) : request;
  };
  const [posts,promotions]=await Promise.all([
    read('groups_shared_feed'),read('groups_promotional_feed'),
  ]);
  if(posts.error)return {data:null,error:posts.error};
  // Before the separately approved migration, keep established public post sharing working.
  if(promotions.error&&!['PGRST202','42883'].includes(promotions.error.code))return {data:null,error:promotions.error};
  const rows=[...(Array.isArray(posts.data)?posts.data:[]),...(Array.isArray(promotions.data)?promotions.data:[])] as SharedGroupPost[];
  const seen=new Set<string>();
  const data=rows.filter(row=>{if(!row.share_id||seen.has(row.share_id))return false;seen.add(row.share_id);return true;})
    .sort((a,b)=>b.shared_at.localeCompare(a.shared_at)||b.share_id.localeCompare(a.share_id)).slice(0,limit);
  return {data,error:null};
}

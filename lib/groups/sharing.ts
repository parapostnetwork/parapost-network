import { UUID } from './validation';

export type PromotionSettings = {enabled:boolean;show_name:boolean;show_cover:boolean;show_description:boolean};
export type GroupPromotion = {
  group_id:string;visibility:'public'|'private';name:string;description:string|null;
  member_count:number|null;cover_key:string|null;can_share:boolean;approved:boolean;
  kind:'group'|'invitation';post_id:string|null;
};
export function sharingInput(value:unknown) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid share');
  const input=value as Record<string,unknown>;
  if(!['share','settings'].includes(String(input.action))||typeof input.groupId!=='string'||!UUID.test(input.groupId))throw new Error('Invalid share');
  if(input.action==='settings'){
    const settings=input.settings as Record<string,unknown>;
    const fields=['enabled','show_name','show_cover','show_description'];
    if(!settings||typeof settings!=='object'||Array.isArray(settings)||Object.keys(settings).length!==4||fields.some(key=>typeof settings[key]!=='boolean'))throw new Error('Invalid settings');
    return {action:'settings' as const,groupId:input.groupId,settings:settings as PromotionSettings};
  }
  for(const key of ['postId','shareId'])if(input[key]!=null&&(typeof input[key]!=='string'||!UUID.test(input[key] as string)))throw new Error('Invalid share target');
  if(input.caption!=null&&(typeof input.caption!=='string'||input.caption.length>1000))throw new Error('Invalid message');
  return {action:'share' as const,groupId:input.groupId,postId:input.postId as string|undefined,shareId:input.shareId as string|undefined,caption:input.caption as string|undefined};
}
export function promotionHref(preview:GroupPromotion) {
  return `/groups/${preview.group_id}${preview.approved&&preview.post_id?`#group-post-${preview.post_id}`:''}`;
}

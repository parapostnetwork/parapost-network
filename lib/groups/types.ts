export type Group = { id:string; owner_id:string|null; owner_name:string; name:string; description:string; visibility:'public'|'private'; cover_storage_path:string|null; member_count:number|null; membership_status:string|null; membership_role:string|null };
export type GroupMember = { user_id:string; display_name:string; role:string; status:string };
export type GroupPost = { id:string; author_id:string; content:string; created_at:string; group_post_media:{id:string; storage_path:string; media_type:string; mime_type:string; display_order:number}[] };

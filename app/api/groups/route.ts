import { groupClient, groupError, privateHeaders } from '@/lib/groups/server';
import { UUID, validateGroupFields } from '@/lib/groups/validation';
export const dynamic = 'force-dynamic';
const actions = new Set(['create','join','leave','approve','reject','remove','ban','role','restore','edit','delete','draft','publish','edit_post','delete_post','reserve_media','reserve_cover','set_cover','remove_cover']);
export async function GET(request: Request) {
  try {
    const client = await groupClient(request);
    const params = new URL(request.url).searchParams;
    const groupId = params.get('group');
    const kind = params.get('kind') ?? 'directory';
    const offset = Math.max(0, Math.min(Number(params.get('offset')) || 0, 100000));
    if (groupId && !UUID.test(groupId)) throw new Error('Invalid Group');
    let result;
    if (kind === 'directory') {
      result = await client.rpc('groups_directory', { p_group_id: groupId, p_search: (params.get('search') ?? '').slice(0,100), p_filter: params.get('filter') ?? 'all', p_offset: offset });
    } else if (kind === 'members' && groupId) {
      result = await client.rpc('groups_members', { p_group_id: groupId, p_offset: offset });
    } else if (kind === 'feed' && groupId) {
      result = await client.from('group_posts').select('id,group_id,author_id,content,created_at,updated_at,group_post_media(id,storage_path,media_type,mime_type,display_order)')
        .eq('group_id',groupId).eq('published',true).eq('is_deleted',false).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+19);
    } else throw new Error('Invalid request');
    if (result.error) throw result.error;
    return Response.json(result.data, { headers: privateHeaders });
  } catch (error) { return groupError(error); }
}
export async function POST(request: Request) {
  try {
    const client = await groupClient(request);
    if (Number(request.headers.get('content-length')) > 20000) throw new Error('Too large');
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Missing body');
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 20000) { await reader.cancel(); throw new Error('Too large'); }
      chunks.push(value);
    }
    const raw = new TextDecoder().decode(Buffer.concat(chunks));
    const { action, groupId, payload = {} } = JSON.parse(raw);
    if (!actions.has(action) || (action !== 'create' && !UUID.test(groupId ?? ''))) throw new Error('Invalid request');
    if (action === 'create' || action === 'edit') validateGroupFields(payload.name,payload.description,payload.visibility);
    if (payload.content !== undefined && (typeof payload.content !== 'string' || payload.content.length > 10000)) throw new Error('Invalid post');
    const { data,error } = await client.rpc('groups_command',{p_action:action,p_group_id:groupId ?? null,p_payload:payload});
    if (error) throw error;
    return Response.json(data,{headers:privateHeaders});
  } catch (error) { return groupError(error); }
}

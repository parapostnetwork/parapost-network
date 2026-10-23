import { groupClient, groupError, privateHeaders } from '@/lib/groups/server';
import { UUID, validateGroupFields } from '@/lib/groups/validation';
export const dynamic = 'force-dynamic';
const actions = new Set(['create','join','leave','approve','reject','remove','ban','role','restore','edit','delete','draft','publish','edit_post','delete_post','reserve_media','reserve_cover','set_cover','remove_cover','like','unlike','comment','reply','like_comment','unlike_comment','share_post']);
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
    } else if (kind === 'interactions' && groupId) {
      const postId=params.get('post');
      if(!postId || !UUID.test(postId))
        throw new Error('Invalid post');

      const visible=await client.from('group_posts')
        .select('id')
        .eq('id',postId)
        .eq('group_id',groupId)
        .eq('published',true)
        .eq('is_deleted',false)
        .maybeSingle();

      if(visible.error)throw visible.error;
      if(!visible.data)throw new Error('Post unavailable');

      const viewer=await client.auth.getUser();
      if(viewer.error || !viewer.data.user)
        throw new Error('Sign in required');

      const [likes,mine,comments,commentLikeStats]=await Promise.all([
        client.from('group_post_likes')
          .select('post_id',{head:true,count:'exact'})
          .eq('post_id',postId),
        client.from('group_post_likes')
          .select('post_id')
          .eq('post_id',postId)
          .eq('user_id',viewer.data.user.id)
          .maybeSingle(),
        client.from('group_post_comments')
          .select('id,post_id,author_id,parent_id,content,created_at',
            {count:'exact'})
          .eq('post_id',postId)
          .order('created_at',{ascending:true})
          .limit(100),
        client.rpc('groups_comment_like_stats', {
          p_group_id: groupId,
          p_post_id: postId
        })
      ]);

      if(likes.error || mine.error || comments.error || commentLikeStats.error)
        throw (likes.error || mine.error || comments.error || commentLikeStats.error);

      const commentLikesById = new Map<string, {
          like_count: number;
          liked: boolean;
        }>();

        for (const row of commentLikeStats.data ?? []) {
          if (typeof row.comment_id !== 'string') continue;

          const count = Number(row.like_count);

          commentLikesById.set(row.comment_id, {
            like_count: Number.isSafeInteger(count) && count >= 0 ? count : 0,
            liked: row.liked === true
          });
        }

        result={
        data:{
          post_id:postId,
          like_count:likes.count ?? 0,
          liked:!!mine.data,
          comment_count:comments.count ?? 0,
          comments:(comments.data ?? []).map(comment => ({
              ...comment,
              like_count:commentLikesById.get(comment.id)?.like_count ?? 0,
              liked:commentLikesById.get(comment.id)?.liked ?? false
            })),
          comments_limited:(comments.count ?? 0)>100
        },
        error:null
      };
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
    const interaction=['like','unlike','comment','reply','like_comment','unlike_comment'].includes(action);
    if(interaction){
      if(!UUID.test(payload?.post_id ?? ''))
        throw new Error('Invalid post');
      if(['comment','reply'].includes(action) &&
        (typeof payload?.content!=='string' ||
         !payload.content.trim() ||
         payload.content.length>1200))
        throw new Error('Invalid comment');
      if(['reply','like_comment','unlike_comment'].includes(action) && !UUID.test(payload?.parent_id ?? ''))
        throw new Error('Invalid reply');
    }

    const sharePost = action === 'share_post';

      if (sharePost) {
        if (
          !UUID.test(String(groupId ?? '')) ||
          !UUID.test(String(payload?.post_id ?? ''))
        ) {
          throw new Error('Invalid Group share');
        }

        if (
          payload?.caption != null &&
          (
            typeof payload.caption !== 'string' ||
            payload.caption.length > 1000
          )
        ) {
          throw new Error('Invalid share caption');
        }
      }

      const { data,error } = sharePost
        ? await client.rpc('groups_share_post', {
            p_group_id: groupId,
            p_post_id: payload.post_id,
            p_caption: payload.caption ?? null
          })
        : interaction
      ? await client.rpc('groups_interact',{
          p_group_id:groupId,
          p_post_id:payload.post_id,
          p_action:action,
          p_content:['comment','reply'].includes(action)?payload.content:null,
          p_parent_id:['reply','like_comment','unlike_comment'].includes(action)?payload.parent_id:null
        })
      : await client.rpc('groups_command',{
          p_action:action,p_group_id:groupId ?? null,p_payload:payload
        });
    if (error) throw error;
    return Response.json(data,{headers:privateHeaders});
  } catch (error) { return groupError(error); }
}

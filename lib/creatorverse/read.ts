import { createClient } from '@supabase/supabase-js';
import { communityServerTargetAllowed } from '@/lib/community/release-target';
import { creatorVerseEnabled } from '@/lib/creatorverse/config';
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CreatorVerseError } from './permissions';
import { pageId, validatePageFields, directoryQuery } from './validation';
import type { PublicPage, PageResult, DirectoryResult, CreatorVersePost } from './types';
const columns = 'id,name,category,short_bio,description,website,social_links,public_email,location,created_at';
function publicPage(value: unknown): PublicPage {
  if (!value || typeof value !== 'object') throw new Error('Invalid page');
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.created_at !== 'string') throw new Error('Invalid page');
  return { ...validatePageFields(row), id: pageId(row.id), created_at: row.created_at };
}
export async function readDirectory(client: SupabaseClient, params: URLSearchParams): Promise<DirectoryResult> {
  const { category, search, offset, limit } = directoryQuery(params);
  let query = client.from('creatorverse_pages').select(columns).eq('status', 'active');
  if (category) query = query.eq('category', category);
  // Plain full-text search is bound as a parameter; never interpolate a PostgREST .or() expression.
  if (search) query = query.textSearch('search_document', search, { type: 'plain', config: 'simple' });
  const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + limit);
  if (error) throw new CreatorVerseError(503, 'CreatorVerse is temporarily unavailable.');
  const rows = data ?? [];
  const visibleRows = rows.slice(0, limit);
  const memberCounts = new Map<string, number>();

  if (visibleRows.length > 0) {
    const result = await client.rpc(
      'creatorverse_directory_member_counts',
      { p_page_ids: visibleRows.map(row => row.id) }
    );

    if (result.error || !Array.isArray(result.data)) {
      throw new CreatorVerseError(503, 'CreatorVerse member counts are temporarily unavailable.');
    }

    for (const item of result.data) {
      const count = Number(item.member_count);
      if (
        typeof item.page_id !== 'string' ||
        !Number.isSafeInteger(count) ||
        count < 0
      ) {
        throw new CreatorVerseError(503, 'Invalid CreatorVerse member count.');
      }
      memberCounts.set(item.page_id, count);
    }
  }

  const pages = visibleRows.map(row => {
    const count = memberCounts.get(row.id);
    if (count === undefined) {
      throw new CreatorVerseError(503, 'CreatorVerse member count is unavailable.');
    }
    return { ...publicPage(row), member_count: count };
  });

  return {
    pages,
    nextOffset: rows.length > limit ? offset + limit : null
  };
}
export async function readPublicPage(client: SupabaseClient, id: string, offset = 0, targetPostId: string | null = null): Promise<PageResult> {
  pageId(id);
  const { data, error } = await client.from('creatorverse_pages').select(columns).eq('id', id).eq('status', 'active').maybeSingle();
  if (error) throw new CreatorVerseError(503, 'CreatorVerse is temporarily unavailable.');
  if (!data) throw new CreatorVerseError(404, 'This page is not available.');
  const postQuery = client.from('creatorverse_posts')
    .select('id,page_id,content,created_at,comments_enabled')
    .eq('page_id', id)
    .eq('status', 'published');

  const result = targetPostId
    ? await postQuery.eq('id', targetPostId).limit(1)
    : await postQuery.order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + 20);
  if (result.error) throw new CreatorVerseError(503, 'Posts are temporarily unavailable.');
  const rows = result.data ?? [];
  const posts: CreatorVersePost[] = rows.slice(0, 20).map(post => ({
    id: post.id,
    page_id: post.page_id,
    content: post.content,
    created_at: post.created_at,
    comments_enabled: post.comments_enabled,
    media: [],
  }));

  if (
    process.env.CREATORVERSE_POST_MEDIA_READ_ENABLED === 'true' &&
    communityServerTargetAllowed() && creatorVerseEnabled() &&
    posts.length > 0
  ) {
    try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error('Media server configuration unavailable.');
    }

    const mediaClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const mediaResult = await mediaClient
      .from('creatorverse_media')
      .select('id,post_id,media_type,display_order')
      .eq('page_id', id)
      .eq('purpose', 'post')
      .eq('verification', 'verified')
      .in('post_id', posts.map(post => post.id))
      .order('display_order', { ascending: true });

    if (mediaResult.error) {
      throw new CreatorVerseError(
        503,
        'Published media is temporarily unavailable.'
      );
    }

    const byPost = new Map(posts.map(post => [post.id, post]));

    for (const item of mediaResult.data ?? []) {
      const post = byPost.get(item.post_id);

      if (
        !post ||
        typeof item.id !== 'string' ||
        (item.media_type !== 'image' && item.media_type !== 'video') ||
        !Number.isInteger(item.display_order)
      ) continue;

      post.media.push({
        id: item.id,
        media_type: item.media_type,
        display_order: item.display_order,
      });
    }
    } catch {
      console.warn('[CreatorVerse] Published media retrieval failed.');
    }
  }

  return { page: publicPage(data), posts, nextPostsOffset: !targetPostId && rows.length > 20 ? offset + 20 : null };
}

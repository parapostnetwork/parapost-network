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
  return { pages: rows.slice(0, limit).map(publicPage), nextOffset: rows.length > limit ? offset + limit : null };
}
export async function readPublicPage(client: SupabaseClient, id: string): Promise<PageResult> {
  pageId(id);
  const { data, error } = await client.from('creatorverse_pages').select(columns).eq('id', id).eq('status', 'active').maybeSingle();
  if (error) throw new CreatorVerseError(503, 'CreatorVerse is temporarily unavailable.');
  if (!data) throw new CreatorVerseError(404, 'This page is not available.');
  const result = await client.from('creatorverse_posts').select('id,page_id,content,created_at,comments_enabled')
    .eq('page_id', id).eq('status', 'published').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(20);
  if (result.error) throw new CreatorVerseError(503, 'Posts are temporarily unavailable.');
  const posts: CreatorVersePost[] = (result.data ?? []).map(post => ({
    id: post.id, page_id: post.page_id, content: post.content, created_at: post.created_at, comments_enabled: post.comments_enabled,
  }));
  return { page: publicPage(data), posts };
}

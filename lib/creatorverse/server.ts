import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { creatorVerseEnabled } from './config';
import { CreatorVerseError } from './permissions';
import { pageId } from './validation';
import type { PagePermissions } from './types';
export const creatorVerseHeaders = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff' };
export async function creatorVerseClient(request?: Request): Promise<{ client: SupabaseClient; userId: string | null }> {
  if (!creatorVerseEnabled()) throw new CreatorVerseError(404, 'CreatorVerse is not available yet.');
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new CreatorVerseError(503, 'CreatorVerse is temporarily unavailable.');
  const authorization = request?.headers.get('authorization');
  if (authorization !== null && authorization !== undefined && (!/^Bearer \S+$/.test(authorization) || authorization.length > 8192)) {
    throw new CreatorVerseError(401, 'Sign in again to continue.');
  }
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    global: { headers: authorization ? { Authorization: authorization } : {} },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  if (!authorization) return { client, userId: null };
  const { data, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new CreatorVerseError(401, 'Sign in again to continue.');
  return { client, userId: data.user.id };
}
export async function pagePermissions(client: SupabaseClient, id: string): Promise<PagePermissions> {
  pageId(id);
  const { data, error } = await client.rpc('creatorverse_page_access', { p_page_id: id });
  if (error) throw new CreatorVerseError(503, 'CreatorVerse is temporarily unavailable.');
  // A malformed response cannot grant access. Identity is derived inside the database from auth.uid().
  return { can_manage: data?.can_manage === true, can_publish: data?.can_manage === true && data?.can_publish === true };
}
/** For later write handlers: never authorize from submitted owner IDs, follows or user_metadata. */
export async function requireCreatorVerseOwner(request: Request, id: string, publish = false) {
  pageId(id);
  const context = await creatorVerseClient(request);
  if (!context.userId) throw new CreatorVerseError(401, 'Sign in to continue.');
  const permissions = await pagePermissions(context.client, id);
  if (!(publish ? permissions.can_publish : permissions.can_manage)) throw new CreatorVerseError(403, 'This action is not available.');
  return context;
}
export function creatorVerseErrorResponse(error: unknown): Response {
  const known = error instanceof CreatorVerseError;
  return Response.json({ error: known ? error.message : 'The request could not be completed.' }, {
    status: known ? error.status : 400, headers: creatorVerseHeaders,
  });
}

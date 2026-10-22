import { createClient } from '@supabase/supabase-js';
import { groupsServerEnabled } from './config';
export const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization' };
export async function groupClient(request: Request) {
  if (!groupsServerEnabled()) throw new Response('Groups unavailable', { status: 404, headers: privateHeaders });
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ') || authorization.length > 8192) throw new Response('Sign in to continue', { status: 401 });
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new Response('Sign in to continue', { status: 401, headers: privateHeaders });
  const availability = await client.rpc('groups_available');
  if (availability.error || availability.data !== true) throw new Response('Groups unavailable', { status: 404, headers: privateHeaders });
  return client;
}
export function groupError(error: unknown) {
  if (error instanceof Response) return error;
  // Do not reflect SQL, storage internals, credentials, or private resource existence.
  return Response.json({ error: 'This action could not be completed. Refresh and check your access and input.' }, { status: 400, headers: privateHeaders });
}

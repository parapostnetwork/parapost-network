import { communityServerTargetAllowed } from '@/lib/community/release-target';
import { createClient } from '@supabase/supabase-js';
import {
  creatorVerseClient,
  creatorVerseErrorResponse,
  creatorVerseHeaders,
} from '@/lib/creatorverse/server';
import { CreatorVerseError } from '@/lib/creatorverse/permissions';
import { pageId } from '@/lib/creatorverse/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// This endpoint marks an owned CreatorVerse page as deleted; it does not
// physically purge media from Storage or remove historical share records.
// The configured CreatorVerse staging environment is enforced by
// creatorVerseClient() before any privileged database client is created.
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const id = pageId((await context.params).id);
    const { userId } = await creatorVerseClient(request);

    if (!userId) {
      throw new CreatorVerseError(401, 'Sign in to delete your page.');
    }

    if (!request.headers.get('content-type')
      ?.toLowerCase().startsWith('application/json')) {
      throw new CreatorVerseError(415, 'JSON request required.');
    }

    const raw = await request.text();

    if (new TextEncoder().encode(raw).byteLength > 1024) {
      throw new CreatorVerseError(413, 'Confirmation is too large.');
    }

    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new CreatorVerseError(400, 'Invalid confirmation.');
    }

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new CreatorVerseError(400, 'Invalid confirmation.');
    }

    const fields = input as Record<string, unknown>;
    const keys = Object.keys(fields);
    const confirmName = fields.confirmName;

    if (
      keys.length !== 1 || keys[0] !== 'confirmName' ||
      typeof confirmName !== 'string' || confirmName.length < 3 ||
      confirmName.length > 100
    ) {
      throw new CreatorVerseError(400, 'Type the page name to confirm.');
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (
      !url || !communityServerTargetAllowed(url) ||
      !serviceKey
    ) {
      throw new CreatorVerseError(503, 'Page deletion is not available in this environment.');
    }

    const admin = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    // Atomic, row-filtered mutation. Client-provided owner IDs/statuses
    // are never trusted. Mismatched names, non-owners and inactive pages
    // cannot be modified. No user/profile account is deleted.
    const { data, error } = await admin
      .from('creatorverse_pages')
      .update({ status: 'deleted' })
      .eq('id', id)
      .eq('owner_id', userId)
      .eq('name', confirmName)
      .in('status', ['active', 'draft'])
      .select('id')
      .maybeSingle();

    if (error) {
      throw new CreatorVerseError(503, 'Unable to delete this page right now.');
    }

    if (!data || data.id !== id) {
      throw new CreatorVerseError(403, 'Page deletion is not permitted or the name did not match.');
    }

    return Response.json(
      { page: { id, status: 'deleted' } },
      { headers: creatorVerseHeaders }
    );
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}

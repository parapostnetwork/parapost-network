import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { communityServerTargetAllowed } from '@/lib/community/release-target';
import {
  creatorVerseClient,
  creatorVerseHeaders,
  creatorVerseErrorResponse,
  pagePermissions,
} from '@/lib/creatorverse/server';
import { CreatorVerseError } from '@/lib/creatorverse/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    if (!communityServerTargetAllowed()) {
      throw new CreatorVerseError(503, 'CreatorVerse unavailable.');
    }

    const { client, userId } = await creatorVerseClient(request);

    if (!userId) {
      throw new CreatorVerseError(401, 'Sign in to continue.');
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new CreatorVerseError(503, 'CreatorVerse unavailable.');
    }

    const admin = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await admin
      .from('creatorverse_pages')
      .select('id,name')
      .eq('owner_id', userId)
      .eq('status', 'active')
      .order('name', { ascending: true })
      .limit(100);

    if (error || !data) {
      throw new CreatorVerseError(503, 'Could not load your pages.');
    }

    const pages: { id: string; name: string }[] = [];

    for (const page of data) {
      const permissions = await pagePermissions(client, page.id);

      if (permissions.can_publish) {
        pages.push({ id: page.id, name: page.name });
      }
    }

    return Response.json(
      { pages },
      { headers: creatorVerseHeaders }
    );
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}

import { communityServerTargetAllowed } from '@/lib/community/release-target';
import { createClient } from '@supabase/supabase-js';
import { creatorVerseClient, creatorVerseErrorResponse, creatorVerseHeaders } from '@/lib/creatorverse/server';
import { CreatorVerseError } from '@/lib/creatorverse/permissions';
import { pageId } from '@/lib/creatorverse/validation';

export const dynamic = 'force-dynamic';

/** Recovery reads only. All mutations continue through the existing authorized routes. */
export async function GET(request: Request) {
  try {
    const { client, userId } = await creatorVerseClient(request);
    if (!userId) throw new CreatorVerseError(401, 'Sign in to recover your page.');
    const rawId = new URL(request.url).searchParams.get('id');
    const id = rawId ? pageId(rawId) : null;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !communityServerTargetAllowed(url) || !key) {
      throw new CreatorVerseError(503, 'Page recovery is unavailable in this environment.');
    }
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    // Identity comes exclusively from verified authentication, never request input.
    let query = admin.from('creatorverse_pages')
      .select('id,status,name,category,short_bio,description,website,public_email,location,social_links')
      .eq('owner_id', userId);
    query = id ? query.eq('id', id).in('status', ['draft', 'active']) : query.eq('status', 'draft');
    const { data, error } = await query.order('created_at', { ascending: false }).limit(101);
    if (error) throw new CreatorVerseError(503, 'Unable to read unfinished pages. Please retry.');
    if (data.length > 100) throw new CreatorVerseError(409, 'Too many unfinished pages to recover automatically. Contact support.');
    if (id && data.length !== 1) throw new CreatorVerseError(404, 'This page is not available to your account.');
    const pages = [];
    for (const row of data) {
      const permission = await client.rpc('creatorverse_details_can_edit', { p_page_id: row.id });
      if (permission.error) throw new CreatorVerseError(503, 'Page permissions could not be checked.');
      if (permission.data !== true) throw new CreatorVerseError(403, 'Page recovery is not permitted.');
      const media = await admin.from('creatorverse_media').select('id,purpose,verification')
        .eq('page_id', row.id).is('post_id', null).eq('media_type', 'image')
        .in('purpose', ['logo', 'cover']).in('verification', ['pending', 'verified']);
      if (media.error) throw new CreatorVerseError(503, 'Saved images could not be checked.');
      const { id: pageIdentifier, status, ...fields } = row;
      pages.push({ id: pageIdentifier, status, fields,
        images: {
          logo: media.data.some(item => item.purpose === 'logo' && item.verification === 'verified'),
          cover: media.data.some(item => item.purpose === 'cover' && item.verification === 'verified'),
        },
        pending: media.data.filter(item => item.verification === 'pending')
          .map(item => ({ id: item.id, purpose: item.purpose })),
      });
    }
    return Response.json({ pages }, { headers: creatorVerseHeaders });
  } catch (error) { return creatorVerseErrorResponse(error); }
}

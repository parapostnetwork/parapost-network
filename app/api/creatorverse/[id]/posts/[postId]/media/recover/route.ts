import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { communityServerTargetAllowed } from '@/lib/community/release-target';
import {
  requireCreatorVerseOwner,
  creatorVerseErrorResponse,
  creatorVerseHeaders,
} from '@/lib/creatorverse/server';
import { CreatorVerseError } from '@/lib/creatorverse/permissions';
import { pageId } from '@/lib/creatorverse/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; postId: string }> }
): Promise<Response> {
  try {
    if (!communityServerTargetAllowed() ||
        process.env.CREATORVERSE_POST_WRITES_ENABLED !== 'true' ||
        process.env.CREATORVERSE_POST_MEDIA_UPLOADS_ENABLED !== 'true') {
      throw new CreatorVerseError(503, 'Upload recovery unavailable.');
    }

    const params = await context.params;
    const id = pageId(params.id);
    const postId = pageId(params.postId);
    const { userId } = await requireCreatorVerseOwner(request, id);

    if (!userId) {
      throw new CreatorVerseError(401, 'Sign in to continue.');
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new CreatorVerseError(503, 'Upload recovery unavailable.');
    }

    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: post, error: postError } = await admin
      .from('creatorverse_posts')
      .select('id')
      .eq('id', postId)
      .eq('page_id', id)
      .eq('author_id', userId)
      .eq('status', 'draft')
      .maybeSingle();

    if (postError || !post) {
      throw new CreatorVerseError(403, 'Unpublished post unavailable.');
    }

    const { data: media, error } = await admin
      .from('creatorverse_media')
      .select('id,display_order,verification,mime_type')
      .eq('page_id', id)
      .eq('post_id', postId)
      .eq('purpose', 'post')
      .in('verification', ['pending', 'verified']);

    if (error || !media || media.length > 4) {
      throw new CreatorVerseError(409, 'Upload recovery not confirmed.');
    }

    for (const item of media) {
      if (item.verification !== 'pending') continue;

      const { data, error } = await admin.rpc(
        'creatorverse_cancel_post_media',
        {
          p_page_id: id,
          p_post_id: postId,
          p_media_id: item.id,
          p_owner_id: userId,
        }
      );

      if (error || data !== true) {
        throw new CreatorVerseError(409, 'Please retry upload recovery.');
      }
    }

    return Response.json({
      verified: media
        .filter(item => item.verification === 'verified')
        .map(item => ({
          id: item.id,
          order: item.display_order,
          mimeType: item.mime_type,
        })),
    }, { headers: creatorVerseHeaders });
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}

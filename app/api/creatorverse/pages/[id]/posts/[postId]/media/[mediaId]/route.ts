import { createClient } from '@supabase/supabase-js';
import { pageId } from '@/lib/creatorverse/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = {
  params: Promise<{
    id: string;
    postId: string;
    mediaId: string;
  }>;
};

const formats: Record<string, {
  extension: string;
  maxBytes: number;
}> = {
  'image/jpeg': { extension: 'jpg', maxBytes: 15 * 1024 * 1024 },
  'image/png': { extension: 'png', maxBytes: 15 * 1024 * 1024 },
  'image/webp': { extension: 'webp', maxBytes: 15 * 1024 * 1024 },
  'video/mp4': { extension: 'mp4', maxBytes: 100 * 1024 * 1024 },
  'video/webm': { extension: 'webm', maxBytes: 100 * 1024 * 1024 },
};

const unavailable = () => new Response(null, {
  status: 404,
  headers: { 'Cache-Control': 'no-store' },
});

async function serve(
  request: Request,
  context: Context
): Promise<Response> {
  let id: string;
  let postId: string;
  let mediaId: string;

  try {
    const params = await context.params;
    id = pageId(params.id).toLowerCase();
    postId = pageId(params.postId).toLowerCase();
    mediaId = pageId(params.mediaId).toLowerCase();
  } catch {
    return unavailable();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    process.env.CREATORVERSE_POST_MEDIA_READ_ENABLED !== 'true' ||
    url !== 'https://vmgelrgrtpghmvqgufzz.supabase.co' ||
    !key
  ) {
    return unavailable();
  }

  try {
    const admin = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: page, error: pageError } = await admin
      .from('creatorverse_pages')
      .select('id')
      .eq('id', id)
      .eq('status', 'active')
      .maybeSingle();

    if (pageError || !page) return unavailable();

    const { data: post, error: postError } = await admin
      .from('creatorverse_posts')
      .select('id')
      .eq('id', postId)
      .eq('page_id', id)
      .eq('status', 'published')
      .maybeSingle();

    if (postError || !post) return unavailable();

    const { data: media, error: mediaError } = await admin
      .from('creatorverse_media')
      .select('id,storage_path,mime_type,byte_size')
      .eq('id', mediaId)
      .eq('page_id', id)
      .eq('post_id', postId)
      .eq('purpose', 'post')
      .eq('verification', 'verified')
      .maybeSingle();

    if (mediaError || !media) return unavailable();

    const format = formats[media.mime_type];

    if (!format) return unavailable();

    const expectedPath =
      `${id}/${postId}/${mediaId}.${format.extension}`;

    if (
      media.storage_path !== expectedPath ||
      typeof media.byte_size !== 'number' ||
      media.byte_size < 16 ||
      media.byte_size > format.maxBytes
    ) {
      return unavailable();
    }

    const headers = {
      'Content-Type': media.mime_type as string,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'Accept-Ranges': 'none',
    };

    if (request.method === 'HEAD') {
      return new Response(null, { status: 200, headers });
    }

    const { data: blob, error: downloadError } =
      await admin.storage
        .from('creatorverse-media')
        .download(expectedPath);

    if (
      downloadError ||
      !blob ||
      blob.size !== media.byte_size ||
      blob.size > format.maxBytes
    ) {
      return unavailable();
    }

    return new Response(await blob.arrayBuffer(), {
      status: 200,
      headers: {
        ...headers,
        'Content-Length': String(blob.size),
      },
    });
  } catch {
    return unavailable();
  }
}

export async function GET(
  request: Request,
  context: Context
): Promise<Response> {
  return serve(request, context);
}

export async function HEAD(
  request: Request,
  context: Context
): Promise<Response> {
  return serve(request, context);
}

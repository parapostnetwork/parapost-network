import { createClient } from '@supabase/supabase-js';
import { pageId } from '@/lib/creatorverse/validation';
import { PAGE_IMAGE_FORMATS } from '@/lib/creatorverse/page-image-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = {
  params: Promise<{ id: string; purpose: string }>;
};

const unavailable = () => new Response(null, {
  status: 404,
  headers: { 'Cache-Control': 'no-store' },
});

async function serveImage(
  request: Request,
  context: Context
): Promise<Response> {
  const { id: rawId, purpose } = await context.params;

  if (purpose !== 'logo' && purpose !== 'cover') {
    return unavailable();
  }

  let id: string;
  try {
    id = pageId(rawId).toLowerCase();
  } catch {
    return unavailable();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    process.env.CREATORVERSE_PAGE_IMAGES_ENABLED !== 'true' ||
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

    const { data: media, error: mediaError } = await admin
      .from('creatorverse_media')
      .select('id,storage_path,mime_type')
      .eq('page_id', id)
      .is('post_id', null)
      .eq('purpose', purpose)
      .eq('media_type', 'image')
      .eq('verification', 'verified')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (mediaError || !media) return unavailable();

    const format = PAGE_IMAGE_FORMATS[
      media.mime_type as keyof typeof PAGE_IMAGE_FORMATS
    ];

    if (!format) return unavailable();

    const expectedPath =
      `${id}/${purpose}/${media.id}.${format.extension}`;

    if (media.storage_path !== expectedPath) {
      return unavailable();
    }

    if (request.method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: {
          'Content-Type': media.mime_type,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const { data: blob, error: downloadError } =
      await admin.storage
        .from('creatorverse-media')
        .download(expectedPath);

    if (
      downloadError ||
      !blob ||
      blob.size < 16 ||
      blob.size > format.maxBytes
    ) {
      return unavailable();
    }

    return new Response(await blob.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': media.mime_type,
        'Content-Length': String(blob.size),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
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
  return serveImage(request, context);
}

export async function HEAD(
  request: Request,
  context: Context
): Promise<Response> {
  return serveImage(request, context);
}

import { createClient } from '@supabase/supabase-js';
import { readDirectory } from '@/lib/creatorverse/read';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (
    process.env.NODE_ENV !== 'development' ||
    url !== 'https://vmgelrgrtpghmvqgufzz.supabase.co' ||
    !key
  ) {
    return new Response(null, { status: 404 });
  }

  try {
    const client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const params = new URL(request.url).searchParams;
    const result = await readDirectory(client, params);

    return Response.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json(
      { error: 'Unable to load CreatorVerse pages.' },
      { status: 503 }
    );
  }
}

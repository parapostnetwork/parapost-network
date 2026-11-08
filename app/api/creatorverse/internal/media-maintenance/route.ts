import { timingSafeEqual } from 'node:crypto';
import {
  runCreatorVerseMediaCleanupBatch,
} from '@/lib/creatorverse/media-cleanup-worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function maintenanceApproved(): boolean {
  // Independent hard lock: remains disabled.
  return false;
}

function authorized(request: Request): boolean {
  const secret =
    process.env.CREATORVERSE_MEDIA_MAINTENANCE_SECRET;

  if (!secret || secret.length < 32) return false;

  const header = request.headers.get('authorization');

  if (!header?.startsWith('Bearer ')) return false;

  const received = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);

  return received.length === expected.length &&
    timingSafeEqual(received, expected);
}

export async function POST(request: Request): Promise<Response> {
  if (!maintenanceApproved()) {
    return Response.json(
      { error: 'CreatorVerse maintenance is disabled.' },
      { status: 503, headers }
    );
  }

  if (!authorized(request)) {
    return Response.json(
      { error: 'Unauthorized.' },
      { status: 401, headers }
    );
  }

  try {
    const result = await runCreatorVerseMediaCleanupBatch();

    return Response.json(
      { ok: true, ...result },
      { status: 200, headers }
    );
  } catch {
    return Response.json(
      { error: 'Media maintenance failed.' },
      { status: 503, headers }
    );
  }
}

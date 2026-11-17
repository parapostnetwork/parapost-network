import { creatorVerseClient, creatorVerseErrorResponse, creatorVerseHeaders } from '@/lib/creatorverse/server';
import { readDirectory, readPublicPage } from '@/lib/creatorverse/read';
import { CreatorVerseError } from '@/lib/creatorverse/permissions';
export const dynamic = 'force-dynamic';
/** Phase 1 is read-only. Next returns 405 for unsupported write methods. */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const { client } = await creatorVerseClient(request);
    const id = params.get('page');
    const rawOffset = params.get('posts_offset') ?? '0';
    if (id !== null && (
      !/^(0|[1-9][0-9]*)$/.test(rawOffset) ||
      !Number.isSafeInteger(Number(rawOffset)) ||
      Number(rawOffset) > 100000 ||
      Number(rawOffset) % 20 !== 0
    )) {
      throw new CreatorVerseError(400, 'Invalid posts offset.');
    }
    const data = id !== null
      ? await readPublicPage(client, id, Number(rawOffset))
      : await readDirectory(client, params);
    return Response.json(data, { headers: creatorVerseHeaders });
  } catch (error) { return creatorVerseErrorResponse(error); }
}

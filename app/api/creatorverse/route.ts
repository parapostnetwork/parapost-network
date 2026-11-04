import { creatorVerseClient, creatorVerseErrorResponse, creatorVerseHeaders } from '@/lib/creatorverse/server';
import { readDirectory, readPublicPage } from '@/lib/creatorverse/read';
export const dynamic = 'force-dynamic';
/** Phase 1 is read-only. Next returns 405 for unsupported write methods. */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const { client } = await creatorVerseClient(request);
    const id = params.get('page');
    const data = id !== null ? await readPublicPage(client, id) : await readDirectory(client, params);
    return Response.json(data, { headers: creatorVerseHeaders });
  } catch (error) { return creatorVerseErrorResponse(error); }
}

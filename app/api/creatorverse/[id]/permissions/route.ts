import { creatorVerseClient, creatorVerseErrorResponse, creatorVerseHeaders, pagePermissions } from '@/lib/creatorverse/server';
import { CreatorVerseError } from '@/lib/creatorverse/permissions';
import { pageId } from '@/lib/creatorverse/validation';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = pageId((await context.params).id);
    const { client, userId } = await creatorVerseClient(request);
    if (!userId) throw new CreatorVerseError(401, 'Sign in to continue.');
    return Response.json(await pagePermissions(client, id), { headers: creatorVerseHeaders });
  } catch (error) { return creatorVerseErrorResponse(error); }
}

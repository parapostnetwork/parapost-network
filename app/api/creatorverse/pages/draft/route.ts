import { creatorVerseClient, creatorVerseErrorResponse, creatorVerseHeaders } from '@/lib/creatorverse/server';
import { CreatorVerseError } from '@/lib/creatorverse/permissions';
import { pageId } from '@/lib/creatorverse/validation';

export const dynamic = 'force-dynamic';

const categories = new Set([
  'business', 'creator', 'investigation_team', 'podcast',
  'entertainment', 'organization', 'community_project', 'other',
]);

export async function POST(request: Request) {
  try {
    const { client, userId } = await creatorVerseClient(request);
    if (!userId) throw new CreatorVerseError(401, 'Sign in to continue.');

    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      throw new CreatorVerseError(415, 'JSON required.');
    }

    const text = await request.text();
    if (text.length > 8000) {
      throw new CreatorVerseError(413, 'Page details too large.');
    }

    let input: unknown;
    try {
      input = JSON.parse(text);
    } catch {
      throw new CreatorVerseError(400, 'Invalid page details.');
    }

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new CreatorVerseError(400, 'Invalid page details.');
    }

    const fields = input as Record<string, unknown>;

    const name = typeof fields.name === 'string' ? fields.name.trim() : '';
    const category = fields.category;
    const bio = fields.short_bio === undefined ? '' : fields.short_bio;
    const description = fields.description === undefined ? '' : fields.description;

    if (
      name.length < 3 || name.length > 100 ||
      typeof category !== 'string' || !categories.has(category) ||
      typeof bio !== 'string' || bio.length > 240 ||
      typeof description !== 'string' || description.length > 5000
    ) {
      throw new CreatorVerseError(400, 'Invalid page details.');
    }

    const { data, error } = await client.rpc(
      'creatorverse_create_page_draft',
      {
        p_name: name,
        p_category: category,
        p_short_bio: bio,
        p_description: description,
      }
    );

    if (error || !data) {
      throw new CreatorVerseError(503, 'Page creation is not enabled yet.');
    }

    return Response.json(
      { page: { id: pageId(data) } },
      { status: 201, headers: creatorVerseHeaders }
    );
  } catch (error) {
    return creatorVerseErrorResponse(error);
  }
}

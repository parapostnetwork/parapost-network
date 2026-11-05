import { handleCreatorVersePostDraft } from '@/lib/creatorverse/post-action-handlers';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return handleCreatorVersePostDraft(request, id);
}

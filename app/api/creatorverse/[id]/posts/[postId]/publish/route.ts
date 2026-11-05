import { handleCreatorVersePostPublish } from '@/lib/creatorverse/post-action-handlers';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; postId: string }> }
) {
  const { id, postId } = await context.params;
  return handleCreatorVersePostPublish(request, id, postId);
}

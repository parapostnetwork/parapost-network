import 'server-only';

import { requireCreatorVerseOwner } from './server';
import { CreatorVerseError } from './permissions';
import { pageId } from './validation';

/**
 * Hard-locked local implementation.
 *
 * Do not enable until database policies, rate limiting,
 * publication validation and media verification are approved.
 */
function postDraftsApproved(): boolean {
  // Independent draft lock.
  // Keep disabled until authenticated database permissions,
  // rate limiting, and staging tests are approved.
  return process.env.CREATORVERSE_POST_WRITES_ENABLED === 'true';
}

function postPublishingApproved(): boolean {
  // Separate publication lock.
  // Verified media and publication checks are required.
  return process.env.CREATORVERSE_POST_WRITES_ENABLED === 'true';
}

function validatePostContent(input: unknown): string {
  if (typeof input !== 'string') {
    throw new CreatorVerseError(400, 'Invalid post content.');
  }

  const content = input.trim();

  if (
    !content ||
    content.length > 5000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content)
  ) {
    throw new CreatorVerseError(
      400,
      'Post text must contain 1 to 5,000 valid characters.'
    );
  }

  return content;
}

/** Text-only draft preparation; media-only posts come later. */
export async function createCreatorVersePostDraft(
  request: Request,
  pageIdentifier: string,
  submittedContent: unknown
): Promise<{ id: string }> {
  if (!postDraftsApproved()) {
    throw new CreatorVerseError(
      503,
      'CreatorVerse post saving is not enabled yet.'
    );
  }

  const validatedPageId = pageId(pageIdentifier);
  const content = validatePostContent(submittedContent);

  const { client, userId } = await requireCreatorVerseOwner(
    request,
    validatedPageId
  );

  if (!userId) {
    throw new CreatorVerseError(401, 'Sign in to continue.');
  }

  const { data, error } = await client.rpc(
    'creatorverse_create_post_draft',
    {
      p_page_id: validatedPageId,
      p_content: content,
    }
  );

  if (error || !data) {
    throw new CreatorVerseError(503, 'Unable to create post draft.');
  }

  return { id: pageId(data) };
}

/** Only the verified page owner may publish an existing draft. */
export async function publishCreatorVersePost(
  request: Request,
  pageIdentifier: string,
  postIdentifier: string
): Promise<{ id: string }> {
  if (!postPublishingApproved()) {
    throw new CreatorVerseError(
      503,
      'CreatorVerse publishing is not enabled yet.'
    );
  }

  const validatedPageId = pageId(pageIdentifier);
  const validatedPostId = pageId(postIdentifier);

  const { client, userId } = await requireCreatorVerseOwner(
    request,
    validatedPageId,
    true
  );

  if (!userId) {
    throw new CreatorVerseError(401, 'Sign in to continue.');
  }

  // Future public RPC contract. Not installed or enabled.
  // Database-side ownership, draft and media checks are required.
  const { data, error } = await client.rpc(
    'creatorverse_publish_post',
    {
      p_page_id: validatedPageId,
      p_post_id: validatedPostId,
    }
  );

  if (error) {
    throw new CreatorVerseError(503, 'Unable to publish post.');
  }

  if (data !== validatedPostId) {
    throw new CreatorVerseError(
      503,
      'Publication could not be verified.'
    );
  }

  return { id: validatedPostId };
}

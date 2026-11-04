import 'server-only';

import { CreatorVerseError } from './permissions';
import { validatePageFields } from './validation';
import type { PageFields } from './types';

const MAX_BODY_BYTES = 64 * 1024;

const editableFields = new Set([
  'name',
  'category',
  'short_bio',
  'description',
  'website',
  'social_links',
  'public_email',
  'location',
]);

/**
 * Parse a future CreatorVerse create/edit request.
 *
 * This does not authorize a user or write to the database.
 * Authentication and ownership checks are separate requirements.
 */
export async function parseCreatorVersePageRequest(
  request: Request
): Promise<PageFields> {
  const contentType = request.headers.get('content-type') ?? '';

  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType.trim())) {
    throw new CreatorVerseError(415, 'JSON content is required.');
  }

  const declaredLength = request.headers.get('content-length');

  if (declaredLength !== null &&
      (!/^\d+$/.test(declaredLength) ||
       Number(declaredLength) > MAX_BODY_BYTES)) {
    throw new CreatorVerseError(413, 'Page information is too large.');
  }

  const reader = request.body?.getReader();

  if (!reader) {
    throw new CreatorVerseError(400, 'Page information is required.');
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  let body = '';
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > MAX_BODY_BYTES) {
        throw new CreatorVerseError(
          413,
          'Page information is too large.'
        );
      }

      body += decoder.decode(value, { stream: true });
    }

    body += decoder.decode();
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // The connection may already be closed.
    }

    if (error instanceof CreatorVerseError) throw error;

    throw new CreatorVerseError(400, 'Invalid page information.');
  } finally {
    reader.releaseLock();
  }

  let input: unknown;

  try {
    input = JSON.parse(body);
  } catch {
    throw new CreatorVerseError(400, 'Invalid JSON.');
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CreatorVerseError(400, 'Invalid page information.');
  }

  const submitted = input as Record<string, unknown>;

  if (Object.keys(submitted).some(key => !editableFields.has(key))) {
    throw new CreatorVerseError(
      400,
      'Unsupported page field.'
    );
  }

  try {
    return validatePageFields(submitted);
  } catch {
    throw new CreatorVerseError(
      400,
      'Please check the page details and links.'
    );
  }
}

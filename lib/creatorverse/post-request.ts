import 'server-only';

import { CreatorVerseError } from './permissions';

const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_TEXT_LENGTH = 5000;

export async function parseCreatorVersePostRequest(
  request: Request
): Promise<{ content: string }> {
  if (request.method !== 'POST') {
    throw new CreatorVerseError(405, 'Method not allowed.');
  }

  const type = request.headers.get('content-type') ?? '';

  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type)) {
    throw new CreatorVerseError(
      415,
      'Use application/json.'
    );
  }

  const length = request.headers.get('content-length');

  if (length !== null) {
    if (!/^\d+$/.test(length)) {
      throw new CreatorVerseError(400, 'Invalid request size.');
    }

    if (Number(length) > MAX_REQUEST_BYTES) {
      throw new CreatorVerseError(413, 'Request too large.');
    }
  }

  if (!request.body) {
    throw new CreatorVerseError(400, 'Missing request body.');
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      total += value.byteLength;

      if (total > MAX_REQUEST_BYTES) {
        throw new CreatorVerseError(413, 'Request too large.');
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let decoded: string;

  try {
    decoded = new TextDecoder('utf-8', {
      fatal: true,
    }).decode(bytes);
  } catch {
    throw new CreatorVerseError(400, 'Invalid text encoding.');
  }

  let submitted: unknown;

  try {
    submitted = JSON.parse(decoded);
  } catch {
    throw new CreatorVerseError(400, 'Invalid JSON.');
  }

  if (
    !submitted ||
    typeof submitted !== 'object' ||
    Array.isArray(submitted)
  ) {
    throw new CreatorVerseError(
      400,
      'Invalid post information.'
    );
  }

  const fields = submitted as Record<string, unknown>;

  if (
    Object.keys(fields).length !== 1 ||
    !Object.hasOwn(fields, 'content')
  ) {
    throw new CreatorVerseError(
      400,
      'Only post content is accepted.'
    );
  }

  if (typeof fields.content !== 'string') {
    throw new CreatorVerseError(400, 'Invalid post content.');
  }

  const content = fields.content.trim();

  if (
    !content ||
    content.length > MAX_TEXT_LENGTH ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content)
  ) {
    throw new CreatorVerseError(
      400,
      'Post text must contain 1 to 5,000 valid characters.'
    );
  }

  return { content };
}

import { CreatorVerseError } from './permissions';

export type CreatorVersePageImagePurpose = 'logo' | 'cover';

export const PAGE_IMAGE_FORMATS = {
  'image/jpeg': { extension: 'jpg', maxBytes: 8388608 },
  'image/png': { extension: 'png', maxBytes: 8388608 },
  'image/webp': { extension: 'webp', maxBytes: 8388608 },
} as const;

/**
 * Checks image magic bytes, not the filename or browser MIME claim.
 * A trusted server must still decode and inspect the complete image
 * before marking uploaded media as verified.
 */
export function matchesPageImageSignature(
  mimeType: string,
  bytes: Uint8Array
): boolean {
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff;
  }

  if (mimeType === 'image/png') {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];

    return bytes.length >= signature.length &&
      signature.every((value, index) => bytes[index] === value);
  }

  if (mimeType === 'image/webp') {
    const riff = [82, 73, 70, 70];
    const webp = [87, 69, 66, 80];

    return bytes.length >= 12 &&
      riff.every((value, index) => bytes[index] === value) &&
      webp.every((value, index) => bytes[index + 8] === value);
  }

  return false;
}

export function validatePageImageRequest(input: unknown): {
  purpose: CreatorVersePageImagePurpose;
  mimeType: keyof typeof PAGE_IMAGE_FORMATS;
  byteSize: number;
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CreatorVerseError(400, 'Invalid page image request.');
  }

  const record = input as Record<string, unknown>;

  const keys = Object.keys(record);

  if (
    keys.length !== 3 ||
    !['purpose', 'mimeType', 'byteSize'].every(key =>
      Object.hasOwn(record, key)
    )
  ) {
    throw new CreatorVerseError(400, 'Invalid page image fields.');
  }

  if (record.purpose !== 'logo' && record.purpose !== 'cover') {
    throw new CreatorVerseError(400, 'Invalid page image purpose.');
  }

  if (
    typeof record.mimeType !== 'string' ||
    !Object.hasOwn(PAGE_IMAGE_FORMATS, record.mimeType)
  ) {
    throw new CreatorVerseError(400, 'Unsupported image format.');
  }

  const mimeType =
    record.mimeType as keyof typeof PAGE_IMAGE_FORMATS;

  if (
    typeof record.byteSize !== 'number' ||
    !Number.isSafeInteger(record.byteSize) ||
    record.byteSize < 1 ||
    record.byteSize > PAGE_IMAGE_FORMATS[mimeType].maxBytes
  ) {
    throw new CreatorVerseError(400, 'Invalid page image size.');
  }

  return {
    purpose: record.purpose,
    mimeType,
    byteSize: record.byteSize,
  };
}

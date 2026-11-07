import "server-only";

/**
 * Preliminary file-envelope validation only.
 * A trusted decoder/probe must inspect the stored object
 * before the media can be marked verified.
 */

type MediaKind = "image" | "video";

type MediaRule = {
  kind: MediaKind;
  maxBytes: number;
};

const rules: Record<string, MediaRule> = {
  "image/jpeg": { kind: "image", maxBytes: 8 * 1024 * 1024 },
  "image/png": { kind: "image", maxBytes: 8 * 1024 * 1024 },
  "image/webp": { kind: "image", maxBytes: 8 * 1024 * 1024 },
  "video/mp4": { kind: "video", maxBytes: 32 * 1024 * 1024 },
  "video/webm": { kind: "video", maxBytes: 32 * 1024 * 1024 },
};

function matchesBytes(
  bytes: Uint8Array,
  expected: readonly number[],
  offset = 0
): boolean {
  return (
    bytes.length >= offset + expected.length &&
    expected.every(
      (value, index) => bytes[offset + index] === value
    )
  );
}

function hasExpectedSignature(
  bytes: Uint8Array,
  mimeType: string
): boolean {
  switch (mimeType) {
    case "image/jpeg":
      return matchesBytes(bytes, [0xff, 0xd8, 0xff]);

    case "image/png":
      return matchesBytes(
        bytes,
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      );

    case "image/webp":
      return (
        matchesBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        matchesBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8)
      );

    case "video/mp4":
      return matchesBytes(
        bytes, [0x66, 0x74, 0x79, 0x70], 4
      );

    case "video/webm":
      return matchesBytes(
        bytes, [0x1a, 0x45, 0xdf, 0xa3]
      );

    default:
      return false;
  }
}

export type CreatorVerseMediaEnvelope = {
  mimeType: string;
  kind: MediaKind;
  byteSize: number;
  requiresTrustedInspection: true;
};

export async function validateCreatorVerseMediaEnvelope(
  file: Blob,
  declaredMimeType: string
): Promise<CreatorVerseMediaEnvelope> {
  const rule = rules[declaredMimeType];

  if (!rule) {
    throw new Error("Unsupported CreatorVerse media type.");
  }

  if (
    !Number.isSafeInteger(file.size) ||
    file.size < 16 ||
    file.size > rule.maxBytes
  ) {
    throw new Error("CreatorVerse media exceeds its size limits.");
  }

  const bytes = new Uint8Array(
    await file.slice(0, 32).arrayBuffer()
  );

  if (!hasExpectedSignature(bytes, declaredMimeType)) {
    throw new Error(
      "The file signature does not match its declared type."
    );
  }

  return {
    mimeType: declaredMimeType,
    kind: rule.kind,
    byteSize: file.size,
    requiresTrustedInspection: true,
  };
}

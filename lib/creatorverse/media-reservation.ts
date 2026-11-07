import "server-only";

import {
  CREATORVERSE_MEDIA_BUCKET,
} from "./integration-contract";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export type CreatorVerseMediaReservation = Readonly<{
  bucket: string;
  mediaId: string;
  storagePath: string;
  verification: "pending";
}>;

function normalizeUuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !UUID_PATTERN.test(value)
  ) {
    throw new Error(
      "Invalid CreatorVerse reservation identifier."
    );
  }

  return value.toLowerCase();
}

/**
 * Validate a reservation response from the trusted
 * creatorverse_reserve_post_media database RPC.
 *
 * This validates structure and expected relationships.
 * It does not authorize an upload or establish that the
 * reservation originated from the database.
 *
 * Never use a client-submitted storage path as authority.
 */
export function validateCreatorVerseMediaReservation(
  response: unknown,
  expectedPageId: string,
  expectedPostId: string,
  expectedMimeType: string
): CreatorVerseMediaReservation {
  const pageId = normalizeUuid(expectedPageId);
  const postId = normalizeUuid(expectedPostId);

  const extension = EXTENSIONS[expectedMimeType];

  if (!extension) {
    throw new Error(
      "Unsupported CreatorVerse reservation MIME type."
    );
  }

  if (
    response === null ||
    typeof response !== "object" ||
    Array.isArray(response)
  ) {
    throw new Error(
      "Invalid CreatorVerse reservation response."
    );
  }

  const record = response as Record<string, unknown>;

  const keys = Object.keys(record).sort();

  if (
    keys.length !== 3 ||
    keys[0] !== "media_id" ||
    keys[1] !== "storage_path" ||
    keys[2] !== "verification"
  ) {
    throw new Error(
      "Unexpected CreatorVerse reservation fields."
    );
  }

  const mediaId = normalizeUuid(record.media_id);

  const expectedPath =
    `${pageId}/${postId}/${mediaId}.${extension}`;

  if (
    record.verification !== "pending" ||
    record.storage_path !== expectedPath
  ) {
    throw new Error(
      "CreatorVerse reservation does not match the expected media."
    );
  }

  return {
    bucket: CREATORVERSE_MEDIA_BUCKET,
    mediaId,
    storagePath: expectedPath,
    verification: "pending",
  };
}

import "server-only";

import sharp from "sharp";
import { validateCreatorVerseMediaEnvelope } from "./media-envelope";

/**
 * Trusted image inspection only.
 * The caller must supply the object fetched from trusted storage.
 * This function does not approve media or change database state.
 */

const MAX_PIXELS = 20_000_000;
const MAX_DIMENSION = 8192;

const imageFormats = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type CreatorVerseInspectedImage = {
  mimeType: keyof typeof imageFormats;
  byteSize: number;
  width: number;
  height: number;
};

export async function inspectCreatorVerseImage(
  file: Blob,
  declaredMimeType: string
): Promise<CreatorVerseInspectedImage> {
  const envelope = await validateCreatorVerseMediaEnvelope(
    file,
    declaredMimeType
  );

  if (
    envelope.kind !== "image" ||
    !Object.prototype.hasOwnProperty.call(
      imageFormats,
      declaredMimeType
    )
  ) {
    throw new Error("Unsupported CreatorVerse image type.");
  }

  const mimeType =
    declaredMimeType as keyof typeof imageFormats;

  const buffer = Buffer.from(await file.arrayBuffer());

  const options = {
    failOn: "warning" as const,
    limitInputPixels: MAX_PIXELS,
    sequentialRead: true,
  };

  try {
    const metadata = await sharp(buffer, options).metadata();

    const width = metadata.width;
    const height = metadata.height;

    if (
      metadata.format !== imageFormats[mimeType] ||
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      !width ||
      !height ||
      width > MAX_DIMENSION ||
      height > MAX_DIMENSION ||
      width * height > MAX_PIXELS ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new Error("Invalid image metadata.");
    }

    // Force actual pixel decoding, not just header inspection.
    await sharp(buffer, options).stats();

    return {
      mimeType,
      byteSize: envelope.byteSize,
      width,
      height,
    };
  } catch {
    throw new Error(
      "CreatorVerse image failed trusted decoding."
    );
  }
}

import "server-only";

import {
  inspectCreatorVerseImage,
  type CreatorVerseInspectedImage,
} from "./image-verification";

import {
  inspectCreatorVerseVideo,
} from "./video-verification";

import type {
  CreatorVerseVideoProbeResult,
} from "./video-probe-validation";

export type CreatorVerseInspectedMedia =
  | ({
      kind: "image";
    } & CreatorVerseInspectedImage)
  | ({
      kind: "video";
    } & CreatorVerseVideoProbeResult);

/**
 * Shared server-side media inspection entry point.
 *
 * The caller must provide bytes retrieved from trusted storage.
 *
 * Inspection alone does not approve media.
 * No database writes, publication, or storage changes occur here.
 *
 * Video inspection requires a trusted FFprobe executable.
 * Without one, video inspection fails closed.
 */
export async function inspectCreatorVerseMediaBlob(
  file: Blob,
  declaredMimeType: string,
  maxVideoDurationSeconds: number
): Promise<CreatorVerseInspectedMedia> {
  if (
    declaredMimeType === "image/jpeg" ||
    declaredMimeType === "image/png" ||
    declaredMimeType === "image/webp"
  ) {
    const image = await inspectCreatorVerseImage(
      file,
      declaredMimeType
    );

    return {
      kind: "image",
      ...image,
    };
  }

  if (
    declaredMimeType === "video/mp4" ||
    declaredMimeType === "video/webm"
  ) {
    const video = await inspectCreatorVerseVideo(
      file,
      declaredMimeType,
      maxVideoDurationSeconds
    );

    return {
      kind: "video",
      ...video,
    };
  }

  throw new Error("Unsupported CreatorVerse media type.");
}

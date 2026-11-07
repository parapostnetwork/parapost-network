import "server-only";

/**
 * Validates metadata returned by a trusted video probe.
 * Does not execute binaries, fetch storage objects,
 * approve uploads, or enable publishing.
 */

export type CreatorVerseVideoProbeResult = {
  mimeType: "video/mp4" | "video/webm";
  durationSeconds: number;
  width: number;
  height: number;
  codec: string;
};

const CODECS = {
  "video/mp4": ["h264", "hevc", "av1"],
  "video/webm": ["vp8", "vp9", "av1"],
} as const;

const MAX_SIDE = 4096;
const MAX_PIXELS = 9_000_000;

function record(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error("Invalid video probe response.");
  }
  return value as Record<string, unknown>;
}

function durationValue(value: unknown): number {
  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    throw new Error("Missing video duration.");
  }

  const duration = Number(value);

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Invalid video duration.");
  }

  return duration;
}

export function validateCreatorVerseVideoProbe(
  input: unknown,
  declaredMimeType: string,
  maxDurationSeconds: number
): CreatorVerseVideoProbeResult {
  if (
    declaredMimeType !== "video/mp4" &&
    declaredMimeType !== "video/webm"
  ) {
    throw new Error("Unsupported video type.");
  }

  if (
    !Number.isFinite(maxDurationSeconds) ||
    maxDurationSeconds <= 0
  ) {
    throw new Error("Invalid server duration limit.");
  }

  const probe = record(input);
  const format = record(probe.format);

  if (typeof format.format_name !== "string") {
    throw new Error("Missing container format.");
  }

  const formats = format.format_name.split(",");

  const expectedContainer =
    declaredMimeType === "video/mp4" ? "mp4" : "webm";

  if (!formats.includes(expectedContainer)) {
    throw new Error("Unexpected video container.");
  }

  if (!Array.isArray(probe.streams)) {
    throw new Error("Missing video streams.");
  }

  const streams = probe.streams.map(record);

  const videos = streams.filter(
    stream => stream.codec_type === "video"
  );

  if (
    videos.length !== 1 ||
    streams.some(
      stream =>
        stream.codec_type !== "video" &&
        stream.codec_type !== "audio"
    )
  ) {
    throw new Error("Invalid video stream structure.");
  }

  const video = videos[0];
  const { width, height, codec_name } = video;

  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_SIDE ||
    height > MAX_SIDE ||
    width * height > MAX_PIXELS
  ) {
    throw new Error("Invalid video dimensions.");
  }

  if (
    typeof codec_name !== "string" ||
    !(CODECS[declaredMimeType] as readonly string[])
      .includes(codec_name)
  ) {
    throw new Error("Unsupported video codec.");
  }

  const durationSeconds = durationValue(format.duration);

  if (durationSeconds > maxDurationSeconds) {
    throw new Error("Video exceeds duration limit.");
  }

  return {
    mimeType: declaredMimeType,
    durationSeconds,
    width,
    height,
    codec: codec_name,
  };
}

import "server-only";

import { execFile } from "node:child_process";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";

const runExecutable = promisify(execFile);

const MAX_DECODE_TIME_MS = 30_000;
const MAX_OUTPUT_BYTES = 256 * 1024;

/**
 * Decode the complete video and any audio streams.
 *
 * An administrator-configured FFmpeg executable is required.
 * Missing configuration, decoding errors, timeouts, and
 * zero decoded video frames all fail closed.
 *
 * This function does not approve or publish media.
 */
export async function decodeCreatorVerseVideoFile(
  filePath: string
): Promise<void> {
  const executable = process.env.CREATORVERSE_FFMPEG_BIN;

  if (!executable || !isAbsolute(executable)) {
    throw new Error(
      "Trusted CreatorVerse video decoding is not configured."
    );
  }

  try {
    const { stdout } = await runExecutable(
      executable,
      [
        "-hide_banner",
        "-loglevel", "error",
        "-nostdin",
        "-nostats",
        "-xerror",
        "-err_detect", "explode",
        "-progress", "pipe:1",
        "-i", filePath,
        "-map", "0:v:0",
        "-map", "0:a?",
        "-sn",
        "-dn",
        "-f", "null",
        "-",
      ],
      {
        timeout: MAX_DECODE_TIME_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
      }
    );

    const frameCounts = [
      ...stdout.matchAll(/^frame=\s*(\d+)\s*$/gm),
    ];

    const finalFrames = Number(
      frameCounts.at(-1)?.[1] ?? 0
    );

    if (
      !Number.isSafeInteger(finalFrames) ||
      finalFrames < 1
    ) {
      throw new Error("No video frames decoded.");
    }
  } catch {
    throw new Error(
      "CreatorVerse video failed full decoding."
    );
  }
}

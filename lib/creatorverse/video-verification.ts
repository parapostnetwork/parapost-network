import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";

import { decodeCreatorVerseVideoFile } from "./video-decoding";

import {
  validateCreatorVerseMediaEnvelope,
} from "./media-envelope";

import {
  validateCreatorVerseVideoProbe,
  type CreatorVerseVideoProbeResult,
} from "./video-probe-validation";

const runExecutable = promisify(execFile);

const MAX_PROBE_TIME_MS = 10_000;
const MAX_PROBE_OUTPUT_BYTES = 256 * 1024;

/**
 * Server-only, fail-closed video inspection.
 *
 * Requires a trusted FFprobe executable explicitly configured
 * by the server administrator.
 *
 * Does not approve media, update Supabase, publish posts,
 * or expose an upload endpoint.
 */
export async function inspectCreatorVerseVideo(
  file: Blob,
  declaredMimeType: string,
  maxDurationSeconds: number
): Promise<CreatorVerseVideoProbeResult> {
  const executable = process.env.CREATORVERSE_FFPROBE_BIN;

  if (!executable || !isAbsolute(executable)) {
    throw new Error(
      "Trusted CreatorVerse video probing is not configured."
    );
  }

  const envelope = await validateCreatorVerseMediaEnvelope(
    file,
    declaredMimeType
  );

  if (envelope.kind !== "video") {
    throw new Error("Expected a video file.");
  }

  const directory = await mkdtemp(
    join(tmpdir(), "creatorverse-probe-")
  );

  try {
    const extension =
      declaredMimeType === "video/mp4" ? "mp4" : "webm";

    const filename = join(directory, `source.${extension}`);

    await writeFile(
      filename,
      Buffer.from(await file.arrayBuffer()),
      { flag: "wx", mode: 0o600 }
    );

    const { stdout } = await runExecutable(
      executable,
      [
        "-v", "error",
        "-show_entries",
        "format=duration,format_name:stream=codec_type,codec_name,width,height",
        "-of", "json",
        "-i", filename,
      ],
      {
        timeout: MAX_PROBE_TIME_MS,
        maxBuffer: MAX_PROBE_OUTPUT_BYTES,
        windowsHide: true,
      }
    );

    let metadata: unknown;

    try {
      metadata = JSON.parse(stdout);
    } catch {
      throw new Error("Invalid video probe output.");
    }

    const inspected = validateCreatorVerseVideoProbe(
      metadata,
      declaredMimeType,
      maxDurationSeconds
    );

    await decodeCreatorVerseVideoFile(filename);

    return inspected;
  } catch {
    throw new Error(
      "CreatorVerse video failed trusted probing."
    );
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    });
  }
}

import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";

import {
  validateCreatorVerseVideoProbe,
} from "@/lib/creatorverse/video-probe-validation";

import {
  inspectCreatorVerseVideo,
} from "@/lib/creatorverse/video-verification";

const runExecutable = promisify(execFile);
const MAX_BYTES = 33554432;
const MAX_SECONDS = 120;

function executable(kind: "ffmpeg" | "ffprobe") {
  const configured =
    kind === "ffmpeg"
      ? process.env.CREATORVERSE_FFMPEG_BIN
      : process.env.CREATORVERSE_FFPROBE_BIN;

  const result = configured ||
    (process.env.VERCEL === "1"
      ? join(process.cwd(), "vendor", "creatorverse-video", kind)
      : undefined);

  if (!result || !isAbsolute(result)) {
    throw new Error("Trusted video conversion is unavailable.");
  }

  return result;
}

function executionOptions(timeout: number) {
  return {
    timeout,
    maxBuffer: 256 * 1024,
    windowsHide: true,
    env: {
      PATH: "/usr/bin:/bin",
      LANG: "C",
      NODE_ENV: process.env.NODE_ENV,
      ...(process.env.VERCEL === "1"
        ? {
            LD_LIBRARY_PATH: join(
              process.cwd(),
              "vendor",
              "creatorverse-video",
              "lib"
            ),
          }
        : {}),
    },
  };
}

export async function convertGroupQuickTimeVideo(file: Blob) {
  if (file.size < 16 || file.size > MAX_BYTES) {
    throw new Error("Videos must be no larger than 32 MB.");
  }

  const header = Buffer.from(
    await file.slice(0, 16).arrayBuffer()
  );

  if (!["ftyp", "moov", "mdat", "wide", "free"].includes(
    header.toString("ascii", 4, 8)
  )) {
    throw new Error("Invalid QuickTime video.");
  }

  const directory = await mkdtemp(
    join(tmpdir(), "parachat-convert-")
  );

  const source = join(directory, "source.mov");
  const output = join(directory, "converted.mp4");

  try {
    await writeFile(
      source,
      Buffer.from(await file.arrayBuffer()),
      { flag: "wx", mode: 0o600 }
    );

    const { stdout } = await runExecutable(
      executable("ffprobe"),
      [
        "-v", "error",
        "-show_entries",
        "format=duration,format_name:stream=codec_type,codec_name,width,height",
        "-of", "json",
        "-protocol_whitelist", "file,pipe",
        "-f", "mov",
        "-enable_drefs", "0",
        "-use_absolute_path", "0",
        "-i", source,
      ],
      executionOptions(10000)
    );

    const probe = JSON.parse(stdout);

    if (!Array.isArray(probe.streams)) {
      throw new Error("Invalid QuickTime video streams.");
    }

    const sourceInfo = validateCreatorVerseVideoProbe(
      {
        ...probe,
        streams: probe.streams.filter(
          (stream: { codec_type: string }) =>
            stream.codec_type !== "data"
        ),
      },
      "video/mp4",
      MAX_SECONDS
    );

    await runExecutable(
      executable("ffmpeg"),
      [
        "-hide_banner",
        "-loglevel", "error",
        "-nostdin",
        "-xerror",
        "-err_detect", "explode",
        "-protocol_whitelist", "file,pipe",
        "-f", "mov",
        "-enable_drefs", "0",
        "-use_absolute_path", "0",
        "-i", source,
        "-map", "0:v:0",
        "-map", "0:a:0?",
        "-map_metadata", "-1",
        "-map_chapters", "-1",
        "-sn",
        "-dn",
        "-vf",
        "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        "-b:v", "1600k",
        "-maxrate", "1800k",
        "-bufsize", "3600k",
        "-c:a", "aac",
        "-b:a", "128k",
        "-threads", "2",
        "-movflags", "+faststart",
        "-fs", String(MAX_BYTES + 1),
        "-f", "mp4",
        output,
      ],
      executionOptions(45000)
    );

    const info = await stat(output);

    if (info.size < 16 || info.size > MAX_BYTES) {
      throw new Error("Converted video exceeds its size limit.");
    }

    const converted = new Blob(
      [Uint8Array.from(await readFile(output))],
      { type: "video/mp4" }
    );

    const inspected = await inspectCreatorVerseVideo(
      converted,
      "video/mp4",
      MAX_SECONDS
    );

    if (
      inspected.codec !== "h264" ||
      Math.abs(
        inspected.durationSeconds - sourceInfo.durationSeconds
      ) > 1
    ) {
      throw new Error("Converted video validation failed.");
    }

    return { blob: converted, inspected };

  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    });
  }
}

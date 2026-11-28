import { timingSafeEqual } from "node:crypto";

import {
  groupChatAdmin,
  groupChatResponse,
  groupChatErrorResponse,
  groupChatTarget,
} from "@/lib/parachat/group-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret =
    process.env.PARACHAT_MEDIA_MAINTENANCE_SECRET;

  if (!secret || secret.length < 32) return false;

  const header = request.headers.get("authorization");

  if (!header?.startsWith("Bearer ")) return false;
  if (header.length > 8192) return false;

  const received = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);

  return received.length === expected.length &&
    timingSafeEqual(received, expected);
}

const uuid =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const validPath = new RegExp(
  `^${uuid}/${uuid}/${uuid}\\.(jpg|png|webp|mp4|webm)$`,
  "i"
);

export async function POST(request: Request) {
  try {
    groupChatTarget();

    if (!authorized(request)) {
      return groupChatResponse(
        { error: "Unauthorized." },
        401
      );
    }

    const admin = groupChatAdmin();

    const { data, error } = await admin.rpc(
      "parachat_group_cleanup_candidates"
    );

    if (error || !Array.isArray(data)) {
      return groupChatResponse(
        { error: "Cleanup candidates unavailable." },
        503
      );
    }

    const batches: Record<string, string[]> = {
      "parachat-group-media": [],
      "parachat-group-conversion": [],
    };

    for (const row of data.slice(0, 100)) {
      if (
        !Object.hasOwn(batches, row.bucket_id) ||
        typeof row.storage_path !== "string" ||
        !validPath.test(row.storage_path)
      ) {
        continue;
      }

      if (
        row.bucket_id === "parachat-group-conversion" &&
        !row.storage_path.endsWith(".mp4")
      ) {
        continue;
      }

      batches[row.bucket_id].push(row.storage_path);
    }

    let removed = 0;
    let failed = 0;

    for (const [bucket, paths] of Object.entries(batches)) {
      if (!paths.length) continue;

      const unique = [...new Set(paths)];

      const result = await admin.storage
        .from(bucket)
        .remove(unique);

      if (result.error) {
        failed += unique.length;
      } else {
        removed += result.data?.length || 0;
      }
    }

    return groupChatResponse(
      {
        ok: failed === 0,
        candidates: data.length,
        removed,
        failed,
      },
      failed ? 503 : 200
    );

  } catch (error) {
    return groupChatErrorResponse(error);
  }
}

import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  communityServerTargetAllowed,
  isCommunityStagingTarget,
} from "@/lib/community/release-target";

export const groupChatHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Vary": "Authorization",
  "X-Content-Type-Options": "nosniff",
};

export class GroupChatError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function groupChatResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: groupChatHeaders,
  });
}

export function groupChatErrorResponse(error: unknown) {
  if (error instanceof GroupChatError) {
    return groupChatResponse(
      { error: error.message },
      error.status
    );
  }

  return groupChatResponse(
    { error: "The group chat request could not be completed." },
    500
  );
}

export function groupChatTarget() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (
    !url ||
    !isCommunityStagingTarget(url) ||
    !communityServerTargetAllowed(url)
  ) {
    throw new GroupChatError(
      503,
      "Group chat is not available in this environment."
    );
  }

  return url;
}

export function groupChatId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new GroupChatError(400, "Invalid identifier.");
  }

  return value.toLowerCase();
}

const authOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
};

export async function requireGroupChatUser(request: Request) {
  const url = groupChatTarget();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization");

  if (!key) {
    throw new GroupChatError(503, "Group chat unavailable.");
  }

  if (
    !authorization ||
    authorization.length > 8192 ||
    !/^Bearer \S+$/.test(authorization)
  ) {
    throw new GroupChatError(401, "Sign in to continue.");
  }

  const client = createClient(url, key, {
    global: {
      headers: { Authorization: authorization },
    },
    auth: authOptions,
  });

  const { data, error } = await client.auth.getUser(
    authorization.slice(7)
  );

  if (error || !data.user || data.user.is_anonymous) {
    throw new GroupChatError(401, "Sign in to continue.");
  }

  return {
    client,
    userId: data.user.id,
  };
}

export function groupChatAdmin() {
  const url = groupChatTarget();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new GroupChatError(
      503,
      "Group chat media unavailable."
    );
  }

  return createClient(url, key, {
    auth: authOptions,
  });
}

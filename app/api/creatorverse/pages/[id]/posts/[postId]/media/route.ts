import { createClient } from "@supabase/supabase-js";
import { pageId } from "@/lib/creatorverse/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; postId: string }>;
};

const unavailable = () => Response.json(
  { error: "Media unavailable." },
  {
    status: 404,
    headers: { "Cache-Control": "no-store" }
  }
);

export async function GET(
  _request: Request,
  context: Context
): Promise<Response> {
  let id: string;
  let postId: string;

  try {
    const params = await context.params;
    id = pageId(params.id).toLowerCase();
    postId = pageId(params.postId).toLowerCase();
  } catch {
    return unavailable();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    process.env.CREATORVERSE_POST_MEDIA_READ_ENABLED !== "true" ||
    url !== "https://vmgelrgrtpghmvqgufzz.supabase.co" ||
    !key
  ) {
    return unavailable();
  }

  try {
    const admin = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    const { data: page, error: pageError } = await admin
      .from("creatorverse_pages")
      .select("id")
      .eq("id", id)
      .eq("status", "active")
      .maybeSingle();

    if (pageError || !page) return unavailable();

    const { data: post, error: postError } = await admin
      .from("creatorverse_posts")
      .select("id")
      .eq("id", postId)
      .eq("page_id", id)
      .eq("status", "published")
      .maybeSingle();

    if (postError || !post) return unavailable();

    const { data, error } = await admin
      .from("creatorverse_media")
      .select("id,media_type,display_order")
      .eq("page_id", id)
      .eq("post_id", postId)
      .eq("purpose", "post")
      .eq("verification", "verified")
      .order("display_order", { ascending: true })
      .limit(4);

    if (error) return unavailable();

    const media = (data ?? []).filter(item =>
      typeof item.id === "string" &&
      (item.media_type === "image" || item.media_type === "video") &&
      Number.isInteger(item.display_order)
    );

    return Response.json(
      { media },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }
      }
    );
  } catch {
    return unavailable();
  }
}

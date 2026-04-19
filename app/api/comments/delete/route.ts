import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { commentId, reportedBy, commentOwnerId, reason } = body ?? {};

    if (!commentId || !reportedBy || !commentOwnerId) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    if (reportedBy === commentOwnerId) {
      return NextResponse.json(
        { error: "You cannot report your own comment." },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase.from("reported_comments").insert({
      comment_id: commentId,
      reported_by: reportedBy,
      comment_owner_id: commentOwnerId,
      reason: reason?.trim() || null,
      status: "open",
    });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { message: "You already reported this comment." },
          { status: 200 }
        );
      }

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Comment reported successfully.",
    });
  } catch {
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export default function FriendsNavItem() {
  const [requestCount, setRequestCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    const loadRequestCount = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (isMounted) {
          setRequestCount(0);
        }
        return;
      }

      const { count, error } = await supabase
        .from("friend_requests")
        .select("*", { count: "exact", head: true })
        .eq("receiver_id", user.id)
        .eq("status", "pending");

      if (!error && isMounted) {
        setRequestCount(count || 0);
      }
    };

    loadRequestCount();

    const channel = supabase
      .channel("friends-nav-requests")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friend_requests",
        },
        async () => {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (!user) return;

          const { count, error } = await supabase
            .from("friend_requests")
            .select("*", { count: "exact", head: true })
            .eq("receiver_id", user.id)
            .eq("status", "pending");

          if (!error && isMounted) {
            setRequestCount(count || 0);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Link
      href="/friends/requests"
      className="relative inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/5 transition"
    >
      Friends

      {requestCount > 0 && (
        <span className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-semibold">
          {requestCount}
        </span>
      )}
    </Link>
  );
}
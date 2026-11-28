"use client";

import { useEffect, useRef, useState } from "react";
import { getGroupChatPhoto } from "@/lib/parachat/group-photo-client";

export default function ParachatGroupAvatar({
  conversationId,
  name,
  photoPath,
  size = 40,
}: {
  conversationId: string;
  name: string;
  photoPath: string | null;
  size?: number;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl("");

    if (!photoPath) return;

    let active = true;
    let started = false;
    let observer: IntersectionObserver | undefined;

    async function load() {
      if (!active || started) return;
      started = true;
      observer?.disconnect();

      try {
        const photo = await getGroupChatPhoto(conversationId);

        if (active) setUrl(photo || "");
      } catch {
        if (active) setUrl("");
      }
    }

    if (element.current && "IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void load();
        }
      });

      observer.observe(element.current);
    } else {
      void load();
    }

    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [conversationId, photoPath]);

  return (
    <div
      ref={element}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        background: "#65478e",
        color: "#fff",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: 16,
      }}
    >
      {url ? (
        <img
          src={url}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setUrl("")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        name.charAt(0).toUpperCase() || "G"
      )}
    </div>
  );
}

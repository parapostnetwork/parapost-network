'use client';

import { useEffect, useState } from 'react';
import { groupsFetch } from '@/lib/groups/client';
import { GroupAvatarImage } from './GroupAvatarControl';

export function useGroupAvatarUrl(path?: string | null) {
  const [loaded, setLoaded] = useState<{
    path: string;
    url: string;
  } | null>(null);

  useEffect(() => {
    if (!path) return;

    let active = true;
    let objectUrl: string | null = null;

    void groupsFetch(
      `/api/groups/media?path=${encodeURIComponent(path)}`
    )
      .then(response => response.blob())
      .then(blob => {
        if (!blob.type.startsWith('image/')) {
          throw new Error('Invalid avatar image');
        }

        const url = URL.createObjectURL(blob);

        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }

        objectUrl = url;
        setLoaded({ path, url });
      })
      .catch(() => {
        // ParaGhost remains visible when the image is unavailable.
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return path && loaded?.path === path
    ? loaded.url
    : null;
}

export default function GroupAvatarView({
  path,
  name,
  size = 48
}: {
  path?: string | null;
  name: string;
  size?: number;
}) {
  const url = useGroupAvatarUrl(path);

  return (
    <GroupAvatarImage
      avatarUrl={url}
      fallbackUrl="/parapost-icon-white.png"
      groupName={name}
      size={size}
    />
  );
}

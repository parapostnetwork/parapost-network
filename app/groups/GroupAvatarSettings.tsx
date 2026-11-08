'use client';

import { useEffect, useRef } from 'react';
import GroupAvatarControl from './GroupAvatarControl';
import { useGroupAvatarUrl } from './GroupAvatarView';
import {
  uploadGroupAvatar,
  removeGroupAvatar
} from '@/lib/groups/avatar';

export default function GroupAvatarSettings({
  groupId,
  groupName,
  currentPath,
  disabled,
  onChange
}: {
  groupId: string;
  groupName: string;
  currentPath?: string | null;
  disabled?: boolean;
  onChange: (path: string | null) => void;
}) {
  const currentUrl = useGroupAvatarUrl(currentPath);
  const previewRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current);
      }
    };
  }, []);

  return (
    <section
      aria-label="Group avatar settings"
      style={{
        padding: '16px 0',
        borderBottom: '1px solid rgba(255,255,255,0.12)'
      }}
    >
      <h3>Group avatar</h3>
      <p>
        Upload a separate Group profile image.
        Recommended: 512 × 512 pixels.
        The avatar always displays as a perfect circle.
      </p>

      <GroupAvatarControl
        groupName={groupName}
        currentAvatarUrl={currentUrl}
        fallbackAvatarUrl="/parapost-icon-white.png"
        disabled={disabled}
        onUpload={async file => {
          const path = await uploadGroupAvatar(groupId, file);
          const preview = URL.createObjectURL(file);

          if (previewRef.current) {
            URL.revokeObjectURL(previewRef.current);
          }

          previewRef.current = preview;
          onChange(path);

          return preview;
        }}
        onRemove={async () => {
          await removeGroupAvatar(groupId);
          onChange(null);
        }}
      />
    </section>
  );
}

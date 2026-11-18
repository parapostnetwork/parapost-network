'use client';

import { useEffect, useRef } from 'react';
import GroupAvatarControl from './GroupAvatarControl';
import styles from './groups.module.css';
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
    <section aria-label="Group avatar settings" className={styles.settingsAvatarSection}>

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

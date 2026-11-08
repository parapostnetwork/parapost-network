import { supabase } from '@/lib/supabase';
import { groupsFetch } from './client';
import { matchesSignature } from './validation';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

type AvatarAction = 'reserve' | 'save' | 'remove';

async function avatarCommand(
  action: AvatarAction,
  groupId: string,
  path?: string
): Promise<{ path: string | null }> {
  const response = await groupsFetch(
    '/api/groups/avatar',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action,
        groupId,
        path
      })
    }
  );

  return response.json();
}

export async function uploadGroupAvatar(
  groupId: string,
  file: File
): Promise<string> {
  if (
    !IMAGE_TYPES.has(file.type) ||
    file.size < 1 ||
    file.size > MAX_AVATAR_BYTES
  ) {
    throw new Error(
      'Choose a JPEG, PNG or WebP image under 5 MB.'
    );
  }

  const signature = new Uint8Array(
    await file.slice(0, 16).arrayBuffer()
  );

  if (!matchesSignature(file.type, signature)) {
    throw new Error('The image file type is invalid.');
  }

  const reservation = await avatarCommand(
    'reserve',
    groupId
  );

  const path = reservation.path;

  if (
    !path ||
    !new RegExp(
      `^${groupId}/avatars/[0-9a-f-]{36}$`,
      'i'
    ).test(path)
  ) {
    throw new Error('Invalid avatar reservation.');
  }

  const { error } = await supabase.storage
    .from('group-media')
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: '0'
    });

  if (error) {
    throw new Error(
      'Avatar upload failed. Please try again.'
    );
  }

  const saved = await avatarCommand(
    'save',
    groupId,
    path
  );

  if (saved.path !== path) {
    throw new Error(
      'Avatar was not confirmed as saved.'
    );
  }

  return path;
}

export async function removeGroupAvatar(
  groupId: string
): Promise<void> {
  const result = await avatarCommand(
    'remove',
    groupId
  );

  if (result.path !== null) {
    throw new Error(
      'Avatar removal was not confirmed.'
    );
  }
}

'use client';

import { useEffect, useRef, useState } from 'react';

type AvatarImageProps = {
  avatarUrl?: string | null;
  fallbackUrl?: string | null;
  groupName: string;
  size?: number;
};

export function GroupAvatarImage({
  avatarUrl,
  fallbackUrl,
  groupName,
  size = 96,
}: AvatarImageProps) {
  const src = avatarUrl || fallbackUrl;

  return (
    <span
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        background: '#201532',
        border: '2px solid #8b5cf6',
        aspectRatio: '1 / 1',
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`${groupName} avatar`}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            objectFit: 'cover',
            objectPosition: 'center',
            display: 'block',
          }}
        />
      ) : (
        <span
          aria-label={`${groupName} avatar`}
          style={{
            fontSize: size * 0.4,
            fontWeight: 700,
            color: '#fff',
          }}
        >
          {groupName.trim().charAt(0).toUpperCase() || 'G'}
        </span>
      )}
    </span>
  );
}

type AvatarControlProps = {
  groupName: string;
  currentAvatarUrl?: string | null;
  fallbackAvatarUrl?: string | null;
  onUpload: (file: File) => Promise<string>;
  onUploaded?: (url: string) => void;
  onRemove?: () => Promise<void>;
  onRemoved?: () => void;
  disabled?: boolean;
};

export default function GroupAvatarControl({
  groupName,
  currentAvatarUrl,
  fallbackAvatarUrl = '/parapost-icon-white.png',
  onUpload,
  onUploaded,
  onRemove,
  onRemoved,
  disabled = false,
}: AvatarControlProps) {
  const [selected, setSelected] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [savedUrl, setSavedUrl] = useState<string | null>(
    currentAvatarUrl ?? null
  );
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const previewRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current);
      }
    };
  }, []);

  function clearPreview() {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }

    setPreview(null);
    setSelected(null);
  }

  function chooseFile(file?: File) {
    if (busy || disabled || !file) return;

    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (!allowed.includes(file.type)) {
      setError('Choose a JPEG, PNG or WebP image.');
      return;
    }

    if (file.size < 1 || file.size > 5 * 1024 * 1024) {
      setError('Avatar must be 5 MB or smaller.');
      return;
    }

    clearPreview();

    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setPreview(url);
    setSelected(file);
    setError('');
  }

  async function saveAvatar() {
    if (!selected || busy || disabled) return;

    setBusy(true);
    setError('');

    try {
      const url = await onUpload(selected);

      if (!url) {
        throw new Error('Avatar upload was not confirmed.');
      }

      setSavedUrl(url);
      setAvatarRemoved(false);
      onUploaded?.(url);
      clearPreview();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not save the Group avatar.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    if (!onRemove || busy || disabled) return;

    setBusy(true);
    setError('');

    try {
      await onRemove();
      setSavedUrl(null);
      setAvatarRemoved(true);
      clearPreview();
      onRemoved?.();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not remove the Group avatar.'
      );
    } finally {
      setBusy(false);
    }
  }

  const displayedAvatar =
    preview ||
    (!avatarRemoved ? (savedUrl || currentAvatarUrl) : null);

  return (
    <section aria-label="Group avatar settings">
      <h3 style={{ marginBottom: 8 }}>Group Avatar</h3>

      <p style={{ fontSize: 13, opacity: 0.75 }}>
        Upload a separate Group profile picture.
        It always displays as a circle.
        Your cover banner will remain unchanged.
      </p>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          margin: '20px 0',
          flexWrap: 'wrap',
        }}
      >
        <GroupAvatarImage
          avatarUrl={displayedAvatar}
          fallbackUrl={fallbackAvatarUrl}
          groupName={groupName}
          size={112}
        />

        <div>
          <label
            htmlFor="group-avatar-upload"
            style={{
              display: 'block',
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Upload Group Avatar
          </label>

          <input
            id="group-avatar-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy || disabled}
            onChange={(event) => {
              chooseFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />

          <p style={{ fontSize: 12, opacity: 0.7 }}>
            Recommended: 512 × 512 pixels.
            JPEG, PNG or WebP. Maximum 5 MB.
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          disabled={!selected || busy || disabled}
          onClick={() => void saveAvatar()}
        >
          {busy ? 'Saving...' : 'Save Avatar'}
        </button>

        {selected && (
          <button
            type="button"
            disabled={busy || disabled}
            onClick={clearPreview}
          >
            Cancel
          </button>
        )}

        {onRemove && !avatarRemoved && (savedUrl || currentAvatarUrl) && !selected && (
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => void removeAvatar()}
          >
            Remove Avatar
          </button>
        )}
      </div>

      {error && (
        <p role="alert" style={{ color: '#f87171' }}>
          {error}
        </p>
      )}
    </section>
  );
}

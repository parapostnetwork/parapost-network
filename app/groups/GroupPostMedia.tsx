'use client';

import { useEffect, useState } from 'react';
import PostMediaViewer, { type PostMediaViewerState } from '@/components/PostMediaViewer';
import ResponsiveMediaImage from '@/components/ResponsiveMediaImage';
import { postImageGridStyle, postImageGridTileStyle, postImageGridLargeTileStyle } from '@/components/postPresentation';
import { groupsFetch } from '@/lib/groups/client';
import type { GroupsTransport } from '@/lib/groups/transport';
import styles from './groupPosting.module.css';

type Media = { storage_path: string; media_type: string; display_order: number };
export default function GroupPostMedia({ groupId, postId, media, read = groupsFetch }: {
  groupId: string; postId: string; media: Media[]; read?: GroupsTransport['read'];
}) {
  // All surfaces use the existing authenticated download route, never public or signed URLs.
  const key = JSON.stringify(media.filter(item => ['image', 'video'].includes(item.media_type) &&
    item.storage_path.startsWith(`${groupId}/posts/${postId}/`)).sort((a, b) => a.display_order - b.display_order));
  const [loaded, setLoaded] = useState<{ key: string; urls: Record<string, string>; failed: string[] }>({ key: '', urls: {}, failed: [] });
  const [viewer, setViewer] = useState<PostMediaViewerState | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const urls: string[] = [];
    const items = JSON.parse(key) as Media[];
    setLoaded({ key, urls: {}, failed: [] });
    setViewer(null);
    void Promise.all(items.map(async item => {
      try {
        const response = await read(`/api/groups/media?path=${encodeURIComponent(item.storage_path)}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Media unavailable');
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob); urls.push(url);
        setLoaded(previous => ({ ...previous, urls: { ...previous.urls, [item.storage_path]: url } }));
      } catch {
        if (!controller.signal.aborted) setLoaded(previous => ({ ...previous, failed: [...previous.failed, item.storage_path] }));
      }
    }));
    return () => { controller.abort(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [key, read]);
  const items = JSON.parse(key) as Media[];
  const urls = loaded.key === key ? loaded.urls : {};
  const imageUrls = items.filter(item => item.media_type === 'image').map(item => urls[item.storage_path]).filter(Boolean);
  if (!items.length) return null;
  return <>
    <div className={`${styles.mediaGrid} ${items.length === 1 ? styles.singleMedia : ''}`} style={postImageGridStyle}>
      {items.map((item, index) => <div key={item.storage_path} className={styles.mediaTile}
        style={{ ...postImageGridTileStyle, ...(items.length === 3 && index === 0 ? postImageGridLargeTileStyle : {}) }}>
        {!urls[item.storage_path] ? <p role="status" className={styles.mediaPlaceholder}>
          {loaded.key === key && loaded.failed.includes(item.storage_path) ? 'Media unavailable. Refresh to check access.' : 'Loading media…'}
        </p> : item.media_type === 'video'
          ? <video src={urls[item.storage_path]} controls playsInline preload="metadata" aria-label={`Group post video ${index + 1}`} />
          : <button type="button" className={styles.mediaOpen} aria-label={`Open Group photo ${index + 1}`}
              onClick={() => setViewer({ urls: imageUrls, initialIndex: imageUrls.indexOf(urls[item.storage_path]), alt: 'Group post photo' })}>
              <ResponsiveMediaImage purpose="post" src={urls[item.storage_path]} alt={`Group post photo ${index + 1}`} loading="lazy"
                sizes={items.length === 1 ? '(max-width: 760px) 100vw, 1000px' : '(max-width: 760px) 50vw, 500px'} />
            </button>}
      </div>)}
    </div>
    <PostMediaViewer viewer={loaded.key === key ? viewer : null} onClose={() => setViewer(null)} />
  </>;
}

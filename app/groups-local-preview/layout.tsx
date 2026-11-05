import { creatorVerseStagingPreviewEnabled } from '@/lib/creatorverse/staging-preview';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

/** Every nested local preview, including direct draft URLs, is development-only. */
export default function LocalPreviewLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV !== 'development' && !creatorVerseStagingPreviewEnabled()) notFound();
  return children;
}

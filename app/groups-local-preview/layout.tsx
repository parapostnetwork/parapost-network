import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

/** Every nested local preview, including direct draft URLs, is development-only. */
export default function LocalPreviewLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  return children;
}

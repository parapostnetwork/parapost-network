import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import LocalGroupsPreview from './LocalGroupsPreview';

export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <Suspense fallback={<p role="status">Loading pages…</p>}><LocalGroupsPreview /></Suspense>;
}

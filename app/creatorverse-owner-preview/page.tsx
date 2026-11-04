import { notFound } from 'next/navigation';
import CreatorVerseOwnerWorkspace from '@/app/creatorverse/CreatorVerseOwnerWorkspace';

export const dynamic = 'force-dynamic';

export default function OwnerPreview() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <main style={{ minHeight: '100vh', background: '#100c19' }}>
      <CreatorVerseOwnerWorkspace />
    </main>
  );
}

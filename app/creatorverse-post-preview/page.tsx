import { notFound } from 'next/navigation';
import CreatorVerseLocalRolePreview from '@/app/creatorverse/CreatorVerseLocalRolePreview';

export default function CreatorVersePostPreview() {
  if (process.env.NODE_ENV !== 'development') {
    notFound();
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: '#100c19',
      color: '#fff',
      padding: '35px 16px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 850,
        margin: '0 auto',
      }}>
        <h1>CreatorVerse Post Preview</h1>
        <CreatorVerseLocalRolePreview />
      </div>
    </main>
  );
}

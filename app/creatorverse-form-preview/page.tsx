import { notFound } from 'next/navigation';
import CreatorVersePageForm from '@/app/creatorverse/CreatorVersePageForm';

export const dynamic = 'force-dynamic';

export default function CreatorVerseFormPreview() {
  if (process.env.NODE_ENV !== 'development') {
    notFound();
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: '#100c19',
      padding: '40px 16px',
      display: 'flex',
      justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 980 }}>
        <CreatorVersePageForm />
      </div>
    </main>
  );
}

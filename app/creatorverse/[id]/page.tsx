import { notFound } from 'next/navigation';
import { creatorVerseEnabled } from '@/lib/creatorverse/config';
import { UUID } from '@/lib/creatorverse/validation';
import CreatorVersePage from '../CreatorVersePage';
export default async function PublicCreatorVersePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!creatorVerseEnabled() || !UUID.test(id)) notFound();
  return <CreatorVersePage id={id}/>;
}

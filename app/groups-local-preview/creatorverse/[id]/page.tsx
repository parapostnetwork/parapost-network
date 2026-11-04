import { creatorVerseStagingPreviewEnabled } from '@/lib/creatorverse/staging-preview';
import { notFound } from 'next/navigation';
import { CREATORVERSE_SAMPLES } from '../samples';
import { CREATORVERSE_CATEGORIES } from '@/lib/creatorverse/types';
import SampleCreatorVerseClient from './SampleCreatorVerseClient';

export default async function SampleCreatorVersePage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  if (process.env.NODE_ENV !== 'development' && !creatorVerseStagingPreviewEnabled()) notFound();

  const { id } = await params;
  const sample = CREATORVERSE_SAMPLES.find(item => item.page.id === id);
  if (!sample) notFound();

  const { page, creator } = sample;

  return <SampleCreatorVerseClient
    name={page.name}
    category={CREATORVERSE_CATEGORIES[page.category]}
    bio={page.short_bio}
    description={page.description}
    creatorName={creator?.name ?? null}
  />;
}

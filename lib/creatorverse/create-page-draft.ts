import { supabase } from '@/lib/supabase';
import type { PageFields } from './types';

type Images = {
  logo: File | null;
  cover: File | null;
};

type ApiResult = {
  error?: string;
  page?: { id?: string };
};

export async function createCreatorVersePageDraft(
  fields: PageFields,
  images: Images
): Promise<string> {
  if (images.logo || images.cover) {
    throw new Error(
      'Profile and cover image uploads are not connected yet. ' +
      'No page was created.'
    );
  }

  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (error || !token) {
    throw new Error('Sign in to create a CreatorVerse page.');
  }

  const response = await fetch('/api/creatorverse/pages/draft', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: fields.name,
      category: fields.category,
      short_bio: fields.short_bio,
      description: fields.description,
    }),
  });

  const result = await response.json().catch(
    () => ({}) as ApiResult
  ) as ApiResult;

  if (!response.ok) {
    throw new Error(
      result.error || 'Unable to create CreatorVerse page draft.'
    );
  }

  const id = result.page?.id;

  if (
    typeof id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  ) {
    throw new Error('Page draft could not be verified.');
  }

  const detailsResponse = await fetch(
    `/api/creatorverse/pages/${encodeURIComponent(id)}/details`,
    {
      method: 'PATCH',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fields),
    }
  );

  const detailsResult = await detailsResponse.json().catch(
    () => ({})
  ) as {
    error?: string;
    page?: { id?: string };
  };

  if (
    !detailsResponse.ok ||
    detailsResult.page?.id !== id
  ) {
    throw new Error(
      `Page draft ${id} was created, but saving its details failed: ` +
      `${detailsResult.error || 'Update could not be verified.'} ` +
      'Do not create a duplicate page.'
    );
  }

  const activationResponse = await fetch(
    `/api/creatorverse/pages/${encodeURIComponent(id)}/activate`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const activation = await activationResponse.json().catch(
    () => ({})
  ) as {
    error?: string;
    page?: { id?: string; status?: string };
  };

  if (
    !activationResponse.ok ||
    activation.page?.id !== id ||
    activation.page?.status !== 'active'
  ) {
    throw new Error(
      `Page draft ${id} was created but activation failed. Do not create a duplicate page.`
    );
  }

  return id;
}

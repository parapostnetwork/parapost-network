import { supabase } from '@/lib/supabase';
import type { PageFields } from './types';
import {
  pageImageUploadsApproved,
  uploadCreatorVersePageImage,
} from './page-image-client';

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
  if (
    (images.logo || images.cover) &&
    !pageImageUploadsApproved()
  ) {
    throw new Error(
      'Profile and cover uploads are being prepared for staging. ' +
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

  // Save and verify selected images before activating the page.
  // If an upload fails, retain the draft ID for safe recovery.
  try {
    if (images.logo) {
      await uploadCreatorVersePageImage(id, 'logo', images.logo);
    }

    if (images.cover) {
      await uploadCreatorVersePageImage(id, 'cover', images.cover);
    }
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Image upload failed.';

    throw new Error(
      `Page draft ${id} was created, but image setup failed: ` +
      `${message} Do not create a duplicate page.`
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

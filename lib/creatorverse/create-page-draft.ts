import { supabase } from '@/lib/supabase';
import type { PageFields } from './types';
import { pageImageUploadsApproved, uploadCreatorVersePageImage } from './page-image-client';
import { clearRecovery, readRecovery, recoveryKey, saveRecovery, type Recovery, type RecoveryPage } from './draft-recovery';

type Images = { logo: File | null; cover: File | null };

export async function recoveryRequest(owner: string, path: string, method = 'GET', body?: unknown) {
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;
  if (error || !session || session.user.id !== owner) {
    throw new Error('Your account changed. Sign in to the draft’s account to continue.');
  }
  const response = await fetch(path, {
    method, cache: 'no-store',
    headers: { Authorization: `Bearer ${session.access_token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  const current = await supabase.auth.getSession();
  if (current.error || current.data.session?.user.id !== owner) throw new Error('Your account changed. Reopen your saved draft to continue.');
  if (!response.ok) throw new Error(result.error || 'Page recovery could not be completed. Please retry.');
  return result;
}
export async function recoverPages(owner: string, id?: string): Promise<RecoveryPage[]> {
  const result = await recoveryRequest(owner, `/api/creatorverse/pages/recovery${id ? `?id=${encodeURIComponent(id)}` : ''}`);
  if (!Array.isArray(result.pages)) throw new Error('Invalid recovery response.');
  return result.pages;
}

export async function createCreatorVersePageDraft(fields: PageFields, images: Images, expectedOwner?: string): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const owner = data.session?.user.id;
  if (error || !owner || (expectedOwner && owner !== expectedOwner)) throw new Error('Sign in to the draft’s account to continue.');
  if (!navigator.locks) throw new Error('This browser cannot safely resume drafts. Use a browser with Web Locks support.');
  return navigator.locks.request(recoveryKey(owner), { ifAvailable: true }, async lock => {
    if (!lock) throw new Error('This draft is being saved in another tab. Please wait and reopen it.');
    const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(fields))))).map(byte => byte.toString(16).padStart(2, '0')).join('');
    const completionKey = `${recoveryKey(owner)}:completed`;
    const completed = JSON.parse(localStorage.getItem(completionKey) ?? 'null') as { id: string; fingerprint: string } | null;
    if (!readRecovery(owner)?.pageId && !readRecovery(owner)?.creation && completed?.fingerprint === fingerprint) {
      const [page] = await recoverPages(owner, completed.id);
      if (page?.status === 'active') return page.id;
      throw new Error('The previously activated page could not be confirmed. No duplicate was created.');
    }
    const complete = (id: string) => {
      // A minimal receipt prevents a stale second tab from submitting the same completed form again.
      localStorage.setItem(completionKey, JSON.stringify({ id, fingerprint }));
      clearRecovery(owner);
      return id;
    };
    let saved: Recovery = readRecovery(owner) ?? { version: 1, owner, fields, linkLabel: '', linkUrl: '', images: {} };
    saved = { ...saved, fields };
    for (const purpose of ['logo', 'cover'] as const) {
      if (images[purpose]) saved.images[purpose] = images[purpose]!.name;
    }
    const persist = () => saveRecovery(owner, saved);
    persist(); // Fail before creating anything if durable recovery storage is unavailable.
    let page: RecoveryPage | undefined;
    if (!saved.pageId) {
      const drafts = await recoverPages(owner);
      if (saved.creation) {
        const attempt = saved.creation;
        const matches = drafts.filter(item => !attempt.before.includes(item.id) &&
          (['name', 'category', 'short_bio', 'description'] as const).every(key => item.fields[key] === attempt.fields[key]));
        if (matches.length !== 1) {
          throw new Error('Creation has an uncertain result. No additional page was created. Retry recovery later or contact support; your information is preserved.');
        }
        saved.pageId = matches[0].id;
        persist();
      } else {
        if (drafts.length) throw new Error('An unfinished page already exists. Choose it above to resume before creating another.');
        saved.creation = { before: drafts.map(item => item.id), fields };
        persist(); // Record uncertainty BEFORE sending the creation request; never blindly resend it.
        const result = await recoveryRequest(owner, '/api/creatorverse/pages/draft', 'POST', {
          name: fields.name, category: fields.category, short_bio: fields.short_bio, description: fields.description,
        });
        if (typeof result.page?.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(result.page.id)) {
          throw new Error('Creation response was uncertain. Retry recovery; do not create another page.');
        }
        saved.pageId = result.page.id;
        persist();
      }
    }
    const id = saved.pageId!;
    [page] = await recoverPages(owner, id); // Server verifies ownership and existing editing permission.
    if (!page) throw new Error('The saved page could not be recovered.');
    if (page.status === 'active') return complete(id);
    const details = await recoveryRequest(owner, `/api/creatorverse/pages/${id}/details`, 'PATCH', fields);
    if (details.page?.id !== id) throw new Error('Details were not confirmed. Resume this draft to retry.');
    for (const purpose of ['logo', 'cover'] as const) {
      // Server-confirmed images always survive retries, including a lost verification response.
      if (page.images[purpose]) continue;
      const file = images[purpose];
      if (saved.images[purpose] && !file) throw new Error(`Reselect the unfinished ${purpose} image (${saved.images[purpose]}). Previously saved images will be kept.`);
      if (!file) continue;
      if (!pageImageUploadsApproved()) throw new Error('Image uploads are unavailable. Your draft has been preserved.');
      for (const pending of page.pending.filter(item => item.purpose === purpose)) {
        await recoveryRequest(owner, `/api/creatorverse/pages/${id}/images/${pending.id}/cancel`, 'POST');
      }
      await uploadCreatorVersePageImage(id, purpose, file, owner);
    }
    const activation = await recoveryRequest(owner, `/api/creatorverse/pages/${id}/activate`, 'POST');
    if (activation.page?.id !== id || activation.page?.status !== 'active') throw new Error('Activation was not confirmed. Resume this draft to check its status.');
    const [confirmed] = await recoverPages(owner, id);
    if (confirmed?.status !== 'active') throw new Error('Activation could not be verified. Your recovery information is preserved.');
    return complete(id);
  });
}

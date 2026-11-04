import { CREATORVERSE_CATEGORIES, type PageFields, type PublicLink } from './types';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function pageId(value: string): string {
  if (!UUID.test(value)) throw new Error('Invalid page identifier');
  return value;
}
export function publicUrl(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) throw new Error('Invalid website');
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid website');
  return url.href;
}
function text(value: unknown, max: number, min = 0): string {
  if (typeof value !== 'string') throw new Error('Invalid text');
  const result = value.trim();
  if (result.length < min || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) throw new Error('Invalid text');
  return result;
}
export function validatePageFields(input: unknown): PageFields {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid page');
  const row = input as Record<string, unknown>;
  if (typeof row.category !== 'string' || !Object.hasOwn(CREATORVERSE_CATEGORIES, row.category)) throw new Error('Invalid category');
  const links = row.social_links ?? [];
  if (!Array.isArray(links) || links.length > 8) throw new Error('Use at most eight public links');
  const social_links: PublicLink[] = links.map(link => {
    if (!link || typeof link !== 'object') throw new Error('Invalid link');
    const url = publicUrl(link.url);
    if (!url) throw new Error('Link URL required');
    return { label: text(link.label, 60, 1), url };
  });
  const email = row.public_email == null || row.public_email === '' ? null : text(row.public_email, 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid public email');
  return {
    name: text(row.name, 100, 3), category: row.category as PageFields['category'],
    short_bio: text(row.short_bio ?? '', 240), description: text(row.description ?? '', 5000),
    website: publicUrl(row.website), social_links, public_email: email,
    location: text(row.location ?? '', 160),
  };
}
export function directoryQuery(params: URLSearchParams) {
  const rawOffset = params.get('offset') ?? '0';
  if (!/^\d{1,5}$/.test(rawOffset)) throw new Error('Invalid offset');
  const search = text(params.get('search') ?? '', 100);
  const category = params.get('category');
  if (category !== null && !Object.hasOwn(CREATORVERSE_CATEGORIES, category)) throw new Error('Invalid category');
  return { search, category, offset: Number(rawOffset), limit: 20 };
}

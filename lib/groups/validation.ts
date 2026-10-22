export const IMAGE_LIMIT = 8 * 1024 * 1024;
export const VIDEO_LIMIT = 32 * 1024 * 1024;
export const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'] as const;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateUpload(type: string, size: number, cover = false): void {
  if (!(MEDIA_TYPES as readonly string[]).includes(type) || (cover && !type.startsWith('image/'))) throw new Error('Choose a JPEG, PNG, WebP, MP4 or WebM file. Covers must be images.');
  if (!Number.isFinite(size) || size <= 0 || size > (type.startsWith('image/') ? IMAGE_LIMIT : VIDEO_LIMIT)) throw new Error('Images must be 8 MB or less; videos 32 MB or less.');
}
export function matchesSignature(type: string, bytes: Uint8Array): boolean {
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  if (type === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === 'image/png') return [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  if (type === 'image/webp') return ascii(0,4) === 'RIFF' && ascii(8,4) === 'WEBP';
  if (type === 'video/mp4') return ascii(4,4) === 'ftyp';
  if (type === 'video/webm') return [26,69,223,163].every((v,i) => bytes[i] === v);
  return false;
}
/** Validate authorized download bytes independently of a generic transport MIME.
 * Upload validation remains strict; only missing/octet-stream download types are inferred.
 */
export async function validateDownloadedMedia(data: Blob, cover = false): Promise<string> {
  if (!Number.isFinite(data.size) || data.size <= 0 || data.size > VIDEO_LIMIT) throw new Error('Invalid media size');
  const bytes = new Uint8Array(await data.slice(0, 16).arrayBuffer());
  const declared = data.type.split(';', 1)[0].trim().toLowerCase();
  const type = declared === '' || declared === 'application/octet-stream'
    ? MEDIA_TYPES.find(candidate => matchesSignature(candidate, bytes)) ?? ''
    : declared;
  validateUpload(type, data.size, cover);
  if (!matchesSignature(type, bytes)) throw new Error('Invalid media signature');
  return type;
}
export function validateGroupFields(name: unknown, description: unknown, visibility: unknown): void {
  if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 100) throw new Error('Group names must be 3–100 characters.');
  if (typeof description !== 'string' || description.length > 5000) throw new Error('Descriptions must be at most 5,000 characters.');
  if (visibility !== 'public' && visibility !== 'private') throw new Error('Choose Public or Private.');
}

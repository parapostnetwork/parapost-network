'use client';

import { IMAGE_SOURCE_MAX_BYTES, IMAGE_SOURCE_MAX_PIXELS, optimizeImageUpload } from '@/lib/images/optimize-upload';
import { matchesPageImageSignature, PAGE_IMAGE_FORMATS } from './page-image-validation';

export const PAGE_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';
const supportedTypes = [...Object.keys(PAGE_IMAGE_FORMATS), 'image/heic', 'image/heif'];
const heifError = () => new Error('This browser could not read the HEIC/HEIF photo. Open this page in Safari on your iPhone, or choose a JPEG, PNG or WebP copy.');

export function validatePageImageSource(file: Pick<File, 'type' | 'size' | 'name'>) {
  if (!supportedTypes.includes(file.type) &&
      !((file.type === '' || file.type === 'application/octet-stream') && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))) {
    throw new Error('Choose a JPEG, PNG, WebP, HEIC or HEIF image.');
  }
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > IMAGE_SOURCE_MAX_BYTES) {
    throw new Error('Choose an image smaller than 25 MB.');
  }
}

function isHeif(bytes: Uint8Array) {
  if (bytes.length < 16) return false;
  const text = (offset: number) => String.fromCharCode(...bytes.slice(offset, offset + 4));
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (text(4) !== 'ftyp' || size < 16 || size > bytes.length || size % 4 !== 0) return false;
  const brands = [text(8)];
  for (let offset = 16; offset < size; offset += 4) brands.push(text(offset));
  return brands.some(brand => ['heic', 'heix', 'mif1'].includes(brand));
}

/** New selections only. Storage still accepts only server-decoded JPEG/PNG/WebP. */
export async function preparePageImage(file: File, purpose: 'logo' | 'cover'): Promise<File> {
  validatePageImageSource(file);
  const header = new Uint8Array(await file.slice(0, 256).arrayBuffer());
  const mime = Object.keys(PAGE_IMAGE_FORMATS).find(type => matchesPageImageSignature(type, header));
  if (mime) {
    // Some iOS providers omit MIME; only bytes, never an extension, establish the type.
    const normalized = new File([file], file.name, { type: mime });
    const result = await optimizeImageUpload(normalized, purpose === 'logo' ? 'avatar' : 'cover');
    if (result.file.size > PAGE_IMAGE_FORMATS['image/jpeg'].maxBytes) throw new Error('Choose a smaller image.');
    return result.file;
  }
  if (!isHeif(header)) throw new Error('The selected file is not a supported image.');

  // Safari 17+ decodes HEIC/HEIF natively, including EXIF orientation. No raw HEIF reaches storage.
  const image = new Image();
  const canvas = document.createElement('canvas');
  const url = URL.createObjectURL(new Blob([file], { type: 'image/heic' }));
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(heifError()), 20000);
      image.onload = () => { clearTimeout(timer); resolve(); };
      image.onerror = () => { clearTimeout(timer); reject(heifError()); };
      image.src = url;
    });
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
        width > 16384 || height > 16384 || width * height > IMAGE_SOURCE_MAX_PIXELS) {
      throw new Error('Choose a smaller-resolution photo.');
    }
    const scale = Math.min(1, (purpose === 'logo' ? 512 : 1920) / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw heifError();
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob>((resolve, reject) => {
      const timer = setTimeout(() => reject(heifError()), 20000);
      canvas.toBlob(blob => {
        clearTimeout(timer);
        if (blob?.type === 'image/jpeg' && blob.size > 0 && blob.size <= PAGE_IMAGE_FORMATS['image/jpeg'].maxBytes) resolve(blob);
        else reject(heifError());
      }, 'image/jpeg', 0.85);
    });
    if (!matchesPageImageSignature('image/jpeg', new Uint8Array(await jpeg.slice(0, 16).arrayBuffer()))) throw heifError();
    return new File([jpeg], file.name.replace(/\.[^.]*$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    URL.revokeObjectURL(url);
    canvas.width = 0;
    canvas.height = 0;
  }
}

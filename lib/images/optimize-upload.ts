/** Browser-only processing of NEW uploads. Existing URLs/objects are never changed. */
export type ImagePurpose = "post" | "avatar" | "cover";
export const IMAGE_SOURCE_MAX_BYTES = 25 * 1024 * 1024;
export const IMAGE_SOURCE_MAX_PIXELS = 50_000_000;
const MAX_SIDE = 16384;
const QUALITY = 0.82;
// Conservative application ceilings, not a claim about live bucket configuration.
export const IMAGE_FINAL_MAX_BYTES = { post: 9_000_000, avatar: 2_000_000, cover: 9_000_000 };
class ImageUploadError extends Error {}
const unreadable = () => new ImageUploadError("This image could not be read. Please choose another JPEG, PNG, or WebP photo.");

export function validateImageSource(file: Pick<File, "type" | "size">) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new ImageUploadError("Please choose a JPEG, PNG, or WebP image.");
  }
  if (!file.size || file.size > IMAGE_SOURCE_MAX_BYTES) {
    throw new ImageUploadError("Please choose an image smaller than 25 MB.");
  }
}

/** Inspect a bounded header BEFORE allocating a decoded image. Decoder validates the rest. */
export function readImageDimensions(bytes: Uint8Array, type: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, length: number) => String.fromCharCode(...bytes.slice(offset, offset + length));
  let width = 0, height = 0;
  if (type === "image/png" && bytes.length >= 24 && text(1, 3) === "PNG" && bytes[0] === 137 && text(12, 4) === "IHDR") {
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (type === "image/webp" && bytes.length >= 30 && text(0, 4) === "RIFF" && text(8, 4) === "WEBP") {
    const chunk = text(12, 4);
    if (chunk === "VP8X") {
      if (bytes[20] & 2) throw new ImageUploadError("Please choose a still image rather than an animated WebP.");
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) {
      width = view.getUint16(26, true) & 0x3fff; height = view.getUint16(28, true) & 0x3fff;
    }
  } else if (type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 7 >= bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break;
      }
      offset += length;
    }
  }
  if (!width || !height) throw unreadable();
  validateDimensions(width, height);
  return { width, height };
}
function validateDimensions(width: number, height: number) {
  if (!Number.isFinite(width * height) || width <= 0 || height <= 0 || width > MAX_SIDE || height > MAX_SIDE || width * height > IMAGE_SOURCE_MAX_PIXELS) {
    throw new ImageUploadError("This image has unusually large dimensions. Please choose a smaller-resolution photo.");
  }
}
export function optimizedDimensions(width: number, height: number, purpose: ImagePurpose) {
  validateDimensions(width, height);
  const scale = purpose === "cover" ? Math.min(1, 1920 / width) : Math.min(1, (purpose === "avatar" ? 512 : 2048) / Math.max(width, height));
  const result = { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  // Extremely tall covers are not useful and may exceed mobile canvas limits.
  if (result.height > 8192) throw new ImageUploadError("This image is too tall for a cover. Please choose another photo.");
  return result;
}
export function validateFinalImage(size: number, purpose: ImagePurpose) {
  if (!size || size > IMAGE_FINAL_MAX_BYTES[purpose]) throw new ImageUploadError("The optimized image is still too large. Please choose another photo.");
}

function decode(image: HTMLImageElement, url: string) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer); image.onload = null; image.onerror = null;
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => finish(unreadable()), 20000);
    image.onload = () => finish(); image.onerror = () => finish(unreadable()); image.src = url;
  });
}
function encode(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { settled = true; reject(new ImageUploadError("Image preparation took too long. Please try again.")); }, 20000);
    try {
      canvas.toBlob(blob => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (blob?.size) resolve(blob); else reject(new ImageUploadError("This image could not be prepared. Please try another photo."));
      }, type, QUALITY);
    } catch {
      settled = true; clearTimeout(timer); reject(unreadable());
    }
  });
}

export async function optimizeImageUpload(file: File, purpose: ImagePurpose) {
  validateImageSource(file);
  readImageDimensions(new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer()), file.type);
  const image = new Image();
  const canvas = document.createElement("canvas");
  const url = URL.createObjectURL(file);
  try {
    // HTML image decoding applies the browser's EXIF orientation exactly once.
    await decode(image, url);
    const { width, height } = optimizedDimensions(image.naturalWidth, image.naturalHeight, purpose);
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new ImageUploadError("Your browser could not prepare this image. Please try again.");
    context.drawImage(image, 0, 0, width, height);
    // WebP preserves alpha. Unsupported encoders return PNG, also alpha-safe.
    let encoded = await encode(canvas, "image/webp");
    // Older browsers may return PNG when WebP encoding is unavailable.
    // JPEG sources cannot carry alpha; avoid an unnecessarily large PNG there.
    if (encoded.type === "image/png" && file.type === "image/jpeg") encoded = await encode(canvas, "image/jpeg");
    if (!["image/webp", "image/png", ...(file.type === "image/jpeg" ? ["image/jpeg"] : [])].includes(encoded.type)) throw unreadable();
    const resized = width !== image.naturalWidth || height !== image.naturalHeight;
    // Only a small, decoded, already-in-bounds original is a safe size alternative.
    // Never use this branch after a decode/encode error, or to bypass resizing.
    const output = !resized && file.size <= 1_000_000 && file.size < encoded.size ? file : encoded;
    validateFinalImage(output.size, purpose);
    const extension = output.type === "image/jpeg" ? "jpg" : output.type === "image/png" ? "png" : "webp";
    const name = (file.name.replace(/\.[^.]*$/, "") || "photo") + "." + extension;
    return { file: new File([output], name, { type: output.type }), width, height, size: output.size };
  } catch (error) {
    if (error instanceof ImageUploadError) throw error;
    throw new ImageUploadError("This image could not be prepared. Please try another photo.");
  } finally {
    image.onload = null; image.onerror = null; image.removeAttribute("src");
    URL.revokeObjectURL(url); canvas.width = 0; canvas.height = 0;
  }
}

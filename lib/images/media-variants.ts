import { optimizeImageUpload } from "@/lib/images/optimize-upload";

export type VariantPurpose = "post" | "avatar";
type UploadError = { message: string } | null;
type UploadOptions = { cacheControl: string; contentType?: string; upsert: boolean };
type StorageBucket = { upload(path: string, file: File, options: UploadOptions): PromiseLike<{ error: UploadError }> };

export function variantPaths(path: string, purpose: VariantPurpose, master: { width: number; height: number }, thumb: { width: number; height: number; type: string }) {
  const split = path.lastIndexOf(".");
  if (split < 0) throw new Error("Image path needs an extension.");
  const base = path.slice(0, split), ext = path.slice(split + 1);
  const thumbExt = thumb.type === "image/jpeg" ? "jpg" : thumb.type === "image/png" ? "png" : "webp";
  return {
    master: `${base}--ppv1-${purpose}-m${master.width}x${master.height}-t${thumb.width}x${thumb.height}-${thumbExt}.${ext}`,
    thumbnail: `${base}--ppv1-${purpose}-thumb.${thumbExt}`,
  };
}

/** Publish a variant-aware master path only AFTER its optional thumbnail succeeded.
 * No DB writes, deletes, overwrites, or existing-object probes. On optional failure
 * use the already optimized Phase B master with its ordinary, unmarked path.
 */
export async function uploadImageWithVariant(bucket: StorageBucket, path: string, master: File, purpose: VariantPurpose, options: UploadOptions) {
  let masterPath = path;
  try {
    const thumb = await optimizeImageUpload(master, purpose, true);
    if (thumb.width < thumb.sourceWidth && thumb.height <= thumb.sourceHeight && thumb.file.size < master.size) {
      const paths = variantPaths(path, purpose, { width: thumb.sourceWidth, height: thumb.sourceHeight }, { width: thumb.width, height: thumb.height, type: thumb.file.type });
      // A stalled optional upload must not block publishing the master indefinitely.
      // A late thumbnail may remain unreferenced; it must never mark the master ready.
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const { error } = await Promise.race([
        Promise.resolve(bucket.upload(paths.thumbnail, thumb.file, { ...options, contentType: thumb.file.type, upsert: false })),
        new Promise<{ error: UploadError }>(resolve => {
          timeout = setTimeout(() => resolve({ error: { message: "Thumbnail upload timed out." } }), 15_000);
        }),
      ]).finally(() => clearTimeout(timeout));
      if (!error) masterPath = paths.master;
    }
  } catch {
    // Optional thumbnail failure must not fail an otherwise safe master upload.
  }
  try {
    const { error } = await bucket.upload(masterPath, master, { ...options, upsert: false });
    return { path: masterPath, error };
  } catch {
    return { path: masterPath, error: { message: "The image could not be uploaded. Please try again." } };
  }
}

export function mediaVariantSources(src: string, purpose: VariantPurpose) {
  try {
    const url = new URL(src);
    if (!/^https?:$/.test(url.protocol) || !/\/storage\/v1\/object\/public\/(avatars|post-images)\//.test(url.pathname) || url.search || url.hash) return null;
    const match = url.pathname.match(/^(.*)--ppv1-(post|avatar)-m(\d+)x(\d+)-t(\d+)x(\d+)-(webp|png|jpg)\.(webp|png|jpg)$/);
    if (!match || match[2] !== purpose) return null;
    const [width, height, thumbWidth, thumbHeight] = match.slice(3, 7).map(Number);
    if (![width, height, thumbWidth, thumbHeight].every(n => Number.isSafeInteger(n) && n > 0) || thumbWidth >= width || thumbHeight > height || width > 2048 || height > 2048) return null;
    url.pathname = `${match[1]}--ppv1-${purpose}-thumb.${match[7]}`;
    return { thumbnail: url.href, width, height, thumbWidth, thumbHeight };
  } catch { return null; }
}

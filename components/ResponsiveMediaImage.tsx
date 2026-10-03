"use client";

import { useState, type ImgHTMLAttributes } from "react";
import { mediaVariantSources, type VariantPurpose } from "@/lib/images/media-variants";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "onError"> & {
  src: string;
  purpose: VariantPurpose;
  avatarSize?: number;
};

/** The DB/master URL stays intact, including for all viewer click handlers. */
export default function ResponsiveMediaImage({ src, purpose, avatarSize, sizes, alt = "", ...props }: Props) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const variant = failedSource === src ? null : mediaVariantSources(src, purpose);
  // Account for object-fit:cover on non-square avatars when selecting density.
  const responsiveSizes = variant && avatarSize ? `${Math.ceil(avatarSize * Math.max(1, variant.width / variant.height))}px` : sizes;
  return (
    // Native srcSet selects our stored variants without a second optimization service.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      width={variant?.width}
      height={variant?.height}
      {...props}
      alt={alt}
      src={src}
      srcSet={variant ? `${variant.thumbnail} ${variant.thumbWidth}w, ${src} ${variant.width}w` : undefined}
      sizes={variant ? responsiveSizes : undefined}
      onError={variant ? event => {
        // Remove candidates before switching so failure never loops on the thumbnail.
        event.currentTarget.removeAttribute("srcset");
        event.currentTarget.removeAttribute("sizes");
        event.currentTarget.src = src;
        setFailedSource(src);
      } : undefined}
    />
  );
}

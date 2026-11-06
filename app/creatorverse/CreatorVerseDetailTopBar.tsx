'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export default function CreatorVerseDetailTopBar({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  const isIndividualPage =
    /^\/creatorverse\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(
      pathname
    );

  if (isIndividualPage) {
    return null;
  }

  return <>{children}</>;
}

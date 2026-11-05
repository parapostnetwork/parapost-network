'use client';

import { createContext, useContext, type ReactNode } from 'react';

const PreviewAccess = createContext(false);

export function useCreatorVersePreviewAccess() {
  return useContext(PreviewAccess);
}

export default function CreatorVersePreviewAccess({
  enabled, children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return (
    <PreviewAccess.Provider value={enabled}>
      {children}
    </PreviewAccess.Provider>
  );
}

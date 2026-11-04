'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

type State = {
  enabled: boolean;
  selected: boolean;
  setSelected: (value: boolean) => void;
  formOpen: boolean;
  setFormOpen: (value: boolean) => void;
};

const Context = createContext<State>({
  enabled: false,
  selected: false,
  setSelected: () => {},
  formOpen: false,
  setFormOpen: () => {},
});

export function useCreatorVerseStaging() {
  return useContext(Context);
}

export default function CreatorVerseStagingProvider({
  enabled, children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [selected, setSelected] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  return (
    <Context.Provider value={{
      enabled, selected, setSelected, formOpen, setFormOpen,
    }}>
      {children}
    </Context.Provider>
  );
}

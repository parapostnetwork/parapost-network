'use client';
import { useEffect, useState } from 'react';
import { emptyGroupPreferences, parseGroupPreferences, type GroupPreferences } from '@/lib/groups/directory';

// Store identifiers only; current authorized API results supply every displayed Group.
export function useGroupPreferences(viewerId: string) {
  const key = viewerId ? `parapost:groups:vmgelrgrtpghmvqgufzz:${viewerId}` : '';
  const [saved, setSaved] = useState<{ key: string; value: GroupPreferences }>({ key: '', value: emptyGroupPreferences() });
  const [storageError, setStorageError] = useState('');
  useEffect(() => {
    const refresh = () => {
      try { setSaved({ key, value: key ? parseGroupPreferences(localStorage.getItem(key)) : emptyGroupPreferences() }); }
      catch { setSaved({ key, value: emptyGroupPreferences() }); setStorageError('Browser storage is unavailable. Favorites and visits will last only for this page.'); }
    };
    refresh();
    const onStorage = (event: StorageEvent) => { if (event.key === key || event.key === null) refresh(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);
  const preferences = saved.key === key ? saved.value : emptyGroupPreferences();
  function update(change: (current: GroupPreferences) => GroupPreferences) {
    if (!key) return;
    let current = preferences;
    try { current = parseGroupPreferences(localStorage.getItem(key)); } catch { /* In-memory fallback. */ }
    const value = change(current);
    setSaved({ key, value });
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch { setStorageError('Browser storage is unavailable. Favorites and visits will last only for this page.'); }
  }
  return {
    preferences, storageError,
    toggleFavorite: (id: string) => update(current => ({ ...current, favorites: current.favorites.includes(id) ? current.favorites.filter(value => value !== id) : [...current.favorites, id] })),
    recordVisit: (id: string) => update(current => ({ ...current, visits: { ...current.visits, [id]: Date.now() } })),
  };
}

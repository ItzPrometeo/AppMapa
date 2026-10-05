/**
 * Favoritos ("Guardar") y destinos vistos recientemente, persistidos en el
 * dispositivo. Un único proveedor evita lecturas repetidas de AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const FAVORITES_KEY = 'spoint:favorites:v1';
const RECENT_KEY = 'spoint:recent:v1';
const MAX_RECENT = 12;

type SavedContextValue = {
  favorites: string[];
  recent: string[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => boolean;
  markViewed: (id: string) => void;
};

const SavedContext = createContext<SavedContextValue | null>(null);

async function readList(key: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]) {
  AsyncStorage.setItem(key, JSON.stringify(list)).catch(() => undefined);
}

export function SavedProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    readList(FAVORITES_KEY).then(setFavorites);
    readList(RECENT_KEY).then(setRecent);
  }, []);

  const toggleFavorite = useCallback(
    (id: string) => {
      const willSave = !favorites.includes(id);
      const next = willSave ? [id, ...favorites] : favorites.filter((x) => x !== id);
      setFavorites(next);
      writeList(FAVORITES_KEY, next);
      return willSave;
    },
    [favorites],
  );

  const markViewed = useCallback((id: string) => {
    setRecent((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENT);
      writeList(RECENT_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ favorites, recent, isFavorite: (id: string) => favorites.includes(id), toggleFavorite, markViewed }),
    [favorites, recent, toggleFavorite, markViewed],
  );

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

export function useSaved() {
  const ctx = useContext(SavedContext);
  if (!ctx) throw new Error('useSaved debe usarse dentro de <SavedProvider>');
  return ctx;
}

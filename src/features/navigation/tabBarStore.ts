/**
 * Visibilidad de la barra inferior. El mapa la oculta al entrar en una región
 * (más espacio para explorar) y la recupera al volver al Perú.
 */
import { useSyncExternalStore } from 'react';

let hidden = false;
const listeners = new Set<() => void>();

export const tabBarStore = {
  setHidden(value: boolean) {
    if (hidden === value) return;
    hidden = value;
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => hidden,
};

export const useTabBarHidden = () =>
  useSyncExternalStore(tabBarStore.subscribe, tabBarStore.getSnapshot, tabBarStore.getSnapshot);

/** Altura de la barra (sin el inset inferior del dispositivo). */
export const TAB_BAR_HEIGHT = 64;

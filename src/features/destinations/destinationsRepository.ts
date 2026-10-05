/**
 * Repositorio de destinos turísticos — separado de la geometría.
 *
 * - `byProvince` es la consulta del nivel 3: sólo se cargan los lugares de la
 *   provincia abierta (con API remota, una petición por provincia).
 * - Las provincias consultadas se guardan en caché persistente, de modo que
 *   reabrir una zona es instantáneo y funciona sin conexión.
 * - El índice de búsqueda usa el catálogo empaquetado (ligero, ~100 entradas).
 */
import { config } from '@/config';
import { PersistentCache } from '@/lib/cache';
import { fetchJson } from '@/lib/http';

import type { Destination } from './types';

const bundled = (): Destination[] => require('../../../assets/data/destinations.json');

let catalog: Destination[] | null = null;
let catalogById: Map<string, Destination> | null = null;

function getCatalog() {
  if (!catalog) {
    catalog = bundled();
    catalogById = new Map(catalog.map((d) => [d.id, d]));
  }
  return catalog;
}

const provinceCache = new PersistentCache<Destination[]>({
  namespace: 'destinations',
  version: config.cacheVersion,
  ttl: config.destinationsTtlMs,
  memoryEntries: 16,
});

const byPopularity = (a: Destination, b: Destination) => b.popularity - a.popularity;

export const destinationsRepository = {
  /** Destinos de una provincia, ordenados por popularidad. */
  async byProvince(provinceId: string, onRefresh?: (fresh: Destination[]) => void): Promise<Destination[]> {
    if (!config.apiUrl) {
      await new Promise((r) => setTimeout(r, 0));
      const list = getCatalog()
        .filter((d) => d.provinceId === provinceId)
        .sort(byPopularity);
      void provinceCache.write(provinceId, list);
      return list;
    }
    try {
      return await provinceCache.getOrLoad(
        provinceId,
        () => fetchJson<Destination[]>(`${config.apiUrl}/destinations?provinceId=${encodeURIComponent(provinceId)}`),
        onRefresh,
      );
    } catch {
      return getCatalog()
        .filter((d) => d.provinceId === provinceId)
        .sort(byPopularity);
    }
  },

  /** Lectura síncrona desde memoria (para pintar sin parpadeos al volver). */
  peekProvince(provinceId: string) {
    return provinceCache.peek(provinceId);
  },

  getById(id: string): Destination | undefined {
    getCatalog();
    return catalogById?.get(id);
  },

  countByProvince(regionId: string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const d of getCatalog()) if (d.regionId === regionId) counts[d.provinceId] = (counts[d.provinceId] ?? 0) + 1;
    return counts;
  },

  countByRegion(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const d of getCatalog()) counts[d.regionId] = (counts[d.regionId] ?? 0) + 1;
    return counts;
  },

  popular(limit = 8) {
    return [...getCatalog()].sort(byPopularity).slice(0, limit);
  },

  all() {
    return getCatalog();
  },
};

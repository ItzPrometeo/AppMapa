/**
 * Repositorio de geometría con carga perezosa por nivel:
 *
 *   Nivel Perú       → loadCountry()           25 regiones (ADM1 disuelto)
 *   Nivel región     → loadRegion(regionId)    sólo las provincias de esa región
 *   Nivel provincia  → loadProvince(id)        contorno en alto detalle de UNA provincia
 *
 * Cada capa se proyecta y convierte a paths SVG una sola vez y se guarda en
 * una LRU en memoria. Con `EXPO_PUBLIC_SPOINT_API_URL` definido, el GeoJSON se
 * descarga y se cachea en disco; si falla, se usan los datos empaquetados.
 */
import { config } from '@/config';
import { LruCache, PersistentCache } from '@/lib/cache';
import { fetchJson } from '@/lib/http';
import { PROVINCE_LOADERS, REGION_INDEX, REGION_LOADERS, loadCountry as loadBundledCountry } from '@/data/geo/manifest';
import { provinceColor, regionColor } from '@/theme/mapPalette';

import { bboxToBounds } from './projection';
import { provinceToShape, regionToShape } from './shapes';
import type { Bounds, MapShape, ProvinceFeature, ProvinceFeatureCollection, RegionFeatureCollection } from './types';

export type ShapeLayer = {
  id: string;
  shapes: MapShape[];
  byId: Map<string, MapShape>;
  bounds: Bounds;
};

const memory = {
  country: new LruCache<string, ShapeLayer>(1),
  regions: new LruCache<string, ShapeLayer>(8),
  provinces: new LruCache<string, MapShape>(24),
};

const disk = new PersistentCache<unknown>({
  namespace: 'geo',
  version: config.cacheVersion,
  ttl: config.geoTtlMs,
  memoryEntries: 4,
});

/** Remoto (con caché) si hay API configurada; si no, o si falla, empaquetado. */
async function source<T>(remotePath: string, bundled: () => T): Promise<T> {
  if (!config.apiUrl) {
    // Cede un tick para que el feedback táctil se pinte antes del trabajo de parseo.
    await new Promise((r) => setTimeout(r, 0));
    return bundled();
  }
  try {
    return (await disk.getOrLoad(remotePath, () => fetchJson<T>(`${config.apiUrl}/${remotePath}`))) as T;
  } catch {
    return bundled();
  }
}

function toLayer(id: string, shapes: MapShape[], bounds: Bounds): ShapeLayer {
  return { id, shapes, bounds, byId: new Map(shapes.map((s) => [s.id, s])) };
}

export const geoRepository = {
  regionIndex: REGION_INDEX,

  peekCountry: () => memory.country.get('peru'),
  peekRegion: (regionId: string) => memory.regions.get(regionId),
  peekProvince: (provinceId: string) => memory.provinces.get(provinceId),

  async loadCountry(): Promise<ShapeLayer> {
    const cached = memory.country.get('peru');
    if (cached) return cached;
    const fc = await source<RegionFeatureCollection>('maps/peru-regions.geo.json', loadBundledCountry);
    const layer = toLayer(
      'peru',
      fc.features.map((f) => regionToShape(f, regionColor(f.properties.id))),
      bboxToBounds(fc.bbox),
    );
    memory.country.set('peru', layer);
    return layer;
  },

  async loadRegion(regionId: string): Promise<ShapeLayer> {
    const cached = memory.regions.get(regionId);
    if (cached) return cached;
    const loader = REGION_LOADERS[regionId];
    if (!loader) throw new Error(`Región desconocida: ${regionId}`);
    const fc = await source<ProvinceFeatureCollection>(`maps/regions/${regionId}.geo.json`, loader);
    const layer = toLayer(
      regionId,
      fc.features.map((f) => provinceToShape(f, provinceColor(f.properties.tone))),
      bboxToBounds(fc.bbox),
    );
    memory.regions.set(regionId, layer);
    return layer;
  },

  async loadProvince(provinceId: string): Promise<MapShape> {
    const cached = memory.provinces.get(provinceId);
    if (cached) return cached;
    const loader = PROVINCE_LOADERS[provinceId];
    if (!loader) throw new Error(`Provincia desconocida: ${provinceId}`);
    const feature = await source<ProvinceFeature>(`maps/provinces/${provinceId}.geo.json`, loader);
    const shape = provinceToShape(feature, provinceColor(feature.properties.tone));
    memory.provinces.set(provinceId, shape);
    return shape;
  },

  regionName(regionId: string) {
    return REGION_INDEX.find((r) => r.id === regionId)?.name ?? regionId;
  },

  provinceName(provinceId: string) {
    for (const r of REGION_INDEX) {
      const p = r.provinces.find((x) => x.id === provinceId);
      if (p) return p.name;
    }
    return provinceId;
  },

  regionOfProvince(provinceId: string) {
    return REGION_INDEX.find((r) => r.provinces.some((p) => p.id === provinceId))?.id ?? null;
  },
};

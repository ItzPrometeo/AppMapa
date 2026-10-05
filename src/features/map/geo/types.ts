/** Tipos de los GeoJSON generados por scripts/build-geo.mjs. */

export type LonLat = [number, number];
/** [minLon, minLat, maxLon, maxLat] */
export type GeoBBox = [number, number, number, number];

export type PolygonGeometry =
  { type: 'Polygon'; coordinates: LonLat[][] } | { type: 'MultiPolygon'; coordinates: LonLat[][][] };

export type RegionProperties = {
  id: string;
  name: string;
  iso: string;
  bbox: GeoBBox;
  /** Polo de inaccesibilidad: mejor punto para la etiqueta. */
  label: LonLat;
};

export type ProvinceProperties = {
  id: string;
  name: string;
  regionId: string;
  bbox: GeoBBox;
  label: LonLat;
  /** Índice de color (0–5) que garantiza vecinas distintas. */
  tone?: number;
};

export type Feature<P> = { type: 'Feature'; id: string; properties: P; geometry: PolygonGeometry };
export type RegionFeature = Feature<RegionProperties>;
export type ProvinceFeature = Feature<ProvinceProperties>;

export type RegionFeatureCollection = { type: 'FeatureCollection'; bbox: GeoBBox; features: RegionFeature[] };
export type ProvinceFeatureCollection = { type: 'FeatureCollection'; bbox: GeoBBox; features: ProvinceFeature[] };

/** Rectángulo en coordenadas de mundo (proyectadas). */
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Polígono listo para dibujar: path SVG en coordenadas de mundo + datos de
 * hit-testing (anillos proyectados y bounds) calculados una sola vez.
 */
export type MapShape = {
  id: string;
  name: string;
  path: string;
  bounds: Bounds;
  /** Punto de etiqueta en coordenadas de mundo. */
  label: { x: number; y: number };
  rings: Float64Array[][];
  /** Área aproximada en unidades de mundo² (para priorizar etiquetas). */
  area: number;
  color: string;
  parentId?: string;
};

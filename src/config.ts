/**
 * Configuración de fuentes de datos.
 *
 * Por defecto todo viene empaquetado en la app (funciona offline desde el
 * primer arranque). Para producción se puede apuntar a un CDN/API definiendo
 * EXPO_PUBLIC_SPOINT_API_URL: los repositorios descargan, guardan en caché
 * persistente (stale-while-revalidate) y, si la red falla, recurren a la
 * caché o a los datos empaquetados.
 *
 *   GET {API}/maps/peru-regions.geo.json
 *   GET {API}/maps/regions/{regionId}.geo.json
 *   GET {API}/maps/provinces/{provinceId}.geo.json
 *   GET {API}/destinations?provinceId={provinceId}
 */
export const config = {
  apiUrl: process.env.EXPO_PUBLIC_SPOINT_API_URL ?? null,
  /** Versión de esquema de la caché persistente: incrementarla invalida datos guardados. */
  cacheVersion: 1,
  geoTtlMs: 7 * 24 * 60 * 60 * 1000,
  destinationsTtlMs: 6 * 60 * 60 * 1000,
  requestTimeoutMs: 8000,
} as const;

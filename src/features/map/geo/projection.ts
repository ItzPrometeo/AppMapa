/**
 * Proyección Mercator esférica en "grados Mercator":
 *   x = longitud
 *   y = -ln(tan(π/4 + φ/2)) en grados (crece hacia el sur, como la pantalla)
 *
 * Es la misma proyección que usan los mapas web, por lo que es conforme
 * (las formas no se deforman localmente) y cualquier capa de teselas XYZ
 * encajaría encima sin reproyectar. Todas las funciones son worklets para que
 * la cámara pueda usarlas en el hilo de UI.
 */
import type { Bounds, GeoBBox, LonLat } from './types';

const DEG = Math.PI / 180;

export function projectLon(lon: number): number {
  'worklet';
  return lon;
}

export function projectLat(lat: number): number {
  'worklet';
  return -Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2)) / DEG;
}

export function unprojectY(y: number): number {
  'worklet';
  return (2 * Math.atan(Math.exp(-y * DEG)) - Math.PI / 2) / DEG;
}

export function project(lon: number, lat: number): { x: number; y: number } {
  'worklet';
  return { x: projectLon(lon), y: projectLat(lat) };
}

export function bboxToBounds([minLon, minLat, maxLon, maxLat]: GeoBBox): Bounds {
  // Latitud mayor (norte) ⇒ y menor.
  return { minX: minLon, maxX: maxLon, minY: projectLat(maxLat), maxY: projectLat(minLat) };
}

export function pointBounds(points: { x: number; y: number }[], minSize = 0): Bounds {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const w = Math.max(maxX - minX, minSize) / 2;
  const h = Math.max(maxY - minY, minSize) / 2;
  return { minX: cx - w, maxX: cx + w, minY: cy - h, maxY: cy + h };
}

export const projectLonLat = ([lon, lat]: LonLat) => project(lon, lat);

/** Distancia en km entre dos coordenadas (haversine). */
export function distanceKm(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * DEG;
  const dLon = (b[0] - a[0]) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * DEG) * Math.cos(b[1] * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

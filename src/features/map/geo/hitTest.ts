/**
 * Hit-testing propio en coordenadas de mundo.
 *
 * No dependemos del onPress de cada <Path>: un único detector de gestos
 * convierte el toque a coordenadas de mundo con la inversa de la cámara y
 * aquí buscamos el polígono. Ventajas: idéntico en iOS/Android/web, funciona
 * con pan/pinch simultáneos y permite tolerancia para polígonos diminutos
 * (p. ej. Callao) que no alcanzan los 44 px táctiles.
 */
import type { MapShape } from './types';

function pointInRing(x: number, y: number, ring: Float64Array): boolean {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2];
    const yi = ring[i * 2 + 1];
    const xj = ring[j * 2];
    const yj = ring[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function shapeContains(shape: MapShape, x: number, y: number): boolean {
  const b = shape.bounds;
  if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) return false;
  for (const [outer, ...holes] of shape.rings) {
    if (pointInRing(x, y, outer) && !holes.some((h) => pointInRing(x, y, h))) return true;
  }
  return false;
}

function distanceToRingSq(x: number, y: number, ring: Float64Array): number {
  let best = Infinity;
  const n = ring.length / 2;
  for (let i = 1; i < n; i++) {
    const ax = ring[(i - 1) * 2];
    const ay = ring[(i - 1) * 2 + 1];
    const dx = ring[i * 2] - ax;
    const dy = ring[i * 2 + 1] - ay;
    const len = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len));
    const ex = ax + t * dx - x;
    const ey = ay + t * dy - y;
    const d = ex * ex + ey * ey;
    if (d < best) best = d;
  }
  return best;
}

/**
 * Devuelve el polígono bajo el punto. Si ninguno lo contiene, el más cercano
 * dentro de `tolerance` (en unidades de mundo; típicamente 12 px / zoom).
 * Los polígonos pequeños tienen prioridad cuando el toque está muy cerca de
 * ellos, para que siempre sean alcanzables.
 */
export function hitTest(shapes: readonly MapShape[], x: number, y: number, tolerance = 0): MapShape | null {
  let containing: MapShape | null = null;
  for (const s of shapes) {
    if (shapeContains(s, x, y)) {
      containing = s;
      break;
    }
  }
  if (tolerance <= 0) return containing;

  // ¿Hay un polígono diminuto (más pequeño que el área táctil) junto al dedo?
  const tolSq = tolerance * tolerance;
  let nearest: MapShape | null = null;
  let nearestD = Infinity;
  for (const s of shapes) {
    if (s === containing) continue;
    const b = s.bounds;
    if (x < b.minX - tolerance || x > b.maxX + tolerance || y < b.minY - tolerance || y > b.maxY + tolerance) continue;
    const isTiny = b.maxX - b.minX < tolerance * 2.5 && b.maxY - b.minY < tolerance * 2.5;
    if (containing && !isTiny) continue;
    for (const [outer] of s.rings) {
      const d = distanceToRingSq(x, y, outer);
      if (d < tolSq && d < nearestD) {
        nearest = s;
        nearestD = d;
      }
    }
  }
  return nearest ?? containing;
}

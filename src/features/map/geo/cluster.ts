/**
 * Clustering en espacio de pantalla (greedy por popularidad).
 *
 * A zoom de provincia, lugares muy próximos (p. ej. Plaza de Armas,
 * Qorikancha y San Pedro en Cusco) se solaparían. Se agrupan los puntos que
 * caen a menos de `radiusPx` del más popular aún libre; al tocar el grupo la
 * cámara se acerca y se reagrupa con el nuevo zoom.
 */
import { pointBounds } from './projection';
import type { Bounds } from './types';

export type ClusterInput = { id: string; x: number; y: number; popularity: number };

export type Cluster<T extends ClusterInput> = {
  id: string;
  x: number;
  y: number;
  members: T[];
  bounds: Bounds;
};

export function clusterPoints<T extends ClusterInput>(points: T[], k: number, radiusPx = 40): Cluster<T>[] {
  const r = radiusPx / k;
  const r2 = r * r;
  const sorted = [...points].sort((a, b) => b.popularity - a.popularity);
  const taken = new Set<string>();
  const clusters: Cluster<T>[] = [];
  for (const p of sorted) {
    if (taken.has(p.id)) continue;
    taken.add(p.id);
    const members = [p];
    for (const q of sorted) {
      if (taken.has(q.id)) continue;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      if (dx * dx + dy * dy <= r2) {
        taken.add(q.id);
        members.push(q);
      }
    }
    // El grupo se ancla en su miembro más popular (posición estable al reagrupar).
    clusters.push({
      id: members.length === 1 ? p.id : `cluster:${members.map((m) => m.id).join('+')}`,
      x: p.x,
      y: p.y,
      members,
      bounds: pointBounds(members),
    });
  }
  return clusters;
}

type Box = { x0: number; y0: number; x1: number; y1: number };

/**
 * Decide qué marcadores muestran su nombre sin solaparse (prioridad por
 * popularidad). Devuelve los ids con etiqueta visible.
 */
export function placeLabels(
  items: { id: string; sx: number; sy: number; width: number; priority: number }[],
  pinBox = { w: 40, h: 48 },
): Set<string> {
  const boxes: Box[] = items.map((i) => ({
    x0: i.sx - pinBox.w / 2,
    y0: i.sy - pinBox.h,
    x1: i.sx + pinBox.w / 2,
    y1: i.sy,
  }));
  const placed = new Set<string>();
  const sorted = [...items].sort((a, b) => b.priority - a.priority);
  const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  for (const it of sorted) {
    // Etiqueta centrada bajo el pin.
    const label: Box = { x0: it.sx - it.width / 2, y0: it.sy + 2, x1: it.sx + it.width / 2, y1: it.sy + 26 };
    if (boxes.some((b) => overlaps(label, b))) continue;
    boxes.push(label);
    placed.add(it.id);
  }
  return placed;
}

/** Ancho estimado de una etiqueta (12 px semibold) sin medir el texto. */
export const estimateLabelWidth = (text: string, fontSize = 12) => Math.ceil(text.length * fontSize * 0.56) + 20;

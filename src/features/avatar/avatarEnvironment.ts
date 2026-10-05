/**
 * Entorno del avatar: traduce el estado del mapa y de la pantalla a lo que
 * necesita AvatarMapController (zona visible, obstáculos y suelo permitido).
 *
 * Lee los datos de las cachés síncronas de los repositorios (no del estado de
 * React), así funciona también en mitad de una transición, cuando la capa del
 * nuevo nivel acaba de cargarse y la pantalla aún no se ha vuelto a pintar.
 */
import { destinationsRepository } from '@/features/destinations/destinationsRepository';
import { worldToScreen, type Camera, type Viewport } from '@/features/map/camera/cameraMath';
import { estimateLabelWidth } from '@/features/map/geo/cluster';
import { geoRepository } from '@/features/map/geo/geoRepository';
import { hitTest, shapeContains } from '@/features/map/geo/hitTest';
import { project } from '@/features/map/geo/projection';
import type { MapShape } from '@/features/map/geo/types';
import type { Level } from '@/features/map/state/explorerMachine';

import type { AvatarMapLevel } from './avatarMapConfig';
import type { AvatarEnvironment, LevelContext } from './AvatarMapController';
import type { Rect } from './safePosition';

type Inputs = {
  viewport: () => Viewport;
  camera: () => Camera;
  zoomProgress: () => number;
  /** Paddings de cámara por nivel (cabecera/leyenda arriba, sheet abajo). */
  insetsFor: (level: Level, opts?: { destinationOpen?: boolean }) => { top: number; bottom: number };
};

const SIDE = 20;
/**
 * Columna de controles a la derecha: zoom (+/−) y centrar en región; además
 * "Cerca de mí" en provincia. Alto = botones de 44 px + separaciones de 10 px.
 */
const CONTROLS = { width: 44, right: 16, offsetTop: 8, regionHeight: 44 * 3 + 10, localHeight: 44 * 4 + 20 };

const mapLevel = (l: AvatarMapLevel): Level => (l === 'COUNTRY' ? 'country' : l === 'REGION' ? 'region' : 'province');

/** Rectángulo de una etiqueta de polígono centrada en su punto de etiqueta. */
function labelRects(shapes: MapShape[], cam: Camera, vp: Viewport, fontSize: number): Rect[] {
  const rects: Rect[] = [];
  for (const s of shapes) {
    const w = estimateLabelWidth(s.name, fontSize);
    // Sólo las etiquetas que el mapa muestra (las que caben en su polígono).
    const sw = (s.bounds.maxX - s.bounds.minX) * cam.k;
    const sh = (s.bounds.maxY - s.bounds.minY) * cam.k;
    if (sw < w * 0.85 || sh < 26) continue;
    const p = worldToScreen(s.label.x, s.label.y, cam, vp);
    rects.push({ x0: p.x - w / 2, y0: p.y - 12, x1: p.x + w / 2, y1: p.y + 12 });
  }
  return rects;
}

export function createAvatarEnvironment(inputs: Inputs): AvatarEnvironment {
  return {
    viewport: inputs.viewport,
    camera: inputs.camera,
    zoomProgress: inputs.zoomProgress,

    visibleMapHeight() {
      const vp = inputs.viewport();
      return vp.height - inputs.insetsFor('country').top;
    },

    visibleArea(level) {
      const vp = inputs.viewport();
      const { top, bottom } = inputs.insetsFor(mapLevel(level), { destinationOpen: level === 'DESTINATION' });
      return { x0: SIDE, y0: top + 12, x1: vp.width - SIDE, y1: vp.height - bottom - 16 };
    },

    obstacles(level, cam, ctx: LevelContext) {
      const vp = inputs.viewport();
      const rects: Rect[] = [];
      // Controles de navegación (zoom / centrar) en región y provincia.
      if (level !== 'COUNTRY') {
        const top = inputs.insetsFor(mapLevel(level)).top + CONTROLS.offsetTop;
        const height = level === 'REGION' ? CONTROLS.regionHeight : CONTROLS.localHeight;
        rects.push({
          x0: vp.width - CONTROLS.right - CONTROLS.width,
          y0: top,
          x1: vp.width - CONTROLS.right,
          y1: top + height,
        });
      }
      // Etiquetas importantes del nivel (ICA, PISCO, NAZCA…).
      if (level === 'COUNTRY') {
        const country = geoRepository.peekCountry();
        if (country) rects.push(...labelRects(country.shapes, cam, vp, 11));
      } else if (level === 'REGION' && ctx.regionId) {
        const region = geoRepository.peekRegion(ctx.regionId);
        if (region) rects.push(...labelRects(region.shapes, cam, vp, 12));
      } else if (ctx.provinceId) {
        // Marcadores turísticos (pin + nombre debajo).
        for (const d of destinationsRepository.peekProvince(ctx.provinceId) ?? []) {
          const p = project(d.longitude, d.latitude);
          const s = worldToScreen(p.x, p.y, cam, vp);
          const w = Math.max(44, estimateLabelWidth(d.name));
          rects.push({ x0: s.x - 22, y0: s.y - 50, x1: s.x + 22, y1: s.y });
          rects.push({ x0: s.x - w / 2, y0: s.y, x1: s.x + w / 2, y1: s.y + 28 });
        }
      }
      return rects;
    },

    accept(level, ctx) {
      // Los pies deben quedar sobre el territorio del nivel (no en el mar).
      if (level === 'COUNTRY') {
        const country = geoRepository.peekCountry();
        return country ? (w) => hitTest(country.shapes, w.x, w.y) !== null : undefined;
      }
      if (level === 'REGION') {
        const shape = ctx.regionId ? geoRepository.peekCountry()?.byId.get(ctx.regionId) : undefined;
        return shape ? (w) => shapeContains(shape, w.x, w.y) : undefined;
      }
      const shape =
        (ctx.provinceId && geoRepository.peekProvince(ctx.provinceId)) ||
        (ctx.provinceId && ctx.regionId && geoRepository.peekRegion(ctx.regionId)?.byId.get(ctx.provinceId)) ||
        undefined;
      return shape ? (w) => shapeContains(shape, w.x, w.y) : undefined;
    },
  };
}

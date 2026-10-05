/**
 * Matemática pura del avatar (sin React ni three.js) — testeada en
 * src/__tests__/avatarMath.test.ts.
 */
import { AVATAR_MAP_CONFIG, type AvatarMapLevel, type AvatarMovementMode } from './avatarMapConfig';

const cfg = AVATAR_MAP_CONFIG;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Alto del avatar en pantalla (px) para un nivel.
 *
 *   base   = clamp(altoVisibleDelMapa · 0.095, 44, 72)
 *   alto   = base · multiplicadorDelNivel (0.9 … 1.05)
 *
 * NO depende del zoom geográfico: si el mapa se acerca 5×, el guía no crece 5×.
 */
export function avatarHeightFor(visibleMapHeight: number, level: AvatarMapLevel): number {
  const base = clamp(visibleMapHeight * cfg.preferredHeightRatio, cfg.minHeight, cfg.maxHeight);
  return base * cfg.levelScale[level];
}

/** Mayor alto posible (para dimensionar una sola vez el lienzo 3D). */
export const MAX_AVATAR_HEIGHT = cfg.maxHeight * Math.max(...Object.values(cfg.levelScale));

/**
 * normalizeAvatarScale — escala que hay que aplicar al modelo para que mida
 * `desiredScreenHeight` píxeles en pantalla.
 *
 * La cámara ortográfica del lienzo trabaja en unidades de PÍXEL (1 unidad = 1 px
 * lógico), así que basta con: escala = altoDeseado / altoDelModelo.
 * Con la cámara inclinada `pitch` grados, un objeto vertical se ve acortado por
 * cos(pitch); se compensa dividiendo por ese factor. `modelHeight` sale del
 * bounding box del GLB calculado UNA vez al cargar (el GLB puede tener
 * cualquier unidad: aquí no hay ningún "scale = 0.015" mágico).
 */
export function normalizeAvatarScale(modelHeight: number, desiredScreenHeight: number, pitchRad: number): number {
  if (modelHeight <= 0) return 1;
  return desiredScreenHeight / (modelHeight * Math.cos(pitchRad));
}

/**
 * Orientación del cuerpo hacia un desplazamiento en pantalla.
 * El suelo del mapa es el plano X–Z del avatar: derecha en pantalla = +X y
 * abajo en pantalla = hacia el espectador = +Z. Por eso:
 *   rotationY = atan2(dx, dz)   con dz = dy de pantalla
 * `forwardOffset` corrige hacia dónde mira el modelo en reposo (el GLB mira a −Z ⇒ π).
 */
export function headingFromScreenDelta(dx: number, dy: number, forwardOffset: number): number {
  return Math.atan2(dx, dy) + forwardOffset;
}

/** Diferencia angular más corta (para girar por el lado corto, sin vueltas completas). */
export function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** WALK / RUN / TRANSITION según la distancia en pantalla relativa al ancho del mapa. */
export function chooseMovement(distancePx: number, mapWidth: number): AvatarMovementMode {
  const r = distancePx / Math.max(1, mapWidth);
  if (distancePx < 2) return 'IDLE';
  if (r < cfg.movement.walkDistanceThreshold) return 'WALK';
  if (r < cfg.movement.transitionDistanceThreshold) return 'RUN';
  return 'TRANSITION';
}

/** Duración del trayecto: distancia / velocidad del modo, acotada. */
export function travelDurationMs(distancePx: number, mode: AvatarMovementMode): number {
  const speed = mode === 'RUN' ? cfg.movement.runSpeedPxPerSec : cfg.movement.walkSpeedPxPerSec;
  return Math.round(clamp((distancePx / speed) * 1000, cfg.movement.minTravelMs, cfg.movement.maxTravelMs));
}

/**
 * Opacidad del avatar en función del progreso del zoom (worklet: se evalúa en
 * el hilo de UI en cada frame del vuelo). `from` es la opacidad visible cuando
 * empezó el zoom, para no "parpadear" si se interrumpe una transición previa.
 *
 *   1 ──┐            ┌── 1
 *       └─┐        ┌─┘
 *         └── 0 ───┘
 *     fadeStart  fadeEnd  ·  fadeInStart  fadeInEnd
 */
export function zoomOpacity(progress: number, from: number): number {
  'worklet';
  const t = cfg.transition;
  const smooth = (x: number) => x * x * (3 - 2 * x);
  if (progress <= t.zoomFadeStart) return from;
  if (progress < t.zoomFadeEnd) {
    return from * (1 - smooth((progress - t.zoomFadeStart) / (t.zoomFadeEnd - t.zoomFadeStart)));
  }
  if (progress < t.zoomFadeInStart) return 0;
  if (progress < t.zoomFadeInEnd) {
    return smooth((progress - t.zoomFadeInStart) / (t.zoomFadeInEnd - t.zoomFadeInStart));
  }
  return 1;
}

/** Crossfade (s) para pasar de un clip a otro. */
export function crossFadeFor(from: string | null, to: string): number {
  if (!from) return cfg.crossFadeDuration;
  return cfg.crossFades[`${from}>${to}`] ?? cfg.crossFadeDuration;
}

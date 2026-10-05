/**
 * Matemática de cámara 2D — funciones puras y worklets (sin React).
 *
 * Modelo:
 *   Camera = { x, y, k }
 *     (x, y): punto del mundo que aparece en el CENTRO del viewport
 *     k:      píxeles por unidad de mundo (zoom lineal)
 *
 *   pantalla = (mundo − (x, y)) · k + (W/2, H/2)
 *
 * Las animaciones entre cámaras usan la interpolación "smooth zoom & pan" de
 * van Wijk & Nuij (la misma que d3.interpolateZoom): la velocidad percibida es
 * constante y, en vuelos largos, la cámara se aleja un poco y vuelve a acercarse,
 * dando sensación de desplazamiento físico sobre el territorio.
 */
import type { Bounds } from '../geo/types';

export type Camera = { x: number; y: number; k: number };
export type Padding = { top: number; right: number; bottom: number; left: number };
export type Viewport = { width: number; height: number };

export const ZERO_PADDING: Padding = { top: 0, right: 0, bottom: 0, left: 0 };

export type FitOptions = {
  padding?: Padding;
  /** Zoom máximo permitido (px por unidad de mundo). */
  maxZoom?: number;
  /** Tamaño mínimo (unidades de mundo) del área encuadrada, para puntos o zonas diminutas. */
  minExtent?: number;
};

// Nota: los worklets se compilan como constantes (sin hoisting), por eso
// las funciones auxiliares se declaran antes de usarse.

/**
 * Cámara que coloca el punto de mundo (wx, wy) en el centro del área útil
 * (teniendo en cuenta paddings asimétricos como cabecera o bottom sheet).
 */
export function centerOn(
  wx: number,
  wy: number,
  k: number,
  viewport: Viewport,
  padding: Padding = ZERO_PADDING,
): Camera {
  'worklet';
  const focusX = padding.left + (viewport.width - padding.left - padding.right) / 2;
  const focusY = padding.top + (viewport.height - padding.top - padding.bottom) / 2;
  return { x: wx - (focusX - viewport.width / 2) / k, y: wy - (focusY - viewport.height / 2) / k, k };
}

/** Calcula la cámara que encuadra `bounds` dentro del área útil (viewport − padding). */
export function fitBounds(bounds: Bounds, viewport: Viewport, options: FitOptions = {}): Camera {
  'worklet';
  const p = options.padding ?? ZERO_PADDING;
  const minExtent = options.minExtent ?? 1e-6;
  const availW = Math.max(1, viewport.width - p.left - p.right);
  const availH = Math.max(1, viewport.height - p.top - p.bottom);
  const bw = Math.max(bounds.maxX - bounds.minX, minExtent);
  const bh = Math.max(bounds.maxY - bounds.minY, minExtent);
  let k = Math.min(availW / bw, availH / bh);
  if (options.maxZoom !== undefined) k = Math.min(k, options.maxZoom);
  return centerOn((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, k, viewport, p);
}

export function worldToScreen(wx: number, wy: number, cam: Camera, viewport: Viewport) {
  'worklet';
  return { x: (wx - cam.x) * cam.k + viewport.width / 2, y: (wy - cam.y) * cam.k + viewport.height / 2 };
}

export function screenToWorld(sx: number, sy: number, cam: Camera, viewport: Viewport) {
  'worklet';
  return { x: (sx - viewport.width / 2) / cam.k + cam.x, y: (sy - viewport.height / 2) / cam.k + cam.y };
}

/** Matriz afín [a, b, c, d, e, f] para un <G> SVG: mundo → pantalla. */
export function cameraMatrix(cam: Camera, viewport: Viewport): [number, number, number, number, number, number] {
  'worklet';
  return [cam.k, 0, 0, cam.k, viewport.width / 2 - cam.x * cam.k, viewport.height / 2 - cam.y * cam.k];
}

/** Zoom manteniendo fijo el punto de pantalla (fx, fy) — pinch y botones +/−. */
export function zoomAround(cam: Camera, factor: number, fx: number, fy: number, viewport: Viewport): Camera {
  'worklet';
  const k = cam.k * factor;
  const wx = (fx - viewport.width / 2) / cam.k + cam.x;
  const wy = (fy - viewport.height / 2) / cam.k + cam.y;
  return { x: wx - (fx - viewport.width / 2) / k, y: wy - (fy - viewport.height / 2) / k, k };
}

export type CameraLimits = { minK: number; maxK: number; bounds: Bounds };

/** Mantiene el zoom en rango y el centro dentro de los límites del nivel actual. */
export function constrain(cam: Camera, limits: CameraLimits, overscroll = 1): Camera {
  'worklet';
  const k = Math.min(limits.maxK, Math.max(limits.minK * overscroll, cam.k));
  const b = limits.bounds;
  return {
    k,
    x: Math.min(b.maxX, Math.max(b.minX, cam.x)),
    y: Math.min(b.maxY, Math.max(b.minY, cam.y)),
  };
}

// ---------------------------------------------------------------------------
// Smooth zoom & pan (van Wijk & Nuij, 2003)
// ---------------------------------------------------------------------------

const RHO = Math.SQRT2;
const RHO2 = 2;
const RHO4 = 4;
const EPSILON2 = 1e-12;

export type FlightPlan = {
  ux0: number;
  uy0: number;
  w0: number;
  dx: number;
  dy: number;
  /** Longitud del camino en el espacio (u, w). Determina la duración. */
  S: number;
  r0: number;
  d1: number;
  /** true cuando sólo cambia el zoom (sin desplazamiento). */
  pureZoom: boolean;
  /** Ancho del viewport usado para convertir w ↔ k. */
  viewportWidth: number;
  /** Cámara destino exacta (se fija al final para evitar error numérico). */
  target: Camera;
};

const cosh = (x: number) => {
  'worklet';
  return ((x = Math.exp(x)) + 1 / x) / 2;
};
const sinh = (x: number) => {
  'worklet';
  return ((x = Math.exp(x)) - 1 / x) / 2;
};
const tanh = (x: number) => {
  'worklet';
  return ((x = Math.exp(2 * x)) - 1) / (x + 1);
};

export function planFlight(from: Camera, to: Camera, viewportWidth: number): FlightPlan {
  'worklet';
  const w0 = viewportWidth / from.k;
  const w1 = viewportWidth / to.k;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d2 = dx * dx + dy * dy;
  if (d2 < EPSILON2) {
    return {
      ux0: from.x,
      uy0: from.y,
      w0,
      dx,
      dy,
      S: Math.log(w1 / w0) / RHO,
      r0: 0,
      d1: 0,
      pureZoom: true,
      viewportWidth,
      target: to,
    };
  }
  const d1 = Math.sqrt(d2);
  const b0 = (w1 * w1 - w0 * w0 + RHO4 * d2) / (2 * w0 * RHO2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - RHO4 * d2) / (2 * w1 * RHO2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  return {
    ux0: from.x,
    uy0: from.y,
    w0,
    dx,
    dy,
    S: (r1 - r0) / RHO,
    r0,
    d1,
    pureZoom: false,
    viewportWidth,
    target: to,
  };
}

/**
 * Plan "ease": centro lineal + zoom geométrico (log k lineal). Sin alejarse:
 * ideal para ajustes cortos (centrar un marcador sobre el bottom sheet,
 * botones +/−). Es exactamente la rama "pureZoom" de van Wijk.
 */
export function planEase(from: Camera, to: Camera, viewportWidth: number): FlightPlan {
  'worklet';
  const w0 = viewportWidth / from.k;
  const w1 = viewportWidth / to.k;
  return {
    ux0: from.x,
    uy0: from.y,
    w0,
    dx: to.x - from.x,
    dy: to.y - from.y,
    S: Math.log(w1 / w0) / RHO,
    r0: 0,
    d1: 0,
    pureZoom: true,
    viewportWidth,
    target: to,
  };
}

/** Cámara en el instante t ∈ [0, 1] del vuelo. */
export function sampleFlight(plan: FlightPlan, t: number): Camera {
  'worklet';
  if (t >= 1) return plan.target;
  if (plan.pureZoom) {
    const w = plan.w0 * Math.exp(RHO * t * plan.S);
    return { x: plan.ux0 + t * plan.dx, y: plan.uy0 + t * plan.dy, k: plan.viewportWidth / w };
  }
  const s = t * plan.S;
  const coshr0 = cosh(plan.r0);
  const u = (plan.w0 / (RHO2 * plan.d1)) * (coshr0 * tanh(RHO * s + plan.r0) - sinh(plan.r0));
  const w = (plan.w0 * coshr0) / cosh(RHO * s + plan.r0);
  return { x: plan.ux0 + u * plan.dx, y: plan.uy0 + u * plan.dy, k: plan.viewportWidth / w };
}

/**
 * Duración del vuelo proporcional a la distancia recorrida (S), acotada para
 * que los cambios de nivel queden en ~520–800 ms y los vuelos largos no
 * superen ~1.1 s.
 */
export function flightDuration(plan: FlightPlan, base: number, min: number, max: number): number {
  'worklet';
  const S = Math.abs(plan.S);
  if (!Number.isFinite(S) || S < 1e-3) return min;
  return Math.round(Math.min(max, Math.max(min, base * (S / 1.25))));
}

export function boundsCenter(b: Bounds) {
  'worklet';
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

export function padBounds(b: Bounds, fraction: number): Bounds {
  'worklet';
  const w = (b.maxX - b.minX) * fraction;
  const h = (b.maxY - b.minY) * fraction;
  return { minX: b.minX - w, maxX: b.maxX + w, minY: b.minY - h, maxY: b.maxY + h };
}

export function camerasEqual(a: Camera, b: Camera, eps = 1e-4): boolean {
  'worklet';
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.k - b.k) / Math.max(a.k, b.k) < eps;
}

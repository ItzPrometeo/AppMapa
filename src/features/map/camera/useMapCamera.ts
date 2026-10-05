/**
 * Sistema de cámara del mapa.
 *
 * Todo el movimiento vive en el hilo de UI (Reanimated): la cámara efectiva es
 * un valor derivado de
 *   - un plan de vuelo + progreso (0→1) mientras hay una animación, o
 *   - la cámara "manual" (mx, my, mk) que escriben los gestos.
 * React sólo se entera cuando la cámara se detiene (`settled`), lo que permite
 * recalcular clusters/etiquetas sin re-renderizar en cada frame.
 *
 * API pública: fitBounds · flyTo · animateCamera · zoomTo · zoomBy · jumpTo
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withDecay,
  withTiming,
  type WithTimingConfig,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { motion } from '@/theme/tokens';
import type { Bounds } from '../geo/types';
import {
  centerOn,
  constrain,
  fitBounds as fitBoundsMath,
  flightDuration,
  planEase,
  planFlight,
  sampleFlight,
  zoomAround,
  type Camera,
  type CameraLimits,
  type FitOptions,
  type FlightPlan,
  type Padding,
  type Viewport,
} from './cameraMath';

export type AnimateOptions = {
  /** ms. Si se omite se calcula a partir de la distancia del vuelo. */
  duration?: number;
  easing?: WithTimingConfig['easing'];
  /** 'fly' = van Wijk (zoom-out/zoom-in natural); 'ease' = interpolación directa. */
  kind?: 'fly' | 'ease';
  animated?: boolean;
};

export type MapCameraApi = {
  camera: SharedValue<Camera>;
  viewport: SharedValue<Viewport>;
  limits: SharedValue<CameraLimits | null>;
  setViewport: (v: Viewport) => void;
  getCamera: () => Camera;
  getViewport: () => Viewport;
  jumpTo: (cam: Camera) => void;
  flyTo: (cam: Camera, options?: AnimateOptions) => Promise<boolean>;
  animateCamera: (cam: Camera, options?: AnimateOptions) => Promise<boolean>;
  fitBounds: (bounds: Bounds, options?: FitOptions & AnimateOptions) => Promise<boolean>;
  zoomTo: (k: number, options?: AnimateOptions) => Promise<boolean>;
  zoomBy: (factor: number, options?: AnimateOptions) => Promise<boolean>;
  computeFit: (bounds: Bounds, options?: FitOptions) => Camera;
  setLimits: (limits: CameraLimits | null) => void;
  gestures: CameraGestureWorklets;
};

export type CameraGestureWorklets = {
  begin: () => void;
  pan: (translationX: number, translationY: number) => void;
  panEnd: (velocityX: number, velocityY: number) => void;
  pinch: (scale: number, focalX: number, focalY: number) => void;
  pinchEnd: () => void;
};

const INITIAL: Camera = { x: -75, y: 9, k: 25 };

export function useMapCamera(onUserGestureEnd?: (cam: Camera) => void): {
  api: MapCameraApi;
  /** Cámara en reposo más reciente (estado de React; cambia sólo al terminar un movimiento). */
  settled: Camera | null;
} {
  const mx = useSharedValue(INITIAL.x);
  const my = useSharedValue(INITIAL.y);
  const mk = useSharedValue(INITIAL.k);
  const plan = useSharedValue<FlightPlan | null>(null);
  const progress = useSharedValue(0);
  const viewport = useSharedValue<Viewport>({ width: 1, height: 1 });
  const limits = useSharedValue<CameraLimits | null>(null);

  // Estado temporal de gestos (hilo de UI).
  const gestureStart = useSharedValue<Camera>(INITIAL);
  const pinchAnchor = useSharedValue({ x: 0, y: 0, active: false });

  const camera = useDerivedValue<Camera>(() => {
    const p = plan.value;
    if (p) return sampleFlight(p, progress.value);
    return { x: mx.value, y: my.value, k: mk.value };
  });

  const [settled, setSettled] = useState<Camera | null>(null);
  const flightId = useRef(0);
  const pending = useRef(new Map<number, (done: boolean) => void>());
  const viewportRef = useRef<Viewport>({ width: 1, height: 1 });

  const resolveFlight = useCallback((id: number, done: boolean, cam: Camera) => {
    const resolve = pending.current.get(id);
    pending.current.delete(id);
    if (done) setSettled(cam);
    resolve?.(done);
  }, []);

  const notifyGestureEnd = useCallback(
    (cam: Camera) => {
      setSettled(cam);
      onUserGestureEnd?.(cam);
    },
    [onUserGestureEnd],
  );

  /** Detiene cualquier vuelo dejando la cámara exactamente donde está. */
  const interruptOnUI = useCallback(() => {
    'worklet';
    if (plan.value) {
      const current = sampleFlight(plan.value, progress.value);
      cancelAnimation(progress);
      mx.set(current.x);
      my.set(current.y);
      mk.set(current.k);
      plan.set(null);
    }
    cancelAnimation(mx);
    cancelAnimation(my);
  }, [mk, mx, my, plan, progress]);

  const getCamera = useCallback((): Camera => {
    const p = plan.value;
    if (p) return sampleFlight(p, progress.value);
    return { x: mx.value, y: my.value, k: mk.value };
  }, [mk, mx, my, plan, progress]);

  const cancelPending = useCallback(() => {
    for (const [, resolve] of pending.current) resolve(false);
    pending.current.clear();
  }, []);

  const jumpTo = useCallback(
    (cam: Camera) => {
      cancelPending();
      cancelAnimation(progress);
      plan.set(null);
      mx.set(cam.x);
      my.set(cam.y);
      mk.set(cam.k);
      setSettled(cam);
    },
    [cancelPending, mk, mx, my, plan, progress],
  );

  const animate = useCallback(
    (target: Camera, options: AnimateOptions = {}): Promise<boolean> => {
      if (options.animated === false) {
        jumpTo(target);
        return Promise.resolve(true);
      }
      cancelPending();
      const from = getCamera();
      const width = viewportRef.current.width;
      const nextPlan = options.kind === 'ease' ? planEase(from, target, width) : planFlight(from, target, width);
      const duration = options.duration ?? flightDuration(nextPlan, motion.flight, motion.flightMin, motion.flightMax);
      const id = ++flightId.current;

      return new Promise<boolean>((resolve) => {
        pending.current.set(id, resolve);
        cancelAnimation(mx);
        cancelAnimation(my);
        cancelAnimation(progress);
        // Fijamos la cámara manual en el punto de partida por si el vuelo se interrumpe.
        mx.set(from.x);
        my.set(from.y);
        mk.set(from.k);
        progress.set(0);
        plan.set(nextPlan);
        progress.set(
          withTiming(1, { duration, easing: options.easing ?? motion.easeInOutCubic }, (finished) => {
            if (!finished) return;
            mx.set(target.x);
            my.set(target.y);
            mk.set(target.k);
            plan.set(null);
            scheduleOnRN(resolveFlight, id, true, target);
          }),
        );
      });
    },
    [cancelPending, getCamera, jumpTo, mk, mx, my, plan, progress, resolveFlight],
  );

  const computeFit = useCallback(
    (bounds: Bounds, options: FitOptions = {}) => fitBoundsMath(bounds, viewportRef.current, options),
    [],
  );

  const fitBounds = useCallback(
    (bounds: Bounds, options: FitOptions & AnimateOptions = {}) => animate(computeFit(bounds, options), options),
    [animate, computeFit],
  );

  const zoomTo = useCallback(
    (k: number, options: AnimateOptions = {}) => {
      const cam = getCamera();
      const lim = limits.value;
      const nextK = lim ? Math.min(lim.maxK, Math.max(lim.minK, k)) : k;
      return animate({ ...cam, k: nextK }, { kind: 'ease', duration: 320, easing: motion.easeOutCubic, ...options });
    },
    [animate, getCamera, limits],
  );

  const zoomBy = useCallback(
    (factor: number, options?: AnimateOptions) => zoomTo(getCamera().k * factor, options),
    [getCamera, zoomTo],
  );

  const setViewport = useCallback(
    (v: Viewport) => {
      viewportRef.current = v;
      viewport.set(v);
    },
    [viewport],
  );

  const setLimits = useCallback(
    (l: CameraLimits | null) => {
      limits.set(l);
    },
    [limits],
  );

  // -------------------------------------------------------------------------
  // Gestos (worklets, hilo de UI)
  // -------------------------------------------------------------------------
  const gestures = useMemo<CameraGestureWorklets>(
    () => ({
      begin: () => {
        'worklet';
        interruptOnUI();
        gestureStart.set({ x: mx.value, y: my.value, k: mk.value });
      },
      pan: (tx: number, ty: number) => {
        'worklet';
        if (pinchAnchor.value.active) return;
        const start = gestureStart.value;
        const next = { x: start.x - tx / start.k, y: start.y - ty / start.k, k: start.k };
        const lim = limits.value;
        const c = lim ? constrain(next, lim, 0.6) : next;
        mx.set(c.x);
        my.set(c.y);
      },
      panEnd: (vx: number, vy: number) => {
        'worklet';
        if (pinchAnchor.value.active) return;
        const lim = limits.value;
        const k = mk.value;
        const clampX: [number, number] | undefined = lim ? [lim.bounds.minX, lim.bounds.maxX] : undefined;
        const clampY: [number, number] | undefined = lim ? [lim.bounds.minY, lim.bounds.maxY] : undefined;
        mx.set(withDecay({ velocity: -vx / k, deceleration: 0.994, clamp: clampX }));
        my.set(
          withDecay({ velocity: -vy / k, deceleration: 0.994, clamp: clampY }, (finished) => {
            if (finished) scheduleOnRN(notifyGestureEnd, { x: mx.value, y: my.value, k: mk.value });
          }),
        );
      },
      pinch: (scale: number, fx: number, fy: number) => {
        'worklet';
        const vp = viewport.value;
        if (!pinchAnchor.value.active) {
          interruptOnUI();
          gestureStart.set({ x: mx.value, y: my.value, k: mk.value });
          pinchAnchor.set({ x: fx, y: fy, active: true });
        }
        const start = gestureStart.value;
        const lim = limits.value;
        const minK = lim ? lim.minK * 0.7 : 0;
        const maxK = lim ? lim.maxK * 1.15 : Infinity;
        const k = Math.min(maxK, Math.max(minK, start.k * scale));
        // El punto de mundo bajo el foco inicial sigue al foco actual (zoom + pan con dos dedos).
        const anchor = pinchAnchor.value;
        const wx = (anchor.x - vp.width / 2) / start.k + start.x;
        const wy = (anchor.y - vp.height / 2) / start.k + start.y;
        mx.set(wx - (fx - vp.width / 2) / k);
        my.set(wy - (fy - vp.height / 2) / k);
        mk.set(k);
      },
      pinchEnd: () => {
        'worklet';
        pinchAnchor.set({ x: 0, y: 0, active: false });
        const lim = limits.value;
        const cam = { x: mx.value, y: my.value, k: mk.value };
        if (!lim) {
          scheduleOnRN(notifyGestureEnd, cam);
          return;
        }
        // Rebote suave si el usuario se pasó del zoom permitido.
        const fixed = constrain(cam, lim);
        if (fixed.k !== cam.k || fixed.x !== cam.x || fixed.y !== cam.y) {
          const config = { duration: 280, easing: motion.easeOutCubic };
          mx.set(withTiming(fixed.x, config));
          my.set(withTiming(fixed.y, config));
          mk.set(
            withTiming(fixed.k, config, (finished) => {
              if (finished) scheduleOnRN(notifyGestureEnd, fixed);
            }),
          );
        } else {
          scheduleOnRN(notifyGestureEnd, cam);
        }
      },
    }),
    [gestureStart, interruptOnUI, limits, mk, mx, my, notifyGestureEnd, pinchAnchor, viewport],
  );

  const api = useMemo<MapCameraApi>(
    () => ({
      camera,
      viewport,
      limits,
      setViewport,
      getCamera,
      getViewport: () => viewportRef.current,
      jumpTo,
      flyTo: (cam, options) => animate(cam, { kind: 'fly', ...options }),
      animateCamera: (cam, options) => animate(cam, { kind: 'ease', ...options }),
      fitBounds,
      zoomTo,
      zoomBy,
      computeFit,
      setLimits,
      gestures,
    }),
    [
      animate,
      camera,
      computeFit,
      fitBounds,
      gestures,
      getCamera,
      jumpTo,
      limits,
      setLimits,
      setViewport,
      viewport,
      zoomBy,
      zoomTo,
    ],
  );

  return { api, settled };
}

export { centerOn, zoomAround };
export type { Camera, Padding, Viewport };

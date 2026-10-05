/**
 * useMapExplorer — orquestador del mapa.
 *
 * Une cuatro piezas independientes:
 *   1. Máquina de estados pura (qué nivel / qué está seleccionado)
 *   2. Repositorios (carga perezosa de geometría y destinos)
 *   3. Cámara (fitBounds / flyTo en el hilo de UI)
 *   4. Escena (coreografía de resaltado, fundidos y apariciones)
 *
 * Cada cambio de nivel se resuelve en `runTransition(from, to)`, que encadena
 * pasos con `await`. Un token invalida la coreografía anterior si el usuario
 * toca otra cosa a mitad de animación: nunca quedan estados intermedios rotos.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import { cancelAnimation, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { destinationsRepository } from '@/features/destinations/destinationsRepository';
import type { Category, Destination } from '@/features/destinations/types';
import { haptics } from '@/lib/haptics';
import { useIsOnline } from '@/lib/useNetworkStatus';
import { motion } from '@/theme/tokens';

import {
  centerOn,
  flightDuration,
  padBounds,
  planFlight,
  screenToWorld,
  worldToScreen,
  type Camera,
  type Padding,
} from '../camera/cameraMath';
import { useMapCamera } from '../camera/useMapCamera';
import type { Cluster, ClusterInput } from '../geo/cluster';
import { estimateLabelWidth } from '../geo/cluster';
import { geoRepository, type ShapeLayer } from '../geo/geoRepository';
import { hitTest } from '../geo/hitTest';
import { project } from '../geo/projection';
import type { Bounds, MapShape } from '../geo/types';
import type { MapLabelItem } from '../components/MapLabels';
import { useMapScene } from '../scene';
import { canGoBack, explorerReducer, initialExplorerState, levelOf, type Level } from './explorerMachine';

export type InsetsForLevel = (level: Level, opts?: { destinationOpen?: boolean }) => { top: number; bottom: number };

type Scene = { regionId: string | null; provinceId: string | null };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const SIDE_PADDING = 20;
const TAP_TOLERANCE_PX = 14;
/** Distancia mínima en pantalla entre el destino seleccionado y su vecino más cercano. */
const MIN_MARKER_GAP_PX = 60;

export function useMapExplorer(insetsFor: InsetsForLevel) {
  const [state, dispatch] = useReducer(explorerReducer, initialExplorerState);
  const scene = useMapScene();
  const { api: camera, settled } = useMapCamera();
  const isOnline = useIsOnline();

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [country, setCountry] = useState<ShapeLayer | null>(null);
  const [regionLayer, setRegionLayer] = useState<ShapeLayer | null>(null);
  const [provinceShape, setProvinceShape] = useState<MapShape | null>(null);
  /** Lo que se está DIBUJANDO (puede ir por detrás del estado lógico durante una salida animada). */
  const [display, setDisplay] = useState<Scene>({ regionId: null, provinceId: null });
  const [pressedId, setPressedId] = useState<string | null>(null);
  const [markersVisible, setMarkersVisibleState] = useState(false);
  /** Instante en que se mostraron los marcadores: base del stagger de aparición. */
  const [markersRevealAt, setMarkersRevealAt] = useState(0);
  const setMarkersVisible = useCallback((visible: boolean) => {
    setMarkersVisibleState(visible);
    if (visible) setMarkersRevealAt(Date.now());
  }, []);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const token = useRef(0);
  const shown = useRef<Scene>({ regionId: null, provinceId: null });
  const pendingDestination = useRef<string | null>(null);
  const insetsRef = useRef(insetsFor);
  const stateRef = useRef(state);
  // "Latest ref": callbacks estables que leen siempre el último valor.
  useLayoutEffect(() => {
    insetsRef.current = insetsFor;
    stateRef.current = state;
  });

  const padding = useCallback((level: Level, destinationOpen = false): Padding => {
    const { top, bottom } = insetsRef.current(level, { destinationOpen });
    return { top: top + 12, bottom: bottom + 16, left: SIDE_PADDING, right: SIDE_PADDING };
  }, []);

  // ---------------------------------------------------------------------------
  // Carga inicial (nivel Perú)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    geoRepository
      .loadCountry()
      .then((layer) => {
        if (cancelled) return;
        setCountry(layer);
        dispatch({ type: 'COUNTRY_LOADED' });
      })
      .catch((e: unknown) => {
        if (!cancelled) dispatch({ type: 'LOAD_FAILED', error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const fitCountry = useCallback(
    (layer: ShapeLayer) => camera.computeFit(layer.bounds, { padding: padding('country') }),
    [camera, padding],
  );

  // Primer encuadre + animación de entrada (contorno → color).
  const introDone = useRef(false);
  useEffect(() => {
    if (!country || size.width === 0 || introDone.current) return;
    introDone.current = true;
    const cam = fitCountry(country);
    camera.jumpTo(cam);
    camera.setLimits({ minK: cam.k * 0.9, maxK: cam.k * 5, bounds: country.bounds });
    scene.intro.set(0);
    scene.intro.set(withDelay(120, withTiming(1, { duration: 1150, easing: motion.easeOutCubic })));
  }, [camera, country, fitCountry, scene.intro, size.width]);

  const regionBounds = (regionId: string) => country?.byId.get(regionId)?.bounds ?? null;

  const currentBounds = (): Bounds | null => {
    const s = shown.current;
    if (s.provinceId) return provinceShape?.bounds ?? regionLayer?.byId.get(s.provinceId)?.bounds ?? null;
    if (s.regionId) return regionBounds(s.regionId);
    return country?.bounds ?? null;
  };

  // Al rotar / redimensionar: re-encuadrar el nivel actual sin animación.
  const lastSize = useRef(size);
  useEffect(() => {
    const prev = lastSize.current;
    lastSize.current = size;
    if (!introDone.current || prev.width === 0) return;
    if (prev.width === size.width && prev.height === size.height) return;
    const bounds = currentBounds();
    if (bounds) camera.jumpTo(camera.computeFit(bounds, { padding: padding(levelOf(shown.current)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  // ---------------------------------------------------------------------------
  // Utilidades de escena
  // ---------------------------------------------------------------------------
  const durationTo = (target: Camera) =>
    flightDuration(
      planFlight(camera.getCamera(), target, size.width || 1),
      motion.flight,
      motion.flightMin,
      motion.flightMax,
    );

  const setLevelLimits = (bounds: Bounds, fitK: number, zoomRange: number) => {
    camera.setLimits({ minK: fitK * 0.85, maxK: fitK * zoomRange, bounds: padBounds(bounds, 0.15) });
  };

  const fade = (to: number, duration: number = motion.fade, delay = 0) =>
    withDelay(delay, withTiming(to, { duration, easing: motion.easeInOutCubic }));

  const pop = () =>
    withSequence(
      withTiming(1, { duration: motion.highlight, easing: motion.easeOutCubic }),
      withDelay(motion.preZoomDelay, withSpring(0, motion.springSoft)),
    );

  // ---------------------------------------------------------------------------
  // Destinos
  // ---------------------------------------------------------------------------
  const loadDestinations = (provinceId: string) => {
    const cached = destinationsRepository.peekProvince(provinceId);
    const deliver = (list: Destination[]) => {
      dispatch({ type: 'DESTINATIONS_LOADED', provinceId, destinations: list });
      const pending = pendingDestination.current;
      if (pending && list.some((d) => d.id === pending)) {
        pendingDestination.current = null;
        dispatch({ type: 'SELECT_DESTINATION', destinationId: pending });
      }
    };
    if (cached) deliver(cached);
    destinationsRepository
      .byProvince(provinceId, deliver)
      .then(deliver)
      .catch(() => deliver([]));
  };

  // ---------------------------------------------------------------------------
  // Transiciones entre niveles
  // ---------------------------------------------------------------------------
  const runTransition = async (from: Scene, to: Scene) => {
    if (!country) return;
    const my = ++token.current;
    const alive = () => token.current === my;
    const s = scene;

    // ---- Volver al Perú --------------------------------------------------
    if (!to.regionId) {
      setMarkersVisible(false);
      const target = fitCountry(country);
      const d = durationTo(target);
      s.provinceReveal.set(fade(0, 200));
      s.provinceFocus.set(fade(0, 260));
      s.regionReveal.set(fade(0, motion.fade));
      s.regionFocus.set(fade(0, d * 0.65, d * 0.35));
      const done = await camera.flyTo(target, { duration: d });
      if (!alive()) return;
      setDisplay({ regionId: null, provinceId: null });
      setProvinceShape(null);
      if (done) camera.setLimits({ minK: target.k * 0.9, maxK: target.k * 5, bounds: country.bounds });
      return;
    }

    const regionChanged = from.regionId !== to.regionId;

    // Carga perezosa en paralelo con el resaltado.
    const regionPromise = geoRepository.loadRegion(to.regionId);
    const provincePromise = to.provinceId ? geoRepository.loadProvince(to.provinceId) : null;
    if (to.provinceId) loadDestinations(to.provinceId);

    // ---- Paso 1: resaltar lo tocado ---------------------------------------
    if (regionChanged) {
      setMarkersVisible(false);
      setProvinceShape(null);
      haptics.impact();
      const switching = Boolean(from.regionId);
      s.provinceReveal.set(fade(0, 160));
      s.provinceFocus.set(fade(0, 160));
      s.regionReveal.set(fade(0, switching ? 160 : 0));
      setDisplay({ regionId: to.regionId, provinceId: null });
      s.regionFocus.set(
        switching
          ? withSequence(withTiming(0.5, { duration: 110 }), withTiming(1, { duration: motion.highlight }))
          : withTiming(1, { duration: motion.highlight, easing: motion.easeOutCubic }),
      );
      if (!to.provinceId) s.regionPulse.set(pop());
    }

    let layer: ShapeLayer;
    try {
      layer = await regionPromise;
    } catch {
      if (!alive()) return;
      setNotice('No pudimos cargar esta región. Inténtalo de nuevo.');
      dispatch({ type: 'GO_TO', level: 'country' });
      return;
    }
    if (!alive()) return;
    setRegionLayer(layer);

    // ---- Nivel región ----------------------------------------------------
    if (!to.provinceId) {
      setMarkersVisible(false);
      const target = camera.computeFit(layer.bounds, { padding: padding('region') });
      const d = durationTo(target);
      if (from.provinceId && !regionChanged) {
        // Salida provincia → región: fundido inverso mientras la cámara se aleja.
        s.provinceReveal.set(fade(0, 220));
        s.provinceFocus.set(fade(0, d * 0.6, d * 0.3));
        s.provincePulse.set(0);
        s.regionFocus.set(fade(1, 200));
        s.regionReveal.set(fade(1, 200));
      } else {
        await sleep(motion.preZoomDelay);
        if (!alive()) return;
        // Las provincias aparecen en el último tramo del zoom.
        s.regionReveal.set(fade(1, 480, d * 0.55));
      }
      const done = await camera.flyTo(target, { duration: d });
      if (!alive()) return;
      setDisplay({ regionId: to.regionId, provinceId: null });
      setProvinceShape(null);
      if (done) setLevelLimits(layer.bounds, target.k, 8);
      return;
    }

    // ---- Nivel provincia -------------------------------------------------
    const provinceBase = layer.byId.get(to.provinceId);
    if (!provinceBase) return;
    const switchingProvince = Boolean(from.provinceId) && !regionChanged;
    setMarkersVisible(false);
    if (regionChanged) {
      // Salto directo (búsqueda): las provincias aparecen ya durante el vuelo.
      s.regionReveal.set(fade(1, 300));
    }
    if (switchingProvince) s.provinceReveal.set(fade(0, 160));
    setProvinceShape(null);
    setDisplay({ regionId: to.regionId, provinceId: to.provinceId });
    if (!regionChanged) haptics.impact();
    s.provinceFocus.set(
      switchingProvince
        ? withSequence(withTiming(0.5, { duration: 110 }), withTiming(1, { duration: motion.highlight }))
        : withTiming(1, { duration: motion.highlight, easing: motion.easeOutCubic }),
    );
    s.provincePulse.set(pop());

    await sleep(motion.preZoomDelay);
    if (!alive()) return;

    const target = camera.computeFit(provinceBase.bounds, { padding: padding('province') });
    const d = durationTo(target);
    const flight = camera.flyTo(target, { duration: d });

    // El contorno detallado se funde en la segunda mitad del vuelo.
    provincePromise
      ?.then((shape) => {
        if (!alive()) return;
        setProvinceShape(shape);
        s.provinceReveal.set(fade(1, 420, d * 0.45));
      })
      .catch(() => {
        // Sin detalle: se mantiene el contorno simplificado de la provincia.
        if (alive()) s.provinceReveal.set(0);
      });

    const done = await flight;
    if (!alive()) return;
    if (done) {
      setLevelLimits(provinceBase.bounds, target.k, 14);
      // Marcadores: 200 ms después + 100 ms entre cada uno (en TouristMarker/MarkersLayer).
      setMarkersVisible(true);
    }
  };

  // Disparar la transición cuando cambia la escena lógica.
  useEffect(() => {
    if (!country || size.width === 0) return;
    const to = { regionId: state.regionId, provinceId: state.provinceId };
    const from = shown.current;
    if (from.regionId === to.regionId && from.provinceId === to.provinceId) return;
    shown.current = to;
    void runTransition(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.regionId, state.provinceId, country, size.width]);

  // ---------------------------------------------------------------------------
  // Destinos visibles y seleccionado
  // ---------------------------------------------------------------------------
  const filteredDestinations = useMemo(() => {
    const list = state.destinations ?? [];
    return state.categoryFilter ? list.filter((d) => d.category === state.categoryFilter) : list;
  }, [state.destinations, state.categoryFilter]);

  const selectedDestination = useMemo(
    () => state.destinations?.find((d) => d.id === state.destinationId) ?? null,
    [state.destinations, state.destinationId],
  );

  // Al seleccionar un destino, asegurar que el marcador quede visible sobre el bottom sheet.
  useEffect(() => {
    if (!selectedDestination || size.width === 0) return;
    const p = project(selectedDestination.longitude, selectedDestination.latitude);
    const cam = camera.getCamera();
    const pad = padding('province', true);
    const s = worldToScreen(p.x, p.y, cam, size);
    const inside =
      s.x > pad.left + 24 && s.x < size.width - pad.right - 24 && s.y > pad.top + 56 && s.y < size.height - pad.bottom;
    // Si el lugar estaba dentro de un grupo, acercar lo justo para separarlo de sus vecinos.
    let k = cam.k;
    const nearest = (state.destinations ?? [])
      .filter((d) => d.id !== selectedDestination.id)
      .map((d) => {
        const q = project(d.longitude, d.latitude);
        return Math.hypot(q.x - p.x, q.y - p.y) * cam.k;
      })
      .reduce((m, v) => Math.min(m, v), Infinity);
    if (nearest < MIN_MARKER_GAP_PX) {
      const maxK = camera.limits.value?.maxK ?? cam.k * 4;
      k = Math.min(maxK, cam.k * (MIN_MARKER_GAP_PX / Math.max(nearest, 1)));
    }
    if (!inside || k !== cam.k) {
      void camera.animateCamera(centerOn(p.x, p.y, k, size, pad), { duration: 480, easing: motion.easeInOutCubic });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDestination?.id]);

  // ---------------------------------------------------------------------------
  // Etiquetas
  // ---------------------------------------------------------------------------
  const labels = useMemo<{ items: MapLabelItem[]; size: 'sm' | 'md' }>(() => {
    const k = settled?.k ?? 0;
    const fits = (shape: MapShape, kk: number) => {
      const w = (shape.bounds.maxX - shape.bounds.minX) * kk;
      const h = (shape.bounds.maxY - shape.bounds.minY) * kk;
      return w > estimateLabelWidth(shape.name, 12) * 0.85 && h > 26;
    };
    if (!country || k === 0) return { items: [], size: 'md' };

    if (!display.regionId) {
      return {
        size: 'sm',
        items: country.shapes.map((shape) => ({
          id: `r:${shape.id}`,
          text: shape.name,
          x: shape.label.x,
          y: shape.label.y,
          visible: state.phase !== 'loading' && (fits(shape, k) || shape.id === pressedId),
          delay: 700,
        })),
      };
    }
    if (!display.provinceId && regionLayer && regionLayer.id === display.regionId) {
      return {
        size: 'md',
        items: regionLayer.shapes.map((shape, i) => ({
          id: `p:${shape.id}`,
          text: shape.name,
          x: shape.label.x,
          y: shape.label.y,
          visible: Boolean(state.regionId) && !state.provinceId && (fits(shape, k) || shape.id === pressedId),
          delay: 120 + i * motion.provinceStagger,
        })),
      };
    }
    // Nivel provincia: nombres de las provincias vecinas (contexto, tocables).
    if (display.provinceId && regionLayer) {
      return {
        size: 'sm',
        items: regionLayer.shapes
          .filter((s) => s.id !== display.provinceId)
          .map((shape) => {
            const c = settled ?? camera.getCamera();
            const sp = worldToScreen(shape.label.x, shape.label.y, c, size);
            const onScreen = sp.x > 40 && sp.x < size.width - 40 && sp.y > 140 && sp.y < size.height - 120;
            return {
              id: `n:${shape.id}`,
              text: shape.name,
              x: shape.label.x,
              y: shape.label.y,
              visible: markersVisible && onScreen && fits(shape, k),
            };
          }),
      };
    }
    return { items: [], size: 'md' };
  }, [
    camera,
    country,
    display,
    markersVisible,
    pressedId,
    regionLayer,
    settled,
    size,
    state.phase,
    state.provinceId,
    state.regionId,
  ]);

  // ---------------------------------------------------------------------------
  // Interacción con el mapa
  // ---------------------------------------------------------------------------
  type Hit = { kind: 'region'; id: string } | { kind: 'province'; id: string; regionId: string };

  const hitAt = (sx: number, sy: number): Hit | null => {
    if (!country) return null;
    const cam = camera.getCamera();
    const w = screenToWorld(sx, sy, cam, size);
    const tol = TAP_TOLERANCE_PX / cam.k;
    const shownScene = shown.current;
    if (shownScene.regionId && regionLayer && regionLayer.id === shownScene.regionId) {
      const p = hitTest(regionLayer.shapes, w.x, w.y, tol);
      if (p) return { kind: 'province', id: p.id, regionId: regionLayer.id };
      const r = hitTest(
        country.shapes.filter((s) => s.id !== shownScene.regionId),
        w.x,
        w.y,
        tol,
      );
      return r ? { kind: 'region', id: r.id } : null;
    }
    const r = hitTest(country.shapes, w.x, w.y, tol);
    return r ? { kind: 'region', id: r.id } : null;
  };

  const onPressIn = useCallback(
    (x: number, y: number) => {
      if (stateRef.current.phase === 'loading') return;
      setPressedId(hitAt(x, y)?.id ?? null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [country, regionLayer, size],
  );

  const onPressOut = useCallback(() => setPressedId(null), []);

  const selectRegion = useCallback((regionId: string) => {
    haptics.selection();
    dispatch({ type: 'SELECT_REGION', regionId });
  }, []);

  const selectProvince = useCallback((provinceId: string, regionId?: string) => {
    const rid = regionId ?? geoRepository.regionOfProvince(provinceId);
    if (!rid) return;
    haptics.selection();
    dispatch({ type: 'SELECT_PROVINCE', regionId: rid, provinceId });
  }, []);

  const onTap = useCallback(
    (x: number, y: number) => {
      const hit = hitAt(x, y);
      if (!hit) {
        if (stateRef.current.destinationId) dispatch({ type: 'CLEAR_DESTINATION' });
        return;
      }
      if (hit.kind === 'region') selectRegion(hit.id);
      else selectProvince(hit.id, hit.regionId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [country, regionLayer, size, selectRegion, selectProvince],
  );

  const selectDestination = useCallback((destinationId: string) => {
    haptics.selection();
    dispatch({ type: 'SELECT_DESTINATION', destinationId });
  }, []);

  const clearDestination = useCallback(() => dispatch({ type: 'CLEAR_DESTINATION' }), []);
  const back = useCallback(() => dispatch({ type: 'BACK' }), []);
  const goTo = useCallback((level: 'country' | 'region') => dispatch({ type: 'GO_TO', level }), []);
  const setFilter = useCallback((category: Category | null) => dispatch({ type: 'SET_FILTER', category }), []);

  /** Desde la búsqueda: viaja a la provincia y abre el destino al llegar. */
  const openDestination = useCallback((d: Destination) => {
    const current = stateRef.current;
    if (current.provinceId === d.provinceId && current.destinations?.some((x) => x.id === d.id)) {
      dispatch({ type: 'SELECT_DESTINATION', destinationId: d.id });
      return;
    }
    pendingDestination.current = d.id;
    dispatch({ type: 'SELECT_PROVINCE', regionId: d.regionId, provinceId: d.provinceId });
  }, []);

  const onClusterPress = useCallback(
    (cluster: Cluster<ClusterInput>) => {
      haptics.selection();
      // Margen extra para que los pines (que crecen hacia arriba) y sus
      // etiquetas no queden bajo los controles o el borde.
      const base = padding('province');
      const pad = { top: base.top + 56, bottom: base.bottom + 36, left: base.left + 36, right: base.right + 64 };
      const target = camera.computeFit(cluster.bounds, { padding: pad, minExtent: 0.02 });
      const lim = camera.limits.value;
      const k = lim ? Math.min(lim.maxK, target.k) : target.k;
      void camera.animateCamera({ ...target, k }, { duration: 480, easing: motion.easeInOutCubic });
    },
    [camera, padding],
  );

  const zoomIn = useCallback(() => void camera.zoomBy(1.6), [camera]);
  const zoomOut = useCallback(() => void camera.zoomBy(1 / 1.6), [camera]);
  const recenter = useCallback(() => {
    const bounds = currentBounds();
    if (!bounds) return;
    const level = levelOf(shown.current);
    void camera.fitBounds(bounds, {
      padding: padding(level, Boolean(stateRef.current.destinationId)),
      kind: 'ease',
      duration: 480,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, country, regionLayer, provinceShape, padding]);

  const retry = useCallback(() => {
    introDone.current = false;
    shown.current = { regionId: null, provinceId: null };
    dispatch({ type: 'RETRY' });
    setLoadAttempt((n) => n + 1);
  }, []);

  const onLayout = useCallback(
    (width: number, height: number) => {
      camera.setViewport({ width, height });
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    },
    [camera],
  );

  // Botón atrás de Android.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack(stateRef.current)) return false;
      dispatch({ type: 'BACK' });
      return true;
    });
    return () => sub.remove();
  }, []);

  // Limpieza: no dejar animaciones vivas al desmontar.
  useEffect(
    () => () => {
      token.current++;
      Object.values(scene).forEach((v) => cancelAnimation(v));
    },
    [scene],
  );

  return {
    state,
    level: levelOf(state),
    display,
    scene,
    camera,
    settled,
    size,
    country,
    regionLayer,
    provinceShape,
    destinations: filteredDestinations,
    selectedDestination,
    labels,
    markersVisible,
    markersRevealAt,
    pressedId,
    isOnline,
    notice,
    dismissNotice: () => setNotice(null),
    canGoBack: canGoBack(state),
    actions: {
      onLayout,
      onPressIn,
      onPressOut,
      onTap,
      selectRegion,
      selectProvince,
      selectDestination,
      clearDestination,
      openDestination,
      back,
      goTo,
      setFilter,
      onClusterPress,
      zoomIn,
      zoomOut,
      recenter,
      retry,
    },
  };
}

export type MapExplorer = ReturnType<typeof useMapExplorer>;

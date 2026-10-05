/**
 * useAvatarDirector — conecta el avatar con la coreografía del mapa.
 *
 * Posición (shared values, hilo de UI):
 *   - Nivel Perú → modo "mundo": los pies siguen un punto lon/lat proyectado con
 *     la cámara (Lima por defecto, o tu ubicación si usas "Cerca de mí").
 *   - Región / provincia → modo "pantalla": acoplado abajo a la izquierda, sobre
 *     el bottom sheet.
 *   - Durante un vuelo de cámara el avatar NO se va con el mapa: pasa a modo
 *     pantalla desde donde está y se desliza al acople (o vuelve a su punto del
 *     mundo al regresar al Perú) en el mismo tiempo que dura el vuelo.
 *
 * Escala fija en pantalla: 68 px de alto (56 px en el nivel Perú).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { worldToScreen } from '@/features/map/camera/cameraMath';
import { hitTest } from '@/features/map/geo/hitTest';
import { project } from '@/features/map/geo/projection';
import type { Level } from '@/features/map/state/explorerMachine';
import type { ExplorerEvent, MapExplorer } from '@/features/map/state/useMapExplorer';
import { haptics } from '@/lib/haptics';
import { motion } from '@/theme/tokens';

import { avatarReducer, currentClip, initialAvatarState, type AvatarEvent, type Direction } from './avatarMachine';
import { AVATAR_CANVAS, AVATAR_HEIGHT_PX, FEET_MARGIN } from './ExplorerAvatar';

/** Punto de aparición por defecto: Plaza Mayor de Lima. */
const HOME = project(-77.0428, -12.0464);
const COUNTRY_SCALE = 56 / AVATAR_HEIGHT_PX;
/** Pies del avatar acoplado: x desde el borde izquierdo, y sobre el sheet. */
const DOCK_X = 46;
const DOCK_GAP = 6;
const GREETED_KEY = 'spoint:avatar:greeted:v1';
const BUBBLE_MS = 4000;

const depth = (l: Level) => (l === 'country' ? 0 : l === 'region' ? 1 : 2);

const TIPS: Record<Level, string> = {
  country: 'Toca una región para explorarla',
  region: 'Elige una provincia del mapa',
  province: 'Toca un lugar para ver sus detalles',
};

type Options = {
  /** Distancia (px) desde el borde inferior del mapa hasta el borde superior del sheet. */
  dockBottom: number;
  /** Ocultar (búsqueda abierta, sheet expandido…). */
  hidden: boolean;
};

export type Bubble = { id: number; text: string } | null;

export function useAvatarDirector(explorer: MapExplorer, { dockBottom, hidden }: Options) {
  const [state, dispatch] = useReducer(avatarReducer, initialAvatarState);
  const [appeared, setAppeared] = useState(false);
  const [bubble, setBubble] = useState<Bubble>(null);
  const [locating, setLocating] = useState(false);
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const reduceMotion = useRef(false);
  const greeted = useRef<boolean | null>(null);

  const { camera, subscribe, size, level, country } = explorer;

  // ---- Posición (hilo de UI) ------------------------------------------------
  const worldX = useSharedValue(HOME.x);
  const worldY = useSharedValue(HOME.y);
  const screenX = useSharedValue(DOCK_X);
  const screenY = useSharedValue(0);
  /** 0 = anclado al mundo · 1 = anclado a la pantalla. */
  const blend = useSharedValue(0);
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const lift = useSharedValue(0);
  const visibility = useSharedValue(1);

  const cam = camera.camera;
  const vp = camera.viewport;
  const containerStyle = useAnimatedStyle(() => {
    const c = cam.value;
    const v = vp.value;
    const wx = (worldX.value - c.x) * c.k + v.width / 2;
    const wy = (worldY.value - c.y) * c.k + v.height / 2;
    const b = blend.value;
    const x = wx + (screenX.value - wx) * b;
    const y = wy + (screenY.value - wy) * b;
    return {
      opacity: opacity.value * visibility.value,
      transform: [
        { translateX: x - AVATAR_CANVAS.width / 2 },
        { translateY: y - (AVATAR_CANVAS.height - FEET_MARGIN) - lift.value },
        { scale: scale.value },
      ],
    };
  });

  const dockY = size.height - dockBottom - DOCK_GAP;
  const latestDockY = useRef(dockY);
  useEffect(() => {
    latestDockY.current = dockY;
  });

  /** Posición actual de los pies en pantalla (lectura síncrona desde JS). */
  const currentScreen = useCallback(() => {
    const w = worldToScreen(worldX.get(), worldY.get(), camera.getCamera(), camera.getViewport());
    const b = blend.get();
    return { x: w.x + (screenX.get() - w.x) * b, y: w.y + (screenY.get() - w.y) * b };
  }, [blend, camera, screenX, screenY, worldX, worldY]);

  const send = useCallback((event: AvatarEvent) => dispatch({ type: 'event', event }), []);

  const say = useCallback((text: string) => setBubble({ id: Date.now(), text }), []);
  useEffect(() => {
    if (!bubble) return;
    const t = setTimeout(() => setBubble(null), BUBBLE_MS);
    return () => clearTimeout(t);
  }, [bubble]);

  // ---- Preferencias del sistema ---------------------------------------------
  useEffect(() => {
    AsyncStorage.getItem(GREETED_KEY)
      .then((v) => (greeted.current = v === '1'))
      .catch(() => (greeted.current = false));
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        reduceMotion.current = value;
        dispatch({ type: 'setReduceMotion', value });
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      reduceMotion.current = value;
      dispatch({ type: 'setReduceMotion', value });
    });
    return () => sub.remove();
  }, []);

  // ---- Coreografía sincronizada con el mapa --------------------------------
  const directionTo = useCallback(
    (sx: number): Direction => (sx < currentScreen().x ? 'left' : 'right'),
    [currentScreen],
  );

  useEffect(
    () =>
      subscribe((e: ExplorerEvent) => {
        const calm = reduceMotion.current;
        const ease = (duration: number) => ({ duration: calm ? 0 : duration, easing: motion.easeInOutCubic });
        switch (e.type) {
          case 'introDone': {
            const firstTime = greeted.current === false;
            opacity.set(withTiming(1, { duration: 220 }));
            if (calm) {
              scale.set(COUNTRY_SCALE);
            } else {
              lift.set(46);
              lift.set(withSpring(0, motion.springSoft));
              scale.set(
                withSequence(
                  withTiming(COUNTRY_SCALE * 1.1, { duration: 260, easing: motion.easeOutCubic }),
                  withSpring(COUNTRY_SCALE, motion.spring),
                ),
              );
            }
            send({ type: 'appear', firstTime });
            setAppeared(true);
            if (firstTime) {
              say('¡Hola! Toca una región para empezar');
              greeted.current = true;
              AsyncStorage.setItem(GREETED_KEY, '1').catch(() => undefined);
            }
            break;
          }
          case 'press':
            setBubble(null);
            send({ type: 'press', direction: directionTo(e.sx) });
            break;
          case 'flightStart': {
            setBubble(null);
            setPlaceLabel(null);
            if (calm) visibility.set(withTiming(0, { duration: 120 }));
            if (e.to === 'country') {
              // Del acople (pantalla) de vuelta a su punto del mapa, al ritmo del vuelo.
              blend.set(withTiming(0, ease(e.duration)));
              scale.set(withTiming(COUNTRY_SCALE, ease(e.duration)));
            } else {
              const from = currentScreen();
              screenX.set(from.x);
              screenY.set(from.y);
              blend.set(1);
              screenX.set(withTiming(DOCK_X, ease(e.duration)));
              screenY.set(withTiming(latestDockY.current, ease(e.duration)));
              scale.set(withSequence(withTiming(0.9, ease(e.duration * 0.5)), withTiming(1, ease(e.duration * 0.5))));
            }
            send({ type: 'travelStart', direction: depth(e.to) >= depth(e.from) ? 'in' : 'out' });
            break;
          }
          case 'flightEnd':
            if (!e.completed) break; // otra transición tomó el control
            if (calm) visibility.set(withTiming(1, { duration: 200 }));
            send({ type: 'travelEnd' });
            break;
          case 'markersShown':
            send({ type: 'markersShown' });
            break;
          case 'destinationSelected':
            setBubble(null);
            send({ type: 'destinationSelected', direction: directionTo(e.sx) });
            break;
        }
      }),
    [blend, currentScreen, directionTo, lift, opacity, say, scale, screenX, screenY, send, subscribe, visibility],
  );

  // Recolocar el acople cuando cambia la altura del sheet (fuera de los vuelos).
  useEffect(() => {
    if (level === 'country' || state.traveling || size.height === 0) return;
    screenX.set(withTiming(DOCK_X, { duration: 280, easing: motion.easeOutCubic }));
    screenY.set(withTiming(dockY, { duration: 280, easing: motion.easeOutCubic }));
  }, [dockY, level, screenX, screenY, size.height, state.traveling]);

  // Ocultar con el sheet expandido / búsqueda.
  useEffect(() => {
    visibility.set(withTiming(hidden ? 0 : 1, { duration: hidden ? 150 : 240 }));
  }, [hidden, visibility]);

  // ---- Acciones ---------------------------------------------------------------
  const onTap = useCallback(() => {
    haptics.selection();
    send({ type: 'tap' });
    say(TIPS[level]);
  }, [level, say, send]);

  /** "Cerca de mí": salta a tu ubicación si estás en el Perú. */
  const locate = useCallback(async () => {
    if (locating || level !== 'country' || !country) return;
    setLocating(true);
    say('Buscando tu ubicación…');
    try {
      const Location = await import('expo-location');
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        send({ type: 'locateFailed' });
        say('Activa el permiso de ubicación para encontrarte');
        return;
      }
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
      const p = project(pos.coords.longitude, pos.coords.latitude);
      const region = hitTest(country.shapes, p.x, p.y);
      if (!region) {
        send({ type: 'locateFailed' });
        say('Estás fuera del Perú: te espero en Lima');
        return;
      }
      haptics.impact();
      send({ type: 'locateStart' });
      const calm = reduceMotion.current;
      if (!calm) lift.set(withSequence(withTiming(40, { duration: 260 }), withSpring(0, motion.springSoft)));
      const move = { duration: calm ? 0 : 560, easing: motion.easeInOutCubic };
      worldX.set(withTiming(p.x, move));
      worldY.set(withTiming(p.y, move));
      setTimeout(() => {
        send({ type: 'locateArrived' });
        setBubble(null);
        setPlaceLabel(`Estás aquí · ${region.name}`);
      }, move.duration + 40);
    } catch {
      send({ type: 'locateFailed' });
      say('No pudimos obtener tu ubicación');
    } finally {
      setLocating(false);
    }
  }, [country, level, lift, locating, say, send, worldX, worldY]);

  const onClipEnd = useCallback((seq: number) => dispatch({ type: 'clipEnded', seq }), []);

  return useMemo(
    () => ({
      clip: currentClip(state),
      seq: state.seq,
      facing: state.facing,
      appeared,
      bubble: bubble?.text ?? placeLabel,
      bubbleKey: bubble?.id ?? (placeLabel ? 'place' : null),
      containerStyle,
      paused: !appeared || hidden,
      locating,
      onClipEnd,
      onTap,
      locate,
      openDestination: () => send({ type: 'openDestination' }),
      celebrate: () => send({ type: 'saved' }),
    }),
    [appeared, bubble, containerStyle, hidden, locate, locating, onClipEnd, onTap, placeLabel, send, state],
  );
}

export type AvatarDirector = ReturnType<typeof useAvatarDirector>;

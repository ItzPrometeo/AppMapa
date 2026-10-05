/**
 * useAvatarMapController — monta el AvatarMapController una sola vez y lo
 * conecta con el mapa:
 *  - se suscribe a los eventos del explorador (mapReady, transitionStart,
 *    zoomStart, zoomEnd, mapPan, destinationSelected/Cleared);
 *  - en el hilo de UI: aplica la recolocación pendiente al llegar el zoom al
 *    punto `repositionAt` y calcula la opacidad a partir del progreso del zoom
 *    (sin timers);
 *  - posiciona el contenedor del avatar siguiendo la cámara del mapa: la
 *    POSICIÓN sigue al mapa, el TAMAÑO no (lo fija el renderer en píxeles).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { Level } from '@/features/map/state/explorerMachine';
import type { MapExplorer } from '@/features/map/state/useMapExplorer';
import { haptics } from '@/lib/haptics';

import { AVATAR_MAP_CONFIG } from './avatarMapConfig';
import { createAvatarEnvironment } from './avatarEnvironment';
import { AvatarMapController, MODEL_FORWARD_OFFSET, type AvatarSharedValues } from './AvatarMapController';
import { avatarHeightFor, zoomOpacity } from './avatarMath';
import { AVATAR_CANVAS, FEET_MARGIN, type AvatarRenderLink } from './ExplorerAvatar';

type Options = {
  insetsFor: (level: Level, opts?: { destinationOpen?: boolean }) => { top: number; bottom: number };
  /** Ocultar (búsqueda abierta, ficha expandida…). */
  hidden: boolean;
};

const REPOSITION_AT = AVATAR_MAP_CONFIG.transition.repositionAt;

export function useAvatarMapController(explorer: MapExplorer, { insetsFor, hidden }: Options) {
  const { camera, subscribe } = explorer;

  const worldX = useSharedValue(0);
  const worldY = useSharedValue(0);
  const opacity = useSharedValue(0);
  const zoomSync = useSharedValue(0);
  const zoomFrom = useSharedValue(1);
  const pendingX = useSharedValue(0);
  const pendingY = useSharedValue(0);
  const pendingActive = useSharedValue(0);
  const popScale = useSharedValue(1);
  const lift = useSharedValue(0);
  const visibility = useSharedValue(1);

  const [visible, setVisible] = useState(false);

  const progress = camera.flightProgress;

  // El controlador se crea UNA vez (inicializador perezoso de useState) y vive
  // mientras el mapa esté montado. Es dueño del canal con el renderer (`link`).
  const [controller] = useState(() => {
    const sv: AvatarSharedValues = {
      worldX,
      worldY,
      opacity,
      zoomSync,
      zoomFrom,
      pendingX,
      pendingY,
      pendingActive,
      popScale,
      lift,
    };
    const insets = { current: insetsFor };
    const env = createAvatarEnvironment({
      viewport: () => camera.getViewport(),
      camera: () => camera.getCamera(),
      zoomProgress: () => progress.get(),
      insetsFor: (l, o) => insets.current(l, o),
    });
    const initialLink: AvatarRenderLink = {
      clip: 'avatar_idle',
      seq: 0,
      fade: AVATAR_MAP_CONFIG.crossFadeDuration,
      heading: MODEL_FORWARD_OFFSET,
      heightPx: avatarHeightFor(600, 'COUNTRY'),
      paused: true,
      onClipEnd: () => undefined,
    };
    const c = new AvatarMapController(sv, initialLink, () => env, setVisible);
    c.setInsetsProvider = (fn) => {
      insets.current = fn;
    };
    return c;
  });

  // Insets siempre actualizados (cabecera/sheet cambian con el nivel).
  useEffect(() => {
    controller.setInsetsProvider(insetsFor);
  }, [controller, insetsFor]);

  useEffect(() => subscribe((e) => controller.handle(e)), [controller, subscribe]);
  useEffect(() => () => controller.dispose(), [controller]);

  // Recolocación invisible a mitad del zoom (TRANSITION → ancla del nuevo nivel).
  useAnimatedReaction(
    () => progress.value,
    (p) => {
      if (zoomSync.get() && pendingActive.get() && p >= REPOSITION_AT) {
        worldX.set(pendingX.get());
        worldY.set(pendingY.get());
        pendingActive.set(0);
      }
    },
  );

  useEffect(() => {
    visibility.set(withTiming(hidden ? 0 : 1, { duration: hidden ? 150 : 240 }));
    controller.setPaused(hidden || !visible);
  }, [controller, hidden, visibility, visible]);

  const cam = camera.camera;
  const vp = camera.viewport;
  const containerStyle = useAnimatedStyle(() => {
    const c = cam.value;
    const v = vp.value;
    // Pies del avatar en pantalla = proyección de su punto del mapa.
    const x = (worldX.value - c.x) * c.k + v.width / 2;
    const y = (worldY.value - c.y) * c.k + v.height / 2;
    const o = zoomSync.value ? zoomOpacity(progress.value, zoomFrom.value) : opacity.value;
    return {
      opacity: o * visibility.value,
      transform: [
        { translateX: x - AVATAR_CANVAS.width / 2 },
        { translateY: y - (AVATAR_CANVAS.height - FEET_MARGIN) - lift.value },
        { scale: popScale.value },
      ],
    };
  });

  /** "Cerca de mí" (sólo niveles locales): pide permiso sólo al tocar. */
  const [locating, setLocating] = useState(false);
  const [bubble, setBubble] = useState<{ id: number; text: string } | null>(null);
  useEffect(() => {
    if (!bubble) return;
    const t = setTimeout(() => setBubble(null), 3200);
    return () => clearTimeout(t);
  }, [bubble]);

  const locate = useCallback(async () => {
    if (locating) return;
    setLocating(true);
    try {
      const Location = await import('expo-location');
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setBubble({ id: Date.now(), text: 'Activa tu ubicación para ubicarte en el mapa' });
        return;
      }
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
      const { project } = await import('@/features/map/geo/projection');
      controller.setUserLocation(project(pos.coords.longitude, pos.coords.latitude));
      if (controller.goToUserLocation()) {
        haptics.impact();
        setBubble({ id: Date.now(), text: 'Estás aquí' });
      } else {
        setBubble({ id: Date.now(), text: 'Tu ubicación está fuera de esta zona' });
      }
    } catch {
      setBubble({ id: Date.now(), text: 'No pudimos encontrar tu ubicación' });
    } finally {
      setLocating(false);
    }
  }, [controller, locating]);

  // Si el permiso ya estaba concedido, la ubicación se usa en silencio en
  // niveles locales (nunca se pide al abrir el mapa).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const Location = await import('expo-location');
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;
        const last = await Location.getLastKnownPositionAsync();
        if (!last || cancelled) return;
        const { project } = await import('@/features/map/geo/projection');
        controller.setUserLocation(project(last.coords.longitude, last.coords.latitude));
      } catch {
        // Sin ubicación: el guía usa las anclas del mapa.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [controller]);

  return useMemo(
    () => ({ link: controller.link, containerStyle, visible, bubble, locate, locating }),
    [bubble, containerStyle, controller, locate, locating, visible],
  );
}

export type AvatarMapHandle = ReturnType<typeof useAvatarMapController>;

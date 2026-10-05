/**
 * AvatarLayer — el guía sobre el mapa.
 *
 * Jerarquía de capas (de abajo a arriba):
 *   mapa → marcadores → AVATAR → etiquetas importantes → botones → tarjetas/sheet → UI
 * El avatar va por encima de los marcadores pero por debajo de los nombres y
 * de toda la interfaz; además AvatarMapController evita colocarlo encima de
 * etiquetas, marcadores y controles.
 *
 * Mientras el modelo 3D carga, o si el dispositivo no puede mostrarlo, se ve
 * la gota SPoint en 2D: el mapa nunca depende del avatar. No muestra ningún
 * texto técnico (estados, coordenadas, FPS…); sólo un mensaje breve al usuario
 * cuando él lo pide (p. ej. "Estás aquí").
 */
import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { SPointMark } from '@/components/ui/SPointMark';
import { colors, fonts, radius, shadow } from '@/theme/tokens';

import { MAX_AVATAR_HEIGHT } from './avatarMath';
import { AVATAR_CANVAS, ExplorerAvatar, FEET_MARGIN } from './ExplorerAvatar';
import type { AvatarMapHandle } from './useAvatarMapController';

type Props = { avatar: AvatarMapHandle };

export const AvatarLayer = memo(function AvatarLayer({ avatar }: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  return (
    // pointerEvents="none": el guía nunca intercepta toques; lo que hay debajo
    // (una provincia, un marcador) sigue respondiendo al instante.
    <Animated.View style={[styles.container, avatar.containerStyle]} pointerEvents="none">
      {status !== 'failed' && (
        <View
          style={[StyleSheet.absoluteFill, status !== 'ready' && styles.invisible]}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <ExplorerAvatar link={avatar.link} onReady={() => setStatus('ready')} onError={() => setStatus('failed')} />
        </View>
      )}
      {status !== 'ready' && <Placeholder />}

      {avatar.bubble && (
        <Animated.View
          key={avatar.bubble.id}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={styles.bubbleWrap}
          pointerEvents="none"
        >
          <View style={styles.bubble} accessibilityLiveRegion="polite">
            <Text style={styles.bubbleText}>{avatar.bubble.text}</Text>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
});

/** Gota SPoint que "respira" mientras carga el 3D (o si no está disponible). */
function Placeholder() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), -1));
  }, [t]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -t.value * 3 }] }));
  return (
    <View style={styles.placeholder} pointerEvents="none">
      <Animated.View style={style}>
        <SPointMark size={34} />
      </Animated.View>
      <View style={styles.placeholderShadow} />
    </View>
  );
}

/** Alto máximo del cuerpo (para colocar el mensaje sobre la cabeza). */
const HIT_H = MAX_AVATAR_HEIGHT;
const BUBBLE_W = 200;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: AVATAR_CANVAS.width,
    height: AVATAR_CANVAS.height,
    // Escala de aparición desde los pies (el punto anclado al mapa).
    transformOrigin: `50% ${AVATAR_CANVAS.height - FEET_MARGIN}px`,
  },
  invisible: { opacity: 0 },
  placeholder: { position: 'absolute', left: 0, right: 0, bottom: FEET_MARGIN - 4, alignItems: 'center' },
  placeholderShadow: {
    width: 20,
    height: 6,
    borderRadius: 3,
    marginTop: 2,
    backgroundColor: 'rgba(16, 42, 67, 0.16)',
  },
  bubbleWrap: {
    position: 'absolute',
    left: AVATAR_CANVAS.width / 2 - BUBBLE_W / 2,
    bottom: FEET_MARGIN + HIT_H + 4,
    width: BUBBLE_W,
    alignItems: 'center',
  },
  bubble: {
    maxWidth: BUBBLE_W,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    ...shadow.md,
  },
  bubbleText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
});

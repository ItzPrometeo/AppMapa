/**
 * AvatarLayer — overlay del guía sobre el mapa (hermano del SVG, como los
 * marcadores). Mientras el modelo 3D carga, o si el dispositivo no puede
 * mostrarlo, se ve la gota SPoint en 2D: el mapa nunca depende del avatar.
 */
import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

import { AVATAR_CANVAS, AVATAR_HEIGHT_PX, ExplorerAvatar, FEET_MARGIN } from './ExplorerAvatar';
import type { AvatarDirector } from './useAvatarDirector';

type Props = { avatar: AvatarDirector };

export const AvatarLayer = memo(function AvatarLayer({ avatar }: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  return (
    <Animated.View style={[styles.container, avatar.containerStyle]} pointerEvents="box-none">
      {status !== 'failed' && (
        <View style={[StyleSheet.absoluteFill, status !== 'ready' && styles.invisible]} pointerEvents="none">
          <ExplorerAvatar
            clip={avatar.clip}
            seq={avatar.seq}
            facing={avatar.facing}
            paused={avatar.paused}
            onClipEnd={avatar.onClipEnd}
            onReady={() => setStatus('ready')}
            onError={() => setStatus('failed')}
          />
        </View>
      )}
      {status !== 'ready' && <Placeholder />}

      {avatar.bubble && (
        <Animated.View
          key={String(avatar.bubbleKey)}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={styles.bubbleWrap}
          pointerEvents="none"
        >
          <View style={styles.bubble} accessibilityLiveRegion="polite">
            <Text style={styles.bubbleText}>{avatar.bubble}</Text>
          </View>
          <View style={styles.bubbleTail} />
        </Animated.View>
      )}

      <Pressable
        onPress={avatar.onTap}
        style={styles.hit}
        accessibilityRole="button"
        accessibilityLabel="Guía SPoint. Toca para recibir un consejo"
      />
    </Animated.View>
  );
});

/** Gota SPoint que "respira" mientras carga el 3D (o si no está disponible). */
function Placeholder() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), -1));
  }, [t]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -t.value * 4 }] }));
  return (
    <View style={styles.placeholder} pointerEvents="none">
      <Animated.View style={style}>
        <SPointMark size={40} />
      </Animated.View>
      <View style={styles.placeholderShadow} />
    </View>
  );
}

const BODY_W = 52;
const BUBBLE_W = 200;
const HEAD_TOP = AVATAR_CANVAS.height - FEET_MARGIN - AVATAR_HEIGHT_PX;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: AVATAR_CANVAS.width,
    height: AVATAR_CANVAS.height,
    // Escala desde los pies (el punto anclado al mapa).
    transformOrigin: `50% ${AVATAR_CANVAS.height - FEET_MARGIN}px`,
  },
  invisible: { opacity: 0 },
  hit: {
    position: 'absolute',
    left: (AVATAR_CANVAS.width - BODY_W) / 2,
    width: BODY_W,
    top: HEAD_TOP,
    height: AVATAR_HEIGHT_PX,
  },
  placeholder: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: FEET_MARGIN - 4,
    alignItems: 'center',
  },
  placeholderShadow: {
    width: 22,
    height: 6,
    borderRadius: 3,
    marginTop: 2,
    backgroundColor: 'rgba(16, 42, 67, 0.16)',
  },
  // Centrada sobre la cabeza: no se sale de la pantalla aunque el guía esté cerca de un borde.
  bubbleWrap: {
    position: 'absolute',
    left: AVATAR_CANVAS.width / 2 - BUBBLE_W / 2,
    bottom: AVATAR_CANVAS.height - HEAD_TOP + 2,
    width: BUBBLE_W,
    alignItems: 'center',
  },
  bubble: {
    maxWidth: BUBBLE_W,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    ...shadow.md,
  },
  bubbleText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  bubbleTail: {
    width: 12,
    height: 12,
    marginTop: -6,
    backgroundColor: colors.surface,
    transform: [{ rotate: '45deg' }],
  },
});

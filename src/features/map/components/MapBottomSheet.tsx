/**
 * MapBottomSheet — hoja inferior flotante con detents.
 *
 * - `snapPoints`: alturas visibles en px (p. ej. collapsed / medium / expanded).
 * - Arrastre con física: la velocidad del gesto decide el detent de destino.
 * - Cuando cambian los snapPoints (nuevo contenido) anima suavemente la altura.
 * - El contenido recibe `progress` (0 = primer detent, 1 = último) para
 *   adaptar su layout de forma continua mientras se arrastra.
 *
 * Implementación propia (sin dependencias) para controlar diseño y
 * coordinación con la cámara del mapa.
 */
import { useEffect, useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, radius, shadow } from '@/theme/tokens';

type Props = {
  snapPoints: number[];
  index: number;
  onIndexChange?: (index: number) => void;
  /** Distancia desde el borde inferior (p. ej. altura de la tab bar). */
  bottomOffset: SharedValue<number>;
  children: (progress: SharedValue<number>) => ReactNode;
  /** Arrastrable desde cualquier punto (false ⇒ sólo desde el asa). */
  dragAnywhere?: boolean;
  accessibilityLabel?: string;
};

const SPRING = { damping: 26, stiffness: 260, mass: 0.9, overshootClamping: false };

export function MapBottomSheet({
  snapPoints,
  index,
  onIndexChange,
  bottomOffset,
  children,
  dragAnywhere = true,
  accessibilityLabel,
}: Props) {
  const maxH = Math.max(...snapPoints);
  const snaps = useSharedValue(snapPoints);
  const height = useSharedValue(snapPoints[index] ?? snapPoints[0]);
  const startH = useSharedValue(0);

  // Cambio de contenido o de detent controlado desde fuera.
  const key = snapPoints.join(',');
  useEffect(() => {
    snaps.set(snapPoints);
    height.set(withSpring(snapPoints[Math.min(index, snapPoints.length - 1)], SPRING));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, index]);

  const progress = useDerivedValue(() => {
    const s = snaps.value;
    const lo = s[0];
    const hi = s[s.length - 1];
    return hi === lo ? 0 : interpolate(height.value, [lo, hi], [0, 1], 'clamp');
  });

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .failOffsetX([-20, 20])
        .onStart(() => {
          startH.set(height.value);
        })
        .onUpdate((e) => {
          const s = snaps.value;
          const lo = s[0];
          const hi = s[s.length - 1];
          let h = startH.value - e.translationY;
          // Resistencia elástica fuera de los límites.
          if (h > hi) h = hi + (h - hi) * 0.25;
          if (h < lo) h = lo - (lo - h) * 0.25;
          height.set(h);
        })
        .onEnd((e) => {
          const s = snaps.value;
          // Proyección de la posición con la velocidad (sensación nativa).
          const projected = height.value - e.velocityY * 0.18;
          let best = 0;
          for (let i = 1; i < s.length; i++) {
            if (Math.abs(s[i] - projected) < Math.abs(s[best] - projected)) best = i;
          }
          height.set(withSpring(s[best], { ...SPRING, velocity: -e.velocityY }));
          if (onIndexChange) scheduleOnRN(onIndexChange, best);
        }),
    [height, onIndexChange, snaps, startH],
  );

  const containerStyle = useAnimatedStyle(() => ({
    // El sheet cuelga del borde inferior y se desplaza hacia arriba; los 40 px
    // extra cubren el rebote del spring sin dejar ver el fondo.
    height: maxH + 40,
    transform: [{ translateY: -(height.value + bottomOffset.value) }],
  }));

  const sheet = (
    <Animated.View
      style={[styles.sheet, containerStyle]}
      accessibilityLabel={accessibilityLabel}
      accessibilityViewIsModal={false}
    >
      <GestureDetector gesture={pan}>
        <View style={styles.handleArea} accessibilityRole="adjustable" accessibilityLabel="Arrastra para expandir">
          <View style={styles.handle} />
        </View>
      </GestureDetector>
      <View style={styles.content}>{children(progress)}</View>
    </Animated.View>
  );

  if (!dragAnywhere) return sheet;
  return <GestureDetector gesture={pan}>{sheet}</GestureDetector>;
}

export const SHEET_HANDLE_HEIGHT = 22;

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    ...shadow.lg,
  },
  handleArea: { height: SHEET_HANDLE_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 38, height: 5, borderRadius: 3, backgroundColor: '#D5DAE5' },
  content: { flex: 1 },
});

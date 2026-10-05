/**
 * TouristMarker — marcador propio de SPoint (no el pin rojo genérico).
 *
 *   ● gota morada con borde blanco y sombra suave
 *   ○ círculo blanco interior con el icono de la categoría (color + icono + texto
 *     → nunca sólo color)
 *   ★ distintivo naranja si el lugar es muy popular
 *   seleccionado: crece, pasa a naranja y emite un pulso
 *
 * Aparición: scale 0 → 1.1 → 1 con spring, escalonada por el contenedor.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { categoryStyle } from '@/features/destinations/categories';
import type { Category } from '@/features/destinations/types';
import { colors, fonts, motion, shadow } from '@/theme/tokens';
import type { Camera, Viewport } from '../camera/cameraMath';
import { useScreenPosition } from '../hooks/useScreenPosition';

export const PIN_W = 44;
/** La punta de la gota (rotada 45°) cae a ~47.5 px: el ancla queda justo ahí. */
export const PIN_H = 48;
export const POPULAR_THRESHOLD = 85;
const LABEL_W = 200;

type Props = {
  id: string;
  name: string;
  category: Category;
  popularity: number;
  x: number;
  y: number;
  camera: SharedValue<Camera>;
  viewport: SharedValue<Viewport>;
  /** Date.now() en el que debe aparecer (stagger calculado por la capa). */
  appearAt: number;
  visible: boolean;
  selected: boolean;
  showLabel: boolean;
  onPress: (id: string) => void;
};

export const TouristMarker = memo(function TouristMarker(props: Props) {
  const { id, name, category, popularity, x, y, camera, viewport, appearAt, visible, selected, showLabel, onPress } =
    props;
  const cat = categoryStyle(category);
  const position = useScreenPosition(camera, viewport, x, y, -PIN_W / 2, -PIN_H);

  const appear = useSharedValue(0);
  const active = useSharedValue(selected ? 1 : 0);
  const press = useSharedValue(0);
  const ring = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      appear.set(withTiming(0, { duration: 150 }));
      return;
    }
    if (appear.get() > 0.99) return; // ya visible: no repetir el "pop"
    appear.set(
      withDelay(
        Math.max(0, appearAt - Date.now()),
        withSequence(withSpring(1.1, motion.springBouncy), withSpring(1, motion.spring)),
      ),
    );
  }, [visible, appearAt, appear]);

  useEffect(() => {
    active.set(withSpring(selected ? 1 : 0, motion.spring));
    ring.set(selected ? withRepeat(withTiming(1, { duration: 1400 }), -1, false) : withTiming(0, { duration: 200 }));
  }, [selected, active, ring]);

  const pinStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, appear.value * 1.5),
    transform: [{ scale: appear.value * (1 + active.value * 0.18) * (1 - press.value * 0.08) }],
  }));

  const bodyStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(active.value, [0, 1], [colors.brand.purple, colors.brand.orange]),
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: selected ? interpolate(ring.value, [0, 1], [0.45, 0]) : 0,
    transform: [{ scale: interpolate(ring.value, [0, 1], [0.6, 1.8]) }],
  }));

  const labelStyle = useAnimatedStyle(() => ({ opacity: appear.value > 0.9 ? 1 : appear.value }));

  return (
    <Animated.View style={[styles.anchor, position]} pointerEvents="box-none">
      <Pressable
        onPress={() => onPress(id)}
        onPressIn={() => press.set(withTiming(1, { duration: 80 }))}
        onPressOut={() => press.set(withSpring(0, motion.spring))}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${category}${popularity >= POPULAR_THRESHOLD ? ', popular' : ''}`}
        accessibilityState={{ selected }}
        style={styles.pressable}
      >
        <Animated.View style={[styles.pin, pinStyle]}>
          <Animated.View style={[styles.ring, ringStyle]} />
          <View style={styles.groundShadow} />
          <Animated.View style={[styles.body, bodyStyle]}>
            <View style={styles.inner}>
              <MaterialCommunityIcons name={cat.icon} size={15} color={cat.color} />
            </View>
          </Animated.View>
          {popularity >= POPULAR_THRESHOLD && (
            <View style={styles.badge}>
              <MaterialCommunityIcons name="star" size={9} color={colors.onBrand} />
            </View>
          )}
        </Animated.View>
      </Pressable>
      {(showLabel || selected) && (
        <Animated.View style={[styles.labelWrap, labelStyle]} pointerEvents="none">
          <Text numberOfLines={1} style={[styles.label, selected && styles.labelSelected]}>
            {name}
          </Text>
        </Animated.View>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  anchor: { position: 'absolute', left: 0, top: 0, width: PIN_W, height: PIN_H, alignItems: 'center' },
  pressable: { width: PIN_W, height: PIN_H, alignItems: 'center' },
  pin: {
    width: PIN_W,
    height: PIN_H,
    alignItems: 'center',
    // La escala se aplica desde la punta del pin, que es la coordenada real.
    transformOrigin: '50% 100%',
  },
  ring: {
    position: 'absolute',
    bottom: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brand.orange,
  },
  groundShadow: {
    position: 'absolute',
    bottom: -3,
    width: 12,
    height: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(16, 42, 67, 0.16)',
  },
  body: {
    marginTop: 4,
    width: 36,
    height: 36,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 3,
    transform: [{ rotate: '45deg' }],
    borderWidth: 2.5,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },
  inner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-45deg' }],
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.brand.orange,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelWrap: {
    position: 'absolute',
    top: PIN_H + 3,
    left: (PIN_W - LABEL_W) / 2,
    width: LABEL_W,
    alignItems: 'center',
  },
  label: {
    maxWidth: 160,
    overflow: 'hidden',
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.text,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    ...shadow.sm,
  },
  labelSelected: { backgroundColor: colors.brand.purple, color: colors.onBrand },
});

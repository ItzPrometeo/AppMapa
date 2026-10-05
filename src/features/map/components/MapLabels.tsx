/**
 * Nombres de regiones/provincias sobre el mapa.
 *
 * Son vistas nativas superpuestas (no texto SVG) para que mantengan tamaño
 * constante con el zoom. Sólo se muestran si caben dentro del polígono; los
 * demás nombres aparecen al presionar o seleccionar (accesibilidad: el estado
 * nunca depende sólo del color).
 */
import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { colors, fonts } from '@/theme/tokens';
import type { Camera, Viewport } from '../camera/cameraMath';
import { useScreenPosition } from '../hooks/useScreenPosition';

export type MapLabelItem = {
  id: string;
  text: string;
  x: number;
  y: number;
  visible: boolean;
  emphasis?: boolean;
  /** ms de retraso al aparecer (para acompañar el stagger de los polígonos). */
  delay?: number;
};

type Props = {
  items: MapLabelItem[];
  camera: SharedValue<Camera>;
  viewport: SharedValue<Viewport>;
  size?: 'sm' | 'md';
};

const BOX_W = 180;
const BOX_H = 24;

export const MapLabels = memo(function MapLabels({ items, camera, viewport, size = 'md' }: Props) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {items.map((item) => (
        <Label key={item.id} item={item} camera={camera} viewport={viewport} size={size} />
      ))}
    </View>
  );
});

function Label({
  item,
  camera,
  viewport,
  size,
}: {
  item: MapLabelItem;
  camera: SharedValue<Camera>;
  viewport: SharedValue<Viewport>;
  size: 'sm' | 'md';
}) {
  const position = useScreenPosition(camera, viewport, item.x, item.y, -BOX_W / 2, -BOX_H / 2);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.set(
      item.visible ? withDelay(item.delay ?? 0, withTiming(1, { duration: 260 })) : withTiming(0, { duration: 140 }),
    );
  }, [item.visible, item.delay, opacity]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.box, position, fade]}>
      <Text
        numberOfLines={1}
        style={[styles.text, size === 'sm' && styles.small, item.emphasis && styles.emphasis]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {item.text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: BOX_W,
    height: BOX_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 0.1,
    color: colors.brand.navy,
    textShadowColor: 'rgba(255,255,255,0.95)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 0 },
  },
  small: { fontSize: 10.5, fontFamily: fonts.semibold, color: '#2A3B55' },
  emphasis: {
    color: colors.onBrand,
    textShadowColor: 'rgba(40, 20, 120, 0.55)',
  },
});

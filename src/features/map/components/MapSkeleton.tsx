/**
 * Estado de carga sin spinner: siluetas suaves que "respiran". Se muestra
 * sólo si el mapa base tarda (p. ej. primera descarga desde la API); con los
 * datos empaquetados pasa directamente a la animación de entrada del mapa.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { colors, radius } from '@/theme/tokens';

export function MapSkeleton() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withRepeat(withTiming(1, { duration: 900 }), -1, true));
  }, [t]);
  const breathe = useAnimatedStyle(() => ({ opacity: 0.45 + t.value * 0.4 }));

  return (
    <View style={styles.wrap} accessibilityLabel="Cargando mapa" accessibilityRole="progressbar">
      <Animated.View style={[styles.blob, breathe]}>
        <View style={[styles.lobe, { top: 0, left: '18%', width: '46%', height: '30%' }]} />
        <View style={[styles.lobe, { top: '22%', left: '30%', width: '52%', height: '36%' }]} />
        <View style={[styles.lobe, { top: '52%', left: '42%', width: '44%', height: '34%' }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  blob: { width: '70%', aspectRatio: 0.72, transform: [{ rotate: '-8deg' }] },
  lobe: { position: 'absolute', borderRadius: radius.xl * 2, backgroundColor: colors.map.skeleton },
});

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { colors, shadow } from '@/theme/tokens';

type Props = { onZoomIn: () => void; onZoomOut: () => void; onRecenter: () => void };

/** Controles de cámara: acercar, alejar y re-encuadrar el nivel actual. */
export const MapControls = memo(function MapControls({ onZoomIn, onZoomOut, onRecenter }: Props) {
  return (
    <Animated.View entering={FadeIn.duration(240)} exiting={FadeOut.duration(160)} style={styles.column}>
      <View style={styles.card}>
        <ControlButton icon="plus" label="Acercar" onPress={onZoomIn} />
        <View style={styles.divider} />
        <ControlButton icon="minus" label="Alejar" onPress={onZoomOut} />
      </View>
      <View style={styles.card}>
        <ControlButton icon="fit-to-screen-outline" label="Centrar mapa" onPress={onRecenter} />
      </View>
    </Animated.View>
  );
});

function ControlButton({
  icon,
  label,
  onPress,
}: {
  icon: 'plus' | 'minus' | 'fit-to-screen-outline';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name={icon} size={22} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  column: { gap: 10 },
  card: { backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden', ...shadow.sm },
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: colors.surfaceMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: 8 },
});

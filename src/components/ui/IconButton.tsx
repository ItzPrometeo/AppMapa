import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { colors, HIT_SLOP_MIN, motion, shadow } from '@/theme/tokens';

type Props = {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
  accessibilityLabel: string;
  variant?: 'surface' | 'ghost' | 'brand' | 'glass';
  size?: number;
  iconSize?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
};

/** Botón circular de icono con área táctil ≥ 44 px y micro-animación al presionar. */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'surface',
  size = HIT_SLOP_MIN,
  iconSize = 22,
  color,
  style,
  disabled,
}: Props) {
  const press = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.08 }] }));
  const bg =
    variant === 'surface'
      ? colors.surface
      : variant === 'brand'
        ? colors.brand.purple
        : variant === 'glass'
          ? 'rgba(255,255,255,0.88)'
          : 'transparent';
  const fg = color ?? (variant === 'brand' ? colors.onBrand : colors.text);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => press.set(withTiming(1, { duration: 80 }))}
      onPressOut={() => press.set(withSpring(0, motion.spring))}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={Math.max(0, (HIT_SLOP_MIN - size) / 2)}
      style={style}
    >
      <Animated.View
        style={[
          styles.base,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
          (variant === 'surface' || variant === 'glass') && shadow.sm,
          disabled && styles.disabled,
          animated,
        ]}
      >
        <MaterialCommunityIcons name={icon} size={iconSize} color={fg} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
});

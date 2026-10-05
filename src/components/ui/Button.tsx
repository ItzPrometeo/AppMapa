import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { colors, fonts, motion, radius } from '@/theme/tokens';

type Props = {
  label: string;
  onPress: () => void;
  icon?: ComponentProps<typeof MaterialCommunityIcons>['name'];
  variant?: 'primary' | 'secondary' | 'tonal';
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  compact?: boolean;
};

export function Button({ label, onPress, icon, variant = 'primary', style, accessibilityHint, compact }: Props) {
  const press = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.04 }] }));
  const palette = {
    primary: { bg: colors.brand.purple, fg: colors.onBrand, border: colors.brand.purple },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
    tonal: { bg: colors.brand.purpleSoft, fg: colors.brand.purpleDeep, border: colors.brand.purpleSoft },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => press.set(withTiming(1, { duration: 80 }))}
      onPressOut={() => press.set(withSpring(0, motion.spring))}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={style}
    >
      <Animated.View
        style={[
          styles.base,
          compact && styles.compact,
          { backgroundColor: palette.bg, borderColor: palette.border },
          animated,
        ]}
      >
        {icon && <MaterialCommunityIcons name={icon} size={18} color={palette.fg} />}
        <Text style={[styles.label, compact && styles.labelCompact, { color: palette.fg }]} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  compact: { minHeight: 46, paddingHorizontal: 14, gap: 6 },
  label: { fontFamily: fonts.bold, fontSize: 15 },
  labelCompact: { fontSize: 14 },
});

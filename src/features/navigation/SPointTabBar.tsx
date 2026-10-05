/**
 * Barra inferior de SPoint: Explorar · Favoritos · Perfil.
 * Se desliza fuera de la pantalla cuando el mapa entra en una región.
 *
 * Nota: los <TabTrigger> deben declararse en el layout (expo-router los
 * descubre recorriendo los hijos de <Tabs>), por eso aquí sólo vive la UI.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { TabListProps, TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef, useEffect, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, motion, shadow } from '@/theme/tokens';
import { TAB_BAR_HEIGHT, useTabBarHidden } from './tabBarStore';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Contenedor de la barra (usar como hijo `asChild` de <TabList>). */
export function TabBarContainer({ children, style, ...rest }: TabListProps) {
  const insets = useSafeAreaInsets();
  const hidden = useTabBarHidden();
  const offset = useSharedValue(0);
  const total = TAB_BAR_HEIGHT + insets.bottom;

  useEffect(() => {
    offset.set(withTiming(hidden ? total + 8 : 0, { duration: 320, easing: motion.easeInOutCubic }));
  }, [hidden, total, offset]);

  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return (
    <Animated.View
      {...rest}
      style={[styles.bar, { height: total, paddingBottom: insets.bottom }, animated, style]}
      pointerEvents={hidden ? 'none' : 'auto'}
      accessibilityRole="tablist"
    >
      {children}
    </Animated.View>
  );
}

type TabButtonProps = TabTriggerSlotProps & { icon: IconName; activeIcon: IconName; label: string };

export const TabButton = forwardRef<View, TabButtonProps>(function TabButton(
  { icon, activeIcon, label, isFocused, ...props },
  ref,
) {
  const color = isFocused ? colors.brand.purple : colors.textTertiary;
  return (
    <Pressable
      ref={ref}
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={label}
      style={styles.tab}
    >
      <View style={[styles.iconWrap, isFocused && styles.iconWrapActive]}>
        <MaterialCommunityIcons name={isFocused ? activeIcon : icon} size={22} color={color} />
      </View>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    ...shadow.sm,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 44 },
  iconWrap: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: { backgroundColor: colors.brand.purpleSoft },
  label: { fontFamily: fonts.semibold, fontSize: 11 },
});

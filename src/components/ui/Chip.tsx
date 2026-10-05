import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '@/theme/tokens';

type Props = {
  label: string;
  icon?: ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconColor?: string;
  selected?: boolean;
  count?: number;
  onPress?: () => void;
  tone?: { bg: string; fg: string };
  accessibilityLabel?: string;
};

/** Chip seleccionable (filtros, provincias, categorías). Altura 40 + hitSlop ⇒ ≥ 44 px. */
export function Chip({ label, icon, iconColor, selected, count, onPress, tone, accessibilityLabel }: Props) {
  const bg = selected ? colors.brand.purple : (tone?.bg ?? colors.surface);
  const fg = selected ? colors.onBrand : (tone?.fg ?? colors.text);
  const content = (
    <View style={[styles.chip, { backgroundColor: bg, borderColor: selected ? colors.brand.purple : colors.border }]}>
      {icon && <MaterialCommunityIcons name={icon} size={16} color={selected ? colors.onBrand : (iconColor ?? fg)} />}
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      {count !== undefined && (
        <View style={[styles.count, selected && styles.countSelected]}>
          <Text style={[styles.countText, selected && styles.countTextSelected]}>{count}</Text>
        </View>
      )}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={accessibilityLabel ?? (count !== undefined ? `${label}, ${count}` : label)}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: { fontFamily: fonts.semibold, fontSize: 14 },
  count: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countSelected: { backgroundColor: 'rgba(255,255,255,0.22)' },
  countText: { fontFamily: fonts.bold, fontSize: 12, color: colors.textSecondary },
  countTextSelected: { color: colors.onBrand },
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
});

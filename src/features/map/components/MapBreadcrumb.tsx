import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

export type Crumb = { key: string; label: string; onPress?: () => void };

/**
 * Perú › Ica › Ica — mantiene siempre el contexto espacial.
 * Cada tramo anterior es un botón que vuelve (con animación inversa) a ese nivel.
 */
export function MapBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <View style={styles.row} accessibilityRole="toolbar" accessibilityLabel="Ruta de navegación">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <Fragment key={c.key}>
            {i > 0 && <MaterialCommunityIcons name="chevron-right" size={16} color={colors.textTertiary} />}
            {last || !c.onPress ? (
              <Text style={[styles.crumb, styles.current]} numberOfLines={1} accessibilityRole="text">
                {c.label}
              </Text>
            ) : (
              <Pressable
                onPress={c.onPress}
                hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
                accessibilityRole="link"
                accessibilityLabel={`Volver a ${c.label}`}
              >
                {({ pressed }) => (
                  <Text style={[styles.crumb, styles.link, pressed && styles.pressed]} numberOfLines={1}>
                    {c.label}
                  </Text>
                )}
              </Pressable>
            )}
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, flexWrap: 'nowrap' },
  crumb: { fontFamily: fonts.semibold, fontSize: 13, maxWidth: 140 },
  link: { color: colors.brand.purple },
  current: { color: colors.textSecondary },
  pressed: { opacity: 0.6 },
});

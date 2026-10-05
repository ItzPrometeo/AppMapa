/**
 * Panel inferior del nivel Perú ("Explorar"): accesos rápidos a regiones.
 * También es la alternativa accesible al mapa para lectores de pantalla.
 */
import { memo, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Chip } from '@/components/ui/Chip';
import { destinationsRepository } from '@/features/destinations/destinationsRepository';
import { regionColor } from '@/theme/mapPalette';
import { type } from '@/theme/tokens';
import type { MapShape } from '../../geo/types';

type Props = { regions: MapShape[]; onSelect: (regionId: string) => void };

export const CountryPanel = memo(function CountryPanel({ regions, onSelect }: Props) {
  const ranked = useMemo(() => {
    const counts = destinationsRepository.countByRegion();
    return [...regions]
      .map((r) => ({ id: r.id, name: r.name, count: counts[r.id] ?? 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
  }, [regions]);

  return (
    <Animated.View entering={FadeIn.duration(260)} style={styles.wrap}>
      <View style={styles.header}>
        <Text style={type.headline}>Explorar</Text>
        <Text style={type.caption}>Toca una región del mapa o elige una aquí</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {ranked.map((r) => (
          <Chip
            key={r.id}
            label={r.name}
            count={r.count}
            onPress={() => onSelect(r.id)}
            icon="circle"
            iconColor={regionColor(r.id)}
            accessibilityLabel={`${r.name}, ${r.count} destinos`}
          />
        ))}
      </ScrollView>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  header: { paddingHorizontal: 20, gap: 2 },
  row: { paddingHorizontal: 20, gap: 8 },
});

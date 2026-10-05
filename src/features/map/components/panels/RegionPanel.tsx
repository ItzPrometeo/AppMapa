/** Panel del nivel región: lista de provincias con su número de destinos. */
import { memo, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Chip } from '@/components/ui/Chip';
import { destinationsRepository } from '@/features/destinations/destinationsRepository';
import { pluralize } from '@/lib/text';
import { type } from '@/theme/tokens';
import type { MapShape } from '../../geo/types';

type Props = { regionId: string; regionName: string; provinces: MapShape[]; onSelect: (provinceId: string) => void };

export const RegionPanel = memo(function RegionPanel({ regionId, regionName, provinces, onSelect }: Props) {
  const items = useMemo(() => {
    const counts = destinationsRepository.countByProvince(regionId);
    return [...provinces]
      .map((p) => ({ id: p.id, name: p.name, color: p.color, count: counts[p.id] ?? 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
  }, [regionId, provinces]);
  const total = items.reduce((n, i) => n + i.count, 0);

  return (
    <Animated.View key={regionId} entering={FadeIn.duration(260)} style={styles.wrap}>
      <View style={styles.header}>
        <Text style={type.headline}>Provincias de {regionName}</Text>
        <Text style={type.caption}>
          {pluralize(items.length, 'provincia', 'provincias')} · {pluralize(total, 'destino', 'destinos')}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((p) => (
          <Chip
            key={p.id}
            label={p.name}
            count={p.count}
            icon="circle"
            iconColor={p.color}
            onPress={() => onSelect(p.id)}
            accessibilityLabel={`Provincia ${p.name}, ${pluralize(p.count, 'destino', 'destinos')}`}
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

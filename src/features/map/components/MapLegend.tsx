/**
 * MapLegend — leyenda de categorías del nivel 3 que además funciona como filtro.
 * Sólo muestra las categorías presentes en la provincia (evita ruido).
 */
import { memo, useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { Chip } from '@/components/ui/Chip';
import { categoryStyle } from '@/features/destinations/categories';
import { CATEGORIES, type Category, type Destination } from '@/features/destinations/types';

type Props = {
  destinations: Destination[];
  selected: Category | null;
  onSelect: (c: Category | null) => void;
};

export const MapLegend = memo(function MapLegend({ destinations, selected, onSelect }: Props) {
  const counts = useMemo(() => {
    const m = new Map<Category, number>();
    for (const d of destinations) m.set(d.category, (m.get(d.category) ?? 0) + 1);
    return CATEGORIES.filter((c) => m.has(c)).map((c) => ({ category: c, count: m.get(c)! }));
  }, [destinations]);

  if (counts.length < 2) return null;

  return (
    <Animated.View entering={FadeInUp.delay(250).duration(300)} exiting={FadeOutUp.duration(150)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityLabel="Filtrar por categoría"
      >
        <Chip label="Todos" selected={!selected} count={destinations.length} onPress={() => onSelect(null)} />
        {counts.map(({ category, count }) => {
          const st = categoryStyle(category);
          return (
            <Chip
              key={category}
              label={category}
              icon={st.icon}
              iconColor={st.color}
              count={count}
              selected={selected === category}
              onPress={() => onSelect(selected === category ? null : category)}
            />
          );
        })}
      </ScrollView>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  row: { paddingHorizontal: 20, gap: 8, paddingVertical: 4 },
});

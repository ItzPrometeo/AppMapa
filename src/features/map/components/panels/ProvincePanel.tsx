/**
 * Panel del nivel provincia: carrusel de destinos (sincronizado con los
 * marcadores) o estado vacío si aún no hay lugares registrados.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Rating } from '@/components/ui/Rating';
import { categoryStyle } from '@/features/destinations/categories';
import { DestinationImage } from '@/features/destinations/DestinationImage';
import type { Destination } from '@/features/destinations/types';
import { pluralize } from '@/lib/text';
import { colors, fonts, radius, shadow, type } from '@/theme/tokens';

type Props = {
  provinceName: string;
  destinations: Destination[] | null;
  filtered: boolean;
  onSelect: (id: string) => void;
  onBack: () => void;
};

export const ProvincePanel = memo(function ProvincePanel({
  provinceName,
  destinations,
  filtered,
  onSelect,
  onBack,
}: Props) {
  if (destinations === null) {
    return (
      <View style={styles.wrap}>
        <View style={styles.header}>
          <View style={[styles.skeletonLine, { width: 180 }]} />
          <View style={[styles.skeletonLine, { width: 110, height: 10 }]} />
        </View>
        <View style={styles.skeletonRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonCard} />
          ))}
        </View>
      </View>
    );
  }

  if (destinations.length === 0 && !filtered) {
    return (
      <Animated.View entering={FadeIn.duration(260)} style={styles.empty}>
        <View style={styles.emptyIcon}>
          <MaterialCommunityIcons name="map-search-outline" size={26} color={colors.brand.purple} />
        </View>
        <Text style={[type.headline, styles.center]}>Aún no tenemos destinos registrados en esta zona.</Text>
        <Text style={[type.caption, styles.center]}>Estamos trabajando para sumar lugares en {provinceName}.</Text>
        <Button label="Ver otras provincias" icon="arrow-left" variant="tonal" compact onPress={onBack} />
      </Animated.View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={type.headline}>
          {pluralize(destinations.length, 'destino', 'destinos')} en {provinceName}
        </Text>
        <Text style={type.caption}>Toca un lugar en el mapa o en la lista</Text>
      </View>
      <FlatList
        horizontal
        data={destinations}
        keyExtractor={(d) => d.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        renderItem={({ item, index }) => <MiniCard destination={item} index={index} onPress={onSelect} />}
      />
    </View>
  );
});

function MiniCard({
  destination,
  index,
  onPress,
}: {
  destination: Destination;
  index: number;
  onPress: (id: string) => void;
}) {
  const cat = categoryStyle(destination.category);
  return (
    <Animated.View entering={FadeInRight.delay(200 + index * 60).duration(320)}>
      <Pressable
        onPress={() => onPress(destination.id)}
        accessibilityRole="button"
        accessibilityLabel={`${destination.name}, ${destination.category}`}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <DestinationImage destination={destination} style={styles.thumb} radius={12} iconSize={22} />
        <View style={styles.cardText}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {destination.name}
          </Text>
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name={cat.icon} size={13} color={cat.color} />
            <Text style={styles.meta} numberOfLines={1}>
              {destination.category}
            </Text>
          </View>
          <Rating value={destination.rating} size="sm" />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  header: { paddingHorizontal: 20, gap: 4 },
  row: { paddingHorizontal: 20, gap: 12, paddingBottom: 6 },
  card: {
    width: 236,
    flexDirection: 'row',
    gap: 10,
    padding: 8,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  thumb: { width: 72, height: 72 },
  cardText: { flex: 1, justifyContent: 'center', gap: 4 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontFamily: fonts.medium, fontSize: 12, color: colors.textSecondary },
  empty: { alignItems: 'center', gap: 8, paddingHorizontal: 28, paddingTop: 4 },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brand.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  skeletonLine: { height: 14, borderRadius: 7, backgroundColor: colors.surfaceMuted },
  skeletonRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20 },
  skeletonCard: { width: 236, height: 90, borderRadius: radius.lg, backgroundColor: colors.surfaceMuted },
});

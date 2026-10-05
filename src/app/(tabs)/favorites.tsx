import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/IconButton';
import { Rating } from '@/components/ui/Rating';
import { categoryStyle } from '@/features/destinations/categories';
import { DestinationImage } from '@/features/destinations/DestinationImage';
import { destinationsRepository } from '@/features/destinations/destinationsRepository';
import { useSaved } from '@/features/destinations/favorites';
import type { Destination } from '@/features/destinations/types';
import { TAB_BAR_HEIGHT } from '@/features/navigation/tabBarStore';
import { colors, fonts, radius, shadow, type } from '@/theme/tokens';

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { favorites, toggleFavorite } = useSaved();
  const items = favorites.map((id) => destinationsRepository.getById(id)).filter((d): d is Destination => Boolean(d));

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16 }]}>
      <Text style={[type.display, styles.title]} accessibilityRole="header">
        Favoritos
      </Text>
      <Text style={[type.subhead, styles.title]}>Tus lugares guardados para el próximo viaje.</Text>
      <FlatList
        data={items}
        keyExtractor={(d) => d.id}
        contentContainerStyle={[styles.list, { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 24 }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons name="heart-outline" size={30} color={colors.brand.orange} />
            </View>
            <Text style={[type.headline, styles.center]}>Aún no guardaste destinos</Text>
            <Text style={[type.subhead, styles.center]}>Toca ♡ en cualquier lugar del mapa para tenerlo aquí.</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const cat = categoryStyle(item.category);
          return (
            <Animated.View entering={FadeInDown.delay(index * 50).duration(280)} layout={LinearTransition}>
              <Pressable
                onPress={() => router.push({ pathname: '/destination/[id]', params: { id: item.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${item.province}, ${item.region}`}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              >
                <DestinationImage destination={item} style={styles.thumb} radius={12} />
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={type.caption} numberOfLines={1}>
                    {item.province}, {item.region}
                  </Text>
                  <View style={styles.meta}>
                    <MaterialCommunityIcons name={cat.icon} size={13} color={cat.color} />
                    <Text style={type.caption}>{item.category}</Text>
                    <Rating value={item.rating} size="sm" />
                  </View>
                </View>
                <IconButton
                  icon="heart"
                  variant="ghost"
                  color={colors.brand.orange}
                  onPress={() => toggleFavorite(item.id)}
                  accessibilityLabel={`Quitar ${item.name} de favoritos`}
                />
              </Pressable>
            </Animated.View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  title: { paddingHorizontal: 20 },
  list: { padding: 20, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow.sm,
  },
  pressed: { opacity: 0.85 },
  thumb: { width: 76, height: 76 },
  cardText: { flex: 1, gap: 3 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  empty: { alignItems: 'center', gap: 10, paddingTop: 80, paddingHorizontal: 24 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brand.orangeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
});

/**
 * Página completa del destino (último paso del flujo).
 * Hero con parallax suave, información estructurada, mini mapa de ubicación
 * y llamada a la acción fija "Cómo llegar".
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, type ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Rating } from '@/components/ui/Rating';
import { categoryStyle } from '@/features/destinations/categories';
import { DestinationImage } from '@/features/destinations/DestinationImage';
import { destinationsRepository } from '@/features/destinations/destinationsRepository';
import { useSaved } from '@/features/destinations/favorites';
import { MiniMap } from '@/features/destinations/MiniMap';
import { POPULAR_THRESHOLD } from '@/features/map/components/TouristMarker';
import { openDirections } from '@/lib/directions';
import { haptics } from '@/lib/haptics';
import { formatPlace } from '@/lib/text';
import { colors, fonts, radius, shadow, type } from '@/theme/tokens';

const HERO = 340;

export default function DestinationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const saved = useSaved();
  const d = id ? destinationsRepository.getById(id) : undefined;
  const scrollY = useSharedValue(0);

  const { markViewed } = saved;
  useEffect(() => {
    if (d) markViewed(d.id);
  }, [d, markViewed]);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  // Parallax: la foto se desplaza a media velocidad y se amplía al estirar hacia abajo.
  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [-HERO, 0, HERO], [-HERO / 2, 0, HERO * 0.5]) },
      { scale: interpolate(scrollY.value, [-HERO, 0], [2, 1], 'clamp') },
    ],
  }));
  const topBarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [HERO - 140, HERO - 80], [0, 1], 'clamp'),
  }));

  if (!d) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={type.title}>Destino no encontrado</Text>
        <Button label="Volver al mapa" icon="arrow-left" onPress={() => router.back()} />
      </View>
    );
  }

  const cat = categoryStyle(d.category);
  const isSaved = saved.isFavorite(d.id);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={styles.screen}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.hero, heroStyle]}>
          <DestinationImage destination={d} style={StyleSheet.absoluteFill} radius={0} iconSize={72} />
        </Animated.View>

        <View style={styles.sheet}>
          <View style={styles.titleBlock}>
            <View style={styles.badges}>
              <View style={[styles.catPill, { backgroundColor: cat.soft }]}>
                <MaterialCommunityIcons name={cat.icon} size={14} color={cat.color} />
                <Text style={[styles.catText, { color: cat.color }]}>{d.category}</Text>
              </View>
              {d.popularity >= POPULAR_THRESHOLD && (
                <View style={[styles.catPill, { backgroundColor: colors.brand.orangeSoft }]}>
                  <MaterialCommunityIcons name="fire" size={14} color={colors.brand.orange} />
                  <Text style={[styles.catText, { color: '#C2410C' }]}>Popular</Text>
                </View>
              )}
            </View>
            <Text style={type.display} accessibilityRole="header">
              {d.name}
            </Text>
            <View style={styles.locationRow}>
              <MaterialCommunityIcons name="map-marker-outline" size={16} color={colors.textSecondary} />
              <Text style={type.subhead}>{formatPlace(d)}</Text>
            </View>
            <View style={styles.locationRow}>
              <Rating value={d.rating} />
              <Text style={type.caption}>· {d.subtitle}</Text>
            </View>
          </View>

          <Text style={styles.quote}>“{d.summary}”</Text>
          {d.description && <Text style={type.body}>{d.description}</Text>}

          <View style={styles.infoGrid}>
            <InfoTile icon="clock-outline" label="Horario" value={d.schedule ?? 'Consultar'} />
            <InfoTile icon="cash" label="Precio" value={d.price ?? 'Consultar'} />
          </View>

          {(d.tags.length > 0 || d.services.length > 0) && (
            <View style={styles.section}>
              <Text style={type.overline}>Experiencias y servicios</Text>
              <View style={styles.wrap}>
                {d.tags.map((t) => (
                  <Chip key={`t-${t}`} label={t} icon="tag-outline" />
                ))}
                {d.services.map((s) => (
                  <Chip key={`s-${s}`} label={s} icon="check" iconColor={colors.success} />
                ))}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={type.overline}>Ubicación</Text>
            <MiniMap destination={d} />
            <Text style={type.caption}>
              {d.latitude.toFixed(4)}, {d.longitude.toFixed(4)} · Provincia de {d.province}, {d.region}
            </Text>
          </View>
        </View>
      </Animated.ScrollView>

      {/* Barra superior: botones flotantes que ganan fondo al hacer scroll */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, styles.topBarBg, topBarStyle]} />
        <IconButton icon="arrow-left" variant="glass" onPress={goBack} accessibilityLabel="Volver al mapa" />
        <Animated.Text style={[styles.topTitle, topBarStyle]} numberOfLines={1}>
          {d.name}
        </Animated.Text>
        <IconButton
          icon={isSaved ? 'heart' : 'heart-outline'}
          color={isSaved ? colors.brand.orange : colors.text}
          variant="glass"
          onPress={() => {
            if (saved.toggleFavorite(d.id)) haptics.success();
          }}
          accessibilityLabel={isSaved ? 'Quitar de guardados' : 'Guardar'}
        />
      </View>

      <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          label="Cómo llegar"
          icon="directions"
          onPress={() => openDirections(d.latitude, d.longitude, d.name)}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.tile}>
      <MaterialCommunityIcons name={icon} size={18} color={colors.brand.purple} />
      <Text style={type.caption}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  flex: { flex: 1 },
  hero: { height: HERO, overflow: 'hidden' },
  sheet: {
    marginTop: -28,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: colors.background,
    padding: 20,
    paddingTop: 24,
    gap: 20,
  },
  titleBlock: { gap: 8 },
  badges: { flexDirection: 'row', gap: 8 },
  catPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 26, borderRadius: 13 },
  catText: { fontFamily: fonts.semibold, fontSize: 12.5 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  quote: {
    ...type.body,
    fontFamily: fonts.semibold,
    color: colors.brand.purpleDeep,
    paddingLeft: 14,
    borderLeftWidth: 3,
    borderLeftColor: colors.brand.purple,
  },
  infoGrid: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, padding: 14, gap: 2, borderRadius: radius.md, backgroundColor: colors.surface, ...shadow.sm },
  tileValue: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  section: { gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topBarBg: { backgroundColor: colors.background, ...shadow.sm },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
  },
  cta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});

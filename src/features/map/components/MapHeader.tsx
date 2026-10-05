/**
 * MapHeader — cabecera flotante sobre el mapa.
 *
 * Nivel Perú:      [SPoint]                       (🔍) (♡)
 *                  Explora Perú
 *                  Descubre destinos increíbles en cada región.
 * Niveles 2 y 3:   (←) Ica                          (🔍)
 *                      Perú › Ica
 *                      Selecciona una provincia
 *
 * El título cambia con un fundido vertical; el fondo es un degradado que deja
 * ver el mapa por debajo sin cortar bruscamente.
 */
import { memo, useId } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { IconButton } from '@/components/ui/IconButton';
import { SPointMark } from '@/components/ui/SPointMark';
import { colors, fonts, motion, type } from '@/theme/tokens';
import { MapBreadcrumb, type Crumb } from './MapBreadcrumb';

type Props = {
  title: string;
  subtitle: string;
  crumbs: Crumb[];
  onBack?: () => void;
  onSearch: () => void;
  onFavorites?: () => void;
  onLayout?: (height: number) => void;
};

export const MapHeader = memo(function MapHeader({
  title,
  subtitle,
  crumbs,
  onBack,
  onSearch,
  onFavorites,
  onLayout,
}: Props) {
  const insets = useSafeAreaInsets();
  const handleLayout = (e: LayoutChangeEvent) => onLayout?.(e.nativeEvent.layout.height);
  const atRoot = !onBack;
  const gid = `hdr${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]} onLayout={handleLayout} pointerEvents="box-none">
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.background} stopOpacity={1} />
            <Stop offset="0.7" stopColor={colors.background} stopOpacity={0.92} />
            <Stop offset="1" stopColor={colors.background} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gid})`} />
      </Svg>

      <View style={styles.topRow} pointerEvents="box-none">
        {atRoot ? (
          <View style={styles.brand} accessibilityRole="header">
            <SPointMark size={28} />
            <Text style={styles.brandText}>
              S<Text style={styles.brandAccent}>Point</Text>
            </Text>
          </View>
        ) : (
          <IconButton icon="arrow-left" onPress={onBack} accessibilityLabel="Volver" />
        )}
        <View style={styles.actions}>
          <IconButton icon="magnify" onPress={onSearch} accessibilityLabel="Buscar destinos" />
          {atRoot && onFavorites && (
            <IconButton icon="heart-outline" onPress={onFavorites} accessibilityLabel="Favoritos" />
          )}
        </View>
      </View>

      <Animated.View layout={LinearTransition.duration(260)} style={styles.texts} pointerEvents="box-none">
        <Animated.Text
          key={`t-${title}`}
          entering={FadeInDown.duration(320).easing(motion.easeOutCubic)}
          exiting={FadeOutUp.duration(160)}
          style={styles.title}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {title}
        </Animated.Text>
        {crumbs.length > 1 && (
          <Animated.View
            key={`c-${crumbs.map((c) => c.key).join('/')}`}
            entering={FadeInDown.delay(40).duration(320)}
            exiting={FadeOutUp.duration(140)}
          >
            <MapBreadcrumb crumbs={crumbs} />
          </Animated.View>
        )}
        <Animated.Text
          key={`s-${subtitle}`}
          entering={FadeInDown.delay(70).duration(320)}
          exiting={FadeOutUp.duration(140)}
          style={styles.subtitle}
          numberOfLines={2}
        >
          {subtitle}
        </Animated.Text>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 28 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: { fontFamily: fonts.extrabold, fontSize: 20, letterSpacing: -0.4, color: colors.brand.navy },
  brandAccent: { color: colors.brand.purple },
  actions: { flexDirection: 'row', gap: 10 },
  texts: { marginTop: 10, gap: 4 },
  title: { ...type.display },
  subtitle: { ...type.subhead },
});

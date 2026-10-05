/**
 * Búsqueda: regiones, provincias y destinos (insensible a tildes).
 * Elegir un resultado no cambia de pantalla: la cámara vuela al lugar.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState, type ComponentProps } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/IconButton';
import { categoryStyle } from '@/features/destinations/categories';
import { destinationsRepository } from '@/features/destinations/destinationsRepository';
import { useSaved } from '@/features/destinations/favorites';
import type { Destination } from '@/features/destinations/types';
import { normalize } from '@/lib/text';
import { regionColor } from '@/theme/mapPalette';
import { colors, fonts, radius, type } from '@/theme/tokens';
import { geoRepository } from '../geo/geoRepository';

type Result =
  | { kind: 'region'; id: string; title: string; subtitle: string }
  | { kind: 'province'; id: string; regionId: string; title: string; subtitle: string }
  | { kind: 'destination'; id: string; title: string; subtitle: string; destination: Destination };

type Props = {
  onClose: () => void;
  onRegion: (regionId: string) => void;
  onProvince: (provinceId: string, regionId: string) => void;
  onDestination: (d: Destination) => void;
};

export function SearchOverlay({ onClose, onRegion, onProvince, onDestination }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const { recent } = useSaved();

  const sections = useMemo(() => {
    const q = normalize(query);
    if (!q) {
      const recents = recent
        .map((id) => destinationsRepository.getById(id))
        .filter((d): d is Destination => Boolean(d))
        .slice(0, 5);
      const base = recents.length ? recents : destinationsRepository.popular(6);
      return [
        {
          title: recents.length ? 'Vistos recientemente' : 'Populares',
          data: base.map<Result>((d) => ({
            kind: 'destination',
            id: d.id,
            title: d.name,
            subtitle: `${d.province}, ${d.region}`,
            destination: d,
          })),
        },
      ];
    }
    const regions: Result[] = geoRepository.regionIndex
      .filter((r) => normalize(r.name).includes(q))
      .map((r) => ({ kind: 'region', id: r.id, title: r.name, subtitle: `Región · ${r.provinces.length} provincias` }));
    const provinces: Result[] = geoRepository.regionIndex.flatMap((r) =>
      r.provinces
        .filter((p) => normalize(p.name).includes(q))
        .map((p) => ({
          kind: 'province' as const,
          id: p.id,
          regionId: r.id,
          title: p.name,
          subtitle: `Provincia · ${r.name}`,
        })),
    );
    const destinations: Result[] = destinationsRepository
      .all()
      .filter((d) => normalize(`${d.name} ${d.category} ${d.district ?? ''}`).includes(q))
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 12)
      .map((d) => ({
        kind: 'destination',
        id: d.id,
        title: d.name,
        subtitle: `${d.province}, ${d.region}`,
        destination: d,
      }));
    return [
      { title: 'Destinos', data: destinations },
      { title: 'Regiones', data: regions },
      { title: 'Provincias', data: provinces.slice(0, 8) },
    ].filter((s) => s.data.length > 0);
  }, [query, recent]);

  const choose = (r: Result) => {
    onClose();
    if (r.kind === 'region') onRegion(r.id);
    else if (r.kind === 'province') onProvince(r.id, r.regionId);
    else onDestination(r.destination);
  };

  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={styles.backdrop}>
      <Animated.View entering={SlideInUp.duration(260)} style={[styles.panel, { paddingTop: insets.top + 10 }]}>
        <View style={styles.searchRow}>
          <View style={styles.inputWrap}>
            <MaterialCommunityIcons name="magnify" size={20} color={colors.textTertiary} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Busca un destino, provincia o región"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              returnKeyType="search"
              accessibilityLabel="Buscar"
            />
          </View>
          <IconButton icon="close" variant="ghost" onPress={onClose} accessibilityLabel="Cerrar búsqueda" />
        </View>
        <SectionList
          sections={sections}
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderSectionHeader={({ section }) => (
            <Text style={[type.overline, styles.sectionTitle]}>{section.title}</Text>
          )}
          renderItem={({ item }) => <ResultRow result={item} onPress={() => choose(item)} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={type.subhead}>Sin resultados para “{query}”.</Text>
            </View>
          }
        />
      </Animated.View>
    </Animated.View>
  );
}

function ResultRow({ result, onPress }: { result: Result; onPress: () => void }) {
  let icon: ComponentProps<typeof MaterialCommunityIcons>['name'] = 'map-outline';
  let tint: string = colors.brand.purple;
  let bg: string = colors.brand.purpleSoft;
  if (result.kind === 'destination') {
    const st = categoryStyle(result.destination.category);
    icon = st.icon;
    tint = st.color;
    bg = st.soft;
  } else if (result.kind === 'region') {
    icon = 'map';
    bg = regionColor(result.id);
    tint = colors.brand.navy;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${result.title}, ${result.subtitle}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.rowIcon, { backgroundColor: bg }]}>
        <MaterialCommunityIcons name={icon} size={18} color={tint} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {result.title}
        </Text>
        <Text style={type.caption} numberOfLines={1}>
          {result.subtitle}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(16,42,67,0.18)', zIndex: 50 },
  panel: { flex: 1, backgroundColor: colors.background },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.text, height: '100%' },
  sectionTitle: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, minHeight: 60 },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  empty: { padding: 24, alignItems: 'center' },
});

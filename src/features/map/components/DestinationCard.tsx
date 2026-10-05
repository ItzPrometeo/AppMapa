/**
 * DestinationCard — contenido del bottom sheet al tocar un lugar.
 *
 *  collapsed  foto pequeña + nombre + ubicación
 *  medium     + categoría, valoración, frase, botones (Ver destino · Cómo llegar · Guardar)
 *  expanded   + foto grande, descripción, horario, precio, categorías, servicios, ubicación
 *
 * El layout reacciona de forma continua a `progress` (0 = collapsed, 1 = expanded),
 * así que la transición acompaña el dedo mientras se arrastra.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo, type ComponentProps } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Rating } from '@/components/ui/Rating';
import { categoryStyle } from '@/features/destinations/categories';
import { DestinationImage } from '@/features/destinations/DestinationImage';
import type { Destination } from '@/features/destinations/types';
import { formatPlace } from '@/lib/text';
import { colors, fonts, radius, type } from '@/theme/tokens';
import { POPULAR_THRESHOLD } from './TouristMarker';

type Props = {
  destination: Destination;
  progress: SharedValue<number>;
  expanded: boolean;
  saved: boolean;
  onClose: () => void;
  onOpen: () => void;
  onDirections: () => void;
  onToggleSave: () => void;
  bottomInset: number;
};

export const DestinationCard = memo(function DestinationCard(props: Props) {
  const { destination: d, progress, expanded, saved, onClose, onOpen, onDirections, onToggleSave, bottomInset } = props;
  const cat = categoryStyle(d.category);

  // El cuerpo (frase + botones) aparece al pasar de collapsed a medium.
  const bodyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.25], [0, 1], 'clamp'),
  }));
  // Los detalles se revelan al expandir.
  const detailStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.4, 0.85], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(progress.value, [0.4, 1], [16, 0], 'clamp') }],
  }));

  return (
    <Animated.View key={d.id} entering={FadeIn.duration(220)} style={styles.flex}>
      <ScrollView
        scrollEnabled={expanded}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset + 64 }}
      >
        <View style={styles.top}>
          <DestinationImage destination={d} style={styles.thumb} radius={14} iconSize={26} />
          <View style={styles.topText}>
            <Text style={type.headline} numberOfLines={1} accessibilityRole="header">
              {d.name}
            </Text>
            <Text style={type.caption} numberOfLines={1}>
              {d.province}, {d.region}
            </Text>
            <View style={styles.metaRow}>
              <View style={[styles.catPill, { backgroundColor: cat.soft }]}>
                <MaterialCommunityIcons name={cat.icon} size={13} color={cat.color} />
                <Text style={[styles.catText, { color: cat.color }]}>{d.subtitle}</Text>
              </View>
              <Rating value={d.rating} size="sm" />
              {d.popularity >= POPULAR_THRESHOLD && (
                <View style={styles.popular}>
                  <MaterialCommunityIcons name="fire" size={12} color={colors.brand.orange} />
                  <Text style={styles.popularText}>Popular</Text>
                </View>
              )}
            </View>
          </View>
          <IconButton
            icon="close"
            variant="ghost"
            size={36}
            iconSize={20}
            onPress={onClose}
            accessibilityLabel="Cerrar"
          />
        </View>

        <Animated.View style={[styles.body, bodyStyle]}>
          <Text style={styles.quote}>“{d.summary}”</Text>
          <View style={styles.actions}>
            <Button label="Ver destino" onPress={onOpen} style={styles.flex} compact />
            <Button label="Cómo llegar" icon="directions" variant="secondary" onPress={onDirections} compact />
            <IconButton
              icon={saved ? 'heart' : 'heart-outline'}
              color={saved ? colors.brand.orange : colors.text}
              onPress={onToggleSave}
              accessibilityLabel={saved ? 'Quitar de guardados' : 'Guardar'}
              size={48}
            />
          </View>
        </Animated.View>

        <Animated.View style={[styles.details, detailStyle]}>
          <DestinationImage destination={d} style={styles.hero} radius={radius.lg} iconSize={48} />
          {d.description && (
            <Section title="Descripción">
              <Text style={type.body}>{d.description}</Text>
            </Section>
          )}
          <View style={styles.infoGrid}>
            <InfoTile icon="clock-outline" label="Horario" value={d.schedule ?? 'Consultar'} />
            <InfoTile icon="cash" label="Precio" value={d.price ?? 'Consultar'} />
          </View>
          <Section title="Categorías">
            <View style={styles.wrap}>
              <Chip label={d.category} icon={cat.icon} iconColor={cat.color} tone={{ bg: cat.soft, fg: colors.text }} />
              {d.tags.map((t) => (
                <Chip key={t} label={t} />
              ))}
            </View>
          </Section>
          {d.services.length > 0 && (
            <Section title="Servicios">
              <View style={styles.services}>
                {d.services.map((s) => (
                  <View key={s} style={styles.service}>
                    <MaterialCommunityIcons name="check-circle" size={16} color={colors.success} />
                    <Text style={type.bodyMedium}>{s}</Text>
                  </View>
                ))}
              </View>
            </Section>
          )}
          <Section title="Ubicación">
            <View style={styles.location}>
              <MaterialCommunityIcons name="map-marker-radius" size={20} color={colors.brand.purple} />
              <View style={styles.flex}>
                <Text style={type.bodyMedium}>{formatPlace(d)}</Text>
                <Text style={type.caption}>
                  {d.latitude.toFixed(4)}, {d.longitude.toFixed(4)}
                </Text>
              </View>
            </View>
          </Section>
          <View style={styles.actions}>
            <Button label="Ver destino" icon="arrow-right" onPress={onOpen} style={styles.flex} />
            <Button
              label="Cómo llegar"
              icon="directions"
              variant="secondary"
              onPress={onDirections}
              style={styles.flex}
            />
          </View>
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={type.overline}>{title}</Text>
      {children}
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
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 2 },
  thumb: { width: 64, height: 64 },
  topText: { flex: 1, gap: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 },
  catPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 22, borderRadius: 11 },
  catText: { fontFamily: fonts.semibold, fontSize: 12 },
  popular: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  popularText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.brand.orange },
  body: { paddingHorizontal: 20, paddingTop: 14, gap: 14 },
  quote: { ...type.body, color: colors.textSecondary, fontFamily: fonts.medium },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  details: { paddingHorizontal: 20, paddingTop: 20, gap: 18 },
  hero: { width: '100%', height: 190 },
  section: { gap: 8 },
  infoGrid: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1,
    padding: 14,
    gap: 2,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  tileValue: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  services: { gap: 8 },
  service: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  location: { flexDirection: 'row', gap: 10, alignItems: 'center' },
});

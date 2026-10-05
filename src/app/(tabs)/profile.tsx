import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SPointMark } from '@/components/ui/SPointMark';
import { destinationsRepository } from '@/features/destinations/destinationsRepository';
import { useSaved } from '@/features/destinations/favorites';
import { colors, fonts, radius, shadow, type } from '@/theme/tokens';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { favorites, recent } = useSaved();
  const regionsSeen = new Set(recent.map((id) => destinationsRepository.getById(id)?.regionId).filter(Boolean)).size;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <SPointMark size={40} />
        </View>
        <Text style={type.title} accessibilityRole="header">
          Explorador SPoint
        </Text>
        <Text style={type.subhead}>Tu pasaporte para descubrir el Perú</Text>
      </View>
      <View style={styles.stats}>
        <Stat icon="heart" color={colors.brand.orange} value={favorites.length} label="Guardados" />
        <Stat icon="eye-outline" color={colors.brand.purple} value={recent.length} label="Vistos" />
        <Stat icon="map-outline" color={colors.brand.turquoise} value={regionsSeen} label="Regiones" />
      </View>
    </View>
  );
}

function Stat({
  icon,
  color,
  value,
  label,
}: {
  icon: 'heart' | 'eye-outline' | 'map-outline';
  color: string;
  value: number;
  label: string;
}) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <MaterialCommunityIcons name={icon} size={20} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20, gap: 24 },
  header: { alignItems: 'center', gap: 6, paddingTop: 24 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.brand.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stats: { flexDirection: 'row', gap: 12 },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow.sm,
  },
  statValue: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.text },
});

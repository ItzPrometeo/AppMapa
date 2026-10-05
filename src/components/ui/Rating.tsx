import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

export function Rating({ value, size = 'md' }: { value: number | null; size?: 'sm' | 'md' }) {
  if (value === null) return null;
  const fs = size === 'sm' ? 12 : 14;
  return (
    <View style={styles.row} accessible accessibilityLabel={`Valoración ${value.toFixed(1)} de 5`}>
      <MaterialCommunityIcons name="star" size={fs + 2} color={colors.star} />
      <Text style={[styles.text, { fontSize: fs }]}>{value.toFixed(1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  text: { fontFamily: fonts.bold, color: colors.text },
});

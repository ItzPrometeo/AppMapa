/** Avisos no bloqueantes sobre el mapa: sin conexión o un error recuperable. */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { colors, fonts, radius, shadow } from '@/theme/tokens';

type Props = { kind: 'offline' | 'error'; message: string; onDismiss?: () => void };

export function MapStatusBanner({ kind, message, onDismiss }: Props) {
  const isError = kind === 'error';
  return (
    <Animated.View entering={FadeInUp.duration(260)} exiting={FadeOutUp.duration(180)} style={styles.wrap}>
      <Pressable
        onPress={onDismiss}
        disabled={!onDismiss}
        accessibilityRole={onDismiss ? 'button' : 'text'}
        accessibilityLiveRegion="polite"
        style={[styles.banner, isError && styles.error]}
      >
        <MaterialCommunityIcons
          name={isError ? 'alert-circle-outline' : 'wifi-off'}
          size={16}
          color={isError ? colors.danger : colors.brand.navy}
        />
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
        {onDismiss && <MaterialCommunityIcons name="close" size={14} color={colors.textTertiary} />}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadow.sm,
  },
  error: { backgroundColor: '#FFF1F1' },
  text: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text, flexShrink: 1 },
});

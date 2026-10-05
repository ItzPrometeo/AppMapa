/**
 * Imagen de un destino. Si hay URL se usa expo-image (caché en memoria y disco,
 * transición suave). Si no, una ilustración generada por categoría —degradado
 * de marca, curvas topográficas y el icono— para que nunca haya huecos grises.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useId, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { categoryStyle } from './categories';
import type { Destination } from './types';

type Props = {
  destination: Pick<Destination, 'id' | 'name' | 'image' | 'category'>;
  style?: StyleProp<ViewStyle>;
  iconSize?: number;
  radius?: number;
};

/** Hash estable para variar la ilustración entre destinos. */
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export const DestinationImage = memo(function DestinationImage({
  destination,
  style,
  iconSize = 28,
  radius = 16,
}: Props) {
  const [failed, setFailed] = useState(false);
  // Id único por instancia: en web, un <linearGradient> duplicado dentro de una
  // pantalla oculta (display:none) deja sin pintar a las demás referencias.
  const gid = `g${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const cat = categoryStyle(destination.category);

  if (destination.image && !failed) {
    return (
      <Image
        source={{ uri: destination.image }}
        style={[styles.fill, { borderRadius: radius }, style as object]}
        contentFit="cover"
        transition={220}
        cachePolicy="memory-disk"
        onError={() => setFailed(true)}
        accessibilityLabel={`Foto de ${destination.name}`}
      />
    );
  }

  const h = hash(destination.id);
  const shift = (h % 40) - 20;
  const lines = [0, 1, 2, 3, 4].map((i) => {
    const y = 20 + i * 18 + (h % 7);
    return `M-10 ${y + shift * 0.3} C 30 ${y - 14 + shift * 0.2}, 60 ${y + 16}, 110 ${y - 6 - shift * 0.25}`;
  });

  return (
    <View
      style={[styles.fill, { borderRadius: radius, backgroundColor: cat.soft }, style]}
      accessible
      accessibilityLabel={`Ilustración de ${destination.category.toLowerCase()} para ${destination.name}`}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={cat.accent} stopOpacity={0.55} />
            <Stop offset="1" stopColor={cat.color} stopOpacity={0.95} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#${gid})`} />
        {lines.map((d, i) => (
          <Path key={i} d={d} stroke="#FFFFFF" strokeOpacity={0.22 - i * 0.02} strokeWidth={1.2} fill="none" />
        ))}
      </Svg>
      <View style={styles.iconBadge}>
        <MaterialCommunityIcons name={cat.icon} size={iconSize} color="#FFFFFF" />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  iconBadge: { opacity: 0.95 },
});
